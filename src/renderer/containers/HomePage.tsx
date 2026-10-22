import Home from '@/components/Home';

import {
  useUpdater,
  useAdjustmentNotification,
  useRiskNotification,
  useClipboardCopyFunds,
  useBootStrap,
  useTrayContent,
  useAllConfigBackup,
  useTouchBar,
  useMappingLocalToSystemSetting,
  useUpdateContextMenuWalletsState,
  useShareStoreState,
  useSyncConfig,
  useForceReloadApp,
  useFundFileSync,
} from '@/utils/hooks';

function GlobalTask() {
  useUpdater();
  useAdjustmentNotification();
  useRiskNotification();
  useClipboardCopyFunds();
  useAllConfigBackup();
  useTrayContent();
  useUpdateContextMenuWalletsState();
  useMappingLocalToSystemSetting();
  useTouchBar();
  useShareStoreState();
  useSyncConfig();
  useForceReloadApp();
  useFundFileSync();
  useBootStrap();
  return null;
}

const HomePage = () => {
  return (
    <>
      <Home />
      <GlobalTask />
    </>
  );
};

export default HomePage;
