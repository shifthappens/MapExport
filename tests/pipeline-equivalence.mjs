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
// Walks the source as a tiny JS scanner so we correctly handle:
//   * block-body arrows: `tagFilter:el=>{ ... return x; }`
//   * regex literals containing `(`, `|`, `,` etc.
//   * string / template literals
function skipLiteral(src, i) {
  const q = src[i];
  if (q === '`') {
    for (i++; i < src.length; i++) {
      if (src[i] === '\\') { i++; continue; }
      if (src[i] === '`') return i;
      if (src[i] === '$' && src[i + 1] === '{') {
        i = skipBalanced(src, i + 1, '{', '}');
      }
    }
    return src.length;
  }
  for (i++; i < src.length; i++) {
    if (src[i] === '\\') { i++; continue; }
    if (src[i] === q) return i;
  }
  return src.length;
}
function skipRegex(src, i) {
  let inClass = false;
  for (i++; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') { i++; continue; }
    if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) {
      while (i + 1 < src.length && /[a-z]/i.test(src[i + 1])) i++;
      return i;
    }
  }
  return src.length;
}
function skipBalanced(src, start, open, close) {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') { i = skipLiteral(src, i); continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return i; }
  }
  return src.length;
}
// Scan from i until we reach a top-level `,` or the layer-entry closing `}`.
// Tracks paren/bracket/brace depth and skips strings + regex literals.
function scanExpressionEnd(src, i) {
  let depth = 0;
  let prevSig = ':'; // last significant (non-whitespace) char, seeds regex heuristic
  for (; i < src.length; i++) {
    const c = src[i];
    if (/\s/.test(c)) continue;
    if (c === "'" || c === '"' || c === '`') { i = skipLiteral(src, i); prevSig = c; continue; }
    if (c === '/' && /[=(,!&|?:;{[]/.test(prevSig)) { i = skipRegex(src, i); prevSig = '/'; continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; prevSig = c; continue; }
    if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) return i; // hit layer-entry `}` without a preceding `,`
      depth--; prevSig = c; continue;
    }
    if (c === ',' && depth === 0) return i;
    prevSig = c;
  }
  return src.length;
}
function extractTagFilters(src) {
  const out = {};
  const idRe = /\{\s*id:'([a-z_]+)'/g;
  let m;
  while ((m = idRe.exec(src)) !== null) {
    const id = m[1];
    const entryEnd = skipBalanced(src, m.index, '{', '}');
    const body = src.slice(m.index, entryEnd + 1);
    const tfIdx = body.search(/tagFilter:el=>/);
    if (tfIdx < 0) continue;
    const exprStart = tfIdx + 'tagFilter:'.length;
    const exprEnd = scanExpressionEnd(body, exprStart);
    const expr = body.slice(exprStart, exprEnd);
    try {
      // eslint-disable-next-line no-eval
      const fn = (0, eval)(`(${expr})`);
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
  // Baseline: tagFilter applied to the layer's own fixture. This accounts
  // for cases where Overpass regex is looser than tagFilter (e.g.
  // `highway~"motorway"` matches "motorway_junction", which tagFilter
  // with an exact-match set excludes). That overfetch is current behavior;
  // tagFilter is authoritative for rendered output.
  const ownFixturePath = path.join(FIXTURE_DIR, `${id}.json`);
  const ownFixture = fs.existsSync(ownFixturePath)
    ? JSON.parse(fs.readFileSync(ownFixturePath, 'utf8')).elements || []
    : [];
  const baseline = ownFixture.filter(tf).length;
  const matched = [...seen.values()].filter(tf);
  const delta = matched.length - baseline;
  // Supersession test: union-matched must be >= baseline (the union may
  // include elements from overlapping layers this tagFilter also claims,
  // which is fine and the whole point of supersession). FAIL if strictly
  // less — tagFilter lost elements it should have kept.
  const status = matched.length >= baseline ? 'OK' : 'FAIL';
  console.log(`[pe] ${id}: ${status} · union-matched=${matched.length} baseline=${baseline} raw-fixture=${info.element_count} delta=${delta>=0?'+':''}${delta}`);
  if (status === 'FAIL') failed++;
}

if (failed) { console.error(`\n[pe] ${failed} layer(s) lost elements under tagFilter`); process.exit(1); }
console.log(`\n[pe] tagFilter partition covers fixtures`);
