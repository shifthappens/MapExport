// tests/metro-tunnel.mjs — offline check for engine v2's metro tunnel
// treatment (AF-05d).
//
// Coen's decision (2026-07-23): tunnels stay visible in the Metro layer but
// paint far more subtly than surface track — no white casing halo, a
// thinner dashed single stroke, lower opacity — while keeping the line's own
// colour so a rider can still trace which coloured line continues
// underground. Tunnel ways are pulled out of v1's frozen buildMetroLayer
// call and rendered by engine-v2.js's own renderMetroTunnelGroup, then
// spliced back in as sibling per-line groups inside the same outer "metro"
// layer wrapper v1 built for the surface ways.
//
// Three shapes exercised: a line with only surface ways (unaffected, stays
// byte-identical to v1), a line that is entirely underground (frame-wide
// surface-empty synthesis path), and a line with BOTH a surface and a
// tunnel segment (the splice path — proves the regex-anchored injection
// into v1's generated wrapper produces well-formed, singly-nested markup).
//
// Loads script.js + engine-v2.js in ONE vm sandbox (same trick as
// metro-dedup.mjs) and drives EngineV2.buildSVG plus v1's buildMetroLayer /
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
    fetch: () => Promise.reject(new Error('no network in metro-tunnel')),
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
  vm.runInContext(scriptSrc + '\n;\n' + engineSrc + tail, sandbox, { filename: 'metro-tunnel-sandbox.js' });
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
let nextId = 200;
const way = (tags, points) => {
  const id = nextId++;
  return { type: 'way', id, tags, geometry: points, nodes: points.map((_, i) => id * 1000 + i) };
};

// Line 5: pure surface, two ways.
const surfaceA = way({ railway: 'subway', ref: '5', name: 'Métro 5' }, [pt(0.10, 0.05), pt(0.10, 0.45)]);
const surfaceB = way({ railway: 'subway', ref: '5', name: 'Métro 5' }, [pt(0.12, 0.05), pt(0.12, 0.45)]);
// Line 5 also dips underground further along — same ref, mixed line.
const tunnelSeg5 = way({ railway: 'subway', ref: '5', name: 'Métro 5', tunnel: 'yes' }, [pt(0.14, 0.05), pt(0.14, 0.45)]);
// Line 7: entirely underground, no surface ways anywhere on this line.
const tunnelOnly7 = way({ railway: 'subway', ref: '7', name: 'Métro 7', tunnel: 'yes' }, [pt(0.30, 0.05), pt(0.30, 0.45)]);

const cityBlocks = [{ kind: 'urban', outer: 'M0,0L100,0L100,100L0,100Z', holes: [] }];
const clone = x => JSON.parse(JSON.stringify(x));
function buildResults(metroElements) {
  return [
    { layer: metroLayer, data: { elements: clone(metroElements) } },
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
const balancedTags = svg => (svg.match(/<g\b/g) || []).length === (svg.match(/<\/g>/g) || []).length;

let failures = 0;
const check = (name, cond) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`);
  if (!cond) failures++;
};

// ── (a) mixed frame: surface-only line, mixed line, tunnel-only line ─────
const mixed = [surfaceA, surfaceB, tunnelSeg5, tunnelOnly7];
const svg = X2.buildSVG(buildResults(mixed), bbox, W, null, { illustratorCompatible: false });

check('exactly one outer metro layer wrapper',
  (svg.match(/<g id="metro" inkscape:label="Metro \/ subway"/g) || []).length === 1);

const surfaceGroup5 = extractGroup(svg, 'metro_5');
check('surface group metro_5 present with the two surface ways only',
  surfaceGroup5.length > 0 && (surfaceGroup5.match(/<path /g) || []).length === 4 /* casing+fill × 2 ways */);
check('surface group metro_5 keeps v1\'s casing sub-group (white halo, untouched)',
  surfaceGroup5.includes('metro_5_casing'));

const tunnelGroup5 = extractGroup(svg, 'metro_5_tunnel');
check('tunnel group metro_5_tunnel present for the same line\'s underground segment',
  tunnelGroup5.length > 0);
check('tunnel group metro_5_tunnel holds exactly the one tunnel path',
  (tunnelGroup5.match(/<path /g) || []).length === 1);
check('tunnel group carries no casing sub-group (no white halo)',
  !tunnelGroup5.includes('_casing'));
check('tunnel group is dashed and painted at low opacity',
  /stroke-dasharray="[0-9.]+,[0-9.]+"/.test(tunnelGroup5) && /opacity="0\.4"/.test(tunnelGroup5));
const surfaceFillWidth5 = Number(surfaceGroup5.match(/_fill"[^>]*stroke-width="([0-9.]+)"/)?.[1]);
const tunnelWidth5 = Number(tunnelGroup5.match(/stroke-width="([0-9.]+)"/)?.[1]);
check('tunnel group stroke is thinner than the SAME line\'s actual surface fill stroke',
  Number.isFinite(surfaceFillWidth5) && Number.isFinite(tunnelWidth5) && tunnelWidth5 < surfaceFillWidth5);

// A rider tracing the coloured line underground should see the same colour
// as its surface segment, not a re-palette.
const surfaceColor5 = surfaceGroup5.match(/_fill"[^>]*stroke="([^"]+)"/)?.[1];
const tunnelColor5 = tunnelGroup5.match(/<g[^>]*\sstroke="([^"]+)"/)?.[1];
check('tunnel segment keeps the same line colour as its surface segment',
  !!surfaceColor5 && surfaceColor5 === tunnelColor5);

const tunnelGroup7 = extractGroup(svg, 'metro_7_tunnel');
check('entirely-underground line 7 renders only as a tunnel group',
  tunnelGroup7.length > 0);
check('entirely-underground line 7 has no surface metro_7 group',
  !svg.includes('<g id="metro_7"'));

check('no duplicate SVG ids across the mixed frame', findDuplicates(extractIds(svg)).length === 0);
check('mixed frame: markup is well-formed (balanced <g>/</g>)', balancedTags(svg));

// ── (b) tunnel-only frame (no surface metro ways anywhere): synthesized wrapper ──
const svgTunnelOnly = X2.buildSVG(buildResults([tunnelOnly7]), bbox, W, null, { illustratorCompatible: false });
check('tunnel-only frame still produces exactly one metro layer wrapper',
  (svgTunnelOnly.match(/<g id="metro" inkscape:label="Metro \/ subway"/g) || []).length === 1);
check('tunnel-only frame: tunnel group present', svgTunnelOnly.includes('metro_7_tunnel'));
check('tunnel-only frame: markup is well-formed (balanced <g>/</g>)', balancedTags(svgTunnelOnly));

// ── (c) surface-only frame (no tunnels at all): byte-identical to v1 ──────
const ctxSurfaceOnly = X.buildSVGContext(bbox, W, null, { illustratorCompatible: false });
const expected = X.renderLayerSVG({ layer: metroLayer, data: { elements: clone([surfaceA, surfaceB]) } }, ctxSurfaceOnly);
const svgSurfaceOnly = X2.buildSVG(buildResults([surfaceA, surfaceB]), bbox, W, null, { illustratorCompatible: false });
check('surface-only frame (no tunnels): v2 metro output byte-identical to v1',
  extractGroup(svgSurfaceOnly, 'metro') === extractGroup(expected, 'metro') && extractGroup(svgSurfaceOnly, 'metro').length > 0);

// ── (d) determinism ─────────────────────────────────────────────────────
const svgAgain = X2.buildSVG(buildResults(mixed), bbox, W, null, { illustratorCompatible: false });
check('deterministic output across two identical builds', svg === svgAgain);

console.log('');
if (failures) {
  console.log(`metro-tunnel: ${failures} check(s) FAILED`);
  process.exit(1);
} else {
  console.log('PASS — metro-tunnel: tunnel ways render as muted, casing-less, dashed per-line groups spliced into the metro layer');
}
