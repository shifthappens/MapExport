// tests/svg-id-uniqueness.mjs — offline check that every SVG object id
// emitted by a real export is unique across the WHOLE document, for both
// engines (v1's buildSVG in script.js, v2's buildSVG in engine-v2.js).
//
// Regression target: before the ME AF-01 fix, several builders allocated
// their own id-uniqueness scope PER CALL instead of per document (roads,
// rail, metro — metro even reset it per LINE, so two metro lines sharing a
// member name collided silently — tram, water_bodies, landcover, parks, and
// engine-v2's waterways/landcover/beach), and feature labels (`feat_...`)
// had no dedup at all. A repeated street/tram/rail/metro name, or a repeated
// named water/park feature, produced two SVG elements with the SAME id —
// which editors (Illustrator/Inkscape) silently collapse into one object,
// losing data. This test builds small synthetic (but geometrically real)
// Overpass-shaped element sets that hit every one of those collision
// classes, runs them through the real builders via a vm sandbox of the
// actual script.js (+ engine-v2.js), and asserts zero duplicate ids and
// build-to-build determinism.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── sandbox: script.js + engine-v2.js in ONE vm context ─────────────────
// vm doesn't reliably share top-level `const`s across separate
// runInContext calls, so engine-v2.js (which references script.js's
// globals directly, loaded as a classic script AFTER it) must be
// concatenated into one script — same trick tests/real-export.mjs uses.
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
    fetch: () => Promise.reject(new Error('no network in svg-id-uniqueness')),
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
  const tail = '\n;globalThis.__X={buildSVG,LAYER_REGISTRY};\nglobalThis.__X2=EngineV2;';
  vm.runInContext(scriptSrc + '\n;\n' + engineSrc + tail, sandbox, { filename: 'svg-id-uniqueness-sandbox.js' });
  return { X: sandbox.__X, X2: sandbox.__X2 };
}

const { X, X2 } = loadSandbox();
const allLayers = X.LAYER_REGISTRY.flatMap(g => g.layers);
const layerById = id => {
  const l = allLayers.find(x => x.id === id);
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
let nextId = 1;
const way = (tags, points) => {
  const id = nextId++;
  return { type: 'way', id, tags, geometry: points, nodes: points.map((_, i) => id * 1000 + i) };
};
const ring = (tags, cLat, cLon, half = 0.015) => way(tags, [
  pt(cLat - half, cLon - half), pt(cLat - half, cLon + half),
  pt(cLat + half, cLon + half), pt(cLat + half, cLon - half),
  pt(cLat - half, cLon - half),
]);

// (a) split street with the same name, three disjoint segments.
const roadElements = [
  way({ highway: 'residential', name: 'Kerkstraat' }, [pt(0.10, 0.10), pt(0.12, 0.12)]),
  way({ highway: 'residential', name: 'Kerkstraat' }, [pt(0.40, 0.40), pt(0.42, 0.42)]),
  way({ highway: 'residential', name: 'Kerkstraat' }, [pt(0.70, 0.70), pt(0.72, 0.72)]),
];
// (f) reserved structural names: roads literally named after ids the
// builders emit as literal markup ("roads", "water", "green_clip").
// Road path ids are the naked safeName(name) — no prefix — so without the
// allocator's reserved-id seeding these duplicate the structural group and
// clipPath ids document-wide.
const reservedNameRoadElements = [
  way({ highway: 'residential', name: 'roads' }, [pt(0.25, 0.25), pt(0.27, 0.27)]),
  way({ highway: 'residential', name: 'water' }, [pt(0.33, 0.55), pt(0.35, 0.57)]),
  way({ highway: 'footway', name: 'green_clip' }, [pt(0.62, 0.35), pt(0.64, 0.37)]),
];
// (e) rail sharing the street's name.
const railElements = [
  way({ railway: 'rail', name: 'Kerkstraat' }, [pt(0.15, 0.60), pt(0.17, 0.62)]),
];
// (b) tram sharing the street's name.
const tramElements = [
  way({ railway: 'tram', name: 'Kerkstraat' }, [pt(0.55, 0.15), pt(0.57, 0.17)]),
];
// (c) two DIFFERENT metro lines (distinct ref, hence distinct line-grouping
// key) whose MEMBER WAYS share the same name — the per-line uid-reset bug.
const metroElements = [
  way({ railway: 'subway', ref: 'M1', name: 'Centraal' }, [pt(0.20, 0.80), pt(0.22, 0.82)]),
  way({ railway: 'subway', ref: 'M2', name: 'Centraal' }, [pt(0.80, 0.20), pt(0.82, 0.22)]),
];
// (d) repeated named water features, far enough apart to both place.
const waterFeatureElements = [
  ring({ natural: 'water', name: 'Vijver' }, 0.10, 0.85),
  ring({ natural: 'water', name: 'Vijver' }, 0.90, 0.15),
];
// v2-only extras: waterways / landcover / beach, plus derived block layers.
const waterwayElements = [
  way({ waterway: 'stream', name: 'Beek' }, [pt(0.05, 0.50), pt(0.06, 0.51), pt(0.07, 0.52)]),
];
const landcoverElements = [ring({ natural: 'wood' }, 0.30, 0.05)];
const beachElements = [ring({ natural: 'beach' }, 0.05, 0.30)];
const cityBlocks = [
  { kind: 'urban', outer: 'M0,0L100,0L100,100L0,100Z', holes: [] },
  { kind: 'hamlet', outer: 'M200,0L300,0L300,100L200,100Z', holes: [], name: 'Gehucht' },
];
const fallbackBlocks = [
  { kind: 'fallback', outer: 'M0,200L100,200L100,300L0,300Z', holes: [] },
  { kind: 'fallback', outer: 'M200,200L300,200L300,300L200,300Z', holes: [] },
];

const clone = x => JSON.parse(JSON.stringify(x));
function buildV1Results() {
  return [
    { layer: layerById('roads'), data: { elements: clone([...roadElements, ...reservedNameRoadElements]) } },
    { layer: layerById('rail'), data: { elements: clone(railElements) } },
    { layer: layerById('tram'), data: { elements: clone(tramElements) } },
    { layer: layerById('metro'), data: { elements: clone(metroElements) } },
    { layer: layerById('street_labels'), data: { elements: clone(roadElements) } },
    { layer: layerById('water_labels'), data: { elements: clone(waterFeatureElements) } },
  ];
}
const beachLayerStub = { id: 'beach', label: 'Sand' };
function buildV2Results() {
  return [
    { layer: layerById('roads'), data: { elements: clone([...roadElements, ...reservedNameRoadElements]) } },
    { layer: layerById('rail'), data: { elements: clone(railElements) } },
    { layer: layerById('tram'), data: { elements: clone(tramElements) } },
    { layer: layerById('metro'), data: { elements: clone(metroElements) } },
    { layer: layerById('street_labels'), data: { elements: clone(roadElements) } },
    { layer: layerById('water_labels'), data: { elements: clone(waterFeatureElements) } },
    { layer: layerById('waterways'), data: { elements: clone(waterwayElements) } },
    { layer: layerById('landcover'), data: { elements: clone(landcoverElements) } },
    { layer: beachLayerStub, data: { elements: clone(beachElements) } },
    { layer: X2.cityBlocksLayer, data: { blocks: clone(cityBlocks) } },
    { layer: X2.fallbackBlocksLayer, data: { blocks: clone(fallbackBlocks), labelElements: [] } },
  ];
}

// ── id extraction / duplicate detection ──────────────────────────────────
// Matches one opening SVG tag and its attributes (order-independent), so id
// and inkscape:label can be pulled out regardless of which comes first.
const TAG_RE = /<([a-zA-Z][\w:-]*)((?:\s+[a-zA-Z:][\w:-]*="[^"]*")*)\s*\/?>/g;
function extractTaggedIds(svg) {
  const out = [];
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(svg)) !== null) {
    const [, tag, attrPart] = m;
    const idMatch = attrPart.match(/\sid="([^"]*)"/);
    if (!idMatch) continue;
    const labelMatch = attrPart.match(/\sinkscape:label="([^"]*)"/);
    out.push({ id: idMatch[1], tag, label: labelMatch ? labelMatch[1] : null });
  }
  return out;
}
function findDuplicates(items) {
  const byId = new Map();
  for (const it of items) {
    if (!byId.has(it.id)) byId.set(it.id, []);
    byId.get(it.id).push(it);
  }
  return [...byId.entries()].filter(([, arr]) => arr.length > 1);
}

let failures = 0;
const check = (name, cond) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`);
  if (!cond) failures++;
};
function reportDuplicates(label, dups) {
  for (const [id, items] of dups) {
    const ctx = items.map(it => `<${it.tag}${it.label ? ` label="${it.label}"` : ''}>`).join(', ');
    console.log(`     ${label}: id "${id}" used ${items.length}× — ${ctx}`);
  }
}
function countStartingWith(items, prefix) {
  return items.filter(it => it.id.startsWith(prefix)).length;
}

// ── v1 ────────────────────────────────────────────────────────────────
const svg1a = X.buildSVG(buildV1Results(), bbox, W, null, null, { illustratorCompatible: false });
const svg1b = X.buildSVG(buildV1Results(), bbox, W, null, null, { illustratorCompatible: false });
const svg1illustrator = X.buildSVG(buildV1Results(), bbox, W, null, null, { illustratorCompatible: true });

const ids1a = extractTaggedIds(svg1a);
const ids1b = extractTaggedIds(svg1b);
const idsIllustrator = extractTaggedIds(svg1illustrator);

const dup1a = findDuplicates(ids1a);
check('v1 standard: zero duplicate ids', dup1a.length === 0);
reportDuplicates('v1 standard', dup1a);

check('v1 standard: exercised the road/tram/rail same-name collision (≥5 "Kerkstraat" ids)',
  countStartingWith(ids1a, 'Kerkstraat') >= 5);
check('v1 standard: exercised the metro cross-line collision (≥2 "Centraal" ids)',
  countStartingWith(ids1a, 'Centraal') >= 2);
check('v1 standard: exercised the repeated feature-label collision (≥2 "feat_Vijver" ids)',
  countStartingWith(ids1a, 'feat_Vijver') >= 2);

check('v1 standard: a road named "roads" is suffixed away from the structural group id',
  ids1a.some(it => it.id === 'roads_2') && ids1a.filter(it => it.id === 'roads').length === 1);
check('v1 standard: a footway named "green_clip" cannot shadow the clipPath id',
  ids1a.some(it => it.id === 'green_clip_2') && !ids1a.some(it => it.id === 'green_clip' && it.tag === 'path'));

check('v1 standard: deterministic id sequence across two identical builds',
  ids1a.length === ids1b.length && ids1a.every((it, i) => it.id === ids1b[i].id));

const dupIllustrator = findDuplicates(idsIllustrator);
check('v1 illustrator: zero duplicate ids', dupIllustrator.length === 0);
reportDuplicates('v1 illustrator', dupIllustrator);
check('v1 illustrator: repeated feature labels still collide-free with _halo companions (≥4 "feat_Vijver" ids)',
  countStartingWith(idsIllustrator, 'feat_Vijver') >= 4);
check('v1 illustrator: every non-halo "feat_Vijver" id has a matching "_halo" companion',
  idsIllustrator.filter(it => it.id.startsWith('feat_Vijver') && !it.id.endsWith('_halo'))
    .every(it => idsIllustrator.some(o => o.id === `${it.id}_halo`)));

// ── v2 ────────────────────────────────────────────────────────────────
const svg2a = X2.buildSVG(buildV2Results(), bbox, W, null, { illustratorCompatible: false });
const svg2b = X2.buildSVG(buildV2Results(), bbox, W, null, { illustratorCompatible: false });

const ids2a = extractTaggedIds(svg2a);
const ids2b = extractTaggedIds(svg2b);
const dup2a = findDuplicates(ids2a);
check('v2: zero duplicate ids', dup2a.length === 0);
reportDuplicates('v2', dup2a);

check('v2: covers waterways/landcover/beach/city_blocks/fallback_blocks',
  ids2a.some(it => it.id.startsWith('waterway_')) &&
  ids2a.some(it => it.id.startsWith('landcover_')) &&
  ids2a.some(it => it.id.startsWith('beach_')) &&
  ids2a.some(it => it.id.startsWith('block_') || it.id.startsWith('hamlet_')) &&
  ids2a.some(it => it.id.startsWith('fallback_')));
check('v2: also exercises the shared road/tram/rail/metro/label collisions',
  countStartingWith(ids2a, 'Kerkstraat') >= 5 &&
  countStartingWith(ids2a, 'Centraal') >= 2 &&
  countStartingWith(ids2a, 'feat_Vijver') >= 2);

check('v2: reserved structural names ("roads", "water") are suffixed away from the group ids',
  ids2a.some(it => it.id === 'roads_2') && ids2a.some(it => it.id === 'water_2') &&
  ids2a.filter(it => it.id === 'roads').length === 1 && ids2a.filter(it => it.id === 'water').length <= 1);

check('v2: deterministic id sequence across two identical builds',
  ids2a.length === ids2b.length && ids2a.every((it, i) => it.id === ids2b[i].id));

console.log('');
if (failures) {
  console.log(`svg-id-uniqueness: ${failures} check(s) FAILED`);
  process.exit(1);
} else {
  console.log('PASS — svg-id-uniqueness: v1 + v2 documents have zero duplicate SVG ids, deterministically');
}
