// Unit test for the straight-label baseline fit (fitStraightBaseline /
// pointAtCum). These are pure top-level functions in script.js with no
// browser globals, so we slice their source out of the file and eval it in
// isolation — same trick road-merge.mjs uses for the way stitcher.
//
// Guards the fix for straight labels veering off slightly bendy streets:
// a straight <text> must be anchored on the least-squares baseline of its
// whole span (centroid + fitted angle), not on the local tangent of the one
// segment under the span's midpoint, and the straight-vs-textPath decision
// must be based on absolute deviation (length-aware), not degrees of bend.
import assert from 'node:assert/strict';
import { SCRIPT_PATH, fs } from './lib.mjs';

const src = fs.readFileSync(SCRIPT_PATH, 'utf8');
const start = src.indexOf('function pointAtCum(');
const end = src.indexOf('function makeCollisionGrid(');
assert.ok(start !== -1 && end > start, 'could not locate pointAtCum/fitStraightBaseline in script.js');
const { fitStraightBaseline, pointAtCum } =
  new Function(src.slice(start, end) + '\nreturn { fitStraightBaseline, pointAtCum };')();

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}`); }
}
const cumOf = pts => {
  const c = [0];
  for (let i = 1; i < pts.length; i++)
    c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return c;
};

// 1. Straight horizontal span: angle 0, no deviation, centroid at the middle.
{
  const pts = [[0, 0], [50, 0], [200, 0]];
  const f = fitStraightBaseline(pts, cumOf(pts), 20, 180);
  check('straight: angle 0', Math.abs(f.angle) < 1e-6);
  check('straight: maxDev 0', f.maxDev < 1e-6);
  check('straight: centred at span middle', Math.abs(f.cx - 100) < 1e-6 && Math.abs(f.cy) < 1e-6);
}

// 2. Asymmetric kink — straight for 100px, then 12° up for 100px. The local
// tangent at the span midpoint is 0° (it sits on the first leg), which is
// what the old code used and what tilted labels off the street. The fitted
// angle must average the two legs instead.
{
  const a = 12 * Math.PI / 180;
  const pts = [[0, 0], [100, 0], [100 + 100 * Math.cos(a), 100 * Math.sin(a)]];
  const cum = cumOf(pts);
  const f = fitStraightBaseline(pts, cum, 0, cum[2]);
  check('kink: fitted angle between the legs', f.angle > 3 && f.angle < 9);
  check('kink: deviation reported', f.maxDev > 1);
  const mid = pointAtCum(pts, cum, cum[2] / 2);
  check('kink: centroid off the on-path midpoint', Math.hypot(f.cx - mid[0], f.cy - mid[1]) > 1);
}

// 3. Symmetric bow: fitted angle is the chord direction, and the centroid is
// pulled off the apex toward the chord (the on-path midpoint IS the apex,
// which is why anchoring there pushed labels to the outside of the curve).
{
  const pts = [];
  for (let k = 0; k <= 20; k++) { const x = k * 10; pts.push([x, 10 * Math.sin(Math.PI * k / 20)]); }
  const cum = cumOf(pts);
  const f = fitStraightBaseline(pts, cum, 0, cum[20]);
  check('bow: chord angle', Math.abs(f.angle) < 0.5);
  check('bow: centroid below the apex', f.cy > 0.5 && f.cy < 9.5);
  check('bow: deviation ~ sagitta share', f.maxDev > 2 && f.maxDev < 10);
}

// 4. Same total bend, 3× the length → ~3× the deviation. This is what a
// degrees-only threshold could not see: long labels drifted visibly off
// gently-bending roads while still passing the 12° test.
{
  const a = 10 * Math.PI / 180;
  const mk = L => {
    const pts = [[0, 0], [L, 0], [L + L * Math.cos(a), L * Math.sin(a)]];
    const cum = cumOf(pts);
    return fitStraightBaseline(pts, cum, 0, cum[2]).maxDev;
  };
  const d1 = mk(100), d3 = mk(300);
  check('length-aware: deviation scales with span length', d3 > 2.5 * d1 && d3 < 3.5 * d1);
}

// 5. Vertical span: angle normalised to ±90 (reading orientation is decided
// downstream), fit still exact.
{
  const pts = [[0, 0], [0, 100], [0, 300]];
  const f = fitStraightBaseline(pts, cumOf(pts), 0, 300);
  check('vertical: |angle| = 90', Math.abs(Math.abs(f.angle) - 90) < 1e-6);
  check('vertical: maxDev 0', f.maxDev < 1e-6);
}

// 6. pointAtCum interpolates and clamps past the end.
{
  const pts = [[0, 0], [10, 0], [10, 10]];
  const cum = cumOf(pts);
  const p = pointAtCum(pts, cum, 15);
  check('pointAtCum: interpolates onto second leg', Math.abs(p[0] - 10) < 1e-6 && Math.abs(p[1] - 5) < 1e-6);
  const q = pointAtCum(pts, cum, 999);
  check('pointAtCum: clamps to last point', q[0] === 10 && q[1] === 10);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
