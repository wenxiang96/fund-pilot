import React, { useRef } from 'react';
import { Badge } from 'antd';
import clsx from 'clsx';
import { useBoolean, useLongPress, useRequest } from 'ahooks';
import { RiRefreshLine, RiSettingsLine, RiAppsLine } from 'react-icons/ri';
import CustomDrawer from '@/components/CustomDrawer';
import {
  useFreshFunds,
  useFreshZindexs,
  useFreshQuotations,
  useAppSelector,
  useIpcRendererListener,
  useFreshAll,
  useAIImportFunds,
} from '@/utils/hooks';
import * as Utils from '@/utils';
import * as Enums from '@/utils/enums';
import styles from './index.module.css';
import { FundsImportContentRef } from '@/components/Toolbar/FundsImportContent';

const AppCenterContent = React.lazy(() => import('@/components/Toolbar/AppCenterContent'));
const SettingContent = React.lazy(() => import('@/components/Toolbar/SettingContent'));
const FundsImportContent = React.lazy(() => import('@/components/Toolbar/FundsImportContent'));

export interface ToolBarProps {}

const iconSize = { height: 18, width: 18 };
const { ipcRenderer, dialog, clipboard } = window.contextModules.electron;
const { readFile } = window.contextModules.io;

const ToolBar: React.FC<ToolBarProps> = () => {
  const fundsImportRef = useRef<FundsImportContentRef>(null);
  const freshRef = useRef<HTMLDivElement>(null);
  const updateInfo = useAppSelector((state) => state.updater.updateInfo);
  const tabsActiveKey = useAppSelector((state) => state.tabs.activeKey);

  const freshFunds = useFreshFunds();
  const freshZindexs = useFreshZindexs();
  const freshQuotations = useFreshQuotations();

  const [showSettingContent, { setTrue: openSettingContent, setFalse: closeSettingContent }] = useBoolean(false);
  const [showAppCenterDrawer, { setTrue: openAppCenterDrawer, setFalse: closeAppCenterDrawer }] = useBoolean(false);
  const [showFundsImportContent, { setTrue: openFundsImportContent, setFalse: closeFundsImportContent }] = useBoolean(false);

  const { aiParseFunds, loading: importFundsLoading, funds: importFundsData, setFunds: setImportFundsData } = useAIImportFunds();
  const { runAsync: runMergeFunds, loading: mergeFundsLoading } = useRequest(async () => fundsImportRef.current?.mergeFunds(), {
    manual: true,
  });
  useIpcRendererListener('ai-funds-import', async (e) => {
    try {
      if (importFundsLoading || mergeFundsLoading) return;
      const { filePaths, canceled } = await dialog.showOpenDialog({
        title: '选择图片',
        filters: [{ name: '', extensions: ['jpg', 'png', 'jpeg', 'webp'] }],
      });
      const filePath = filePaths[0];
      if (canceled || !filePath) {
        return;
      }
      const fmt = filePath.split('.').pop() || 'png';
      const data = await readFile(filePath);
      const img = await Utils.ToBase64(new Blob([data], { type: `image/${fmt}` }));
      const res = await aiParseFunds(img);

      if (res) {
        await ipcRenderer.invoke('set-menubar-visible', true);
        openFundsImportContent();
      }
    } catch (e) {
      dialog.showMessageBox({
        type: 'info',
        title: `导入失败`,
        message: `导入基金失败:${e}`,
      });
    }
  });

  useIpcRendererListener('clipboard-funds-import', async (e: Electron.IpcRendererEvent, data) => {
    try {
      if (importFundsLoading || mergeFundsLoading) return;
      const text = await clipboard.readText();
      if (!text || !text.trim()) {
        dialog.showMessageBox({
          type: 'info',
          title: `粘贴板为空`,
          message: `请先复制基金 JSON 配置，例如：[{"code":"320007","cyfe":1000,"cbj":1.6988}]`,
        });
        return;
      }
      const parsed = JSON.parse(text.trim());
      // 兼容 [{...}] 与 { funds: [...] } 两种写法
      const json: any[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.funds) ? parsed.funds : [];
      const funds = json
        .filter((item) => item && (item.code !== undefined && item.code !== null))
        .map((item) => ({
          ...item,
          code: String(item.code).trim(),
          cyfe: item.cyfe === undefined || item.cyfe === null || item.cyfe === '' ? 0 : Number(item.cyfe),
          cbj: item.cbj === undefined || item.cbj === null || item.cbj === '' ? undefined : Number(item.cbj),
        }));
      if (!funds.length) {
        dialog.showMessageBox({
          type: 'info',
          title: `解析失败`,
          message: `未找到有效的基金配置，每条记录至少需要 code 字段`,
        });
        return;
      }
      setImportFundsData(funds);
      await ipcRenderer.invoke('set-menubar-visible', true);
      openFundsImportContent();
    } catch (e) {
      dialog.showMessageBox({
        type: 'info',
        title: `解析失败`,
        message: `请检查 JSON 格式：${e instanceof Error ? e.message : String(e)}`,
      });
    }
  });

  const fresh = () => {
    switch (tabsActiveKey) {
      case Enums.TabKeyType.Fund:
        freshFunds();
        break;
      case Enums.TabKeyType.Zindex:
        freshZindexs();
        break;
      case Enums.TabKeyType.Quotation:
        freshQuotations();
        break;
      default:
        break;
    }
  };

  const freshAll = useFreshAll();

  useLongPress(freshAll, freshRef, {
    onClick: fresh,
  });

  return (
    <div className={styles.content}>
      <div className={clsx(styles.bar, 'max-content')}>
        <RiAppsLine style={{ ...iconSize }} onClick={openAppCenterDrawer} />
        <div ref={freshRef}>
          <RiRefreshLine style={{ ...iconSize }} />
        </div>
        <Badge dot={!!updateInfo.version}>
          <RiSettingsLine style={{ ...iconSize }} onClick={openSettingContent} />
        </Badge>
        <CustomDrawer show={showAppCenterDrawer}>
          <AppCenterContent
            onClose={closeAppCenterDrawer}
            onEnter={() => {
              freshAll();
              closeAppCenterDrawer();
            }}
          />
        </CustomDrawer>
        <CustomDrawer className={styles.themeWrapper} show={showSettingContent}>
          <SettingContent
            themeWrapperClass={styles.themeWrapper}
            onClose={closeSettingContent}
            onEnter={closeSettingContent}
          />
        </CustomDrawer>
        <CustomDrawer show={showFundsImportContent}>
          <FundsImportContent
            ref={fundsImportRef}
            loading={importFundsLoading || mergeFundsLoading}
            funds={importFundsData}
            onClose={closeFundsImportContent}
            onEnter={async () => {
              await runMergeFunds();
              freshFunds();
              closeFundsImportContent();
            }}
          />
        </CustomDrawer>
      </div>
    </div>
  );
};

export default ToolBar;
