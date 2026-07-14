// Offline guard for engine-v2's coverage promise on a frame with no
// block-cutting roads (ENGINE-V2.md §1). computeFacesAsync used to early-return
// { blocks: [] } whenever prepareFaceData produced no cutterLines, so an
// open-countryside / paths-only / tunnels-only bbox got no face at all and the
// page showed through. The fix removes that short-circuit and lets the frame
// run the normal Clipper route (frame rectangle minus an empty void → one
// full-frame face → classification → countryside / cream / fallback).
//
// The face-cutting geometry itself is ClipperLib in a Web Worker and is the
// real-export sweep's job. This test guards the two things that are pure and
// offline:
//   A. prepareFaceData yields zero cutterLines for exactly the cutterless cases
//      (no roads, paths only, tunnels only) and non-zero for a real road.
//   B. computeFacesAsync no longer short-circuits: for a cutterless frame it
//      constructs the worker and posts the (empty-cutter) data through, rather
//      than resolving { blocks: [] } without ever running the worker.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(repoRoot, 'engine-v2.js'), 'utf8');

// A fake Web Worker that never runs FACE_WORKER_SRC (no ClipperLib offline). It
// only mimics the message protocol computeFacesAsync speaks: record the posted
// data, then fire a 'done' carrying a sentinel block. If the early return came
// back, the worker would never be constructed and this sentinel never surfaces.
let workerConstructed = false;
let postedData = null;
const SENTINEL_BLOCKS = [{ kind: 'fallback', outer: 'M0,0L10,0L10,10Z', holes: [], areaPx: 100 }];
class FakeWorker {
  constructor() { workerConstructed = true; this.onmessage = null; this.onerror = null; }
  postMessage(data) {
    postedData = data;
    setTimeout(() => this.onmessage && this.onmessage({ data: { type: 'done', blocks: SENTINEL_BLOCKS } }), 0);
  }
  terminate() {}
}

// engine-v2.js is a browser IIFE; stub the v1 globals prepareFaceData reaches
// for. The identity simplify/merge stubs keep the geometry trivial — this test
// counts cutterLines, it does not validate their shape.
const mkLayer = (id) => ({ id, label: id, type: id, overpassQuery: () => '' });
const context = vm.createContext({
  LAYER_REGISTRY: [{ group: 'stub', layers: ['roads', 'rail', 'tram', 'metro', 'water_bodies', 'waterways', 'parks', 'landcover', 'transit_stops', 'water_labels', 'street_labels'].map(mkLayer) }],
  BLOCK_BUILDINGS_LAYER: mkLayer('buildings'),
  parksNamedGate: () => false,
  isSquareTagged: () => false,
  // v1 helpers prepareFaceData calls (defined in script.js in production).
  getScaleFactor: () => 1,
  getEps: () => 1,
  getLineEps: () => 1,
  getAreaLargeEps: () => 1,
  dpSimplify: (pts) => pts,
  mergeNamedWays: (els) => els,
  prepareClusterData: () => [],
  ROAD_WIDTHS: { _default: { fillW: 4, casingW: 2 }, primary: { fillW: 8, casingW: 4 } },
  COUNTRYSIDE_MIN_KM2: 0.35,
  // Worker plumbing for computeFacesAsync.
  Worker: FakeWorker,
  Blob: class { constructor(parts) { this.parts = parts; } },
  URL: { createObjectURL: () => 'blob:fake' },
  setTimeout,
  console,
});
vm.runInContext(src + '\n;globalThis.__X2 = EngineV2;', context);
const X2 = context.__X2;

let failures = 0;
const check = (name, cond) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`);
  if (!cond) failures++;
};

// A simple linear projection (lat/lon → px); scale keeps a road long enough to
// survive as a cutter line but the exact values do not matter here.
const pr = (lat, lon) => [(lon - 4) * 1000, (51 - lat) * 1000];
const bbox = { south: 50, north: 51, west: 4, east: 5 };
const W = 1000, H = 1000;
const way = (tags, geometry) => ({ type: 'way', id: Math.random(), tags, geometry });
const roadsResult = (elements) => [{ layer: { type: 'roads' }, data: { elements } }];

// A drivable road running across the frame (two nodes, ≥2 px apart).
const line = [{ lat: 50.5, lon: 4.2 }, { lat: 50.5, lon: 4.8 }];

const cutterLines = (cutterResults) =>
  X2.prepareFaceData(cutterResults, [], null, pr, W, H, bbox, []).cutterLines.length;

// ── Part A: prepareFaceData → cutterLines for the cutterless cases ──────────
check('no roads at all → zero cutter lines', cutterLines([]) === 0);
check('paths only (footway) → zero cutter lines',
  cutterLines(roadsResult([way({ highway: 'footway' }, line)])) === 0);
check('paths only (cycleway/path/steps) → zero cutter lines',
  cutterLines(roadsResult([
    way({ highway: 'cycleway' }, line),
    way({ highway: 'path' }, line),
    way({ highway: 'steps' }, line),
  ])) === 0);
check('tunnels only (tunnel road) → zero cutter lines',
  cutterLines(roadsResult([way({ highway: 'primary', tunnel: 'yes' }, line)])) === 0);
// Control: a surface primary road DOES cut, so the guard is specific to the
// cutterless cases, not "always zero".
check('a surface primary road → at least one cutter line',
  cutterLines(roadsResult([way({ highway: 'primary' }, line)])) >= 1);

// ── Part B: computeFacesAsync no longer short-circuits on empty cutters ──────
workerConstructed = false;
postedData = null;
const result = await X2.computeFacesAsync([], [], null, pr, W, H, null, { bbox, placeNodeElements: [] });
check('cutterless frame constructs the worker (no early { blocks: [] })', workerConstructed === true);
check('cutterless frame posts empty-cutter data to the worker',
  postedData !== null && postedData.cutterLines.length === 0);
check('cutterless frame resolves with the worker output, not a short-circuit []',
  result.blocks === SENTINEL_BLOCKS);

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('PASS — v2 cutterless coverage: no early empty return; frame reaches the face worker');
