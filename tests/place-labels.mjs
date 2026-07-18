// tests/place-labels.mjs — offline check for engine v2's "Place names" layer
// (AF-04): rural place nodes (village/hamlet/isolated_dwelling/farm/locality)
// become visible, editor-selectable map labels with tier hierarchy, same-name
// dedup, locality declutter and major-road avoidance.
//
// Loads script.js + engine-v2.js in ONE vm sandbox (same trick as
// square-labels.mjs) and drives EngineV2.buildSVG with a synthetic fixture.
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
    fetch: () => Promise.reject(new Error('no network in place-labels')),
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
  const tail = '\n;globalThis.__X2=EngineV2;';
  vm.runInContext(scriptSrc + '\n;\n' + engineSrc + tail, sandbox, { filename: 'place-labels-sandbox.js' });
  return { X2: sandbox.__X2 };
}

const { X2 } = loadSandbox();
const allLayers = X2.layers;
const layerById = id => {
  const l = allLayers.find(x => x.id === id);
  if (!l) throw new Error(`no such layer: ${id}`);
  return l;
};

// ── synthetic geometry ───────────────────────────────────────────────────
// W=2000 → sf≈0.403; canvas ≈ 2000×2119 px. 1.0 latFrac ≈ 2119 px,
// 1.0 lonFrac ≈ 2000 px. Same-name gap ≈ 403 px, locality spacing ≈ 242 px.
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
const placeNode = (place, name, latFrac, lonFrac) => {
  const p = pt(latFrac, lonFrac);
  return { type: 'node', id: nextId++, lat: p.lat, lon: p.lon, tags: name ? { place, name } : { place } };
};

// A primary through-road at constant latFrac 0.40, crossing the whole frame.
const primaryRoad = way({ highway: 'primary', name: 'Route Départementale' }, [pt(0.40, 0.02), pt(0.40, 0.98)]);

const placeNodes = [
  // Core tiers, spread far apart (all mutual distances >> the 403 px gap).
  placeNode('village', 'Villars', 0.55, 0.50),
  placeNode('hamlet', 'Franvache', 0.20, 0.20),
  placeNode('farm', 'Ferme du Colombier', 0.20, 0.75),
  placeNode('isolated_dwelling', 'Les Granges', 0.75, 0.25),
  // Locality far from everything → places.
  placeNode('locality', 'Les Jardis', 0.80, 0.80),
  // Second locality ≈ 140 px from Les Jardis (< 242 px spacing) → decluttered.
  placeNode('locality', 'Le Bois Mort', 0.80, 0.87),
  // Locality duplicating the hamlet's name ≈ 100 px away (< 403 px gap) →
  // same-name suppressed; the hamlet (lower rank) wins the spot.
  placeNode('locality', 'Franvache', 0.20, 0.25),
  // Nameless node → never labelled.
  placeNode('hamlet', null, 0.60, 0.30),
  // Hamlet sitting exactly ON the primary road → road-avoid skips it.
  placeNode('hamlet', 'Bord de Route', 0.40, 0.55),
  // Hamlet at the frame edge → footprint partially off-canvas → skipped.
  placeNode('hamlet', 'Randgehucht', 0.50, 0.998),
];

const cityBlocks = [
  { kind: 'urban', outer: 'M0,0L100,0L100,100L0,100Z', holes: [] },
];

const clone = x => JSON.parse(JSON.stringify(x));
function buildResults() {
  return [
    { layer: layerById('roads'), data: { elements: clone([primaryRoad]) } },
    { layer: layerById('street_labels'), data: { elements: clone([primaryRoad]) } },
    // water_labels present-but-empty: the place-label hook keys on this
    // result's presence in the assembly loop, like the square-label hook.
    { layer: layerById('water_labels'), data: { elements: [] } },
    { layer: X2.cityBlocksLayer, data: { blocks: clone(cityBlocks) } },
    { layer: X2.placeNodesLayer, data: { elements: clone(placeNodes) } },
  ];
}

// ── helpers ──────────────────────────────────────────────────────────────
function extractBoundedGroup(svgStr, id) {
  const start = svgStr.indexOf(`<g id="${id}"`);
  if (start === -1) return '';
  const rest = svgStr.slice(start);
  const nextTop = rest.slice(1).search(/<g id="[a-zA-Z_]+"[^>]*inkscape:groupmode="layer"/);
  return nextTop === -1 ? rest : rest.slice(0, nextTop + 1);
}
function extractIds(svg) {
  const TAG_RE = /<([a-zA-Z][\w:-]*)((?:\s+[a-zA-Z:][\w:-]*="[^"]*")*)\s*\/?>/g;
  const out = [];
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(svg)) !== null) {
    const [, , attrPart] = m;
    const idMatch = attrPart.match(/\sid="([^"]*)"/);
    if (!idMatch) continue;
    out.push(idMatch[1]);
  }
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

// ── standards pipeline ───────────────────────────────────────────────────
const svg = X2.buildSVG(buildResults(), bbox, W, null, { illustratorCompatible: false });
const placeGroup = extractBoundedGroup(svg, 'place_labels');

// (a) dedicated layer group with tier sub-groups.
check('output has a place_labels / "Place names" layer group',
  /<g id="place_labels" inkscape:label="Place names" inkscape:groupmode="layer"/.test(svg));
check('village sub-group present', placeGroup.includes('<g id="place_labels_village" inkscape:label="Villages">'));
check('hamlet sub-group present', placeGroup.includes('<g id="place_labels_hamlet" inkscape:label="Hamlets">'));
check('dwelling sub-group present', placeGroup.includes('<g id="place_labels_dwelling" inkscape:label="Farms &amp; dwellings">'));
check('locality sub-group present', placeGroup.includes('<g id="place_labels_locality" inkscape:label="Localities">'));

// (b) each tier's representative name is visible.
check('village label (Villars) present', placeGroup.includes('>Villars<'));
check('hamlet label (Franvache) present', placeGroup.includes('>Franvache<'));
check('farm label (Ferme du Colombier) present', placeGroup.includes('>Ferme du Colombier<'));
check('isolated_dwelling label (Les Granges) present', placeGroup.includes('>Les Granges<'));
check('far-away locality label (Les Jardis) present', placeGroup.includes('>Les Jardis<'));

// (c) declutter and dedup.
check('clustered locality (Le Bois Mort) decluttered away', !placeGroup.includes('Le Bois Mort'));
check('same-name locality duplicate suppressed (exactly one Franvache)',
  (placeGroup.match(/>Franvache</g) || []).length === 1);
const hamletSub = (placeGroup.match(/<g id="place_labels_hamlet"[^>]*>(.*?)<\/g>/s) || [])[1] || '';
check('the surviving Franvache is the hamlet (settlement tier outranks locality)',
  hamletSub.includes('>Franvache<'));
check('exactly 5 label texts (nameless, decluttered, deduped, on-road and off-frame nodes all got none)',
  (placeGroup.match(/<text /g) || []).length === 5);

// (d) main-road avoidance and canvas clipping.
check('hamlet on the primary road (Bord de Route) not labelled', !placeGroup.includes('Bord de Route'));
check('frame-edge hamlet (Randgehucht) not labelled', !placeGroup.includes('Randgehucht'));

// (e) styling split: locality italic + lighter, village heavier.
check('locality label is italic', /font-style="italic"[^>]*>Les Jardis</.test(placeGroup));
check('village label carries weight 600', /font-weight="600"[^>]*>Villars</.test(placeGroup));

// (f) no duplication into street labels; the road keeps its own label.
const streetGroup = extractBoundedGroup(svg, 'street_labels');
check('place names do not leak into street_labels', !streetGroup.includes('>Villars<'));
check('the primary road still gets its street label', streetGroup.includes('Route Départementale'));

// (g) unique ids, determinism.
const dups = findDuplicates(extractIds(svg));
check('zero duplicate SVG ids', dups.length === 0);
if (dups.length) for (const [id, n] of dups) console.log(`     dup id "${id}" ×${n}`);
const svg2 = X2.buildSVG(buildResults(), bbox, W, null, { illustratorCompatible: false });
check('deterministic output across two identical builds', svg === svg2);

// (h) input-order independence: reversed place nodes give identical labels.
const reversedResults = buildResults();
reversedResults.find(r => r.layer.id === 'place_nodes').data.elements.reverse();
const svgRev = X2.buildSVG(reversedResults, bbox, W, null, { illustratorCompatible: false });
check('place labels independent of Overpass element order',
  extractBoundedGroup(svgRev, 'place_labels') === placeGroup);

// ── Illustrator pipeline ─────────────────────────────────────────────────
const svgI = X2.buildSVG(buildResults(), bbox, W, null, { illustratorCompatible: true });
const placeGroupI = extractBoundedGroup(svgI, 'place_labels');
check('Illustrator mode: place_labels group present', /<g id="place_labels"[ >]/.test(svgI));
check('Illustrator mode: Villars label present', placeGroupI.includes('>Villars<'));
check('Illustrator mode: a "_halo" companion text exists for a place label',
  /id="place_Villars[^"]*_halo"/.test(placeGroupI));
check('Illustrator mode: no inkscape: attributes leak into that pipeline\'s output',
  !svgI.includes('inkscape:'));

console.log('');
if (failures) {
  console.log(`place-labels: ${failures} check(s) FAILED`);
  process.exit(1);
} else {
  console.log('PASS — place-labels: rural place nodes label with hierarchy, declutter, road avoidance and unique ids');
}
