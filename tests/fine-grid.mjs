// Offline regression test for the shareable fine-grid cache path: a small
// (adaptive, exact-bbox) selection reads pre-warmed 0.025° tiles when every
// tile a layer needs is cached, and keeps the exact-bbox query otherwise. All
// cache.php and Overpass traffic is mocked — deterministic, no network.
//
// Usage:  node tests/fine-grid.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeAppContext } from './lib.mjs';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const scriptSrc = readFileSync(join(repoRoot, 'script.js'), 'utf8');
const expose = `
;globalThis.__fg = { bboxToTiles, bboxToFineTiles, tileCacheKey, fineTilesIfCached, fetchLayer, FINE_TILE_SIZE, TILE_SIZE };`;

let failures = 0;
function check(name, ok, detail = '') {
  if (ok) console.log(`ok  ${name}`);
  else { console.error(`FAIL ${name}${detail ? ` — ${detail}` : ''}`); failures++; }
}

// A city-centre selection: well under one export tile on both axes.
const centre = { south: 52.365, west: 4.885, north: 52.385, east: 4.905 };
const layer = { id: 'roads', overpassQuery: b => `way["highway"](${b});` };

function makeContext({ cached, onOverpass }) {
  const ctx = makeAppContext(`${scriptSrc}\n${expose}`);
  const requests = { exists: [], gets: [], overpass: [], posts: [] };
  ctx.fetch = async (url, init = {}) => {
    const text = String(url);
    if (text.startsWith('cache.php?exists=')) {
      const keys = decodeURIComponent(text.slice('cache.php?exists='.length)).split(',');
      requests.exists.push(keys);
      return new Response(JSON.stringify(Object.fromEntries(keys.map(k => [k, cached.has(k)]))));
    }
    if (text.startsWith('cache.php?key=')) {
      const key = decodeURIComponent(text.slice('cache.php?key='.length));
      if (init.method === 'POST') { requests.posts.push(key); return new Response(null, { status: 204 }); }
      requests.gets.push(key);
      return new Response(JSON.stringify(cached.has(key) ? { elements: [{ type: 'way', id: cached.get(key) }] } : null));
    }
    requests.overpass.push(String(init.body || ''));
    if (!onOverpass) throw new Error(`unexpected Overpass request: ${text}`);
    return new Response(JSON.stringify(onOverpass()), { status: 200 });
  };
  return { ctx, fg: ctx.__fg, requests };
}

const base = makeContext({ cached: new Map() });
const fg = base.fg;

// Tiling geometry.
check('centre selection is adaptive on the export grid',
  fg.bboxToTiles(centre).length === 1 && fg.bboxToTiles(centre)[0].adaptive === true);
check('fine grid is 0.025°', fg.FINE_TILE_SIZE === 0.025 && fg.TILE_SIZE === 0.1);
const inside = fg.bboxToFineTiles({ south: 52.355, west: 4.880, north: 52.370, east: 4.895 });
check('a selection inside one fine cell gets that aligned tile',
  inside.length === 1 && inside[0].s === 52.35 && inside[0].w === 4.875 && inside[0].n === 52.375 && inside[0].e === 4.9,
  JSON.stringify(inside));
// 52.365..52.385 crosses 52.375, 4.885..4.905 crosses 4.9 — so 2 × 2 tiles.
const straddle = fg.bboxToFineTiles(centre);
check('a selection across fine grid lines gets every covering tile', straddle.length === 4, `${straddle.length}`);
const keys = straddle.map(t => fg.tileCacheKey(layer, t));
check('fine keys carry the _f_ marker with three decimals',
  keys.every(k => /_f_\d+\.\d{3}_\d+\.\d{3}$/.test(k)) && keys.includes(`mapexport_v3_roads_${keys[0].split('_')[3]}_f_52.375_4.900`),
  keys.join(' '));
check('export-grid and adaptive keys are unchanged',
  fg.tileCacheKey(layer, { s: 52.3, w: 4.8, n: 52.4, e: 4.9 }).endsWith('_52.3_4.8')
  && fg.tileCacheKey(layer, fg.bboxToTiles(centre)[0]).includes('_a_52.365_4.885_52.385_4.905'));
check('an adaptive tile is not mistaken for a fine one', !fg.bboxToTiles(centre)[0].fine);

// Fallback decision.
{
  const all = new Map(keys.map((k, i) => [k, i + 1]));
  const { fg: f, requests } = makeContext({ cached: all });
  const tiles = await f.fineTilesIfCached(layer, centre);
  check('every fine tile cached → fine tiles are used', Array.isArray(tiles) && tiles.length === 4);
  check('the decision costs one batched exists call', requests.exists.length === 1 && requests.exists[0].length === 4);
}
{
  const partial = new Map(keys.slice(0, 3).map((k, i) => [k, i + 1]));
  const { fg: f } = makeContext({ cached: partial });
  check('one fine tile missing → exact-bbox path is kept', await f.fineTilesIfCached(layer, centre) === null);
}
{
  const { fg: f } = makeContext({ cached: new Map() });
  check('nothing cached → exact-bbox path is kept', await f.fineTilesIfCached(layer, centre) === null);
}

// End to end through fetchLayer.
{
  const all = new Map(keys.map((k, i) => [k, i + 1]));
  const { fg: f, requests } = makeContext({ cached: all });
  const result = await f.fetchLayer(layer, '52.365,4.885,52.385,4.905', centre);
  check('warm area: fetchLayer reads the four fine tiles and never calls Overpass',
    requests.overpass.length === 0 && requests.gets.length === 4 && result.elements.length === 4,
    `overpass=${requests.overpass.length} gets=${requests.gets.length} elements=${result.elements.length}`);
  check('warm area: nothing is written back to the cache', requests.posts.length === 0);
}
{
  const { fg: f, requests } = makeContext({ cached: new Map(), onOverpass: () => ({ elements: [{ type: 'way', id: 9 }] }) });
  const result = await f.fetchLayer(layer, '52.365,4.885,52.385,4.905', centre);
  const adaptiveKey = f.tileCacheKey(layer, f.bboxToTiles(centre)[0]);
  check('cold area: one exact-bbox Overpass request, cached under the adaptive key',
    requests.overpass.length === 1 && requests.overpass[0].includes(encodeURIComponent('52.365,4.885,52.385,4.905'))
      && requests.posts.length === 1 && requests.posts[0] === adaptiveKey && result.elements.length === 1,
    `overpass=${requests.overpass.length} posts=${requests.posts.join(',')}`);
}
{
  // A selection that is big enough for the export grid never consults the fine grid.
  const big = { south: 52.30, west: 4.80, north: 52.45, east: 4.95 };
  const { fg: f, requests } = makeContext({ cached: new Map(), onOverpass: () => ({ elements: [] }) });
  await f.fetchLayer(layer, '52.3,4.8,52.45,4.95', big);
  check('multi-tile selection: no fine-grid exists probe', requests.exists.length === 0 && requests.overpass.length === 4,
    `exists=${requests.exists.length} overpass=${requests.overpass.length}`);
}

if (failures) { console.error(`fine-grid: ${failures} failed`); process.exit(1); }
console.log('fine-grid: all checks passed');
