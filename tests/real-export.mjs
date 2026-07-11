// tests/real-export.mjs — headless real-world export against the LIVE local stack.
//
// Runs script.js itself (the same source the browser loads — no build step,
// no minification) outside a browser: fetches each layer through the running
// cache.php, hitting Overpass on a miss and writing the result back to cache/.
// City blocks (normally a Web Worker) are computed here in a vm sandbox with
// ClipperLib. The assembled SVG is saved to exports/ using the app's own
// filename format, as a committable trail. Minification only ever happens in
// the GitHub Actions deploy workflow (`.github/workflows/deploy.yml`) — it is
// not part of dev or test.
//
// Prereqs: a webserver serving the repo at /mapexport/ on :8080 with PHP
// support for cache.php (e.g. `php -S localhost:8080` from a directory whose
// `mapexport/` entry points at this repo, or Coen's local `lamp start`). See
// memory/reference_lamp_server.md.
//
// Usage:
//   node tests/real-export.mjs                          # default Tilburg bbox
//   node tests/real-export.mjs ghent                    # named test area (see CITIES)
//   node tests/real-export.mjs 51.545,5.07,51.562,5.1
//   node tests/real-export.mjs <city|s,w,n,e> [--record] [--illustrator]
//
// Print size (px width, physical mm) is derived from the bbox shape — see
// getPhysicalSizeMm in script.js — not passed on the command line.
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
import { fileURLToPath } from 'node:url';
import { lintSvg } from './svg-lint.mjs';
import { checkCoverage } from './coverage-lint.mjs';

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
  // Rural, not a city: hamlets + farmland/forest in the Nièvre (Burgundy).
  // Exercises countryside faces, hamlet blocks, and the landcover layer —
  // a run where every road face painted curb-to-curb would be wrong.
  nievre:      '46.92190,3.85448,46.94663,3.90324',
  // River islands in the Gera (Krämerbrücke area) — the acceptance case for
  // rendering islands through classification + subtraction + paint order
  // alone (see plans/2026-07-07_erfurt-river-islands-not-rendering.md).
  erfurt:      '50.97313,11.01929,50.9821,11.03748',
};

// ── args ──────────────────────────────────────────────────────────
const flags = process.argv.slice(2).filter(a => a.startsWith('--'));
const [areaArg] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const recordExpectations = flags.includes('--record');
const alsoIllustrator = flags.includes('--illustrator');
// --engine=v2 routes assembly through the experimental engine-v2.js instead
// of v1's buildSVG. v1 path is byte-for-byte unaffected when the flag is absent.
const engineV2 = flags.includes('--engine=v2');
const citySlug = !areaArg ? 'tilburg' : (CITIES[areaArg.toLowerCase()] ? areaArg.toLowerCase() : 'custom');
const [south, west, north, east] = (citySlug === 'custom' ? areaArg : CITIES[citySlug]).split(',').map(Number);
const bbox = { south, west, north, east };
const bboxStr = `${south},${west},${north},${east}`;

// ── load the real source into a vm sandbox with browser stubs ──────
// Same script.js the browser loads in dev — no build/minify step, so this
// always tests exactly what's in the working tree.
const scriptSrc = fs.readFileSync(path.join(REPO, 'script.js'), 'utf8');
const xTail = '\n;globalThis.__x={LAYER_REGISTRY,fetchLayer,buildSVG,makeProjector,prepareBlockData,prepareClusterData,BLOCK_BUILDINGS_LAYER,BLOCK_WORKER_SRC,getExportWidth,getPhysicalSizeMm,activePreset,stitchMultipolygonRings};';
// v2 needs script.js AND engine-v2.js in ONE vm script: vm doesn't reliably
// share top-level `const`s across separate runInContext calls, so engine-v2.js
// (which references script.js's globals) must be concatenated, not run apart.
let src = scriptSrc + xTail;
if (engineV2) {
  const engineSrc = fs.readFileSync(path.join(REPO, 'engine-v2.js'), 'utf8');
  src = scriptSrc + '\n;\n' + engineSrc + xTail + '\nglobalThis.__x2 = EngineV2;';
}

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
const X2 = engineV2 ? sandbox.__x2 : null;

// ── ClipperLib (cached in the OS temp dir; the app loads it from a CDN) ──
async function getClipperSrc() {
  const cached = path.join(os.tmpdir(), 'mapexport-clipper-6.4.2.min.js');
  if (fs.existsSync(cached) && fs.statSync(cached).size > 50000) return fs.readFileSync(cached, 'utf8');
  const txt = await (await realFetch(CLIPPER_URL)).text();
  fs.writeFileSync(cached, txt);
  return txt;
}

// Run a block/face Web Worker source headlessly: synchronous onmessage ->
// postMessage('done'). Returns { blocks, needsBuildings } like
// computeBlocksAsync in script.js. `workerSrc` defaults to v1's block worker;
// the v2 path passes X2.FACE_WORKER_SRC (v1 call sites unchanged). v1 payloads
// carry `lines`/`areas`, v2 payloads carry `cutterLines` — the empty guard
// accepts either.
function computeBlocks(data, clipperSrc, workerSrc = X.BLOCK_WORKER_SRC) {
  if (!data.lines?.length && !data.areas?.length && !data.cutterLines?.length) return { blocks: [], needsBuildings: false };
  let out = { blocks: [], needsBuildings: false };
  const w = { console, navigator: { userAgent: 'chrome', appName: 'Netscape' } };
  w.self = w; w.window = w; w.globalThis = w;
  w.postMessage = (msg) => { if (msg && msg.type === 'done') out = { blocks: msg.blocks, needsBuildings: !!msg.needsBuildings }; };
  w.importScripts = () => vm.runInContext(clipperSrc, w); // ignore URL, eval cached source
  vm.createContext(w);
  vm.runInContext(workerSrc, w); // defines self.onmessage, loads ClipperLib
  w.onmessage({ data });
  return out;
}

// ── run ───────────────────────────────────────────────────────────
const W = X.getExportWidth(bbox);
const physicalWidthMm = X.getPhysicalSizeMm(bbox).mmW;
const allLayers = X.LAYER_REGISTRY.flatMap(g => g.layers);
// v2 fetches its own flat layer list (roads + rail + buildings). It runs the
// face cutter below but leaves coverage-lint OFF (blockData stays null) —
// coverage turns on in M3 when water/green subtraction + the fallback pass land.
const fetchable = engineV2
  ? X2.layers.filter(l => l.overpassQuery)
  : allLayers.filter(l => l.defaultOn && l.overpassQuery);
const cityBlocks = engineV2 ? null : allLayers.find(l => l.id === 'city_blocks');

console.log(`area ${citySlug}  bbox ${bboxStr}  (${W}px / ${physicalWidthMm.toFixed(1)}mm)`);
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

// city blocks (derived) — compute then add an empty result so buildSVG renders them.
// Two-phase, same as the export driver: countryside faces trigger an on-demand
// buildings fetch, then a second worker run traces hamlet blocks from them.
let blocks = [], blockData = null, blockPr = null, blockH = null;
if (cityBlocks) {
  const { pr, H } = X.makeProjector(bbox, W);
  const clipperSrc = await getClipperSrc();
  const data = X.prepareBlockData(results, pr, W, H, bbox);
  let res = computeBlocks(data, clipperSrc);
  if (res.needsBuildings) {
    const t0 = Date.now();
    const { elements } = await X.fetchLayer(X.BLOCK_BUILDINGS_LAYER, bboxStr, bbox);
    const kept = elements.filter(X.BLOCK_BUILDINGS_LAYER.tagFilter);
    console.log(`block_buildings ${String(kept.length).padStart(5)} elements  (${Date.now() - t0}ms) — countryside faces found`);
    data.clusterRings = X.prepareClusterData(kept, pr);
    res = computeBlocks(data, clipperSrc);
  }
  blocks = res.blocks;
  blockData = data; blockPr = pr; blockH = H;
  results.push({ layer: cityBlocks, data: { elements: [] } });
  const n = k => blocks.filter(b => (b.kind || 'urban') === k).length;
  console.log(`city_blocks    ${String(blocks.length).padStart(6)} blocks (${n('urban')} urban, ${n('hamlet')} hamlet, ${n('countryside')} countryside)`);
}

// v2 area features + face cutter: faces = bbox minus roads/rail/tram/metro,
// classified by building presence, with water/green/waterway strokes subtracted
// and a cream coverage fallback for buildingless faces. Buildings and
// area_features are fetch-only inputs, separated out before buildSVG (mirroring
// doExport); rail/tram/metro render too (v1 builders) since M4.
// coverage-lint is now ON for v2 (blockData set below).
let v2Blocks = null, v2MaxShare = 0, v2Fallback = 0;
if (engineV2) {
  const { pr, H } = X.makeProjector(bbox, W);
  const clipperSrc = await getClipperSrc();
  const buildingElements = results.find(r => r.layer.id === X2.buildingsLayer.id)?.data.elements || [];
  // Classify the combined area-features fetch into render layers + subtraction
  // geometry (the sea is closed against the bbox inside buildAreaResults).
  const areaFeatureElements = results.find(r => r.layer.id === X2.areaFeaturesLayer.id)?.data.elements || [];
  const { renderResults: areaRenderResults, classified } = X2.buildAreaResults(areaFeatureElements, bbox);
  // Cutter input = roads + rail/tram/metro (buildings + area_features do not
  // bound faces; area geometry subtracts instead).
  const cutterResults = results.filter(r => ['roads', 'rail', 'tram', 'metro'].includes(r.layer.type));
  const data = X2.prepareFaceData(cutterResults, buildingElements, classified, pr, W, H, bbox);
  v2Blocks = computeBlocks(data, clipperSrc, X2.FACE_WORKER_SRC).blocks;
  const n = k => v2Blocks.filter(b => (b.kind || 'urban') === k).length;
  v2Fallback = n('fallback');
  const bboxAreaPx = W * H;
  // Largest PAINTED block only (urban/hamlet) — countryside placeholders span
  // whole rural faces and are never filled cream, so they don't count here.
  v2MaxShare = v2Blocks.filter(b => b.kind === 'urban' || b.kind === 'hamlet').reduce((m, b) => Math.max(m, b.areaPx || 0), 0) / bboxAreaPx;
  console.log(`city_blocks v2: ${n('urban')} urban, ${n('hamlet')} hamlet, ${n('countryside')} countryside; fallback_blocks: ${v2Fallback} patches; largest block = ${(v2MaxShare * 100).toFixed(1)}% of bbox`);
  // Rebuild the render set: drop fetch-only inputs, add classified area layers
  // and both derived block layers (each carries the full block list).
  const renderResults = results.filter(r => !X2.fetchOnlyIds.has(r.layer.id));
  renderResults.push(...areaRenderResults);
  renderResults.push({ layer: X2.cityBlocksLayer, data: { blocks: v2Blocks } });
  renderResults.push({ layer: X2.fallbackBlocksLayer, data: { blocks: v2Blocks } });
  results.length = 0;
  results.push(...renderResults);
  // Feed the shared coverage lint below: v2's face data carries .lines
  // (roads/rail cutters + waterway strokes) and its full block list.
  blocks = v2Blocks; blockData = data; blockPr = pr; blockH = H;
}

// v2 buildSVG has a leaner signature (no precomputedBlocks arg): options is
// the 5th param, not the 6th.
const svg = engineV2
  ? X2.buildSVG(results, bbox, W, physicalWidthMm, { illustratorCompatible: false })
  : X.buildSVG(results, bbox, W, physicalWidthMm, blocks);
// YYYY-MM-DD-HHMMSS (local time), matching the web app, so same-day exports don't collide.
const d = new Date(), p2 = n => String(n).padStart(2, '0');
const stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
const filename = `map-${X.activePreset}-${citySlug}${engineV2 ? '-v2' : ''}-${stamp}.svg`;
const dir = path.join(REPO, 'exports');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, filename), svg);

// ── Illustrator-compatible variant: same fetched data, second pipeline ──
let illustratorFilename = null;
const illustratorFailures = [];
if (alsoIllustrator) {
  const illustratorSvg = engineV2
    ? X2.buildSVG(results, bbox, W, physicalWidthMm, { illustratorCompatible: true })
    : X.buildSVG(results, bbox, W, physicalWidthMm, blocks, { illustratorCompatible: true });
  illustratorFilename = `map-${X.activePreset}-${citySlug}${engineV2 ? '-v2' : ''}-${stamp}-illustrator.svg`;
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

// Per-city expectations load early: the coverage check below consults the
// recorded gap allowance; the per-city floors themselves apply in step 4.
const expPath = path.join(REPO, 'tests', 'expectations.json');
const expectations = fs.existsSync(expPath) ? JSON.parse(fs.readFileSync(expPath, 'utf8')) : {};
// v2 fetches a different layer set (combined area_features, always-on
// buildings), so its floors live under their own '<city>-v2' keys, recorded
// from approved v2 runs — v1 keys stay untouched.
const expKey = engineV2 ? `${citySlug}-v2` : citySlug;
const exp = expectations[expKey];

// 2. coverage lint: any land in the bbox that no block/water/park/road/
//    waterway/rail paints, so only the bare page background shows through
//    (see plans/2026-07-07_erfurt-river-islands-not-rendering.md — this is
//    the general form of the bug fixed twice there). The block cutter itself
//    deliberately drops contours under 400px² as visual noise (`minArea` in
//    BLOCK_WORKER_SRC) — every city has a few of these micro-slivers at
//    complex junctions, and they are not the bug this check targets. The
//    significance floor here must clear that intentional floor by a wide
//    margin, and scale with physical print size (not raw px) so it means
//    the same thing at any zoom: ~3x3mm on the printed sheet, comfortably
//    bigger than a junction rounding artifact, small enough to catch a real
//    dropped block.
let significantGaps = [];
if (blockData) {
  const cov = checkCoverage({ X, results, data: blockData, blocks, bbox, W, H: blockH, pr: blockPr });
  const pxPerMm = W / physicalWidthMm;
  const minAreaPx2 = 9 * pxPerMm * pxPerMm; // 3mm x 3mm on paper
  significantGaps = cov.blobs.filter(b => b.cells * cov.step * cov.step >= minAreaPx2);
  console.log(`coverage: ${cov.gapCells} empty grid cell(s) (step ${cov.step}px) in ${cov.blobs.length} blob(s), ${significantGaps.length} at/above the ${minAreaPx2.toFixed(0)}px² (~3x3mm) significance floor`);
  // Some gaps are legitimate map features, not bugs — the canonical case is a
  // rail yard, where the corridor between widely-spaced parallel tracks shows
  // the page background by design (identically in v1 and v2; Oulu's yard is
  // the reference example). A human approves those on a --record run, which
  // bakes the observed count in as this city's allowance; anything beyond it
  // still fails, and new cities default to zero.
  const allowedGaps = exp?.coverageGaps ?? 0;
  const overAllowance = recordExpectations ? false : significantGaps.length > allowedGaps;
  if (overAllowance) {
    for (const b of significantGaps.slice(0, 10)) {
      failures.push(`coverage: unpainted land ~${(b.cells * cov.step * cov.step).toFixed(0)}px² at ${b.lat.toFixed(5)},${b.lng.toFixed(5)} (px ${b.px.toFixed(0)},${b.py.toFixed(0)})`);
    }
    if (significantGaps.length > 10) failures.push(`coverage: ${significantGaps.length - 10} more gap(s) at/above the significance floor, not listed`);
  } else if (significantGaps.length) {
    for (const b of significantGaps) {
      console.log(`coverage: gap ~${(b.cells * cov.step * cov.step).toFixed(0)}px² at ${b.lat.toFixed(5)},${b.lng.toFixed(5)} (px ${b.px.toFixed(0)},${b.py.toFixed(0)}) — ${recordExpectations ? 'will be recorded as allowed' : `within the recorded allowance of ${allowedGaps}`}`);
    }
  }
}

// 3. structural floors that hold for ANY city.
if (!layerCounts.roads) failures.push(`roads layer produced ${layerCounts.roads ?? 'no'} elements`);
if (!lint.labelCount) failures.push('export contains zero labels');
if (engineV2) {
  // A non-greedy </g> match would stop at the first nested subgroup (which
  // can legitimately be empty), so take everything from the roads group
  // onward.
  const roadsStart = svg.indexOf('<g id="roads"');
  if (roadsStart < 0 || !/<path\b/.test(svg.slice(roadsStart))) failures.push('v2: <g id="roads"> is missing or has no paths');
  // The face cutter must produce at least one city block for a dense city.
  if (citySlug === 'tilburg' && (!v2Blocks || v2Blocks.length < 1)) {
    failures.push(`v2: expected at least 1 city block for tilburg, got ${v2Blocks ? v2Blocks.length : 'none'}`);
  }
}

// 4. per-city floors captured from an approved run (--record), ~50% of that
//    run's counts so OSM churn never trips them but a broken query/filter does.
//    (expectations themselves are loaded above the coverage check.)
if (exp) {
  for (const [id, min] of Object.entries(exp.layers || {})) {
    if ((layerCounts[id] ?? 0) < min) failures.push(`${id}: ${layerCounts[id] ?? 0} elements < expected floor ${min} for ${expKey}`);
  }
  if (exp.labels && lint.labelCount < exp.labels) failures.push(`labels: ${lint.labelCount} < expected floor ${exp.labels} for ${expKey}`);
} else if (citySlug !== 'custom') {
  console.log(`(no per-city floors for '${expKey}' in tests/expectations.json — generic checks only; record them with --record on an approved run)`);
}

if (recordExpectations && citySlug !== 'custom' && !failures.length) {
  const entry = { recorded_at: new Date().toISOString().slice(0, 10), from: filename, layers: {}, labels: Math.floor(lint.labelCount * 0.5) };
  for (const [id, n] of Object.entries(layerCounts)) entry.layers[id] = Math.floor(n * 0.5);
  // Human-approved significant coverage gaps (rail yards etc.) become this
  // city's allowance; see the coverage check above.
  if (significantGaps.length) entry.coverageGaps = significantGaps.length;
  expectations[expKey] = entry;
  fs.writeFileSync(expPath, JSON.stringify(expectations, null, 2) + '\n');
  console.log(`recorded floors for ${expKey} -> tests/expectations.json (counts ×0.5)`);
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

