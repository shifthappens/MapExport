// tests/feature-label-dedup.mjs — offline unit tests for AF-02a: dedup of
// repeated named water/park feature labels in buildFeatureLabelsLayer.
//
// Regression target: every named water/park element used to get its own label
// attempt, gated only by the footprint grid, so a river split into many ways
// (Ghent's Leie, Bremerhaven's Geeste) or a park split into many polygons could
// carry a label per segment whenever the segments dodged grid collisions. This
// runs the real buildFeatureLabelsLayer and checks same-name suppression within
// a geographic gap, long-distance repetition still allowed, name normalization,
// largest-first selection, that a suppressed label claims no grid space, and
// build-to-build determinism.
//
// Usage: node tests/feature-label-dedup.mjs
import { loadAppSandbox } from './lib.mjs';

const X = loadAppSandbox([
  'buildFeatureLabelsLayer', 'makeFootprintGrid', 'makeProjector', 'getScaleFactor',
]);

let pass = 0, fail = 0;
function check(label, cond, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); }
}

// ── shared projector: ~1.1 km tall / ~2.2 km wide bbox at 51°N ──────────
const BBOX = { south: 51.0, west: 5.0, north: 51.01, east: 5.032 };
const W = 2000;
const { pr, H } = X.makeProjector(BBOX, W);
const sf = X.getScaleFactor(W);
const gap = 1000 * sf; // same-name suppression radius used inside the builder

const pt = (latFrac, lonFrac) => ({
  lat: BBOX.south + (BBOX.north - BBOX.south) * latFrac,
  lon: BBOX.west + (BBOX.east - BBOX.west) * lonFrac,
});
let nextId = 1;
// 3 points (not 2): the builder's anchor is geometry[floor(len/2)], which for
// a bare 2-point way is the END point, not the true midpoint — an explicit
// middle vertex here keeps the anchor at the geometric midpoint as intended.
const riverWay = (name, latFrac, lonFrac0, lonFrac1) => ({
  type: 'way', id: nextId++, tags: { waterway: 'river', name },
  geometry: [pt(latFrac, lonFrac0), pt(latFrac, (lonFrac0 + lonFrac1) / 2), pt(latFrac, lonFrac1)],
});
const rectWay = (tags, cLatFrac, cLonFrac, halfLatFrac, halfLonFrac) => ({
  type: 'way', id: nextId++, tags,
  geometry: [
    pt(cLatFrac - halfLatFrac, cLonFrac - halfLonFrac),
    pt(cLatFrac - halfLatFrac, cLonFrac + halfLonFrac),
    pt(cLatFrac + halfLatFrac, cLonFrac + halfLonFrac),
    pt(cLatFrac + halfLatFrac, cLonFrac - halfLonFrac),
    pt(cLatFrac - halfLatFrac, cLonFrac - halfLonFrac),
  ],
});
const run = els => X.buildFeatureLabelsLayer(els, pr, W, H);
const textsOf = svg => [...svg.matchAll(/<text [^>]*>[^<]*<\/text>/g)].map(t => t[0]);
const xyOf = t => {
  const x = t.match(/ x="(-?[\d.]+)"/), y = t.match(/ y="(-?[\d.]+)"/);
  return [x ? +x[1] : NaN, y ? +y[1] : NaN];
};

// (a) a river split into 3 OSM ways, all anchors well within gap → 1 label
{
  const svg = run([
    riverWay('Leie', 0.50, 0.40, 0.42),
    riverWay('Leie', 0.50, 0.43, 0.45),
    riverWay('Leie', 0.50, 0.46, 0.48),
  ]);
  const n = (svg.match(/>Leie</g) || []).length;
  check('(a) river split into 3 close ways: exactly one label', n === 1, `${n} labels`);
}

// (b) same name, two anchors well beyond gap apart → both labels placed
{
  const svg = run([
    riverWay('Geeste', 0.50, 0.05, 0.07),  // midpoint lonFrac 0.06
    riverWay('Geeste', 0.50, 0.90, 0.92),  // midpoint lonFrac 0.91 — far away
  ]);
  const texts = textsOf(svg).filter(t => t.includes('>Geeste<'));
  check('(b) far-apart repeats: both labels placed', texts.length === 2, `${texts.length} labels`);
  if (texts.length === 2) {
    const [x0] = xyOf(texts[0]), [x1] = xyOf(texts[1]);
    check('(b) far-apart repeats: really apart (≥ gap)', Math.abs(x0 - x1) >= gap - 1, `dx=${Math.abs(x0 - x1).toFixed(0)} gap=${gap.toFixed(0)}`);
  }
}

// (c) name normalization: casing/whitespace variant is the SAME dedup key
{
  const svg = run([
    riverWay('Leie', 0.50, 0.40, 0.42),
    riverWay(' LEIE  ', 0.50, 0.41, 0.43), // extra spaces + different case, close by
  ]);
  const n = (svg.match(/<text [^>]*>[^<]*<\/text>/g) || []).length;
  check('(c) casing/whitespace variant treated as same name: one label total', n === 1, `${n} labels`);
}

// (d) largest-first: of two same-named close candidates, the label lands on
// the larger one's anchor (a short stub must not win over the main run)
{
  const small = riverWay('Bergstrom', 0.50, 0.40, 0.42);   // midpoint lonFrac 0.41, short
  const large = riverWay('Bergstrom', 0.50, 0.10, 0.80);   // midpoint lonFrac 0.45, much longer
  const svg = run([small, large]);
  const texts = textsOf(svg).filter(t => t.includes('>Bergstrom<'));
  check('(d) largest-first: exactly one label', texts.length === 1, `${texts.length} labels`);
  if (texts.length === 1) {
    const [x] = xyOf(texts[0]);
    const [lx] = pr(BBOX.south + (BBOX.north - BBOX.south) * 0.50, BBOX.west + (BBOX.east - BBOX.west) * 0.45);
    const [sx] = pr(BBOX.south + (BBOX.north - BBOX.south) * 0.50, BBOX.west + (BBOX.east - BBOX.west) * 0.41);
    check('(d) largest-first: label sits on the LONGER way\'s anchor',
      Math.abs(x - lx) < Math.abs(x - sx), `x=${x.toFixed(0)} longAnchor=${lx.toFixed(0)} shortAnchor=${sx.toFixed(0)}`);
  }
}

// (e) a suppressed label claims no grid space: a different-named feature
// placed on top of where the suppressed duplicate WOULD have gone still
// gets its label.
{
  const meerLarge = rectWay({ natural: 'water', name: 'Meer' }, 0.50, 0.20, 0.10, 0.10);
  const meerSmall = rectWay({ natural: 'water', name: 'Meer' }, 0.50, 0.30, 0.01, 0.01);
  const park = rectWay({ leisure: 'park', name: 'Robert Hoozeepark' }, 0.50, 0.30, 0.01, 0.01);
  const svg = run([meerLarge, meerSmall, park]);
  const meerCount = (svg.match(/>Meer</g) || []).length;
  check('(e) duplicate "Meer" suppressed: exactly one Meer label', meerCount === 1, `${meerCount} labels`);
  check('(e) suppressed label claims no grid space: the park at the same spot still gets labelled',
    svg.includes('>Robert Hoozeepark<'), svg.slice(0, 200));
}

// (g) cross-name grid priority is by COMPARABLE px extent: a long river must
// beat an unrelated small park whose label footprint sits on top of it.
// Regression: the polygon metric used to be raw bbox area in px² against the
// river's length in px, so a modest park (~9600 px²) outranked a ~1400 px
// river and claimed the grid first, suppressing the river label that placed
// fine before the dedup existed. With √area (~98 px) the river wins again.
{
  const river = riverWay('Ijzer', 0.50, 0.10, 0.80);            // ~1400 px long, midpoint lonFrac 0.45
  const park = rectWay({ leisure: 'park', name: 'Parkje' }, 0.50, 0.45, 0.06, 0.02); // small, anchored ON the river midpoint
  const svg = run([river, park]);
  check('(g) the long river label survives the overlapping small park', svg.includes('>Ijzer<'));
  check('(g) the small park loses the collision instead (footprints overlap)', !svg.includes('>Parkje<'));
}

// (f) determinism: two identical builds (candidates fed in different input
// orders) yield byte-identical output.
{
  const els1 = [
    riverWay('Nederschelde', 0.50, 0.05, 0.10),
    riverWay('Nederschelde', 0.50, 0.60, 0.90),
    rectWay({ natural: 'water', name: 'Vijver' }, 0.20, 0.70, 0.05, 0.05),
  ];
  const els2 = [els1[2], els1[0], els1[1]]; // reversed/shuffled input order
  const svgA = run(els1);
  const svgB = run(els2);
  check('(f) deterministic across repeated builds', svgA === svgB, svgA === svgB ? '' : 'output differs by input order');
  const svgA2 = run(els1);
  check('(f) deterministic across two identical calls', svgA === svgA2);
}

console.log(`\nfeature-label-dedup: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
