import { codingWorkerWarp } from '@/workers';

export function encryptFP(content: any) {
  return codingWorkerWarp.encryptFP(content);
}
export function decryptFP<T = unknown>(content: string) {
  return codingWorkerWarp.decryptFP(content) as T;
}
export function encodeFP(content: any) {
  return codingWorkerWarp.encodeFP(content);
}
export function decodeFP<T = unknown>(content: string) {
  return codingWorkerWarp.decodeFP(content) as T;
}
