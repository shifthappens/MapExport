// tests/svg-lint-selftest.mjs — guards svg-lint.mjs itself (offline).
//
// Builds a minimal well-formed export (straight label, curved textPath label,
// feature label) and asserts it lints clean; then seeds one defect at a time
// and asserts each is caught. If the lint's parsing drifts away from the
// label engine's markup, this is the test that notices.
import { lintSvg } from './svg-lint.mjs';

const GOOD = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="1000" height="800" viewBox="0 0 1000 800">
  <g id="map-content">
    <g id="street_labels">
      <defs><path id="lp0" d="M100.0,700.0L180.0,660.0L300.0,640.0"/></defs>
      <g id="labels_residential">
        <text id="lbl_Straight_St_1" font-size="20.0" letter-spacing="1.0" text-anchor="middle" transform="rotate(-30.0 500.0 200.0)" x="500.0" y="200.0" fill="#2a2a20">STRAIGHT ST</text>
        <text id="lbl_Curved_Ln_2" font-size="16.0" letter-spacing="1.0" text-anchor="middle" fill="#2a2a20"><textPath xlink:href="#lp0" startOffset="50%">CURVED LN</textPath></text>
      </g>
    </g>
    <g id="water_labels">
      <text id="feat_Pond_halo" x="800.0" y="600.0" font-size="24.0" text-anchor="middle" stroke="white" fill="none">Pond</text>
      <text id="feat_Pond" x="800.0" y="600.0" font-size="24.0" text-anchor="middle" fill="#3a6a9a">Pond</text>
    </g>
  </g>
</svg>`;

let pass = 0, fail = 0;
function ok(label, cond, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); }
}
function expectError(label, mutated, needle) {
  const { errors } = lintSvg(mutated);
  ok(label, errors.some(e => e.includes(needle)),
    `expected error containing "${needle}", got: ${errors.join(' | ') || '(none)'}`);
}

{
  const r = lintSvg(GOOD);
  ok('clean SVG lints clean', r.errors.length === 0, r.errors[0]);
  ok('all 3 labels found (halo skipped)', r.labelCount === 3, `labelCount=${r.labelCount}`);
}

expectError('NaN coordinate', GOOD.replace('x="500.0"', 'x="NaN"'), 'NaN');
expectError('undefined in attribute', GOOD.replace('rotate(-30.0', 'rotate(undefined'), 'undefined');
expectError('empty label text', GOOD.replace('>STRAIGHT ST<', '><'), 'empty label');
expectError('missing textPath target', GOOD.replace('#lp0"', '#lp404"'), 'missing path #lp404');
expectError('rotation beyond ±90°', GOOD.replace('rotate(-30.0', 'rotate(-135.0'), 'outside ±90');
expectError('mirrored baseline', GOOD.replace('M100.0,700.0L180.0,660.0L300.0,640.0', 'M300.0,640.0L180.0,660.0L100.0,700.0'), 'right-to-left');
expectError('two labels on the same spot',
  GOOD.replace('</g>\n    </g>', `<text id="lbl_Clone_9" font-size="20.0" letter-spacing="1.0" text-anchor="middle" transform="rotate(-30.0 500.0 200.0)" x="500.0" y="200.0" fill="#2a2a20">STRAIGHT ST</text></g>\n    </g>`),
  'overlaps');

{
  const { warnings } = lintSvg(GOOD.replace('x="500.0" y="200.0"', 'x="-500.0" y="200.0"').replace('rotate(-30.0 500.0 200.0)', 'rotate(-30.0 -500.0 200.0)'));
  ok('label outside canvas → warning', warnings.some(w => w.includes('entirely outside')), warnings.join(' | '));
}
{
  const { warnings } = lintSvg(GOOD.replace('<textPath xlink:href="#lp0" startOffset="50%">CURVED LN</textPath>', 'CURVED LN'));
  ok('orphaned label-path def → warning', warnings.some(w => w.includes('unused')), warnings.join(' | '));
}

console.log(`\nsvg-lint-selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
