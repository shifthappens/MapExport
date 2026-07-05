# Label-engine debug workflow — trace placement decisions on real city data

**Insight (2026-07-05):** the fastest way to answer "why is this label
small/missing/misplaced" is to run the real `buildLabelsLayer` on the real
cached city data with trace statements patched into the source — no browser,
no server, no network, seconds per iteration.

## Recipe

1. Load `script.js` into a `node:vm` sandbox with the browser stubs copied
   from `tests/lib.mjs loadAppSandbox` (elProxy + document/localStorage
   fakes).
2. Before `vm.runInContext`, string-patch trace pushes into the source at
   stable anchors, e.g. after `const baseW=approxTextWidth(...)` (per-run
   entry: name, lenPx, sz0) and at the shrink-loop exit
   `if (placedC.length>0) break` (per-size outcome: fs, lw, candidates,
   placed). Throw if a patch anchor no longer matches, so drift is loud.
3. Feed it the cached Overpass tile directly:
   `zlib.gunzipSync(fs.readFileSync('cache/mapexport_v3_street_labels_*_<bbox>.json.gz'))`
   — the LAMP server is not needed for reading.
4. Call `buildLabelsLayer(data.elements, pr, W, H)` with `makeProjector` and
   filter the trace by street name. A font-size histogram over the emitted
   SVG (`/font-size="([\d.]+)"/g`) shows whether a defect is one-off or
   systemic.

## Why this and not synthetic streets

`buildLabelsLayer` is one big closure; nothing internal is exposed, and
synthetic geometry usually misses the real trigger (collision stamps from
neighbours, multi-run pools after `mergeNamedWays`, same-name suppression
across runs). Real data + trace found in minutes what the Roggestraat 9px
label actually was: a second short run shrinking past `nearName` suppression
— not a length or road-width problem.

## Scale facts that matter while reading traces

- Real exports run `a3_300` = 4961px wide, so `getScaleFactor` = 1 and
  `LABEL_STYLES` sizes are literal px (residential 22, spacing 500,
  nameGap = spacing×0.85 = 425px).
- The committed Tilburg bbox tile is
  `cache/mapexport_v3_street_labels_wjc4tv_a_51.545_5.07_51.562_5.1.json.gz`.
