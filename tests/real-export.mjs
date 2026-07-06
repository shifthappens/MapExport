// tests/real-export.mjs — headless real-world export against the LIVE local stack.
//
// Runs the actual shipped code (script.min.js) outside a browser: fetches each
// layer through the running cache.php (Apache+mod_php on :8080), hitting Overpass
// on a miss and writing the result back to cache/. City blocks (normally a Web
// Worker) are computed here in a vm sandbox with ClipperLib. The assembled SVG is
// saved to exports/ using the app's own filename format, as a committable trail.
//
// Prereqs: `lamp start` (Apache serving ~/Sites at :8080). See
// memory/reference_lamp_server.md.
//
// Usage:
//   node tests/real-export.mjs                          # default Tilburg bbox, A3
//   node tests/real-export.mjs ghent                    # named test area (see CITIES)
//   node tests/real-export.mjs 51.545,5.07,51.562,5.1 a3_300
//   node tests/real-export.mjs <city|s,w,n,e> <a4_300|a3_300|a2_300|a1_300> [--record] [--illustrator]
//
// --illustrator additionally writes the Illustrator-compatible variant of the
// same export (suffix `-illustrator`) from the same fetched data, with its own
// profile assertions (no textPath/inkscape:/xlink/paint-order markup).
//
// This is a TEST, not just a demo: it exits non-zero when the export is
// broken — a default-on layer under its per-city floor (tests/expectations.json),
// zero roads/labels, or any svg-lint error (NaN, empty/mirrored/upside-down
// labels, dangling textPath refs). --record captures this run's counts ×0.5
// as the named city's floors; do that only on a visually APPROVED run.
//
// Tilburg is the gate: run + visually verify Tilburg first, and run the other
// cities only after the Tilburg result has been approved (see tests/README.md).
import fs from 'node:fs';
import os from 'node:os';
import vm from 'node:vm';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { lintSvg } from './svg-lint.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://localhost:8080/mapexport/';
// overpass-api.de returns HTTP 406 for an empty/browser User-Agent (node's
// undici sends none); a descriptive UA gets 200. Browser sets its own UA.
const OVERPASS_UA = 'MapExport/1.0 (+https://coen.at; hello@coen.at)';
const CLIPPER_URL = 'https://cdn.jsdelivr.net/npm/clipper-lib@6.4.2/clipper.min.js';

// ── named test areas (s,w,n,e) ────────────────────────────────────
// Comparable city chunks with mixed cartographic content (water, rail, parks,
// dense + sparse streets). Tilburg is the default and the approval gate; the
// others exist to surface layout bugs Tilburg doesn't (medieval core, grand
// boulevards, harbour, high-latitude grid).
const CITIES = {
  tilburg:     '51.545,5.07,51.562,5.1',
  ghent:       '51.03438,3.70857,51.06093,3.74599',
  paris:       '48.81896,2.33906,48.84935,2.39433',
  bremerhaven: '53.51265,8.56247,53.56336,8.61380',
  oulu:        '64.99163,25.43747,65.02165,25.51197',
};

// ── args ──────────────────────────────────────────────────────────
const flags = process.argv.slice(2).filter(a => a.startsWith('--'));
const [areaArg, sizeArg = 'a3_300'] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const recordExpectations = flags.includes('--record');
const alsoIllustrator = flags.includes('--illustrator');
const citySlug = !areaArg ? 'tilburg' : (CITIES[areaArg.toLowerCase()] ? areaArg.toLowerCase() : 'custom');
const [south, west, north, east] = (citySlug === 'custom' ? areaArg : CITIES[citySlug]).split(',').map(Number);
const bbox = { south, west, north, east };
const bboxStr = `${south},${west},${north},${east}`;

// ── this harness runs the actual shipped (minified) code, not script.js ──
// script.min.js is a gitignored build artifact, not needed for normal dev
// (index.html loads script.js directly). Build it fresh here so this test
// always exercises the current source through the real minifier.
console.log('building script.min.js…');
execFileSync('bash', [path.join(REPO, 'tools/minify.sh'), 'js'], { stdio: 'inherit' });

// ── load shipped code into a vm sandbox with browser stubs ─────────
let src = fs.readFileSync(path.join(REPO, 'script.min.js'), 'utf8')
  + '\n;globalThis.__x={LAYER_REGISTRY,fetchLayer,buildSVG,makeProjector,prepareBlockData,BLOCK_WORKER_SRC,PRINT_SIZES,PRINT_PHYSICAL_MM,activePreset};';

const tally = { hit: 0, miss: 0, write: 0, overpass: 0 };
const pendingPosts = []; // fire-and-forget cacheSet POSTs, drained before exit
const realFetch = globalThis.fetch;
async function shimFetch(url, opts) {
  if (typeof url === 'string' && !/^https?:/.test(url)) {
    const p = realFetch(BASE + url, opts);
    if (opts && opts.method === 'POST') {
      tally.write++; console.log('   WRITE  ' + decodeURIComponent(url.slice(0, 88)));
      pendingPosts.push(p.catch(() => {}));
    }
    const res = await p;
    const get = !opts || !opts.method || opts.method === 'GET';
    if (url.startsWith('cache.php?key=') && get) (res.headers.get('x-cache') === 'HIT' ? tally.hit++ : tally.miss++);
    return res;
  }
  tally.overpass++; console.log('   OVERPASS ' + new URL(url).hostname);
  return realFetch(url, { ...opts, headers: { ...(opts && opts.headers), 'User-Agent': OVERPASS_UA } });
}

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
  console, fetch: shimFetch, setTimeout, clearTimeout, queueMicrotask, performance,
  Blob, Response, Request, Headers, URL, AbortSignal, CompressionStream, TextEncoder, TextDecoder,
  document: { getElementById: () => elProxy, querySelector: () => elProxy, querySelectorAll: () => [], createElement: () => elProxy, createElementNS: () => elProxy, addEventListener() {}, body: elProxy, documentElement: elProxy },
  navigator: { userAgent: 'node', clipboard: {} },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
};
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const X = sandbox.__x;

// ── ClipperLib (cached in the OS temp dir; the app loads it from a CDN) ──
async function getClipperSrc() {
  const cached = path.join(os.tmpdir(), 'mapexport-clipper-6.4.2.min.js');
  if (fs.existsSync(cached) && fs.statSync(cached).size > 50000) return fs.readFileSync(cached, 'utf8');
  const txt = await (await realFetch(CLIPPER_URL)).text();
  fs.writeFileSync(cached, txt);
  return txt;
}

// Run the block Web Worker source headlessly: synchronous onmessage -> postMessage('done').
function computeBlocks(data, clipperSrc) {
  if (!data.lines.length && !data.areas.length) return [];
  let blocks = [];
  const w = { console, navigator: { userAgent: 'chrome', appName: 'Netscape' } };
  w.self = w; w.window = w; w.globalThis = w;
  w.postMessage = (msg) => { if (msg && msg.type === 'done') blocks = msg.blocks; };
  w.importScripts = () => vm.runInContext(clipperSrc, w); // ignore URL, eval cached source
  vm.createContext(w);
  vm.runInContext(X.BLOCK_WORKER_SRC, w); // defines self.onmessage, loads ClipperLib
  w.onmessage({ data });
  return blocks;
}

// ── run ───────────────────────────────────────────────────────────
const W = X.PRINT_SIZES[sizeArg] || 4961;
const physicalWidthMm = X.PRINT_PHYSICAL_MM[sizeArg] || null;
const allLayers = X.LAYER_REGISTRY.flatMap(g => g.layers);
const fetchable = allLayers.filter(l => l.defaultOn && l.overpassQuery);
const cityBlocks = allLayers.find(l => l.id === 'city_blocks');

console.log(`area ${citySlug}  bbox ${bboxStr}  size ${sizeArg} (${W}px / ${physicalWidthMm}mm)`);
const results = [];
const layerCounts = {};
for (const layer of fetchable) {
  const t0 = Date.now();
  const { elements } = await X.fetchLayer(layer, bboxStr, bbox);
  const kept = layer.tagFilter ? elements.filter(layer.tagFilter) : elements;
  results.push({ layer, data: { elements: kept } });
  layerCounts[layer.id] = kept.length;
  console.log(`${layer.id.padEnd(14)} ${String(kept.length).padStart(6)} elements  (${Date.now() - t0}ms)`);
}

// city blocks (derived) — compute then add an empty result so buildSVG renders them
let blocks = [];
if (cityBlocks) {
  const { pr, H } = X.makeProjector(bbox, W);
  const data = X.prepareBlockData(results, pr, W, H);
  blocks = computeBlocks(data, await getClipperSrc());
  results.push({ layer: cityBlocks, data: { elements: [] } });
  console.log(`city_blocks    ${String(blocks.length).padStart(6)} blocks`);
}

const svg = X.buildSVG(results, bbox, W, physicalWidthMm, blocks);
// YYYY-MM-DD-HHMMSS (local time), matching the web app, so same-day exports don't collide.
const d = new Date(), p2 = n => String(n).padStart(2, '0');
const stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
const filename = `map-${X.activePreset}-${citySlug}-${stamp}.svg`;
const dir = path.join(REPO, 'exports');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, filename), svg);

// ── Illustrator-compatible variant: same fetched data, second pipeline ──
let illustratorFilename = null;
const illustratorFailures = [];
if (alsoIllustrator) {
  const illustratorSvg = X.buildSVG(results, bbox, W, physicalWidthMm, blocks, { illustratorCompatible: true });
  illustratorFilename = `map-${X.activePreset}-${citySlug}-${stamp}-illustrator.svg`;
  fs.writeFileSync(path.join(dir, illustratorFilename), illustratorSvg);
  console.log(`Illustrator variant: ${(illustratorSvg.length / 1048576).toFixed(2)} MB -> exports/${illustratorFilename}`);
  // Profile assertions: the whole point of this pipeline is that these
  // constructs never reach an Illustrator user.
  const forbidden = ['<textPath', 'inkscape:', 'xlink', 'paint-order', 'rgba(', 'dominant-baseline'];
  for (const marker of forbidden) {
    if (illustratorSvg.includes(marker)) illustratorFailures.push(`illustrator variant contains forbidden markup: ${marker}`);
  }
  if (!illustratorSvg.includes('Illustrator-compatible export')) {
    illustratorFailures.push('illustrator variant is missing its identifying header comment');
  }
}

// Drain the fire-and-forget cacheSet POSTs (the old fixed sleep(2000) raced
// slow writes). Loop because a late cacheSet may still be compressing when
// the first drain settles.
for (let drained = 0; drained < pendingPosts.length; ) {
  drained = pendingPosts.length;
  await Promise.allSettled(pendingPosts);
  await new Promise(r => setTimeout(r, 100));
}

const rot = (svg.match(/transform="rotate\(/g) || []).length;
const tp = (svg.match(/<textPath /g) || []).length;
console.log(`\ncache ${JSON.stringify(tally)}`);
console.log(`labels: ${rot} single rotated <text>, ${tp} textPath`);
console.log(`SVG ${(svg.length / 1048576).toFixed(2)} MB -> exports/${filename}`);

// ── assertions: this run must be self-evidently sane before anyone looks
//    at a screenshot ──────────────────────────────────────────────────
const failures = [...illustratorFailures];

// 1. svg-lint: NaN/undefined in attributes, empty/mirrored/upside-down
//    labels, dangling textPath refs, label-on-label overlap.
const lint = lintSvg(svg);
for (const e of lint.errors) failures.push(`lint: ${e}`);
console.log(`lint: ${lint.errors.length} error(s), ${lint.warnings.length} warning(s) over ${lint.labelCount} labels`);

// 2. structural floors that hold for ANY city.
if (!layerCounts.roads) failures.push(`roads layer produced ${layerCounts.roads ?? 'no'} elements`);
if (!lint.labelCount) failures.push('export contains zero labels');

// 3. per-city floors captured from an approved run (--record), ~50% of that
//    run's counts so OSM churn never trips them but a broken query/filter does.
const expPath = path.join(REPO, 'tests', 'expectations.json');
const expectations = fs.existsSync(expPath) ? JSON.parse(fs.readFileSync(expPath, 'utf8')) : {};
const exp = expectations[citySlug];
if (exp) {
  for (const [id, min] of Object.entries(exp.layers || {})) {
    if ((layerCounts[id] ?? 0) < min) failures.push(`${id}: ${layerCounts[id] ?? 0} elements < expected floor ${min} for ${citySlug}`);
  }
  if (exp.labels && lint.labelCount < exp.labels) failures.push(`labels: ${lint.labelCount} < expected floor ${exp.labels} for ${citySlug}`);
} else if (citySlug !== 'custom') {
  console.log(`(no per-city floors for '${citySlug}' in tests/expectations.json — generic checks only; record them with --record on an approved run)`);
}

if (recordExpectations && citySlug !== 'custom' && !failures.length) {
  const entry = { recorded_at: new Date().toISOString().slice(0, 10), from: filename, layers: {}, labels: Math.floor(lint.labelCount * 0.5) };
  for (const [id, n] of Object.entries(layerCounts)) entry.layers[id] = Math.floor(n * 0.5);
  expectations[citySlug] = entry;
  fs.writeFileSync(expPath, JSON.stringify(expectations, null, 2) + '\n');
  console.log(`recorded floors for ${citySlug} -> tests/expectations.json (counts ×0.5)`);
} else if (recordExpectations && failures.length) {
  console.log('NOT recording expectations: run has failures');
}

if (failures.length) {
  console.error(`\nFAIL — ${failures.length} check(s):`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(`(the SVG was still written for inspection)`);
  process.exit(1);
}
console.log(`\nPASS — all checks. Next: visually verify in a browser via the preview MCP on :8889 (see tests/README.md):`);
console.log(`  http://localhost:8889/mapexport/tests/viewer.html?file=/mapexport/exports/${filename}`);
if (illustratorFilename) console.log(`  http://localhost:8889/mapexport/tests/viewer.html?file=/mapexport/exports/${illustratorFilename}`);

