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
const layerById = id => X.LAYER_REGISTRY.flatMap(group => group.layers).find(layer => layer.id === id);
const setSelected = (selected) => {
  const chosen = new Set(selected);
  for (const id of ids) dom.getElementById(`lyr-${id}`).checked = chosen.has(id);
  return X.getAllSelectedLayers().map(layer => layer.id);
};
const defaultLayerIds = ids.filter(id => layerById(id).defaultOn);
assert.equal(defaultLayerIds.includes('transit_stops'), false, 'GUI defaults Transit stops off');
assert.equal(
  X.EngineV2.planLayers(defaultLayerIds).fetchLayerIds.includes('transit_stops'),
  false,
  'v2 default export plan does not fetch Transit stops',
);
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
  // AF-07c: Countryside is folded into "Parks & green", so in v2 the Parks &
  // green switch controls landcover, recreation AND sand at the MODEL level —
  // this is the fold that stays true no matter what the landcover checkbox says.
  // In the UI, v2's own file hides the Countryside row entirely (see
  // applyMergedCountrysideVisibility, guarded in tests/landcover-clip.mjs); the
  // frozen v1 panel keeps its separate toggle. Every OTHER checkbox still
  // controls the SVG.
  if (disabled === 'landcover') {
    assert.equal(renderedIds.includes('landcover'), true, 'v2 Countryside follows Parks & green regardless of the (hidden) landcover checkbox');
    assert.equal(renderedIds.includes('beach'), true, 'v2 Sand follows Parks & green, so the landcover checkbox does not hide it');
  } else {
    assert.equal(renderedIds.includes(disabled), false, `v2 omits disabled ${disabled} from the SVG`);
  }
  if (disabled === 'parks') {
    assert.equal(renderedIds.includes('parks_recreation'), false, 'v2 recreation follows Parks & green');
    assert.equal(renderedIds.includes('landcover'), false, 'v2 Countryside follows Parks & green');
    assert.equal(renderedIds.includes('beach'), false, 'v2 Sand follows Parks & green');
  }

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
assert.equal(selectedAreaChildren.includes('landcover'), true, 'v2 Countryside remains with selected Parks & green');
assert.equal(selectedAreaChildren.includes('beach'), true, 'v2 sand remains with selected Parks & green');

// AF-07c P1: the landcover clip must be planned independently of City blocks.
// With City blocks OFF but Parks & green (Countryside) + water ON, the worker
// must still run a clip-only pass, and its covering set must mark only painted
// layers (no blocks). With water AND waterways off there is nothing below
// Countryside to overpaint, so no clip pass is needed.
const noBlocks = setSelected(ids.filter(id => id !== 'city_blocks'));
const noBlocksPlan = X.EngineV2.planLayers(noBlocks);
assert.equal(noBlocksPlan.needsBlocks, false, 'City blocks off');
assert.equal(noBlocksPlan.needsLandcoverClip, true, 'Countryside is clipped even with City blocks off (water paints below it)');
assert.equal(noBlocksPlan.coverPaints.blocks, false, 'covering set excludes blocks when City blocks is off');
assert.equal(noBlocksPlan.coverPaints.water, true, 'covering set includes water when Water bodies is on');

const greenOnly = setSelected(['parks']);
const greenOnlyPlan = X.EngineV2.planLayers(greenOnly);
assert.equal(greenOnlyPlan.needsLandcoverClip, false, 'no clip pass when nothing paints below Countryside (no water/waterways)');

const blocksPlan = X.EngineV2.planLayers(all);
assert.equal(blocksPlan.needsLandcoverClip, false, 'no separate clip pass when City blocks is on (the block worker already clips)');
assert.equal(blocksPlan.coverPaints.blocks, true, 'covering set includes blocks when City blocks is on');

console.log(`layer-selection: ${ids.length} v1/v2 toggles honour fetch and render selection`);
