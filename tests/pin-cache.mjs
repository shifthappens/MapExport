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
import { execFileSync, spawn } from 'node:child_process';
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
// Shared by the 'signal' stub and the signal test's elapsed-time assertion —
// independent review, round 4, 2026-09-16: a previous version bumped only the
// assertion's threshold to imply a 5s stub sleep while the generated stub
// still hardcoded `sleep 2`, so the elapsed-time check would have passed even
// for an uninterrupted run that was never actually signaled.
const SIGNAL_STUB_SLEEP_S = 5;

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
import { execFileSync } from 'node:child_process';
const keys = ${JSON.stringify(KEYS)};
const behaviour = ${JSON.stringify(behaviour)};
if (process.argv.includes('--list-keys')) {
  if (behaviour === 'signal-early') {
    console.error('READY_FOR_EARLY_SIGNAL');
    execFileSync('sleep', ['${SIGNAL_STUB_SLEEP_S}']);
  }
  console.log(keys.join('\\n'));
  process.exit(0);
}
if (behaviour === 'fail') { console.error('stub prefetch failed'); process.exit(1); }
if (behaviour === 'deadline') {
  fs.writeFileSync('cache/k_alpha.json.gz', zlib.gzipSync(JSON.stringify({ elements: [{ id: 1, marker: 'fresh' }] })));
  console.error('stub prefetch hit its deadline after one key');
  process.exit(1);
}
if (behaviour === 'signal') {
  fs.writeFileSync('cache/k_alpha.json.gz', zlib.gzipSync(JSON.stringify({ elements: [{ id: 1, marker: 'fresh' }] })));
  console.log('READY_FOR_SIGNAL');
  execFileSync('sleep', ['${SIGNAL_STUB_SLEEP_S}']);
  process.exit(0);
}
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

// A directory of one-off fake binaries placed ahead of the real ones on
// PATH, for provoking a `cp`/`mv` failure that a permission bit can't: one
// that leaves real (if garbage) bytes behind, the shape a genuine interrupted
// copy or failed rename actually takes (independent review, round 3,
// 2026-09-16 — see the two tests below for why a read-only directory doesn't
// prove what it looks like it proves).
function makeFakeBin(root, name, script) {
  const dir = path.join(root, 'fakebin');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), script);
  fs.chmodSync(path.join(dir, name), 0o755);
  return dir;
}
const runWithPath = (root, fakeBinDir, ...args) => {
  try {
    return { ok: true, out: execFileSync('bash', ['tools/pin-cache.sh', ...args],
      { cwd: root, encoding: 'utf8', env: { ...process.env, PATH: `${fakeBinDir}:${process.env.PATH}` } }) };
  } catch (error) {
    return { ok: false, out: `${error.stdout || ''}${error.stderr || ''}` };
  }
};

// ---- a copy that fails partway must not replace a good pin, and this has to
// be exercised through `refresh` with a SUCCESSFUL fetch, not a standalone
// `pin` call or a failing one (independent review, round 2 and round 3,
// 2026-09-16):
// - round 2: the first version invoked `pin` directly, where `set -e` is
//   still fully active and would have aborted on even the ORIGINAL unchecked
//   `cp` before it ever reached the following `mv` — so it passed against
//   both the fixed and the unfixed code. The bug only exists when cmd_pin
//   runs with errexit suspended, which only happens via cmd_refresh's
//   `cmd_pin || pin_status=$?`.
// - round 3: routing it through `refresh` via a chmod-555 pinned dir still
//   didn't prove the cp check matters, for two reasons — a read-only
//   directory blocks `cp` from creating anything at all, which isn't what a
//   real interrupted copy does (real ones leave partial bytes behind, so the
//   ORIGINAL unchecked code's next line, `mv`, would still find a file to
//   rename over the good pin — corrupting it), and using the 'deadline' stub
//   (which already exits 1) meant "refresh reports failure" never actually
//   depended on the pin step failing. Fixed on both counts: a fake `cp` ahead
//   of the real one writes garbage to the destination and then exits 1 (a
//   real failed-copy shape), and the stub now completes a normal, successful
//   fetch so any failure is attributable only to pinning it. ----
{
  const root = makeRepo('fill');
  fs.mkdirSync(path.join(root, 'cache/pinned'), { recursive: true });
  for (const key of KEYS) {
    fs.writeFileSync(live(root, key), entry('old'));
    fs.writeFileSync(pin(root, key), entry('previously-pinned'));
  }
  const fakeBin = makeFakeBin(root, 'cp', '#!/bin/bash\necho -n "CORRUPTED-PARTIAL-COPY" > "$2"\nexit 1\n');
  const r = runWithPath(root, fakeBin, 'refresh');
  check('refresh reports failure when the copy itself fails', !r.ok, r.out);
  check('every pin is untouched, not replaced by a failed, partially-written copy',
    KEYS.every(k => markerOf(pin(root, k)) === 'previously-pinned'), r.out);
  check('no stray temp file is left behind',
    fs.readdirSync(path.join(root, 'cache/pinned')).every(f => !f.endsWith('.tmp')));
  fs.rmSync(root, { recursive: true, force: true });
}

// ---- a rename that fails (copy succeeds, mv doesn't) must not count as
// success either (independent review, round 2 and round 3, 2026-09-16):
// - round 2: the cp fix only checked cp's own exit status; `mv -f` right
//   after it was still unchecked, so a copy that lands fine followed by a
//   rename that fails would still increment `copied` and could report
//   success despite the pin never actually updating.
// - round 3: the first version used macOS's `chflags uchg` on the pin's
//   final name, an unconditional macOS-only dependency in an otherwise
//   platform-agnostic offline suite, and a 'deadline' stub that again left
//   "refresh reports failure" provable without the rename check. Fixed with
//   a portable fake `mv` (only fails cmd_pin's own rename — a source ending
//   in .tmp destined for cache/pinned/ — every other mv, like the refresh
//   parking loop moving live entries into the stash, still runs for real) and
//   a successful fetch, same reasoning as the copy test above. ----
{
  const root = makeRepo('fill');
  fs.mkdirSync(path.join(root, 'cache/pinned'), { recursive: true });
  for (const key of KEYS) {
    fs.writeFileSync(live(root, key), entry('old'));
    fs.writeFileSync(pin(root, key), entry('previously-pinned'));
  }
  const fakeBin = makeFakeBin(root, 'mv', [
    '#!/bin/bash',
    'if [ "$1" = "-f" ] && [[ "$2" == *.tmp ]] && [[ "$3" == *cache/pinned/* ]]; then exit 1; fi',
    'exec /bin/mv "$@"',
    '',
  ].join('\n'));
  const r = runWithPath(root, fakeBin, 'refresh');
  check('refresh reports failure when the rename itself fails', !r.ok, r.out);
  check('every pin is untouched, not replaced by a failed rename',
    KEYS.every(k => markerOf(pin(root, k)) === 'previously-pinned'), r.out);
  check('no stray temp file is left behind',
    fs.readdirSync(path.join(root, 'cache/pinned')).every(f => !f.endsWith('.tmp')));
  fs.rmSync(root, { recursive: true, force: true });
}

// ---- a refresh interrupted by a real signal mid-fetch still pins only what
// it fetched, in the same order as a deadline exit (independent review,
// rounds 2 and 3, 2026-09-16):
// - round 2: the previous trap (`trap 'restore_stash; rm -f "$DISABLED"' EXIT
//   INT TERM`) ran restore_stash before execution ever reached the trailing
//   cmd_pin call on a caught signal, reproducing the stale-live-overwrites-pin
//   bug on Ctrl-C specifically, even after the deadline-exit case was fixed.
// - round 3: the first version of this test signaled only the bash process,
//   not the fetch it was waiting on. Bash does not interrupt its own wait()
//   the moment a trapped signal arrives — it defers running the trap until
//   the foreground command actually exits (confirmed empirically with a
//   standalone script) — so that version only proved "a pending signal
//   delivered after the fetch already finished on its own", which the
//   assertions could not tell apart from ordinary completion, and it never
//   checked that a signal was actually sent. Fixed by signaling the whole
//   process group instead (the way a terminal's Ctrl-C actually reaches a
//   running foreground job — it kills the fetch directly, not via Bash's
//   trap alone), and by asserting the run finished well before the stub's own
//   sleep would have — concrete, timing-based evidence of a genuine mid-fetch
//   interruption rather than a race that could pass for the wrong reason.
// - round 4: the elapsed-time threshold was bumped to assume a 5s stub sleep
//   while the generated stub still hardcoded `sleep 2`, so the assertion
//   would have passed even for a run that was never actually interrupted —
//   fixed by driving both the stub and the threshold off one constant
//   (SIGNAL_STUB_SLEEP_S). `signaled` was also set before the kill(2) call
//   even attempted delivery, and a delivery failure was silently swallowed;
//   fixed to only flip `signaled` after a successful kill(2) and to fail the
//   test outright (not silently pass) if delivery itself throws. ----
{
  const root = makeRepo('signal');
  fs.mkdirSync(path.join(root, 'cache/pinned'), { recursive: true });
  for (const key of KEYS) {
    fs.writeFileSync(live(root, key), entry('old'));
    fs.writeFileSync(pin(root, key), entry('previously-pinned'));
  }
  const STUB_SLEEP_MS = SIGNAL_STUB_SLEEP_S * 1000;
  const start = Date.now();
  let signaled = false;
  await new Promise((resolve, reject) => {
    const child = spawn('bash', ['tools/pin-cache.sh', 'refresh'], { cwd: root, detached: true });
    let out = '';
    const onData = (d) => {
      out += d;
      if (!signaled && out.includes('READY_FOR_SIGNAL')) {
        try {
          process.kill(-child.pid, 'SIGTERM');
          signaled = true;
        } catch (err) {
          reject(new Error(`signal test: failed to deliver SIGTERM to the process group: ${err.message}\n${out}`));
        }
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', reject);
    const timeout = setTimeout(() => {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
      reject(new Error(`signal test: refresh did not exit within the bound; signaled=${signaled}\n${out}`));
    }, STUB_SLEEP_MS + 5000);
    child.on('close', () => {
      clearTimeout(timeout);
      const elapsed = Date.now() - start;
      if (!signaled) {
        reject(new Error(`signal test: refresh exited before the READY_FOR_SIGNAL marker was seen — never actually signaled\n${out}`));
        return;
      }
      check('signaled: the run finished well before the stub\'s own sleep would have, proving the signal actually interrupted the fetch',
        elapsed < STUB_SLEEP_MS - 1000, `elapsed ${elapsed}ms, stub sleep ${STUB_SLEEP_MS}ms\n${out}`);
      check('signaled: the key fetched before the signal is pinned',
        markerOf(pin(root, 'k_alpha')) === 'fresh', out);
      check('signaled: untouched keys keep their existing pin, not a restored live copy',
        markerOf(pin(root, 'k_beta')) === 'previously-pinned' &&
        markerOf(pin(root, 'k_gamma')) === 'previously-pinned', out);
      check('signaled: cleanup ran to completion — .disabled was lifted',
        !fs.existsSync(path.join(root, 'cache/pinned/.disabled')), out);
      check('signaled: cleanup ran to completion — the stash is gone',
        !fs.existsSync(path.join(root, 'cache/.refresh-stash')), out);
      resolve();
    });
  });
  fs.rmSync(root, { recursive: true, force: true });
}

// ---- a refresh interrupted by a real signal BEFORE the fetch even starts —
// still mid-setup or parking — must abort outright, not clean up once and
// then keep running the rest of the function as though nothing happened
// (independent review, round 4, 2026-09-16: a bash trap that runs a handler
// and returns, without an explicit `exit`, does not itself terminate the
// script — bash resumes executing right after wherever the signal landed.
// The mid-fetch case above looked correct even without an explicit exit only
// because a real Ctrl-C kills the foreground fetch child directly via
// process-group delivery, so the interrupted `node ...` line was already
// exiting on its own; a signal caught anywhere else in cmd_refresh — e.g.
// here, while still listing keys to park — would otherwise have cleaned up
// once and then resumed the parking loop, recreated $DISABLED, and started a
// fetch that was supposed to have been cancelled. Fixed by giving INT/TERM
// their own trap that explicitly exits right after do_cleanup. This uses the
// stub's --list-keys path, which cmd_refresh's own parking loop calls before
// $fetch_started is ever set, to get a reliable signal point that early.) ----
{
  const root = makeRepo('signal-early');
  fs.mkdirSync(path.join(root, 'cache/pinned'), { recursive: true });
  for (const key of KEYS) {
    fs.writeFileSync(live(root, key), entry('old'));
    fs.writeFileSync(pin(root, key), entry('previously-pinned'));
  }
  const STUB_SLEEP_MS = SIGNAL_STUB_SLEEP_S * 1000;
  const start = Date.now();
  let signaled = false;
  await new Promise((resolve, reject) => {
    const child = spawn('bash', ['tools/pin-cache.sh', 'refresh'], { cwd: root, detached: true });
    let out = '';
    const onData = (d) => {
      out += d;
      if (!signaled && out.includes('READY_FOR_EARLY_SIGNAL')) {
        try {
          process.kill(-child.pid, 'SIGTERM');
          signaled = true;
        } catch (err) {
          reject(new Error(`early-signal test: failed to deliver SIGTERM to the process group: ${err.message}\n${out}`));
        }
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', reject);
    const timeout = setTimeout(() => {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
      reject(new Error(`early-signal test: refresh did not exit within the bound; signaled=${signaled}\n${out}`));
    }, STUB_SLEEP_MS + 5000);
    child.on('close', () => {
      clearTimeout(timeout);
      const elapsed = Date.now() - start;
      if (!signaled) {
        reject(new Error(`early-signal test: refresh exited before the READY_FOR_EARLY_SIGNAL marker was seen — never actually signaled\n${out}`));
        return;
      }
      check('early-signal: the run finished well before the stub\'s own sleep would have, proving the signal actually interrupted setup, not just the fetch',
        elapsed < STUB_SLEEP_MS - 1000, `elapsed ${elapsed}ms, stub sleep ${STUB_SLEEP_MS}ms\n${out}`);
      check('early-signal: the run aborted rather than resuming — nothing was ever fetched or pinned',
        markerOf(pin(root, 'k_alpha')) === 'previously-pinned' &&
        markerOf(pin(root, 'k_beta')) === 'previously-pinned' &&
        markerOf(pin(root, 'k_gamma')) === 'previously-pinned', out);
      check('early-signal: live entries were never touched — the run aborted before parking got underway',
        markerOf(live(root, 'k_alpha')) === 'old' &&
        markerOf(live(root, 'k_beta')) === 'old' &&
        markerOf(live(root, 'k_gamma')) === 'old', out);
      check('early-signal: cleanup ran to completion — .disabled was lifted',
        !fs.existsSync(path.join(root, 'cache/pinned/.disabled')), out);
      check('early-signal: cleanup ran to completion — the stash is gone',
        !fs.existsSync(path.join(root, 'cache/.refresh-stash')), out);
      resolve();
    });
  });
  fs.rmSync(root, { recursive: true, force: true });
}

// ---- a second signal arriving while cleanup itself is running (mid-cmd_pin,
// after a successful fetch) must not abort cleanup partway (independent
// review, round 5, 2026-09-16): the cleanup_done latch was set before
// cmd_pin/restore_stash/rm -f "$DISABLED" actually ran, so a signal caught
// while they were still in progress re-entered the already-latched
// do_cleanup, returned immediately, and let the INT/TERM trap's explicit
// `exit` (the round-4 fix) abandon restore_stash and the .disabled removal —
// turning the round-4 fix itself into the mechanism for a new failure mode.
// Fixed by masking INT/TERM for the duration of cleanup's own work, so a
// signal landing there is dropped instead of re-entering (round 6, 2026-09-16:
// the mask itself has to be the very first thing do_cleanup does — a version
// that set it right after the latch left a one-line window where the same
// bug could still happen). A fake `cp` sleeps once, on the first key only,
// giving a reliable window to signal during cmd_pin specifically (not during
// setup or the fetch, both already covered above). The discriminating checks
// are the exit code and the cleanup-completion assertions below — reverting
// the fix makes the run exit 143 with .disabled and the stash left behind.
// The elapsed-time check does NOT discriminate the fix on its own (confirmed
// by mutation testing, round 6): bash defers running a trapped signal's
// handler until the current foreground command completes, so the fake cp's
// sleep runs to completion either way. It also does not by itself prove the
// signal landed mid-copy (round 7, 2026-09-16) — that is established by the
// marker-triggered kill above (`signaled` only flips once READY_FOR_CLEANUP_
// SIGNAL has actually been seen); elapsed time here only confirms the run
// didn't exit early or hang. ----
{
  const root = makeRepo('fill');
  fs.mkdirSync(path.join(root, 'cache/pinned'), { recursive: true });
  for (const key of KEYS) {
    fs.writeFileSync(live(root, key), entry('old'));
    fs.writeFileSync(pin(root, key), entry('previously-pinned'));
  }
  const fakeBin = makeFakeBin(root, 'cp', [
    '#!/bin/bash',
    'marker=".cleanup-signal-cp-marker"',
    'if [ ! -f "$marker" ]; then',
    '  touch "$marker"',
    `  echo READY_FOR_CLEANUP_SIGNAL >&2`,
    `  sleep ${SIGNAL_STUB_SLEEP_S}`,
    'fi',
    'exec /bin/cp "$@"',
    '',
  ].join('\n'));
  const STUB_SLEEP_MS = SIGNAL_STUB_SLEEP_S * 1000;
  const start = Date.now();
  let signaled = false;
  await new Promise((resolve, reject) => {
    const child = spawn('bash', ['tools/pin-cache.sh', 'refresh'],
      { cwd: root, detached: true, env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` } });
    let out = '';
    let exitCode = null;
    const onData = (d) => {
      out += d;
      if (!signaled && out.includes('READY_FOR_CLEANUP_SIGNAL')) {
        try {
          process.kill(-child.pid, 'SIGTERM');
          signaled = true;
        } catch (err) {
          reject(new Error(`cleanup-signal test: failed to deliver SIGTERM to the process group: ${err.message}\n${out}`));
        }
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', reject);
    child.on('exit', (code) => { exitCode = code; });
    const timeout = setTimeout(() => {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
      reject(new Error(`cleanup-signal test: refresh did not exit within the bound; signaled=${signaled}\n${out}`));
    }, STUB_SLEEP_MS + 5000);
    child.on('close', () => {
      clearTimeout(timeout);
      const elapsed = Date.now() - start;
      if (!signaled) {
        reject(new Error(`cleanup-signal test: refresh exited before the READY_FOR_CLEANUP_SIGNAL marker was seen — never actually signaled\n${out}`));
        return;
      }
      check('cleanup-signal: the run did not exit early or hang — it ran the fake cp\'s full sleep and finished',
        elapsed >= STUB_SLEEP_MS - 1000, `elapsed ${elapsed}ms, stub sleep ${STUB_SLEEP_MS}ms\n${out}`);
      check('cleanup-signal: refresh still reports success — the extra signal did not abort the run',
        exitCode === 0, `exit ${exitCode}\n${out}`);
      check('cleanup-signal: every key was pinned with the fresh fetched data',
        KEYS.every(k => markerOf(pin(root, k)) === 'fresh'), out);
      check('cleanup-signal: cleanup ran to completion — .disabled was lifted',
        !fs.existsSync(path.join(root, 'cache/pinned/.disabled')), out);
      check('cleanup-signal: cleanup ran to completion — the stash is gone',
        !fs.existsSync(path.join(root, 'cache/.refresh-stash')), out);
      resolve();
    });
  });
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

// ---- a refresh that hits its deadline still pins what it did fetch ----
// (regression: set -e used to skip the trailing `cmd_pin` call whenever the
// prefetcher exited non-zero, so a deadline or Ctrl-C left every freshly
// fetched entry live but never pinned — Coen had to run `pin-cache.sh pin`
// by hand afterwards, 2026-09-15.)
{
  const root = makeRepo('deadline');
  for (const key of KEYS) fs.writeFileSync(live(root, key), entry('old'));
  const r = run(root, 'refresh');
  check('refresh still reports the deadline as a failure', !r.ok, r.out);
  check('the key fetched before the deadline is pinned',
    fs.existsSync(pin(root, 'k_alpha')) && markerOf(pin(root, 'k_alpha')) === 'fresh');
  check('the keys never reached are restored to their previous live data',
    markerOf(live(root, 'k_beta')) === 'old' && markerOf(live(root, 'k_gamma')) === 'old');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---- an incomplete refresh never re-pins a key it did not touch, even if
// that key's live copy has drifted from its existing pin (independent
// review finding, 2026-09-16: pinning after restore_stash would silently
// re-pin every untouched key's old live content, which could differ from
// what was actually pinned if unrelated cache.php traffic had since
// rewritten it) ----
{
  const root = makeRepo('deadline');
  fs.mkdirSync(path.join(root, 'cache/pinned'), { recursive: true });
  for (const key of KEYS) {
    fs.writeFileSync(live(root, key), entry('old'));
    fs.writeFileSync(pin(root, key), entry('previously-pinned'));
  }
  run(root, 'refresh');
  check('the fetched key is re-pinned with the fresh data',
    markerOf(pin(root, 'k_alpha')) === 'fresh');
  check('untouched keys keep their existing pin untouched, not their drifted live copy',
    markerOf(pin(root, 'k_beta')) === 'previously-pinned' &&
    markerOf(pin(root, 'k_gamma')) === 'previously-pinned');
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
