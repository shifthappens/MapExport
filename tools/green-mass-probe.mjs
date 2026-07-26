// Calibration probe for the AF-07f green rule — NOT a test, not loaded by the
// app, and NOT the rule that shipped. It measures how THICK nameless green
// reads on the printed plate; Coen rejected that measure on 2026-07-26 ("no
// rings") in favour of area per dissolved mass, which lives in engine-v2.js
// (GREEN_MASS_MIN_M2 / GREEN_MASS_BRIDGE_M). Kept because the AF-07e and
// AF-07f refutations rest on its numbers.
//
//   node tools/green-mass-probe.mjs <cache.json.gz> <south> <west> <north> <east>
//   TARGETS=<osmId>,<osmId> node tools/green-mass-probe.mjs ...   # locate specific ways
//
// Method: rasterise every nameless green candidate onto a page-scale grid
// (0.5 mm cells, fixed at the Tilburg plate's 4.67 m/mm so numbers compare
// across bboxes), find connected components, then erode each one step by step —
// the erosions it survives are its largest inscribed disc.
//
// The "closing" loop documents a rejected idea: gluing near-touching pieces with
// a buffer destroys the distinction between a multi-polygon park and a street
// full of verges. Only the 0 mm row is adjacency alone.
import zlib from 'node:zlib';
import fs from 'node:fs';

const [CACHE, S, WW, N, E] = process.argv.slice(2);
const els = JSON.parse(zlib.gunzipSync(fs.readFileSync(CACHE))).elements;

// Real Tilburg export geometry: 5249 px = 444.4 mm across 51.545,5.07→51.562,5.10.
const BBOX = { south: +S, west: +WW, north: +N, east: +E };
// Same ground-per-millimetre as the Tilburg validation plate, so the numbers
// are directly comparable across bboxes.
const PAGE_MM_W = ((+E - +WW) * 111320 * Math.cos(((+N + +S) / 2) * Math.PI / 180)) / 4.6707;
const MM_PER_CELL = 0.5;
const midLat = (BBOX.north + BBOX.south) / 2;
const groundW = (BBOX.east - BBOX.west) * 111320 * Math.cos(midLat * Math.PI / 180);
const groundH = (BBOX.north - BBOX.south) * 110540;
const M_PER_MM = groundW / PAGE_MM_W;
const W = Math.round(PAGE_MM_W / MM_PER_CELL);
const H = Math.round((groundH / M_PER_MM) / MM_PER_CELL);
console.log(`page ${PAGE_MM_W.toFixed(0)}×${(groundH / M_PER_MM).toFixed(0)} mm | 1 mm = ${M_PER_MM.toFixed(2)} m | grid ${W}×${H} @ ${MM_PER_CELL} mm`);

const toCell = (lat, lon) => [
  ((lon - BBOX.west) / (BBOX.east - BBOX.west)) * W,
  ((BBOX.north - lat) / (BBOX.north - BBOX.south)) * H,
];

// ── candidate sets ────────────────────────────────────────────────
const named = (t) => !!t.name;
const KINDS = {
  park_unnamed: (t) => t.leisure === 'park' && !named(t),
  grass: (t) => /^(grass|village_green)$/.test(t.landuse || ''),
  garden_unnamed: (t) => t.leisure === 'garden' && !named(t),
  scrubheath: (t) => /^(scrub|heath)$/.test(t.natural || '') || t.natural === 'wetland',
  countryside: (t) => (/^(farmland|meadow|forest)$/.test(t.landuse || '') || t.natural === 'wood') && !named(t),
  recreation: (t) => /^(golf_course|dog_park|sports_centre)$/.test(t.leisure || '') || t.landuse === 'allotments',
};
const closed = (e) => {
  if (e.type !== 'way' || !e.geometry || e.geometry.length < 4) return false;
  const a = e.geometry[0], z = e.geometry[e.geometry.length - 1];
  return Math.abs(a.lat - z.lat) < 1e-9 && Math.abs(a.lon - z.lon) < 1e-9;
};
const cands = [];
for (const e of els) {
  if (!closed(e)) continue;
  const t = e.tags || {};
  for (const [kind, fn] of Object.entries(KINDS)) {
    if (fn(t)) { cands.push({ id: e.id, kind, ring: e.geometry.map((g) => toCell(g.lat, g.lon)) }); break; }
  }
}
const byKind = {};
for (const c of cands) byKind[c.kind] = (byKind[c.kind] || 0) + 1;
console.log('candidates:', byKind, 'total', cands.length);

// ── rasterise (even-odd scanline) ─────────────────────────────────
const grid = new Uint8Array(W * H);
const owner = new Int32Array(W * H).fill(-1);
const fill = (ring, mark) => {
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of ring) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
  for (let py = Math.max(0, Math.floor(minY)); py <= Math.min(H - 1, Math.ceil(maxY)); py++) {
    const yc = py + 0.5, xs = [];
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
      if ((y1 <= yc) !== (y2 <= yc)) xs.push(x1 + ((yc - y1) / (y2 - y1)) * (x2 - x1));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let px = Math.max(0, Math.ceil(xs[k] - 0.5)); px <= Math.min(W - 1, Math.floor(xs[k + 1] - 0.5)); px++) {
        grid[py * W + px] = 1;
        if (owner[py * W + px] === -1) owner[py * W + px] = mark;
      }
    }
  }
};
cands.forEach((c, i) => fill(c.ring, i));
const raw = grid.reduce((a, b) => a + b, 0);
console.log(`raw green: ${(raw * MM_PER_CELL * MM_PER_CELL / 100).toFixed(0)} cm² of page (${(100 * raw / (W * H)).toFixed(1)}% of the plate)`);

// ── morphology helpers ────────────────────────────────────────────
const dilate = (src, r) => {
  let a = src;
  for (let s = 0; s < r; s++) {
    const b = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (a[i] || (x > 0 && a[i - 1]) || (x < W - 1 && a[i + 1]) || (y > 0 && a[i - W]) || (y < H - 1 && a[i + W])) b[i] = 1;
    }
    a = b;
  }
  return a;
};
const erode = (src, r) => {
  let a = src;
  for (let s = 0; s < r; s++) {
    const b = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (a[i] && (x > 0 && a[i - 1]) && (x < W - 1 && a[i + 1]) && (y > 0 && a[i - W]) && (y < H - 1 && a[i + W])) b[i] = 1;
    }
    a = b;
  }
  return a;
};

// ── per closing radius: components + thickness ────────────────────
for (const closeMm of [0, 2, 4]) {
  const r = Math.round(closeMm / MM_PER_CELL);
  const merged = r ? erode(dilate(grid, r), r) : grid;
  // connected components
  const lab = new Int32Array(W * H).fill(-1);
  const comps = [];
  for (let i = 0; i < W * H; i++) {
    if (!merged[i] || lab[i] !== -1) continue;
    const id = comps.length, stack = [i], cells = [];
    lab[i] = id;
    while (stack.length) {
      const j = stack.pop(); cells.push(j);
      const x = j % W, y = (j / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (merged[n] && lab[n] === -1) { lab[n] = id; stack.push(n); }
      }
    }
    comps.push(cells);
  }
  // thickness: how many erosion steps a component survives → inscribed disc ⌀
  const thick = new Int32Array(comps.length);
  let cur = merged;
  for (let step = 1; step <= 24; step++) {
    cur = erode(cur, 1);
    let any = false;
    for (let i = 0; i < W * H; i++) if (cur[i]) { any = true; if (lab[i] >= 0 && thick[lab[i]] < step) thick[lab[i]] = step; }
    if (!any) break;
  }
  const info = comps.map((cells, id) => ({
    id,
    mm2: cells.length * MM_PER_CELL * MM_PER_CELL,
    discMm: thick[id] * 2 * MM_PER_CELL,
    ids: [...new Set(cells.map((j) => owner[j]).filter((o) => o >= 0).map((o) => cands[o].id))],
  })).sort((a, b) => b.mm2 - a.mm2);

  console.log(`\n── closing ${closeMm} mm → ${comps.length} components`);
  for (const d of [0, 2, 3, 4, 6, 8]) {
    const keep = info.filter((c) => c.discMm >= d);
    const area = keep.reduce((a, c) => a + c.mm2, 0);
    console.log(`  disc ≥ ${d} mm: ${String(keep.length).padStart(4)} kept, ${(area / 100).toFixed(0).padStart(4)} cm² green (${(100 * area / (W * H * MM_PER_CELL * MM_PER_CELL)).toFixed(1)}% of plate)`);
  }
  console.log('  top 12 components (page mm², inscribed disc mm, #osm parts):');
  for (const c of info.slice(0, 12)) {
    console.log(`    ${String(Math.round(c.mm2)).padStart(6)} mm²  ⌀${c.discMm.toFixed(1).padStart(5)} mm  ${String(c.ids.length).padStart(3)} parts`);
  }
  for (const target of (process.env.TARGETS||'').split(',').filter(Boolean).map(Number)) {
    const c = info.find((x) => x.ids.includes(target));
    console.log(`  way/${target}: ${c ? `${Math.round(c.mm2)} mm², ⌀${c.discMm.toFixed(1)} mm, in a ${c.ids.length}-part component` : 'not found'}`);
  }
}
