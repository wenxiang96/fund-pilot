/**
 * 绿色版（便携）支持
 *
 * 三种情况：
 * 1. electron-builder 的 portable 目标：注入 PORTABLE_EXECUTABLE_DIR（指向 exe 所在目录）
 * 2. 解压即用的 zip 版：exe 直接放在普通文件夹里，没有上面的环境变量
 * 3. 安装版：exe 在 Program Files 之类不可写的目录
 *
 * 判断顺序：环境变量 > exe 所在目录可写则用它 > 系统默认目录
 * 命中 1/2 时，配置、缓存、日志、funds.json 全部落在 exe 同级目录，
 * 删掉整个文件夹即完全卸载，不写注册表、不写 %APPDATA%。
 */
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

/** 判断目录是否可写（不留下残留文件） */
function isWritableDir(dir: string) {
  const probe = path.join(dir, `.write-test-${process.pid}`);
  try {
    fs.writeFileSync(probe, '1');
    fs.unlinkSync(probe);
    return true;
  } catch (error) {
    return false;
  }
}

function resolvePortableDir(): string {
  // 1) portable 目标注入的变量
  const injected = process.env.PORTABLE_EXECUTABLE_DIR;
  if (injected) {
    return injected;
  }
  // 2) 已打包 且 exe 同级目录可写 -> 视为绿色版
  if (app.isPackaged) {
    const exeDir = path.dirname(app.getPath('exe'));
    if (isWritableDir(exeDir)) {
      return exeDir;
    }
  }
  return '';
}

const portableDir = resolvePortableDir();

if (portableDir) {
  const dataDir = path.join(portableDir, 'FundPilotData');
  app.setPath('userData', dataDir);
  app.setPath('sessionData', dataDir);
  app.setAppLogsPath(path.join(dataDir, 'logs'));
  // 供主进程其它模块判断当前是否绿色版
  process.env.FUNDPILOT_PORTABLE_DIR = portableDir;
}

export const isPortable = !!portableDir;
export const portableDataDir = portableDir ? path.join(portableDir, 'FundPilotData') : '';
