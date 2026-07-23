// Real-worker fixtures for the AF-07c landcover occlusion CLIP (ENGINE-V2.md
// §4/§5). The benchmark proves optimized==reference but runs one implementation;
// the editor-structure test only checks SVG nesting with unclipped polygons.
// This test asserts the actual clipped geometry the worker returns:
//   - a partially covered element is clipped to the visible remainder,
//   - a fully covered element is culled,
//   - an uncovered element is left raw,
//   - a waterway stroke clips the wood it crosses (the blue line stays visible),
//   - the covering set follows coverPaints — only PAINTED layers are subtracted,
//     so with City blocks OFF the clip-only pass still keeps Countryside off the
//     water (AF-07c P1), and a layer that is off never clips,
//   - a merged (green-remainder) element is clipped away from a building block
//     it grew over (the Oulu regression: an unclipped merge hid buildings).
//
// Needs ClipperLib (same CDN + os.tmpdir cache as tests/real-export.mjs); SKIPs
// (exit 0) when neither a warm cache nor the network is available.
import { readFileSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import os from 'node:os';
import vm from 'node:vm';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const source = readFileSync(join(repoRoot, 'engine-v2.js'), 'utf8');
const layer = id => ({ id, label: id, type: id, overpassQuery: () => '' });
// engine-v2.js is a browser IIFE; stub the v1 globals it reaches for. Loading is
// parameterised on the Worker class so Part E can drive computeFacesAsync with a
// fake worker while the rest of the file uses the inert stub.
const loadEngine = Worker => {
  const context = vm.createContext({
    LAYER_REGISTRY: [{ group: 'stub', layers: ['roads', 'rail', 'tram', 'metro', 'water_bodies', 'waterways', 'parks', 'landcover', 'transit_stops', 'water_labels', 'street_labels'].map(layer) }],
    BLOCK_BUILDINGS_LAYER: layer('buildings'), parksNamedGate: () => false,
    isSquareTagged: () => false, getScaleFactor: () => 1, getEps: () => 1,
    getLineEps: () => 1, getAreaLargeEps: () => 1, dpSimplify: points => points,
    mergeNamedWays: elements => elements, prepareClusterData: () => [],
    ROAD_WIDTHS: { _default: { fillW: 4, casingW: 2 } }, COUNTRYSIDE_MIN_KM2: 0.35,
    Worker, Blob: class { constructor(parts) { this.parts = parts; } },
    URL: { createObjectURL: () => 'blob:fake' }, setTimeout, console,
  });
  vm.runInContext(source + '\n;globalThis.__X2 = EngineV2;', context);
  return context.__X2;
};
const X2 = loadEngine(class { postMessage() {} terminate() {} });

const cache = join(os.tmpdir(), 'mapexport-clipper-6.4.2.min.js');
let clipperSrc = null;
if (existsSync(cache) && statSync(cache).size > 50000) clipperSrc = readFileSync(cache, 'utf8');
else {
  try {
    const text = await (await fetch('https://cdn.jsdelivr.net/npm/clipper-lib@6.4.2/clipper.min.js')).text();
    if (text.length > 50000) { writeFileSync(cache, text); clipperSrc = text; }
  } catch { /* offline */ }
}
if (!clipperSrc) { console.log('SKIP — ClipperLib unavailable (no cache, offline).'); process.exit(0); }

function run(data) {
  let result = null;
  const worker = { console, navigator: { userAgent: 'chrome', appName: 'Netscape' } };
  worker.self = worker; worker.window = worker; worker.globalThis = worker;
  worker.postMessage = msg => { if (msg?.type === 'done') result = msg; };
  worker.importScripts = () => vm.runInContext(clipperSrc, worker);
  vm.createContext(worker);
  vm.runInContext(X2.FACE_WORKER_SRC, worker);
  worker.onmessage({ data });
  return result;
}

let failures = 0;
const check = (label, pass) => { console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}`); if (!pass) failures++; };

const ring = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
// Even-odd point-in-rings: count edge crossings across ALL subpaths; odd = painted.
const inRings = (rings, x, y) => {
  let inside = false;
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const clippedOf = (out, index) => out.clippedLandcover.find(c => c.index === index);
const mergeOf = (out, index) => out.greenGroundMerges.find(m => m.index === index);

// ── Part A: the clip in isolation via the clip-only pass (City blocks off) ──
// A 1000×1000 frame, coordinates in px. No cutter/buildings/faces — clipOnly
// runs only the occlusion clip against the painted cover.
const baseClipOnly = {
  clipOnly: true,
  cutterLines: [], buildingCenters: [], clusterRings: [], placeNodes: [],
  greenPolys: [], recreationPolys: [], urbanPolys: [], openLandPolys: [],
  W: 1000, H: 1000, bigFacePx2: 100000, mPerPx: 1,
  // [0] partially under water (right half); [1] fully under water; [2] uncovered;
  // [3] crossed by a waterway stroke.
  landcoverElements: [
    { index: 0, rings: [ring(100, 100, 400, 400)] },
    { index: 1, rings: [ring(600, 600, 700, 700)] },
    { index: 2, rings: [ring(100, 700, 200, 800)] },
    { index: 3, rings: [ring(700, 100, 900, 300)] },
  ],
  landcoverPolys: [ring(100, 100, 400, 400), ring(600, 600, 700, 700), ring(100, 700, 200, 800), ring(700, 100, 900, 300)],
  waterPolys: [ring(300, 100, 500, 400), ring(550, 550, 750, 750)],
  waterwayLines: [{ halfW: 6, pts: [[600, 200], [1000, 200]] }],
};

const full = run({ ...baseClipOnly, coverPaints: { blocks: false, water: true, waterways: true, green: true, recreation: true } });
check('clip-only pass returns no blocks (City blocks off)', Array.isArray(full.blocks) && full.blocks.length === 0);

const c0 = clippedOf(full, 0);
check('partially covered element 0 is clipped (not culled, not raw)', !!c0 && !full.culledLandcover.includes(0));
check('element 0: the part under water is removed', c0 && !inRings(c0.rings, 350, 200));
check('element 0: the part not under water is kept', c0 && inRings(c0.rings, 150, 200));

check('fully covered element 1 is culled', full.culledLandcover.includes(1));

check('uncovered element 2 is left raw (neither clipped nor culled)',
  !clippedOf(full, 2) && !full.culledLandcover.includes(2));

const c3 = clippedOf(full, 3);
check('element 3 crossed by a waterway is clipped', !!c3);
check('element 3: the strip under the waterway stroke is removed (blue line shows)', c3 && !inRings(c3.rings, 800, 200));
check('element 3: the wood away from the waterway is kept', c3 && inRings(c3.rings, 800, 130));

// ── Part A2: covering follows coverPaints — an unpainted layer never clips ──
const noWater = run({ ...baseClipOnly, coverPaints: { blocks: false, water: false, waterways: false, green: true, recreation: true } });
check('water OFF: element 0 (only covered by water) is neither clipped nor culled',
  !clippedOf(noWater, 0) && !noWater.culledLandcover.includes(0));
check('water OFF: fully-water-covered element 1 is no longer culled', !noWater.culledLandcover.includes(1));
check('waterways OFF: element 3 is no longer clipped', !clippedOf(noWater, 3));

// ── Part B: a merged (green-remainder) element is clipped off a building ──
// Mirrors the benchmark's west-strip green-open piece: the x=50 road carves a
// thin buildingless strip; landcover covers 65% of its height, so the uncovered
// y:650-1000 gap is the mergeGreenRemainder remainder. A building sits in that
// gap; after AF-07c the grown green must be clipped off it (Oulu regression).
const mergeData = {
  cutterLines: [{ halfW: 5, pts: [[500, 0], [500, 1000]] }, { halfW: 5, pts: [[50, 0], [50, 1000]] }],
  buildingCenters: [[20, 800, 400]],
  // A building footprint in the west strip's remainder gap (y:650-1000).
  clusterRings: [ring(10, 760, 40, 840)],
  placeNodes: [],
  openLandPolys: [ring(510, 0, 1000, 600)],
  landcoverPolys: [ring(510, 0, 1000, 600), ring(0, 0, 45, 650)],
  greenPolys: [], waterPolys: [], urbanPolys: [], recreationPolys: [], waterwayLines: [],
  W: 1000, H: 1000, bigFacePx2: 100000, mPerPx: 1,
  // Element 0 is the west-strip landcover that grows over the remainder gap.
  landcoverElements: [{ index: 0, rings: [ring(5, 660, 40, 990)] }],
};
const merged = run(mergeData);
const m0 = mergeOf(merged, 0);
check('west-strip landcover element 0 is merged (grown over the remainder gap)', !!m0 && m0.rings.length > 0);
check('a standalone building block was emitted in the green-open piece', merged.blocks.some(b => b.kind === 'building'));
check('merged element 0 grew down over the building gap (covers y~700)', m0 && inRings(m0.rings, 20, 700));
check('merged element 0 is CLIPPED off the building footprint (Oulu fix)', m0 && !inRings(m0.rings, 20, 800));

// ── Part C: the export-side glue drops fully-culled elements (AF-07c P1) ──
// The worker returning culledLandcover is only half the fix; the export code
// must actually drop those elements. The clip-only branch once destructured
// clippedLandcover/greenGroundMerges but NOT culledLandcover, so a fully-
// water-covered element still painted. applyLandcoverOcclusion is the one glue
// both doExportV2 and tests/real-export.mjs call — assert it removes culled
// indices while applying clips and merges, so that integration can't regress.
const glueElements = [
  { id: 'a', rings: [ring(0, 0, 10, 10)] },   // 0: partially covered → clipped
  { id: 'b', rings: [ring(0, 0, 10, 10)] },   // 1: fully covered → culled (must vanish)
  { id: 'c', rings: [ring(0, 0, 10, 10)] },   // 2: green-remainder → merged
];
const glued = X2.applyLandcoverOcclusion(glueElements, {
  culledLandcover: [1],
  clippedLandcover: [{ index: 0, rings: [ring(0, 0, 5, 10)] }],
  greenGroundMerges: [{ index: 2, rings: [ring(0, 0, 10, 20)] }],
});
check('glue: fully-covered element is dropped (clip-only cull applied — P1)',
  glued.length === 2 && !glued.some(e => e.id === 'b'));
check('glue: partially-covered element keeps its clipped remainder',
  glued.find(e => e.id === 'a')?._clippedRings?.length > 0);
check('glue: green-remainder element keeps its merged rings',
  glued.find(e => e.id === 'c')?._mergedRings?.length > 0);

// ── Part D: the merged Countryside checkbox is hidden from the v2 UI ──
// AF-07c folds Countryside into the "Parks & green" switch, so its own row must
// not show while v2 is the active engine (and must still show for v1). Drive
// applyMergedCountrysideVisibility with a minimal fake document.
const fakeDoc = v2on => {
  const row = { style: {} };
  const input = { closest: sel => (sel === '.layer-row' ? row : null) };
  const toggle = { checked: v2on };
  return { row, getElementById: id => (id === 'lyr-landcover' ? input : id === 'engine-v2-toggle' ? toggle : null) };
};
const v2Doc = fakeDoc(true); X2.applyMergedCountrysideVisibility(v2Doc);
check('v2 engine active: Countryside row is hidden', v2Doc.row.style.display === 'none');
const v1Doc = fakeDoc(false); X2.applyMergedCountrysideVisibility(v1Doc);
check('v1 engine active: Countryside row stays visible', v1Doc.row.style.display === '');

// ── Part E: orchestration — the worker result reaches the glue intact ──────
// Parts A and C prove the two ends (the worker reports a cull; the helper drops
// it) but neither sees the HAND-OFF between them, which is where the AF-07c P1
// bug actually lived: a field dropped while re-packing the worker's message.
// Drive the real computeFacesAsync with a fake worker that reports a cull and
// assert the cull survives — this fails if anyone re-introduces a hand-listed
// subset in computeFacesAsync's resolve, which Part A/C alone cannot catch.
let posted = null;
const DONE = {
  type: 'done',
  blocks: [],
  culledLandcover: [7],
  clippedLandcover: [{ index: 3, rings: [ring(0, 0, 5, 5)] }],
  greenGroundMerges: [{ index: 4, rings: [ring(0, 0, 6, 6)] }],
};
class FakeWorker {
  constructor() { this.onmessage = null; this.onerror = null; }
  postMessage(data) { posted = data; setTimeout(() => this.onmessage && this.onmessage({ data: DONE }), 0); }
  terminate() {}
}
const O2 = loadEngine(FakeWorker);
const prj = (lat, lon) => [(lon - 4) * 1000, (51 - lat) * 1000];
const orch = await O2.computeFacesAsync([], [], null, prj, 1000, 1000, null, {
  bbox: { south: 50, north: 51, west: 4, east: 5 },
  placeNodeElements: [],
  coverPaints: { blocks: false, water: true, waterways: true, green: true, recreation: true },
  clipOnly: true,
});
check('orchestration: clip-only route asks the worker for a clip-only pass',
  posted && posted.clipOnly === true && posted.coverPaints && posted.coverPaints.blocks === false);
check('orchestration: culledLandcover survives the worker→caller hand-off (P1 seam)',
  Array.isArray(orch.culledLandcover) && orch.culledLandcover[0] === 7);
check('orchestration: clipped + merged survive the hand-off too',
  orch.clippedLandcover?.[0]?.index === 3 && orch.greenGroundMerges?.[0]?.index === 4);
// End-to-end of the two halves: what computeFacesAsync resolved, fed to the glue
// exactly as doExportV2 now feeds it (whole object, no field list), must drop
// the culled element.
const endToEnd = X2.applyLandcoverOcclusion(
  Array.from({ length: 8 }, (_, i) => ({ id: `e${i}`, rings: [ring(0, 0, 10, 10)] })),
  orch,
);
check('orchestration → glue: the culled element is gone from the painted set',
  endToEnd.length === 7 && !endToEnd.some(e => e.id === 'e7'));

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nPASS — landcover-clip: partial/full/none clip, waterway overlap, painted-only covering, merged clip, cull-glue, v2 checkbox hidden');
