// Five fixed, deliberately small Overpass-shaped maps exercise the real v2
// classifier, face worker and SVG builder. They are invariant tests, never
// snapshots: a fixture must still have its stated map feature, and the output
// must obey the export contract under a second identical build.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { runFaceWorker } from './face-worker-helper.mjs';
import { checkCoverage } from './coverage-lint.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'scenarios');
const fixtureFiles = ['compact-city.json', 'coast.json', 'river-island.json', 'rural-hamlet.json', 'transit.json'];
const W = 960;

function loadSandbox() {
  const el = new Proxy(function () {}, { get(_t, p) {
    if (p === 'style' || p === 'classList' || p === 'dataset') return el;
    if (p === 'getContext') return () => ({ measureText: () => ({ width: 0 }) });
    if (p === 'querySelectorAll') return () => [];
    if (['textContent', 'innerHTML', 'value', 'className'].includes(p)) return '';
    if (p === 'checked') return true;
    return typeof p === 'symbol' ? undefined : el;
  }, set() { return true; }, apply() { return el; } });
  const sandbox = { console, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, performance,
    fetch: () => Promise.reject(new Error('network forbidden in scenario-invariants')),
    Blob, Response, Request, Headers, URL, URLSearchParams, AbortController, AbortSignal, TextEncoder, TextDecoder,
    document: { getElementById: () => el, querySelector: () => el, querySelectorAll: () => [], createElement: () => el, createElementNS: () => el, addEventListener() {}, body: el, documentElement: el },
    navigator: { userAgent: 'node', clipboard: {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  };
  sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const script = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');
  const engine = fs.readFileSync(path.join(ROOT, 'engine-v2.js'), 'utf8');
  vm.runInContext(`${script}\n;${engine}\n;globalThis.__X={LAYER_REGISTRY,makeProjector,buildSVG,stitchMultipolygonRings};globalThis.__X2=EngineV2;`, sandbox, { filename: 'scenario-invariants-vm.js' });
  return { X: sandbox.__X, X2: sandbox.__X2 };
}

const { X, X2 } = loadSandbox();
const v1Layers = X.LAYER_REGISTRY.flatMap(g => g.layers);
const layer = id => {
  const found = [...v1Layers, ...X2.layers].find(candidate => candidate.id === id);
  assert.ok(found, `missing production layer ${id}`);
  return found;
};
const clone = value => JSON.parse(JSON.stringify(value));
const ids = svg => [...svg.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
const uniqueIds = svg => { const all = ids(svg); return all.length === new Set(all).size; };
const roadOrder = svg => {
  const casing = svg.indexOf('<g id="roads_casings"');
  const fills = svg.indexOf('<g id="roads_fills"');
  return casing >= 0 && fills >= 0 && casing < fills;
};
function respectsPaintOrder(svg) {
  const idsInOrder = ['city_blocks', 'fallback_blocks', 'water_bodies', 'waterways', 'landcover', 'parks', 'roads', 'rail', 'tram', 'metro'];
  const positions = idsInOrder.map(id => ({ id, pos: svg.indexOf(`<g id="${id}"`) })).filter(item => item.pos >= 0);
  return positions.every((item, i) => i === 0 || positions[i - 1].pos < item.pos);
}
function inside(x, y, rings) {
  let yes = false;
  for (const ring of rings || []) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) yes = !yes;
  }
  return yes;
}
function pathRing(d) {
  const values = (d || '').match(/-?\d+(?:\.\d+)?/g) || [];
  return values.reduce((out, value, i) => i % 2 ? out : out.concat([[+value, +values[i + 1]]]), []);
}
function blockAt(blocks, x, y) {
  return blocks.some(block => ['urban', 'hamlet', 'fallback'].includes(block.kind || 'urban') && inside(x, y, [pathRing(block.outer), ...(block.holes || []).map(pathRing)]));
}
function filter(layerDef, elements) {
  return (elements || []).filter(el => !layerDef.tagFilter || layerDef.tagFilter(el));
}

function v2Run(fixture) {
  const bbox = fixture.bbox;
  const input = fixture.layers;
  const baseIds = ['roads', 'paths', 'rail', 'tram', 'metro', 'transit_stops', 'water_labels', 'street_labels'];
  const results = baseIds.map(id => ({ layer: layer(id), data: { elements: filter(layer(id), clone(input[id]?.elements || [])) } }));
  results.push({ layer: X2.buildingsLayer, data: { elements: filter(X2.buildingsLayer, clone(input.buildings?.elements || [])) } });
  results.push({ layer: X2.areaFeaturesLayer, data: { elements: clone(input.area_features?.elements || []) } });
  results.push({ layer: X2.placeNodesLayer, data: { elements: filter(X2.placeNodesLayer, clone(input.place_nodes?.elements || [])) } });
  const { pr, H } = X.makeProjector(bbox, W);
  const areas = results.find(r => r.layer.id === 'area_features').data.elements;
  const { renderResults: areaResults, classified, seaLabel } = X2.buildAreaResults(areas, bbox);
  if (seaLabel) results.find(r => r.layer.id === 'water_labels').data.elements.push(seaLabel);
  // Match the production export path: surface roads and all three rail modes
  // bound faces. Paths and tunnels are filtered by prepareFaceData itself.
  const cutters = results.filter(r => ['roads', 'rail', 'tram', 'metro'].includes(r.layer.type));
  const buildings = results.find(r => r.layer.id === X2.buildingsLayer.id).data.elements;
  const places = results.find(r => r.layer.id === 'place_nodes').data.elements;
  const data = X2.prepareFaceData(cutters, buildings, classified, pr, W, H, bbox, places);
  const face = runFaceWorker(X2.FACE_WORKER_SRC, data);
  const landcover = areaResults.find(r => r.layer.id === 'landcover');
  if (landcover) landcover.data.elements = X2.applyLandcoverOcclusion(landcover.data.elements, face);
  const selectedIds = new Set(X2.layerOrder);
  const render = X2.renderableResults(results, { selectedIds });
  render.push(...areaResults);
  render.push({ layer: X2.cityBlocksLayer, data: { blocks: face.blocks } });
  render.push({ layer: X2.fallbackBlocksLayer, data: { blocks: face.blocks, labelElements: classified.labelOnly } });
  const svg = X2.buildSVG(render, bbox, W, null, { illustratorCompatible: false });
  return { bbox, pr, H, results: render, data, classified, blocks: face.blocks, svg };
}

function v1Svg(fixture) {
  const input = fixture.layers;
  const visible = ['roads', 'paths', 'rail', 'tram', 'metro', 'transit_stops', 'water_bodies', 'waterways', 'parks', 'landcover', 'water_labels', 'street_labels'];
  const results = visible.map(id => ({ layer: layer(id), data: { elements: filter(layer(id), clone(input[id]?.elements || [])) } }));
  return X.buildSVG(results, fixture.bbox, W, null, [], { illustratorCompatible: false });
}

let failures = 0;
function check(label, condition) { console.log(`${condition ? 'ok  ' : 'FAIL'} ${label}`); if (!condition) failures++; }

for (const name of fixtureFiles) {
  const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));
  const one = v2Run(fixture), two = v2Run(fixture);
  const prefix = `[${fixture.name}]`;
  check(`${prefix} fixture's stated feature is non-empty`, (() => {
    if (fixture.expect.minUrban) return one.blocks.filter(b => b.kind === 'urban').length >= fixture.expect.minUrban;
    if (fixture.expect.minHamlet) return one.blocks.filter(b => b.kind === 'hamlet').length >= fixture.expect.minHamlet;
    if (fixture.expect.coastlinePieces) return one.classified.coastline.length === fixture.expect.coastlinePieces && one.classified.water.length > 0;
    if (fixture.expect.transitGroups) return fixture.expect.transitGroups.every(id => one.svg.includes(`<g id="${id}"`));
    return one.classified.water.length > 0;
  })());
  const coverage = checkCoverage({ X, results: one.results, data: one.data, blocks: one.blocks, bbox: one.bbox, W, H: one.H, pr: one.pr, countrysideCovers: false });
  const significanceFloor = 9 * (W / 180) ** 2; // 3×3 mm at the test's 180 mm map width
  const significantGaps = coverage.blobs.filter(blob => blob.cells * coverage.step ** 2 >= significanceFloor);
  check(`${prefix} coverage has no significant gaps`, significantGaps.length === 0);
  check(`${prefix} keeps the fixed v2 paint order`, respectsPaintOrder(one.svg));
  check(`${prefix} has unique SVG ids`, uniqueIds(one.svg));
  check(`${prefix} paints all road casings before fills`, roadOrder(one.svg));
  check(`${prefix} is byte-deterministic on identical input`, one.svg === two.svg);
  if (fixture.expect.waterProbe) {
    const [x, y] = one.pr(fixture.expect.waterProbe.lat, fixture.expect.waterProbe.lon);
    const waterContains = inside(x, y, one.data.waterPolys);
    check(`${prefix} water probe is real classified water`, waterContains);
    check(`${prefix} no cream block covers the water probe`, !blockAt(one.blocks, x, y));
  }
  if (fixture.expect.landProbe) {
    const [x, y] = one.pr(fixture.expect.landProbe.lat, fixture.expect.landProbe.lon);
    check(`${prefix} island land probe stays outside water`, !inside(x, y, one.data.waterPolys));
  }
  if (name === 'compact-city.json' || name === 'transit.json') {
    const a = v1Svg(fixture), b = v1Svg(fixture);
    check(`${prefix} v1 remains deterministic`, a === b);
    check(`${prefix} v1 has unique SVG ids`, uniqueIds(a));
    check(`${prefix} v1 keeps casings before fills`, roadOrder(a));
  }
}

if (failures) process.exit(1);
console.log(`PASS — ${fixtureFiles.length} fixed offline scenarios through real v2 pipeline`);
