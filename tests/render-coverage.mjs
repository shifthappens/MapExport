// Render-based coverage check: rasterize the ACTUAL export over a loud
// magenta page and count what shows through. The geometric lint
// (coverage-lint.mjs) checks the worker's model of the map; history shows the
// model and the paint can disagree (rail corridors carved wider than the
// drawn tracks, paint/void simplification drift, blob-vs-fallback seams) and
// every such disagreement is invisible to a model-side check by construction.
// This one measures pixels of the same SVG the user opens, so any class of
// "bare page where land should be" — present or future — shows up as a
// number.
//
// Requires a Chrome/Chromium binary (CHROME_BIN, the macOS app path, or one
// of the usual names on PATH). Returns { skipped: true } when none is found
// so offline environments degrade gracefully instead of failing.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  for (const name of ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser']) {
    try {
      const p = execFileSync('which', [name], { encoding: 'utf8' }).trim();
      if (p) return p;
    } catch { /* not on PATH */ }
  }
  return null;
}

// Minimal PNG decoder for Chrome screenshots: 8-bit, RGB(A), non-interlaced.
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let off = 8, width = 0, height = 0, colorType = 0, bitDepth = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || data[12] !== 0) {
        throw new Error(`unsupported PNG (depth ${bitDepth}, color ${colorType}, interlace ${data[12]})`);
      }
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const px = Buffer.allocUnsafe(height * stride);
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const rowIn = (y * (stride + 1)) + 1;
    const rowOut = y * stride;
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[rowIn + x];
      const left = x >= bpp ? px[rowOut + x - bpp] : 0;
      const up = y > 0 ? px[rowOut - stride + x] : 0;
      const upLeft = y > 0 && x >= bpp ? px[rowOut - stride + x - bpp] : 0;
      let v;
      switch (filter) {
        case 0: v = rawByte; break;
        case 1: v = rawByte + left; break;
        case 2: v = rawByte + up; break;
        case 3: v = rawByte + ((left + up) >> 1); break;
        case 4: v = rawByte + paeth(left, up, upLeft); break;
        default: throw new Error(`bad PNG filter ${filter}`);
      }
      px[rowOut + x] = v & 0xff;
    }
  }
  return { width, height, bpp, px };
}

// Render the export (background layer stripped) over magenta at quarter scale
// and cluster the show-through pixels. minAreaPx2 is in FULL-scale px², same
// significance floor as the geometric lint. Returns
//   { skipped } or
//   { barePct, blobs: [{ px2, px, py, lat, lng }] }  (blobs sorted large→small)
export function checkRenderedCoverage({ svgText, W, H, bbox, minAreaPx2 }) {
  const chrome = findChrome();
  if (!chrome) return { skipped: true };

  const DOWNSCALE = 4;
  const qW = Math.round(W / DOWNSCALE), qH = Math.round(H / DOWNSCALE);
  let svg = svgText.replace(/<g id="background"[\s\S]*?<\/g>/, '');
  svg = svg.replace(/width="[\d.]+"/, `width="${qW}"`).replace(/height="[\d.]+"/, `height="${qH}"`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'render-coverage-'));
  const svgPath = path.join(tmp, 'nobg.svg');
  const pngPath = path.join(tmp, 'nobg.png');
  let img;
  try {
    fs.writeFileSync(svgPath, svg);
    execFileSync(chrome, [
      '--headless', '--disable-gpu', '--hide-scrollbars',
      `--screenshot=${pngPath}`, `--window-size=${qW},${qH}`,
      '--default-background-color=FF00FFFF',
      `file://${svgPath}`,
    ], { stdio: 'pipe', timeout: 120000 });
    img = decodePng(fs.readFileSync(pngPath));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  const { width, height, bpp, px } = img;
  const isBare = (x, y) => {
    const o = (y * width + x) * bpp;
    return px[o] > 220 && px[o + 1] < 60 && px[o + 2] > 220;
  };

  let bare = 0;
  const seen = new Uint8Array(width * height);
  const blobs = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isBare(x, y)) continue;
      bare++;
      if (seen[y * width + x]) continue;
      const stack = [[x, y]];
      let n = 0, sx = 0, sy = 0;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
        const idx = cy * width + cx;
        if (seen[idx] || !isBare(cx, cy)) continue;
        seen[idx] = 1; n++; sx += cx; sy += cy;
        stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
      }
      const px2 = n * DOWNSCALE * DOWNSCALE;
      if (px2 >= minAreaPx2) blobs.push({ px2, px: (sx / n) * DOWNSCALE, py: (sy / n) * DOWNSCALE });
    }
  }
  blobs.sort((a, b) => b.px2 - a.px2);

  // Inverse Mercator for human-checkable blob positions.
  const xMin = bbox.west * Math.PI / 180;
  const yMin = Math.log(Math.tan(Math.PI / 4 + (bbox.south * Math.PI / 180) / 2));
  const scale = W / (bbox.east * Math.PI / 180 - xMin);
  for (const b of blobs) {
    b.lng = (xMin + b.px / scale) * 180 / Math.PI;
    b.lat = (2 * Math.atan(Math.exp(yMin + (H - b.py) / scale)) - Math.PI / 2) * 180 / Math.PI;
  }

  return { barePct: 100 * bare / (width * height), blobs };
}
