/**
 * 开机自启
 *
 * Windows 下不使用 Electron 的 app.setLoginItemSettings（它在绿色版里会写到
 * %TEMP% 的自解压路径，重启后失效），改为直接维护注册表启动项：
 *   HKCU\Software\Microsoft\Windows\CurrentVersion\Run
 * 值是真实可执行文件路径，绿色版换目录后重新开启一次即可。
 *
 * macOS / Linux 仍走 Electron 原生实现（macOS 用 LaunchAgent，Linux 用 .desktop）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

const RUN_KEY = 'HKCU\Software\Microsoft\Windows\CurrentVersion\Run';
const VALUE_NAME = 'Fund Pilot';

/** 绿色版取真实 exe；开发模式取 electron.exe + 项目路径 */
function getLaunchCommand() {
  if (app.isPackaged) {
    return `"${app.getPath('exe')}"`;
  }
  // 开发模式：electron.exe "项目根目录"
  return `"${process.execPath}" "${app.getAppPath()}"`;
}

function readWindowsValue(): string {
  try {
    const { execFileSync } = require('node:child_process');
    const out = execFileSync('reg', ['query', RUN_KEY, '/v', VALUE_NAME], {
      encoding: 'utf-8',
      windowsHide: true,
    });
    const match = out.match(/REG_SZ\s+(.+)$/m);
    return match ? match[1].trim() : '';
  } catch (error) {
    return '';
  }
}

export function isAutoStartEnabled(): boolean {
  if (process.platform !== 'win32') {
    return app.getLoginItemSettings().openAtLogin;
  }
  return !!readWindowsValue();
}

export function setAutoStart(enabled: boolean): { ok: boolean; enabled: boolean; command: string; error: string } {
  const command = getLaunchCommand();
  try {
    if (process.platform === 'win32') {
      const { execFileSync } = require('node:child_process');
      if (enabled) {
        execFileSync('reg', ['add', RUN_KEY, '/v', VALUE_NAME, '/t', 'REG_SZ', '/d', command, '/f'], {
          windowsHide: true,
        });
      } else {
        try {
          execFileSync('reg', ['delete', RUN_KEY, '/v', VALUE_NAME, '/f'], { windowsHide: true });
        } catch (error) {
          // 本来就不存在，忽略
        }
      }
      return { ok: true, enabled: isAutoStartEnabled(), command, error: '' };
    }

    app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true });
    return { ok: true, enabled: isAutoStartEnabled(), command, error: '' };
  } catch (error) {
    return { ok: false, enabled: isAutoStartEnabled(), command, error: String(error) };
  }
}

/** 绿色版换目录后，启动时自动把注册表指向当前 exe */
export function syncAutoStartPath() {
  try {
    if (process.platform !== 'win32') {
      return;
    }
    const current = readWindowsValue();
    if (!current) {
      return;
    }
    const command = getLaunchCommand();
    if (current !== command) {
      setAutoStart(true);
    }
  } catch (error) {}
}
