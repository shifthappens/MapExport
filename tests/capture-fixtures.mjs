// Captures Overpass responses for each layer of the LAYER_REGISTRY
// (parsed from script.js) against the Tilburg reference bbox.
// Run this ONCE on a known-good commit; commit the output.
//
// Output: tests/fixtures/tilburg/<layer-id>.json + _meta.json

import {
  TILBURG, SCRIPT_PATH, FIXTURE_DIR,
  extractLayers, fetchLayer, sleep, ensureDir, fs, path,
} from './lib.mjs';

const layers = extractLayers();
console.log(`[capture] found ${layers.length} layers in script.js`);
ensureDir(FIXTURE_DIR);

const meta = {
  captured_at: new Date().toISOString(),
  script_path: path.relative(path.dirname(FIXTURE_DIR), SCRIPT_PATH),
  bbox: TILBURG,
  layers: {},
};

for (const layer of layers) {
  process.stdout.write(`[capture] ${layer.id} … `);
  try {
    const { json, elapsed, bytes, ep } = await fetchLayer(layer, TILBURG);
    const outPath = path.join(FIXTURE_DIR, `${layer.id}.json`);
    fs.writeFileSync(outPath, JSON.stringify(json));
    meta.layers[layer.id] = {
      query_template: layer.queryTemplate,
      element_count: json.elements?.length || 0,
      bytes,
      elapsed_ms: elapsed,
      endpoint: ep,
    };
    console.log(`${json.elements?.length || 0} elements · ${(bytes/1024).toFixed(1)} KB · ${elapsed}ms`);
  } catch (err) {
    console.log(`FAILED: ${err.message}`);
    meta.layers[layer.id] = { error: err.message };
  }
  await sleep(2000); // be nice to Overpass
}

fs.writeFileSync(path.join(FIXTURE_DIR, '_meta.json'), JSON.stringify(meta, null, 2));
console.log(`[capture] wrote meta to ${FIXTURE_DIR}/_meta.json`);
