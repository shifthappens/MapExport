// tests/editor-structure.mjs — offline check for the AF-07a editor structure:
//
// (1) The shared tram builder's casing/fill sub-groups carry readable panel
//     labels ("Tram casings" / "Tram fills", matching the roads layer's
//     "Road casings" / "Road fills") — both engines share this builder.
// (2) Engine v2's City blocks layer groups hamlet blobs under "Hamlets"
//     (`city_blocks_hamlets`) and standalone buildings under "Standalone
//     buildings" (`city_blocks_buildings`); urban blocks stay direct
//     children. Pure panel organization — same cream paint, same per-path
//     ids/labels/strokes, no sub-group emitted for an absent kind.
//
// Loads script.js + engine-v2.js in ONE vm sandbox (same trick as
// rail-service.mjs) and drives v1's buildTramLayer plus EngineV2.buildSVG.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadSandbox() {
  const elProxy = new Proxy(function () {}, {
    get(_t, p) {
      if (p === 'style' || p === 'classList' || p === 'dataset') return elProxy;
      if (p === 'getContext') return () => ({ measureText: () => ({ width: 0 }) });
      if (p === 'querySelectorAll') return () => [];
      if (['textContent', 'innerHTML', 'value', 'className', 'scrollTop', 'scrollHeight'].includes(p)) return '';
      if (p === 'checked') return true;
      if (typeof p === 'symbol') return undefined;
      return elProxy;
    }, set() { return true; }, apply() { return elProxy; },
  });
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, performance,
    fetch: () => Promise.reject(new Error('no network in editor-structure')),
    Blob, Response, Request, Headers, URL, AbortController, AbortSignal, TextEncoder, TextDecoder,
    document: {
      getElementById: () => elProxy, querySelector: () => elProxy, querySelectorAll: () => [],
      createElement: () => elProxy, createElementNS: () => elProxy, addEventListener() {},
      body: elProxy, documentElement: elProxy,
    },
    navigator: { userAgent: 'node', clipboard: {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
  vm.createContext(sandbox);
  const scriptSrc = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');
  const engineSrc = fs.readFileSync(path.join(ROOT, 'engine-v2.js'), 'utf8');
  const tail = '\n;globalThis.__X={buildTramLayer,makeUidGen,safeName,RESERVED_SVG_IDS};\nglobalThis.__X2=EngineV2;';
  vm.runInContext(scriptSrc + '\n;\n' + engineSrc + tail, sandbox, { filename: 'editor-structure-sandbox.js' });
  return { X: sandbox.__X, X2: sandbox.__X2 };
}

const { X, X2 } = loadSandbox();
const layerById = id => {
  const l = X2.layers.find(x => x.id === id);
  if (!l) throw new Error(`no such layer: ${id}`);
  return l;
};

// ── synthetic geometry ───────────────────────────────────────────────────
const bbox = { south: 51.000, west: 5.000, north: 51.020, east: 5.030 };
const W = 2000;
const pt = (latFrac, lonFrac) => ({
  lat: bbox.south + (bbox.north - bbox.south) * latFrac,
  lon: bbox.west + (bbox.east - bbox.west) * lonFrac,
});
let nextId = 100;
const way = (tags, points) => {
  const id = nextId++;
  return { type: 'way', id, tags, geometry: points, nodes: points.map((_, i) => id * 1000 + i) };
};

const namedTram = way({ railway: 'tram', name: 'Regierungsstraße' }, [pt(0.30, 0.05), pt(0.30, 0.95)]);
const unnamedTram = way({ railway: 'tram' }, [pt(0.70, 0.05), pt(0.70, 0.95)]);
// Adversarial name: literally one of the new structural group ids. The
// RESERVED_SVG_IDS seed must suffix the path id instead of duplicating it.
const reservedTram = way({ railway: 'tram', name: 'city_blocks_hamlets' }, [pt(0.50, 0.05), pt(0.50, 0.95)]);

// City-blocks fixtures: two urban blocks (one holed), a named + an unnamed
// hamlet blob, one standalone building, and a countryside placeholder that
// must not render at all.
const sq = (x, y, s = 80) => `M${x},${y}L${x + s},${y}L${x + s},${y + s}L${x},${y + s}Z`;
const mixedBlocks = [
  { kind: 'urban', outer: sq(0, 0), holes: [] },
  { kind: 'hamlet', outer: sq(200, 200), holes: [], name: 'Franvache' },
  { kind: 'urban', outer: sq(1000, 0), holes: [sq(1020, 20, 30)] },
  { kind: 'building', outer: sq(400, 400, 20), holes: [] },
  { kind: 'hamlet', outer: sq(600, 600), holes: [] },
  { kind: 'countryside', outer: sq(1200, 1200, 400), holes: [] },
];

const clone = x => JSON.parse(JSON.stringify(x));
function buildResults(tramElements, blocks) {
  return [
    { layer: layerById('tram'), data: { elements: clone(tramElements) } },
    { layer: X2.cityBlocksLayer, data: { blocks: clone(blocks) } },
    { layer: X2.fallbackBlocksLayer, data: { blocks: [], labelElements: [] } },
  ];
}

// ── helpers ──────────────────────────────────────────────────────────────
// Nesting-aware group extractor (the flat first-`</g>` shortcut mislabelled
// two metro fixtures once — see metro-dedup): returns the full <g id=…>…</g>
// span at its own nesting level.
function extractGroup(svg, id) {
  const start = svg.indexOf(`<g id="${id}"`);
  if (start === -1) return '';
  const re = /<g\b|<\/g>/g;
  re.lastIndex = start;
  let depth = 0, m;
  while ((m = re.exec(svg)) !== null) {
    if (m[0] === '</g>') { depth--; if (depth === 0) return svg.slice(start, m.index + m[0].length); }
    else depth++;
  }
  return svg.slice(start);
}
function extractIds(svg) {
  const out = [];
  const re = /\sid="([^"]*)"/g;
  let m;
  while ((m = re.exec(svg)) !== null) out.push(m[1]);
  return out;
}
function findDuplicates(ids) {
  const seen = new Map();
  for (const id of ids) seen.set(id, (seen.get(id) || 0) + 1);
  return [...seen.entries()].filter(([, n]) => n > 1);
}

let failures = 0;
const check = (name, cond) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`);
  if (!cond) failures++;
};

// ── (1) v1 tram builder: sub-group labels, paths untouched ───────────────
const pr = (lat, lon) => [lon * 100, lat * 100];
const v1Tram = X.buildTramLayer(clone([namedTram, unnamedTram]), pr, W, X.makeUidGen());

check('tram_casing group carries inkscape:label="Tram casings"',
  /<g id="tram_casing" inkscape:label="Tram casings"/.test(v1Tram));
check('tram_fill group carries inkscape:label="Tram fills"',
  /<g id="tram_fill" inkscape:label="Tram fills"/.test(v1Tram));
check('tram group paint attributes unchanged (#555555 casing, #aaee44 fill)',
  /<g id="tram_casing"[^>]*stroke="#555555"/.test(v1Tram)
  && /<g id="tram_fill"[^>]*stroke="#aaee44"/.test(v1Tram));
const namedBase = X.safeName('Regierungsstraße');
check('named tram way keeps its safeName id + name label on casing and fill',
  v1Tram.includes(`id="${namedBase}_casing" inkscape:label="Regierungsstraße"`)
  && v1Tram.includes(`id="${namedBase}" inkscape:label="Regierungsstraße"`));
check('unnamed tram way keeps its tram_<osm id> fallback id',
  v1Tram.includes(`id="tram_${unnamedTram.id}_casing"`) && v1Tram.includes(`id="tram_${unnamedTram.id}"`));
check('per-path opacity preserved (0.6 casing / 0.9 fill, not group-hoisted)',
  (v1Tram.match(/opacity="0.6"/g) || []).length === 2
  && (v1Tram.match(/opacity="0.9"/g) || []).length === 2);

// ── (2) v2 document: tram labels + City blocks sub-groups ────────────────
const svg = X2.buildSVG(buildResults([namedTram, unnamedTram], mixedBlocks), bbox, W, null, { illustratorCompatible: false });

check('v2 output: tram sub-group labels present (shared builder)',
  /<g id="tram_casing" inkscape:label="Tram casings"/.test(svg)
  && /<g id="tram_fill" inkscape:label="Tram fills"/.test(svg));

const cityGroup = extractGroup(svg, 'city_blocks');
const hamletsGroup = extractGroup(cityGroup, 'city_blocks_hamlets');
const buildingsGroup = extractGroup(cityGroup, 'city_blocks_buildings');
const outsideSubgroups = cityGroup.replace(hamletsGroup, '').replace(buildingsGroup, '');

check('city_blocks layer present', cityGroup.startsWith('<g id="city_blocks" inkscape:label="City blocks"'));
check('Hamlets sub-group present with label',
  hamletsGroup.startsWith('<g id="city_blocks_hamlets" inkscape:label="Hamlets">'));
check('Standalone buildings sub-group present with label',
  buildingsGroup.startsWith('<g id="city_blocks_buildings" inkscape:label="Standalone buildings">'));
check('urban blocks stay direct children (not inside a sub-group)',
  outsideSubgroups.includes('id="block_1"') && outsideSubgroups.includes('id="block_2"')
  && !hamletsGroup.includes('id="block_') && !buildingsGroup.includes('id="block_'));
check('both hamlet blobs live in the Hamlets sub-group, named one labelled',
  hamletsGroup.includes('id="hamlet_1" inkscape:label="Hamlet “Franvache”"')
  && hamletsGroup.includes('id="hamlet_2" inkscape:label="Hamlet 2"')
  && !outsideSubgroups.includes('id="hamlet_'));
check('the standalone building lives in its sub-group',
  buildingsGroup.includes('id="building_1" inkscape:label="Building 1"')
  && !outsideSubgroups.includes('id="building_'));
check('order: urban paths, then Hamlets, then Standalone buildings',
  cityGroup.indexOf('id="block_1"') < cityGroup.indexOf('<g id="city_blocks_hamlets"')
  && cityGroup.indexOf('<g id="city_blocks_hamlets"') < cityGroup.indexOf('<g id="city_blocks_buildings"'));
check('countryside placeholder renders no path',
  (cityGroup.match(/<path /g) || []).length === 5);
check('paint unchanged: every block path cream evenodd; urban unstroked, blobs outlined',
  (cityGroup.match(/fill="#FEF8F1" fill-rule="evenodd"/g) || []).length === 5
  && (outsideSubgroups.match(/stroke="none"/g) || []).length === 2
  && /id="hamlet_1"[^/]*stroke="[^n]/.test(hamletsGroup)
  && /id="building_1"[^/]*stroke="[^n]/.test(buildingsGroup));
check('urban block keeps its hole subpath', /id="block_2"[^/]*d="M1000,0[^"]*M1020,20/.test(cityGroup));
check('zero duplicate SVG ids', findDuplicates(extractIds(svg)).length === 0);

const svgAgain = X2.buildSVG(buildResults([namedTram, unnamedTram], mixedBlocks), bbox, W, null, { illustratorCompatible: false });
check('deterministic output across two identical builds', svg === svgAgain);

// ── (3) absent kinds emit no empty sub-group ─────────────────────────────
const svgUrbanOnly = X2.buildSVG(buildResults([namedTram], [mixedBlocks[0]]), bbox, W, null, { illustratorCompatible: false });
check('urban-only frame: no Hamlets/Standalone buildings sub-groups',
  !svgUrbanOnly.includes('city_blocks_hamlets') && !svgUrbanOnly.includes('city_blocks_buildings')
  && extractGroup(svgUrbanOnly, 'city_blocks').includes('id="block_1"'));
const svgRuralOnly = X2.buildSVG(buildResults([namedTram], [mixedBlocks[1], mixedBlocks[3]]), bbox, W, null, { illustratorCompatible: false });
check('rural-only frame: both sub-groups, no direct urban paths',
  extractGroup(svgRuralOnly, 'city_blocks_hamlets').includes('id="hamlet_1"')
  && extractGroup(svgRuralOnly, 'city_blocks_buildings').includes('id="building_1"')
  && !svgRuralOnly.includes('id="block_'));

// ── (4) reserved structural ids survive an adversarial feature name ──────
check('RESERVED_SVG_IDS seeds the two new structural group ids',
  X.RESERVED_SVG_IDS.includes('city_blocks_hamlets') && X.RESERVED_SVG_IDS.includes('city_blocks_buildings'));
const svgAdv = X2.buildSVG(buildResults([namedTram, reservedTram], mixedBlocks), bbox, W, null, { illustratorCompatible: false });
check('a tram literally named "city_blocks_hamlets" does not duplicate the group id',
  findDuplicates(extractIds(svgAdv)).length === 0
  && extractGroup(svgAdv, 'city_blocks_hamlets').startsWith('<g id="city_blocks_hamlets" inkscape:label="Hamlets">'));

// ── (5) Illustrator pipeline ─────────────────────────────────────────────
const svgI = X2.buildSVG(buildResults([namedTram, unnamedTram], mixedBlocks), bbox, W, null, { illustratorCompatible: true });
check('Illustrator mode: sub-groups present, no inkscape: attributes leak',
  /<g id="city_blocks_hamlets"[ >]/.test(svgI) && /<g id="city_blocks_buildings"[ >]/.test(svgI)
  && /<g id="tram_casing"[ >]/.test(svgI) && !svgI.includes('inkscape:'));

console.log('');
if (failures) {
  console.log(`editor-structure: ${failures} check(s) FAILED`);
  process.exit(1);
} else {
  console.log('PASS — editor-structure: tram sub-groups labelled; hamlets/standalone buildings grouped, paint untouched');
}
