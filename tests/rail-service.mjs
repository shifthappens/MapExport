// tests/rail-service.mjs — offline check for engine v2's two-class rail rule
// (AF-05b; decision recorded under AF-05a in the audit follow-up roadmap).
//
// A rail way carrying any service=* (yard/siding/spur/crossover) renders as
// one thin muted stroke in its own "Service tracks" group (`rail_service`),
// painted as the rail layer's first child; ways without service=* keep v1's
// full casing+sleepers+track signature untouched. v1's own builder is frozen:
// it must keep rendering every way full-signature with no rail_service group.
//
// Fixtures: normal double track (two main ways), a yard (main line + parallel
// service=yard ways), a roundhouse fan (service-only frame), a tunnel service
// way (must drop), and a named siding (id/label from its name).
//
// Loads script.js + engine-v2.js in ONE vm sandbox (same trick as
// square-labels.mjs) and drives EngineV2.buildSVG plus v1's buildRailLayer.
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
    fetch: () => Promise.reject(new Error('no network in rail-service')),
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
  const tail = '\n;globalThis.__X={buildRailLayer,makeUidGen,mergeConnectedWays,railDisplayName};\nglobalThis.__X2=EngineV2;';
  vm.runInContext(scriptSrc + '\n;\n' + engineSrc + tail, sandbox, { filename: 'rail-service-sandbox.js' });
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

// Normal double track: two parallel main ways crossing the frame.
const mainA = way({ railway: 'rail', usage: 'main' }, [pt(0.48, 0.05), pt(0.48, 0.95)]);
const mainB = way({ railway: 'rail', usage: 'main' }, [pt(0.52, 0.05), pt(0.52, 0.95)]);
// Yard: parallel service=yard ways beside the main line.
const yardWays = [0, 1, 2, 3].map(k =>
  way({ railway: 'rail', service: 'yard' }, [pt(0.56 + 0.02 * k, 0.20), pt(0.56 + 0.02 * k, 0.60)]));
// A named siding — id/label must come from its name.
const namedSiding = way({ railway: 'rail', service: 'siding', name: 'Sporen 9' },
  [pt(0.42, 0.20), pt(0.42, 0.55)]);
// OSM sometimes carries a useful line designation without a way name. The
// connected fragments should retain it as one friendly editor label.
const lineFragmentA = way({ railway: 'rail', usage: 'main', line: 'RE 1' },
  [pt(0.68, 0.10), pt(0.68, 0.45)]);
const lineFragmentB = way({ railway: 'rail', usage: 'main', line: 'RE 1' },
  [pt(0.68, 0.45), pt(0.68, 0.90)]);
lineFragmentB.nodes[0] = lineFragmentA.nodes[1];
const disconnectedLineFragment = way({ railway: 'rail', usage: 'main', line: 'RE 1' },
  [pt(0.75, 0.10), pt(0.75, 0.25)]);
const forkBase = way({ railway: 'rail', usage: 'main', line: 'RE 1' },
  [pt(0.82, 0.20), pt(0.82, 0.45)]);
const forkContinuation = way({ railway: 'rail', usage: 'main', line: 'RE 1' },
  [pt(0.82, 0.45), pt(0.82, 0.70)]);
const forkBranch = way({ railway: 'rail', usage: 'main', line: 'RE 2' },
  [pt(0.82, 0.45), pt(0.90, 0.55)]);
forkContinuation.nodes[0] = forkBase.nodes[1];
forkBranch.nodes[0] = forkBase.nodes[1];
// A service way in tunnel: the tunnel filter runs before the class split.
const tunnelService = way({ railway: 'rail', service: 'yard', tunnel: 'yes' },
  [pt(0.30, 0.20), pt(0.30, 0.55)]);
// Roundhouse fan: service ways radiating from one point (service-only frame).
const fanWays = [0, 1, 2, 3, 4].map(k =>
  way({ railway: 'rail', service: 'yard' },
    [pt(0.5, 0.5), pt(0.5 + 0.15 * Math.cos(k * 0.3), 0.5 + 0.15 * Math.sin(k * 0.3))]));

const cityBlocks = [{ kind: 'urban', outer: 'M0,0L100,0L100,100L0,100Z', holes: [] }];
const clone = x => JSON.parse(JSON.stringify(x));
function buildResults(railElements) {
  return [
    { layer: layerById('rail'), data: { elements: clone(railElements) } },
    { layer: X2.cityBlocksLayer, data: { blocks: clone(cityBlocks) } },
    { layer: X2.fallbackBlocksLayer, data: { blocks: [], labelElements: [] } },
  ];
}

// ── helpers ──────────────────────────────────────────────────────────────
function extractGroup(svgStr, id) {
  const start = svgStr.indexOf(`<g id="${id}"`);
  if (start === -1) return '';
  // group content runs to the first closing tag at its nesting level — these
  // rail sub-groups contain only <path/> children, so the first `</g>` closes it.
  const end = svgStr.indexOf('</g>', start);
  return end === -1 ? svgStr.slice(start) : svgStr.slice(start, end);
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

// ── (1) yard beside a main line ──────────────────────────────────────────
const yardFixture = [mainA, mainB, ...yardWays, namedSiding, tunnelService];
const svg = X2.buildSVG(buildResults(yardFixture), bbox, W, null, { illustratorCompatible: false });

check('rail layer group present', svg.includes('<g id="rail" inkscape:label="Railways"'));
check('rail_service group present with "Service tracks" label',
  /<g id="rail_service" inkscape:label="Service tracks"/.test(svg));
check('rail_service styled as thin muted stroke (#555555, no dasharray, no fill)',
  /<g id="rail_service"[^>]*fill="none"[^>]*stroke="#555555"[^>]*stroke-width="[\d.]+"[^>]*>/.test(svg)
  && !/<g id="rail_service"[^>]*dasharray/.test(svg));
check('rail_service paints before (under) rail_casing',
  svg.indexOf('<g id="rail_service"') !== -1
  && svg.indexOf('<g id="rail_service"') < svg.indexOf('<g id="rail_casing"'));

const serviceGroup = extractGroup(svg, 'rail_service');
const casingGroup = extractGroup(svg, 'rail_casing');
const sleepersGroup = extractGroup(svg, 'rail_sleepers');
const tracksGroup = extractGroup(svg, 'rail_tracks');
const servicePaths = [...serviceGroup.matchAll(/<path id="([^"]+)" inkscape:label="([^"]+)"/g)]
  .map(match => ({ id: match[1], label: match[2] }));

check('all four unnamed yard ways render as named service-track paths',
  servicePaths.filter(path => path.label === 'Railway · yard track').length === 4);
check('named siding renders in rail_service under its friendly name + label',
  servicePaths.some(path => path.id.startsWith('rail_service_Sporen_9') && path.label === 'Sporen 9'));
const mergedLine = X.mergeConnectedWays([lineFragmentA, lineFragmentB]);
check('connected rail fragments retain an OSM line designation',
  mergedLine.length === 1 && X.railDisplayName(mergedLine[0]) === 'RE 1');
const disconnectedMerged = X.mergeConnectedWays([lineFragmentA, lineFragmentB, disconnectedLineFragment]);
check('disconnected rail fragments stay separate despite matching metadata',
  disconnectedMerged.length === 2 && disconnectedMerged.every(el => X.railDisplayName(el) === 'RE 1'));
const forkMerged = X.mergeConnectedWays([forkBase, forkContinuation, forkBranch]);
check('rail metadata does not leak across a fork with different line designations',
  forkMerged.length === 3 && forkMerged.filter(el => X.railDisplayName(el) === 'RE 1').length === 2
  && forkMerged.filter(el => X.railDisplayName(el) === 'RE 2').length === 1);
check('service ways carry per-path opacity (crossing tracks darken each other)',
  (serviceGroup.match(/opacity="0.5"/g) || []).length === 4 + 1);
check('tunnel service way dropped entirely',
  !svg.includes(`rail_service_${tunnelService.id}`) && !svg.includes(`rail_${tunnelService.id}`));
check('no service way leaked into casing/sleepers/tracks',
  [...yardWays, namedSiding].every(w =>
    !casingGroup.includes(`_${w.id}_`) && !sleepersGroup.includes(`_${w.id}_`)
    && !tracksGroup.includes(`rail_${w.id}"`))
  && !casingGroup.includes('Sporen_9') && !tracksGroup.includes('Sporen_9'));
check('both main ways keep the full signature (2 paths in each of casing/sleepers/tracks)',
  (casingGroup.match(/<path /g) || []).length === 2
  && (sleepersGroup.match(/<path /g) || []).length === 2
  && (tracksGroup.match(/<path /g) || []).length === 2);
check('zero duplicate SVG ids', findDuplicates(extractIds(svg)).length === 0);

// determinism
const svgAgain = X2.buildSVG(buildResults(yardFixture), bbox, W, null, { illustratorCompatible: false });
check('deterministic output across two identical builds', svg === svgAgain);

// ── (2) normal double track: no service group at all ─────────────────────
const svgDouble = X2.buildSVG(buildResults([mainA, mainB]), bbox, W, null, { illustratorCompatible: false });
check('double track only: no rail_service group', !svgDouble.includes('rail_service'));
check('double track only: full signature intact',
  (extractGroup(svgDouble, 'rail_casing').match(/<path /g) || []).length === 2);

// ── (3) roundhouse fan, service-only frame: wrapper synthesized ──────────
const svgFan = X2.buildSVG(buildResults(fanWays), bbox, W, null, { illustratorCompatible: false });
check('service-only frame still gets the Railways layer wrapper',
  svgFan.includes('<g id="rail" inkscape:label="Railways" inkscape:groupmode="layer">'));
check('service-only frame: all fan ways in rail_service, no casing/sleepers/tracks groups',
  (svgFan.match(/inkscape:label="Railway · yard track"/g) || []).length === fanWays.length
  && !svgFan.includes('rail_casing') && !svgFan.includes('rail_sleepers') && !svgFan.includes('rail_tracks'));

// ── (4) v1 stays frozen: full signature for every way, no rail_service ───
const v1Rail = X.buildRailLayer(clone(yardFixture), (lat, lon) => [lon * 100, lat * 100], W, X.makeUidGen());
check('v1 builder: no rail_service group', !v1Rail.includes('rail_service'));
check('v1 builder: every way (main + service + tunnel) keeps the full signature',
  (extractGroup(v1Rail, 'rail_casing').match(/<path /g) || []).length === yardFixture.length);

// ── (5) Illustrator pipeline ─────────────────────────────────────────────
const svgI = X2.buildSVG(buildResults(yardFixture), bbox, W, null, { illustratorCompatible: true });
check('Illustrator mode: rail_service group present', /<g id="rail_service"[ >]/.test(svgI));
check('Illustrator mode: no inkscape: attributes leak', !svgI.includes('inkscape:'));

console.log('');
if (failures) {
  console.log(`rail-service: ${failures} check(s) FAILED`);
  process.exit(1);
} else {
  console.log('PASS — rail-service: service=* rail renders as thin muted hairlines under untouched main lines');
}
