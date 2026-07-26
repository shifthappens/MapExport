// Offline regression guard for the nameless-green contract (ENGINE-V2.md §3,
// AREA_FEATURES 'green' row). The original bug: v2 put a nameless leisure=park
// in the 'grass' category, which paints a tint but subtracts from no void, so
// the city block painted straight over it and the occlusion clip then removed
// the hidden remainder. Tilburg's Piushaven park vanished entirely.
//
// The contract pinned here:
//   1. leisure=park classifies 'green' whether named, nameless or
//      access-restricted. 'green' is the paint AND subtraction set, so it cuts
//      the block/fallback void and paints in the Parks & green band.
//   2. Nameless parks stay OUT of the open-land signal — absent from
//      `greenNamed`, the only green set feeding openLandVoid. Visibility must
//      never change a face's urban/countryside verdict.
//   3. The confetti guard is an area threshold on the DISSOLVED MASS, never a
//      name, access or width filter. Pieces within GREEN_MASS_BRIDGE_M are one
//      mass; a mass under GREEN_MASS_MIN_M2 is not painted; GREEN_PIECE_MIN_M2
//      drops true confetti before the dissolve so tree pits cannot chain into a
//      fake park. Named green and recreation are never gated but do anchor a
//      mass, so a verge against a named park is kept with it.
//   4. leisure=garden is deliberately not widened — usually a back yard.
//   5. Nameless forest/grass/scrub is still not a park: those tags keep their
//      own categories whatever the mass gate decides. Cobbenhagen is exactly
//      that shape, and the gate lets its pieces survive as one mass without
//      promoting them to parks.
//
// Fixtures are real cached OSM geometry, inlined so the test needs no network.
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
  // Faithful enough for fixtures that already hand over closed rings; the real
  // stitcher lives in script.js and is not what these cases are about.
  stitchMultipolygonRings: (members) => ({
    outer: members.filter((m) => m.role !== 'inner').map((m) => m.geometry),
    inner: members.filter((m) => m.role === 'inner').map((m) => m.geometry),
  }),
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
// A named park of 25 m². The mass gate never sees a named park, so size is
// irrelevant to it — the gate's own fixtures below must not be what proves it.
const tinyNamedPark = way(1013, { leisure: 'park', name: 'Wilhelminapark' }, square(5, 51.536, 5.26));

const c = X2.classifyAreaFeatures([
  piushaven, piushavenNeighbour, namedPark, privatePark, tinyPark, namelessGarden,
  lonePark, campusForest, campusGrass, campusScrub, loneScrub, tinyNamedPark,
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
check('a named park is never gated, whatever its size', ids('green').includes(1013));

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

// ── 7. what "one mass" means geometrically ─────────────────────────
// A rectangle stated in metres east/north of an anchor, so these cases can name
// their distances directly instead of hiding them in degrees.
const rect = (xM, yM, wM, hM, lat, lon) => {
  const dLat = (m) => m / 111320;
  const dLon = (m) => m / (111320 * Math.cos(lat * Math.PI / 180));
  const x0 = lon + dLon(xM), x1 = lon + dLon(xM + wM);
  const y0 = lat + dLat(yM), y1 = lat + dLat(yM + hM);
  return [[y0, x0], [y1, x0], [y1, x1], [y0, x1], [y0, x0]];
};
const gate = (...els) => {
  const r = X2.classifyAreaFeatures(els);
  const painted = new Set([...r.green, ...r.grass].map((el) => el.id));
  return (id) => painted.has(id);
};

// Two 1300 m² strips 5 m apart along their long edges, offset so that the
// nearest pair of VERTICES is 50 m apart. Bridging is measured edge to edge,
// not vertex to vertex, so this is one 2600 m² mass and both strips paint.
const A = 51.500, B = 5.00;
let painted = gate(
  way(2001, { leisure: 'park' }, rect(0, 0, 100, 13, A, B)),
  way(2002, { landuse: 'grass' }, rect(50, 18, 100, 13, A, B)),
);
check('strips 5 m apart bridge even with no vertex facing the gap',
  painted(2001) && painted(2002));
painted = gate(
  way(2003, { leisure: 'park' }, rect(0, 0, 100, 13, A, B)),
  way(2004, { landuse: 'grass' }, rect(50, 22, 100, 13, A, B)),
);
check('...and 9 m apart they stay two masses, so neither paints',
  !painted(2003) && !painted(2004));

// A 400 m² lawn 50 m inside a named park touches nothing, but it stands on the
// park's ground, so it belongs to that mass and is never dropped.
painted = gate(
  way(2005, { leisure: 'park', name: 'Wilhelminapark' }, rect(0, 0, 120, 120, A, B)),
  way(2006, { landuse: 'grass' }, rect(50, 50, 20, 20, A, B)),
);
check('a lawn well inside a named park is kept with it', painted(2006));

// Same park with a courtyard cut out of it. The hole's edge bridges like any
// other edge, but the hole itself is not park: a lawn 3 m from that edge is
// kept, one 20 m into the courtyard is on its own and drops.
const donut = {
  type: 'relation', id: 2007, tags: { leisure: 'park', name: 'Wilhelminapark' },
  members: [
    { role: 'outer', geometry: rect(0, 0, 200, 200, A, B).map(([lat, lon]) => ({ lat, lon })) },
    { role: 'inner', geometry: rect(50, 50, 100, 100, A, B).map(([lat, lon]) => ({ lat, lon })) },
  ],
};
painted = gate(donut, way(2008, { landuse: 'grass' }, rect(53, 53, 20, 20, A, B)));
check('a lawn 3 m from the edge of a park courtyard bridges across it', painted(2008));
painted = gate(donut, way(2009, { landuse: 'grass' }, rect(70, 70, 20, 20, A, B)));
check('...but one 20 m into the courtyard is not on park ground and drops',
  !painted(2009));

// The same 1400 m² patch mapped twice, as a way and as a landuse. Summed area
// says 2800 m² and would paint it; the mass is 1400 m² of ground and does not.
painted = gate(
  way(2010, { leisure: 'park' }, rect(0, 0, 37.4, 37.4, A, B)),
  way(2011, { landuse: 'grass' }, rect(0, 0, 37.4, 37.4, A, B)),
);
check('green mapped twice on the same ground is not counted twice',
  !painted(2010) && !painted(2011));

// A mass right on the threshold must not fall foul of the box bound. This
// square is 50.1 m on a side, 2510 m², a whisker over the 2500 m² line: both
// bounds describe the same ground, so the only thing that could drop it is the
// two of them being measured in different units.
painted = gate(way(2012, { leisure: 'park' }, rect(0, 0, 50.1, 50.1, A, B)));
check('a mass just over the threshold is not shaved off by the box bound',
  painted(2012));

// Containment is probed per outer ring, not once per element: this park's
// SECOND island is the one lying inside the named park.
const twoIslands = {
  type: 'relation', id: 2013, tags: { leisure: 'park' },
  members: [
    { role: 'outer', geometry: rect(400, 400, 14, 14, A, B).map(([lat, lon]) => ({ lat, lon })) },
    { role: 'outer', geometry: rect(50, 50, 14, 14, A, B).map(([lat, lon]) => ({ lat, lon })) },
  ],
};
painted = gate(
  way(2014, { leisure: 'park', name: 'Wilhelminapark' }, rect(0, 0, 120, 120, A, B)),
  twoIslands,
);
check('a multipolygon whose second island sits in a named park is kept',
  painted(2013));

// Broken geometry must not take the rest of the plate down with it. It has to
// arrive as a RELATION and as a NAMED park to get that far: a way with a
// non-finite coordinate is not a closed ring and is dropped before any of this,
// and a nameless park is measured and dropped at the piece floor. A named
// relation is a seed — never measured, never dropped on the way in.
// kx is then derived from finite latitudes only, and an element with no
// placeable box is left out of the spatial grid.
const brokenRelation = (id, tags) => ({
  type: 'relation', id, tags,
  members: [{ role: 'outer', geometry: rect(300, 300, 20, 20, A, B).map(([, lon]) => ({ lat: NaN, lon })) }],
});
painted = gate(
  brokenRelation(2015, { leisure: 'park', name: 'Wilhelminapark' }),
  way(2016, { leisure: 'park' }, rect(0, 0, 100, 13, A, B)),
  way(2017, { landuse: 'grass' }, rect(50, 18, 100, 13, A, B)),
);
check('broken seed geometry does not stop the rest of the plate from bridging',
  painted(2016) && painted(2017));
// A relation whose members stitch to no ring at all is the one shape that
// reaches the gate as a GATED element while being unplaceable: elementAreaM2
// reports it as unmeasurable, which clears the piece floor, so it is staged and
// then has no geometry to file in the grid. Unmeasurable green is painted.
const ringless = (id, tags) => ({ type: 'relation', id, tags, members: [] });
let r = X2.classifyAreaFeatures([ringless(2018, { leisure: 'park' })]);
check('a gated relation with no rings at all is painted, not dropped',
  r.green.some((el) => el.id === 2018));
// The same, with a seed present whose latitude is finite but whose longitude is
// not: the projection scale is computed, yet nothing ends up placeable. The
// gate has to walk that path and come back.
const halfBroken = {
  type: 'relation', id: 2019, tags: { leisure: 'park', name: 'Wilhelminapark' },
  members: [{ role: 'outer', geometry: rect(0, 0, 40, 40, A, B).map(([lat]) => ({ lat, lon: NaN })) }],
};
r = X2.classifyAreaFeatures([ringless(2020, { leisure: 'park' }), halfBroken]);
check('a plate where nothing at all is placeable still returns',
  r.green.some((el) => el.id === 2020) && r.green.some((el) => el.id === 2019));

// One broken vertex among sound ones leaves the element's bounding box intact,
// so it IS placed in the grid and only the two segments touching that vertex
// are unusable. Its sound edges must still anchor the green lying against them.
const nickedPark = {
  type: 'relation', id: 2021, tags: { leisure: 'park', name: 'Wilhelminapark' },
  members: [{
    role: 'outer',
    geometry: rect(0, 0, 60, 60, A, B).map(([lat, lon], i) => (i === 2 ? { lat, lon: NaN } : { lat, lon })),
  }],
};
painted = gate(nickedPark, way(2022, { landuse: 'grass' }, rect(-15, 0, 14, 14, A, B)));
check('a seed with one broken vertex still anchors green along its sound edges',
  painted(2022));

// One OSM way can run for kilometres — Overpass hands over whole ways, not the
// piece inside the frame. A long diagonal edge covers (length/6)² grid cells in
// its bounding box but crosses only length/6 of them, so filing it by box
// instead of by the cells it actually crosses turns one element into millions
// of bucket writes. The budget here is deliberately loose: it catches that
// collapse (seconds to minutes), not a small regression.
const diag = (xM, yM, lengthM, widthM) => [
  [A + yM / 111320, B + xM / (111320 * Math.cos(A * Math.PI / 180))],
  [A + (yM + lengthM) / 111320, B + (xM + lengthM) / (111320 * Math.cos(A * Math.PI / 180))],
  [A + (yM + lengthM) / 111320, B + (xM + lengthM + widthM) / (111320 * Math.cos(A * Math.PI / 180))],
  [A + yM / 111320, B + (xM + widthM) / (111320 * Math.cos(A * Math.PI / 180))],
  [A + yM / 111320, B + xM / (111320 * Math.cos(A * Math.PI / 180))],
];
const startedAt = Date.now();
painted = gate(
  way(2020, { leisure: 'park' }, diag(0, 0, 10000, 30)),
  way(2021, { landuse: 'grass' }, diag(35, 0, 10000, 30)),
);
const diagMs = Date.now() - startedAt;
check('two 10 km diagonal strips 5 m apart still bridge', painted(2020) && painted(2021));
check(`...and the grid walks the line, not its bounding box (${diagMs} ms)`, diagMs < 5000);

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
