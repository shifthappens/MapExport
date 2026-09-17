// Deployment gate: cache keys must be byte-for-byte identical in source and
// Terser's production bundle.  A cache key is part of the data contract with
// cache.php, so a minifier-dependent key would make a warmed production cache
// invisible and send exports back to Overpass.
//
// Run after `bash tools/minify.sh`: node tests/minified-cache-keys.mjs
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeAppContext } from './lib.mjs';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourcePath = join(repoRoot, 'script.js');
const minifiedPath = join(repoRoot, 'script.min.js');
const enginePath = join(repoRoot, 'engine-v2.js');

if (!existsSync(minifiedPath)) {
  throw new Error('script.min.js is missing — run bash tools/minify.sh before this deployment check');
}

const engineSource = readFileSync(enginePath, 'utf8');
const expose = `
;globalThis.__cacheKeyContract = {
  tileCacheKey,
  registryLayers: LAYER_REGISTRY.flatMap(group => group.layers),
  blockBuildingsLayer: BLOCK_BUILDINGS_LAYER,
  engineLayers: EngineV2.layers,
};`;

function cacheKeys(scriptPath) {
  const ctx = makeAppContext(`${readFileSync(scriptPath, 'utf8')}\n;\n${engineSource}${expose}`);
  const contract = ctx.__cacheKeyContract;
  const tile = { s: 50.625, w: 3.05, n: 50.65, e: 3.075, fine: true };
  const layers = [
    ...contract.registryLayers,
    contract.blockBuildingsLayer,
    ...contract.engineLayers,
  ].filter(layer => typeof layer.overpassQuery === 'function');

  // Include generated query and output shape in the label: `block_buildings`
  // deliberately has two distinct fetch contracts, so id alone is not unique.
  return layers.map(layer => {
    const query = layer.overpassQuery('12.34567,23.45678,34.56789,45.67891');
    return `${layer.id} | ${layer.overpassOut || 'body geom'} | ${query} => ${contract.tileCacheKey(layer, tile)}`;
  }).sort();
}

const sourceKeys = cacheKeys(sourcePath);
const minifiedKeys = cacheKeys(minifiedPath);
if (sourceKeys.length !== minifiedKeys.length) {
  throw new Error(`source exposes ${sourceKeys.length} cache-layer contracts; minified production exposes ${minifiedKeys.length}`);
}

const differences = sourceKeys.filter((key, index) => key !== minifiedKeys[index]);
if (differences.length) {
  throw new Error(`minified cache keys differ from source:\n${differences.join('\n')}`);
}

console.log(`PASS — ${sourceKeys.length} source and minified cache-layer contracts use identical keys`);
