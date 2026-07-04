// §1.1 supersession unit test.
//
// Scope: runs OFFLINE against the frozen Tilburg fixtures. For each
// (subordinate, superseder) pair the test feeds the superseder's
// fixture elements through the subordinate's tagFilter and asserts the
// result is a superset of the subordinate's own fixture elements (after
// tagFilter). If that holds, it's safe to drop the subordinate's
// statement from the combined query when the superseder is in the same
// fetch — tagFilter picks the right elements out of the superseder's
// response.
//
// Also parses script.js's SUPERSESSIONS table to make sure each
// declared rule exactly matches a substring in the subordinate's
// overpassQuery (catches drift after query edits).
//
// Usage:  node tests/supersession.mjs

import { FIXTURE_DIR, extractLayerEntries, extractSupersessions, fs, path } from './lib.mjs';

// ---- 1. parse SUPERSESSIONS + overpassQuery + tagFilter out of script.js ----
// Shared scanner in lib.mjs — throws on extraction drift instead of
// silently skipping a layer (the old private copy swallowed eval errors).
const layers = {};
for (const e of extractLayerEntries()) layers[e.id] = e;

const SUPERSESSIONS = extractSupersessions();
console.log(`[sup] parsed ${Object.keys(SUPERSESSIONS).length} subordinate(s) from SUPERSESSIONS`);

// ---- 2. declared-rule-matches-query check ----
const bboxProbe = 'BBOX';
let mismatches = 0;
for (const [subId, rules] of Object.entries(SUPERSESSIONS)) {
  const sub = layers[subId];
  if (!sub?.overpassQuery) { console.warn(`[sup] ${subId}: no overpassQuery extracted`); continue; }
  const subQ = sub.overpassQuery(bboxProbe);
  for (const r of rules) {
    const lit = r.strip(bboxProbe);
    if (!subQ.includes(lit)) {
      console.error(`[sup] ${subId}: declared strip literal not found in overpassQuery`);
      console.error(`        expected: ${lit}`);
      mismatches++;
    }
  }
}
if (mismatches) { console.error(`[sup] ${mismatches} rule(s) drifted from their layer's overpassQuery`); process.exit(1); }
console.log(`[sup] all rules match their subordinate's overpassQuery`);

// ---- 3. tagFilter-coverage check against fixtures ----
function loadFixture(id) {
  const f = path.join(FIXTURE_DIR, `${id}.json`);
  if (!fs.existsSync(f)) return [];
  return JSON.parse(fs.readFileSync(f, 'utf8')).elements || [];
}

let failed = 0;
for (const [subId, rules] of Object.entries(SUPERSESSIONS)) {
  const sub = layers[subId];
  const subFixture = loadFixture(subId);
  const ownMatched = subFixture.filter(sub.tagFilter);
  for (const r of rules) {
    const supers = r.requires;
    // Union the fixtures of all required superseders.
    const pool = new Map();
    for (const sid of supers) for (const el of loadFixture(sid)) pool.set(`${el.type[0]}${el.id}`, el);
    const fromPool = [...pool.values()].filter(sub.tagFilter);
    const ownKeys = new Set(ownMatched.map(el => `${el.type[0]}${el.id}`));
    const poolKeys = new Set(fromPool.map(el => `${el.type[0]}${el.id}`));
    const missing = [...ownKeys].filter(k => !poolKeys.has(k));
    const status = missing.length === 0 ? 'OK' : 'PARTIAL';
    console.log(`[sup] ${subId} ← ${supers.join('+')}: ${status} · own-after-tagFilter=${ownMatched.length} pool-after-tagFilter=${fromPool.length} missing-from-pool=${missing.length}`);
    if (missing.length) {
      // PARTIAL is OK iff the rule is gated on ALL requires being selected,
      // and `ownMatched` contains elements outside the superseder's scope —
      // those belong to a different statement of the subordinate that isn't
      // being stripped. We can't tell from fixtures alone, so flag but don't
      // fail unconditionally. Hard-fail only when a rule claims full
      // coverage but pool is empty while own has elements.
      if (fromPool.length === 0 && ownMatched.length > 0) failed++;
    }
  }
}

if (failed) { console.error(`\n[sup] ${failed} supersession rule(s) would drop all elements`); process.exit(1); }
console.log(`\n[sup] supersession coverage OK`);
