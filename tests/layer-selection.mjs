// Offline contract for the layer-panel selection shared by v1 and v2.
// Required map layers are always selected and have no checkbox. Optional
// transit, path and label layers remain true GUI toggles; v2 may fetch private
// block inputs only when City blocks is selected.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeAppContext, makeExportDomHarness } from './lib.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const scriptSrc = readFileSync(join(root, 'script.js'), 'utf8');
const engineSrc = readFileSync(join(root, 'engine-v2.js'), 'utf8');
const expose = '\n;globalThis.__layers={LAYER_REGISTRY,getAllSelectedLayers,renderLayers,EngineV2};';
const ctx = makeAppContext(`${scriptSrc}\n;${engineSrc}${expose}`);
const dom = makeExportDomHarness();
ctx.document = dom.document;
const X = ctx.__layers;

const ids = X.LAYER_REGISTRY.flatMap(group => group.layers.map(layer => layer.id));
const layerById = id => X.LAYER_REGISTRY.flatMap(group => group.layers).find(layer => layer.id === id);
const requiredIds = ids.filter(id => layerById(id).required);
const optionalIds = ids.filter(id => !layerById(id).required);

// Exercise the actual panel renderer as well as the selection helpers. Required
// rows are deliberately rendered as plain text; optional rows retain a real
// checkbox so the GUI cannot drift away from the selection contract silently.
const renderedNodes = [];
const layerList = {
  innerHTML: '',
  appendChild(node) { renderedNodes.push(node); },
};
const panelDocument = {
  getElementById(id) {
    if (id === 'layers-list') return layerList;
    return dom.getElementById(id);
  },
  createElement() {
    return {
      className: '',
      textContent: '',
      innerHTML: '',
      appendChild() {},
      querySelector(selector) {
        return selector === 'input' ? { addEventListener() {} } : null;
      },
    };
  },
};
ctx.document = panelDocument;
X.renderLayers();
const renderedRows = renderedNodes.filter(node => node.className === 'layer-row');
for (const required of requiredIds.map(layerById)) {
  const row = renderedRows.find(node => node.innerHTML.includes(required.label));
  assert(row, `required ${required.id} is rendered in the layer panel`);
  assert(!row.innerHTML.includes('<input'), `required ${required.id} has no GUI checkbox`);
}
const pathsRow = renderedRows.find(node => node.innerHTML.includes('id="lyr-paths"'));
assert(pathsRow, 'optional Paths & trails keeps its GUI checkbox');

const setSelected = (selected) => {
  const chosen = new Set(selected);
  for (const id of optionalIds) dom.getElementById(`lyr-${id}`).checked = chosen.has(id);
  return X.getAllSelectedLayers().map(layer => layer.id);
};
const defaultLayerIds = ids.filter(id => layerById(id).defaultOn);
assert.equal(defaultLayerIds.includes('transit_stops'), false, 'GUI defaults Transit stops off');
assert.equal(defaultLayerIds.includes('paths'), false, 'GUI defaults Paths & trails off');
assert(requiredIds.length > 0 && requiredIds.every(id => defaultLayerIds.includes(id)), 'required layers are always in the default selection');
assert.equal(
  X.EngineV2.planLayers(defaultLayerIds).fetchLayerIds.includes('transit_stops'),
  false,
  'v2 default export plan does not fetch Transit stops',
);
const all = setSelected(ids);
assert.deepEqual(all, ids, 'v1 reads every checked layer-panel box');

const allPlan = X.EngineV2.planLayers(all);
assert.deepEqual([...allPlan.fetchLayerIds], [
  'roads', 'paths', 'rail', 'tram', 'metro', 'transit_stops', 'water_labels', 'street_labels',
  'block_buildings', 'place_nodes', 'area_features',
], 'v2 fetches selected visible layers plus only City blocks dependencies');

const sampleResults = [
  ...ids.map(id => ({ layer: { id }, data: {} })),
  { layer: { id: 'fallback_blocks' }, data: {} },
  { layer: { id: 'place_nodes' }, data: {} },
  { layer: { id: 'buildings' }, data: {} },
  { layer: { id: 'area_features' }, data: {} },
  { layer: { id: 'parks_recreation' }, data: {} },
  { layer: { id: 'beach' }, data: {} },
];

for (const disabled of optionalIds) {
  const selected = setSelected(ids.filter(id => id !== disabled));
  assert.equal(selected.includes(disabled), false, `v1 omits disabled ${disabled}`);

  const plan = X.EngineV2.planLayers(selected);
  assert.equal(plan.selectedIds.has(disabled), false, `v2 records disabled ${disabled}`);
  const renderedIds = X.EngineV2.filterResultsForSelection(sampleResults, selected).map(result => result.layer.id);
  assert.equal(renderedIds.includes(disabled), false, `v2 omits disabled ${disabled} from the SVG`);

  if (['paths', 'rail', 'tram', 'metro', 'transit_stops', 'water_labels', 'street_labels'].includes(disabled)) {
    assert.equal(plan.fetchLayerIds.includes(disabled), false, `v2 does not fetch disabled ${disabled}`);
  }
}

// Required layers have no checkbox, so clearing every optional control still
// leaves the base map and building blocks selected.
const requiredOnly = setSelected([]);
assert.deepEqual(requiredOnly, requiredIds, 'required layers remain selected without GUI checkboxes');
assert(requiredOnly.includes('city_blocks') && requiredOnly.includes('roads'), 'City blocks and Roads & streets remain mandatory');

const selectedAreaChildren = X.EngineV2.filterResultsForSelection(sampleResults, all).map(result => result.layer.id);
assert.equal(selectedAreaChildren.includes('parks_recreation'), true, 'v2 recreation remains with selected Parks & green');
assert.equal(selectedAreaChildren.includes('landcover'), true, 'v2 Countryside remains with selected Parks & green');
assert.equal(selectedAreaChildren.includes('beach'), true, 'v2 sand remains with selected Parks & green');

const blocksPlan = X.EngineV2.planLayers(all);
assert.equal(blocksPlan.needsLandcoverClip, false, 'no separate clip pass when City blocks is on (the block worker already clips)');
assert.equal(blocksPlan.coverPaints.blocks, true, 'covering set includes blocks when City blocks is on');

console.log(`layer-selection: ${ids.length} v1/v2 toggles honour fetch and render selection`);
