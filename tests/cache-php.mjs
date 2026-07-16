// ME-04a/b request tests for cache.php: payload bounds, upload validation
// and atomic (temp-file + rename) writes.
//
// Scope: runs OFFLINE against PHP's built-in webserver on localhost — no
// Overpass, no repo cache/ writes. A throwaway docroot gets a copy of
// cache.php and its own cache/ dir; every request in here talks to that.
// post_max_size/memory_limit are raised on the test server so the limits
// being exercised are cache.php's own, not the SAPI's (production hosting
// caps requests earlier still — defense in depth, not a contradiction).
//
// Usage:  node tests/cache-php.mjs   (needs a `php` CLI on PATH)

import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

try { execFileSync('php', ['-v'], { stdio: 'ignore' }); }
catch { console.error('[cache] SKIP-FAIL: php CLI not found — this test needs it'); process.exit(1); }

// ---- throwaway docroots + servers (one per limit configuration) ----
const servers = [];
process.on('exit', () => {
  for (const s of servers) { try { s.php.kill(); } catch {} try { fs.rmSync(s.docroot, { recursive: true, force: true }); } catch {} }
});

let nextPort = 18730 + (process.pid % 200) * 3;
async function startServer(env = {}) {
  const docroot = fs.mkdtempSync(path.join(os.tmpdir(), 'mapexport-cache-test-'));
  fs.copyFileSync(path.join(REPO, 'cache.php'), path.join(docroot, 'cache.php'));
  const port = nextPort++;
  const php = spawn('php', [
    '-d', 'post_max_size=64M', '-d', 'memory_limit=256M',
    '-d', 'display_errors=0', '-d', 'log_errors=0',
    '-S', `127.0.0.1:${port}`, '-t', docroot,
  ], { stdio: 'ignore', env: { ...process.env, ...env } });
  const srv = { php, docroot, exited: false,
    base: `http://127.0.0.1:${port}/cache.php`, cacheDir: path.join(docroot, 'cache') };
  php.on('exit', () => { srv.exited = true; });
  servers.push(srv);
  for (let i = 0; ; i++) {
    if (srv.exited) { console.error(`[cache] php -S failed to start on :${port}`); process.exit(1); }
    try { await fetch(`${srv.base}?key=warmup`); break; }
    catch {
      if (i >= 50) { console.error('[cache] php -S never became reachable'); process.exit(1); }
      await new Promise(r => setTimeout(r, 100));
    }
  }
  return srv;
}

const main = await startServer(); // production-default limits
const { base: BASE, cacheDir } = main;

// ---- tiny assertion harness (same shape as the other offline tests) ----
let failures = 0;
function check(name, ok, detail = '') {
  if (ok) { console.log(`[cache] ok  ${name}`); }
  else { console.error(`[cache] FAIL ${name}${detail ? ` — ${detail}` : ''}`); failures++; }
}

const JSON_HDR = { 'Content-Type': 'application/json' };
const GZ_HDR = { ...JSON_HDR, 'Content-Encoding': 'gzip' };
const post = (key, body, headers = JSON_HDR, method = 'POST') =>
  fetch(`${BASE}?key=${encodeURIComponent(key)}`, { method, headers, body });
const get = key => fetch(`${BASE}?key=${encodeURIComponent(key)}`);
const cacheFiles = () => fs.existsSync(cacheDir) ? fs.readdirSync(cacheDir) : [];
const noTempLeft = () => cacheFiles().every(f => !f.startsWith('.tmp'));

const doc = { version: 0.6, generator: 'test', elements: [{ type: 'node', id: 1, lat: 51.5, lon: 5.0 }] };
const docJson = JSON.stringify(doc);

// ---- happy paths stay compatible ----
{
  let r = await post('t_plain', docJson);
  check('plain JSON POST → 204', r.status === 204, `got ${r.status}`);
  r = await get('t_plain');
  check('plain POST readable, X-Cache HIT', r.status === 200 && r.headers.get('x-cache') === 'HIT');
  check('plain POST roundtrips', JSON.stringify(await r.json()) === docJson);
  check('plain POST stored gzipped on disk', cacheFiles().includes('t_plain.json.gz'));

  r = await post('t_gz', zlib.gzipSync(docJson), GZ_HDR);
  check('gzip POST → 204', r.status === 204, `got ${r.status}`);
  r = await get('t_gz');
  check('gzip POST roundtrips via gzip passthrough', JSON.stringify(await r.json()) === docJson);

  const envelope = JSON.stringify({ elements: [] }); // v1's {elements} cacheSet shape
  r = await post('t_envelope', zlib.gzipSync(envelope), GZ_HDR);
  check('{elements:[]} envelope accepted', r.status === 204, `got ${r.status}`);

  r = await get('t_missing');
  check('miss still returns null body', r.status === 200 && (await r.text()) === 'null');

  r = await fetch(`${BASE}?exists=${['t_plain', 't_gz', 't_missing', 'bad/key'].map(encodeURIComponent).join(',')}`);
  const ex = await r.json();
  check('?exists= batch probe unchanged',
    ex.t_plain === true && ex.t_gz === true && ex.t_missing === false && ex['bad/key'] === false,
    JSON.stringify(ex));

  // legacy uncompressed hit still served, and replaced by a POST
  fs.writeFileSync(path.join(cacheDir, 't_legacy.json'), docJson);
  r = await get('t_legacy');
  check('legacy .json hit served', r.status === 200 && r.headers.get('x-cache') === 'HIT'
    && JSON.stringify(await r.json()) === docJson);
  await post('t_legacy', docJson);
  check('POST retires legacy file', !cacheFiles().includes('t_legacy.json')
    && cacheFiles().includes('t_legacy.json.gz'));

  // TTL expiry still evicts
  const old = path.join(cacheDir, 't_plain.json.gz');
  const past = new Date(Date.now() - 8 * 24 * 3600 * 1000);
  fs.utimesSync(old, past, past);
  r = await get('t_plain');
  check('expired entry evicted to null', (await r.text()) === 'null' && !fs.existsSync(old));
}

// ---- ME-04a: rejects before storage ----
{
  let r = await post('r_key/../evil', docJson);
  check('slash/traversal key → 400', r.status === 400, `got ${r.status}`);
  r = await post('r_'.padEnd(140, 'x'), docJson);
  check('overlong key → 400', r.status === 400, `got ${r.status}`);

  r = await post('r_ctype', docJson, { 'Content-Type': 'text/plain' });
  check('non-JSON content type → 415', r.status === 415, `got ${r.status}`);
  r = await post('r_enc', docJson, { ...JSON_HDR, 'Content-Encoding': 'br' });
  check('unsupported content encoding → 415', r.status === 415, `got ${r.status}`);
  r = await post('r_method', docJson, JSON_HDR, 'DELETE');
  check('DELETE → 405 with Allow', r.status === 405 && /GET/.test(r.headers.get('allow') || ''), `got ${r.status}`);

  r = await post('r_notjson', 'this is not json at all');
  check('non-JSON plain body → 400', r.status === 400, `got ${r.status}`);
  r = await post('r_shape', JSON.stringify({ foo: 1 }));
  check('JSON without elements[] → 400', r.status === 400, `got ${r.status}`);
  r = await post('r_shape_gz', zlib.gzipSync(JSON.stringify({ foo: 1 })), GZ_HDR);
  check('gzipped JSON without elements[] → 400', r.status === 400, `got ${r.status}`);

  const bigDoc = JSON.stringify({ elements: [], pad: 'x'.repeat(9 * 1024 * 1024) });
  r = await post('r_bigplain', bigDoc);
  check('9 MiB plain body → 413', r.status === 413, `got ${r.status}`);
  const bigGz = zlib.gzipSync(Buffer.concat([Buffer.from('{"elements":["'),
    Buffer.from(randomBytes(9 * 1024 * 1024).toString('base64')), Buffer.from('"]}')]));
  if (bigGz.length > 8 * 1024 * 1024) {
    r = await post('r_biggz', bigGz, GZ_HDR);
    check('oversized compressed body → 413', r.status === 413, `got ${r.status}`);
  } else {
    check('oversized compressed body → 413', false, `fixture only ${bigGz.length} bytes — enlarge it`);
  }

  // gzip bomb: ~100 MiB of JSON-ish zeros compresses to ~100 KiB but must
  // trip the decompressed cap, not fill the disk
  const bomb = zlib.gzipSync(Buffer.concat([
    Buffer.from('{"elements":["'), Buffer.alloc(100 * 1024 * 1024, 0x30), Buffer.from('"]}')]));
  r = await post('r_bomb', bomb, GZ_HDR);
  check('gzip bomb → 413 via decompressed cap', r.status === 413, `got ${r.status}`);

  const gz = zlib.gzipSync(docJson);
  r = await post('r_trunc', gz.subarray(0, gz.length - 6), GZ_HDR);
  check('truncated gzip stream → 400', r.status === 400, `got ${r.status}`);
  r = await post('r_garbage', Buffer.from('definitely not a gzip stream'), GZ_HDR);
  check('corrupt gzip stream → 400', r.status === 400, `got ${r.status}`);
  r = await post('r_empty', Buffer.alloc(0), GZ_HDR);
  check('empty gzip body → 400', r.status === 400, `got ${r.status}`);

  for (const k of ['r_ctype', 'r_enc', 'r_notjson', 'r_shape', 'r_shape_gz', 'r_bigplain', 'r_biggz', 'r_bomb', 'r_trunc', 'r_garbage', 'r_empty']) {
    const miss = (await (await get(k)).text()) === 'null';
    if (!miss) check(`rejected upload ${k} not stored`, false);
  }
  check('no rejected upload was stored', true);
}

// ---- ME-04b: atomicity observable side ----
{
  check('no .tmp staging files left behind', noTempLeft(), cacheFiles().join(','));
  // dotfiles (.lastsweep marker, .ratelimit/ counters) are bookkeeping, not entries
  const entries = cacheFiles().filter(f => !f.startsWith('.'));
  check('cache dir holds only complete .json.gz entries',
    entries.length > 0 && entries.every(f => f.endsWith('.json.gz')), entries.join(','));

  // overwrite of an existing key swaps content completely
  const doc2 = JSON.stringify({ elements: [{ type: 'node', id: 2 }] });
  await post('t_gz', zlib.gzipSync(doc2), GZ_HDR);
  const r = await get('t_gz');
  check('overwrite replaces content atomically', JSON.stringify(await r.json()) === doc2);

  // a failed overwrite leaves the previous complete entry in place
  const gz = zlib.gzipSync(doc2);
  await post('t_gz', gz.subarray(0, gz.length - 6), GZ_HDR);
  const r2 = await get('t_gz');
  check('failed overwrite keeps previous entry', JSON.stringify(await r2.json()) === doc2);
}

// ---- ME-04c: per-IP write rate limit (dedicated server, 5 writes / 60 s) ----
{
  const rl = await startServer({ MAPEXPORT_CACHE_RL_MAX: '5', MAPEXPORT_CACHE_RL_WINDOW: '60' });
  let last;
  for (let i = 1; i <= 5; i++) last = await fetch(`${rl.base}?key=rl_${i}`, { method: 'POST', headers: JSON_HDR, body: docJson });
  check('writes within the limit → 204', last.status === 204, `got ${last.status}`);
  const over = await fetch(`${rl.base}?key=rl_6`, { method: 'POST', headers: JSON_HDR, body: docJson });
  check('write over the limit → 429 with Retry-After',
    over.status === 429 && +(over.headers.get('retry-after') || 0) >= 1, `got ${over.status}`);
  check('throttled write not stored', (await (await fetch(`${rl.base}?key=rl_6`)).text()) === 'null');
  const rd = await fetch(`${rl.base}?key=rl_1`);
  check('reads are never rate limited', rd.status === 200 && rd.headers.get('x-cache') === 'HIT');
}

// ---- ME-04c: total-size cap prunes oldest (dedicated server, 15 KB cap) ----
{
  const sz = await startServer({
    MAPEXPORT_CACHE_MAX_BYTES: '15000', MAPEXPORT_CACHE_SWEEP_INTERVAL: '0',
    MAPEXPORT_CACHE_RL_MAX: '1000',
  });
  // incompressible ~3 KiB per entry so sizes on disk are predictable
  const fat = () => JSON.stringify({ elements: [], pad: randomBytes(2200).toString('base64') });
  for (let i = 1; i <= 6; i++) {
    await fetch(`${sz.base}?key=sz_${i}`, { method: 'POST', headers: JSON_HDR, body: fat() });
    // sweeps order by mtime — spread them so "oldest" is well-defined
    const t = new Date(Date.now() - (10 - i) * 60000);
    fs.utimesSync(path.join(sz.cacheDir, `sz_${i}.json.gz`), t, t);
  }
  await fetch(`${sz.base}?key=sz_7`, { method: 'POST', headers: JSON_HDR, body: fat() });
  const left = fs.readdirSync(sz.cacheDir).filter(f => f.endsWith('.json.gz'));
  const total = left.reduce((n, f) => n + fs.statSync(path.join(sz.cacheDir, f)).size, 0);
  check('sweep prunes cache below the size cap', total <= 15000, `${total} bytes across ${left.join(',')}`);
  check('oldest entries pruned first, newest kept',
    !left.includes('sz_1.json.gz') && left.includes('sz_7.json.gz'), left.join(','));

  // proactive TTL deletion: an expired entry disappears on sweep, without a read
  const stale = path.join(sz.cacheDir, 'sz_stale.json.gz');
  fs.writeFileSync(stale, zlib.gzipSync(docJson));
  const past = new Date(Date.now() - 8 * 24 * 3600 * 1000);
  fs.utimesSync(stale, past, past);
  await fetch(`${sz.base}?key=sz_8`, { method: 'POST', headers: JSON_HDR, body: fat() });
  check('sweep proactively deletes TTL-expired entries', !fs.existsSync(stale));
}

if (failures) { console.error(`[cache] ${failures} check(s) failed`); process.exit(1); }
console.log('[cache] all checks passed');
process.exit(0);
