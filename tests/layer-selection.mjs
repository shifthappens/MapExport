// Offline contract for the layer-panel selection shared by v1 and v2.
// Every checkbox must control the SVG; v2 may fetch private block inputs only
// when City blocks is selected. In particular, disabled transit never fetches.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeAppContext, makeExportDomHarness } from './lib.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const scriptSrc = readFileSync(join(root, 'script.js'), 'utf8');
const engineSrc = readFileSync(join(root, 'engine-v2.js'), 'utf8');
const expose = '\n;globalThis.__layers={LAYER_REGISTRY,getAllSelectedLayers,EngineV2};';
const ctx = makeAppContext(`${scriptSrc}\n;${engineSrc}${expose}`);
const dom = makeExportDomHarness();
ctx.document = dom.document;
const X = ctx.__layers;

const ids = X.LAYER_REGISTRY.flatMap(group => group.layers.map(layer => layer.id));
const setSelected = (selected) => {
  const chosen = new Set(selected);
  for (const id of ids) dom.getElementById(`lyr-${id}`).checked = chosen.has(id);
  return X.getAllSelectedLayers().map(layer => layer.id);
};
const all = setSelected(ids);
assert.deepEqual(all, ids, 'v1 reads every checked layer-panel box');

const allPlan = X.EngineV2.planLayers(all);
assert.deepEqual([...allPlan.fetchLayerIds], [
  'roads', 'rail', 'tram', 'metro', 'transit_stops', 'water_labels', 'street_labels',
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

for (const disabled of ids) {
  const selected = setSelected(ids.filter(id => id !== disabled));
  assert.equal(selected.includes(disabled), false, `v1 omits disabled ${disabled}`);

  const plan = X.EngineV2.planLayers(selected);
  assert.equal(plan.selectedIds.has(disabled), false, `v2 records disabled ${disabled}`);
  const renderedIds = X.EngineV2.filterResultsForSelection(sampleResults, selected).map(result => result.layer.id);
  assert.equal(renderedIds.includes(disabled), false, `v2 omits disabled ${disabled} from the SVG`);
  if (disabled === 'parks') assert.equal(renderedIds.includes('parks_recreation'), false, 'v2 recreation follows Parks & green');
  if (disabled === 'landcover') assert.equal(renderedIds.includes('beach'), false, 'v2 sand follows Countryside');

  if (['rail', 'tram', 'metro', 'transit_stops', 'water_labels', 'street_labels'].includes(disabled)) {
    assert.equal(plan.fetchLayerIds.includes(disabled), false, `v2 does not fetch disabled ${disabled}`);
  }
  if (disabled === 'city_blocks') {
    assert.equal(renderedIds.includes('fallback_blocks'), false, 'v2 omits fallback coverage blocks with City blocks');
    assert.equal(plan.fetchLayerIds.includes('block_buildings'), false, 'v2 skips buildings without City blocks');
    assert.equal(plan.fetchLayerIds.includes('place_nodes'), true, 'v2 keeps place names behind their enabled labels switch');
  }
}

// Roads remain a private cutter input for selected City blocks, but never
// reappear in the SVG when their own checkbox is off.
const blocksWithoutRoads = setSelected(ids.filter(id => id !== 'roads'));
const blockPlan = X.EngineV2.planLayers(blocksWithoutRoads);
assert.equal(blockPlan.fetchLayerIds.includes('roads'), true, 'City blocks retain their required private road input');
assert.equal(
  X.EngineV2.filterResultsForSelection(sampleResults, blocksWithoutRoads).some(result => result.layer.id === 'roads'),
  false,
  'private cutter roads never render when Roads & streets is off',
);

const selectedAreaChildren = X.EngineV2.filterResultsForSelection(sampleResults, all).map(result => result.layer.id);
assert.equal(selectedAreaChildren.includes('parks_recreation'), true, 'v2 recreation remains with selected Parks & green');
assert.equal(selectedAreaChildren.includes('beach'), true, 'v2 sand remains with selected Countryside');

console.log(`layer-selection: ${ids.length} v1/v2 toggles honour fetch and render selection`);
