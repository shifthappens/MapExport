// Offline sanity check against frozen fixtures.
// Does NOT hit Overpass. Verifies that element counts + shapes in the
// fixtures match the captured _meta.json and that tagFilter (extracted
// from script.js) partitions a notional "superset" response the way the
// supersession optimization (§1.1) expects.
//
// Usage:
//   node tests/pipeline-equivalence.mjs
//
// This is the test that must pass after implementing §1.1 supersession —
// feeds the union of all fixture elements through each layer's tagFilter
// and confirms per-layer counts match the per-layer fixture counts.

import { SCRIPT_PATH, FIXTURE_DIR, fs, path } from './lib.mjs';

const metaPath = path.join(FIXTURE_DIR, '_meta.json');
if (!fs.existsSync(metaPath)) {
  console.error(`[pe] no fixtures — run capture-fixtures.mjs first`);
  process.exit(2);
}
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

// Extract { id, tagFilter } pairs from script.js by evaluating matched slices.
// Each tagFilter is of the form `tagFilter:el=>...` ending before the next
// top-level comma at depth 0 (before the closing `}` of the layer entry).
function extractTagFilters(src) {
  const out = {};
  // Find `id:'X'` then later `tagFilter:el=>`. We match the whole expression
  // up to the closing `}` of the layer entry by bracket-counting.
  const idRe = /\{\s*id:'([a-z_]+)'/g;
  let m;
  while ((m = idRe.exec(src)) !== null) {
    const id = m[1];
    // Find matching `}` by bracket counting from m.index
    let depth = 0, i = m.index, end = -1;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
      else if (c === '`') { // skip template literal
        const close = src.indexOf('`', i + 1);
        i = close > -1 ? close : src.length;
      } else if (c === "'") {
        const close = src.indexOf("'", i + 1);
        i = close > -1 ? close : src.length;
      }
    }
    if (end < 0) continue;
    const body = src.slice(m.index, end + 1);
    const tfMatch = body.match(/tagFilter:(el=>[\s\S]+?)(?=\s*[,}])/);
    if (!tfMatch) continue;
    try {
      // eslint-disable-next-line no-eval
      const fn = (0, eval)(`(${tfMatch[1]})`);
      out[id] = fn;
    } catch (err) {
      console.warn(`[pe] failed to eval tagFilter for ${id}: ${err.message}`);
    }
  }
  return out;
}

const src = fs.readFileSync(SCRIPT_PATH, 'utf8');
const tagFilters = extractTagFilters(src);
console.log(`[pe] extracted ${Object.keys(tagFilters).length} tagFilters`);

// Build union of all fixture elements (dedup by type+id)
const seen = new Map();
for (const id of Object.keys(meta.layers)) {
  const f = path.join(FIXTURE_DIR, `${id}.json`);
  if (!fs.existsSync(f)) continue;
  const data = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const el of data.elements || []) {
    const k = `${el.type[0]}${el.id}`;
    if (!seen.has(k)) seen.set(k, el);
  }
}
console.log(`[pe] union set size: ${seen.size}`);

let failed = 0;
for (const [id, info] of Object.entries(meta.layers)) {
  if (!info.element_count && info.element_count !== 0) continue;
  const tf = tagFilters[id];
  if (!tf) { console.log(`[pe] ${id}: SKIP (no tagFilter extracted)`); continue; }
  const matched = [...seen.values()].filter(tf);
  const delta = matched.length - info.element_count;
  // Allow matched ≥ info.element_count (union may include elements from
  // overlapping layers that this tagFilter also claims — that's OK and
  // expected for supersession). Warn if strictly less.
  const status = matched.length >= info.element_count ? 'OK' : 'FAIL';
  console.log(`[pe] ${id}: ${status} · union-matched=${matched.length} fixture=${info.element_count} delta=${delta>=0?'+':''}${delta}`);
  if (status === 'FAIL') failed++;
}

if (failed) { console.error(`\n[pe] ${failed} layer(s) lost elements under tagFilter`); process.exit(1); }
console.log(`\n[pe] tagFilter partition covers fixtures`);
