// Run each CURRENT layer query (from script.js HEAD) against Overpass and
// verify its element-id set is a superset of the frozen fixture's set.
// Exits non-zero on any regression (missing ids beyond a small tolerance
// for OSM churn).

import {
  TILBURG, FIXTURE_DIR, extractLayers, fetchLayer, elementIdSet,
  sleep, fs, path,
} from './lib.mjs';

const CHURN_TOLERANCE = 0.01; // 1% missing allowed for OSM edits between capture and run

const metaPath = path.join(FIXTURE_DIR, '_meta.json');
if (!fs.existsSync(metaPath)) {
  console.error(`[eq] no fixtures — run capture-fixtures.mjs first`);
  process.exit(2);
}
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
const layers = extractLayers();
let failed = 0;

for (const layer of layers) {
  const fixPath = path.join(FIXTURE_DIR, `${layer.id}.json`);
  if (!fs.existsSync(fixPath)) {
    console.log(`[eq] ${layer.id}: SKIP (no fixture)`);
    continue;
  }
  const baseline = JSON.parse(fs.readFileSync(fixPath, 'utf8'));
  const baselineIds = elementIdSet(baseline.elements);

  process.stdout.write(`[eq] ${layer.id} … `);
  try {
    const { json, bytes } = await fetchLayer(layer, TILBURG);
    const newIds = elementIdSet(json.elements);
    const missing = [...baselineIds].filter(id => !newIds.has(id));
    const ratio = baselineIds.size ? missing.length / baselineIds.size : 0;
    const status = ratio <= CHURN_TOLERANCE ? 'OK' : 'FAIL';
    console.log(`${status} · new=${newIds.size} baseline=${baselineIds.size} missing=${missing.length} (${(ratio*100).toFixed(2)}%) · ${(bytes/1024).toFixed(1)} KB`);
    if (status === 'FAIL') {
      failed++;
      console.log(`       first missing: ${missing.slice(0,5).join(',')}`);
      console.log(`       query template now: ${layer.queryTemplate}`);
      console.log(`       query template was: ${meta.layers[layer.id]?.query_template}`);
    }
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
    failed++;
  }
  await sleep(2000);
}

if (failed) {
  console.error(`\n[eq] ${failed} layer(s) regressed`);
  process.exit(1);
}
console.log(`\n[eq] all layers ≥ baseline`);
