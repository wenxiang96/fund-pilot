/**
 * 开机自启（静默）
 *
 * Windows 下不使用 Electron 的 app.setLoginItemSettings（绿色版里会写到 %TEMP%
 * 的自解压路径，重启后失效），改为直接维护注册表：
 *
 *   1. HKCU\Software\Microsoft\Windows\CurrentVersion\Run
 *      启动项本体，值为真实 exe 路径
 *   2. HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run
 *      启用状态。用户一旦在「任务管理器 → 启动」里禁用过，或者系统/安全软件
 *      自动禁用，只写 Run 项仍然不会启动，必须把这一项写回「已启用」。
 *
 * 启动命令带 --autostart 参数，主进程据此静默启动（只驻留托盘，不弹窗口）。
 *
 * macOS / Linux 仍走 Electron 原生实现（macOS 用 LaunchAgent，Linux 用 .desktop）。
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { app } from 'electron';

// 注意：注册表路径必须用双反斜杠，单反斜杠会被 JS 当成转义字符吞掉
const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const APPROVED_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run';
const VALUE_NAME = 'Fund Pilot';

/** 开机自启时的启动参数，主进程据此判断需要静默启动 */
export const AUTOSTART_FLAG = '--autostart';

/** StartupApproved 中「已启用」的二进制值（首字节 02 = enabled，03 = disabled） */
const APPROVED_ENABLED = '020000000000000000000000';

export type AutoStartStatus = {
  ok: boolean;
  enabled: boolean;
  command: string; // 期望写入的启动命令
  actual: string; // 注册表里的实际值
  error: string;
};

/** 绿色版取真实 exe；开发模式取 electron.exe + 项目路径 */
function getLaunchCommand() {
  if (app.isPackaged) {
    return `"${app.getPath('exe')}" ${AUTOSTART_FLAG}`;
  }
  return `"${process.execPath}" "${app.getAppPath()}" ${AUTOSTART_FLAG}`;
}

function reg(args: string[]) {
  return execFileSync('reg', args, { encoding: 'utf-8', windowsHide: true });
}

/** 读取注册表字符串值，失败返回空串 */
function readValue(key: string): string {
  try {
    const out = reg(['query', key, '/v', VALUE_NAME]);
    const match = out.match(/REG_(?:SZ|BINARY|EXPAND_SZ)\s+(\S.*)$/m);
    return match ? match[1].trim() : '';
  } catch (error) {
    return '';
  }
}

/** 从启动命令里取出 exe 路径（去掉引号和参数） */
function extractExePath(command: string) {
  const trimmed = (command || '').trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.startsWith('"')) {
    const end = trimmed.indexOf('"', 1);
    return end > 0 ? trimmed.slice(1, end) : trimmed.replace(/"/g, '');
  }
  return trimmed.split(/\s+/)[0];
}

function isSameExe(a: string, b: string) {
  const left = extractExePath(a);
  const right = extractExePath(b);
  if (!left || !right) {
    return false;
  }
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

/** StartupApproved 是否处于启用状态（没有该项时 Windows 默认启用） */
function isApprovedEnabled() {
  const raw = readValue(APPROVED_KEY);
  if (!raw) {
    return true;
  }
  return !raw.toLowerCase().startsWith('03');
}

/** 读取当前自启状态：路径必须指向当前 exe，且没有被系统禁用 */
export function getAutoStartStatus(): AutoStartStatus {
  const command = getLaunchCommand();
  if (process.platform !== 'win32') {
    try {
      const enabled = app.getLoginItemSettings().openAtLogin;
      return { ok: true, enabled, command, actual: '', error: '' };
    } catch (error) {
      return { ok: false, enabled: false, command, actual: '', error: String(error) };
    }
  }
  const actual = readValue(RUN_KEY);
  const pathMatched = !!actual && isSameExe(actual, command);
  const approved = isApprovedEnabled();
  return {
    ok: true,
    enabled: pathMatched && approved,
    command,
    actual,
    error: pathMatched && !approved ? '启动项已被系统禁用（任务管理器 → 启动）' : '',
  };
}

export function isAutoStartEnabled(): boolean {
  return getAutoStartStatus().enabled;
}

export function setAutoStart(enabled: boolean): AutoStartStatus {
  const command = getLaunchCommand();

  if (process.platform !== 'win32') {
    try {
      app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true, args: [AUTOSTART_FLAG] });
      return { ok: true, enabled: isAutoStartEnabled(), command, actual: '', error: '' };
    } catch (error) {
      return { ok: false, enabled: isAutoStartEnabled(), command, actual: '', error: String(error) };
    }
  }

  try {
    if (enabled) {
      reg(['add', RUN_KEY, '/v', VALUE_NAME, '/t', 'REG_SZ', '/d', command, '/f']);
      // 关键：把「任务管理器 → 启动」里的禁用状态改回启用，否则开机不会启动
      try {
        reg(['add', APPROVED_KEY, '/v', VALUE_NAME, '/t', 'REG_BINARY', '/d', APPROVED_ENABLED, '/f']);
      } catch (error) {
        // 该键写不进去不影响 Run 项本身，忽略
      }
      const actual = readValue(RUN_KEY);
      const ok = isSameExe(actual, command);
      return {
        ok,
        enabled: ok && isApprovedEnabled(),
        command,
        actual,
        error: ok ? '' : '写入注册表启动项失败，可能被安全软件拦截',
      };
    }

    try {
      reg(['delete', RUN_KEY, '/v', VALUE_NAME, '/f']);
    } catch (error) {
      // 本来就不存在，忽略
    }
    try {
      reg(['delete', APPROVED_KEY, '/v', VALUE_NAME, '/f']);
    } catch (error) {
      // 本来就不存在，忽略
    }
    const actual = readValue(RUN_KEY);
    return { ok: !actual, enabled: false, command, actual, error: actual ? '删除注册表启动项失败' : '' };
  } catch (error) {
    return { ok: false, enabled: false, command, actual: readValue(RUN_KEY), error: String(error) };
  }
}

/**
 * 绿色版换目录后，启动时自动把注册表指向当前 exe。
 * 只在「已经有启动项但路径不对」时修正，用户主动关掉的自启不会被重新打开。
 */
export function syncAutoStartPath() {
  try {
    if (process.platform !== 'win32') {
      return;
    }
    const actual = readValue(RUN_KEY);
    if (!actual) {
      return;
    }
    const command = getLaunchCommand();
    if (!isSameExe(actual, command) || !actual.includes(AUTOSTART_FLAG)) {
      setAutoStart(true);
    }
  } catch (error) {}
}
