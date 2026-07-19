// tests/technical-names.mjs — offline check for the AF-07b editor warning:
//
// Names that read administrative/technical rather than editorial (the Paris
// cadastral "Voie FI/13" family, bare ref-like codes such as "BAD 2") are
// NEVER dropped — they still render exactly as OSM names them — but their
// editor-panel name (inkscape:label) gains a "⚠ " prefix so a designer
// reviews them in the layers panel instead of shipping them unseen.
//
// Covers: the isTechnicalName predicate against real corpus names (positives
// AND legitimate look-alikes that must stay unflagged), the three rendered-
// label surfaces (street labels, feature labels, engine v2 place labels),
// and the Illustrator pipeline (no inkscape: attributes, so no "⚠" anywhere).
//
// Loads script.js + engine-v2.js in ONE vm sandbox (same trick as
// editor-structure.mjs / rail-service.mjs).
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
    fetch: () => Promise.reject(new Error('no network in technical-names')),
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
  const tail = '\n;globalThis.__X={isTechnicalName,editorPanelName,buildLabelsLayer,buildFeatureLabelsLayer,makeProjector,makeFootprintGrid};\nglobalThis.__X2=EngineV2;';
  vm.runInContext(scriptSrc + '\n;\n' + engineSrc + tail, sandbox, { filename: 'technical-names-sandbox.js' });
  return { X: sandbox.__X, X2: sandbox.__X2 };
}

const { X, X2 } = loadSandbox();

let failures = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond || !detail ? '' : ' — ' + detail}`);
  if (!cond) failures++;
};

// ── (a) predicate against the pinned seven-city corpus ───────────────────
// Every string below is a real rendered-label name from cache/pinned/
// (2026-07-19 inventory), except the two plain-street controls at the end.
const flagged = [
  'Voie FI/13', 'Voie B/5', 'Voie H/12',            // Paris cadastral, street labels
  'Passage Commun AA/13', 'Passage Commun H/5',
  'Place FO/13',                                    // Paris cadastral, square label
  'BAD 2',                                          // Bremerhaven, water label
  'GUW4', 'K6',                                     // bare ref-like codes
];
const legit = [
  'Place du 19 Mars 1962',                          // commemorative date name
  'Allée des 116 victimes du vol AH 5017 du 24 juillet 2014',
  'An der Packhalle XIII',                          // roman numeral street
  'Rue Intérieure RATP',                            // acronym inside a real name
  'Schleuse Neuer Hafen / Sportbootschleuse',       // dual name with slash
  "'t Steegske/De frontline",                       // lowercase slash name
  '1000-Vuren',                                     // Ghent lieu-dit
  'Korenmarkt', 'Nieuwstraat',
];
for (const n of flagged) check(`flags ${JSON.stringify(n)}`, X.isTechnicalName(n) === true);
for (const n of legit) check(`keeps ${JSON.stringify(n)} unflagged`, X.isTechnicalName(n) === false);
check('editorPanelName prefixes flagged names', X.editorPanelName('Voie FI/13') === '⚠ Voie FI/13');
check('editorPanelName leaves normal names alone', X.editorPanelName('Korenmarkt') === 'Korenmarkt');

// ── shared fixtures ──────────────────────────────────────────────────────
const BBOX = { south: 51.0, west: 5.0, north: 51.01, east: 5.032 };
const W = 2000;
const { pr, H } = X.makeProjector(BBOX, W);
const way = (id, name, latFrac, tags = {}) => {
  const lat = BBOX.south + (BBOX.north - BBOX.south) * latFrac;
  const lon = f => BBOX.west + (BBOX.east - BBOX.west) * f;
  return {
    type: 'way', id, nodes: [id * 1000, id * 1000 + 1],
    geometry: [{ lat, lon: lon(0.05) }, { lat, lon: lon(0.95) }],
    tags: { highway: 'residential', name, ...tags },
  };
};
const parkNode = (id, name, latFrac, lonFrac) => ({
  type: 'node', id,
  lat: BBOX.south + (BBOX.north - BBOX.south) * latFrac,
  lon: BBOX.west + (BBOX.east - BBOX.west) * lonFrac,
  tags: { leisure: 'park', name },
});
const attrOf = (svg, textContent) => {
  const m = svg.match(new RegExp(`<text [^>]*>(?:<textPath[^>]*>)?${textContent.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}<`));
  return m ? m[0] : '';
};

// ── (b) street labels: text unchanged, panel name warned ─────────────────
{
  const svg = X.buildLabelsLayer([way(1, 'Voie FI/13', 0.3), way(2, 'Kerkstraat', 0.7)], pr, W, H);
  check('street label still renders the technical name', svg.includes('>VOIE FI/13<'));
  check('technical street: panel name gets the ⚠ prefix',
    svg.includes('inkscape:label="⚠ Voie FI/13"'));
  check('technical street: rendered text carries NO ⚠', !/>[^<]*⚠[^<]*</.test(svg));
  check('normal street: panel name stays bare',
    svg.includes('inkscape:label="Kerkstraat"') && !svg.includes('⚠ Kerkstraat'));
}

// ── (c) feature labels (parks/water/squares path): same contract ─────────
{
  const grid = X.makeFootprintGrid();
  const svg = X.buildFeatureLabelsLayer(
    [parkNode(10, 'Place FO/13', 0.3, 0.3), parkNode(11, 'Parc Kellermann', 0.7, 0.7)],
    pr, W, H, grid);
  check('feature label still renders the technical name', svg.includes('>Place FO/13<'));
  check('technical feature: panel name gets the ⚠ prefix',
    svg.includes('inkscape:label="⚠ Place FO/13"'));
  check('normal feature: panel name stays bare',
    svg.includes('inkscape:label="Parc Kellermann"') && !svg.includes('⚠ Parc Kellermann'));
}

// ── (d) engine v2 place labels: same contract ────────────────────────────
{
  const layerById = id => {
    const l = X2.layers.find(x => x.id === id);
    if (!l) throw new Error(`no such layer: ${id}`);
    return l;
  };
  const node = (place, name, latFrac, lonFrac) => ({
    type: 'node', id: 900 + Math.round(lonFrac * 100),
    lat: BBOX.south + (BBOX.north - BBOX.south) * latFrac,
    lon: BBOX.west + (BBOX.east - BBOX.west) * lonFrac,
    tags: { place, name },
  });
  const results = [
    { layer: layerById('roads'), data: { elements: [] } },
    { layer: layerById('street_labels'), data: { elements: [] } },
    { layer: layerById('water_labels'), data: { elements: [] } },
    { layer: X2.cityBlocksLayer, data: { blocks: [{ kind: 'urban', outer: 'M0,0L100,0L100,100L0,100Z', holes: [] }] } },
    { layer: X2.placeNodesLayer, data: { elements: [node('hamlet', 'GUW4', 0.25, 0.25), node('hamlet', 'Franvache', 0.75, 0.75)] } },
  ];
  const svg = X2.buildSVG(results, BBOX, W, null, { illustratorCompatible: false });
  check('place label still renders the technical name', svg.includes('>GUW4<'));
  check('technical place: panel name gets the ⚠ prefix', svg.includes('inkscape:label="⚠ GUW4"'));
  check('normal place: panel name stays bare',
    svg.includes('inkscape:label="Franvache"') && !svg.includes('⚠ Franvache'));
}

// ── (e) Illustrator pipeline: no panel labels, so no ⚠ anywhere ──────────
// The ⚠ must live ONLY in inkscape:label attributes: the Illustrator document
// wrapper strips every inkscape:* attribute at assembly (script.js
// buildIllustratorSVG), so nothing may put the marker in ids or text content.
{
  const grid = X.makeFootprintGrid();
  const feat = X.buildFeatureLabelsLayer([parkNode(20, 'Place FO/13', 0.3, 0.3)], pr, W, H, grid,
    undefined, { illustratorCompatible: true });
  check('Illustrator feature labels render the name without ⚠',
    feat.includes('>Place FO/13<') && !feat.includes('⚠'));
  // Builder-level street output still carries inkscape:label (the wrapper
  // strips it later) — apply the wrapper's own strip regex and require the
  // marker to vanish with it.
  const street = X.buildLabelsLayer([way(21, 'Voie FI/13', 0.7)], pr, W, H, undefined,
    undefined, { illustratorCompatible: true })
    .replace(/ inkscape:[\w-]+="[^"]*"/g, '');
  check('Illustrator street labels carry no ⚠ once the wrapper strips inkscape:*',
    street.includes('>VOIE FI/13<') && !street.includes('⚠') && !street.includes('inkscape:'));
}

// ── (f) engine v2 Illustrator document: no ⚠, no inkscape:, name intact ──
{
  const layerById = id => X2.layers.find(x => x.id === id);
  const node = (place, name, latFrac, lonFrac) => ({
    type: 'node', id: 950 + Math.round(lonFrac * 100),
    lat: BBOX.south + (BBOX.north - BBOX.south) * latFrac,
    lon: BBOX.west + (BBOX.east - BBOX.west) * lonFrac,
    tags: { place, name },
  });
  const results = [
    { layer: layerById('roads'), data: { elements: [] } },
    { layer: layerById('street_labels'), data: { elements: [] } },
    { layer: layerById('water_labels'), data: { elements: [] } },
    { layer: X2.cityBlocksLayer, data: { blocks: [{ kind: 'urban', outer: 'M0,0L100,0L100,100L0,100Z', holes: [] }] } },
    { layer: X2.placeNodesLayer, data: { elements: [node('hamlet', 'GUW4', 0.25, 0.25)] } },
  ];
  const svg = X2.buildSVG(results, BBOX, W, null, { illustratorCompatible: true });
  check('v2 Illustrator document renders the technical name without ⚠',
    svg.includes('>GUW4<') && !svg.includes('⚠'));
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
