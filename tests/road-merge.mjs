// Unit test for the road-segment stitcher (mergeNamedWays / stitchWays).
// These are pure functions in script.js with no browser globals, so we slice
// their source out of the file and eval it in isolation — same trick lib.mjs
// uses to read LAYER_REGISTRY without loading the whole app.
import assert from 'node:assert/strict';
import { SCRIPT_PATH, fs } from './lib.mjs';

const src = fs.readFileSync(SCRIPT_PATH, 'utf8');
const start = src.indexOf('function mergeNamedWays(elements) {');
const end = src.indexOf('//  ROADS BUILDER');
assert.ok(start !== -1 && end > start, 'could not locate mergeNamedWays/stitchWays in script.js');
const code = src.slice(start, end);
const { mergeNamedWays } = new Function(code + '\nreturn { mergeNamedWays };')();

// helper to build a synthetic OSM way
let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}`); }
}
const way = (id, nodes, name, highway = 'residential', extra = {}) => ({
  type: 'way', id, nodes,
  geometry: nodes.map(n => ({ lat: 0, lon: n })), // collinear; lon == node id
  tags: name ? { name, highway, ...extra } : { highway, ...extra },
});

// 1. Three chained ways sharing nodes -> one continuous run.
{
  const runs = mergeNamedWays([
    way(1, [1, 2], 'Chain St'),
    way(2, [2, 3], 'Chain St'),
    way(3, [3, 4], 'Chain St'),
  ]);
  check('chain: merges to 1 run', runs.length === 1);
  const g = runs[0].geometry;
  check('chain: 4 continuous points', g.length === 4 && g[0].lon === 1 && g[3].lon === 4);
}

// 2. Fork: three ways meeting at one node stay separate (no clean pass-through),
//    but all keep the shared name.
{
  const runs = mergeNamedWays([
    way(1, [1, 2], 'Fork St'),
    way(2, [2, 3], 'Fork St'),
    way(3, [2, 4], 'Fork St'),
  ]);
  check('fork: junction breaks into 3 runs', runs.length === 3);
  check('fork: all runs keep the name', runs.every(r => r.tags.name === 'Fork St'));
}

// 3. Same name but disconnected -> two separate runs.
{
  const runs = mergeNamedWays([
    way(1, [1, 2], 'Split St'),
    way(2, [10, 11], 'Split St'),
  ]);
  check('disconnected: stays 2 runs', runs.length === 2);
}

// 4. Closed loop (roundabout-style) -> one closed run.
{
  const runs = mergeNamedWays([
    way(1, [1, 2], 'Ring', 'residential', { junction: 'roundabout' }),
    way(2, [2, 3], 'Ring', 'residential', { junction: 'roundabout' }),
    way(3, [3, 1], 'Ring', 'residential', { junction: 'roundabout' }),
  ]);
  check('loop: merges to 1 run', runs.length === 1);
  const g = runs[0].geometry;
  check('loop: closes back to start', g[0].lon === g[g.length - 1].lon);
}

// 5. Different highway class with same name is NOT merged across the class change.
{
  const runs = mergeNamedWays([
    way(1, [1, 2], 'Mixed St', 'secondary'),
    way(2, [2, 3], 'Mixed St', 'tertiary'),
  ]);
  check('class change: stays 2 runs', runs.length === 2);
}

// 6. Unnamed ways pass through untouched (one run each, original object).
{
  const a = way(1, [1, 2], null);
  const b = way(2, [2, 3], null);
  const runs = mergeNamedWays([a, b]);
  check('unnamed: passes through unchanged', runs.length === 2 && runs.includes(a) && runs.includes(b));
}

// 7. Coordinate fallback when `nodes` is absent (shared endpoint coords stitch).
{
  const mk = (id, lons) => ({ type: 'way', id, geometry: lons.map(l => ({ lat: 0, lon: l })), tags: { name: 'Coord St', highway: 'residential' } });
  const runs = mergeNamedWays([mk(1, [0, 1]), mk(2, [1, 2])]);
  check('no-nodes fallback: merges on coords', runs.length === 1 && runs[0].geometry.length === 3);
}

console.log(`\nroad-merge: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
