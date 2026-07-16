// ME-05 offline regression tests for the shared Overpass fetch contract:
// hard per-attempt timeouts, failover to a healthy endpoint, race-loser and
// export-abort cancellation, typed structured failures, and valid-empty
// responses. All network is mocked — no live Overpass, deterministic, fast.
//
// Usage:  node tests/overpass-fetch.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeAppContext } from './lib.mjs';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const scriptSrc = readFileSync(join(repoRoot, 'script.js'), 'utf8');
const expose = `
;globalThis.__ov = {
  overpassFetch, overpassFetchRace, fetchLayer,
  OverpassFetchError, OverpassAttemptError, ExportFailure,
  OVERPASS_ENDPOINTS,
  setExportAbort(c) { activeExportAbort = c; },
  resetBackoff() { for (const k of Object.keys(endpointBackoff)) delete endpointBackoff[k]; },
  backoffSnapshot() { return JSON.parse(JSON.stringify(endpointBackoff)); },
};`;

// Node unrefs AbortSignal.timeout's internal timer; with all network mocked
// to hanging promises that timer can be the only pending work, and the event
// loop would drain mid-await. Keep it alive for the duration of the test.
const keepAlive = setInterval(() => {}, 1000);

let failures = 0;
function check(name, ok, detail = '') {
  if (ok) console.log(`ok  ${name}`);
  else { console.error(`FAIL ${name}${detail ? ` — ${detail}` : ''}`); failures++; }
}

function freshContext() {
  const ctx = makeAppContext(`${scriptSrc}\n${expose}`);
  return { ctx, ov: ctx.__ov };
}

const OK_DOC = { elements: [{ type: 'node', id: 1 }] };
const okResponse = (doc = OK_DOC) => ({
  ok: true, status: 200, body: null, headers: new Headers(),
  json: async () => doc,
});
// A request that never completes but honours its AbortSignal — the shape of
// a hung endpoint. Records the signal so tests can assert cancellation.
function hangingFetch(signalLog) {
  return (url, options = {}) => new Promise((_, reject) => {
    signalLog.push(options.signal);
    const fail = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    if (options.signal?.aborted) return fail();
    options.signal?.addEventListener('abort', fail, { once: true });
  });
}

// 1. A hanging endpoint cannot block the fetch: the attempt times out hard,
//    the hung host goes on backoff, and a healthy endpoint takes over.
{
  const { ctx, ov } = freshContext();
  const [epA] = ov.OVERPASS_ENDPOINTS;
  const signals = [];
  const hang = hangingFetch(signals);
  const calls = [];
  ctx.fetch = (url, options) => {
    calls.push(String(url));
    return String(url) === epA ? hang(url, options) : Promise.resolve(okResponse());
  };
  const t0 = Date.now();
  const { json, endpoint } = await ov.overpassFetch('data=q', { timeoutMs: 60 });
  check('hanging endpoint times out instead of blocking', Date.now() - t0 < 2000, `${Date.now() - t0}ms`);
  check('healthy second endpoint takes over', endpoint !== epA && json.elements.length === 1, endpoint);
  check('hung attempt was actually aborted', signals.length === 1 && signals[0]?.aborted);
  check('failed host put on backoff', !!ov.backoffSnapshot()[epA]);
}

// 2. Typed failure history: one endpoint 500s, one drops the connection, one
//    returns a non-Overpass body — the aggregate error names all three kinds.
{
  const { ctx, ov } = freshContext();
  const [epA, epB, epC] = ov.OVERPASS_ENDPOINTS;
  ctx.fetch = async (url) => {
    if (String(url) === epA) return { ok: false, status: 504, headers: new Headers(), json: async () => ({}) };
    if (String(url) === epB) throw new Error('connection reset');
    return { ok: true, status: 200, body: null, headers: new Headers(), json: async () => ({ not: 'overpass' }) };
  };
  let error = null;
  try { await ov.overpassFetch('data=q', { timeoutMs: 60 }); } catch (e) { error = e; }
  check('exhausted rotation throws OverpassFetchError', error instanceof ov.OverpassFetchError, String(error));
  const kinds = (error?.failures || []).map(f => f.kind).sort();
  check('failure history is typed per attempt',
    JSON.stringify(kinds) === JSON.stringify(['http', 'network', 'parse']), JSON.stringify(error?.failures));
  const summary = error?.summary() || '';
  check('summary names the failure kinds', /HTTP 504/.test(summary) && /network/.test(summary) && /parse/.test(summary), summary);
}

// 3. Rate limiting: 429 with Retry-After is honoured (bounded), endpoint goes
//    on backoff, and a fully rate-limited pool fails typed, not silently.
{
  const { ctx, ov } = freshContext();
  ctx.fetch = async () => ({
    ok: false, status: 429, headers: new Headers({ 'Retry-After': '0' }), json: async () => ({}),
  });
  let error = null;
  const t0 = Date.now();
  try { await ov.overpassFetch('data=q', { timeoutMs: 60 }); } catch (e) { error = e; }
  check('all-429 pool fails typed and bounded',
    error instanceof ov.OverpassFetchError
      && error.failures.every(f => f.kind === 'rate-limited')
      && Date.now() - t0 < 5000,
    JSON.stringify(error?.failures));
  check('429 endpoints put on backoff', Object.keys(ov.backoffSnapshot()).length >= 1);
}

// 4. Race: first valid response wins, losing requests are aborted immediately.
{
  const { ctx, ov } = freshContext();
  const [epA] = ov.OVERPASS_ENDPOINTS;
  const loserSignals = [];
  const hang = hangingFetch(loserSignals);
  ctx.fetch = (url, options) =>
    String(url) === epA ? Promise.resolve(okResponse()) : hang(url, options);
  const { json, endpoint } = await ov.overpassFetchRace('data=q', { timeoutMs: 5000 });
  await new Promise(r => setTimeout(r, 10));
  check('race returns the winner', endpoint === epA && json.elements.length === 1, endpoint);
  check('losing race requests are aborted',
    loserSignals.length === ov.OVERPASS_ENDPOINTS.length - 1 && loserSignals.every(s => s?.aborted),
    `${loserSignals.filter(s => s?.aborted).length}/${loserSignals.length} aborted`);
}

// 5. Race where every endpoint hangs: both rounds time out, the failure is
//    typed 'timeout' and arrives in bounded time.
{
  const { ctx, ov } = freshContext();
  const signals = [];
  const hang = hangingFetch(signals);
  ctx.fetch = (url, options) => hang(url, options);
  let error = null;
  const t0 = Date.now();
  try { await ov.overpassFetchRace('data=q', { timeoutMs: 50 }); } catch (e) { error = e; }
  check('fully hung race fails bounded with timeouts',
    error instanceof ov.OverpassFetchError
      && Date.now() - t0 < 3000
      && error.failures.length >= ov.OVERPASS_ENDPOINTS.length
      && error.failures.every(f => f.kind === 'timeout'),
    `${Date.now() - t0}ms, ${JSON.stringify(error?.failures)}`);
  check('every hung race request was aborted', signals.every(s => s?.aborted), `${signals.length} signals`);
}

// 6. Export-level abort cancels in-flight requests and surfaces as 'aborted'.
{
  const { ctx, ov } = freshContext();
  const signals = [];
  const hang = hangingFetch(signals);
  ctx.fetch = (url, options) => hang(url, options);
  const abort = new AbortController();
  ov.setExportAbort(abort);
  const pending = ov.overpassFetch('data=q', { timeoutMs: 60000 }).then(
    () => ({ resolved: true }), e => e);
  await new Promise(r => setTimeout(r, 20));
  abort.abort(new Error('export failed elsewhere'));
  const error = await pending;
  check('export abort rejects the fetch as aborted',
    error instanceof ov.OverpassFetchError && error.aborted === true, String(error?.message || error));
  check('export abort cancels the in-flight request', signals.length === 1 && signals[0]?.aborted);
}

// 7. An HTTP 200 with elements: [] is a VALID empty response — success, no
//    retries, and fetchLayer passes it through as an empty layer.
{
  const { ctx, ov } = freshContext();
  let overpassCalls = 0;
  ctx.fetch = async (url) => {
    const target = String(url);
    if (target.startsWith('cache.php?')) return { ok: true, status: 200, json: async () => null };
    overpassCalls++;
    return okResponse({ elements: [] });
  };
  const bbox = { south: 51.5, west: 5, north: 51.51, east: 5.01 };
  const layer = { id: 'empty_probe', overpassQuery: (b) => `way["highway"](${b});`, };
  const { elements, failedTiles } = await ov.fetchLayer(layer, '51.5,5,51.51,5.01', bbox);
  check('valid empty response is success, not failure',
    elements.length === 0 && failedTiles.length === 0 && overpassCalls === 1,
    `${overpassCalls} overpass calls, ${failedTiles.length} failed tiles`);
}

// 8. fetchLayer wraps exhausted fetches in the ME-01 contract with the typed
//    diagnostics attached, and the user message names the failure kind.
{
  const { ctx, ov } = freshContext();
  ctx.fetch = async (url) => {
    if (String(url).startsWith('cache.php?')) return { ok: true, status: 200, json: async () => null };
    throw new Error('simulated outage');
  };
  const bbox = { south: 51.5, west: 5, north: 51.51, east: 5.01 };
  const layer = { id: 'outage_probe', label: 'Outage probe', overpassQuery: (b) => `way["highway"](${b});` };
  let error = null;
  try { await ov.fetchLayer(layer, '51.5,5,51.51,5.01', bbox); } catch (e) { error = e; }
  check('fetchLayer failure is an ExportFailure with typed details',
    error instanceof ov.ExportFailure
      && error.phase === 'fetch'
      && Array.isArray(error.details?.failures)
      && error.details.failures.every(f => f.kind === 'network'),
    String(error));
  check('user message names the kind of outage', /network/.test(error?.userMessage || ''), error?.userMessage);
}

clearInterval(keepAlive);
if (failures) { console.error(`\noverpass-fetch: ${failures} check(s) failed`); process.exit(1); }
console.log('\noverpass-fetch: shared fetch contract holds');
