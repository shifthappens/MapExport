// Engine v2 landcover occlusion on sub-workers (PERF-07), offline.
//
// The other face-worker tests run in a plain vm context without nested
// workers, so they only ever exercise the inline occlusion loop. Here the face
// worker runs on a real thread whose Worker starts more threads
// (face-worker-thread-host.mjs), so the threaded route actually runs. Checks:
//   - with spare cores the pass really uses sub-workers, and the result is
//     identical to the inline loop (same culls, same clipped rings, same order);
//   - benchmark frame-clip counters add up to the inline totals;
//   - a sub-worker that errors, whose answer fails to deserialize, never
//     answers, or goes silent after a progress batch has its missing elements
//     computed inline: one 'done', same result, all sub-workers terminated.
//     Silence is only caught by the per-sub-worker silence timer;
//   - a slow sub-worker that keeps reporting is never cut off, however long
//     its share takes, and giving up on one sub-worker leaves the others
//     running.
// The host shortens the engine's silence limit in the fault modes; it gets
// the value from the source, so the two cannot drift apart.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Worker } from 'node:worker_threads';
import vm from 'node:vm';
import { runFaceWorker, CLIPPER_PATH } from './face-worker-helper.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'engine-v2.js'), 'utf8');
const layer = id => ({ id, label: id, type: id, overpassQuery: () => '' });
const context = vm.createContext({
  LAYER_REGISTRY: [{ group: 'stub', layers: [] }], BLOCK_BUILDINGS_LAYER: layer('buildings'),
  parksNamedGate: () => false, isSquareTagged: () => false, getScaleFactor: () => 1, getEps: () => 1,
  getLineEps: () => 1, getAreaLargeEps: () => 1, dpSimplify: points => points,
  mergeNamedWays: elements => elements, prepareClusterData: () => [],
  ROAD_WIDTHS: { _default: { fillW: 4, casingW: 2 } }, COUNTRYSIDE_MIN_KM2: 0.35,
  Worker: class {}, Blob: class {}, URL: { createObjectURL: () => '' }, setTimeout, console,
});
vm.runInContext(source + '\n;globalThis.__X2 = EngineV2;', context);
const workerSrc = context.__X2.FACE_WORKER_SRC;
const silenceMs = Number(source.match(/const OCCLUSION_SILENCE_MS = (\d+);/)?.[1]);
if (!silenceMs) throw new Error('OCCLUSION_SILENCE_MS not found in engine-v2.js');

let failures = 0;
const check = (label, pass, detail = '') => {
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${pass || !detail ? '' : ` (${detail})`}`);
  if (!pass) failures++;
};

// A 1000×1000 clip-only frame with 300 small landcover squares: enough for
// four sub-workers at four cores (64 elements each minimum). Water covers some
// squares fully and some partly, a waterway crosses a row, and the first
// column straddles the left frame edge so the per-element frame clip runs.
const ring = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const landcoverElements = [];
for (let row = 0; row < 15; row++) {
  for (let col = 0; col < 20; col++) {
    const x0 = -20 + col * 50, y0 = 10 + row * 65;
    landcoverElements.push({ index: landcoverElements.length, rings: [ring(x0, y0, x0 + 40, y0 + 40)] });
  }
}
const payload = {
  clipOnly: true,
  cutterLines: [], buildingCenters: [], clusterRings: [], placeNodes: [],
  greenPolys: [], recreationPolys: [], urbanPolys: [], openLandPolys: [],
  W: 1000, H: 1000, bigFacePx2: 100000, mPerPx: 1,
  landcoverElements,
  landcoverPolys: landcoverElements.map(element => element.rings[0]),
  waterPolys: [ring(-50, 0, 120, 1000), ring(300, 300, 520, 470), ring(610, 620, 980, 990)],
  waterwayLines: [{ halfW: 6, pts: [[0, 500], [1000, 520]] }],
  coverPaints: { blocks: false, water: true, waterways: true, green: true, recreation: true },
};

const withoutTimings = ({ type, timings, ...rest }) => JSON.stringify(rest);
const reference = runFaceWorker(workerSrc, payload);
const referenceBench = runFaceWorker(workerSrc, payload, { benchmark: true });
check('fixture culls and clips landcover (the pass has real work)',
  reference.culledLandcover.length > 0 && reference.clippedLandcover.length > 0);

// Runs the face worker on a thread and collects every message until 'done',
// then waits briefly so a second 'done' would be seen.
function runThreaded(data, { cores = 4, fault = null } = {}) {
  return new Promise((resolve, reject) => {
    const hostPath = join(here, 'face-worker-thread-host.mjs');
    const thread = new Worker(hostPath, { workerData: { workerSrc, clipperPath: CLIPPER_PATH, hostPath, cores, fault, silenceMs } });
    const seen = { spawns: 0, progress: 0, chunks: 0, subErrors: [], terminations: 0, dones: [], elapsedMs: 0 };
    const startedAt = Date.now();
    const deadline = setTimeout(() => { thread.terminate(); reject(new Error('face worker never finished')); }, 60000);
    thread.on('message', message => {
      if (message.type === 'test:spawn') seen.spawns++;
      else if (message.type === 'test:chunk') seen.chunks++;
      else if (message.type === 'test:progress') seen.progress++;
      else if (message.type === 'test:suberror') seen.subErrors.push(message.message);
      else if (message.type === 'test:terminate') seen.terminations++;
      else if (message.type === 'done') {
        seen.dones.push(message);
        if (seen.dones.length === 1) seen.elapsedMs = Date.now() - startedAt;
        if (seen.dones.length === 1) setTimeout(() => { clearTimeout(deadline); thread.terminate(); resolve(seen); }, 200);
      }
    });
    thread.on('error', error => { clearTimeout(deadline); reject(error); });
    thread.postMessage(data);
  });
}

const threaded = await runThreaded(payload);
// Answered shares, not just started ones: a broken sub-worker branch would
// fall back inline and still produce the identical result.
const allAnswered = run => run.spawns === 4 && run.chunks === 4 && run.subErrors.length === 0;
const routeDetail = run => `spawns=${run.spawns} chunks=${run.chunks} errors=${run.subErrors.join('; ')}`;
check('four cores: all four sub-workers answer without error', allAnswered(threaded), routeDetail(threaded));
check('threaded result is identical to the inline loop',
  threaded.dones.length === 1 && withoutTimings(threaded.dones[0]) === withoutTimings(reference));

const singleCore = await runThreaded(payload, { cores: 1 });
check('one core: no sub-workers, same result',
  singleCore.spawns === 0 && withoutTimings(singleCore.dones[0]) === withoutTimings(reference));

const threadedBench = await runThreaded({ ...payload, benchmark: true });
check('benchmark: all four sub-workers answer without error', allAnswered(threadedBench), routeDetail(threadedBench));
const counterKeys = ['frameClipCalls', 'frameClipInputVertices', 'frameClipOutputVertices'];
check('benchmark: the frame-clip counters ran in the sub-workers', referenceBench.timings.frameClipCalls > 1);
check('benchmark: threaded frame-clip counters equal the inline totals',
  counterKeys.every(key => threadedBench.dones[0].timings[key] === referenceBench.timings[key]),
  counterKeys.map(key => `${key} ${threadedBench.dones[0].timings[key]} vs ${referenceBench.timings[key]}`).join(', '));

// Only the elements a silent sub-worker never reported are redone inline: work
// counted twice would push the frame-clip counters past the inline totals.
const midwayBench = await runThreaded({ ...payload, benchmark: true }, { fault: 'midway' });
check('sub-worker midway (benchmark): only unreported elements are redone',
  midwayBench.progress === 1 && counterKeys.every(key => midwayBench.dones[0]?.timings[key] === referenceBench.timings[key]),
  counterKeys.map(key => `${key} ${midwayBench.dones[0]?.timings[key]} vs ${referenceBench.timings[key]}`).join(', '));

// Each report restarts the silence timer, so the slow share is waited for
// although it takes more than twice the (shortened, 1.5 s) silence limit. In
// benchmark mode its many batches each carry their own counters, which must
// still add up to the inline totals.
const slow = await runThreaded({ ...payload, benchmark: true }, { fault: 'slow' });
check('slow sub-worker: still answered, no inline fallback', allAnswered(slow) && slow.dones.length === 1, routeDetail(slow));
check('slow sub-worker: took over twice the silence limit, reporting as it went',
  slow.elapsedMs > 3000 && slow.progress > 10, `${slow.elapsedMs} ms, progress=${slow.progress}`);
check('slow sub-worker: same result', slow.dones.length === 1 && withoutTimings(slow.dones[0]) === withoutTimings(reference));
check('slow sub-worker (benchmark): counters of many batches equal the inline totals',
  counterKeys.every(key => slow.dones[0]?.timings[key] === referenceBench.timings[key]),
  counterKeys.map(key => `${key} ${slow.dones[0]?.timings[key]} vs ${referenceBench.timings[key]}`).join(', '));

// A sub-worker that cannot be started (third constructor or postMessage
// throws) leaves the two started ones running; its share and the one never
// started are computed inline, and the pass still ends with one 'done'.
for (const fault of ['spawn-throw', 'post-throw']) {
  const thrown = await runThreaded(payload, { fault });
  check(`${fault}: one done, same result`,
    thrown.dones.length === 1 && withoutTimings(thrown.dones[0]) === withoutTimings(reference), `dones=${thrown.dones.length}`);
  check(`${fault}: the two started sub-workers still answer`, thrown.chunks === 2, routeDetail(thrown));
}

// Giving up on a silent sub-worker must not stop the others: they are still
// reporting when it is dropped, and finish their own shares.
const mixed = await runThreaded(payload, { fault: 'hang-others-slow' });
check('one silent, three slow: the three still answer after it is dropped',
  mixed.dones.length === 1 && mixed.chunks === 3 && mixed.elapsedMs > 3000, `${routeDetail(mixed)}, ${mixed.elapsedMs} ms`);
check('one silent, three slow: same result', mixed.dones.length === 1 && withoutTimings(mixed.dones[0]) === withoutTimings(reference));

for (const fault of ['error', 'messageerror', 'hang', 'midway']) {
  const broken = await runThreaded(payload, { fault });
  check(`sub-worker ${fault}: exactly one done`, broken.dones.length === 1, `dones=${broken.dones.length}`);
  check(`sub-worker ${fault}: inline rerun gives the same result`,
    broken.dones.length >= 1 && withoutTimings(broken.dones[0]) === withoutTimings(reference));
  // The broken share is the injected one only; the other three answer, and
  // a silent one is only rescued by its silence timer after they do.
  if (fault === 'hang' || fault === 'midway') {
    check(`sub-worker ${fault}: the other three shares answered`, broken.chunks === 3, routeDetail(broken));
  }
  if (fault === 'midway') check('sub-worker midway: its first progress batch arrived before it went silent', broken.progress === 1, `progress=${broken.progress}`);
  // An error or undeliverable answer is handled when it happens, well before
  // the 60 s silence limit that would otherwise mask a missing handler.
  if (fault === 'error' || fault === 'messageerror') check(`sub-worker ${fault}: falls back at once, not via the watchdog`, broken.elapsedMs < 5000, `${broken.elapsedMs} ms`);
  check(`sub-worker ${fault}: every sub-worker is terminated`,
    broken.spawns === 4 && broken.terminations >= broken.spawns, `spawns=${broken.spawns} terminations=${broken.terminations}`);
}

if (failures) {
  console.error(`v2-occlusion-threads: ${failures} failed`);
  process.exit(1);
}
console.log('PASS — v2 occlusion threads: sub-worker route matches inline; error, messageerror, hang and midway silence fall back once; a slow one is waited for');
