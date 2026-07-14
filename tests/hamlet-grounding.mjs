// Offline check of engine-v2's hamlet grounding (no network, no DOM).
// A morphological cluster blob only paints as a hamlet when OSM attests a
// nearby rural settlement via a place node: a settlement-tier node
// (place=hamlet/isolated_dwelling/farm/village) within
// HAMLET_GROUND_SETTLEMENT_M, or a locality-tier node (place=locality) within
// the tighter HAMLET_GROUND_LOCALITY_M. This guards the pure predicate
// (point-to-polygon distance + tier radii) that the face worker applies; real
// three-city acceptance (Bremerhaven/Oulu 0 hamlets, Nievre 59 named) is the
// tests/real-export.mjs sweep.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(repoRoot, 'engine-v2.js'), 'utf8');

// engine-v2.js only needs these v1 globals at IIFE-evaluation time; the
// grounding functions themselves are pure geometry.
const mkLayer = (id) => ({ id, label: id, type: id, overpassQuery: () => '' });
const context = vm.createContext({
  LAYER_REGISTRY: [{ group: 'stub', layers: ['roads', 'rail', 'tram', 'metro', 'water_bodies', 'waterways', 'parks', 'landcover', 'transit_stops', 'water_labels', 'street_labels'].map(mkLayer) }],
  BLOCK_BUILDINGS_LAYER: mkLayer('buildings'),
  parksNamedGate: () => false,
  isSquareTagged: () => false,
  console,
});
vm.runInContext(src + '\n;globalThis.__X2 = EngineV2;', context);
const X2 = context.__X2;

const SETTLEMENT_R = X2.HAMLET_GROUND_SETTLEMENT_M; // 1000
const LOCALITY_R = X2.HAMLET_GROUND_LOCALITY_M;     // 300

let failures = 0;
const check = (name, cond) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`);
  if (!cond) failures++;
};

// A 1000×1000 blob with its left edge on x=0. A point at (-d, 500) sits d px
// to the left of that edge (nearest edge), so its boundary distance is exactly
// d — a clean knob for the tier radii. mPerPx is 1 here, so px == ground m.
const blob = [[0, 0], [1000, 0], [1000, 1000], [0, 1000]];
const ground = (nodes) => X2.groundHamletContour(blob, nodes, SETTLEMENT_R, LOCALITY_R);
const node = (x, tier, name) => ({ x, y: 500, tier, name });

// Point-to-polygon distance: inside → 0, else nearest-edge distance.
check('distance is 0 for a point inside the blob', X2.pointToPolygonDistancePx(500, 500, blob) === 0);
check('distance equals the gap to the nearest edge', Math.round(X2.pointToPolygonDistancePx(-999, 500, blob)) === 999);

// A node inside the blob grounds it (distance 0).
check('settlement node inside the blob grounds it', ground([node(500, 'settlement', 'Inside')])?.name === 'Inside');

// Settlement tier: 1000 m radius. 999 grounds, 1001 does not.
check('settlement node at 999 m grounds the blob', !!ground([node(-999, 'settlement', 'Near')]));
check('settlement node at 1001 m does NOT ground the blob', ground([node(-1001, 'settlement', 'Far')]) === null);

// Locality tier: tighter 300 m radius. 299 grounds, 301 does not — and a
// locality at 999 m (inside the settlement radius) is still rejected.
check('locality node at 299 m grounds the blob', !!ground([node(-299, 'locality', 'LocNear')]));
check('locality node at 301 m does NOT ground the blob', ground([node(-301, 'locality', 'LocFar')]) === null);
check('locality node at 999 m does NOT ground the blob', ground([node(-999, 'locality', 'LocWay')]) === null);

// No qualifying nodes → not grounded (a pure-city frame).
check('no place nodes → not grounded', ground([]) === null);

// Nearest in-range node wins the name: a locality at 299 m beats a settlement
// at 999 m, so the emitted hamlet takes its closest attesting name.
check('nearest in-range node supplies the name', ground([
  node(-999, 'settlement', 'FarVillage'),
  node(-299, 'locality', 'CloseLieuDit'),
])?.name === 'CloseLieuDit');

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('PASS — hamlet grounding: tier radii, point-to-polygon distance, nearest-name');
