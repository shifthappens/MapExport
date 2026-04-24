// Time individual layer queries + full combined query against any Overpass endpoint.
// Usage:
//   node tests/time-queries.mjs                          # external endpoints (default)
//   node tests/time-queries.mjs http://localhost/api/interpreter
//
// Prints per-layer timings so you can see which layer is the bottleneck.
import { TILBURG, OVERPASS_ENDPOINTS, extractLayers, bboxStr, sleep } from './lib.mjs';

const endpoint = process.argv[2] || OVERPASS_ENDPOINTS[0];
const bbox = TILBURG;
const b = bboxStr(bbox);
const layers = extractLayers();

// ── helpers ──────────────────────────────────────────────────────────────────

async function post(q) {
  const body = 'data=' + encodeURIComponent(q);
  const t0 = Date.now();
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'USE-IT-MapExport/1.0 (https://coen.at/mapexport; hello@coen.at)',
    },
    body,
    signal: AbortSignal.timeout(120_000),
  });
  const text = await res.text();
  const elapsed = Date.now() - t0;
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  const json = JSON.parse(text);
  return { elapsed, count: json.elements?.length ?? 0, bytes: text.length };
}

function fmt(ms) { return ms >= 1000 ? `${(ms/1000).toFixed(1)}s` : `${ms}ms`; }
function fmtKB(bytes) { return `${(bytes/1024).toFixed(0)} KB`; }

// ── per-layer timings ─────────────────────────────────────────────────────────

console.log(`\nEndpoint: ${endpoint}`);
console.log(`Bbox:     ${b} (Tilburg)\n`);
console.log('Per-layer queries (individual, not combined):');
console.log('─'.repeat(70));

const results = [];
for (const layer of layers) {
  const q = `[out:json][timeout:120];(${layer.overpassQuery(b)});out body geom qt;`;
  process.stdout.write(`  ${layer.id.padEnd(18)}`);
  try {
    const { elapsed, count, bytes } = await post(q);
    console.log(`${fmt(elapsed).padStart(6)}  ${String(count).padStart(6)} elements  ${fmtKB(bytes).padStart(8)}`);
    results.push({ id: layer.id, elapsed, count, bytes });
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
    results.push({ id: layer.id, elapsed: null, count: 0, bytes: 0 });
  }
  await sleep(500); // be polite between queries
}

// ── combined query (as the app sends it) ────────────────────────────────────

console.log('\n' + '─'.repeat(70));
console.log('Combined query (all layers, as the app sends per tile):');
const tileBbox = b; // for Tilburg this is within a single tile
const combinedStatements = layers.map(l => l.overpassQuery(tileBbox)).join('').replaceAll(`(${tileBbox})`, '');
const combinedQ = `[out:json][bbox:${tileBbox}][timeout:120];(${combinedStatements});out body geom qt;`;
console.log(`  Query length: ${combinedQ.length} chars`);
process.stdout.write(`  ${'(combined)'.padEnd(18)}`);
try {
  const { elapsed, count, bytes } = await post(combinedQ);
  console.log(`${fmt(elapsed).padStart(6)}  ${String(count).padStart(6)} elements  ${fmtKB(bytes).padStart(8)}`);
} catch (e) {
  console.log(`  ERROR: ${e.message}`);
}

// ── summary ──────────────────────────────────────────────────────────────────

const ranked = results.filter(r => r.elapsed !== null).sort((a, b) => b.elapsed - a.elapsed);
console.log('\nSlowest individual layers:');
ranked.slice(0, 5).forEach(r => {
  console.log(`  ${r.id.padEnd(18)} ${fmt(r.elapsed).padStart(6)}  ${String(r.count).padStart(6)} elements`);
});
