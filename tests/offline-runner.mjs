// Explicit manifest for deterministic, offline tests.  Live capture/export
// utilities are deliberately classified below rather than silently omitted.
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const testsDir = dirname(fileURLToPath(import.meta.url));
const guard = join(testsDir, 'offline-network-guard.cjs');
const runnerFile = join(testsDir, 'offline-runner.mjs');
let activeChild = null;

function killChildTree(child, signal) {
  try {
    if (process.platform !== 'win32') process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch { child.kill(signal); }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    if (activeChild) killChildTree(activeChild, signal);
    process.exit(signal === 'SIGINT' ? 130 : 143);
  });
}
const offlineNames = [
  'road-merge', 'road-order', 'abbreviate', 'label-placement', 'label-fit',
  'svg-lint-selftest', 'export-failures', 'preview-state', 'layer-selection',
  'overpass-fetch', 'fine-grid', 'svg-id-uniqueness', 'feature-label-dedup',
  'square-labels', 'place-labels', 'area-binding', 'unnamed-parks', 'park-paths',
  'rail-service', 'metro-dedup', 'metro-tunnel', 'editor-structure',
  'technical-names', 'pipeline-equivalence', 'supersession', 'sea-sign',
  'hamlet-grounding', 'fetch-padding-sync', 'v2-cutterless-coverage',
  'scenario-invariants',
  'v2-cutterless-worker', 'landcover-clip', 'v2-face-runtime-benchmark',
  'cache-php', 'pin-cache',
];
export const MANIFEST = {
  suites: [
    { name: 'offline-runner-selftest', file: 'offline-runner.mjs', args: ['--selftest'] },
    ...offlineNames.map(name => ({ name, file: `${name}.mjs`, requires: name === 'cache-php' ? ['php'] : [] })),
  ],
  helpers: ['lib.mjs', 'face-worker-helper.mjs', 'offline-network-guard.cjs', 'svg-lint.mjs', 'coverage-lint.mjs', 'render-coverage.mjs'],
  runners: ['offline-runner.mjs', 'smoke.sh'],
  liveUtilities: ['capture-fixtures.mjs', 'capture-one.mjs', 'query-equivalence.mjs', 'real-export.mjs', 'time-queries.mjs', 'visual-cities.sh'],
};

function commandExists(command) {
  return spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0;
}
export function runChild(entry, { timeoutMs = 120_000, guardPath = guard, onSpawn } = {}) {
  return new Promise(resolve => {
    for (const dependency of entry.requires || []) {
      if (!commandExists(dependency)) return resolve({ ok: false, reason: `missing dependency: ${dependency}` });
    }
    if (!existsSync(join(testsDir, entry.file))) return resolve({ ok: false, reason: `missing test file: ${entry.file}` });
    const requireGuard = `--require=${JSON.stringify(guardPath)}`;
    const env = { ...process.env, NODE_OPTIONS: [process.env.NODE_OPTIONS, requireGuard].filter(Boolean).join(' ') };
    const useProcessGroup = process.platform !== 'win32';
    const child = spawn(process.execPath, [join(testsDir, entry.file), ...(entry.args || [])], {
      cwd: join(testsDir, '..'), env, stdio: 'inherit', detached: useProcessGroup,
    });
    activeChild = child;
    onSpawn?.(child);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killChildTree(child, 'SIGKILL');
    }, timeoutMs);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (activeChild === child) activeChild = null;
      resolve(code === 0
        ? { ok: true }
        : { ok: false, reason: timedOut ? `timed out after ${timeoutMs}ms` : signal ? `terminated by ${signal}` : `exited ${code}` });
    });
    child.on('error', error => {
      clearTimeout(timer);
      if (activeChild === child) activeChild = null;
      resolve({ ok: false, reason: error.message });
    });
  });
}

async function assertInterruptKillsChild() {
  if (process.platform === 'win32') return;
  const parent = spawn(process.execPath, [runnerFile, '--child-parent-hang'], {
    cwd: join(testsDir, '..'), env: process.env, stdio: ['ignore', 'pipe', 'inherit'],
  });
  const childPid = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('interrupt cleanup probe did not report its child pid')), 2_000);
    parent.stdout.on('data', chunk => {
      const match = String(chunk).match(/ACTIVE_CHILD_PID=(\d+)/);
      if (!match) return;
      clearTimeout(timer);
      resolve(Number(match[1]));
    });
  });
  parent.kill('SIGTERM');
  await new Promise(resolve => parent.once('close', resolve));
  let childAlive = true;
  for (let attempt = 0; attempt < 50 && childAlive; attempt++) {
    try { process.kill(childPid, 0); }
    catch (error) { if (error.code === 'ESRCH') childAlive = false; else throw error; }
    if (childAlive) await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(childAlive, false, 'SIGTERM left the active detached child running');
}

async function selftest() {
  const classified = new Set([
    ...MANIFEST.suites.map(entry => entry.file),
    ...MANIFEST.helpers,
    ...MANIFEST.runners,
    ...MANIFEST.liveUtilities,
  ]);
  const unclassified = readdirSync(testsDir).filter(file => /\.(?:mjs|cjs|sh)$/.test(file) && !classified.has(file));
  assert.deepEqual(unclassified, [], `unclassified test scripts: ${unclassified.join(', ')}`);
  assert.equal((await runChild({ file: 'missing-does-not-exist.mjs' })).ok, false, 'missing file fails');
  const failed = await runChild({ file: 'offline-runner.mjs', args: ['--child-exit'] });
  assert.equal(failed.reason, 'exited 7', 'nonzero child fails through runner');
  const signalled = await runChild({ file: 'offline-runner.mjs', args: ['--child-signal'] });
  assert.equal(signalled.reason, 'exited 143', 'signal fails through runner');
  const timedOut = await runChild({ file: 'offline-runner.mjs', args: ['--child-hang'] }, { timeoutMs: 50 });
  assert.equal(timedOut.reason, 'timed out after 50ms', 'timeout kills and fails through runner');
  await assertInterruptKillsChild();
  assert.equal((await runChild({ file: 'offline-runner.mjs', requires: ['definitely-not-installed-mapexport'] })).reason.startsWith('missing dependency'), true);
  const probes = [
    ['fetch', 'fetch("https://example.invalid").catch(()=>{})'],
    ['http.request', 'try { require("node:http").request("http://example.invalid") } catch {}'],
    ['https.get', 'try { require("node:https").get("https://example.invalid") } catch {}'],
    ['net.connect', 'try { require("node:net").connect(80, "example.invalid") } catch {}'],
    ['Socket.connect', 'try { new (require("node:net").Socket)().connect(80, "example.invalid") } catch {}'],
  ];
  for (const [name, source] of probes) {
    const guarded = spawnSync(process.execPath, ['--require', guard, '-e', source]);
    assert.equal(guarded.status, 97, `network guard rejects external ${name} even when caught`);
  }
  console.log('offline-runner selftest: PASS');
}

if (process.argv.includes('--child-exit')) process.exit(7);
else if (process.argv.includes('--child-signal')) {
  setInterval(() => {}, 1_000);
  setTimeout(() => process.kill(process.pid, 'SIGTERM'), 0);
}
else if (process.argv.includes('--child-hang')) setInterval(() => {}, 1_000);
else if (process.argv.includes('--child-parent-hang')) {
  await runChild({ file: 'offline-runner.mjs', args: ['--child-hang'] }, {
    onSpawn: child => console.log(`ACTIVE_CHILD_PID=${child.pid}`),
  });
}
else if (process.argv.includes('--selftest')) await selftest();
else {
  let failures = 0;
  for (const entry of MANIFEST.suites) {
    console.log(`\n== ${entry.name} (offline) ==`);
    const result = await runChild(entry);
    if (!result.ok) { failures++; console.error(`FAIL ${entry.name}: ${result.reason}`); }
  }
  if (failures) process.exitCode = 1;
  else console.log('\noffline suite: PASS');
}
