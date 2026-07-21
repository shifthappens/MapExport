// Focused, synthetic worker check for PERF-01/PERF-02. It runs the retained
// reference path (runtimeOptimizations:false) beside the optimized path and
// requires their serialized result to match exactly. Its timings are evidence
// only; it deliberately has no performance threshold.
import { readFileSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import os from 'node:os';
import vm from 'node:vm';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const source = readFileSync(join(repoRoot, 'engine-v2.js'), 'utf8');
const layer = id => ({ id, label: id, type: id, overpassQuery: () => '' });
const context = vm.createContext({
  LAYER_REGISTRY: [{ group: 'stub', layers: ['roads', 'rail', 'tram', 'metro', 'water_bodies', 'waterways', 'parks', 'landcover', 'transit_stops', 'water_labels', 'street_labels'].map(layer) }],
  BLOCK_BUILDINGS_LAYER: layer('buildings'), parksNamedGate: () => false,
  isSquareTagged: () => false, getScaleFactor: () => 1, getEps: () => 1,
  getLineEps: () => 1, getAreaLargeEps: () => 1, dpSimplify: points => points,
  mergeNamedWays: elements => elements, prepareClusterData: () => [],
  ROAD_WIDTHS: { _default: { fillW: 4, casingW: 2 } }, COUNTRYSIDE_MIN_KM2: 0.35,
  Worker: class { postMessage() {} terminate() {} }, Blob: class { constructor(parts) { this.parts = parts; } },
  URL: { createObjectURL: () => 'blob:fake' }, setTimeout, console,
});
vm.runInContext(source + '\n;globalThis.__X2 = EngineV2;', context);
const X2 = context.__X2;

const cache = join(os.tmpdir(), 'mapexport-clipper-6.4.2.min.js');
let clipperSrc = null;
if (existsSync(cache) && statSync(cache).size > 50000) clipperSrc = readFileSync(cache, 'utf8');
else {
  try {
    const response = await fetch('https://cdn.jsdelivr.net/npm/clipper-lib@6.4.2/clipper.min.js');
    const text = await response.text();
    if (text.length > 50000) { writeFileSync(cache, text); clipperSrc = text; }
  } catch { /* offline */ }
}
if (!clipperSrc) {
  console.log('SKIP — ClipperLib unavailable (no cache, offline).');
  process.exit(0);
}

function run(data) {
  let result = null;
  const worker = { console, navigator: { userAgent: 'chrome', appName: 'Netscape' } };
  worker.self = worker; worker.window = worker; worker.globalThis = worker;
  worker.postMessage = msg => { if (msg?.type === 'done') result = msg; };
  worker.importScripts = () => vm.runInContext(clipperSrc, worker);
  vm.createContext(worker);
  vm.runInContext(X2.FACE_WORKER_SRC, worker);
  worker.onmessage({ data: { ...data, benchmark: true } });
  return result;
}

const ring = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const base = {
  cutterLines: [{ halfW: 5, pts: [[500, 0], [500, 1000]] }],
  buildingCenters: [[150, 150, 500], [760, 250, 500], [790, 250, 500]],
  clusterRings: [ring(140, 140, 160, 160), ring(750, 240, 770, 260), ring(780, 240, 800, 260)],
  placeNodes: [{ x: 775, y: 250, tier: 'settlement', name: 'Reference hamlet' }],
  // The right road-bounded face is countryside; the left is deliberately not.
  openLandPolys: [ring(510, 0, 1000, 600)],
  landcoverPolys: [ring(510, 0, 1000, 600), ring(30, 700, 450, 950)],
  greenPolys: [ring(515, 610, 700, 800)],
  waterPolys: [ring(720, 650, 900, 850)],
  urbanPolys: [ring(20, 20, 480, 100)], recreationPolys: [], waterwayLines: [],
  W: 1000, H: 1000, bigFacePx2: 100000, mPerPx: 1,
  landcoverElements: [],
};

let failures = 0;
const check = (label, pass) => { console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}`); if (!pass) failures++; };
const comparable = value => JSON.stringify({ blocks: value.blocks, culledLandcover: value.culledLandcover, greenGroundMerges: value.greenGroundMerges });

const reference = run({ ...base, runtimeOptimizations: false });
const optimized = run(base);
check('countryside + spatial optimized result exactly matches reference', comparable(optimized) === comparable(reference));
check('benchmark records every requested phase', ['faceConstruction', 'countrysidePreclassification', 'hamletMorphology', 'classificationIntersections', 'totalWorker'].every(key => Number.isFinite(optimized.timings?.[key])));
check('rural fixture performs hamlet morphology', optimized.timings?.hamletMorphologySkipped === false);

// No qualifying countryside faces: the city-only fast path must leave the
// costly morphology untouched, even with many building cluster input rings.
const urbanOnly = { ...base, bigFacePx2: Infinity, placeNodes: [] };
const urbanReference = run({ ...urbanOnly, runtimeOptimizations: false });
const urbanOptimized = run(urbanOnly);
check('urban-only optimized result exactly matches reference', comparable(urbanOptimized) === comparable(urbanReference));
check('urban-only fast path skips hamlet morphology', urbanOptimized.timings?.hamletMorphologySkipped === true);

console.log('optimized timings (ms):', optimized.timings);
if (failures) process.exit(1);
console.log('PASS — v2 face runtime: exact reference parity + benchmark phases');
