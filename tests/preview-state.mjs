// Offline contract checks for separate preview/download state and preview
// supersession. Runs the real browser code in the shared vm harness.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeAppContext, makeExportDomHarness } from './lib.mjs';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const scriptSrc = readFileSync(join(repoRoot, 'script.js'), 'utf8');
const engineSrc = readFileSync(join(repoRoot, 'engine-v2.js'), 'utf8');
const expose = `
;globalThis.__previewContract = {
  EXPORT_ENGINE,
  prime(engine) {
    clearTimeout(previewDebounce);
    bbox = { south: 51.5, west: 5, north: 51.51, east: 5.01 };
    exportInProgress = false;
    previewDebounce = null;
    previewRequestSequence = 0;
    document.getElementById('engine-v2-toggle').checked = engine === EXPORT_ENGINE.V2;
    const results = [{ layer: { id: 'roads', type: 'roads' }, data: { elements: [] } }];
    const settings = getExportSettings(engine, bbox, { widthPx: 1200, physicalWidthMm: 100 });
    exportState = Object.freeze({
      svg: '<svg id="full-export" />',
      filename: engine === EXPORT_ENGINE.V2 ? 'v2.svg' : 'v1.svg',
      engine,
      runId: 7,
      bbox: settings.bbox,
      settings,
      settingsFingerprint: settingsFingerprint(settings),
      results,
    });
    previewState = null;
    document.getElementById('preview-svg-wrap').innerHTML = '<svg id="initial-preview" />';
    updateDownloadControl();
  },
  setV1Builder(builder) { buildSVG = builder; },
  setV2Builder(builder) { EngineV2.buildSVG = builder; },
  scheduleLivePreview,
  beginRequest() { return ++previewRequestSequence; },
  commitRequest(requestId, svg) {
    return commitLivePreview(requestId, exportState, svg, 'test-settings');
  },
  commitExport(svg) {
    return commitSuccessfulExport({
      svg,
      filename: 'new-full.svg',
      engine: getCurrentEngine(),
      results: exportState.results,
      exportBbox: bbox,
      widthPx: 1200,
      physicalWidthMm: 100,
      runId: ++exportRunSequence,
    });
  },
  switchEngine(engine) {
    document.getElementById('engine-v2-toggle').checked = engine === EXPORT_ENGINE.V2;
    scheduleLivePreview();
  },
  snapshot() {
    return {
      exportSvg: exportState?.svg,
      exportFilename: exportState?.filename,
      exportRunId: exportState?.runId,
      previewSvg: previewState?.svg,
      previewEngine: previewState?.engine,
      previewRequestId: previewState?.requestId,
      renderedSvg: document.getElementById('preview-svg-wrap').innerHTML,
      downloadText: document.getElementById('btn-dl').textContent,
      downloadDisabled: document.getElementById('btn-dl').disabled,
    };
  },
};`;

const ctx = makeAppContext(`${scriptSrc}\n;${engineSrc}\n;${expose}`);
const dom = makeExportDomHarness({ selectedLayerIds: ['roads'] });
ctx.document = dom.document;
ctx.localStorage = dom.localStorage;
const X = ctx.__previewContract;

let v1Calls = 0;
let v2Calls = 0;
X.setV1Builder(() => {
  v1Calls++;
  return '<svg id="v1-live-preview" />';
});
X.setV2Builder(() => {
  v2Calls++;
  return '<svg id="v2-live-preview" />';
});

X.prime(X.EXPORT_ENGINE.V1);
X.scheduleLivePreview();
await new Promise(resolve => setTimeout(resolve, 160));
let state = X.snapshot();
assert.equal(v1Calls, 1, 'v1 preview did not use the v1 builder');
assert.equal(v2Calls, 0, 'v1 preview called the v2 builder');
assert.equal(state.previewSvg, '<svg id="v1-live-preview" />');
assert.equal(state.previewEngine, X.EXPORT_ENGINE.V1);
assert.equal(state.exportSvg, '<svg id="full-export" />', 'preview replaced export bytes');
assert.equal(state.exportFilename, 'v1.svg');

X.prime(X.EXPORT_ENGINE.V2);
X.scheduleLivePreview();
await new Promise(resolve => setTimeout(resolve, 160));
state = X.snapshot();
assert.equal(v1Calls, 1, 'v2 preview called the v1 builder');
assert.equal(v2Calls, 1, 'v2 preview did not use the v2 builder');
assert.equal(state.previewSvg, '<svg id="v2-live-preview" />');
assert.equal(state.previewEngine, X.EXPORT_ENGINE.V2);
assert.equal(state.exportSvg, '<svg id="full-export" />', 'v2 preview replaced export bytes');
assert.equal(state.exportFilename, 'v2.svg');

X.prime(X.EXPORT_ENGINE.V1);
const staleRequest = X.beginRequest();
const currentRequest = X.beginRequest();
assert.equal(X.commitRequest(staleRequest, '<svg id="stale" />'), false);
assert.equal(X.snapshot().renderedSvg, '<svg id="initial-preview" />');
assert.equal(X.commitRequest(currentRequest, '<svg id="current" />'), true);
assert.equal(X.snapshot().renderedSvg, '<svg id="current" />');

const preExportRequest = X.beginRequest();
X.commitExport('<svg id="new-full-export" />');
assert.equal(X.commitRequest(preExportRequest, '<svg id="late-preview" />'), false);
state = X.snapshot();
assert.equal(state.exportSvg, '<svg id="new-full-export" />');
assert.equal(state.renderedSvg, '<svg id="new-full-export" />');
assert.equal(state.exportFilename, 'new-full.svg');

X.prime(X.EXPORT_ENGINE.V1);
state = X.snapshot();
assert.equal(state.downloadDisabled, false);
assert.equal(state.downloadText, '↓ Download export');
X.switchEngine(X.EXPORT_ENGINE.V2);
state = X.snapshot();
assert.equal(state.exportSvg, '<svg id="full-export" />');
assert.equal(state.downloadText, '↓ Download last export');

console.log('preview-state: separate export bytes, engine routing and race guards pass');
