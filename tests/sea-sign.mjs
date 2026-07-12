// Offline check of engine-v2's coastline→sea closing (no network, no DOM).
// OSM convention: natural=coastline ways carry land on the LEFT of the way
// direction, water on the RIGHT. buildSeaElements returns one synthetic
// multipolygon relation whose outer rings are the sea (closed against the
// frame) and whose inner rings are islands. This asserts the water-side sign
// for both way directions, chain stitching across split ways, the frame-corner
// walk, multi-crossing coasts (the Oulu archipelago failure mode: the old
// per-run closure stacked 25 overlapping whole-frame polygons), island rings
// as holes, and the inland no-op. Real-city acceptance (Bremerhaven/Oulu) is
// the M7 test; this guards the geometry against regressions.
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
  LAYER_REGISTRY: [{ group: 'stub', layers: ['roads', 'rail', 'tram', 'metro', 'water_bodies', 'waterways', 'parks', 'landcover', 'transit_stops', 'water_labels', 'street_labels'].map(mkLayer) }],
  BLOCK_BUILDINGS_LAYER: mkLayer('buildings'),
  parksNamedGate: () => false,
  isSquareTagged: () => false,
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
const allRings = (sea) => sea.length ? sea[0].members.map(m => m.geometry) : [];
const outers = (sea) => sea.length ? sea[0].members.filter(m => m.role === 'outer').map(m => m.geometry) : [];
const inners = (sea) => sea.length ? sea[0].members.filter(m => m.role === 'inner').map(m => m.geometry) : [];
// evenodd, matching the renderer and the worker's oriented union.
const inSea = (sea, lat, lon) => allRings(sea).filter(r => inRing(r, lat, lon)).length % 2 === 1;

let failures = 0;
const check = (name, cond) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`);
  if (!cond) failures++;
};
const coastWay = (id, points) => ({ type: 'way', id, tags: { natural: 'coastline' }, geometry: points });

// Case 1: coastline west→east across the middle. Water on the right = SOUTH.
let sea = X2.buildSeaElements([coastWay(1, [
  { lat: 50.5, lon: 3.9 }, { lat: 50.5, lon: 4.5 }, { lat: 50.5, lon: 5.1 },
])], bbox);
check('eastward coast yields one outer, no inners', outers(sea).length === 1 && inners(sea).length === 0);
check('eastward: south side is sea', inSea(sea, 50.2, 4.5));
check('eastward: north side is land', !inSea(sea, 50.8, 4.5));

// Case 2: same line reversed (east→west). Water on the right = NORTH.
sea = X2.buildSeaElements([coastWay(2, [
  { lat: 50.5, lon: 5.1 }, { lat: 50.5, lon: 4.5 }, { lat: 50.5, lon: 3.9 },
])], bbox);
check('westward coast yields one outer', outers(sea).length === 1);
check('westward: north side is sea', inSea(sea, 50.8, 4.5));
check('westward: south side is land', !inSea(sea, 50.2, 4.5));

// Case 3: two ways that must stitch into one south-then-east coast (an L
// around the SE corner; land NW of it, water in the SE corner).
sea = X2.buildSeaElements([
  coastWay(4, [{ lat: 50.3, lon: 4.6 }, { lat: 50.3, lon: 5.1 }]),
  coastWay(3, [{ lat: 49.9, lon: 4.6 }, { lat: 50.3, lon: 4.6 }]),
], bbox);
check('L-coast stitches into one outer', outers(sea).length === 1);
check('L-coast: SE corner is sea', inSea(sea, 50.1, 4.9));
check('L-coast: NW side is land', !inSea(sea, 50.7, 4.2));

// Case 4: a channel — two coastlines crossing the frame, land above and below,
// water between. The shared boundary walk must join both runs into ONE sea
// polygon instead of stacking two overlapping ones (the Oulu failure mode).
sea = X2.buildSeaElements([
  coastWay(5, [{ lat: 50.7, lon: 3.9 }, { lat: 50.7, lon: 5.1 }]), // north shore, land north (eastward)
  coastWay(6, [{ lat: 50.3, lon: 5.1 }, { lat: 50.3, lon: 3.9 }]), // south shore, land south (westward)
], bbox);
check('channel: both runs close into one outer', outers(sea).length === 1);
check('channel: middle band is sea', inSea(sea, 50.5, 4.5));
check('channel: north band is land', !inSea(sea, 50.9, 4.5));
check('channel: south band is land', !inSea(sea, 50.1, 4.5));

// Case 5: an island — a closed counterclockwise coastline ring (land inside)
// in the sea half of case 1. Must become an inner ring (a hole), not more sea.
sea = X2.buildSeaElements([
  coastWay(7, [{ lat: 50.5, lon: 3.9 }, { lat: 50.5, lon: 4.5 }, { lat: 50.5, lon: 5.1 }]),
  coastWay(8, [
    { lat: 50.2, lon: 4.4 }, { lat: 50.2, lon: 4.6 }, { lat: 50.3, lon: 4.6 },
    { lat: 50.3, lon: 4.4 }, { lat: 50.2, lon: 4.4 },
  ]),
], bbox);
check('island: one outer + one inner', outers(sea).length === 1 && inners(sea).length === 1);
check('island interior is land', !inSea(sea, 50.25, 4.5));
check('water around the island is sea', inSea(sea, 50.15, 4.5) && inSea(sea, 50.25, 4.7));

// Case 6: an island straddling the frame edge, with its ring seam INSIDE the
// frame (Oulu's edge islands). The seam must be rotated outside before
// clipping, or the ring splits into two dangling half-runs and gets dropped.
// Sea north of a westward coast; a CCW island ring pokes through the north
// edge, its stored start/end vertex at (50.8, 4.4) — inside the frame.
sea = X2.buildSeaElements([
  coastWay(9, [{ lat: 50.5, lon: 5.1 }, { lat: 50.5, lon: 4.5 }, { lat: 50.5, lon: 3.9 }]),
  coastWay(10, [
    { lat: 50.8, lon: 4.4 }, { lat: 50.8, lon: 4.6 }, { lat: 51.2, lon: 4.6 },
    { lat: 51.2, lon: 4.4 }, { lat: 50.8, lon: 4.4 },
  ]),
], bbox);
check('edge island: one outer, no dangling drop', outers(sea).length === 1);
check('edge island interior is land', !inSea(sea, 50.9, 4.5));
check('sea west of the edge island', inSea(sea, 50.9, 4.2));
check('sea between edge island and coast', inSea(sea, 50.65, 4.5));
check('land south of the coast stays land', !inSea(sea, 50.2, 4.5));

// Case 7: sea naming. One agreeing name on the open coastline names the sea;
// island (closed-ring) names never do; unnamed coast keeps 'Sea'.
const named = (id, pts, name) => ({ type: 'way', id, tags: { natural: 'coastline', name }, geometry: pts });
sea = X2.buildSeaElements([named(11, [{ lat: 50.5, lon: 3.9 }, { lat: 50.5, lon: 5.1 }], 'Waddenzee')], bbox);
check('single-named coast names the sea', sea[0].tags.name === 'Waddenzee');
sea = X2.buildSeaElements([
  coastWay(12, [{ lat: 50.5, lon: 3.9 }, { lat: 50.5, lon: 5.1 }]),
  named(13, [
    { lat: 50.2, lon: 4.4 }, { lat: 50.2, lon: 4.6 }, { lat: 50.3, lon: 4.6 },
    { lat: 50.3, lon: 4.4 }, { lat: 50.2, lon: 4.4 },
  ], 'Hietasaari'),
], bbox);
check('island name never names the sea', sea[0].tags.name === 'Sea');
// The island test must hold on STITCHED chains, not raw ways: an island ring
// split into individually-open ways is still an island (Oulu's islet "Elba"
// named the whole sea before this was chain-aware).
sea = X2.buildSeaElements([
  coastWay(14, [{ lat: 50.5, lon: 3.9 }, { lat: 50.5, lon: 5.1 }]),
  named(15, [
    { lat: 50.2, lon: 4.4 }, { lat: 50.2, lon: 4.6 }, { lat: 50.3, lon: 4.6 },
  ], 'Elba'),
  named(16, [
    { lat: 50.3, lon: 4.6 }, { lat: 50.3, lon: 4.4 }, { lat: 50.2, lon: 4.4 },
  ], 'Elba'),
], bbox);
check('split island (two open ways) never names the sea', sea[0].tags.name === 'Sea');
check('split island still renders as a hole', inners(sea).length === 1);

// Case 8: no coastline → strict no-op.
check('no coastline → no sea elements', X2.buildSeaElements([], bbox).length === 0);

// Case 9: manual sea-name override. It wins over the coastline-derived name,
// is trimmed, and a blank override falls back to the ordinary naming.
sea = X2.buildSeaElements([named(20, [{ lat: 50.5, lon: 3.9 }, { lat: 50.5, lon: 5.1 }], 'Waddenzee')], bbox, 'Noordzee');
check('override wins over the coastline name', sea[0].tags.name === 'Noordzee');
sea = X2.buildSeaElements([coastWay(21, [{ lat: 50.5, lon: 3.9 }, { lat: 50.5, lon: 5.1 }])], bbox, '  Außenweser  ');
check('override is trimmed', sea[0].tags.name === 'Außenweser');
sea = X2.buildSeaElements([coastWay(22, [{ lat: 50.5, lon: 3.9 }, { lat: 50.5, lon: 5.1 }])], bbox, '');
check('blank override falls back to Sea', sea[0].tags.name === 'Sea');

// Case 10: the rendered sea label (buildAreaResults). A real name (override or
// unique coastline name) yields a water-styled label node anchored INSIDE the
// sea water; the nameless 'Sea' yields no map label at all.
let r = X2.buildAreaResults([named(23, [{ lat: 50.5, lon: 3.9 }, { lat: 50.5, lon: 5.1 }], 'Waddenzee')], bbox);
let seaEls = r.classified.water.filter(e => e.id === 'sea');
check('named coast → water-styled sea label node', !!r.seaLabel && r.seaLabel.tags.name === 'Waddenzee' && r.seaLabel.tags.natural === 'water' && r.seaLabel.type === 'node');
check('sea label anchor is inside the sea water', !!r.seaLabel && inSea(seaEls, r.seaLabel.lat, r.seaLabel.lon));

r = X2.buildAreaResults([coastWay(24, [{ lat: 50.5, lon: 3.9 }, { lat: 50.5, lon: 5.1 }])], bbox);
check('nameless sea → no map label', r.seaLabel === null);

r = X2.buildAreaResults([coastWay(25, [{ lat: 50.5, lon: 3.9 }, { lat: 50.5, lon: 5.1 }])], bbox, { seaName: 'Außenweser' });
seaEls = r.classified.water.filter(e => e.id === 'sea');
check('override → sea label present', !!r.seaLabel && r.seaLabel.tags.name === 'Außenweser');
check('override sea label anchor inside the water', !!r.seaLabel && inSea(seaEls, r.seaLabel.lat, r.seaLabel.lon));

// Case 11: seaInteriorPoint returns a robust interior point that avoids island
// holes (the bounds centre of this frame lands on the island / on land).
sea = X2.buildSeaElements([
  coastWay(26, [{ lat: 50.5, lon: 3.9 }, { lat: 50.5, lon: 4.5 }, { lat: 50.5, lon: 5.1 }]),
  coastWay(27, [
    { lat: 50.2, lon: 4.4 }, { lat: 50.2, lon: 4.6 }, { lat: 50.3, lon: 4.6 },
    { lat: 50.3, lon: 4.4 }, { lat: 50.2, lon: 4.4 },
  ]),
], bbox);
const pt = X2.seaInteriorPoint(sea[0]);
check('interior point is inside the sea', !!pt && inSea(sea, pt.lat, pt.lon));
check('interior point avoids the island hole', !!pt && !inRing(inners(sea)[0], pt.lat, pt.lon));

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('PASS — sea sign, stitching, corner walk, channel, island holes, no-op');
