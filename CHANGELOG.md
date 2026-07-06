# Changelog

All notable changes to MapExport are recorded here, **newest at the top**.

> **Maintenance rule (for humans and AI assistants alike):** every commit that
> adds, changes, or removes a feature/behaviour MUST add an entry to the top of
> the "Unreleased" section below in the same commit. Keep entries short and
> user-facing — describe *what changed and why*, not every line touched. Group
> related work under one dated entry. Pure-internal churn (formatting, comment
> typos, regenerating `script.min.js`) does not need its own entry.

## Unreleased

### 2026-07-06 — Illustrator-compatible export pipeline
- **New format choice in Export options** (like Maperitive's
  `compatibility=illustrator`): **SVG (Illustrator)** — now the default, since
  most USE-IT designers work in Illustrator — and **SVG (Inkscape / others)**
  for standards-based tools. Illustrator's SVG import is buggy enough that one
  file cannot be optimal in both worlds.
- **The Illustrator variant** (filename suffix `-illustrator`) stays inside the
  SVG subset Illustrator actually parses: curved street names are laid out
  glyph by glyph with real Arial metrics (its `<textPath>` import doesn't
  rotate glyphs before v23.0.6 and explodes text into per-letter objects in
  every version), halos are stacked text copies instead of `paint-order`,
  clipPaths move to the document root, one font name instead of a CSS list,
  font weights snap to real Arial styles (400/700), and all Inkscape/RDF
  editor metadata is stripped. A warning appears when the canvas exceeds
  Illustrator's 16383pt artboard limit.
- **The standard variant modernised** (rendering unchanged): feature-label
  halos are now a single `paint-order="stroke"` text element, `textPath` uses
  plain `href` (no xlink namespace), and shared stroke styling moved from
  every road/rail/tram/metro path onto its class group — smaller files, same
  picture.
- **The Simplify slider is gone**: exports always use the former default
  (position 2, 0.6px tolerance). The other positions were never a real
  trade-off worth a control.
- `tests/real-export.mjs --illustrator` writes the Illustrator variant next to
  the standard trail, with its own profile assertions.

### 2026-07-06 — Footways, cycleways, paths and steps become dashed trails
- **Small path classes no longer masquerade as streets**: footway, cycleway,
  path and steps now render as a single dashed stroke in the casing colour —
  no casing, no white fill — so real streets (which bound city blocks) are
  instantly distinguishable from paths (which don't). Dash code: long dash =
  cycleway, short dash = footway, fine thin dash = dirt path, wide rungs =
  steps. Fixes the root cause too: the old dash patterns were never scaled to
  the export size, so at print resolution these classes rendered as solid
  mini-streets with casings (reported on Locomotiefboulevard and Willem
  II-passage at Tilburg station).
- **Paths turn white over parks and water**: a clipPath overprints the dashes
  in white wherever they cross park or water polygons (salmon would vanish on
  the green), flipping colour exactly at the area edge.
- **No more labels on footways and cycleways**: path-class ways are unlabelled;
  the cycleway toggle is gone from the label controls.

### 2026-07-05 — City blocks hug the road casings exactly
- **Block contours now match the rendered streets** (reported on Groenstraat /
  Flemingstraat / Heuvelring, Tilburg): the block cutter used a much coarser
  copy of the road network than the renderer (8px simplification vs ~0.6px,
  square buffer joins vs round stroke joins/caps, integer coordinates, 4–6px
  polygon cleaning, 2px output simplify), leaving irregular white gaps between
  blocks and casings. The cutter now buffers the exact merged+simplified
  polylines the renderer strokes, with round joins/caps at sub-pixel arc
  tolerance on a 10× integer grid, and tucks the block edge 0.5px under the
  casing (roads paint over blocks) so no hairline can show.

### 2026-07-05 — Labels: on-canvas policy, one collision grid, rail clearance, no dwarf labels, cleaner curves
- **Labels never overlap railways**: the hatched rail bed claims its corridor
  in the label collision grid before any label is placed, so street and
  feature names dodge the tracks (reported on NS Plein and Sint
  Ceciliastraat, Tilburg).
- **Labels stay on the canvas**: entirely-offscreen placements are gone (they
  were invisible but still consumed the street's repeat budget, leaving the
  visible part nameless); a partially clipped label at the map edge is only
  placed once the same street has a fully visible label. Single-placement
  labels (squares, roundabouts, rivers, parks) are fully visible or skipped.
- **One collision grid for all labels**: park/water/suburb names and street
  names now share the street-label footprint grid — feature labels (fixed
  anchor) claim space first, street labels (many candidate spots) dodge them.
  Fixes river names printing on top of quay-street names in Ghent (~60 cases).
- **No more dwarf labels** (reported on Roggestraat, Tilburg): font shrinking
  now only compensates for short streets, never squeezes a label past
  collisions — floor at 50% of the class size for a street's first label,
  75% of full size for repeats (instead of shrinking to 5px absolute).
- **Curved labels are typographically clean** (reported on Stratinghpad and
  Doctor Leijdsstraat, Tilburg): a label is never draped over a corner or
  tight elbow (>30° of turn within ~2 glyph heights — measured over the whole
  window, so multi-vertex elbows are caught too), and `textPath` baselines
  get their corners rounded (Chaikin) so glyphs no longer jam on a bend's
  inside or tear a gap on its outside ("DOC TOR").
- `tests/svg-lint.mjs`: off-canvas/clipped-only/feature-clipped and ALL
  label-overlap findings are errors now (previously warnings pending the
  engine fix), and a new check fails any label crossing a rail corridor.
  `label-placement.mjs` grew from 37 to 46 checks covering the new policies.
- Internal: stale `landuse_*`/`poi_*` ids removed from `LAYER_ORDER`;
  unknown layer ids now sort last instead of first (latent `indexOf||999`
  bug); `water_labels` builds before `street_labels` (feature-first grid
  order — z-order between the two is irrelevant as they can't overlap).

### 2026-07-04 — Street labels stay inside their street, in every renderer
- **Straight labels must stay inside the road fill**: merged with the
  2026-07-02 fitted-baseline work below — a straight label is allowed only
  while the road deviates from the span's least-squares baseline by less
  than BOTH the room between glyph edge and road-fill edge AND 30% of the
  font size; beyond either it falls back to a road-following `textPath`.
  Previously the label rotated to the road's *local* angle at its centre, so
  names lifted off the street wherever it curved under them (reported on
  Koopvaardijstraat, Sint Annastraat, Hooistraat, Professor Dondersstraat).
- **Labels keep clear of junction mouths**: placement is inset from both ends
  of a street run, so a name can no longer poke into a crossing street.
- **Vertical centring is baked into geometry** — baseline = road axis +
  0.36×font-size (rotates with the anchor), and `textPath` baselines are
  pre-shifted perpendicular. The `dominant-baseline` attribute is gone:
  QuickLook and Adobe Illustrator ignore it and rendered every label sitting
  on/above its street. Output is now identical in every renderer (also
  resolves the baseline item from the retired Illustrator-interop plan).
- `tests/svg-lint.mjs` gained a within-street containment check (label glyph
  band vs the street's own white fill, matched by name), so this defect class
  now fails the test run instead of needing eyes.

### 2026-07-03 — Test harness can now fail: SVG lint, label unit tests, per-city floors
- New `tests/svg-lint.mjs`: deterministic checks on any exported SVG — NaN/undefined
  in attributes, empty/mirrored/upside-down labels, dangling `textPath` refs,
  label-on-label overlap, labels outside the canvas (warning; known engine
  behaviour). Guarded by its own `tests/svg-lint-selftest.mjs` (11 checks).
- New `tests/label-placement.mjs` (31 checks): unit + integration tests for the
  street-label engine — reading-angle normalisation, straight-vs-textPath choice,
  reversed-geometry orientation, repeat spacing, same-name suppression, squares,
  roundabouts — running the real `buildLabelsLayer` from `script.js`.
- `tests/real-export.mjs` is now a test, not just a demo: it exits non-zero on
  lint errors, zero roads/labels, or a layer under its per-city floor
  (`tests/expectations.json`, captured at ×0.5 with `--record` on an approved
  run; Tilburg + Ghent recorded). It also refuses to run against a stale
  `script.min.js` and properly drains cache-write POSTs instead of sleeping 2s.
- `tests/smoke.sh` now runs all six offline suites (incl. supersession) before
  the Overpass round-trip; `OFFLINE_ONLY=1` skips the network step.
  `tests/query-equivalence.mjs` warns on >1.5× over-fetch (accidentally widened
  query). Scanner/parsing code deduplicated into `tests/lib.mjs`, which now
  hard-fails if extraction stops matching `script.js` instead of silently
  skipping layers.
- `tests/viewer.html` accepts `?crop=x,y,w,h` for 1:1 detail screenshots.
- svg-lint judges canvas clipping per street, not per label: a clipped repeat
  next to a fully visible sibling label is fine (per Coen's rule); warnings
  now only flag invisible placements and streets with no fully visible label
  (tilburg: 21/24 such cases, ghent: 23/55 — the engine fix planned in
  `plans/2026-07-03_labels-canvas-clipping-and-unified-collision.md`).

### 2026-07-04 — More realistic export-time estimates and a simpler layers tip
- Step 1 (export area) help now quotes realistic export times (under a
  minute / 2–5 min / 10+ min) instead of the old "seconds" estimate, and
  notes that the public Overpass API's rate limiting causes pauses.
- Step 2 (map layers) help replaces the buildings-specific slowdown note
  with a generic "disable unneeded layers" tip.

### 2026-07-02 — Straight street labels no longer veer off gently bending roads
- Straight (rotated `<text>`) labels are now anchored on the **least-squares
  baseline of the whole label span** — centroid position + fitted angle —
  instead of the point and single-segment heading at the span's midpoint.
  On a slightly bendy street the old anchor tilted the label by up to the
  full bend and pushed it to the outside of the curve; the fit averages the
  bend so the label sits centred on the street.
- The straight-vs-`textPath` decision is now **deviation-based** (road may
  wander at most 30% of the font size from the fitted baseline) instead of
  the old 12°-total-bend rule, which was length-blind: long labels could
  drift visibly off-road while short ones were needlessly exploded into
  per-letter `textPath` objects. Spans that deviate more keep `textPath`.
- Collision footprints for straight labels now follow the straight baseline
  that is actually drawn (previously they were stamped along the curved
  road, so the collision model disagreed with the render on exactly the
  labels that veered). New offline regression test: `tests/label-fit.mjs`.

### 2026-07-03 — Multi-city visual test harness
- `tests/real-export.mjs` accepts named test areas (`tilburg`, `ghent`, `paris`,
  `bremerhaven`, `oulu`) besides raw bboxes; the city is now part of the export
  filename. `tests/visual-cities.sh` runs the four extra cities in one go.
- The extra cities are **gated**: they run only after the standard Tilburg
  export passed visual inspection and Coen approved it (`tests/README.md` §7).
  Each area is a Tilburg-sized chunk chosen to surface bugs Tilburg can't
  (medieval core, boulevards, harbour, 65°N projection).
- `tests/IMPROVEMENTS.md` records prioritized findings on harness gaps (no
  assertions in real-export, subjective visual check, Tilburg-only fixtures).

### 2026-06-28 — Tracked build + changelog enforcement
- The build is now version-controlled: `tools/minify.sh` (terser for JS,
  clean-css for CSS) replaces the personal gitignored `minify.sh`.
- A tracked pre-commit hook (`.githooks/pre-commit`, activated via
  `bash tools/setup-hooks.sh`) re-minifies staged source and **rejects commits
  that change app source without a `CHANGELOG.md` entry** (bypass:
  `SKIP_CHANGELOG=1`). Keeps `script.min.js`/`style.min.css` and the changelog
  from drifting.

### 2026-06-28 — Street layers grouped by class, alphabetical within
- **Roads:** the exported SVG now sub-groups road paths by `highway=` class
  inside each rendering pass (`roads_casings_<hw>` / `roads_fills_<hw>`, e.g.
  "Residential streets"), ordered alphabetically within each class. The two-pass
  structure (all casings, then all fills) and `ROAD_DRAW_ORDER` are preserved, so
  junctions stay seamless and minor roads still paint under major ones. Casing
  paths now also carry `inkscape:label`. Designers can grab/hide/restyle a whole
  class at once, or find one named street fast.
- **Street labels:** split into `labels_<hw>` subgroups (importance-ordered,
  alphabetical within). No visual change — labels never overlap, so paint order
  is irrelevant.
- Casing+fill were deliberately *not* paired per street: that would stamp a
  crossing road's casing over the other road's fill at every intersection.

### 2026-06-28 — Illustrator-editable labels + headless export harness
- Straight street labels emit as a single rotated `<text>` (one editable object
  in Illustrator) instead of per-letter `<textPath>`; curved stretches keep
  `<textPath>`. Export filenames use local time.
- Added a headless export + visual-check harness (`tests/real-export.mjs`) that
  runs the shipped `script.min.js` outside a browser.

### 2026-06-25 — Road segment merging + street label engine
- `mergeNamedWays` stitches OSM ways sharing name + highway class into maximal
  polylines, cutting SVG path count and improving label placement.
- Name-centric label engine: collision detection, abbreviation, straightest-run
  placement, no upside-down labels.

### 2026-06-25 — Developer documentation
- Added a comprehensive README and a mobile usability notice.

---

_Earlier history predates this changelog; see `git log` for the full record._
