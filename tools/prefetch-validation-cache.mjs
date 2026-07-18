#!/usr/bin/env node
// Fill cache.php for every engine-v2 validation city without running an export.
//
// The app sources remain authoritative: this program evaluates script.js and
// engine-v2.js to obtain the current layer objects, queries, filters, cache-key
// functions, building padding and endpoint list. The city list is read from
// tests/real-export.mjs. Raw Overpass envelopes are cached; tag filters are
// used only for the progress counts, just as fetchLayer filters after reading.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CACHE_BASE = 'http://localhost:8080/mapexport/';
const ATTEMPT_TIMEOUT_MS = 30_000;
const CACHE_TIMEOUT_MS = 30_000;
const COOLDOWN_MS = 10_000;
const MAX_RUNTIME_MS = 60 * 60_000;
const OVERPASS_UA = 'MapExport validation-cache prefetch/1.0 (+https://coen.at; hello@coen.at)';

const HELP = `Usage: node tools/prefetch-validation-cache.mjs [options]

Sequentially fills cache.php for all engine-v2 fetchable layers and all named
validation cities from tests/real-export.mjs. Missing keys are retried in
round-robin order for at most 60 minutes. Each Overpass attempt has a 30-second
client/server timeout and is followed by a 10-second cooldown.

Options:
  --dry-run              Probe the local cache and print the computed plan/gaps;
                         never contact Overpass or write cache entries
  --cache-base=<url>     App base containing cache.php
                         (default: ${DEFAULT_CACHE_BASE})
  --help, -h             Show this help
`;

function parseArgs(argv) {
  const options = { dryRun: false, cacheBase: DEFAULT_CACHE_BASE };
  for (const arg of argv) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg.startsWith('--cache-base=')) options.cacheBase = arg.slice('--cache-base='.length);
    else throw new Error(`Unknown option: ${arg}`);
  }
  let base;
  try { base = new URL(options.cacheBase); }
  catch { throw new Error(`Invalid --cache-base URL: ${options.cacheBase}`); }
  if (!['http:', 'https:'].includes(base.protocol)) throw new Error('--cache-base must use http or https');
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  options.cacheBase = base.href;
  return options;
}

function findClosingBrace(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (c === '/' && source[i + 1] === '/') {
      i = source.indexOf('\n', i + 2);
      if (i < 0) return source.length;
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      i = source.indexOf('*/', i + 2);
      if (i < 0) return source.length;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      for (i++; i < source.length; i++) {
        if (source[i] === '\\') { i++; continue; }
        if (source[i] === quote) break;
      }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  throw new Error('Could not find the end of CITIES in tests/real-export.mjs');
}

function loadCities() {
  const source = fs.readFileSync(path.join(REPO, 'tests/real-export.mjs'), 'utf8');
  const marker = source.indexOf('const CITIES =');
  if (marker < 0) throw new Error('Could not find CITIES in tests/real-export.mjs');
  const open = source.indexOf('{', marker);
  const close = findClosingBrace(source, open);
  const cities = vm.runInNewContext(`(${source.slice(open, close + 1)})`);
  if (!cities || Object.keys(cities).length !== 7) {
    throw new Error(`Expected the 7 validation cities, found ${Object.keys(cities || {}).length}`);
  }
  return cities;
}

function loadAppContract() {
  const scriptSource = fs.readFileSync(path.join(REPO, 'script.js'), 'utf8');
  const engineSource = fs.readFileSync(path.join(REPO, 'engine-v2.js'), 'utf8');
  const expose = `\n;globalThis.__prefetchContract = {
    layers: EngineV2.layers,
    buildingsLayer: EngineV2.buildingsLayer,
    padBboxMeters: EngineV2.padBboxMeters,
    buildingFetchPadM: EngineV2.BUILDING_FETCH_PAD_M,
    bboxToTiles, tileCacheKey, endpoints: OVERPASS_ENDPOINTS,
  };`;
  const el = new Proxy(function () {}, {
    get(_target, prop) {
      if (prop === 'checked') return false;
      if (prop === 'querySelectorAll') return () => [];
      if (['style', 'classList', 'dataset'].includes(prop)) return el;
      if (typeof prop === 'symbol') return undefined;
      return el;
    },
    set() { return true; },
    apply() { return el; },
  });
  const sandbox = {
    console,
    fetch: () => { throw new Error('Unexpected fetch while loading app sources'); },
    setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, performance,
    Blob, Response, Request, Headers, URL, AbortController, AbortSignal,
    CompressionStream: globalThis.CompressionStream, TextEncoder, TextDecoder,
    document: {
      getElementById: () => el, querySelector: () => el, querySelectorAll: () => [],
      createElement: () => el, createElementNS: () => el, addEventListener() {},
      body: el, documentElement: el,
    },
    navigator: { userAgent: 'node', clipboard: {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`${scriptSource}\n;\n${engineSource}${expose}`, sandbox, {
    filename: 'script.js + engine-v2.js',
  });
  const contract = sandbox.__prefetchContract;
  const fetchable = contract.layers.filter(layer => typeof layer.overpassQuery === 'function');
  if (fetchable.length !== 9) {
    throw new Error(`Expected 9 engine-v2 fetchable layers, found ${fetchable.length}`);
  }
  if (contract.endpoints.length !== 3) {
    throw new Error(`Expected the app's 3 Overpass endpoints, found ${contract.endpoints.length}`);
  }
  return { ...contract, fetchable };
}

function makePlan(cities, contract) {
  const plan = [];
  for (const [city, bboxText] of Object.entries(cities)) {
    const [south, west, north, east] = bboxText.split(',').map(Number);
    const bbox = { south, west, north, east };
    for (const layer of contract.fetchable) {
      const fetchBbox = layer.id === contract.buildingsLayer.id
        ? contract.padBboxMeters(bbox, contract.buildingFetchPadM)
        : bbox;
      for (const tile of contract.bboxToTiles(fetchBbox)) {
        const bboxString = `${tile.s},${tile.w},${tile.n},${tile.e}`;
        const statement = layer.overpassQuery(bboxString).replaceAll(`(${bboxString})`, '');
        const query = `[out:json][bbox:${bboxString}][timeout:30];(${statement});out ${layer.overpassOut || 'body geom'} qt;`;
        plan.push({
          city, layer, tile, bboxString, query,
          key: contract.tileCacheKey(layer, tile),
          attempts: 0,
        });
      }
    }
  }
  return plan;
}

function validEnvelope(value) {
  return !!value && typeof value === 'object' && Array.isArray(value.elements);
}

function signalFor(controller, timeoutMs) {
  return AbortSignal.any([controller.signal, AbortSignal.timeout(Math.max(1, timeoutMs))]);
}

async function readCache(task, options, controller, remainingMs) {
  const url = new URL(`cache.php?key=${encodeURIComponent(task.key)}`, options.cacheBase);
  let response;
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': OVERPASS_UA },
      signal: signalFor(controller, Math.min(CACHE_TIMEOUT_MS, remainingMs)),
    });
  } catch (error) {
    throw new Error(`cache.php is unreachable at ${url.origin}${url.pathname}: ${error.message}`);
  }
  if (!response.ok) throw new Error(`cache.php GET failed with HTTP ${response.status}`);
  let data;
  try { data = await response.json(); }
  catch (error) { throw new Error(`cache.php returned invalid JSON: ${error.message}`); }
  const hit = response.headers.get('x-cache') === 'HIT';
  if (!hit || data === null) return { hit: false, data: null };
  if (!validEnvelope(data)) {
    console.warn(`WARN cache HIT has no elements array; refetching ${task.key}`);
    return { hit: false, data: null };
  }
  return { hit: true, data };
}

async function writeCache(task, data, options, controller, remainingMs) {
  const url = new URL(`cache.php?key=${encodeURIComponent(task.key)}`, options.cacheBase);
  const body = gzipSync(Buffer.from(JSON.stringify(data)));
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Encoding': 'gzip',
      'User-Agent': OVERPASS_UA,
    },
    body,
    signal: signalFor(controller, Math.min(CACHE_TIMEOUT_MS, remainingMs)),
  });
  if (response.status !== 204) throw new Error(`cache.php POST failed with HTTP ${response.status}`);
}

async function fetchOverpass(task, endpoint, controller, remainingMs) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'User-Agent': OVERPASS_UA,
    },
    body: `data=${encodeURIComponent(task.query)}`,
    signal: signalFor(controller, Math.min(ATTEMPT_TIMEOUT_MS, remainingMs)),
  });
  if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
  let data;
  try { data = await response.json(); }
  catch (error) { throw new Error(`invalid JSON: ${error.message}`); }
  if (!validEnvelope(data)) throw new Error('response has no elements array');
  return data;
}

function retainedCount(task, data) {
  return task.layer.tagFilter ? data.elements.filter(task.layer.tagFilter).length : data.elements.length;
}

async function waitCooldown(controller, deadlineAt) {
  const ms = Math.min(COOLDOWN_MS, Math.max(0, deadlineAt - performance.now()));
  if (ms <= 0 || controller.signal.aborted) return;
  await new Promise(resolve => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', done);
      resolve();
    }
    controller.signal.addEventListener('abort', done, { once: true });
  });
}

function elapsed(startedAt) {
  const seconds = Math.round((performance.now() - startedAt) / 1000);
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

async function main() {
  let options;
  try { options = parseArgs(process.argv.slice(2)); }
  catch (error) { console.error(`ERROR ${error.message}\n\n${HELP}`); process.exitCode = 2; return; }
  if (options.help) { console.log(HELP); return; }

  const startedAt = performance.now();
  const deadlineAt = startedAt + MAX_RUNTIME_MS;
  const controller = new AbortController();
  let interrupted = false;
  const stop = () => {
    interrupted = true;
    controller.abort();
    console.error('\nStopping safely after the current operation…');
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  try {
    const cities = loadCities();
    const contract = loadAppContract();
    const plan = makePlan(cities, contract);
    console.log(`Plan: ${Object.keys(cities).length} cities × ${contract.fetchable.length} v2 layers = ${plan.length} cache keys`);
    console.log(`Cache: ${options.cacheBase}`);
    console.log(`Endpoints: ${contract.endpoints.map(value => new URL(value).hostname).join(' → ')}`);

    const missing = [];
    let initialHits = 0;
    for (let i = 0; i < plan.length; i++) {
      if (controller.signal.aborted) break;
      const task = plan[i];
      const cached = await readCache(task, options, controller, deadlineAt - performance.now());
      const status = cached.hit ? 'HIT ' : 'MISS';
      console.log(`[${String(i + 1).padStart(2)}/${plan.length}] ${status} ${task.city}/${task.layer.id}  ${task.key}`);
      if (cached.hit) initialHits++;
      else missing.push(task);
    }
    if (controller.signal.aborted) throw new Error(interrupted ? 'interrupted' : 'deadline reached');

    console.log(`Cache probe: ${initialHits} hits, ${missing.length} gaps`);
    if (options.dryRun) {
      console.log(`DRY RUN complete — ${missing.length} gap${missing.length === 1 ? '' : 's'}; no Overpass requests or cache writes`);
      return;
    }
    if (!missing.length) {
      console.log(`COMPLETE — all ${plan.length} keys were already cached (${elapsed(startedAt)})`);
      return;
    }

    const queue = [...missing];
    let endpointCursor = 0;
    let liveAttempts = 0;
    let fetched = 0;
    let lateHits = 0;
    let failures = 0;
    while (queue.length && !controller.signal.aborted && performance.now() < deadlineAt) {
      const task = queue.shift();
      // Another run may have populated this key since the initial probe.
      const cached = await readCache(task, options, controller, deadlineAt - performance.now());
      if (cached.hit) {
        lateHits++;
        console.log(`HIT  ${task.city}/${task.layer.id} appeared while waiting (${queue.length} gaps remain)`);
        continue;
      }

      const endpoint = contract.endpoints[endpointCursor++ % contract.endpoints.length];
      const host = new URL(endpoint).hostname;
      task.attempts++;
      liveAttempts++;
      let succeeded = false;
      try {
        console.log(`TRY  ${task.city}/${task.layer.id} attempt ${task.attempts} via ${host}`);
        const data = await fetchOverpass(task, endpoint, controller, deadlineAt - performance.now());
        await writeCache(task, data, options, controller, deadlineAt - performance.now());
        const confirmed = await readCache(task, options, controller, deadlineAt - performance.now());
        if (!confirmed.hit) throw new Error('cache write was not visible as a HIT');
        fetched++;
        succeeded = true;
        console.log(`OK   ${task.city}/${task.layer.id}: ${data.elements.length} raw, ${retainedCount(task, data)} after filter (${queue.length} gaps remain)`);
      } catch (error) {
        failures++;
        console.warn(`FAIL ${task.city}/${task.layer.id} via ${host}: ${error.message}`);
        // Keep the in-flight key in the remainder count on SIGINT/deadline;
        // only ordinary attempt failures rotate it to the tail.
        if (controller.signal.aborted) queue.unshift(task);
        else queue.push(task);
      }

      // A fixed cooldown follows every live attempt, successful or not.
      await waitCooldown(controller, deadlineAt);
      if (!succeeded && queue.length) console.log(`     rotated failed key to queue tail (${queue.length} gaps pending)`);
    }

    const done = plan.length - queue.length;
    console.log(`Summary: ${done}/${plan.length} cached; ${initialHits} initial hits, ${lateHits} late hits, ${fetched} fetched, ${failures} failed attempts, ${liveAttempts} live attempts; ${elapsed(startedAt)}`);
    if (queue.length) {
      console.error(`${interrupted ? 'INTERRUPTED' : 'DEADLINE'} — ${queue.length} keys remain missing`);
      for (const task of queue) console.error(`  - ${task.city}/${task.layer.id}  ${task.key}`);
      process.exitCode = interrupted ? 130 : 1;
    } else {
      console.log('COMPLETE — every validation-city v2 cache key is confirmed present');
    }
  } catch (error) {
    console.error(`ERROR ${error.message}`);
    process.exitCode = interrupted ? 130 : 1;
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}

await main();
