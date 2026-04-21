// Recapture a single layer fixture. Usage:
//   node tests/capture-one.mjs <layer-id>
import {
  TILBURG, FIXTURE_DIR,
  extractLayers, fetchLayer, slimResponse, fs, path,
} from './lib.mjs';

const id = process.argv[2];
if (!id) { console.error('usage: node tests/capture-one.mjs <layer-id>'); process.exit(2); }
const layer = extractLayers().find(l => l.id === id);
if (!layer) { console.error(`no such layer: ${id}`); process.exit(2); }

process.stdout.write(`[one] ${layer.id} … `);
const { json, elapsed, bytes, ep } = await fetchLayer(layer, TILBURG);
const slim = slimResponse(json);
const outPath = path.join(FIXTURE_DIR, `${layer.id}.json`);
fs.writeFileSync(outPath, JSON.stringify(slim));
const slimBytes = fs.statSync(outPath).size;
console.log(`${json.elements?.length || 0} elements · wire ${(bytes/1024).toFixed(1)} KB → slim ${(slimBytes/1024).toFixed(1)} KB · ${elapsed}ms`);

// Patch _meta.json in place
const metaPath = path.join(FIXTURE_DIR, '_meta.json');
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
meta.layers[id] = {
  query_template: layer.queryTemplate,
  element_count: json.elements?.length || 0,
  response_bytes: bytes,
  fixture_bytes: slimBytes,
  elapsed_ms: elapsed,
  endpoint: ep,
};
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
console.log(`[one] patched _meta.json`);
