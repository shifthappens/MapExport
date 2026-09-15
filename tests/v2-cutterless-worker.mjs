// Real-worker proof for engine-v2's coverage promise on a cutterless frame
// (ENGINE-V2.md §1, roadmap ME-03). v2-cutterless-coverage.mjs proves the
// ORCHESTRATION no longer short-circuits, but it runs a FAKE worker returning a
// sentinel block, so it never proves the REAL ClipperLib worker actually turns
// empty cutters into a full-frame coverage face. This test closes that gap: it
// runs the real FACE_WORKER_SRC on a genuinely empty frame (no cutters, no
// buildings, no area features) and asserts one full-frame fallback face that
// covers essentially the whole bbox — the ME-03 acceptance criteria "één geldig
// face" + "onbeschilderd land wordt fallback_blocks".
//
// Uses the pinned local ClipperLib fixture so this is always offline and fails
// loudly if a required test dependency is absent.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { clipperSrc, runFaceWorker } from './face-worker-helper.mjs';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(repoRoot, 'engine-v2.js'), 'utf8');

// ── load engine-v2 in a vm with the v1 globals prepareFaceData reaches for
//    (identical stub set to v2-cutterless-coverage.mjs) ──
const mkLayer = (id) => ({ id, label: id, type: id, overpassQuery: () => '' });
const context = vm.createContext({
  LAYER_REGISTRY: [{ group: 'stub', layers: ['roads', 'rail', 'tram', 'metro', 'water_bodies', 'waterways', 'parks', 'landcover', 'transit_stops', 'water_labels', 'street_labels'].map(mkLayer) }],
  BLOCK_BUILDINGS_LAYER: mkLayer('buildings'),
  parksNamedGate: () => false,
  isSquareTagged: () => false,
  getScaleFactor: () => 1,
  getEps: () => 1,
  getLineEps: () => 1,
  getAreaLargeEps: () => 1,
  dpSimplify: (pts) => pts,
  mergeNamedWays: (els) => els,
  prepareClusterData: () => [],
  ROAD_WIDTHS: { _default: { fillW: 4, casingW: 2 }, primary: { fillW: 8, casingW: 4 } },
  COUNTRYSIDE_MIN_KM2: 0.35,
  // Harmless worker-plumbing stubs (this test runs FACE_WORKER_SRC itself).
  Worker: class { postMessage() {} terminate() {} },
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

// A 1000×1000 px frame: lon 4→0, lon 5→1000 (x); lat 51→0, lat 50→1000 (y).
const pr = (lat, lon) => [(lon - 4) * 1000, (51 - lat) * 1000];
const bbox = { south: 50, north: 51, west: 4, east: 5 };
const W = 1000, H = 1000;
const FRAME_AREA = W * H;

// Genuinely empty cutterless frame: no cutters, no buildings, no area features.
const data = X2.prepareFaceData([], [], null, pr, W, H, bbox, []);
check('empty-cutter payload carries zero cutter lines', data.cutterLines.length === 0);

const { blocks } = runFaceWorker(X2.FACE_WORKER_SRC, data);

check('empty-cutter frame yields at least one real face (not [])', blocks.length >= 1);
const totalArea = blocks.reduce((s, b) => s + (b.areaPx || 0), 0);
check(`the face(s) cover essentially the whole frame (${Math.round(totalArea)}/${FRAME_AREA} px²)`,
  totalArea >= 0.99 * FRAME_AREA);
check('unpainted land in the frame is a fallback block',
  blocks.some(b => b.kind === 'fallback'));

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('PASS — v2 cutterless coverage (real worker): empty cutters → full-frame fallback face');
