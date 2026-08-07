// tests/square-labels.mjs — offline check for engine v2's "Square & Plaza Labels"
// label group (AF-02b): named squares get their own editor layer, separate
// from "Water & park names" and from street labels, so the same plaza never
// carries two names.
//
// Loads script.js + engine-v2.js in ONE vm sandbox (same trick as
// svg-id-uniqueness.mjs) and drives EngineV2.buildSVG with a small synthetic
// fixture: a named closed pedestrian square (isSquareTagged-conformant), an
// unnamed square, a named park and a named street.
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
    fetch: () => Promise.reject(new Error('no network in square-labels')),
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
  vm.runInContext(scriptSrc + '\n;\n' + engineSrc + tail, sandbox, { filename: 'square-labels-sandbox.js' });
  return { X: sandbox.__X, X2: sandbox.__X2 };
}

const { X2 } = loadSandbox();
const allLayers = X2.layers;
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
// Closed ring (first point repeated), area=yes + highway=pedestrian — exactly
// isSquareElement's predicate: type 'way', geometry.length >= 4,
// isSquareTagged (area=yes or place=square), not a roundabout, closed.
const closedSquare = (tags, cLat, cLon, half = 0.02) => way(tags, [
  pt(cLat - half, cLon - half), pt(cLat - half, cLon + half),
  pt(cLat + half, cLon + half), pt(cLat + half, cLon - half),
  pt(cLat - half, cLon - half),
]);

const namedSquare = closedSquare({ highway: 'pedestrian', area: 'yes', name: 'Domplatz' }, 0.30, 0.30);
const unnamedSquare = closedSquare({ highway: 'pedestrian', area: 'yes' }, 0.70, 0.70);
// A plaza tagged ONLY place=square (no highway tag): never in the roads
// fetch, so it arrives via the label-only area sweep → classified.labelOnly →
// the fallback result's labelElements. Must still get its square label.
const placeOnlySquare = closedSquare({ place: 'square', name: 'Rathausplatz' }, 0.55, 0.45);
const namedPark = way({ leisure: 'park', name: 'Stadspark' }, [
  pt(0.10, 0.85), pt(0.10, 0.95), pt(0.20, 0.95), pt(0.20, 0.85), pt(0.10, 0.85),
]);
const namedStreet = way({ highway: 'residential', name: 'Kerkstraat' }, [pt(0.5, 0.05), pt(0.55, 0.10)]);

const roadElements = [namedSquare, unnamedSquare, namedStreet];
const streetLabelElements = [namedSquare, unnamedSquare, namedStreet];
const waterLabelElements = [namedPark];

const cityBlocks = [
  { kind: 'urban', outer: 'M0,0L100,0L100,100L0,100Z', holes: [] },
];

const clone = x => JSON.parse(JSON.stringify(x));
function buildResults() {
  return [
    { layer: layerById('roads'), data: { elements: clone(roadElements) } },
    { layer: layerById('street_labels'), data: { elements: clone(streetLabelElements) } },
    { layer: layerById('water_labels'), data: { elements: clone(waterLabelElements) } },
    { layer: X2.cityBlocksLayer, data: { blocks: clone(cityBlocks) } },
    // labelElements carries the label-only sweep (classified.labelOnly).
    // namedSquare rides here TOO — a plaza tagged both highway=pedestrian and
    // place=square appears in the roads result and the sweep, and must still
    // produce exactly one label (id-dedup in the square scan).
    { layer: X2.fallbackBlocksLayer, data: { blocks: [], labelElements: clone([placeOnlySquare, namedSquare]) } },
  ];
}

// ── helpers ──────────────────────────────────────────────────────────────
// Slices from a top-level layer group's opening tag up to (but not
// including) the next top-level layer group's opening tag — good enough for
// this fixture's small, flat set of layer groups with no nested
// `inkscape:groupmode="layer"` groups inside their content.
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

// (a) dedicated "square_labels" / "Square & Plaza Labels" group with the plaza name.
check('output has a square_labels / "Square & Plaza Labels" group',
  /<g id="square_labels" inkscape:label="Square &amp; Plaza Labels"/.test(svg));
const squareGroup = extractBoundedGroup(svg, 'square_labels');
check('square_labels contains the correctly capitalised child label',
  !!squareGroup && /<g id="square_plaza_labels" inkscape:label="Square &amp; plaza labels">/.test(squareGroup));
check('square_labels group contains the named square\'s label text',
  !!squareGroup && squareGroup.includes('>Domplatz<'));

// (c) unnamed square gets no label: exactly one label text inside
// square_labels (Domplatz), and no stray "feat_" id for the unnamed one.
const squareLabelCount = (svg.match(/<g id="square_labels"/g) || []).length;
check('exactly one square_labels group (unnamed square did not spawn its own)', squareLabelCount === 1);
const squareLabelTextCount = squareGroup ? (squareGroup.match(/<text /g) || []).length : 0;
check('square_labels group has exactly two labels (unnamed square got none; Domplatz deduped across roads + sweep)',
  squareLabelTextCount === 2);

// (g) a place=square-only plaza (no highway tag, arrives via the label-only
// sweep) still gets its square label — and only one, in the squares group.
check('place=square-only plaza (Rathausplatz) gets a square label',
  !!squareGroup && squareGroup.includes('>Rathausplatz<'));
check('Domplatz appears exactly once in square_labels (roads/sweep duplicate deduped by element id)',
  ((squareGroup.match(/>Domplatz</g) || []).length === 1));

// (b) the plaza name is NOT duplicated into the street_labels group.
const streetGroupBounded = extractBoundedGroup(svg, 'street_labels');
check('street_labels group exists', streetGroupBounded.includes('<g id="street_labels"'));
check('Domplatz does NOT appear as a street label',
  !streetGroupBounded.includes('>Domplatz<'));
check('Kerkstraat still appears as a street label (regression: real streets keep labelling)',
  streetGroupBounded.includes('Kerkstraat'));

// (d) park name still in water_labels (regression).
const waterGroupBounded = extractBoundedGroup(svg, 'water_labels');
check('Stadspark (named park) still renders inside water_labels', waterGroupBounded.includes('>Stadspark<'));
check('Domplatz is NOT inside water_labels (moved out of the park hack)',
  !waterGroupBounded.includes('>Domplatz<'));

// (e) no duplicate SVG ids.
const ids = extractIds(svg);
const dups = findDuplicates(ids);
check('zero duplicate SVG ids', dups.length === 0);
if (dups.length) for (const [id, n] of dups) console.log(`     dup id "${id}" ×${n}`);

// (f) determinism across two identical builds.
const svg2 = X2.buildSVG(buildResults(), bbox, W, null, { illustratorCompatible: false });
check('deterministic output across two identical builds', svg === svg2);

// ── Illustrator pipeline ─────────────────────────────────────────────────
const svgI = X2.buildSVG(buildResults(), bbox, W, null, { illustratorCompatible: true });
// Illustrator mode strips inkscape:* attributes entirely (see wrapSVGIllustrator),
// so only the id survives there — the inkscape:label assertion belongs to the
// standards-pipeline check above.
check('Illustrator mode: square_labels group present', /<g id="square_labels"[ >]/.test(svgI));
const squareGroupI = extractBoundedGroup(svgI, 'square_labels');
check('Illustrator mode: square label child group present', /<g id="square_plaza_labels"[ >]/.test(squareGroupI));
check('Illustrator mode: Domplatz label present', squareGroupI.includes('>Domplatz<'));
check('Illustrator mode: a "_halo" companion text exists for the square label',
  /id="feat_Domplatz[^"]*_halo"/.test(squareGroupI));
check('Illustrator mode: no inkscape: attributes leak into that pipeline\'s output',
  !svgI.includes('inkscape:'));

console.log('');
if (failures) {
  console.log(`square-labels: ${failures} check(s) FAILED`);
  process.exit(1);
} else {
  console.log('PASS — square-labels: named squares get their own "Square & Plaza Labels" group, no street-label duplicate');
}
