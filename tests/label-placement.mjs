// tests/label-placement.mjs — unit + integration tests for the street-label
// engine (offline, no fixtures). This is the layer where the multi-city visual
// checks keep finding bugs: reading angles, textPath orientation, repeat
// distance, same-name suppression. Runs the REAL functions from script.js via
// lib.mjs loadAppSandbox, then feeds buildLabelsLayer synthetic streets and
// asserts on the emitted SVG fragment (including a pass through svg-lint).
//
// Usage: node tests/label-placement.mjs
import { loadAppSandbox } from './lib.mjs';
import { lintSvg } from './svg-lint.mjs';

const X = loadAppSandbox([
  'approxTextWidth', 'pathLength', 'geoLength', 'angleAtMid', 'pointAngleAtLength',
  'makeFootprintGrid', 'buildLabelsLayer', 'buildFeatureLabelsLayer', 'makeProjector',
  'LABEL_STYLES', 'MIN_LABEL_PX', 'MIN_LABEL_ILLUSTRATOR_PX', 'stampPolyline',
]);

let pass = 0, fail = 0;
function check(label, cond, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); }
}

// ── pure helpers ──────────────────────────────────────────────────
{
  check('approxTextWidth: per-char width', X.approxTextWidth('AB', 10) === 2 * 6.5);
  check('approxTextWidth: letter-spacing included', X.approxTextWidth('AB', 10, 1) === 2 * 7.5);
  check('pathLength: 3-4-5 triangle', X.pathLength([[0, 0], [3, 0], [3, 4]]) === 7);
  // ~111.32 km per degree of latitude
  const m = X.geoLength([{ lat: 51.0, lon: 5.0 }, { lat: 51.01, lon: 5.0 }]);
  check('geoLength: 0.01° lat ≈ 1113 m', Math.abs(m - 1113.2) < 1, `${m}`);
}
{
  check('angleAtMid: horizontal → 0°', X.angleAtMid([[0, 0], [100, 0]]) === 0);
  check('angleAtMid: right-to-left still reads at 0°', X.angleAtMid([[100, 0], [0, 0]]) === 0);
  const v = X.angleAtMid([[0, 0], [0, 100]]);
  check('angleAtMid: vertical within ±90°', v >= -90 && v <= 90, `${v}`);
  // every direction of travel must yield a READING angle in [-90, 90] —
  // outside that range the label renders upside-down (svg-lint hard-errors it)
  let allNorm = true;
  for (let deg = 0; deg < 360; deg += 15) {
    const rad = deg * Math.PI / 180;
    const p = X.pointAngleAtLength([[0, 0], [100 * Math.cos(rad), 100 * Math.sin(rad)]], 50);
    if (p.angle < -90 || p.angle > 90) allNorm = false;
  }
  check('pointAngleAtLength: reading angle normalised for all 24 headings', allNorm);
  const mid = X.pointAngleAtLength([[0, 0], [10, 0], [10, 10]], 15);
  check('pointAngleAtLength: interpolates along segments', mid.x === 10 && mid.y === 5);
  const past = X.pointAngleAtLength([[0, 0], [10, 0]], 999);
  check('pointAngleAtLength: past the end clamps to last point', past.x === 10 && past.y === 0);
}
{
  const g = X.makeFootprintGrid();
  g.put(0, 0, 10);
  check('footprint grid: overlapping circle hits', g.hits(15, 0, 10) === true);
  check('footprint grid: distant circle misses', g.hits(25, 0, 10) === false);
  g.put(1000, 79, 10); // across a spatial-hash cell boundary (cell=80)
  check('footprint grid: hit across cell boundary', g.hits(1000, 90, 10) === true);
}

// ── buildLabelsLayer integration on synthetic streets ─────────────
// Bbox ~1.1 km tall / ~2.2 km wide at 51°N; W=2000 → scaleFactor ≈ 0.4,
// residential style: size 22*sf≈8.9px, spacing 500*sf≈202px.
const BBOX = { south: 51.0, west: 5.0, north: 51.01, east: 5.032 };
const { pr, H } = X.makeProjector(BBOX, 2000);
const W = 2000;
const way = (id, coords, tags) => ({
  type: 'way', id, nodes: coords.map((_, i) => id * 1000 + i),
  geometry: coords.map(([lat, lon]) => ({ lat, lon })),
  tags,
});
// straight west→east line across most of the bbox at given latitude
const horiz = (id, name, latFrac = 0.5, lonFrac0 = 0.05, lonFrac1 = 0.95, hw = 'residential') => {
  const lat = BBOX.south + (BBOX.north - BBOX.south) * latFrac;
  const lon = f => BBOX.west + (BBOX.east - BBOX.west) * f;
  return way(id, [[lat, lon(lonFrac0)], [lat, lon(lonFrac1)]], { name, highway: hw });
};
const run = els => X.buildLabelsLayer(els, pr, W, H);
const runFormat = (els, illustratorCompatible) => X.buildLabelsLayer(els, pr, W, H, undefined, undefined, { illustratorCompatible });
const textsOf = svg => [...svg.matchAll(/<text [^>]*>/g)].map(t => t[0]);
const fontSizesOf = svg => [...svg.matchAll(/font-size="([\d.]+)"/g)].map(m => +m[1]);
const lintFragment = frag => lintSvg(`<svg viewBox="0 0 ${W} ${H}">${frag}</svg>`);

// A. long straight street → one or more single rotated <text>, no textPath
{
  const svg = run([horiz(1, 'Rechte Straat')]);
  const texts = textsOf(svg);
  check('straight street: labelled', texts.length >= 1, svg.slice(0, 200));
  check('straight street: rotated <text>, not textPath', !svg.includes('<textPath') && texts.every(t => t.includes('transform="rotate(')));
  check('standard labels: Arial with metrically compatible Linux fallback',
    svg.includes("font-family=\"Arial,'Liberation Sans',Helvetica,sans-serif\""));
  const angles = texts.map(t => parseFloat(t.match(/rotate\((-?[\d.]+)/)?.[1]));
  check('straight street: angle ≈ 0°', angles.every(a => Math.abs(a) < 2), `${angles}`);
  check('straight street: lints clean', lintFragment(svg).errors.length === 0, lintFragment(svg).errors[0]);
}

// A print floor must not erase the style hierarchy. The smaller residential
// style is allowed to hit 9pt, while a motorway remains visibly larger, in
// both the standards-based and Illustrator numeric-unit profiles.
{
  const standardSmall = fontSizesOf(run([horiz(1, 'Kleine Straat', 0.35, 0.05, 0.95, 'residential')]));
  const standardLarge = fontSizesOf(run([horiz(2, 'Grote Baan', 0.65, 0.05, 0.95, 'motorway')]));
  const illustratorSmall = fontSizesOf(runFormat([horiz(1, 'Kleine Straat', 0.35, 0.05, 0.95, 'residential')], true));
  const illustratorLarge = fontSizesOf(runFormat([horiz(2, 'Grote Baan', 0.65, 0.05, 0.95, 'motorway')], true));
  check('standard SVG: residential labels respect the 9pt floor',
    standardSmall.length > 0 && standardSmall.every(size => size >= X.MIN_LABEL_PX - 0.1));
  check('standard SVG: label styles remain size-differentiated',
    standardSmall.length > 0 && standardLarge.length > 0 && Math.min(...standardLarge) > Math.max(...standardSmall));
  check('Illustrator SVG: residential labels respect the 9pt floor',
    illustratorSmall.length > 0 && illustratorSmall.every(size => size >= X.MIN_LABEL_ILLUSTRATOR_PX - 0.1));
  check('Illustrator SVG: label styles remain size-differentiated',
    illustratorSmall.length > 0 && illustratorLarge.length > 0 && Math.min(...illustratorLarge) > Math.max(...illustratorSmall));
}

// B. repeat distance: a full-width street repeats its name, spaced apart
{
  const svg = run([horiz(1, 'Lange Laan', 0.5, 0.01, 0.99)]);
  const xs = textsOf(svg).map(t => parseFloat(t.match(/ x="(-?[\d.]+)"/)?.[1])).filter(Number.isFinite);
  check('long street: repeats its label', xs.length >= 2, `${xs.length} labels`);
  const spacing = X.LABEL_STYLES.residential.spacing * (W / 4961);
  let minGap = Infinity;
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) minGap = Math.min(minGap, Math.abs(xs[i] - xs[j]));
  check('long street: repeats ≥ 0.8×spacing apart', minGap >= spacing * 0.8 - 1, `minGap=${minGap.toFixed(0)} spacing=${spacing.toFixed(0)}`);
}

// C. curved street → textPath riding its own oriented baseline.
// The arc must bend > STRAIGHT_BEND (12°) over the LABEL's span, not just
// overall — a first draft of this test used a huge gentle quarter-circle and
// the engine (correctly) picked a straight stretch. So: a tight ~60° arc only
// slightly longer than the label itself, leaving no straight spot to prefer.
const tightArc = (reversed) => {
  const coords = [];
  const rM = 130, cLat = 51.005, cLon = 5.008; // 130 m radius, 60° arc ≈ 136 m
  for (let k = 0; k <= 16; k++) {
    const t = (-30 + 60 * k / 16) * Math.PI / 180;
    coords.push([cLat + rM * Math.cos(t) / 111320 - rM / 111320, cLon + rM * Math.sin(t) / (111320 * Math.cos(cLat * Math.PI / 180))]);
  }
  return reversed ? coords.reverse() : coords;
};

const parsePolylineD = d => [...d.matchAll(/[ML]\s*(-?[\d.]+)[,\s](-?[\d.]+)/g)].map(m => [+m[1], +m[2]]);
const distanceToPolyline = (p, pts) => {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1], [x2, y2] = pts[i];
    const dx = x2 - x1, dy = y2 - y1, ll = dx * dx + dy * dy;
    const t = ll ? Math.max(0, Math.min(1, ((p[0] - x1) * dx + (p[1] - y1) * dy) / ll)) : 0;
    best = Math.min(best, Math.hypot(p[0] - (x1 + dx * t), p[1] - (y1 + dy * t)));
  }
  return best;
};
const curvedBandWithinSource = (svg, sourceCoords, roadFillW = 30) => {
  const path = svg.match(/<path id="lp\d+"[^>]*\bd="([^"]+)"/);
  const fs = +(svg.match(/font-size="([\d.]+)"/)?.[1] || 0);
  if (!path || !fs) return { ok: false, worst: Infinity };
  const baseline = parsePolylineD(path[1]);
  const source = sourceCoords.map(([lat, lon]) => pr(lat, lon));
  const top = baseline.map((p, i) => {
    const p0 = baseline[Math.max(0, i - 1)], p1 = baseline[Math.min(baseline.length - 1, i + 1)];
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], length = Math.hypot(dx, dy) || 1;
    return [p[0] + dy / length * 0.72 * fs, p[1] - dx / length * 0.72 * fs];
  });
  const samples = [];
  for (const line of [baseline, top]) for (let i = 1; i < line.length; i++) {
    const [x1, y1] = line[i - 1], [x2, y2] = line[i];
    const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / Math.max(1, fs * 0.25)));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      samples.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]);
    }
  }
  const worst = Math.max(...samples.map(p => distanceToPolyline(p, source)));
  const sf = W / 4961;
  const allowed = roadFillW * sf / 2 - Math.max(0.75, 3 * sf) + 0.25;
  return { ok: worst <= allowed, worst, allowed };
};
{
  const svg = run([way(1, tightArc(false), { name: 'Bochtige Straat', highway: 'residential' })]);
  check('curved street: uses textPath', svg.includes('<textPath'), svg.slice(0, 300));
  const l = lintFragment(svg);
  check('curved street: baseline oriented + lints clean', l.errors.length === 0, l.errors[0]);
  const band = curvedBandWithinSource(svg, tightArc(false));
  check('curved street: baseline and cap band stay inside its own road with margin', band.ok,
    `worst=${band.worst.toFixed(2)} allowed=${band.allowed.toFixed(2)}`);

  const illustrator = runFormat([way(2, tightArc(false), { name: 'Bochtige Straat', highway: 'residential' })], true);
  check('Illustrator curved street: safe editable glyphs, no textPath',
    illustrator.includes('lbl_Bochtige_Straat') && !illustrator.includes('<textPath'));
}

// D. the same curve drawn in reverse must NOT mirror the label — emitPath
// builds each label its own reading-oriented sub-path, which svg-lint verifies
{
  const svg = run([way(1, tightArc(true), { name: 'Bochtige Straat', highway: 'residential' })]);
  const l = lintFragment(svg);
  check('reversed curve: still textPath, no mirrored baseline', svg.includes('<textPath') && l.errors.length === 0, l.errors[0] || svg.slice(0, 300));
}

// E. same-name suppression is DISTANCE-based (nearName), not one-per-street:
// two short parallel carriageways yield one label; on long ones every pair of
// same-name placements keeps ≥ nameGap distance (that's the engine's actual
// contract — a long divided road legitimately repeats its name).
{
  // runs must be SHORTER than nameGap (~171 px here) so no second placement
  // can ever be far enough from the first — that's the suppression contract
  const short = run([
    horiz(1, 'Dubbelbaan', 0.500, 0.44, 0.50), // ~120 px
    horiz(2, 'Dubbelbaan', 0.505, 0.44, 0.50), // ~5 px away at this scale
  ]);
  const n = (short.match(/DUBBELBAAN/g) || []).length;
  check('short parallel carriageways: same name placed once', n === 1, `${n} placements`);

  const long = run([
    horiz(1, 'Dubbelbaan', 0.500, 0.05, 0.95),
    horiz(2, 'Dubbelbaan', 0.505, 0.05, 0.95),
  ]);
  const pos = [...long.matchAll(/<text [^>]*x="(-?[\d.]+)" y="(-?[\d.]+)"/g)].map(m => [+m[1], +m[2]]);
  const nameGap = X.LABEL_STYLES.residential.spacing * (W / 4961) * 0.85;
  let minD = Infinity;
  for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) minD = Math.min(minD, Math.hypot(pos[i][0] - pos[j][0], pos[i][1] - pos[j][1]));
  check('long parallel carriageways: all repeats ≥ nameGap apart', pos.length >= 2 && minD >= nameGap - 1, `n=${pos.length} minD=${minD.toFixed(0)} gap=${nameGap.toFixed(0)}`);
}

// F. street shorter than the 25 m gate → no label
{
  const lat = 51.005;
  // 5.001 → 5.0012 is ~14 m of longitude at 51°N, under the 25 m gate
  const svg = run([way(1, [[lat, 5.001], [lat, 5.0012]], { name: 'Stompje', highway: 'residential' })]);
  check('sub-25m street: no label', !svg.includes('STOMPJE'), svg.slice(0, 200));
}

// G. roundabout ring → labelled once, on the ring or centred, never crashes
{
  const coords = [];
  for (let k = 0; k <= 24; k++) {
    const t = k / 24 * 2 * Math.PI;
    coords.push([51.005 + 0.0012 * Math.sin(t), 5.016 + 0.0019 * Math.cos(t)]);
  }
  const svg = run([way(1, coords, { name: 'Rond Punt', highway: 'residential', junction: 'roundabout' })]);
  const n = (svg.match(/ROND PUNT/g) || []).length;
  check('roundabout: exactly one label', n === 1, `${n} placements`);
  check('roundabout: lints clean', lintFragment(svg).errors.length === 0);
}

// H. closed pedestrian way with area=yes → square: one HORIZONTAL label
{
  const svg = run([way(1, [[51.004, 5.010], [51.004, 5.013], [51.006, 5.013], [51.006, 5.010], [51.004, 5.010]], { name: 'Groot Plein', highway: 'pedestrian', area: 'yes' })]);
  const texts = textsOf(svg);
  check('square: one label', texts.length === 1 && svg.includes('GROOT PLEIN'), `${texts.length}`);
  check('square: horizontal (no rotate, no textPath)', texts.length === 1 && !texts[0].includes('rotate(') && !svg.includes('<textPath'));
}

// J. junction margin: label text stays clear of the run's ends (endPad),
// so a name can't bleed onto a crossing street (defect report 2026-07-04)
{
  const svg = run([horiz(1, 'Randweg', 0.5, 0.05, 0.95)]);
  const sf = W / 4961;
  const endPad = ((30 + 12) * sf) / 2 + 4 * sf; // residential fillW+casingW
  const x0 = 0.05 * W, x1 = 0.95 * W;
  const els = [...svg.matchAll(/<text [^>]*font-size="([\d.]+)"[^>]*x="(-?[\d.]+)"[^>]*>([^<]+)</g)];
  const ok_ = els.length > 0 && els.every(m => {
    const lw = X.approxTextWidth(m[3], +m[1], +m[1] * 0.08);
    return +m[2] - lw / 2 >= x0 + endPad - 2 && +m[2] + lw / 2 <= x1 - endPad + 2;
  });
  check('junction margin: no label reaches the run ends', ok_, `${els.length} labels`);
}

// K. vertical centring is baked into geometry: baseline y = rotation-anchor
// y + 0.36·fs, and no dominant-baseline attribute anywhere (QuickLook and
// Illustrator ignore it — the "name sits on/above its street" defect)
{
  const svg = run([horiz(1, 'Bakstraat', 0.5, 0.2, 0.8)]);
  const els = [...svg.matchAll(/font-size="([\d.]+)"[^>]*rotate\((-?[\d.]+) (-?[\d.]+) (-?[\d.]+)\)[^>]*x="(-?[\d.]+)" y="(-?[\d.]+)"/g)];
  const ok_ = els.length > 0 && els.every(m => Math.abs((+m[6] - +m[4]) - 0.36 * +m[1]) < 0.06);
  check('baked baseline: y = anchor + 0.36×font-size', ok_, els.map(m => (+m[6] - +m[4]).toFixed(2)).join(','));
  check('no dominant-baseline attribute emitted', !svg.includes('dominant-baseline'));
}

// L/M. chord placement vs textPath fallback at a kink mid-label. Street
// sized so EVERY candidate span includes the kink. At the new 9pt floor a
// short run may need a road-following textPath even for a gentle kink; that is
// preferable to shrinking below the readable floor. A sharper kink must also
// use the same safe fallback.
{
  const kinkStreet = (id, name, kinkDeg) => {
    const lat0 = 51.003, lon0 = 5.006, mLon = 111320 * Math.cos(lat0 * Math.PI / 180);
    const legM = 66.5; // ≈60 px per leg at this scale
    const t = kinkDeg * Math.PI / 180;
    return way(id, [
      [lat0, lon0],
      [lat0, lon0 + legM / mLon],
      [lat0 - legM * Math.sin(t) / 111320, lon0 + (legM + legM * Math.cos(t)) / mLon],
    ], { name, highway: 'residential' });
  };
 const gentle = run([kinkStreet(1, 'Knikkerstraat', 4)]);
  const gentleSize = +(gentle.match(/font-size="([\d.]+)"/)?.[1] || 0);
  check('4° kink: keeps a readable label with a safe fallback',
    gentleSize >= X.MIN_LABEL_PX - 0.1 && /KNIK/.test(gentle) && (gentle.includes('<textPath') || /<text [^>]*>[^<]+<\/text>/.test(gentle)),
    gentle.slice(-250));
  const sharp = run([kinkStreet(1, 'Knikkerstraat', 12)]);
  const sharpWay = kinkStreet(2, 'Knikkerstraat', 12);
  const sharpBand = sharp.includes('<textPath')
    ? curvedBandWithinSource(sharp, sharpWay.geometry.map(g => [g.lat, g.lon])).ok
    : true;
  check('12° kink: unsafe curve is rejected rather than draped onto another path',
    sharpBand && (!sharp.includes('<textPath') || sharp.includes('KNIKKERSTRAAT')),
    sharp.includes('<textPath') ? sharp.slice(0, 250) : 'no unsafe curved label emitted');
  check('12° kink: lints clean', lintFragment(sharp).errors.length === 0);
}

// N. canvas policy: a street crossing the canvas edge keeps a fully visible
// label on its inside portion (the old engine burned the same-name budget on
// invisible off-canvas placements); clipped repeats may only exist on top of
// a fully visible one.
{
  // lonFrac 0.3 → 1.6: ~40% of the run lies beyond the east canvas edge
  const svg = run([horiz(1, 'Grensweg', 0.5, 0.3, 1.6)]);
  const l = lintFragment(svg);
  check('edge-crossing street: labelled, with a fully visible label', svg.includes('GRENSWEG') && l.errors.length === 0, l.errors[0] || svg.slice(0, 150));
}
// O. street entirely outside the canvas → no label at all
{
  const svg = run([horiz(1, 'Spookstraat', 0.5, 1.2, 1.9)]);
  check('fully off-canvas street: no label', !svg.includes('SPOOKSTRAAT'), svg.slice(0, 150));
}
// P. sliver street barely poking into the canvas, no inside spot fits →
// no label at all (never a clipped-only one)
{
  const svg = run([horiz(1, 'Sliertje', 0.5, 0.97, 1.5)]);
  const l = lintFragment(svg);
  check('sliver at the border: no clipped-only label', l.errors.length === 0, l.errors[0]);
}
// Q. feature labels claim space first; a street label on the same spot dodges
{
  const grid = X.makeFootprintGrid();
  const lakeNode = { type: 'node', id: 9, lat: 51.005, lon: 5.016, tags: { name: 'Middenmeer', natural: 'water' } };
  const feat = X.buildFeatureLabelsLayer([lakeNode], pr, W, H, grid);
  const street = X.buildLabelsLayer([horiz(1, 'Meerkade', 0.5, 0.35, 0.65)], pr, W, H, grid);
  check('feature label placed', feat.includes('Middenmeer'), feat.slice(0, 150));
  const l = lintFragment(feat + street);
  const overlap = l.errors.filter(e => e.includes('overlaps'));
  check('street label dodges the feature label', overlap.length === 0, overlap[0]);
}
// R. feature label at the canvas edge → skipped (single-placement family)
{
  const grid = X.makeFootprintGrid();
  const edgeLake = { type: 'node', id: 9, lat: 51.005, lon: BBOX.east, tags: { name: 'Randmeer', natural: 'water' } };
  const feat = X.buildFeatureLabelsLayer([edgeLake], pr, W, H, grid);
  check('feature label at the edge: skipped', !feat.includes('Randmeer'), feat.slice(0, 150));
}
// S. rail corridor stamped into the shared grid → street label moves off it
{
  const grid = X.makeFootprintGrid();
  const lat = BBOX.south + (BBOX.north - BBOX.south) * 0.5;
  // vertical rail line crossing the street's midpoint
  const railPts = [pr(BBOX.south + 0.002, 5.016), pr(BBOX.north - 0.002, 5.016)];
  X.stampPolyline(grid, railPts, 8 * (W / 4961));
  const svg = X.buildLabelsLayer([horiz(1, 'Spoorstraat', 0.5, 0.35, 0.65)], pr, W, H, grid);
  const els = [...svg.matchAll(/x="(-?[\d.]+)" y="(-?[\d.]+)"/g)].map(m => [+m[1], +m[2]]);
  const railX = pr(lat, 5.016)[0];
  const clear = els.every(([x]) => Math.abs(x - railX) > 10);
  check('street label stays off the rail corridor', svg.includes('SPOORSTRAAT') ? clear : true, `label x=${els.map(e => e[0])} rail x=${railX.toFixed(0)}`);
}
// T. dwarf-repeat suppression (the Roggestraat case): once a street has a
// full-size label, a second short run of the same name must not carry a
// far-smaller repeat — it stays unlabelled instead.
{
  const svg = run([
    horiz(1, 'Roggeweg', 0.50, 0.05, 0.95),        // long main run
    horiz(2, 'Roggeweg', 0.60, 0.05, 0.14),        // short disconnected stub
  ]);
  const sizes = [...svg.matchAll(/font-size="([\d.]+)"/g)].map(m => +m[1]);
  const minSz = Math.min(...sizes), maxSz = Math.max(...sizes);
  check('no dwarf repeat: all same-name labels ≥ 75% of the largest', sizes.length >= 1 && minSz >= maxSz * 0.75 - 0.01, `sizes=${sizes}`);
}
// U. a label is never draped over a sharp corner (maxTurn gate) — an
// L-shaped street gets its label on a straight leg, not around the bend.
{
  const lat0 = 51.003, lon0 = 5.020, mLat = 111320, mLon = 111320 * Math.cos(lat0 * Math.PI / 180);
  const legM = 90;
  const L = way(1, [
    [lat0, lon0], [lat0, lon0 + legM / mLon], [lat0 + legM / mLat, lon0 + legM / mLon],
  ], { name: 'Hoekstraat', highway: 'residential' });
  const svg = run([L]);
  check('L-street: labelled on a straight leg with readable abbreviation',
    svg.includes('HOEKSTR.') && !svg.includes('<textPath'), svg.slice(0, 250));
}

// A maximum-curve fallback may follow a smooth bend, but never a hairpin or
// junction corner. The label may move to a straight leg or disappear; it must
// not become a textPath that drapes over the sharp return.
{
  const lat0 = 51.004, lon0 = 5.011, mLat = 111320, mLon = 111320 * Math.cos(lat0 * Math.PI / 180);
  const hairpin = way(2, [
    [lat0, lon0],
    [lat0, lon0 + 130 / mLon],
    [lat0 + 18 / mLat, lon0 + 130 / mLon],
    [lat0 + 18 / mLat, lon0 + 12 / mLon],
  ], { name: 'Haarspeldweg', highway: 'residential' });
  const svg = run([hairpin]);
  check('sharp hairpin: never uses a textPath across the corner',
    !svg.includes('<textPath') && lintFragment(svg).errors.length === 0,
    lintFragment(svg).errors[0] || svg.slice(0, 250));
}

// V. An official abbreviation may be used, but the engine must never invent a
// vowel-less, clipped or initial-only name when even that sanctioned form does
// not fit above the readable floor. Such a street is left unlabeled instead.
{
  const short = (id, name, latFrac) => horiz(id, name, latFrac, 0.25, 0.28);
  const svg = run([
    short(1, 'Wormser Straße', 0.20),
    short(2, 'Friedrich-Ebert-Straße', 0.50),
    short(3, 'Ramsauerstraße', 0.80),
  ]);
  check('too-short named streets: no invented initials or vowel-stripped labels',
    !/>(?:W\. S\.|F\.|RMSRSTR\.)</.test(svg), svg.match(/>(?:W\. S\.|F\.|RMSRSTR\.)</)?.[0] || '');
}

// W. Explicit priority and continuous size optimisation. Full text at the
// road-type standard wins; if it cannot fit, a sanctioned abbreviation may
// win at standard size before the full name is made smaller. When the full
// name does get smaller, the chosen size is the largest feasible value in the
// interval, not one of the old ×0.8 stepping values.
{
  const fullStandard = run([horiz(1, 'Wormser Straße', 0.20, 0.455, 0.545, 'primary')]);
  const fullStandardSize = +(fullStandard.match(/font-size="([\d.]+)"/)?.[1] || 0);
  check('priority: full name uses standard size when it fits',
    fullStandard.includes('WORMSER STRASSE') && !fullStandard.includes('WORMSER STR.') && fullStandardSize > X.MIN_LABEL_PX);

  const abbreviationStandard = run([horiz(2, 'Wormser Straße', 0.35, 0.46, 0.54, 'primary')]);
  const abbreviationSize = +(abbreviationStandard.match(/font-size="([\d.]+)"/)?.[1] || 0);
  check('priority: official abbreviation may use standard size before shrinking full text',
    abbreviationStandard.includes('WORMSER STR.') && !abbreviationStandard.includes('WORMSER STRASSE') && Math.abs(abbreviationSize - fullStandardSize) < 0.2);

  const optimised = run([horiz(3, 'Wormser Straße', 0.50, 0.465, 0.535, 'primary')]);
  const optimisedSize = +(optimised.match(/font-size="([\d.]+)"/)?.[1] || 0);
  check('priority: full name is preferred over abbreviation at a smaller optimal size',
    optimised.includes('WORMSER STRASSE') && !optimised.includes('WORMSER STR.') && optimisedSize > X.MIN_LABEL_PX + 0.2 && optimisedSize < fullStandardSize - 0.2);
  check('priority: smaller size is continuously optimised, not a fixed shrink step',
    Math.abs(optimisedSize - fullStandardSize * 0.8) > 0.1 && Math.abs(optimisedSize - X.MIN_LABEL_PX) > 0.1);
}

// I. label ids unique across a busy scene
{
  const svg = run([
    horiz(1, 'Lange Laan', 0.2, 0.01, 0.99),
    horiz(2, 'Middenweg', 0.5, 0.1, 0.9),
    horiz(3, 'Zuidkade', 0.8, 0.1, 0.9),
  ]);
  const ids = [...svg.matchAll(/<text id="([^"]+)"/g)].map(m => m[1]);
  check('busy scene: label ids unique', new Set(ids).size === ids.length, `${ids.length} ids, ${new Set(ids).size} unique`);
  check('busy scene: lints clean', lintFragment(svg).errors.length === 0);
}

console.log(`\nlabel-placement: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
