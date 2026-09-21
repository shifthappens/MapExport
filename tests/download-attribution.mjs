// The download acknowledgement and visible OSM credit are a legal-use guard,
// so keep their exact promise and both SVG profiles under offline regression.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeAppContext } from './lib.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const script = readFileSync(join(root, 'script.js'), 'utf8');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const engineV2 = readFileSync(join(root, 'engine-v2.js'), 'utf8');

assert.match(html, /Please type "I promise!" in the box below/, 'the acknowledgement instruction is present');
assert.match(script, /input\.value !== 'I promise!'/, 'only the exact promise accepts a download');
assert.match(script, /await promptForAttributionAgreement\(\)/, 'the download button waits for acknowledgement');
assert.match(engineV2, /wrapSVGIllustrator\(layersSVG, ctx, physicalWidthMm\)/, 'v2 uses the shared Illustrator wrapper');
assert.match(engineV2, /wrapSVG\(layersSVG, ctx, physicalWidthMm\)/, 'v2 uses the shared standard wrapper');

const context = makeAppContext(`${script}\n;globalThis.__attributionTest={wrapSVG,wrapSVGIllustrator,PRESETS};`);
const ctx = {
  b: { south: 52, west: 5, north: 52.1, east: 5.1 },
  W: 1200,
  H: 800,
  preset: context.__attributionTest.PRESETS.useit,
  pathPaintDefs: [],
  illustratorDefs: [],
};
for (const svg of [
  context.__attributionTest.wrapSVG('', ctx, 100),
  context.__attributionTest.wrapSVGIllustrator('', ctx, 100),
]) {
  assert.match(svg, /id="osm-attribution-background"[^>]*fill="#fff"/, 'each SVG profile puts the credit on white for legibility');
  assert.match(svg, /<a id="osm-attribution"/, 'each SVG profile names the attribution link');
  assert.match(svg, /© OpenStreetMap contributors/, 'each SVG profile credits OSM contributors');
  assert.match(svg, /https:\/\/www\.openstreetmap\.org\/copyright/, 'the credit links to OSM copyright information');
  assert.match(svg, /text-anchor="end"/, 'the credit is right-aligned for the lower-right corner');
}

console.log('download-attribution: PASS');
