// tests/svg-lint-selftest.mjs — guards svg-lint.mjs itself (offline).
//
// Builds a minimal well-formed export (straight label, curved textPath label,
// feature label) and asserts it lints clean; then seeds one defect at a time
// and asserts each is caught. If the lint's parsing drifts away from the
// label engine's markup, this is the test that notices.
import { lintSvg } from './svg-lint.mjs';

// Mirrors the engine's post-2026-07-04 markup: no dominant-baseline — the
// baseline offset is baked into y (straight) / into the lp path (textPath),
// and road fill paths carry the street name so containment can be judged.
const GOOD = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="1000" height="800" viewBox="0 0 1000 800">
  <g id="map-content">
    <g id="roads">
      <g id="roads_fills">
        <path id="Straight_St" inkscape:label="Straight St" d="M387.4,265.0L612.6,135.0" fill="none" stroke="#ffffff" stroke-width="30.00" stroke-linecap="round" stroke-linejoin="round"/>
        <path id="Curved_Ln" inkscape:label="Curved Ln" d="M100.0,700.0L180.0,660.0L300.0,640.0" fill="none" stroke="#ffffff" stroke-width="27.00" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
    </g>
    <g id="street_labels">
      <defs><path id="lp0" d="M102.6,705.1L182.6,665.1L302.6,645.1"/></defs>
      <g id="labels_residential">
        <text id="lbl_Straight_St_1" inkscape:label="Straight St" font-size="20.0" letter-spacing="1.0" text-anchor="middle" transform="rotate(-30.0 500.0 200.0)" x="500.0" y="207.2" fill="#2a2a20">STRAIGHT ST</text>
        <text id="lbl_Curved_Ln_2" inkscape:label="Curved Ln" font-size="16.0" letter-spacing="1.0" text-anchor="middle" fill="#2a2a20"><textPath xlink:href="#lp0" startOffset="50%">CURVED LN</textPath></text>
      </g>
    </g>
    <g id="water_labels">
      <text id="feat_Pond_halo" x="800.0" y="608.4" font-size="24.0" text-anchor="middle" stroke="white" fill="none">Pond</text>
      <text id="feat_Pond" x="800.0" y="608.4" font-size="24.0" text-anchor="middle" fill="#3a6a9a">Pond</text>
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
expectError('mirrored baseline', GOOD.replace('M102.6,705.1L182.6,665.1L302.6,645.1', 'M302.6,645.1L182.6,665.1L102.6,705.1'), 'right-to-left');
expectError('two labels on the same spot',
  GOOD.replace('</g>\n    </g>\n    <g id="water_labels">', `<text id="lbl_Clone_9" font-size="20.0" letter-spacing="1.0" text-anchor="middle" transform="rotate(-30.0 500.0 200.0)" x="500.0" y="207.2" fill="#2a2a20">STRAIGHT ST</text></g>\n    </g>\n    <g id="water_labels">`),
  'overlaps');
// within-street containment (the durable guard for "binnen de lijntjes")
expectError('straight label shifted off its street', GOOD.replace('y="207.2"', 'y="245.0"'), 'leaves its street');
expectError('textPath baseline shifted off its street', GOOD.replace('M102.6,705.1L182.6,665.1L302.6,645.1', 'M102.6,725.1L182.6,685.1L302.6,665.1'), 'leaves its street');

// canvas policy — errors since the engine's fpInside/fpVisible fix landed
{
  const { errors } = lintSvg(GOOD.replace('x="500.0" y="207.2"', 'x="-500.0" y="207.2"').replace('rotate(-30.0 500.0 200.0)', 'rotate(-30.0 -500.0 200.0)'));
  ok('label outside canvas → error', errors.some(e => e.includes('entirely outside')), errors.join(' | '));
  ok('outside-only street → no-visible-label error', errors.some(e => e.includes("street 'Straight St'") && e.includes('fully visible')), errors.join(' | '));
}
{
  // clipped label whose street ALSO has a fully visible sibling → fine, no
  // per-street verdict (policy: clipped repeats at the edge are OK)
  const sibling = GOOD.replace('</g>\n    </g>\n    <g id="water_labels">',
    `<text id="lbl_Straight_St_9" inkscape:label="Straight St" font-size="20.0" letter-spacing="1.0" text-anchor="middle" x="990.0" y="400.0" fill="#2a2a20">STRAIGHT ST</text></g>\n    </g>\n    <g id="water_labels">`);
  const { warnings, errors } = lintSvg(sibling);
  ok('clipped repeat with visible sibling → clean', errors.length === 0 && !warnings.some(w => w.includes("street 'Straight St'")), (errors.join(' | ') || warnings.join(' | ')));
}
{
  // street whose ONLY label is clipped → per-street error
  const clippedOnly = GOOD.replace('x="500.0" y="207.2"', 'x="995.0" y="207.2"').replace('rotate(-30.0 500.0 200.0)', 'rotate(-30.0 995.0 200.0)');
  const { errors } = lintSvg(clippedOnly);
  ok('clipped-only street → no-visible-label error', errors.some(e => e.includes("street 'Straight St'") && e.includes('fully visible')), errors.join(' | '));
}
// feature labels are single-placement: clipped at the edge → error
expectError('clipped feature label', GOOD.replaceAll('x="800.0"', 'x="995.0"'), 'clipped by the canvas edge');
// cross-family overlap is an error too — all labels share one collision grid
expectError('street label overlapping feature label',
  GOOD.replace('<text id="feat_Pond_halo"', '<text id="feat_Lake" x="500.0" y="207.2" font-size="24.0" text-anchor="middle" fill="#3a6a9a">Lake</text><text id="feat_Pond_halo"'),
  'overlaps');
// labels must never print across the hatched rail bed
expectError('label crossing a railway',
  GOOD.replace('<g id="street_labels">', '<g id="rail"><g id="rail_casing"><path id="r1_casing" inkscape:label="Rail" d="M400.0,300.0L600.0,100.0" fill="none" stroke="#555555" stroke-width="12.00" stroke-linecap="butt"/></g></g><g id="street_labels">'),
  'crosses a railway');
{
  const { warnings } = lintSvg(GOOD.replace('<textPath xlink:href="#lp0" startOffset="50%">CURVED LN</textPath>', 'CURVED LN'));
  ok('orphaned label-path def → warning', warnings.some(w => w.includes('unused')), warnings.join(' | '));
}

console.log(`\nsvg-lint-selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
