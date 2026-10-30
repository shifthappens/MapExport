// Runs FACE_WORKER_SRC as a "browser worker" on a real Node thread, with a
// nested Worker that starts another host thread, so the occlusion sub-worker
// route (PERF-07) runs truly in parallel offline. Used by
// tests/v2-occlusion-threads.mjs; it reports sub-worker spawns, progress
// batches, answered shares, errors and terminations next to the worker's own
// messages, so the test can tell a working threaded pass from a silent inline
// fallback.
//
// workerData.fault (face worker only) breaks the FIRST sub-worker on purpose:
//   'error'        → it fires an error event instead of answering
//   'messageerror' → its answer fails to deserialize
//   'hang'         → it never answers
//   'midway'       → it reports after every element, but only its first
//                    progress batch gets through; then it goes silent
//   'slow'         → it reports after every element, each report held back
//                    50 ms, so its share takes far longer than the silence
//                    limit while no gap comes close to it
//   'spawn-throw'  → the THIRD sub-worker's constructor throws
//   'post-throw'   → the THIRD sub-worker's postMessage throws
//   'hang-others-slow' → the first one hangs and the other three run 'slow',
//                    so they are still working when the first is given up
// The face worker's silence limit (workerData.silenceMs, read from the
// source) is shortened to 3 s for 'hang' and 'midway' and to 1.5 s for the
// slow modes; it applies to every sub-worker, so healthy ones get the same
// time to start and answer.
import { parentPort, workerData, Worker } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const { workerSrc, clipperPath, hostPath, cores, fault, isSubWorker, silenceMs } = workerData;
const shortSilenceMs = { hang: 3000, midway: 3000, slow: 1500, 'hang-others-slow': 1500 }[fault];
const clipperSrc = readFileSync(clipperPath, 'utf8');

const scope = {
  console,
  navigator: { userAgent: 'chrome', appName: 'Netscape', hardwareConcurrency: cores },
  location: { href: 'blob:face-worker' },
  setTimeout: (fn, ms) => setTimeout(fn, ms === silenceMs && shortSilenceMs ? shortSilenceMs : ms),
  clearTimeout,
};
scope.self = scope; scope.window = scope; scope.globalThis = scope;
scope.postMessage = message => parentPort.postMessage(message);
scope.importScripts = () => vm.runInContext(clipperSrc, scope);

let spawned = 0;
scope.Worker = class {
  constructor() {
    if (fault === 'spawn-throw' && !isSubWorker && spawned === 2) { spawned++; throw new Error('injected Worker constructor throw'); }
    const broken = !isSubWorker && fault && spawned === 0;
    spawned++;
    parentPort.postMessage({ type: 'test:spawn' });
    if (fault === 'hang-others-slow' && !isSubWorker) this.fault = broken ? 'hang' : 'slow';
    else if (fault === 'post-throw' && !isSubWorker) this.fault = spawned === 3 ? 'post-throw' : null;
    else this.fault = broken && fault !== 'spawn-throw' && fault !== 'post-throw' ? fault : null;
    if (this.fault && this.fault !== 'midway' && this.fault !== 'slow' && this.fault !== 'post-throw') return;
    this.thread = new Worker(hostPath, { workerData: { ...workerData, fault: null, isSubWorker: true } });
    let batchesThrough = 0, slowQueue = Promise.resolve();
    const relay = data => {
      if (data?.type === 'occlusionChunkProgress') parentPort.postMessage({ type: 'test:progress' });
      if (data?.type === 'occlusionChunkDone') parentPort.postMessage({ type: 'test:chunk' });
      if (this.onmessage) this.onmessage({ data });
    };
    this.thread.on('message', data => {
      if (this.fault === 'midway' && (data?.type !== 'occlusionChunkProgress' || batchesThrough++ > 0)) return;
      if (this.fault === 'slow') slowQueue = slowQueue.then(() => new Promise(go => setTimeout(go, 50))).then(() => relay(data));
      else relay(data);
    });
    this.thread.on('error', error => {
      parentPort.postMessage({ type: 'test:suberror', message: String(error?.message || error) });
      if (this.onerror) this.onerror({ error, preventDefault() {} });
    });
  }
  postMessage(message) {
    if (this.fault === 'post-throw') throw new Error('injected postMessage throw');
    if (this.fault === 'error') setTimeout(() => this.onerror && this.onerror({ preventDefault() {} }), 0);
    else if (this.fault === 'messageerror') setTimeout(() => this.onmessageerror && this.onmessageerror({}), 0);
    else if (this.fault === 'midway' || this.fault === 'slow') this.thread.postMessage({ ...message, heartbeatMs: 0 });
    else if (this.thread) this.thread.postMessage(message);
  }
  terminate() {
    parentPort.postMessage({ type: 'test:terminate' });
    if (this.thread) this.thread.terminate();
  }
};
vm.createContext(scope);
vm.runInContext(workerSrc, scope);
parentPort.on('message', data => scope.onmessage({ data }));
