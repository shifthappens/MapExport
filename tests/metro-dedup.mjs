// tests/metro-dedup.mjs — offline check for engine v2's metro service filter +
// ref normalization (AF-05c).
//
// Two v2-only, v1-frozen rules over the metro fetch:
//  1. Service filter: any way carrying service=* (yard/spur/crossover/siding)
//     is dropped from the metro layer entirely — no muted group like rail's,
//     because the Metro layer is a schematic overlay of rider-facing lines;
//     the depot AREA still shows via the landuse=railway fallback patch.
//     Tunnels are NOT filtered (pending AF-05d — metro tunnel main ways
//     render deliberately).
//  2. Ref normalization: v1's buildMetroLayer groups by
//     ref||name||colour||color, so a way with `name` but no `ref` fragments
//     its line into a second, differently-coloured group. v2 pre-passes a
//     name→ref map built from the surviving public ways carrying BOTH tags,
//     then stamps the mapped ref onto ref-less ways sharing that name — a
//     shallow copy, never mutating the cached element. A name mapping to
//     more than one distinct ref is ambiguous and is never merged.
//
// Tunnel ways are NOT filtered here (unlike service ways) — they still
// render, but AF-05d pulls them into their own muted per-line group instead
// of v1's full casing+fill treatment. That styling/splice contract has its
// own dedicated coverage in tests/metro-tunnel.mjs; this file only checks
// that a tunnel way still produces SOME output post-dedup.
//
// Fixtures modeled on the measured Paris subway bbox (167 ways): a two-way
// main line (ref+name), a ref-less straggler sharing that line's name, an
// unnamed service=yard way, a named service=spur way, a ref+name-carrying
// service=crossover way, a tunnel main way, and an ambiguous-name trio (two
// refs sharing one name, plus a ref-less third).
//
// Loads script.js + engine-v2.js in ONE vm sandbox (same trick as
// rail-service.mjs) and drives EngineV2.buildSVG plus v1's buildMetroLayer /
// renderLayerSVG directly.
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
    fetch: () => Promise.reject(new Error('no network in metro-dedup')),
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
  const tail = '\n;globalThis.__X={buildMetroLayer,renderLayerSVG,buildSVGContext,makeUidGen};\nglobalThis.__X2=EngineV2;';
  vm.runInContext(scriptSrc + '\n;\n' + engineSrc + tail, sandbox, { filename: 'metro-dedup-sandbox.js' });
  return { X: sandbox.__X, X2: sandbox.__X2 };
}

const { X, X2 } = loadSandbox();
const layerById = id => {
  const l = X2.layers.find(x => x.id === id);
  if (!l) throw new Error(`no such layer: ${id}`);
  return l;
};
const metroLayer = layerById('metro');

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

// A two-way main line, ref + name.
const mainA = way({ railway: 'subway', ref: '5', name: 'Métro 5', usage: 'main' },
  [pt(0.10, 0.05), pt(0.10, 0.45)]);
const mainB = way({ railway: 'subway', ref: '5', name: 'Métro 5' },
  [pt(0.12, 0.05), pt(0.12, 0.45)]);
// Ref-less straggler sharing the same line's name — should merge into metro_5.
const straggler5 = way({ railway: 'subway', name: 'Métro 5' },
  [pt(0.14, 0.05), pt(0.14, 0.45)]);

// Unnamed depot track — plain service=yard.
const yardUnnamed = way({ railway: 'subway', service: 'yard' },
  [pt(0.20, 0.55), pt(0.20, 0.60)]);
// Unnamed service siding — the fourth common service=* value.
const sidingUnnamed = way({ railway: 'subway', service: 'siding' },
  [pt(0.21, 0.55), pt(0.21, 0.60)]);
// Named service=spur way (measured fixture from Paris).
const namedSpur = way({ railway: 'subway', service: 'spur', name: 'Raccordement lignes 5 et 7' },
  [pt(0.22, 0.55), pt(0.22, 0.60)]);
// Crossover carrying BOTH ref and name, but service=* — must still drop.
const crossoverRefCarrying = way({ railway: 'subway', service: 'crossover', ref: '6', name: 'Métro 6' },
  [pt(0.24, 0.55), pt(0.24, 0.60)]);

// Tunnel main way — must still render in v2, in its own muted tunnel group
// (AF-05d; see tests/metro-tunnel.mjs for the styling/splice contract itself).
const tunnelMain = way({ railway: 'subway', ref: '7', name: 'Métro 7', tunnel: 'yes' },
  [pt(0.30, 0.05), pt(0.30, 0.45)]);

// Ambiguous name: two refs share one name, plus a ref-less third way with
// the same name — must NOT merge into either group.
const ambRef1 = way({ railway: 'subway', ref: '1', name: 'Métro X' }, [pt(0.40, 0.05), pt(0.40, 0.20)]);
const ambRef2 = way({ railway: 'subway', ref: '2', name: 'Métro X' }, [pt(0.42, 0.05), pt(0.42, 0.20)]);
const ambStraggler = way({ railway: 'subway', name: 'Métro X' }, [pt(0.44, 0.05), pt(0.44, 0.20)]);

const cityBlocks = [{ kind: 'urban', outer: 'M0,0L100,0L100,100L0,100Z', holes: [] }];
const clone = x => JSON.parse(JSON.stringify(x));
function buildResults(metroElements, copyInput = true) {
  return [
    { layer: metroLayer, data: { elements: copyInput ? clone(metroElements) : metroElements } },
    { layer: X2.cityBlocksLayer, data: { blocks: clone(cityBlocks) } },
    { layer: X2.fallbackBlocksLayer, data: { blocks: [], labelElements: [] } },
  ];
}

// ── helpers ──────────────────────────────────────────────────────────────
function extractGroup(svgStr, id) {
  const start = svgStr.indexOf(`<g id="${id}"`);
  if (start === -1) return '';
  const tagRe = /<g\b[^>]*>|<\/g>/g;
  tagRe.lastIndex = start;
  let depth = 0, match;
  while ((match = tagRe.exec(svgStr)) !== null) {
    if (match[0].startsWith('</')) depth--;
    else depth++;
    if (depth === 0) return svgStr.slice(start, tagRe.lastIndex);
  }
  return svgStr.slice(start);
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

// ── (a) all flavors of service ways absent from output ───────────────────
const mixedFixture = [mainA, mainB, straggler5, yardUnnamed, sidingUnnamed, namedSpur, crossoverRefCarrying, tunnelMain];
const svg = X2.buildSVG(buildResults(mixedFixture), bbox, W, null, { illustratorCompatible: false });
const ctxMixed = X.buildSVGContext(bbox, W, null, { illustratorCompatible: false });
const v1MixedSvg = X.renderLayerSVG({ layer: metroLayer, data: { elements: clone(mixedFixture) } }, ctxMixed);

check('metro layer group present', svg.includes('<g id="metro" inkscape:label="Metro / subway"'));
check('unnamed service=yard way absent from output', !svg.includes(`rail_service_${yardUnnamed.id}`) && !new RegExp(`"[^"]*${yardUnnamed.id}[^"]*"`).test(svg.replace(mainA.id, '').replace(mainB.id, '')));
check('unnamed service=yard way id never appears as a metro path id',
  !svg.includes(`metro_${yardUnnamed.id}`) && !svg.includes(`metro_${yardUnnamed.id}_casing`));
check('unnamed service=siding way id never appears as a metro path id',
  !svg.includes(`metro_${sidingUnnamed.id}`) && !svg.includes(`metro_${sidingUnnamed.id}_casing`));
check('named service=spur way (with name) is absent',
  !svg.includes('Raccordement'));
check('ref+name-carrying service=crossover way is absent despite carrying ref/name',
  !svg.includes('Métro 6') && !svg.includes(`metro_6`));

// ── (b) no metro_metro_default group when only unnamed ways are service ──
const onlyServiceFixture = [yardUnnamed];
const svgOnlyService = X2.buildSVG(buildResults(onlyServiceFixture), bbox, W, null, { illustratorCompatible: false });
check('service-only unnamed input: no metro layer at all', !svgOnlyService.includes('<g id="metro"'));
check('service-only unnamed input: no metro_metro_default group', !svgOnlyService.includes('metro_metro_default'));

// ── (c) ref-less named straggler merges into the ref group ────────────────
const metro5Group = extractGroup(svg, 'metro_5');
check('metro_5 group present', metro5Group.length > 0);
check('no fragment group for the ref-less straggler (no metro_M_tro_5-style id)',
  !svg.includes('metro_M') || !new RegExp(`metro_M[^"]*tro_5`).test(svg));
check('metro_5 group holds three paths (mainA, mainB, straggler5)',
  (metro5Group.match(/<path /g) || []).length === 6 /* casing+fill per way */);

// ── (d) ambiguous name does not merge ─────────────────────────────────────
const ambigFixture = [ambRef1, ambRef2, ambStraggler];
const svgAmbig = X2.buildSVG(buildResults(ambigFixture), bbox, W, null, { illustratorCompatible: false });
const group1 = extractGroup(svgAmbig, 'metro_1');
const group2 = extractGroup(svgAmbig, 'metro_2');
check('ambiguous-name refs 1 and 2 keep their own separate groups',
  group1.length > 0 && group2.length > 0);
check('ambiguous straggler not merged into either ref group',
  (group1.match(/<path /g) || []).length === 2 && (group2.match(/<path /g) || []).length === 2);
check('ambiguous straggler still renders as its own fragment (by name key)',
  extractGroup(svgAmbig, 'metro_M_tro_X').length > 0);
check('ambiguous straggler group differs from metro_1 / metro_2',
  !group1.includes('metro_M_tro_X') && !group2.includes('metro_M_tro_X'));

// ── (e) byte-identical to v1 for clean input (no service, no stragglers,
// no tunnels — AF-05d gives tunnel ways their own v2-only treatment, so a
// tunnel way in the fixture would no longer match v1's output byte-for-byte;
// that split is covered separately in tests/metro-tunnel.mjs) ─────────────
const cleanFixture = [mainA, mainB];
const ctxClean = X.buildSVGContext(bbox, W, null, { illustratorCompatible: false });
const expectedMetro = X.renderLayerSVG({ layer: metroLayer, data: { elements: clone(cleanFixture) } }, ctxClean);
const svgClean = X2.buildSVG(buildResults(cleanFixture), bbox, W, null, { illustratorCompatible: false });
const actualMetro = extractGroup(svgClean, 'metro');
const expectedMetroTrimmed = extractGroup(expectedMetro, 'metro');
check('clean input: v2 metro output byte-identical to v1 renderLayerSVG',
  actualMetro === expectedMetroTrimmed && actualMetro.length > 0);

// ── (f) v1 stays frozen: service ways still render via v1's own builder ──
const v1Metro = X.buildMetroLayer(clone(mixedFixture), (lat, lon) => [lon * 100, lat * 100], W, X.makeUidGen());
const v1YardOnly = X.buildMetroLayer(clone([yardUnnamed]), (lat, lon) => [lon * 100, lat * 100], W, X.makeUidGen());
check('v1 builder: unnamed service=yard way still renders untouched',
  v1YardOnly.includes(`Metro (${yardUnnamed.id})`) && v1YardOnly.includes(`metro_${yardUnnamed.id}`));
check('v1 builder: named spur way keeps rendering', v1Metro.includes('Raccordement'));
check('v1 builder: crossover way keeps rendering', v1Metro.includes('Métro 6'));

// ── (g) tunnel main ways still render in v2, in their own tunnel group ────
// (full styling/splice contract covered in tests/metro-tunnel.mjs; here we
// just confirm AF-05c's service-filter/dedup pass doesn't eat the tunnel way
// and that v1 stays frozen — it still renders ref 7 with the full,
// un-muted casing+fill signature the tunnel treatment deliberately departs
// from).
const v2Tunnel7 = extractGroup(svg, 'metro_7_tunnel');
check('tunnel main way (ref 7) renders in its own metro_7_tunnel group',
  v2Tunnel7.length > 0 && v2Tunnel7.includes('Métro 7'));
check('no surface metro_7 group exists (ref 7 has no surface ways in this fixture)',
  !svg.includes('<g id="metro_7"'));
const v1Metro7 = extractGroup(v1MixedSvg, 'metro_7');
check('v1 stays frozen: tunnel way still gets the full un-muted casing+fill group',
  v1Metro7.includes('metro_7_casing'));
// The AF-05c palette-stability guarantee: v2's stableColors map is built from
// v1's own would-be assignment across the UNFILTERED element set, so ref 7
// must land on the same colour it would get from v1 rendering everything
// (service ways included) — not a colour shifted by the dropped groups. Ref
// 7 is tunnel-only in this fixture, so its surviving v2 colour now lives on
// the tunnel group rather than a `_fill` sub-group.
const v1Color7 = v1Metro7.match(/_fill"[^>]*stroke="([^"]+)"/)?.[1];
const v2TunnelColor7 = v2Tunnel7.match(/<g[^>]*\sstroke="([^"]+)"/)?.[1];
check('surviving public-line palette colour stays stable after service groups drop (ref 7)',
  !!v1Color7 && v1Color7 === v2TunnelColor7);

// ── (h) no duplicate SVG ids ──────────────────────────────────────────────
check('no duplicate SVG ids (mixed fixture)', findDuplicates(extractIds(svg)).length === 0);
check('no duplicate SVG ids (ambiguous fixture)', findDuplicates(extractIds(svgAmbig)).length === 0);
check('no duplicate SVG ids (clean fixture)', findDuplicates(extractIds(svgClean)).length === 0);

// determinism
const svgAgain = X2.buildSVG(buildResults(mixedFixture), bbox, W, null, { illustratorCompatible: false });
check('deterministic output across two identical builds', svg === svgAgain);

// Input data is cache-owned in the browser; normalization must never stamp a
// synthetic ref back onto it, including when buildSVG receives that array
// directly rather than the cloned fixtures used above.
const mutationMain = way({ railway: 'subway', ref: '8', name: 'Métro 8' },
  [pt(0.50, 0.05), pt(0.50, 0.20)]);
const mutationProbe = way({ railway: 'subway', name: 'Métro 8' },
  [pt(0.52, 0.05), pt(0.52, 0.20)]);
X2.buildSVG(buildResults([mutationMain, mutationProbe], false), bbox, W, null, { illustratorCompatible: false });
check('normalization does not mutate the cache-owned source element',
  !Object.hasOwn(mutationProbe.tags, 'ref'));

console.log('');
if (failures) {
  console.log(`metro-dedup: ${failures} check(s) FAILED`);
  process.exit(1);
} else {
  console.log('PASS — metro-dedup: service=* metro ways drop; ref-less named ways rejoin their line, ambiguous names never guess');
}
