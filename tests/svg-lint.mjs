// tests/svg-lint.mjs — deterministic sanity checks on an exported SVG.
//
// Objectifies the part of the visual check that doesn't need eyes (the class
// of defects the multi-city exports exist to catch): labels outside the
// canvas, upside-down rotation angles, textPath references to missing path
// ids, mirrored textPath baselines, empty labels, NaN/undefined leaking into
// attributes, and label-on-label overlap. The browser screenshot check stays,
// but as the LAST step instead of the only step (tests/README.md §6).
//
// Usage:
//   node tests/svg-lint.mjs [exports/<name>.svg]   # default: newest export
//
// Exit 0 = clean (warnings allowed), 1 = errors, 2 = could not lint.
// Also importable: lintSvg(svgText) -> { errors: [], warnings: [] }.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Same estimate the label engine uses (script.js approxTextWidth/fpR), so the
// lint footprints match what the collision engine actually stamped.
const approxTextWidth = (t, fs_, ls = 0) => t.length * (fs_ * 0.65 + ls);
const fpR = fs_ => fs_ * 0.62 + Math.max(3, fs_ * 0.22);

function parseAttrs(tag) {
  const attrs = {};
  for (const m of tag.matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[m[1]] = m[2];
  return attrs;
}

// Parse a label-engine path `d` ("Mx,y Lx,y ..." — absolute M/L only).
function parsePathD(d) {
  const pts = [];
  for (const m of d.matchAll(/[ML]\s*(-?[\d.]+)[,\s](-?[\d.]+)/g)) pts.push([+m[1], +m[2]]);
  return pts;
}

function pathLen(pts) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return l;
}

// Sample n+1 evenly spaced points along a polyline.
function samplePath(pts, n) {
  const total = pathLen(pts);
  if (!total || pts.length < 2) return [...pts];
  const out = [];
  let seg = 1, acc = 0;
  for (let k = 0; k <= n; k++) {
    const target = total * k / n;
    while (seg < pts.length - 1) {
      const sl = Math.hypot(pts[seg][0] - pts[seg - 1][0], pts[seg][1] - pts[seg - 1][1]);
      if (acc + sl >= target) break;
      acc += sl; seg++;
    }
    const sl = Math.hypot(pts[seg][0] - pts[seg - 1][0], pts[seg][1] - pts[seg - 1][1]) || 1;
    const t = Math.min(1, Math.max(0, (target - acc) / sl));
    out.push([pts[seg - 1][0] + (pts[seg][0] - pts[seg - 1][0]) * t,
              pts[seg - 1][1] + (pts[seg][1] - pts[seg - 1][1]) * t]);
  }
  return out;
}

export function lintSvg(svg) {
  const errors = [], warnings = [];
  const err = s => errors.push(s);
  const warn = s => warnings.push(s);

  // ── canvas ──
  const vb = svg.match(/viewBox="([\d.\s-]+)"/);
  if (!vb) { err('no viewBox on root <svg>'); return { errors, warnings }; }
  const [vx, vy, vw, vh] = vb[1].trim().split(/\s+/).map(Number);
  const inCanvas = (x, y, m = 0) => x >= vx - m && x <= vx + vw + m && y >= vy - m && y <= vy + vh + m;

  // ── junk values in attributes (NaN from a bad projection, undefined from a
  //    missing field) — the single highest-value check: a run that produced
  //    these used to "pass" silently ──
  for (const m of svg.matchAll(/[\w:-]+="[^"]*\b(NaN|undefined|Infinity)\b[^"]*"/g)) {
    err(`attribute contains ${m[1]}: ${m[0].slice(0, 120)}`);
    if (errors.length > 20) { err('(more junk-value errors suppressed)'); break; }
  }

  // ── label-path defs referenced by textPath ──
  const pathDs = new Map(); // id -> pts
  for (const m of svg.matchAll(/<path id="(lp\d+)"[^>]*\bd="([^"]+)"/g)) pathDs.set(m[1], parsePathD(m[2]));

  // ── collect labels ──
  // Street labels: <text id="lbl_..."> either rotated straight text with x/y,
  // centred text (squares/small roundabouts), or a <textPath href="#lpN"> child.
  // Feature labels: <text id="feat_..."> (skip the _halo twin).
  const labels = []; // { id, kind: 'street'|'feature', fs, ls, text, footprint: [[x,y],...], r }
  const textRe = /<text ([^>]*)>([\s\S]*?)<\/text>/g;
  const usedPathIds = new Set();
  for (const m of svg.matchAll(textRe)) {
    const attrs = parseAttrs(m[1]);
    const id = attrs.id || '(no id)';
    const inner = m[2];
    const content = inner.replace(/<[^>]+>/g, '').trim();
    const isStreet = id.startsWith('lbl_');
    const isFeature = id.startsWith('feat_');
    if (!isStreet && !isFeature) continue;
    if (isFeature && id.endsWith('_halo')) continue;

    if (!content) { err(`${id}: empty label text`); continue; }
    const fs_ = parseFloat(attrs['font-size']);
    if (!(fs_ > 0)) { err(`${id}: missing/invalid font-size "${attrs['font-size']}"`); continue; }
    const ls = parseFloat(attrs['letter-spacing']) || 0;
    const lw = approxTextWidth(content, fs_, ls);
    const r = fpR(fs_);

    const tp = inner.match(/<textPath [^>]*(?:xlink:)?href="#([^"]+)"/);
    let footprint = null;
    let angle = null;

    if (tp) {
      // curved street label riding its own oriented baseline sub-path
      usedPathIds.add(tp[1]);
      const pts = pathDs.get(tp[1]);
      if (!pts) { err(`${id}: textPath references missing path #${tp[1]}`); continue; }
      if (pts.length < 2) { err(`${id}: baseline path #${tp[1]} has <2 points`); continue; }
      // Orientation rule from script.js subPath(): reversed unless the chord
      // reads left-to-right, or bottom-to-top when near-vertical. A violation
      // renders the label mirrored/upside-down.
      const dx = pts[pts.length - 1][0] - pts[0][0], dy = pts[pts.length - 1][1] - pts[0][1];
      if (dx < -0.5 || (dx <= 0.5 && dy > 0))
        err(`${id}: baseline #${tp[1]} oriented right-to-left/top-down (mirrored label)`);
      footprint = samplePath(pts, Math.max(2, Math.ceil(pathLen(pts) / r)));
    } else {
      const x = parseFloat(attrs.x), y = parseFloat(attrs.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) { err(`${id}: no x/y and no textPath`); continue; }
      const rot = (attrs.transform || '').match(/rotate\((-?[\d.]+)[ ,](-?[\d.]+)[ ,](-?[\d.]+)\)/);
      angle = rot ? parseFloat(rot[1]) : 0;
      // The engine normalises reading angles into [-90, 90] (angleAtMid /
      // pointAngleAtLength) — anything outside renders upside-down.
      if (angle < -90.05 || angle > 90.05) err(`${id}: rotation ${angle}° outside ±90° (upside-down text)`);
      const rad = angle * Math.PI / 180, ux = Math.cos(rad), uy = Math.sin(rad);
      const n = Math.max(2, Math.ceil(lw / r));
      footprint = [];
      for (let k = 0; k <= n; k++) {
        const t = k / n - 0.5;
        footprint.push([x + ux * lw * t, y + uy * lw * t]);
      }
    }

    // canvas containment. Both cases are warnings, not errors: the engine
    // legitimately places labels on road stretches that extend past the
    // export bbox (fully outside = invisible/wasted, partially = clipped by
    // #map-clip) — approved exports have ~20 of each. Tracked as an engine
    // improvement in tests/IMPROVEMENTS.md; flip to errors once fixed.
    const inside = footprint.filter(p => inCanvas(p[0], p[1], r)).length;
    if (inside === 0) warn(`${id}: label entirely outside the ${vw}×${vh} canvas (invisible)`);
    else if (inside < footprint.length) warn(`${id}: label partially outside the canvas (clipped)`);

    labels.push({ id, kind: isStreet ? 'street' : 'feature', fs: fs_, text: content, footprint, r });
  }

  // orphaned label-path defs (harmless but indicates emit/def drift)
  for (const pid of pathDs.keys()) if (!usedPathIds.has(pid)) warn(`path #${pid} in defs is unused by any textPath`);

  // ── label-on-label overlap ──
  // Street labels share one footprint collision grid at placement time, and
  // feature labels share another — so overlap inside either family is an
  // engine bug. Across the two families no collision check exists (by
  // design/limitation), so cross-family contact is only a warning.
  // Footprints are circle ribbons like the engine's, but resampled: the
  // engine guarantees ≥ r1+r2 between ITS samples, and ours can each sit up
  // to r/2 from the nearest engine sample — so legal adjacent placements can
  // measure down to 0.5×(r1+r2). Only closer than that is a genuine overlap.
  const cell = 120;
  const grid = new Map();
  const keyOf = (x, y) => Math.floor(x / cell) + '/' + Math.floor(y / cell);
  const reported = new Set();
  for (let li = 0; li < labels.length; li++) {
    const L = labels[li];
    for (const [x, y] of L.footprint) {
      for (let gx = Math.floor((x - L.r) / cell); gx <= Math.floor((x + L.r) / cell); gx++)
        for (let gy = Math.floor((y - L.r) / cell); gy <= Math.floor((y + L.r) / cell); gy++) {
          const arr = grid.get(gx + '/' + gy);
          if (!arr) continue;
          for (const [ox, oy, or_, oi] of arr) {
            if (oi === li) continue;
            const pairKey = Math.min(oi, li) + ':' + Math.max(oi, li);
            if (reported.has(pairKey)) continue;
            if (Math.hypot(x - ox, y - oy) < (L.r + or_) * 0.5) {
              reported.add(pairKey);
              const O = labels[oi];
              const msg = `${L.id} overlaps ${O.id}`;
              if (L.kind === O.kind) err(msg); else warn(msg + ' (street/feature families have no shared collision grid)');
            }
          }
        }
    }
    for (const [x, y] of L.footprint) {
      const k = keyOf(x, y);
      const arr = grid.get(k);
      const box = [x, y, L.r, li];
      if (arr) arr.push(box); else grid.set(k, [box]);
    }
  }

  return { errors, warnings, labelCount: labels.length };
}

// ── CLI ──
const HERE = path.dirname(fileURLToPath(import.meta.url));
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let file = process.argv[2];
  if (!file) {
    const dir = path.join(HERE, '..', 'exports');
    const svgs = fs.readdirSync(dir).filter(f => f.endsWith('.svg'))
      .map(f => path.join(dir, f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (!svgs.length) { console.error('[lint] no exports/*.svg found'); process.exit(2); }
    file = svgs[0];
  }
  if (!fs.existsSync(file)) { console.error(`[lint] no such file: ${file}`); process.exit(2); }
  const { errors, warnings, labelCount } = lintSvg(fs.readFileSync(file, 'utf8'));
  console.log(`[lint] ${path.basename(file)} — ${labelCount} labels`);
  const MAXW = process.argv.includes('-v') ? Infinity : 15;
  warnings.slice(0, MAXW).forEach(w => console.log(`[lint]   warn ${w}`));
  if (warnings.length > MAXW) console.log(`[lint]   … +${warnings.length - MAXW} more warnings (-v for all)`);
  for (const e of errors) console.log(`[lint]   ERROR ${e}`);
  console.log(`[lint] ${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(errors.length ? 1 : 0);
}
