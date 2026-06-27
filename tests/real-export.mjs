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
//   node tests/real-export.mjs 51.545,5.07,51.562,5.1 a3_300
//   node tests/real-export.mjs <s,w,n,e> <a4_300|a3_300|a2_300|a1_300>
import fs from 'node:fs';
import os from 'node:os';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://localhost:8080/mapexport/';
// overpass-api.de returns HTTP 406 for an empty/browser User-Agent (node's
// undici sends none); a descriptive UA gets 200. Browser sets its own UA.
const OVERPASS_UA = 'MapExport/1.0 (+https://coen.at; hello@coen.at)';
const CLIPPER_URL = 'https://cdn.jsdelivr.net/npm/clipper-lib@6.4.2/clipper.min.js';

// ── args ──────────────────────────────────────────────────────────
const [, , bboxArg, sizeArg = 'a3_300'] = process.argv;
const [south, west, north, east] = (bboxArg || '51.545,5.07,51.562,5.1').split(',').map(Number);
const bbox = { south, west, north, east };
const bboxStr = `${south},${west},${north},${east}`;

// ── load shipped code into a vm sandbox with browser stubs ─────────
let src = fs.readFileSync(path.join(REPO, 'script.min.js'), 'utf8')
  + '\n;globalThis.__x={LAYER_REGISTRY,fetchLayer,buildSVG,makeProjector,prepareBlockData,BLOCK_WORKER_SRC,PRINT_SIZES,PRINT_PHYSICAL_MM,activePreset};';

const tally = { hit: 0, miss: 0, write: 0, overpass: 0 };
const realFetch = globalThis.fetch;
async function shimFetch(url, opts) {
  if (typeof url === 'string' && !/^https?:/.test(url)) {
    const res = await realFetch(BASE + url, opts);
    const get = !opts || !opts.method || opts.method === 'GET';
    if (url.startsWith('cache.php?key=') && get) (res.headers.get('x-cache') === 'HIT' ? tally.hit++ : tally.miss++);
    if (opts && opts.method === 'POST') { tally.write++; console.log('   WRITE  ' + decodeURIComponent(url.slice(0, 88))); }
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

console.log(`bbox ${bboxStr}  size ${sizeArg} (${W}px / ${physicalWidthMm}mm)`);
const results = [];
for (const layer of fetchable) {
  const t0 = Date.now();
  const { elements } = await X.fetchLayer(layer, bboxStr, bbox);
  const kept = layer.tagFilter ? elements.filter(layer.tagFilter) : elements;
  results.push({ layer, data: { elements: kept } });
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
const filename = `map-${X.activePreset}-${stamp}.svg`;
const dir = path.join(REPO, 'exports');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, filename), svg);

// flush any fire-and-forget cacheSet POSTs before exiting
await new Promise(r => setTimeout(r, 2000));

const rot = (svg.match(/transform="rotate\(/g) || []).length;
const tp = (svg.match(/<textPath /g) || []).length;
console.log(`\ncache ${JSON.stringify(tally)}`);
console.log(`labels: ${rot} single rotated <text>, ${tp} textPath`);
console.log(`SVG ${(svg.length / 1048576).toFixed(2)} MB -> exports/${filename}`);
console.log(`\nNext: visually verify in a browser via the preview MCP on :8889 (see tests/README.md):`);
console.log(`  http://localhost:8889/mapexport/tests/viewer.html?file=/mapexport/exports/${filename}`);

