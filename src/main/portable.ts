/**
 * 绿色版（便携版）支持
 *
 * electron-builder 的 portable 目标会注入 PORTABLE_EXECUTABLE_DIR 环境变量，
 * 指向 exe 所在目录。存在该变量时把用户数据目录也放到 exe 旁边，
 * 这样配置、缓存、日志都跟着 exe 走，删掉文件夹即完全卸载。
 */
import path from 'path';
import { app } from 'electron';

const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;

if (portableDir) {
  app.setPath('userData', path.join(portableDir, 'FundPilotData'));
  app.setPath('sessionData', path.join(portableDir, 'FundPilotData'));
  app.setAppLogsPath(path.join(portableDir, 'FundPilotData', 'logs'));
}
