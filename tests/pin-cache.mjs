// Offline guard for tools/pin-cache.sh — the tool that owns cache/pinned/, the
// never-expiring snapshot of the seven validation cities.
//
// Nothing ever expires a pin, so every mistake this script can make is
// permanent: a truncated entry frozen in, a good pin replaced by half a file,
// or a "refresh" that quietly refreshes nothing because the prefetcher counted
// the stale local copies as hits. Those three are what this pins down.
//
// The script does `cd "$(dirname "$0")/.."` and works in `cache/`, so the test
// builds a throwaway repo shaped like this one — a copy of the real script, a
// stub prefetcher standing in for the network — and runs it there. No network,
// no cache.php, no PHP.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let failures = 0;
const check = (name, cond, detail = '') => {
  console.log(`[pin-cache] ${cond ? 'ok ' : 'FAIL'} ${name}${cond || !detail ? '' : ` — ${detail}`}`);
  if (!cond) failures++;
};

const KEYS = ['k_alpha', 'k_beta', 'k_gamma'];
const entry = (marker) => zlib.gzipSync(JSON.stringify({ elements: [{ id: 1, marker }] }));

// A fake repo root: the real script, a stub key source, an empty cache.
// `behaviour` shapes what the stub prefetcher does when the script calls it.
function makeRepo(behaviour = 'fill') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-cache-test-'));
  fs.mkdirSync(path.join(root, 'tools'));
  fs.mkdirSync(path.join(root, 'cache'));
  fs.copyFileSync(path.join(repoRoot, 'tools/pin-cache.sh'), path.join(root, 'tools/pin-cache.sh'));
  fs.chmodSync(path.join(root, 'tools/pin-cache.sh'), 0o755);
  // Stands in for tools/prefetch-validation-cache.mjs. --list-keys is the real
  // contract (the script derives its key list from it); without it, the stub
  // writes what a successful Overpass round would have written.
  fs.writeFileSync(path.join(root, 'tools/prefetch-validation-cache.mjs'), `
import fs from 'node:fs';
import zlib from 'node:zlib';
const keys = ${JSON.stringify(KEYS)};
if (process.argv.includes('--list-keys')) { console.log(keys.join('\\n')); process.exit(0); }
const behaviour = ${JSON.stringify(behaviour)};
if (behaviour === 'fail') { console.error('stub prefetch failed'); process.exit(1); }
const written = behaviour === 'partial' ? keys.slice(0, 1) : keys;
for (const key of written) {
  fs.writeFileSync('cache/' + key + '.json.gz',
    zlib.gzipSync(JSON.stringify({ elements: [{ id: 1, marker: 'fresh' }] })));
}
console.log('stub prefetch wrote ' + written.length + ' entries');
`);
  return root;
}
const run = (root, ...args) => {
  try {
    return { ok: true, out: execFileSync('bash', ['tools/pin-cache.sh', ...args], { cwd: root, encoding: 'utf8' }) };
  } catch (error) {
    return { ok: false, out: `${error.stdout || ''}${error.stderr || ''}` };
  }
};
const live = (root, key) => path.join(root, 'cache', `${key}.json.gz`);
const pin = (root, key) => path.join(root, 'cache/pinned', `${key}.json.gz`);
const markerOf = (file) => JSON.parse(zlib.gunzipSync(fs.readFileSync(file))).elements[0].marker;

// ---- status ----
{
  const root = makeRepo();
  let r = run(root, 'status');
  check('status fails while keys are unpinned', !r.ok);
  check('...and names every gap', KEYS.every(k => r.out.includes(`not pinned: ${k}`)));
  for (const key of KEYS) fs.writeFileSync(live(root, key), entry('old'));
  run(root, 'pin');
  r = run(root, 'status');
  check('status succeeds once every key is pinned', r.ok, r.out);
  check('...and counts them', r.out.includes('pinned: 3'), r.out);
  fs.rmSync(root, { recursive: true, force: true });
}

// ---- pin only freezes entries that are whole ----
{
  const root = makeRepo();
  fs.writeFileSync(live(root, 'k_alpha'), entry('good'));
  const whole = entry('truncatable');
  fs.writeFileSync(live(root, 'k_beta'), whole.subarray(0, Math.floor(whole.length / 2)));
  fs.writeFileSync(live(root, 'k_gamma'), zlib.gzipSync('<html>503 Service Unavailable</html>'));
  const r = run(root, 'pin');
  check('pin reports failure when an entry is not whole', !r.ok);
  check('a complete entry is pinned', fs.existsSync(pin(root, 'k_alpha')));
  check('a truncated gzip is refused', !fs.existsSync(pin(root, 'k_beta')), r.out);
  check('an error page that happens to gzip is refused', !fs.existsSync(pin(root, 'k_gamma')), r.out);
  check('no half-written temp file is left in pinned/',
    fs.readdirSync(path.join(root, 'cache/pinned')).every(f => !f.endsWith('.tmp')));

  // A pin that already exists must not be replaced by something worse.
  fs.writeFileSync(live(root, 'k_beta'), entry('good'));
  run(root, 'pin');
  fs.writeFileSync(live(root, 'k_beta'), whole.subarray(0, 10));
  run(root, 'pin');
  check('a broken live entry never overwrites a good pin', markerOf(pin(root, 'k_beta')) === 'good');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---- refresh really refetches ----
{
  const root = makeRepo('fill');
  for (const key of KEYS) {
    fs.writeFileSync(live(root, key), entry('old'));
    fs.mkdirSync(path.join(root, 'cache/pinned'), { recursive: true });
    fs.writeFileSync(pin(root, key), entry('old'));
  }
  const r = run(root, 'refresh');
  check('refresh succeeds', r.ok, r.out);
  // The bug this replaces: unexpired live entries were left in place, the
  // prefetcher reported them as hits, and the refresh fetched nothing.
  check('refresh parks the live entries so the prefetch cannot count them as hits',
    r.out.includes('parked'), r.out);
  check('every pin now holds the refetched data', KEYS.every(k => markerOf(pin(root, k)) === 'fresh'));
  check('...and so does the live cache', KEYS.every(k => markerOf(live(root, k)) === 'fresh'));
  check('the stash is gone afterwards', !fs.existsSync(path.join(root, 'cache/.refresh-stash')));
  check('pinned serving is switched back on', !fs.existsSync(path.join(root, 'cache/pinned/.disabled')));
  fs.rmSync(root, { recursive: true, force: true });
}

// ---- a failed refresh leaves the cache as it found it ----
{
  const root = makeRepo('fail');
  for (const key of KEYS) fs.writeFileSync(live(root, key), entry('old'));
  const r = run(root, 'refresh');
  check('refresh reports the prefetch failure', !r.ok, r.out);
  check('the parked live entries are put back', KEYS.every(k => fs.existsSync(live(root, k))));
  check('...unchanged', KEYS.every(k => markerOf(live(root, k)) === 'old'));
  check('the .disabled marker is lifted even on failure',
    !fs.existsSync(path.join(root, 'cache/pinned/.disabled')));
  check('no stash is left behind', !fs.existsSync(path.join(root, 'cache/.refresh-stash')));
  fs.rmSync(root, { recursive: true, force: true });
}

// ---- a partial refresh keeps what it did fetch and restores the rest ----
{
  const root = makeRepo('partial');
  for (const key of KEYS) fs.writeFileSync(live(root, key), entry('old'));
  run(root, 'refresh');
  check('the refetched key keeps its new data', markerOf(live(root, 'k_alpha')) === 'fresh');
  check('the keys the prefetch never reached are restored',
    markerOf(live(root, 'k_beta')) === 'old' && markerOf(live(root, 'k_gamma')) === 'old');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---- a stash from a killed run is recovered, not left to overwrite later ----
{
  // 'partial' so the prefetch only touches k_alpha: what happens to the other
  // two is decided by the recovery and the restore, not overwritten afterwards.
  const root = makeRepo('partial');
  const stash = path.join(root, 'cache/.refresh-stash');
  fs.mkdirSync(stash, { recursive: true });
  // k_beta: parked with no live copy — the stash holds the only copy.
  fs.writeFileSync(path.join(stash, 'k_beta.json.gz'), entry('stranded'));
  // k_gamma: a live entry appeared since the crash. It is newer than the parked
  // copy and must survive. Restoration links rather than renames precisely so
  // that a live entry can never be clobbered by an older parked one.
  fs.writeFileSync(path.join(stash, 'k_gamma.json.gz'), entry('stranded'));
  fs.writeFileSync(live(root, 'k_gamma'), entry('newer'));
  let r = run(root, 'status');
  check('status warns about a stash left by an interrupted refresh',
    r.out.includes('interrupted'), r.out);
  r = run(root, 'refresh');
  check('refresh recovers it before parking anything new',
    r.out.includes('recovering a stash'), r.out);
  check('the only copy of a stranded key is put back',
    markerOf(live(root, 'k_beta')) === 'stranded');
  check('recovery never replaces a live entry that is already there',
    markerOf(live(root, 'k_gamma')) === 'newer');
  check('the refetched key still ends up fresh', markerOf(live(root, 'k_alpha')) === 'fresh');
  fs.rmSync(root, { recursive: true, force: true });
}

console.log(failures === 0 ? '[pin-cache] all checks passed' : `[pin-cache] ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
