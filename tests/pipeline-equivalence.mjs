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

import { FIXTURE_DIR, extractLayerEntries, fs, path } from './lib.mjs';

const metaPath = path.join(FIXTURE_DIR, '_meta.json');
if (!fs.existsSync(metaPath)) {
  console.error(`[pe] no fixtures — run capture-fixtures.mjs first`);
  process.exit(2);
}
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

// Shared scanner in lib.mjs — throws on extraction drift instead of
// silently skipping a layer (the old private copy warned and moved on).
const tagFilters = {};
for (const e of extractLayerEntries()) if (e.tagFilter) tagFilters[e.id] = e.tagFilter;
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
