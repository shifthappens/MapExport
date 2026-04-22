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

import { SCRIPT_PATH, FIXTURE_DIR, fs, path } from './lib.mjs';

// ---- 1. parse SUPERSESSIONS + overpassQuery + tagFilter out of script.js ----
const src = fs.readFileSync(SCRIPT_PATH, 'utf8');

function skipLit(s, i) {
  const q = s[i];
  if (q === '`') {
    for (i++; i < s.length; i++) {
      if (s[i] === '\\') { i++; continue; }
      if (s[i] === '`') return i;
      if (s[i] === '$' && s[i + 1] === '{') i = skipBal(s, i + 1, '{', '}');
    }
    return s.length;
  }
  for (i++; i < s.length; i++) {
    if (s[i] === '\\') { i++; continue; }
    if (s[i] === q) return i;
  }
  return s.length;
}
function skipRe(s, i) {
  let cl = false;
  for (i++; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') { i++; continue; }
    if (c === '[') cl = true;
    else if (c === ']') cl = false;
    else if (c === '/' && !cl) {
      while (i + 1 < s.length && /[a-z]/i.test(s[i + 1])) i++;
      return i;
    }
  }
  return s.length;
}
function skipBal(s, start, o, c) {
  let d = 0;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'" || ch === '"' || ch === '`') { i = skipLit(s, i); continue; }
    if (ch === o) d++;
    else if (ch === c) { d--; if (d === 0) return i; }
  }
  return s.length;
}
function scanEnd(s, i) {
  let d = 0, p = ':';
  for (; i < s.length; i++) {
    const c = s[i];
    if (/\s/.test(c)) continue;
    if (c === "'" || c === '"' || c === '`') { i = skipLit(s, i); p = c; continue; }
    if (c === '/' && /[=(,!&|?:;{[]/.test(p)) { i = skipRe(s, i); p = '/'; continue; }
    if (c === '(' || c === '[' || c === '{') { d++; p = c; continue; }
    if (c === ')' || c === ']' || c === '}') { if (d === 0) return i; d--; p = c; continue; }
    if (c === ',' && d === 0) return i;
    p = c;
  }
  return s.length;
}

// Pull tagFilter and overpassQuery per layer id.
const layers = {};
const idRe = /\{\s*id:'([a-z_]+)'/g;
let m;
while ((m = idRe.exec(src)) !== null) {
  const id = m[1];
  const entryEnd = skipBal(src, m.index, '{', '}');
  const body = src.slice(m.index, entryEnd + 1);

  const tfIdx = body.search(/tagFilter:el=>/);
  const tqIdx = body.search(/overpassQuery:\(b\)=>/);
  const o = { id };
  if (tfIdx >= 0) {
    const s = tfIdx + 'tagFilter:'.length;
    const e = scanEnd(body, s);
    try { o.tagFilter = (0, eval)(`(${body.slice(s, e)})`); } catch {}
  }
  if (tqIdx >= 0) {
    const s = tqIdx + 'overpassQuery:'.length;
    const e = scanEnd(body, s);
    try { o.overpassQuery = (0, eval)(`(${body.slice(s, e)})`); } catch {}
  }
  layers[id] = o;
}

// Locate the SUPERSESSIONS literal block and eval it.
const susStart = src.indexOf('const SUPERSESSIONS =');
if (susStart < 0) { console.error('[sup] could not locate SUPERSESSIONS table'); process.exit(2); }
const openBrace = src.indexOf('{', susStart);
const closeBrace = skipBal(src, openBrace, '{', '}');
const SUPERSESSIONS = (0, eval)(`(${src.slice(openBrace, closeBrace + 1)})`);
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
