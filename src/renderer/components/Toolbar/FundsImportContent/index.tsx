import React, { RefObject, useImperativeHandle, useState } from 'react';
import { RiArrowDownLine } from 'react-icons/ri';
import CustomDrawerContent from '@/components/CustomDrawer/Content';
import styles from './index.module.css';
import clsx from 'clsx';
import StandCard from '@/components/Card/StandCard';
import { useAppDispatch, useAppSelector, useLoadFunds } from '@/utils/hooks';
import TextArea from 'antd/es/input/TextArea';
import { Tabs } from 'antd';
import * as Helpers from '@/helpers';
import * as Utils from '@/utils';
import { setFundConfigAction } from '@/store/features/fund';

export type FundsImportContentProps = {
  onEnter: () => void;
  onClose: () => void;
  funds: Partial<FundConfigItem>[];
  loading?: boolean;
  ref?: RefObject<FundsImportContentRef | null>;
};

export type FundsImportContentRef = {
  mergeFunds: () => void;
};

export type FundConfigItem = {
  code: string; // 基金代码（必填）
  name: string; // 基金名称
  cyfe: number | string; // 持有份额
  cbj: number | string; // 持仓成本价
};

/** JSON 里的数字常被写成字符串，统一转成 number，避免 toFixed 崩溃 */
function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function formatNumber(value: unknown, digits: number) {
  const num = toNumber(value);
  return num === undefined ? '-' : num.toFixed(digits);
}

const { dialog } = window.contextModules.electron;

const FundsImportContent: React.FC<FundsImportContentProps> = (props) => {
  const dispatch = useAppDispatch();
  const currentWalletCode = useAppSelector((state) => state.wallet.currentWalletCode);
  const walletsConfig = useAppSelector((state) => state.wallet.config.walletConfig);
  const fundConfig = useAppSelector((state) => state.wallet.fundConfig);
  const fundApiTypeSetting = useAppSelector((state) => state.setting.systemSetting.fundApiTypeSetting);

  const [data, setData] = useState(props.funds);

  async function mergeFunds() {
    try {
      const limit = 99;
      const json = data as FundConfigItem[];
      if (data.length > limit) {
        dialog.showMessageBox({
          type: 'info',
          title: `超过最大限制`,
          message: `最大${limit}个`,
        });
        return;
      }
      const { codeMap: oldCodeMap } = Helpers.Fund.GetFundConfig(currentWalletCode, walletsConfig);
      const jsonFundConfig = json
        .map((fund) => {
          const cyfe = toNumber(fund.cyfe);
          const cbj = toNumber(fund.cbj);
          return {
            name: '',
            cyfe: cyfe === undefined || cyfe < 0 ? 0 : cyfe,
            code: fund.code === undefined || fund.code === null ? '' : String(fund.code).trim(),
            cbj: cbj === undefined || cbj < 0 ? undefined : cbj,
          };
        })
        .filter(({ code }) => code);
      const jsonCodeMap = Utils.GetCodeMap(jsonFundConfig, 'code');
      // 去重复
      const fundConfigSet = Object.entries(jsonCodeMap).map(([code, fund]) => fund);
      const responseFunds = await Helpers.Fund.GetFunds(fundConfigSet, fundApiTypeSetting);
      const newFundConfig = responseFunds.map((fund) => ({
        name: fund!.name!,
        code: fund!.fundcode!,
        cyfe: jsonCodeMap[fund!.fundcode!].cyfe,
        cbj: jsonCodeMap[fund!.fundcode!].cbj,
      }));
      const newCodeMap = Utils.GetCodeMap(newFundConfig, 'code');
      const allCodeMap = {
        ...oldCodeMap,
        ...newCodeMap,
      };
      const allFundConfig = Object.entries(allCodeMap).map(([code, fund]) => fund);
      await dispatch(setFundConfigAction({ config: allFundConfig, walletCode: currentWalletCode }));
      dialog.showMessageBox({
        type: 'info',
        title: `导入完成`,
        message: `更新：${newFundConfig.length}个，总共：${json.length}个`,
      });
    } catch (error) {
      dialog.showMessageBox({
        type: 'info',
        title: `导入失败`,
        message: String(error),
      });
    }
  }

  useImperativeHandle(props.ref, () => ({
    mergeFunds,
  }));

  return (
    <CustomDrawerContent
      title="基金导入"
      enterText="确定"
      onClose={props.onClose}
      onEnter={props.onEnter}
      enterLoading={props.loading}
    >
      <div className={styles.content}>
        <Tabs
          animated={{ tabPane: true }}
          tabBarGutter={15}
          items={[
            {
              key: String(0),
              label: '合并',
              children: <Merge data={data} />,
            },
            {
              key: String(1),
              label: 'json',
              children: <JsonEditor data={data} updateData={setData} />,
            },
          ]}
        ></Tabs>
      </div>
    </CustomDrawerContent>
  );
};
const Merge: React.FC<{ data: Partial<FundConfigItem>[] }> = (props) => {
  const codeMap = useAppSelector((state) => state.wallet.fundConfigCodeMap);

  return props.data.map((item) => {
    const localFund = codeMap[item.code!];
    return (
      <StandCard key={item.code}>
        <div className={clsx('card-body')}>
          <div className={styles.nameBar}>
            {localFund?.name || '无'}
            <span className={clsx(styles.tag)}>本地</span>
          </div>
          {localFund && (
            <div className={clsx(styles.infoBar)}>
              <div>{localFund?.code}</div>
              <div>持有份额: {localFund?.cyfe}</div>
              <div>成本价: {localFund?.cbj}</div>
            </div>
          )}
          <div className={clsx(styles.arrowBar)}>
            <RiArrowDownLine />
          </div>
          <div className={styles.nameBar}>
            {item.name}
            <span className={clsx(styles.income)}>传入</span>
          </div>
          <div className={clsx(styles.infoBar)}>
            <div>{item.code}</div>
            <div>持有份额: {formatNumber(item?.cyfe, 2)}</div>
            <div>成本价: {formatNumber(item?.cbj, 4)}</div>
          </div>
        </div>
      </StandCard>
    );
  });
};
const JsonEditor: React.FC<{
  data: Partial<FundConfigItem>[];
  updateData: (data: Partial<FundConfigItem>[]) => void;
}> = (props) => {
  const json = JSON.stringify(props.data, null, 2);
  const rows = Math.max(props.data.length * 6 + 2, 10);
  const [error, setError] = useState('');
  return (
    <>
      <TextArea
        rows={rows}
        value={json}
        onChange={(e) => {
          try {
            const parsed = JSON.parse(e.target.value);
            // 兼容 [{...}] 与 { funds: [...] } 两种写法
            const value: FundConfigItem[] = Array.isArray(parsed)
              ? parsed
              : Array.isArray(parsed?.funds)
                ? parsed.funds
                : null;
            if (!value) {
              setError('需要一个 JSON 数组，例如 [{ "code": "320007", "cyfe": 1000 }]');
              return;
            }
            // 不能修改 code 和名字，只允许改份额/成本价
            const namesUnchanged = value.map((_) => _.name).join('') === props.data.map((_) => _.name).join('');
            const codesUnchanged = value.map((_) => _.code).join('') === props.data.map((_) => _.code).join('');
            if (namesUnchanged && codesUnchanged) {
              setError('');
              props.updateData(value);
            } else {
              setError('基金代码和名称不可修改，请只调整持有份额 / 成本价');
            }
          } catch (err) {
            setError(`JSON 格式错误：${(err as Error).message}`);
          }
        }}
      ></TextArea>
      {!!error && <div className={styles.errorBar}>{error}</div>}
    </>
  );
};

export default FundsImportContent;
