// Offline check of engine-v2's coastline→sea closing (no network, no DOM).
// OSM convention: natural=coastline ways carry land on the LEFT of the way
// direction, water on the RIGHT. The sea polygon engine-v2 closes against the
// bbox must therefore land on the right-hand side — this asserts that sign for
// both way directions, chain stitching across split ways, the bbox-corner
// walk, and the inland no-op. Real-city validation (Bremerhaven/Oulu) is the
// M7 acceptance test; this guards the geometry against regressions meanwhile.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(repoRoot, 'engine-v2.js'), 'utf8');

// engine-v2.js only needs these v1 globals at IIFE-evaluation time; the sea
// functions themselves are pure geometry.
const mkLayer = (id) => ({ id, label: id, type: id, overpassQuery: () => '' });
const context = vm.createContext({
  LAYER_REGISTRY: [{ group: 'stub', layers: ['roads', 'rail', 'tram', 'metro', 'water_bodies', 'waterways', 'parks', 'landcover'].map(mkLayer) }],
  BLOCK_BUILDINGS_LAYER: mkLayer('buildings'),
  parksNamedGate: () => false,
  console,
});
vm.runInContext(src + '\n;globalThis.__X2 = EngineV2;', context);
const X2 = context.__X2;

const bbox = { south: 50, north: 51, west: 4, east: 5 };
const inRing = (ring, lat, lon) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lon, yi = ring[i].lat, xj = ring[j].lon, yj = ring[j].lat;
    if (((yi > lat) !== (yj > lat)) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

let failures = 0;
const check = (name, cond) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`);
  if (!cond) failures++;
};

// Case 1: coastline west→east across the middle. Water on the right = SOUTH.
const eastward = [{ type: 'way', id: 1, tags: { natural: 'coastline' }, geometry: [
  { lat: 50.5, lon: 3.9 }, { lat: 50.5, lon: 4.5 }, { lat: 50.5, lon: 5.1 },
] }];
let sea = X2.buildSeaElements(eastward, bbox);
check('eastward coast yields one sea polygon', sea.length === 1);
if (sea.length === 1) {
  check('eastward: south side is sea', inRing(sea[0].geometry, 50.2, 4.5));
  check('eastward: north side is land', !inRing(sea[0].geometry, 50.8, 4.5));
}

// Case 2: same line reversed (east→west). Water on the right = NORTH.
const westward = [{ type: 'way', id: 2, tags: { natural: 'coastline' }, geometry: [
  { lat: 50.5, lon: 5.1 }, { lat: 50.5, lon: 4.5 }, { lat: 50.5, lon: 3.9 },
] }];
sea = X2.buildSeaElements(westward, bbox);
check('westward coast yields one sea polygon', sea.length === 1);
if (sea.length === 1) {
  check('westward: north side is sea', inRing(sea[0].geometry, 50.8, 4.5));
  check('westward: south side is land', !inRing(sea[0].geometry, 50.2, 4.5));
}

// Case 3: two ways that must stitch into one south-then-east coast (an L
// around the SE corner; land NW of it, water in the SE corner).
const legA = { type: 'way', id: 3, tags: { natural: 'coastline' }, geometry: [
  { lat: 49.9, lon: 4.6 }, { lat: 50.3, lon: 4.6 },
] };
const legB = { type: 'way', id: 4, tags: { natural: 'coastline' }, geometry: [
  { lat: 50.3, lon: 4.6 }, { lat: 50.3, lon: 5.1 },
] };
sea = X2.buildSeaElements([legB, legA], bbox);
check('L-coast stitches into one sea polygon', sea.length === 1);
if (sea.length === 1) {
  check('L-coast: SE corner is sea', inRing(sea[0].geometry, 50.1, 4.9));
  check('L-coast: NW side is land', !inRing(sea[0].geometry, 50.7, 4.2));
}

// Case 4: no coastline → strict no-op.
check('no coastline → no sea elements', X2.buildSeaElements([], bbox).length === 0);

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('PASS — sea sign correct for both directions, stitching, corner walk, no-op');
