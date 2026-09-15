// Unit test for road-group sort order (ME-06b).
// roadTypeRank() and its use in the byType-keys sort live inline inside a
// larger rendering function in script.js, so — same trick as road-merge.mjs —
// we slice the two source snippets out and eval them in isolation rather than
// loading the whole app (which needs browser globals we don't have here).
import assert from 'node:assert/strict';
import { SCRIPT_PATH, fs } from './lib.mjs';

const src = fs.readFileSync(SCRIPT_PATH, 'utf8');

// 1. ROAD_DRAW_ORDER itself: a single const array literal statement.
const orderStart = src.indexOf('const ROAD_DRAW_ORDER=');
const orderEnd = src.indexOf(';', orderStart) + 1;
assert.ok(orderStart !== -1, 'could not locate ROAD_DRAW_ORDER in script.js');
const orderCode = src.slice(orderStart, orderEnd);

// 2. roadTypeRank(): the small helper function right above the sort call.
const rankStart = src.indexOf('function roadTypeRank(highwayType) {');
const rankEnd = src.indexOf('\n  }', rankStart) + '\n  }'.length;
assert.ok(rankStart !== -1 && rankEnd > rankStart, 'could not locate roadTypeRank in script.js');
const rankCode = src.slice(rankStart, rankEnd);

const { roadTypeRank } = new Function(
  orderCode + '\n' + rankCode + '\nreturn { roadTypeRank };'
)();

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}`); }
}

// Sort the same way script.js does: types.sort by roadTypeRank difference.
const types = ['residential', 'zz_unknown', 'path'].sort((typeA, typeB) => {
  return roadTypeRank(typeA) - roadTypeRank(typeB);
});
check(
  "'path' (index 0 in ROAD_DRAW_ORDER) sorts first, not as unknown",
  types.join(',') === 'path,residential,zz_unknown'
);

// Two unknown types keep their original insertion order (stable sort).
const unknowns = ['zz_first_unknown', 'zz_second_unknown'].sort((typeA, typeB) => {
  return roadTypeRank(typeA) - roadTypeRank(typeB);
});
check(
  'two unknown types keep insertion order under the stable sort',
  unknowns.join(',') === 'zz_first_unknown,zz_second_unknown'
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
