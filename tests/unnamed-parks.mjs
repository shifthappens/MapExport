// Offline regression guard for AF-07d: an explicit leisure=park is a park,
// with or without a name (ENGINE-V2.md §3, AREA_FEATURES 'green' row).
//
// The bug: v2 classified a NAMELESS leisure=park into the 'grass' display
// category. Grass paints a green tint but subtracts from no block void, so the
// city block painted over it, and since AF-07c the occlusion clip removed the
// hidden remainder outright. The unnamed park at Piushaven in Tilburg
// (way/138166896, 808 m²) vanished completely.
//
// The contract this test pins down:
//   1. leisure=park classifies 'green' — named, nameless, or access-restricted
//      alike. 'green' is the paint AND subtraction set, so the park cuts the
//      block/fallback void and paints in the Parks & green band.
//   2. Nameless parks stay OUT of the open-land classification signal: they are
//      absent from `greenNamed`, which is the only green set feeding the
//      worker's openLandVoid (via prepareFaceData's openLandGreenPolys). AF-07d
//      changes what is visible, never a face's urban/countryside verdict — the
//      same discipline recreation grounds follow (AF-03b).
//   3. The confetti guard is an area threshold, not a name, access or width
//      filter — and since AF-07f it is measured on the DISSOLVED MASS, not on
//      one polygon. Pieces whose outlines come within GREEN_MASS_BRIDGE_M of
//      each other are one mass; a mass under GREEN_MASS_MIN_M2 is not painted.
//      A separate GREEN_PIECE_MIN_M2 floor drops true confetti before the
//      dissolve, so a line of tree pits cannot chain into a fake park.
//      Named green and recreation grounds are never gated, but they do anchor a
//      mass, so a verge lying against a named park is kept with it.
//      (The real Piushaven park is below the mass threshold on its own; in the
//      cached Tilburg bbox it is glued to neighbouring green and still paints,
//      which is what fixture `piushavenNeighbour` reproduces here.)
//   4. leisure=garden is deliberately NOT widened — a garden is usually a back
//      yard, and the audit asked for parks.
//   5. Nameless forest/grass/scrub is still NOT a park: whatever the mass gate
//      decides, those tags keep their own categories ('landcover' for
//      forest/wood, 'grass' for grass/scrub) and never become 'green'. Tilburg's
//      Cobbenhagen campus is exactly that shape (54 forest ways, 953 grass, 173
//      scrub, no name, no leisure=park in the cached bbox); AF-07f lets its
//      pieces survive as one mass, it does not promote them to parks.
//
// Fixtures are real cached OSM geometry (Tilburg 51.545,5.07,51.562,5.10 and the
// campus bboxes) inlined so the test runs with no network and no cache.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const engineSrc = readFileSync(join(repoRoot, 'engine-v2.js'), 'utf8');

let failures = 0;
const check = (name, cond) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`);
  if (!cond) failures++;
};

// Light vm sandbox for the pure classify/bucket path, same pattern as
// tests/area-binding.mjs. parksNamedGate is the real v1 logic (mirrored), not a
// stub: the whole point here is which elements the named gate does and does not
// claim, so a stub-false would make every assertion vacuous.
const mkLayer = (id) => ({ id, label: id, type: id, overpassQuery: () => '' });
const context = vm.createContext({
  LAYER_REGISTRY: [{ group: 'stub', layers: ['roads', 'rail', 'tram', 'metro', 'water_bodies', 'waterways', 'parks', 'landcover', 'transit_stops', 'water_labels', 'street_labels'].map(mkLayer) }],
  BLOCK_BUILDINGS_LAYER: mkLayer('buildings'),
  parksNamedGate: (el) => {
    if (el.type === 'node' || !el.tags?.name) return false;
    const n = el.tags.name.toLowerCase().trim();
    if (n.length < 4) return false;
    if (/^(green|grass|groen|tuin|garden|garten|jardin|beplanting|planting|plantsoen|hedge|lawn|speeltuin|spielplatz|playground|parking|parkeerplaats|terrain|terrein|veld|field|berm|strip|border|rand|strook|perk|bloem|flower|rozenperk|heg|haag)/.test(n)) return false;
    return /^(park|garden|nature_reserve|recreation_ground)$/.test(el.tags.leisure || '')
      || /^(forest|cemetery|allotments|recreation_ground)$/.test(el.tags.landuse || '')
      || el.tags.natural === 'wood' || el.tags.amenity === 'grave_yard' || el.tags.tourism === 'zoo';
  },
  isSquareTagged: () => false, getScaleFactor: () => 1, getEps: () => 1,
  getLineEps: () => 1, getAreaLargeEps: () => 1, dpSimplify: (points) => points,
  mergeNamedWays: (elements) => elements, prepareClusterData: () => [],
  // Real signed-area test (mirrored from script.js): collectAreaPolys orients
  // every ring with it, and a stub would silently mis-orient the fixtures.
  ringIsPositive: (pts) => {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
      a += x1 * y2 - x2 * y1;
    }
    return a > 0;
  },
  ROAD_WIDTHS: { _default: { fillW: 4, casingW: 2 } }, COUNTRYSIDE_MIN_KM2: 0.35,
  Worker: class { postMessage() {} terminate() {} },
  Blob: class {}, URL: { createObjectURL: () => 'blob:fake' }, setTimeout, console,
});
vm.runInContext(engineSrc + '\n;globalThis.__X2 = EngineV2;', context);
const X2 = context.__X2;

// ── fixtures ───────────────────────────────────────────────────────
// The real Piushaven ring: way/138166896, leisure=park with no name, 808 m².
const PIUSHAVEN_RING = [
  [51.5501305, 5.0899577], [51.550425, 5.0896523], [51.5505125, 5.0899437],
  [51.5503549, 5.0900546], [51.550445, 5.090355], [51.5506034, 5.0902499],
  [51.5506353, 5.090372], [51.5505273, 5.0904311], [51.5504405, 5.0903879],
  [51.5503072, 5.0899652], [51.5502432, 5.0900226], [51.5501736, 5.0900874],
  [51.5501305, 5.0899577],
];
const way = (id, tags, ring) => ({
  type: 'way', id, tags,
  geometry: ring.map(([lat, lon]) => ({ lat, lon })),
});
// A square ring of the given side in metres, anchored near the Piushaven, used
// for the size cases. 1e-5° latitude ≈ 1.11 m; longitude is shortened by
// cos(51.55°) ≈ 0.622.
const square = (sideM, lat = 51.552, lon = 5.09) => {
  const dLat = sideM / 111320;
  const dLon = sideM / (111320 * Math.cos(lat * Math.PI / 180));
  return [[lat, lon], [lat + dLat, lon], [lat + dLat, lon + dLon], [lat, lon + dLon], [lat, lon]];
};

const piushaven = way(138166896, { leisure: 'park' }, PIUSHAVEN_RING);
// The green the Piushaven park sits against. 2025 m², so neither it nor the
// 808 m² park clears GREEN_MASS_MIN_M2 alone — only the two dissolved together
// do. Its south edge is ~0.5 m from the park's north edge, inside the bridge.
const piushavenNeighbour = way(1008, { landuse: 'grass' }, square(45, 51.55064, 5.0899));
const namedPark = way(1001, { leisure: 'park', name: 'Wilhelminapark' }, square(120));
const privatePark = way(1002, { leisure: 'park', access: 'private' }, square(90));
const tinyPark = way(1003, { leisure: 'park' }, square(6));            // 36 m², under the piece floor
const namelessGarden = way(1004, { leisure: 'garden' }, square(30));
// A nameless park on its own in the middle of nowhere: 900 m², over the piece
// floor but under the mass threshold, nothing within the bridge distance.
const lonePark = way(1009, { leisure: 'park' }, square(30, 51.540, 5.20));
// Cobbenhagen-shaped campus green: nameless forest/grass/scrub in the tag mix
// the cached campus bboxes actually contain, split the way footways split it
// there. The grass (3600 m²) clears the threshold; the scrub (1600 m²) only
// survives because it lies ~0.1 m from the grass and dissolves into it.
const campusForest = way(1005, { landuse: 'forest', source: '3dShapes' }, square(130, 51.556, 5.05));
const campusGrass = way(1006, { landuse: 'grass' }, square(60, 51.5572, 5.05));
const campusScrub = way(1007, { natural: 'scrub' }, square(40, 51.55774, 5.05));
// The same scrub patch with nothing near it stays confetti.
const loneScrub = way(1010, { natural: 'scrub' }, square(40, 51.542, 5.22));

const c = X2.classifyAreaFeatures([
  piushaven, piushavenNeighbour, namedPark, privatePark, tinyPark, namelessGarden,
  lonePark, campusForest, campusGrass, campusScrub, loneScrub,
]);
const ids = (bucket) => (c[bucket] || []).map((el) => el.id);

// ── 1. leisure=park is green, named or not ─────────────────────────
check('the nameless Piushaven park classifies green (it used to be grass)',
  ids('green').includes(138166896));
check('it is NOT in the grass bucket any more', !ids('grass').includes(138166896));
check('a named park still classifies green', ids('green').includes(1001));
check('an access=private park classifies green too (no access filter)',
  ids('green').includes(1002));

// ── 2. nameless parks stay out of the open-land signal ─────────────
check('greenNamed holds the named park', ids('greenNamed').includes(1001));
check('greenNamed excludes the nameless Piushaven park',
  !ids('greenNamed').includes(138166896));
check('greenNamed excludes the access=private nameless park',
  !ids('greenNamed').includes(1002));
check('greenNamed is a subset of green',
  ids('greenNamed').every((id) => ids('green').includes(id)));

// ── 3. the confetti guard is an area threshold on the MASS ─────────
check('a 36 m² nameless park is decluttered away (not green)', !ids('green').includes(1003));
check('...and does not leak into grass or labelOnly either',
  !ids('grass').includes(1003) && !ids('labelOnly').includes(1003));
check('the 808 m² Piushaven park paints once dissolved with the green it touches',
  ids('green').includes(138166896));
check('...and so does the 2025 m² neighbour it is dissolved with (neither passes alone)',
  ids('grass').includes(1008));
check('a 900 m² nameless park with nothing near it is dropped (mass under the threshold)',
  !ids('green').includes(1009) && !ids('grass').includes(1009) && !ids('labelOnly').includes(1009));
check('a named park is never gated, whatever its size', ids('green').includes(1001));

// ── 4. gardens are not widened ─────────────────────────────────────
check('a nameless leisure=garden is still grass, not green',
  ids('grass').includes(1004) && !ids('green').includes(1004));

// ── 5. nameless campus green is still not a park ───────────────────
check('nameless forest still classifies landcover (Countryside), not green',
  ids('landcover').includes(1005) && !ids('green').includes(1005));
check('nameless grass still classifies grass, not green',
  ids('grass').includes(1006) && !ids('green').includes(1006));
check('scrub 0.1 m from that grass survives on the dissolved mass, still as grass',
  ids('grass').includes(1007) && !ids('green').includes(1007));
check('the same scrub patch on its own is dropped',
  !ids('grass').includes(1010) && !ids('labelOnly').includes(1010));

// ── 6. Countryside is out of the gate entirely ─────────────────────
// Coen, 2026-07-26: farmland/meadow/forest/wood keep their own rules; a small
// isolated field must not vanish the way a small isolated verge does.
const loneField = way(1011, { landuse: 'farmland' }, square(30, 51.530, 5.30));
const loneWood = way(1012, { natural: 'wood' }, square(20, 51.532, 5.32));
const cs = X2.classifyAreaFeatures([loneField, loneWood]);
check('a 900 m² isolated farmland patch still classifies landcover',
  cs.landcover.some((el) => el.id === 1011));
check('a 400 m² isolated wood patch still classifies landcover',
  cs.landcover.some((el) => el.id === 1012));

// ── the worker payload: which polygons feed which void ─────────────
// prepareFaceData is where the split becomes geometry. greenPolys is the paint/
// subtraction set the block and fallback voids consume; openLandGreenPolys is
// the narrower classification set behind openLandVoid.
const bbox = { south: 51.545, west: 5.07, north: 51.562, east: 5.10 };
const pr = (lat, lon) => [(lon - bbox.west) * 1e5, (bbox.north - lat) * 1e5];
const payload = X2.prepareFaceData([], [], c, pr, 1000, 600, bbox, []);
check('prepareFaceData ships an openLandGreenPolys set', Array.isArray(payload.openLandGreenPolys));
check('greenPolys carries every green element (parks cut the block void)',
  payload.greenPolys.length === c.green.length);
check('openLandGreenPolys carries only the named ones (classification unchanged)',
  payload.openLandGreenPolys.length === c.greenNamed.length
  && payload.openLandGreenPolys.length < payload.greenPolys.length);
// landcoverPolys is the landcover+grass paint set behind landcoverVoid, the
// green-dominance demotion signal ("green that cream would erase"). A park that
// now cuts its own hole and paints above the block erases nothing, so leaving
// that set is correct — it must not be counted twice.
check('landcoverPolys (green-dominance signal) no longer holds the nameless parks',
  payload.landcoverPolys.length === c.landcover.length + c.grass.length);

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — unnamed-parks: ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
