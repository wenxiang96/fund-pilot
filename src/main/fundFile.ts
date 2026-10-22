/**
 * 基金 JSON 文件读写
 *
 * 默认文件：exe 同级目录（绿色版）/ userData 目录（安装版）下的 funds.json
 * 结构：
 * [
 *   { "code": "320007", "name": "诺安成长混合A", "cyfe": 1000, "cbj": 1.6988 }
 * ]
 *
 * - 软件启动时读取该文件并覆盖当前钱包的基金列表
 * - 文件被外部修改时自动重新载入
 * - 软件内新增/编辑/删除基金时自动写回该文件
 */
import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow } from 'electron';
import { sendMessageToRenderer } from './util';

export type FundFileItem = {
  code: string;
  name?: string;
  cyfe?: number;
  cbj?: number;
};

export type FundFileReadResult = {
  path: string;
  exists: boolean;
  funds: FundFileItem[];
  error: string;
};

const FILE_NAME = 'funds.json';

let filePath = '';
let lastWritten = '';
let watcher: fs.StatWatcher | null = null;

/** 绿色版放在 exe 旁边，安装版放在用户数据目录（portable.ts 已统一处理 userData） */
export function getDefaultFundFilePath() {
  const portableDir = process.env.FUNDPILOT_PORTABLE_DIR;
  const dir = portableDir || app.getPath('userData');
  return path.join(dir, FILE_NAME);
}

export function getFundFilePath() {
  if (!filePath) {
    filePath = getDefaultFundFilePath();
  }
  return filePath;
}

export function setFundFilePath(target?: string) {
  const next = target && target.trim() ? path.resolve(target.trim()) : getDefaultFundFilePath();
  if (next !== filePath) {
    filePath = next;
    lastWritten = '';
  }
  return filePath;
}

/** 兼容 [..] 与 { funds: [..] } 两种写法，并做字段清洗 */
export function normalizeFundFile(raw: unknown): FundFileItem[] {
  const source = Array.isArray(raw)
    ? raw
    : raw && Array.isArray((raw as { funds?: unknown }).funds)
      ? ((raw as { funds: unknown[] }).funds as unknown[])
      : [];

  return source
    .map((item) => {
      const data = (item || {}) as Record<string, unknown>;
      const code = data.code != null ? String(data.code).trim() : '';
      const name = data.name != null ? String(data.name).trim() : '';
      const cyfe = Number(data.cyfe);
      const cbj = Number(data.cbj);
      return {
        code,
        name,
        cyfe: Number.isFinite(cyfe) && cyfe > 0 ? cyfe : 0,
        cbj: data.cbj !== undefined && data.cbj !== null && data.cbj !== '' && Number.isFinite(cbj) && cbj > 0 ? cbj : undefined,
      };
    })
    .filter((item) => !!item.code);
}

function serialize(funds: FundFileItem[]) {
  const list = funds
    .filter((item) => item && item.code)
    .map((item) => {
      const data: FundFileItem = { code: item.code, name: item.name || '' };
      if (item.cyfe !== undefined) data.cyfe = item.cyfe;
      if (item.cbj !== undefined) data.cbj = item.cbj;
      return data;
    });
  return `${JSON.stringify(list, null, 2)}\n`;
}

export function readFundFile(): FundFileReadResult {
  const target = getFundFilePath();
  try {
    if (!fs.existsSync(target)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const template = '[]\n';
      fs.writeFileSync(target, template, 'utf-8');
      lastWritten = template;
      return { path: target, exists: false, funds: [], error: '' };
    }
    const content = fs.readFileSync(target, 'utf-8');
    const funds = normalizeFundFile(content.trim() ? JSON.parse(content) : []);
    return { path: target, exists: true, funds, error: '' };
  } catch (error) {
    return { path: target, exists: true, funds: [], error: String(error) };
  }
}

export function writeFundFile(funds: FundFileItem[]) {
  const target = getFundFilePath();
  try {
    const content = serialize(funds || []);
    if (content === lastWritten) {
      return { ok: true, path: target, skipped: true, error: '' };
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf-8');
    lastWritten = content;
    return { ok: true, path: target, skipped: false, error: '' };
  } catch (error) {
    return { ok: false, path: target, skipped: false, error: String(error) };
  }
}

/** 监听外部修改（编辑器保存、云端同步等），软件自身写入会被 lastWritten 过滤掉 */
export function watchFundFile() {
  unwatchFundFile();
  const target = getFundFilePath();
  // 用轮询方式监听：编辑器保存（重命名替换）和删除重建都能感知，Windows 上比 fs.watch 稳定
  watcher = fs.watchFile(target, { interval: 1000, persistent: false }, (curr, prev) => {
    if (curr.mtimeMs === prev.mtimeMs && curr.size === prev.size) {
      return;
    }
    try {
      const content = fs.readFileSync(target, 'utf-8');
      if (content === lastWritten) {
        return;
      }
      const funds = normalizeFundFile(content.trim() ? JSON.parse(content) : []);
      lastWritten = content;
      BrowserWindow.getAllWindows().forEach((win) => {
        sendMessageToRenderer(win, 'fund-file-changed', funds);
      });
    } catch (error) {
      // 文件正在被写入时可能解析失败，忽略本次事件
    }
  });
}

export function unwatchFundFile() {
  if (watcher) {
    fs.unwatchFile(getFundFilePath());
    watcher = null;
  }
}
