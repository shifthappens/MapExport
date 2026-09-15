// Offline check that the per-layer fetch-bbox padding stays in sync across
// its three independent call sites: the real export loop (engine-v2.js),
// the headless end-to-end harness (tests/real-export.mjs), and the
// prefetch/pin-cache tool (tools/prefetch-validation-cache.mjs). Each one
// re-derives which layer gets padded and by how much rather than sharing one
// function; a drift between any two silently produces mismatched cache keys
// (ME-06a review, 2026-09-15). This guards the padding CONTRACT (which
// layers, which constants), not the export pipeline itself.
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import vm from 'node:vm';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(repoRoot, 'engine-v2.js'), 'utf8');

const mkLayer = (id) => ({ id, label: id, type: id, overpassQuery: () => '' });
const context = vm.createContext({
  LAYER_REGISTRY: [{ group: 'stub', layers: ['roads', 'rail', 'tram', 'metro', 'water_bodies', 'waterways', 'parks', 'landcover', 'transit_stops', 'water_labels', 'street_labels'].map(mkLayer) }],
  BLOCK_BUILDINGS_LAYER: mkLayer('block_buildings'),
  parksNamedGate: () => false,
  isSquareTagged: () => false,
  console,
});
vm.runInContext(src + '\n;globalThis.__X2 = EngineV2;', context);
const X2 = context.__X2;

let failures = 0;
const check = (name, cond) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`);
  if (!cond) failures++;
};

// 1. The engine still exports exactly the two padded-layer constants this
//    test (and the tooling) knows about, at the values the fix landed with.
check('BUILDING_FETCH_PAD_M is 100', X2.BUILDING_FETCH_PAD_M === 100);
check('PLACE_NODE_FETCH_PAD_M is 1000, matching HAMLET_GROUND_SETTLEMENT_M',
  X2.PLACE_NODE_FETCH_PAD_M === 1000 && X2.PLACE_NODE_FETCH_PAD_M === X2.HAMLET_GROUND_SETTLEMENT_M);

// 2. tools/prefetch-validation-cache.mjs's makePlan pads the same two layers
//    by the same amounts as engine-v2.js's own export loop. Rather than
//    duplicate its vm-loading here, drive the real tool against a tiny
//    synthetic one-city file and compare its emitted place_nodes/buildings
//    keys' bbox digits against padBboxMeters applied directly.
const bbox = { south: 51.545, west: 5.07, north: 51.562, east: 5.1 };
const paddedBuildings = X2.padBboxMeters(bbox, X2.BUILDING_FETCH_PAD_M);
const paddedPlaceNodes = X2.padBboxMeters(bbox, X2.PLACE_NODE_FETCH_PAD_M);

const dir = mkdtempSync(join(tmpdir(), 'fetch-padding-sync-'));
const citiesFile = join(dir, 'city.json');
writeFileSync(citiesFile, JSON.stringify({ tilburg: `${bbox.south},${bbox.west},${bbox.north},${bbox.east}` }));

let keys;
try {
  const out = execFileSync('node', [join(repoRoot, 'tools/prefetch-validation-cache.mjs'), '--list-keys', `--cities=${citiesFile}`], { encoding: 'utf8' });
  keys = out.trim().split('\n');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const fmt5 = (n) => (+n.toFixed(5)).toString();
const buildingsKey = keys.find(k => k.startsWith(`mapexport_v3_${X2.buildingsLayer.id}_`));
const placeNodesKey = keys.find(k => k.startsWith('mapexport_v3_place_nodes_'));
const roadsKey = keys.find(k => k.startsWith('mapexport_v3_roads_'));

check('prefetch tool emits a buildings key', !!buildingsKey);
check('prefetch tool emits a place_nodes key', !!placeNodesKey);
check('prefetch tool emits an unpadded roads key (control)', !!roadsKey);

check('buildings key bbox matches padBboxMeters(bbox, BUILDING_FETCH_PAD_M)',
  buildingsKey && buildingsKey.includes(`_a_${fmt5(paddedBuildings.south)}_${fmt5(paddedBuildings.west)}_${fmt5(paddedBuildings.north)}_${fmt5(paddedBuildings.east)}`));
check('place_nodes key bbox matches padBboxMeters(bbox, PLACE_NODE_FETCH_PAD_M)',
  placeNodesKey && placeNodesKey.includes(`_a_${fmt5(paddedPlaceNodes.south)}_${fmt5(paddedPlaceNodes.west)}_${fmt5(paddedPlaceNodes.north)}_${fmt5(paddedPlaceNodes.east)}`));
check('roads key bbox is the raw (unpadded) bbox',
  roadsKey && roadsKey.includes(`_a_${fmt5(bbox.south)}_${fmt5(bbox.west)}_${fmt5(bbox.north)}_${fmt5(bbox.east)}`));

// v1's own on-demand block_buildings fetch (script.js's BLOCK_BUILDINGS_LAYER,
// not a LAYER_REGISTRY entry) shares its id with v2's buildingsLayer above —
// only overpassOut ('tags bb' vs 'body geom') and the bbox padding differ —
// so this checks the two are never the same cache key, not just that each
// individually looks right (independent review finding, 2026-09-16: the
// single `.find()` above only proves *a* buildings key exists with the right
// shape, not that v1's distinct, unpadded variant is emitted at all).
const blockBuildingsKeys = keys.filter(k => k.startsWith(`mapexport_v3_${X2.buildingsLayer.id}_`));
check('prefetch tool emits exactly two distinct block_buildings keys (v1 raw + v2 padded)',
  blockBuildingsKeys.length === 2 && blockBuildingsKeys[0] !== blockBuildingsKeys[1],
  blockBuildingsKeys.join(' | '));
check('one of them is v1\'s raw, unpadded bbox variant',
  blockBuildingsKeys.some(k => k.includes(`_a_${fmt5(bbox.south)}_${fmt5(bbox.west)}_${fmt5(bbox.north)}_${fmt5(bbox.east)}`)),
  blockBuildingsKeys.join(' | '));

console.log(failures ? `FAIL — ${failures} check(s) failed` : 'PASS — fetch-padding-sync: engine-v2.js and tools/prefetch-validation-cache.mjs agree on padded layers/amounts');
process.exit(failures ? 1 : 0);
