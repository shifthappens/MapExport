// Focused, synthetic worker check for PERF-01 through PERF-05. It runs the retained
// reference path (runtimeOptimizations:false) beside the optimized path and
// requires their serialized result to match exactly where the optimization is
// contractually byte-preserving. PERF-05 deliberately removes invisible
// off-frame landcover, so that fixture compares exact geometry after clipping
// both routes to the visible frame. Timings are evidence only; this deliberately
// has no performance threshold.
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
const ringList = rings => Array.isArray(rings) ? rings : [...(rings?.outer || []), ...(rings?.inner || [])];

// Exact visible-geometry normalizer for PERF-05. The optimized worker may cull
// a path that the retained reference route still returns wholly off-canvas.
// Intersect both with the frame on the same CULL_SCALE integer grid, rotate each
// contour to a deterministic start vertex, and compare the normalized paths.
const geometryVm = { console, navigator: { userAgent: 'chrome', appName: 'Netscape' } };
geometryVm.self = geometryVm; geometryVm.window = geometryVm; geometryVm.globalThis = geometryVm;
vm.createContext(geometryVm);
vm.runInContext(clipperSrc, geometryVm);
const C = geometryVm.ClipperLib;
const VISIBLE_SCALE = 100;
function visibleGeometry(rings, W, H) {
  const subject = ringList(rings).map(r => r.map(p => ({ X: Math.round(p[0] * VISIBLE_SCALE), Y: Math.round(p[1] * VISIBLE_SCALE) })));
  if (!subject.length) return [];
  const clipper = new C.Clipper();
  clipper.AddPaths(subject, C.PolyType.ptSubject, true);
  clipper.AddPath(ring(0, 0, W * VISIBLE_SCALE, H * VISIBLE_SCALE).map(p => ({ X: p[0], Y: p[1] })), C.PolyType.ptClip, true);
  const out = new C.Paths();
  clipper.Execute(C.ClipType.ctIntersection, out, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  return out.map(path => {
    const points = path.map(p => [p.X, p.Y]);
    let start = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i][0] < points[start][0] || (points[i][0] === points[start][0] && points[i][1] < points[start][1])) start = i;
    }
    return points.slice(start).concat(points.slice(0, start));
  }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function visibleLandcover(result, data) {
  return data.landcoverElements.map(element => {
    const merge = result.greenGroundMerges.find(item => item.index === element.index);
    const clipped = result.clippedLandcover.find(item => item.index === element.index);
    const rings = merge ? merge.rings : result.culledLandcover.includes(element.index) ? [] : clipped ? clipped.rings : element.rings;
    return [element.index, visibleGeometry(rings, data.W, data.H)];
  });
}

function pointInRings(rings, x, y) {
  let inside = false;
  for (const path of ringList(rings)) {
    for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
      const a = path[i], b = path[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
  }
  return inside;
}

function pathPoints(d) {
  const values = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
  return Array.from({ length: values.length / 2 }, (_, i) => [values[i * 2], values[i * 2 + 1]]);
}

function canonicalRing(points) {
  const variants = [];
  for (const path of [points, [...points].reverse()]) {
    for (let i = 0; i < path.length; i++) variants.push(JSON.stringify(path.slice(i).concat(path.slice(0, i))));
  }
  return variants.sort()[0];
}

function visibleBlocks(result) {
  return result.blocks.map(block => ({
    kind: block.kind,
    name: block.name || '',
    outer: canonicalRing(pathPoints(block.outer)),
    holes: block.holes.map(d => canonicalRing(pathPoints(d))).sort(),
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

const base = {
  // The x=50 road carves a thin buildingless strip off the left face's west
  // edge: too small to be countryside-eligible (45,000 px² < bigFacePx2), and
  // its own landcover signal (65% of its height, below) clears
  // GREEN_OPEN_MIN_SHARE, so it is a green-open piece purely on landcover
  // share -- exercising the PERF-04 mergeGreenRemainder spatial index (the
  // rest of the fixture exercises PERF-01/02/03 unchanged).
  cutterLines: [{ halfW: 5, pts: [[500, 0], [500, 1000]] }, { halfW: 5, pts: [[50, 0], [50, 1000]] }],
  buildingCenters: [[150, 150, 500], [760, 250, 500], [790, 250, 500]],
  // The two right-side rings are inside the countryside face. The x=475 ring
  // is just outside that face but inside PERF-05's conservative 30 px reach;
  // x=470..474 is 31 px away and can no longer influence it; x=140 is a far
  // city ring. Only the first three relevant rings should reach morphology.
  clusterRings: [
    ring(140, 140, 160, 160),
    ring(475, 100, 480, 105),
    ring(470, 120, 474, 124),
    ring(750, 240, 770, 260),
    ring(780, 240, 800, 260),
  ],
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
  // [6] is isolated and two-ringed, overlapping by 0.1 on x: each ring is
  // 0.8x0.9=0.72px² (naive sum 1.44px², >= EMPTY) but the true Clipper union
  // is 0.9x0.9=0.81px² (< EMPTY) -- a naive area-sum shortcut would wrongly
  // keep it (1.44 >= EMPTY) where exact NonZero normalization culls it
  // (0.81 < EMPTY); this is the double-counting case a real merged/multi-ring
  // landcover element (e.g. after mergeGreenRemainder growth) could hit.
  landcoverElements: [
    { index: 0, rings: [ring(100, 400, 200, 500)] },
    { index: 1, rings: [ring(950, 950, 990, 990)] },
    { index: 2, rings: [ring(680, 600, 720, 650)] },
    { index: 3, rings: [ring(550, 650, 650, 750)] },
    { index: 4, rings: [ring(5, 660, 40, 990)] },
    { index: 5, rings: [ring(850, 50, 850.5, 50.5)] },
    { index: 6, rings: [ring(600, 50, 600.8, 50.9), ring(600.1, 50, 600.9, 50.9)] },
  ],
};

let failures = 0;
const check = (label, pass) => { console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}`); if (!pass) failures++; };
const comparable = value => JSON.stringify({
  blocks: value.blocks,
  culledLandcover: value.culledLandcover,
  clippedLandcover: value.clippedLandcover,
  greenGroundMerges: value.greenGroundMerges,
});

const reference = run({ ...base, runtimeOptimizations: false });
const optimized = run(base);
check('countryside + spatial optimized result exactly matches reference', comparable(optimized) === comparable(reference));
check('benchmark records every requested phase', ['faceConstruction', 'countrysidePreclassification', 'hamletMorphology', 'classificationSignal', 'classificationSubtract', 'classificationGreenMerge', 'classificationBuildings', 'classificationIntersections', 'occlusionCoverBuild', 'occlusionElementDifferences', 'totalWorker'].every(key => Number.isFinite(optimized.timings?.[key])));
check('rural fixture performs hamlet morphology', optimized.timings?.hamletMorphologySkipped === false);
check('PERF-05 retains both countryside rings and the ring just inside conservative reach', optimized.timings?.hamletRingsRetained === 3);
check('PERF-05 excludes the ring just outside conservative reach and the far city ring', reference.timings?.hamletRingsRetained === 5 && optimized.timings?.hamletRingsRetained === 3);
check('the retained countryside rings still emit the grounded reference hamlet', optimized.blocks.some(block => block.kind === 'hamlet' && block.name === 'Reference hamlet'));
check('occlusion cull culls fully-covered elements but keeps exposed/isolated ones', optimized.culledLandcover.length > 0 && optimized.culledLandcover.length < base.landcoverElements.length);
check('west-strip remainder merges into element 4 via the PERF-04 spatial index', optimized.greenGroundMerges.some(m => m.index === 4) && !optimized.culledLandcover.includes(4));
check('isolated element 1 (1600px², zero candidates) is kept, not culled', !optimized.culledLandcover.includes(1));
check('isolated sub-1px² element 5 (zero candidates) is still culled, matching the reference route', optimized.culledLandcover.includes(5));
check('isolated overlapping-rings element 6 (naive sum >= EMPTY, true union < EMPTY) is culled via exact normalization, not naive area sum', optimized.culledLandcover.includes(6));

// No qualifying countryside faces: the city-only fast path must leave the
// costly morphology untouched, even with many building cluster input rings.
const urbanOnly = { ...base, bigFacePx2: Infinity, placeNodes: [] };
const urbanReference = run({ ...urbanOnly, runtimeOptimizations: false });
const urbanOptimized = run(urbanOnly);
check('urban-only optimized result exactly matches reference', comparable(urbanOptimized) === comparable(urbanReference));
check('urban-only fast path skips hamlet morphology', urbanOptimized.timings?.hamletMorphologySkipped === true);

// PERF-05 frame clipping: a large water relation crosses the frame but carries
// most of its geometry off-canvas. Its reversed inner ring is an island hole.
// Blocks and visible landcover must remain identical to the full-geometry
// reference route, including the island; only invisible geometry may disappear.
const leftTop = Array.from({ length: 40 }, (_, i) => [-5000 + i * 125, 180 + (i % 2) * 10]);
const rightTop = Array.from({ length: 40 }, (_, i) => [1125 + i * 125, 180 + (i % 2) * 10]);
const rightBottom = Array.from({ length: 40 }, (_, i) => [6000 - i * 125, 820 + (i % 2) * 10]);
const leftBottom = Array.from({ length: 40 }, (_, i) => [-125 - i * 125, 820 + (i % 2) * 10]);
const largeWaterOuter = [...leftTop, [-1, 200], [1001, 200], ...rightTop, ...rightBottom, [1001, 800], [-1, 800], ...leftBottom];
const frameClipData = {
  cutterLines: [],
  buildingCenters: [[50, 50, 500]],
  clusterRings: [], placeNodes: [], openLandPolys: [], urbanPolys: [], greenPolys: [], recreationPolys: [], waterwayLines: [],
  waterPolys: [largeWaterOuter, ring(400, 400, 600, 600).reverse()],
  // Keep classification signals empty so the fixture isolates void clipping
  // and the later landcover occlusion pass.
  landcoverPolys: [],
  landcoverElements: [
    { index: 0, rings: [ring(100, 100, 900, 900)] },
    { index: 1, rings: [ring(-3000, 20, -2000, 100)] },
  ],
  coverPaints: { blocks: false, water: true, waterways: false, green: false, recreation: false },
  W: 1000, H: 1000, bigFacePx2: Infinity, mPerPx: 1,
};
const frameClipReference = run({ ...frameClipData, runtimeOptimizations: false });
const frameClipOptimized = run(frameClipData);
check('large off-frame water keeps exact in-frame block boundaries and holes', JSON.stringify(visibleBlocks(frameClipOptimized)) === JSON.stringify(visibleBlocks(frameClipReference)));
check('large off-frame cover keeps exact visible in-frame landcover geometry', JSON.stringify(visibleLandcover(frameClipOptimized, frameClipData)) === JSON.stringify(visibleLandcover(frameClipReference, frameClipData)));
const clippedFrameLandcover = frameClipOptimized.clippedLandcover.find(item => item.index === 0)?.rings || [];
check('partly visible landcover is clipped around water but remains visible on dry land and the island',
  ringList(clippedFrameLandcover).length > 0 &&
  pointInRings(clippedFrameLandcover, 200, 150) &&
  !pointInRings(clippedFrameLandcover, 300, 500) &&
  pointInRings(clippedFrameLandcover, 500, 500));
check('PERF-05 actually discards vertices while trimming the large off-frame relation', frameClipOptimized.timings?.frameClipInputVertices > frameClipOptimized.timings?.frameClipOutputVertices);

// When ALL cover is off-frame, its clipped union is empty. The optimized route
// must still inspect landcover elements: a wholly off-frame element paints no
// visible ink and should be culled, while an in-frame uncovered element remains
// raw. This catches the old `if (coveringIndex)` early skip.
const offFrameOnlyData = {
  clipOnly: true,
  cutterLines: [], buildingCenters: [], clusterRings: [], placeNodes: [],
  greenPolys: [], recreationPolys: [], urbanPolys: [], openLandPolys: [], waterwayLines: [],
  waterPolys: [ring(-5000, -5000, -4000, -4000)],
  landcoverPolys: [ring(-3000, 20, -2000, 100), ring(100, 100, 200, 200)],
  landcoverElements: [
    { index: 0, rings: [ring(-3000, 20, -2000, 100)] },
    { index: 1, rings: [ring(100, 100, 200, 200)] },
  ],
  coverPaints: { blocks: false, water: true, waterways: false, green: false, recreation: false },
  W: 1000, H: 1000, bigFacePx2: Infinity, mPerPx: 1,
};
const offFrameOnlyReference = run({ ...offFrameOnlyData, runtimeOptimizations: false });
const offFrameOnlyOptimized = run(offFrameOnlyData);
check('entirely off-frame landcover is culled even when clipped cover is empty', offFrameOnlyOptimized.culledLandcover.includes(0));
check('uncovered in-frame landcover stays raw when clipped cover is empty', !offFrameOnlyOptimized.culledLandcover.includes(1) && !offFrameOnlyOptimized.clippedLandcover.some(item => item.index === 1));
check('off-frame culling changes no visible landcover versus the reference route', JSON.stringify(visibleLandcover(offFrameOnlyOptimized, offFrameOnlyData)) === JSON.stringify(visibleLandcover(offFrameOnlyReference, offFrameOnlyData)));

// A genuinely cover-free export is different from cover that merely clipped
// to empty. Preserve the old no-op exactly, including a visible sub-1px crumb;
// runtime optimization alone must never change in-frame paint.
const noCoverData = {
  ...offFrameOnlyData,
  waterPolys: [],
  landcoverPolys: [ring(100, 100, 100.5, 100.5)],
  landcoverElements: [{ index: 0, rings: [ring(100, 100, 100.5, 100.5)] }],
};
const noCoverReference = run({ ...noCoverData, runtimeOptimizations: false });
const noCoverOptimized = run(noCoverData);
check('no-cover route preserves a visible sub-1px landcover crumb exactly',
  comparable(noCoverOptimized) === comparable(noCoverReference) &&
  !noCoverOptimized.culledLandcover.includes(0));

console.log('optimized timings (ms):', optimized.timings);
if (failures) process.exit(1);
console.log('PASS — v2 face runtime: exact reference parity + benchmark phases');
