#!/usr/bin/env node
// Keep the world-wide reference map intentionally limited to export-relevant
// cartography. This is a static test: external vector data is not fetched.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const style = JSON.parse(readFileSync(new URL('../useit-map-style.json', import.meta.url), 'utf8'));
const sourceLayers = style.layers.map(layer => layer['source-layer']).filter(Boolean);
const ids = new Set(style.layers.map(layer => layer.id));

assert.equal(style.version, 8, 'MapLibre style version');
assert.equal(style.sources.openmaptiles.url, 'https://tiles.openfreemap.org/planet');
assert.equal(style.layers.find(layer => layer.id === 'water').paint['fill-color'], '#A4DBF3');
assert.equal(style.layers.find(layer => layer.id === 'parks').paint['fill-color'], '#51A886');
assert.equal(style.layers.find(layer => layer.id === 'building-blocks').paint['fill-color'], '#FEF6ED');
assert.ok(sourceLayers.includes('building'), 'close-scale building preview is present');
assert.equal(style.layers.find(layer => layer.id === 'transit-stops').layout.visibility, 'none', 'transit POIs start off');
assert.ok(!style.layers.some(layer => layer.id === 'poi'), 'no generic POI layer is rendered');
assert.equal(style.layers.find(layer => layer.id === 'roads-casing-paths').layout.visibility, 'none', 'paths start off like the export');

console.log('interactive-style: export palette and reduced category set pass');
