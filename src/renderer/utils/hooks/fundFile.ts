import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector, useIpcRendererListener } from '@/utils/hooks/utils';
import { setFundConfigAction, sortFundsCachedAction } from '@/store/features/fund';
import * as Helpers from '@/helpers';
import * as Utils from '@/utils';

export type FundFileItem = { code: string; name?: string; cyfe?: number; cbj?: number };

const { fundFile } = window.contextModules;

/**
 * 目录下的 funds.json 与当前钱包基金列表双向同步
 *
 * - 启动时：文件存在且非空 -> 用文件内容覆盖当前钱包；文件为空/不存在 -> 把当前配置写入文件
 * - 运行中：文件被外部修改 -> 自动重新载入
 * - 软件内增删改基金 -> 自动写回文件
 */
export function useFundFileSync() {
  const dispatch = useAppDispatch();
  const fundConfig = useAppSelector((state) => state.wallet.fundConfig);
  const walletsConfig = useAppSelector((state) => state.wallet.config.walletConfig);
  const currentWalletCode = useAppSelector((state) => state.wallet.currentWalletCode);
  const fundApiTypeSetting = useAppSelector((state) => state.setting.systemSetting.fundApiTypeSetting);
  const [filePath, setFilePath] = useState('');
  const ready = useRef(false);
  const latestConfig = useRef<Fund.SettingItem[]>(fundConfig);
  latestConfig.current = fundConfig;

  const serialize = (list: Fund.SettingItem[]) =>
    list.map(({ code, name, cyfe, cbj }) => ({ code, name, cyfe, cbj }));

  /** 把文件内容合并进当前钱包：文件里的份额/成本价优先，名称缺失时在线补全 */
  const applyFileFunds = useCallback(
    async (funds: FundFileItem[]) => {
      if (!funds?.length) {
        return;
      }
      const { codeMap: localCodeMap } = Helpers.Fund.GetFundConfig(currentWalletCode, walletsConfig);
      const config: Fund.SettingItem[] = funds.map((item) => ({
        code: item.code,
        name: item.name || localCodeMap[item.code]?.name || '',
        cyfe: Number(item.cyfe) > 0 ? Number(item.cyfe) : 0,
        cbj: Number(item.cbj) > 0 ? Number(item.cbj) : undefined,
        memo: localCodeMap[item.code]?.memo,
        zdfRange: localCodeMap[item.code]?.zdfRange,
        jzNotice: localCodeMap[item.code]?.jzNotice,
      }));

      // 名称缺失的基金在线补全
      const nameless = config.filter((item) => !item.name);
      if (nameless.length) {
        try {
          const responseFunds = await Helpers.Fund.GetFunds(nameless, fundApiTypeSetting);
          const nameMap = Utils.GetCodeMap(
            responseFunds.filter(Utils.NotEmpty).map((fund) => ({ code: fund!.fundcode!, name: fund!.name! })),
            'code'
          );
          config.forEach((item) => {
            if (!item.name && nameMap[item.code]?.name) {
              item.name = nameMap[item.code].name;
            }
          });
        } catch (error) {}
      }

      await dispatch(setFundConfigAction({ config, walletCode: currentWalletCode }));
      // 配置变化后立即拉取行情，避免要等下一次自动刷新才显示
      try {
        const responseFunds = await Helpers.Fund.GetFunds(config, fundApiTypeSetting);
        await dispatch(sortFundsCachedAction({ responseFunds, walletCode: currentWalletCode }));
      } catch (error) {}
    },
    [currentWalletCode, walletsConfig, fundApiTypeSetting, dispatch]
  );

  // 首次：读取文件
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await fundFile.read();
        if (cancelled) return;
        setFilePath(result.path);
        if (result.funds.length) {
          await applyFileFunds(result.funds);
        } else if (latestConfig.current.length) {
          // 文件为空时用当前配置初始化，方便外部编辑
          await fundFile.write(serialize(latestConfig.current));
        }
      } catch (error) {
      } finally {
        if (!cancelled) {
          ready.current = true;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 文件被外部修改 / 右键菜单手动重载 -> 重新载入
  useIpcRendererListener('fund-file-changed', async (e, funds: FundFileItem[]) => {
    try {
      await applyFileFunds(funds);
    } catch (error) {}
  });
  useIpcRendererListener('fund-file-reload', async () => {
    try {
      const result = await fundFile.read();
      await applyFileFunds(result.funds);
    } catch (error) {}
  });

  // 软件内修改 -> 写回文件
  useEffect(() => {
    if (!ready.current) {
      return;
    }
    fundFile.write(serialize(fundConfig));
  }, [fundConfig]);

  return { filePath };
}
