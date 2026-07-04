import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

export const TILBURG = {
  name: 'tilburg',
  south: 51.530, west: 5.040, north: 51.590, east: 5.130,
};

export function bboxStr(b) { return `${b.south},${b.west},${b.north},${b.east}`; }

export const OVERPASS_ENDPOINTS = [
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];

export const SCRIPT_PATH = path.join(ROOT, 'script.js');
export const FIXTURE_DIR = path.join(HERE, 'fixtures', TILBURG.name);

// ── tiny JS scanner ────────────────────────────────────────────────
// Walks script.js source to slice out per-layer expressions, correctly
// handling block-body arrows, regex literals containing `(`/`|`/`,`, and
// string/template literals. ONE copy lives here — pipeline-equivalence.mjs
// and supersession.mjs used to carry private duplicates that could silently
// skip a layer when a pattern stopped matching; extraction now THROWS when
// a marker is present but the expression can't be evaluated, and
// extractLayerEntries() cross-checks its finds against raw marker counts.
export function skipLiteral(src, i) {
  const q = src[i];
  if (q === '`') {
    for (i++; i < src.length; i++) {
      if (src[i] === '\\') { i++; continue; }
      if (src[i] === '`') return i;
      if (src[i] === '$' && src[i + 1] === '{') i = skipBalanced(src, i + 1, '{', '}');
    }
    return src.length;
  }
  for (i++; i < src.length; i++) {
    if (src[i] === '\\') { i++; continue; }
    if (src[i] === q) return i;
  }
  return src.length;
}
export function skipRegex(src, i) {
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
export function skipBalanced(src, start, open, close) {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') { i = skipLiteral(src, i); continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return i; }
  }
  return src.length;
}
// Scan from i until a top-level `,` or the enclosing `}` — the end of one
// object-property expression. Skips strings + regex literals.
export function scanExpressionEnd(src, i) {
  let depth = 0;
  let prevSig = ':'; // last significant char, seeds the regex-vs-divide heuristic
  for (; i < src.length; i++) {
    const c = src[i];
    if (/\s/.test(c)) continue;
    if (c === "'" || c === '"' || c === '`') { i = skipLiteral(src, i); prevSig = c; continue; }
    if (c === '/' && /[=(,!&|?:;{[]/.test(prevSig)) { i = skipRegex(src, i); prevSig = '/'; continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; prevSig = c; continue; }
    if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) return i;
      depth--; prevSig = c; continue;
    }
    if (c === ',' && depth === 0) return i;
    prevSig = c;
  }
  return src.length;
}

const TAGFILTER_MARKER = /tagFilter:el=>/;
const QUERY_MARKER = /overpassQuery:\(b\)=>/;

// Parse LAYER_REGISTRY out of script.js → [{ id, tagFilter?, overpassQuery?,
// queryTemplate? }]. Throws (instead of skipping) when an entry's marker is
// found but its expression fails to eval, or when the number of extracted
// pieces doesn't match the raw marker count in the source — so a source
// refactor can never silently shrink test coverage again.
export function extractLayerEntries(scriptSrc = fs.readFileSync(SCRIPT_PATH, 'utf8')) {
  const entries = [];
  const idRe = /\{\s*id:'([a-z_]+)'/g;
  let m;
  while ((m = idRe.exec(scriptSrc)) !== null) {
    const id = m[1];
    const entryEnd = skipBalanced(scriptSrc, m.index, '{', '}');
    const body = scriptSrc.slice(m.index, entryEnd + 1);
    const entry = { id };

    const tfIdx = body.search(TAGFILTER_MARKER);
    if (tfIdx >= 0) {
      const s = tfIdx + 'tagFilter:'.length;
      const expr = body.slice(s, scanExpressionEnd(body, s));
      try { entry.tagFilter = (0, eval)(`(${expr})`); }
      catch (err) { throw new Error(`extractLayerEntries: tagFilter of '${id}' does not eval: ${err.message}`); }
    }
    const qIdx = body.search(QUERY_MARKER);
    if (qIdx >= 0) {
      const s = qIdx + 'overpassQuery:'.length;
      const expr = body.slice(s, scanExpressionEnd(body, s));
      try { entry.overpassQuery = (0, eval)(`(${expr})`); }
      catch (err) { throw new Error(`extractLayerEntries: overpassQuery of '${id}' does not eval: ${err.message}`); }
      const t = body.match(/overpassQuery:\(b\)=>`([^`]+)`/);
      if (t) entry.queryTemplate = t[1];
    }
    entries.push(entry);
  }

  // Every tagFilter/overpassQuery marker in the source must land inside a
  // recognised layer entry — if the counts diverge, the id pattern above
  // stopped matching some entries and coverage silently shrank.
  const tfCount = (scriptSrc.match(new RegExp(TAGFILTER_MARKER.source, 'g')) || []).length;
  const qCount = (scriptSrc.match(new RegExp(QUERY_MARKER.source, 'g')) || []).length;
  const got = { tf: entries.filter(e => e.tagFilter).length, q: entries.filter(e => e.overpassQuery).length };
  if (got.tf !== tfCount || got.q !== qCount) {
    throw new Error(`extractLayerEntries: extraction drifted from source — tagFilters ${got.tf}/${tfCount}, queries ${got.q}/${qCount}. The scanner patterns in tests/lib.mjs no longer match script.js.`);
  }
  return entries;
}

// Locate + eval the SUPERSESSIONS table (used by supersession.mjs).
export function extractSupersessions(scriptSrc = fs.readFileSync(SCRIPT_PATH, 'utf8')) {
  const at = scriptSrc.indexOf('const SUPERSESSIONS =');
  if (at < 0) throw new Error('extractSupersessions: could not locate SUPERSESSIONS table');
  const open = scriptSrc.indexOf('{', at);
  const close = skipBalanced(scriptSrc, open, '{', '}');
  return (0, eval)(`(${scriptSrc.slice(open, close + 1)})`);
}

// Back-compat shape for capture-fixtures / query-equivalence: only layers
// with a template-style overpassQuery, exposed as string templating.
export function extractLayers(scriptSrc = fs.readFileSync(SCRIPT_PATH, 'utf8')) {
  return extractLayerEntries(scriptSrc)
    .filter(e => e.queryTemplate)
    .map(e => ({
      id: e.id,
      queryTemplate: e.queryTemplate,
      overpassQuery: (b) => e.queryTemplate.replaceAll('${b}', b),
    }));
}

const epBackoff = new Map(); // ep -> { until, delay }

function pickEndpoint() {
  const now = Date.now();
  return OVERPASS_ENDPOINTS.find(ep => {
    const b = epBackoff.get(ep);
    return !b || now >= b.until;
  }) || null;
}

function record429(ep) {
  const prev = epBackoff.get(ep);
  const next = Math.min((prev?.delay || 5000) * 2, 60_000);
  epBackoff.set(ep, { until: Date.now() + next, delay: next });
  return next;
}

export async function postOverpass(query, { maxAttempts = 8 } = {}) {
  let attempt = 0;
  while (attempt < maxAttempts) {
    let ep = pickEndpoint();
    if (!ep) {
      const soonest = Math.min(...OVERPASS_ENDPOINTS.map(e => epBackoff.get(e)?.until || 0));
      const wait = Math.max(1000, soonest - Date.now() + 200);
      process.stdout.write(`(all endpoints cooling, wait ${(wait/1000).toFixed(1)}s) `);
      await sleep(wait);
      continue;
    }
    const body = 'data=' + encodeURIComponent(query);
    const t0 = Date.now();
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'USE-IT-MapExport/1.0 (https://coen.at/mapexport; hello@coen.at)',
        },
        body,
        signal: AbortSignal.timeout(180_000),
      });
      const elapsed = Date.now() - t0;
      if (res.status === 429) {
        const waited = record429(ep);
        process.stdout.write(`(429 on ${new URL(ep).hostname}, cooling ${(waited/1000).toFixed(0)}s) `);
        attempt++;
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const bytes = JSON.stringify(json).length;
      return { ep, json, elapsed, bytes };
    } catch (err) {
      process.stdout.write(`(${err.message} on ${new URL(ep).hostname}) `);
      record429(ep);
      attempt++;
    }
  }
  throw new Error(`Overpass failed after ${maxAttempts} attempts across all endpoints`);
}

export async function fetchLayer(layer, bbox) {
  const q = `[out:json][timeout:60];(${layer.overpassQuery(bboxStr(bbox))});out body geom qt;`;
  return postOverpass(q);
}

// For fixtures: strip geometry + member details, keep only what tests need
// (type, id, tags). Reduces fixture size by ~10-20x without losing any
// information used by query-equivalence or tagFilter-based pipeline-equivalence.
export function slimElement(el) {
  const out = { type: el.type, id: el.id };
  if (el.tags) out.tags = el.tags;
  return out;
}
export function slimResponse(json) {
  return { ...json, elements: (json.elements || []).map(slimElement) };
}

export function elementIdSet(elements) {
  return new Set((elements || []).map(e => `${e.type[0]}${e.id}`));
}

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Evaluate the CANONICAL source (script.js) in a vm sandbox with just enough
// browser stubs for its top-level init to run, and hand back the named
// top-level bindings (functions AND consts — the expose line executes in the
// same script scope, so it sees both). This is how unit tests call real app
// functions (buildLabelsLayer, makeProjector, …) without slicing source by
// string offsets. real-export.mjs does the same trick against script.MIN.js
// on purpose — it tests the shipped artifact; unit tests test the source.
export function loadAppSandbox(exposeNames, scriptPath = SCRIPT_PATH) {
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
    console, setTimeout, clearTimeout, queueMicrotask, performance,
    fetch: () => Promise.reject(new Error('no network in loadAppSandbox')),
    Blob, Response, Request, Headers, URL, AbortSignal, TextEncoder, TextDecoder,
    document: { getElementById: () => elProxy, querySelector: () => elProxy, querySelectorAll: () => [], createElement: () => elProxy, createElementNS: () => elProxy, addEventListener() {}, body: elProxy, documentElement: elProxy },
    navigator: { userAgent: 'node', clipboard: {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
  vm.createContext(sandbox);
  const src = fs.readFileSync(scriptPath, 'utf8');
  vm.runInContext(`${src}\n;globalThis.__exposed={${exposeNames.join(',')}};`, sandbox, { filename: path.basename(scriptPath) });
  return sandbox.__exposed;
}

export function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
export { path, fs };
