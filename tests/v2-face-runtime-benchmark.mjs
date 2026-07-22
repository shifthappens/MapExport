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
  // The x=50 road carves a thin buildingless strip off the left face's west
  // edge: too small to be countryside-eligible (45,000 px² < bigFacePx2), and
  // its own landcover signal (65% of its height, below) clears
  // GREEN_OPEN_MIN_SHARE, so it is a green-open piece purely on landcover
  // share -- exercising the PERF-04 mergeGreenRemainder spatial index (the
  // rest of the fixture exercises PERF-01/02/03 unchanged).
  cutterLines: [{ halfW: 5, pts: [[500, 0], [500, 1000]] }, { halfW: 5, pts: [[50, 0], [50, 1000]] }],
  buildingCenters: [[150, 150, 500], [760, 250, 500], [790, 250, 500]],
  clusterRings: [ring(140, 140, 160, 160), ring(750, 240, 770, 260), ring(780, 240, 800, 260)],
  placeNodes: [{ x: 775, y: 250, tier: 'settlement', name: 'Reference hamlet' }],
  // The right road-bounded face is countryside; the left is deliberately not.
  openLandPolys: [ring(510, 0, 1000, 600)],
  // ring(0,0,45,650) covers 65% of the west strip's height (signal only --
  // fallbackVoid subtracts it, so mergeGreenRemainder's remainder is exactly
  // the uncovered y:650-1000 gap, the classic "abutting polygons with an
  // unmapped verge" case the merge exists for).
  landcoverPolys: [ring(510, 0, 1000, 600), ring(30, 700, 450, 950), ring(0, 0, 45, 650)],
  greenPolys: [ring(515, 610, 700, 800)],
  waterPolys: [ring(720, 650, 900, 850)],
  urbanPolys: [ring(20, 20, 480, 100)], recreationPolys: [], waterwayLines: [],
  W: 1000, H: 1000, bigFacePx2: 100000, mPerPx: 1,
  // Exercises the PERF-03 occlusion-cull spatial index: [0] sits fully inside
  // the left urban block (culled), [1] is isolated far from every covering
  // region (culled index has zero candidates), [2] straddles the green
  // rect's edge (partial coverage, not culled) and [3] sits fully inside the
  // green rect (culled). [4] sits in the west strip's uncovered remainder gap
  // and is the PERF-04 mergeGreenRemainder candidate (grown, never culled).
  // [5] is isolated like [1] (zero covering candidates) but its own area
  // (0.25px²) is below the ~1px² EMPTY cull floor -- the reference route
  // culls it regardless of coverage, so the zero-candidate fast path must
  // check the element's own area instead of assuming "no candidates = keep".
  landcoverElements: [
    { index: 0, rings: [ring(100, 400, 200, 500)] },
    { index: 1, rings: [ring(950, 950, 990, 990)] },
    { index: 2, rings: [ring(680, 600, 720, 650)] },
    { index: 3, rings: [ring(550, 650, 650, 750)] },
    { index: 4, rings: [ring(5, 660, 40, 990)] },
    { index: 5, rings: [ring(850, 50, 850.5, 50.5)] },
  ],
};

let failures = 0;
const check = (label, pass) => { console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}`); if (!pass) failures++; };
const comparable = value => JSON.stringify({ blocks: value.blocks, culledLandcover: value.culledLandcover, greenGroundMerges: value.greenGroundMerges });

const reference = run({ ...base, runtimeOptimizations: false });
const optimized = run(base);
check('countryside + spatial optimized result exactly matches reference', comparable(optimized) === comparable(reference));
check('benchmark records every requested phase', ['faceConstruction', 'countrysidePreclassification', 'hamletMorphology', 'classificationSignal', 'classificationSubtract', 'classificationGreenMerge', 'classificationBuildings', 'classificationIntersections', 'occlusionCoverBuild', 'occlusionElementDifferences', 'totalWorker'].every(key => Number.isFinite(optimized.timings?.[key])));
check('rural fixture performs hamlet morphology', optimized.timings?.hamletMorphologySkipped === false);
check('occlusion cull culls fully-covered elements but keeps exposed/isolated ones', optimized.culledLandcover.length > 0 && optimized.culledLandcover.length < base.landcoverElements.length);
check('west-strip remainder merges into element 4 via the PERF-04 spatial index', optimized.greenGroundMerges.some(m => m.index === 4) && !optimized.culledLandcover.includes(4));
check('isolated element 1 (1600px², zero candidates) is kept, not culled', !optimized.culledLandcover.includes(1));
check('isolated sub-1px² element 5 (zero candidates) is still culled, matching the reference route', optimized.culledLandcover.includes(5));

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
