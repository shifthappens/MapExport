// tests/coverage-lint.mjs — catches the class of bug behind both Erfurt
// white-island incidents: land inside the bbox that no layer paints, so the
// bare page background (preset.bg) shows through instead of a city block,
// water fill, or green cover.
//
// Independent of *why* a gap happens — the winding-vs-hole-ring bug fixed in
// script.js on 2026-07-09 is one cause, but this check would just as well
// catch a future bug in a different layer's void logic. It works by
// rasterising every filled shape (city blocks, water/park areas) and every
// stroked line (roads that cut blocks, waterways, rail) onto a coverage
// grid, then reporting any grid cell inside the bbox that nothing touched.
//
// Usage (see tests/real-export.mjs): call checkCoverage() with the same
// `results` (post prepareBlockData, so pruneIslandGreens has already run),
// the `data` returned by prepareBlockData (lines/areas), the final `blocks`
// list, and the projector/bbox/W/H used for the export.

// Ray-cast evenodd test across one or more rings treated as a single shape
// (a feature's outer ring(s) plus its own holes) — same rule <path
// fill-rule="evenodd"> uses for a multi-subpath "d".
function evenOddInside(x, y, rings) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// Parse the "M x,y L x,y ... Z" strings the block worker emits (see toD() in
// BLOCK_WORKER_SRC) back into a point ring. No curves in block paths.
function parseBlockPath(d) {
  const nums = d.match(/-?\d+(?:\.\d+)?/g);
  if (!nums) return [];
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([+nums[i], +nums[i + 1]]);
  return pts;
}

// Inverse of makeProjector's pr(lat,lng) — for turning a failing grid cell
// back into a lat/lon a human can look up.
function makeInverseProjector(bbox, W, H) {
  const [xMin, yMin] = [bbox.west * Math.PI / 180, Math.log(Math.tan(Math.PI / 4 + (bbox.south * Math.PI / 180) / 2))];
  const [xMax] = [bbox.east * Math.PI / 180];
  const scale = W / (xMax - xMin);
  return (px, py) => {
    const mx = xMin + px / scale;
    const my = yMin + (H - py) / scale;
    const lng = mx * 180 / Math.PI;
    const lat = (2 * Math.atan(Math.exp(my)) - Math.PI / 2) * 180 / Math.PI;
    return [lat, lng];
  };
}

// results: post prepareBlockData (island-green pruning already applied)
// data: { lines, areas, waterPolys, waterHoles, W, H } from prepareBlockData
// blocks: [{ outer, holes }] from the block worker
// countrysideCovers: v1 leaves countryside faces unpainted by design (landcover
// is assumed to be the map there), so its placeholders count as covered. v2
// paints the countryside remainder cream via the fallback pass, so its
// placeholders must NOT count — coverage has to be proven by real paint.
export function checkCoverage({ X, results, data, blocks, bbox, W, H, pr, countrysideCovers = true }) {
  const step = Math.max(6, Math.round(W / 320));
  const cols = Math.ceil(W / step), rows = Math.ceil(H / step);
  const covered = new Uint8Array(cols * rows);
  const inv = makeInverseProjector(bbox, W, H);

  function markShape(rings, padding = 0) {
    if (!rings.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const r of rings) for (const [x, y] of r) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    const c0 = Math.max(0, Math.floor((minX - padding) / step));
    const c1 = Math.min(cols - 1, Math.ceil((maxX + padding) / step));
    const r0 = Math.max(0, Math.floor((minY - padding) / step));
    const r1 = Math.min(rows - 1, Math.ceil((maxY + padding) / step));
    for (let ry = r0; ry <= r1; ry++) {
      const py = ry * step + step / 2;
      for (let cx = c0; cx <= c1; cx++) {
        const idx = ry * cols + cx;
        if (covered[idx]) continue;
        const px = cx * step + step / 2;
        if (evenOddInside(px, py, rings)) covered[idx] = 1;
      }
    }
  }

  function markLine(pts, halfW) {
    for (let i = 1; i < pts.length; i++) {
      const [x1, y1] = pts[i - 1], [x2, y2] = pts[i];
      const c0 = Math.max(0, Math.floor((Math.min(x1, x2) - halfW) / step));
      const c1 = Math.min(cols - 1, Math.ceil((Math.max(x1, x2) + halfW) / step));
      const r0 = Math.max(0, Math.floor((Math.min(y1, y2) - halfW) / step));
      const r1 = Math.min(rows - 1, Math.ceil((Math.max(y1, y2) + halfW) / step));
      for (let ry = r0; ry <= r1; ry++) {
        const py = ry * step + step / 2;
        for (let cx = c0; cx <= c1; cx++) {
          const idx = ry * cols + cx;
          if (covered[idx]) continue;
          const px = cx * step + step / 2;
          if (distToSegment(px, py, x1, y1, x2, y2) <= halfW) covered[idx] = 1;
        }
      }
    }
  }

  // 1. City blocks — each is its own evenodd shape (outer + its holes).
  for (const blk of blocks) {
    if (blk.kind === 'countryside' && !countrysideCovers) continue; // unpainted placeholder
    const rings = [parseBlockPath(blk.outer), ...blk.holes.map(parseBlockPath)].filter(r => r.length >= 3);
    markShape(rings);
  }

  // 2. Water/park/landcover areas — re-derive per feature (not the flattened
  //    `data.areas` list) so each relation's outer+inner rings are tested
  //    together as one evenodd shape, exactly like the <path> the renderer
  //    emits for it. landcover is included because v2 subtracts it from the
  //    coverage fallback (a buildingless face over farmland shows landcover,
  //    not cream), so it must count as painted land; it also paints in v1's
  //    countryside faces, so marking it there is correct too. parks_recreation
  //    (v2-only, AF-03b) subtracts from blocks/fallback exactly like parks, so
  //    its paint must count as covered land the same way.
  for (const { layer, data: rdata } of results) {
    if (layer.id !== 'water_bodies' && layer.id !== 'parks' && layer.id !== 'parks_recreation' && layer.id !== 'landcover') continue;
    for (const el of rdata.elements) {
      // Green-remainder merge (engine-v2 doExportV2 / real-export): a landcover
      // element is grown to (element ∪ the green-open coverage remainder it lies
      // in), and renderLandcover paints THAT grown shape via el._mergedRings —
      // rings already in projected px at the void tolerance. Mark exactly what
      // the renderer paints, or the grown-only band reads as a false
      // unpainted-land gap while the SVG covers it (a model-vs-paint
      // disagreement, ENGINE-V2.md §1: the paint is authoritative). The grown
      // rings are a superset of the element's own geometry, so this replaces —
      // not supplements — the raw-geometry marking below.
      if (el._mergedRings) {
        markShape(el._mergedRings.filter(r => r.length >= 3));
        continue;
      }
      let outer, inner;
      if (el.type === 'way' && el.geometry?.length >= 3) { outer = [el.geometry]; inner = []; }
      else if (el.type === 'relation' && el.members) {
        const r = X.stitchMultipolygonRings(el.members);
        outer = r.outer; inner = r.inner;
      } else continue;
      const rings = [...outer, ...inner]
        .filter(ring => ring.length >= 3)
        .map(ring => ring.map(g => pr(g.lat, g.lon)));
      markShape(rings);
    }
  }

  // 3. Stroked lines that actually cut blocks (roads/waterways/rail) — same
  //    geometry+halfW the block cutter voided, so it's the same width the
  //    renderer paints.
  for (const { pts, halfW } of data.lines) markLine(pts, halfW);

  const failures = [];
  const margin = 1; // skip the outermost ring of cells — bbox-edge rounding, not a real gap
  for (let ry = margin; ry < rows - margin; ry++) {
    for (let cx = margin; cx < cols - margin; cx++) {
      if (covered[ry * cols + cx]) continue;
      const px = cx * step + step / 2, py = ry * step + step / 2;
      const [lat, lng] = inv(px, py);
      failures.push({ px, py, lat, lng });
    }
  }

  // Collapse adjacent failing cells into blobs (one report per contiguous
  // gap, not one per cell) via a simple flood-fill over the failure set.
  const failSet = new Set(failures.map(f => `${Math.round(f.px / step)},${Math.round(f.py / step)}`));
  const visited = new Set();
  const blobs = [];
  for (const f of failures) {
    const key = `${Math.round(f.px / step)},${Math.round(f.py / step)}`;
    if (visited.has(key)) continue;
    const stack = [[Math.round(f.px / step), Math.round(f.py / step)]];
    let count = 0, sx = 0, sy = 0;
    while (stack.length) {
      const [gx, gy] = stack.pop();
      const k = `${gx},${gy}`;
      if (visited.has(k) || !failSet.has(k)) continue;
      visited.add(k);
      count++; sx += gx; sy += gy;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) stack.push([gx + dx, gy + dy]);
    }
    const cx = (sx / count) * step + step / 2, cy = (sy / count) * step + step / 2;
    const [lat, lng] = inv(cx, cy);
    blobs.push({ cells: count, px: cx, py: cy, lat, lng });
  }
  blobs.sort((a, b) => b.cells - a.cells);

  return { step, cols, rows, gapCells: failures.length, blobs };
}
