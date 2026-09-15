// Shared, deliberately offline runner for FACE_WORKER_SRC tests.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
export const CLIPPER_PATH = join(here, 'vendor', 'clipper-lib-6.4.2.min.js');
export const clipperSrc = readFileSync(CLIPPER_PATH, 'utf8');

export function runFaceWorker(workerSrc, data, { benchmark = false } = {}) {
  let result = null;
  const worker = { console, navigator: { userAgent: 'chrome', appName: 'Netscape' } };
  worker.self = worker; worker.window = worker; worker.globalThis = worker;
  worker.postMessage = message => { if (message?.type === 'done') result = message; };
  vm.createContext(worker);
  worker.importScripts = () => vm.runInContext(clipperSrc, worker);
  vm.runInContext(workerSrc, worker);
  worker.onmessage({ data: benchmark ? { ...data, benchmark: true } : data });
  if (!result) throw new Error('FACE_WORKER_SRC did not emit a done message');
  return result;
}
