// Offline regression coverage for the shared export-failure contract, the
// fetch/worker boundaries and the transactional v1/v2 export lifecycle.
// Unexpected exceptions remain ordinary test failures.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeAppContext, makeExportDomHarness } from './lib.mjs';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const scriptSrc = readFileSync(join(repoRoot, 'script.js'), 'utf8');
const engineSrc = readFileSync(join(repoRoot, 'engine-v2.js'), 'utf8');
const expose = `
;globalThis.__exportFailures = {
  EXPORT_STATUS, ExportFailure, isSuccessfulExportStatus,
  fetchLayer, computeBlocksAsync, EngineV2,
  resetEndpointBackoff() { for (const key of Object.keys(endpointBackoff)) delete endpointBackoff[key]; },
};`;
const context = makeAppContext(`${scriptSrc}\n;${engineSrc}\n;${expose}`);
const X = context.__exportFailures;

let unexpected = 0;
let regressions = 0;

function ok(name) {
  console.log(`ok  ${name}`);
}

function unexpectedFailure(name, error) {
  unexpected++;
  console.error(`FAIL ${name}: ${error?.stack || error}`);
}

async function expectStructuredRejection(name, phase, operation) {
  try {
    const result = await Promise.race([
      operation(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timed out after 250ms')), 250)),
    ]);
    regressions++;
    console.error(`REGRESSION ${name}: resolved instead of rejecting (${JSON.stringify(result)})`);
  } catch (error) {
    try {
      assert.ok(error instanceof X.ExportFailure, 'rejection is not an ExportFailure');
      assert.equal(error.status, X.EXPORT_STATUS.FAILED);
      assert.equal(error.phase, phase);
      assert.equal(typeof error.source, 'string');
      assert.ok(error.source.length > 0);
      assert.equal(typeof error.userMessage, 'string');
      assert.ok(error.userMessage.length > 0);
      ok(name);
    } catch (assertionError) {
      unexpectedFailure(name, assertionError);
    }
  }
}

// Pure contract: all three states are stable, only `success` is successful,
// and diagnostic payloads survive without losing identity.
try {
  assert.deepEqual(
    Array.from(Object.values(X.EXPORT_STATUS)),
    ['success', 'partial', 'failed'],
  );
  assert.equal(X.isSuccessfulExportStatus(X.EXPORT_STATUS.SUCCESS), true);
  assert.equal(X.isSuccessfulExportStatus(X.EXPORT_STATUS.PARTIAL), false);
  assert.equal(X.isSuccessfulExportStatus(X.EXPORT_STATUS.FAILED), false);
  const cause = new Error('low-level detail');
  const details = { tile: '51.5,5.0,51.6,5.1' };
  const failure = new X.ExportFailure({
    source: 'roads', phase: 'fetch', userMessage: 'Map data could not be loaded.', cause, details,
  });
  assert.equal(failure.name, 'ExportFailure');
  assert.equal(failure.message, failure.userMessage);
  assert.equal(failure.status, X.EXPORT_STATUS.FAILED);
  assert.equal(failure.cause, cause);
  assert.equal(failure.details, details);
  assert.throws(
    () => new X.ExportFailure({ status: 'unknown', source: 'x', phase: 'fetch', userMessage: 'x' }),
    /Invalid export status/,
  );
  assert.throws(
    () => new X.ExportFailure({ status: X.EXPORT_STATUS.SUCCESS, source: 'x', phase: 'fetch', userMessage: 'x' }),
    /cannot have success status/,
  );
  ok('shared export outcome/failure contract');
} catch (error) {
  unexpectedFailure('shared export outcome/failure contract', error);
}

// Cache misses are local and every Overpass attempt fails immediately. A
// single adaptive tile keeps this deterministic and fast without networking.
context.fetch = async (url) => {
  if (String(url).startsWith('cache.php?')) return { ok: true, json: async () => null };
  throw new Error('simulated complete network outage');
};
const bbox = { south: 51.5, west: 5, north: 51.51, east: 5.01 };
const layer = {
  id: 'offline_probe',
  overpassQuery: (b) => `way["highway"](${b});`,
  tagFilter: () => true,
};
await expectStructuredRejection('fetchLayer rejects complete tile failure', 'fetch', () =>
  X.fetchLayer(layer, '51.5,5,51.51,5.01', bbox, { maxAttempts: 3 }));

// Malformed cache JSON is already a cache miss and must fall through to the
// network.  The structurally invalid envelope case below documents the same
// required behaviour and currently catches cacheGet accepting arbitrary JSON.
let fallbackCalls = 0;
X.resetEndpointBackoff();
context.fetch = async url => {
  if (String(url).startsWith('cache.php?')) return { ok: true, json: async () => { throw new SyntaxError('bad cache JSON'); } };
  fallbackCalls++;
  throw new Error('fallback unavailable');
};
await expectStructuredRejection('invalid cached JSON falls back and fails closed when fallback fails', 'fetch', () =>
  X.fetchLayer(layer, '51.5,5,51.51,5.01', bbox, { maxAttempts: 1 }));
try { assert.ok(fallbackCalls > 0); ok('invalid cached JSON actually attempted fallback'); }
catch (error) { unexpectedFailure('invalid cached JSON actually attempted fallback', error); }

fallbackCalls = 0;
X.resetEndpointBackoff();
context.fetch = async url => {
  if (String(url).startsWith('cache.php?')) return { ok: true, json: async () => ({ elements: 'not-an-array' }) };
  fallbackCalls++;
  throw new Error('fallback unavailable');
};
await expectStructuredRejection('invalid cached elements envelope falls back and fails closed', 'fetch', () =>
  X.fetchLayer(layer, '51.5,5,51.51,5.01', bbox, { maxAttempts: 1 }));
try { assert.ok(fallbackCalls > 0, 'invalid cache envelope was accepted instead of falling back'); ok('invalid cache envelope actually attempted fallback'); }
catch (error) { regressions++; console.error(`REGRESSION invalid cached elements envelope: ${error.message}`); }

// Valid envelopes remain cache hits, including the legal empty Overpass result.
let networkCalls = 0;
context.fetch = async url => {
  if (String(url).startsWith('cache.php?')) return { ok: true, json: async () => ({ elements: [] }) };
  networkCalls++; throw new Error('cache hit must not fetch');
};
const emptyHit = await X.fetchLayer(layer, '51.5,5,51.51,5.01', bbox, { maxAttempts: 1 });
try { assert.equal(Array.isArray(emptyHit.elements), true); assert.equal(emptyHit.elements.length, 0); assert.equal(networkCalls, 0); ok('valid empty cache envelope stays a cache hit'); }
catch (error) { unexpectedFailure('valid empty cache envelope stays a cache hit', error); }

class FailingWorker {
  postMessage() {
    queueMicrotask(() => this.onerror?.(new Error('simulated worker crash')));
  }
  terminate() {}
}
context.Worker = FailingWorker;

const roadElement = {
  type: 'way', id: 1, tags: { highway: 'residential', name: 'Probe Street' },
  geometry: [{ lat: 51.5, lon: 5 }, { lat: 51.51, lon: 5.01 }],
};
// A cached first tile is never a licence to return a partial map when another
// required tile fails. Use a multi-tile box and an accelerated failed fetch.
let cacheReads = 0;
X.resetEndpointBackoff();
context.fetch = async url => {
  if (String(url).startsWith('cache.php?')) {
    cacheReads++;
    return { ok: true, json: async () => cacheReads === 1 ? { elements: [roadElement] } : null };
  }
  throw new Error('second required tile is unavailable');
};
await expectStructuredRejection('cached tile plus failed required tile rejects without subset success', 'fetch', () =>
  X.fetchLayer(layer, '51.5,5,51.7,5.2', { south: 51.5, west: 5, north: 51.7, east: 5.2 }, { maxAttempts: 1 }));
const cutterResults = [{
  layer: { id: 'roads', type: 'roads' },
  data: { elements: [roadElement] },
}];
const projector = (lat, lon) => [(lon - 5) * 10000, (51.51 - lat) * 10000];

await expectStructuredRejection('v1 computeBlocksAsync rejects Worker.onerror', 'worker', () =>
  X.computeBlocksAsync(cutterResults, projector, 1000, 1000, null, { bbox }));

const classified = {
  water: [], green: [], grass: [], landcover: [], waterways: [], labelOnly: [],
};
await expectStructuredRejection('v2 computeFacesAsync rejects Worker.onerror', 'worker', () =>
  X.EngineV2.computeFacesAsync(cutterResults, [], classified, projector, 1000, 1000, null, {
    bbox, placeNodeElements: [],
  }));

class ConstructorThrowWorker { constructor() { throw new Error('worker constructor throw'); } }
context.Worker = ConstructorThrowWorker;
await expectStructuredRejection('v1 computeBlocksAsync rejects Worker constructor throw', 'worker', () =>
  X.computeBlocksAsync(cutterResults, projector, 1000, 1000, null, { bbox }));
await expectStructuredRejection('v2 computeFacesAsync rejects Worker constructor throw', 'worker', () =>
  X.EngineV2.computeFacesAsync(cutterResults, [], classified, projector, 1000, 1000, null, { bbox, placeNodeElements: [] }));

class PostMessageThrowWorker { postMessage() { throw new Error('worker postMessage throw'); } terminate() {} }
context.Worker = PostMessageThrowWorker;
await expectStructuredRejection('v1 computeBlocksAsync rejects Worker postMessage throw', 'worker', () =>
  X.computeBlocksAsync(cutterResults, projector, 1000, 1000, null, { bbox }));
await expectStructuredRejection('v2 computeFacesAsync rejects Worker postMessage throw', 'worker', () =>
  X.EngineV2.computeFacesAsync(cutterResults, [], classified, projector, 1000, 1000, null, { bbox, placeNodeElements: [] }));

const lifecycleExpose = `
;globalThis.__exportLifecycle = {
  EXPORT_STATUS, ExportFailure, doExport, EngineV2,
  prime(nextBbox = null) {
    bbox = nextBbox || { south: 51.5, west: 5, north: 51.51, east: 5.01 };
    currentAreaName = 'Testville';
    areaNameLookup = null;
    const settings = getExportSettings(EXPORT_ENGINE.V1, bbox, { widthPx: 1000, physicalWidthMm: 100 });
    exportState = Object.freeze({
      results: [{ previous: true }],
      svg: '<svg id="previous-output" />',
      filename: 'previous.svg',
      engine: EXPORT_ENGINE.V1,
      runId: 1,
      bbox: settings.bbox,
      settings,
      settingsFingerprint: settingsFingerprint(settings),
    });
    exportInProgress = false;
    previewDebounce = setTimeout(() => {
      document.getElementById('preview-svg-wrap').innerHTML = 'stale preview fired';
    }, 5);
  },
  snapshot() {
    return {
      results: JSON.stringify(exportState.results), svg: exportState.svg,
      filename: exportState.filename, runId: exportState.runId, exportInProgress,
      previewPending: previewDebounce !== null,
    };
  },
};`;

function makeLifecycleScenario({ engineV2, networkFails, selectedLayerIds, multiTilePartial = false }) {
  const dom = makeExportDomHarness({ selectedLayerIds });
  // The engine is a URL setting, not a control: ?engine=1 forces v1.
  const ctx = makeAppContext(`${scriptSrc}\n;${engineSrc}\n;${lifecycleExpose}`, {
    location: { search: engineV2 ? '?engine=2' : '?engine=1' },
  });
  ctx.document = dom.document;
  ctx.localStorage = dom.localStorage;

  const activeIntervals = new Set();
  ctx.setInterval = (fn, ms) => {
    const id = setInterval(fn, ms);
    activeIntervals.add(id);
    return id;
  };
  ctx.clearInterval = id => {
    activeIntervals.delete(id);
    clearInterval(id);
  };

  const mockElements = [{
    type: 'way', id: 42,
    tags: { highway: 'residential', name: 'Lifecycle Road' },
    geometry: [{ lat: 51.5, lon: 5 }, { lat: 51.51, lon: 5.01 }],
  }];
  let cachedTileReads = 0;
  let overpassCalls = 0;
  ctx.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.startsWith('cache.php?exists=')) {
      const keys = target.slice('cache.php?exists='.length).split(',').map(decodeURIComponent);
      const hits = multiTilePartial
        ? Object.fromEntries(keys.slice(0, keys.length / 2).map(key => [key, true]))
        : {};
      return { ok: true, status: 200, json: async () => hits };
    }
    if (target.startsWith('cache.php?')) {
      if (multiTilePartial && options.method !== 'POST') cachedTileReads++;
      return {
        ok: true, status: 200,
        json: async () => options.method === 'POST'
          ? {}
          : multiTilePartial && cachedTileReads <= 5 ? { elements: mockElements } : null,
      };
    }
    // A malformed client request is intentionally non-retryable. This keeps
    // the lifecycle failure test fast while normal transient outages exercise
    // the longer retry window in overpass-fetch.mjs.
    overpassCalls++;
    if (networkFails) return { ok: false, status: 400, headers: new Headers(), json: async () => ({}) };
    return {
      ok: true, status: 200, body: null,
      headers: new Headers(),
      json: async () => ({ elements: mockElements }),
    };
  };
  if (!networkFails) ctx.Worker = FailingWorker;
  ctx.__exportLifecycle.prime(multiTilePartial
    ? { south: 51.5, west: 5, north: 51.6, east: 5.2 }
    : null);
  return { ctx, dom, activeIntervals, cachedTileReads: () => cachedTileReads, overpassCalls: () => overpassCalls };
}

async function expectLifecycleFailure(name, options, expectedPhase) {
  try {
    const scenario = makeLifecycleScenario(options);
    const { ctx, dom, activeIntervals } = scenario;
    const before = ctx.__exportLifecycle.snapshot();
    const previewBefore = dom.getElementById('preview-svg-wrap').innerHTML;
    const previewClassesBefore = dom.getElementById('preview-pane').classList.snapshot();
    const outcome = options.engineV2
      ? await ctx.__exportLifecycle.EngineV2.doExport()
      : await ctx.__exportLifecycle.doExport();
    await new Promise(resolve => setTimeout(resolve, 20));
    const after = ctx.__exportLifecycle.snapshot();

    assert.equal(outcome.status, X.EXPORT_STATUS.FAILED);
    assert.ok(outcome.error instanceof ctx.__exportLifecycle.ExportFailure);
    assert.equal(outcome.error.phase, expectedPhase);
    assert.equal(dom.getElementById('status-bar').className, 'error');
    assert.match(dom.getElementById('status-text').textContent, /previous export is still available to download/i);
    assert.equal(dom.getElementById('btn-export').disabled, false);
    assert.equal(dom.getElementById('progress-overlay').classList.contains('show'), false);
    assert.equal(activeIntervals.size, 0, 'elapsed-time interval still running');
    assert.equal(after.results, before.results);
    assert.equal(after.svg, before.svg);
    assert.equal(after.filename, before.filename);
    assert.equal(after.runId, before.runId);
    assert.equal(after.exportInProgress, false);
    assert.equal(after.previewPending, false);
    assert.equal(dom.getElementById('preview-svg-wrap').innerHTML, previewBefore);
    assert.deepEqual(dom.getElementById('preview-pane').classList.snapshot(), previewClassesBefore);
    assert.equal(dom.historyWrites.length, 0);
    if (options.multiTilePartial) {
      assert.equal(scenario.cachedTileReads(), 5, 'the complete successful tile was not read from cache');
      assert.equal(scenario.overpassCalls(), 1, 'the missing required tile was not exercised');
    }
    ok(name);
  } catch (error) {
    unexpectedFailure(name, error);
  }
}

await expectLifecycleFailure('v1 doExport keeps prior output on network failure', {
  engineV2: false, networkFails: true, selectedLayerIds: ['roads'],
}, 'fetch');
await expectLifecycleFailure('v1 grid export rejects a cached tile plus a failed required tile', {
  engineV2: false, networkFails: true, selectedLayerIds: ['roads'], multiTilePartial: true,
}, 'fetch');
await expectLifecycleFailure('v2 doExport keeps prior output on network failure', {
  engineV2: true, networkFails: true,
}, 'fetch');
await expectLifecycleFailure('v1 doExport cleans up after Worker.onerror', {
  engineV2: false, networkFails: false, selectedLayerIds: ['city_blocks', 'roads'],
}, 'worker');
await expectLifecycleFailure('v2 doExport cleans up after Worker.onerror', {
  engineV2: true, networkFails: false,
}, 'worker');

if (unexpected) {
  console.error(`\nexport-failures: ${unexpected} unexpected failure(s), ${regressions} known regression(s)`);
  process.exit(2);
}
if (regressions) {
  console.error(`\nexport-failures: ${regressions} known fail-open regression(s)`);
  process.exit(1);
}
console.log('\nexport-failures: all failure paths are fail-closed');
