# Plan: Illustrator-interoperable label export

## Context

Designers exporting from MapExport and opening the SVG in **Adobe Illustrator**
report that street-name labels come in as **one text object per letter**, while
park/water names come in as a **single editable text object**. The map looks
correct in Inkscape and in browsers — only Illustrator misbehaves. The goal is
to make label output interoperable across all apps a designer might use
(Illustrator, Inkscape, Affinity, Figma, CorelDraw, browsers, print RIPs).

The reporting designer's file predates the recent label-engine rewrite, and she
may have moved labels by hand — so some of what she saw may not reproduce on a
fresh export. The findings below come from reading the current export code in
`script.js`.

## Key findings

| Item | Location |
|------|----------|
| Street label emit — `<textPath>` (text on a path) | `script.js:1280` (`emitPath`) |
| Square/plaza label emit — plain `<text x y>` | `script.js:1350` |
| Roundabout-too-small label emit — plain `<text x y>` | `script.js:1390` |
| Park/water/district label emit — plain `<text x y>` | `script.js:1474–1475` |
| Vertical centering via `dominant-baseline` | `script.js:1349`, `1372`, `1474–1475` |
| Colour palette (plain sRGB hex, no ICC profile) | `script.js:86–116` |
| Label font hardcoded `Arial,Helvetica,sans-serif` | `script.js:1349`, `1372`, `1474`, `1475` |
| Brand fonts (UI only, not used in export) | `fonts/*.woff2`, `style.css:3–5` |
| `wrapSVG` width/height emitted in px, not mm | `script.js:1884–1886` (see `:129–137`) |

### 1. Why street labels split into one object per letter (confirmed)

Two different mechanisms write text into the SVG:

| Label type | Markup | Illustrator import result |
|---|---|---|
| **Street labels** | `<text><textPath href="#…">NAME</textPath></text>` (`:1280`) | **One point-text object per glyph** — the reported bug |
| **Park / water / district / square** | `<text x="…" y="…">Name</text>` (`:1474–1475`, `:1350`, `:1390`) | **One editable text object** |

Illustrator does not import SVG `<textPath>` as a live "Type on a Path" object.
It bakes each glyph's position from the SVG and drops every character in as its
own point-text object. Inkscape and browsers render the same markup correctly as
one curved string. `<textPath>` is **required** for curved streets (hard product
rule: labels must follow the road — see `memory/feedback_label_cartography.md`),
so for genuinely curved streets there is a real tension between *curve-following*
and *single editable object in Illustrator*.

**Reframe (important):** no mainstream interchange format stores "text on an
arbitrary curve" as a single editable string that survives into Illustrator.
PDF and EPS have no text-on-path primitive at all — curved text is emitted as
per-glyph positioned runs, so a PDF opened in Illustrator yields the same
per-letter clusters on curves. The only way to get output that looks *identical
in every app* is to stop shipping curved labels as live text (outline them).

**Practical mitigation:** the label engine already prefers the **straightest**
stretch of each road (`bendOver` + candidate sorting, `:1404–1416`; wrap capped
~80°). Labels on a straight stretch don't need `<textPath>` — they can be a
single rotated point-text object, which Illustrator imports as one editable
object.

### 2. "Text not centered in the street" (confirmed, same family)

Both label types lean on `dominant-baseline` (`central`/`middle`) to sit centered
on their line (`:1349`, `:1372`, `:1474–1475`). Illustrator's SVG import has weak
support for `dominant-baseline`; when ignored, text falls back to the alphabetic
baseline and the glyph bodies sit **above** the road centreline — the "not
centered" symptom. Browsers/Inkscape honour it, so they look fine.

### 3. "Colour palette off vs Inkscape / browser" (plausible mechanism)

The SVG uses plain **sRGB hex** with **no embedded colour profile** (`:86–116`,
e.g. park `#51A886`, road casing `#F4AFA7`). On import Illustrator applies its
*document* colour settings; in a CMYK doc, or a non-sRGB RGB working space, the
values convert and shift. Browsers/Inkscape show the raw hex. This is mostly an
Illustrator-side setting, not a file defect. (Park *label* text `#3a6a3a`,
`:1463`, intentionally differs from park *fill* `#51A886` — not a bug.)

### 4. "Street label bundled together" (most likely the old file)

Not tied to a current-code defect. Her file predates the label-engine rewrite
(which merges fragments and places one name per street with collision
avoidance), and she may have moved the label. If "bundled" means a tight cluster
of per-letter objects, that is finding #1 again.

### 5. Font mismatch — a format-independent interop leak (new finding)

Exported labels hardcode `font-family="Arial,Helvetica,sans-serif"` (`:1349`,
`:1372`, `:1474–1475`), but the product's brand fonts are **Apfel Grotezk** /
**Mayonnaise** (shipped as woff2, used only in the UI — `style.css:3–5`). So even
before Illustrator's `textPath` quirk, editable exports depend on the receiving
app having Arial and laying it out with the same metrics the collision engine
assumed (`approxTextWidth`). On a machine without Arial the labels substitute and
can drift from their computed positions. Outlines remove this dependency entirely.

### 6. Document opens oversized in Illustrator (secondary)

`wrapSVG` receives `physicalWidthMm` but only writes it into the metadata
description — the actual `width`/`height` attributes are bare pixels
(`:1884–1886`), despite the comment at `:129–137` intending mm. Illustrator maps
px→pt and opens the document ~4× too large (A4 export ≈ 1240 mm wide).

## Format / library landscape

- **`.ai` generation:** not viable. Modern `.ai` is a PDF with a private Adobe
  data stream (PGF); no maintained open library emits that stream. Do not pursue.
- **PDF:** the universal print format and the best `.ai` proxy — Illustrator /
  Affinity / CorelDraw open it as editable vectors. In-browser via `svg2pdf.js`
  (+ `jsPDF`) or `pdf-lib`. Caveat: curved text is still per-glyph; converter
  fidelity for `textPath`/`dominant-baseline` varies and must be tested. PDF is
  worth offering as an output but does not by itself fix labels.
- **Outlined text (vector paths):** the real "identical in every app" answer.
  Trace each label glyph to a filled `<path>` with **`opentype.js`** and place
  glyphs along the existing baseline (straight or curved). Solves the `textPath`
  split, the `dominant-baseline` centering, and font substitution at once.
  Trade-offs: not re-typable as text, larger files, and requires shipping a real
  **ttf/otf** label font (opentype.js cannot read woff2, and current exports name
  Arial which isn't shipped). Designers commonly outline text for print anyway.
- **EPS:** legacy; no advantage over PDF. Skip.

## Proposed changes

### A. Label-text mode toggle — "Editable" vs "Outlined" (primary)

Add a UI control: **Label text: Editable / Outlined (max compatibility)**.

- **Editable mode** (improve current behaviour):
  1. In `emitPath` (`:1280`), when the chosen sub-path is (near) straight
     (bend ≈ 0 from `bendOver`), emit a single rotated point-text:
     `<text transform="rotate(θ x y)" …>NAME</text>` instead of `<textPath>`.
     One editable object in Illustrator and everywhere else.
  2. Keep `<textPath>` only for genuinely curved placements.
  3. Replace reliance on `dominant-baseline` alone with an explicit baseline
     offset (`dy ≈ 0.35em`) so labels center even where the attribute is ignored
     — tuned/tested so it does not double-offset Inkscape/browsers.

- **Outlined mode** (new, the universal one):
  1. Add `opentype.js`; load a chosen label font (ship its ttf/otf).
  2. For each label, convert glyphs to path data and lay them along the same
     baseline geometry `buildLabelsLayer` already computes (straight or curved).
  3. Emit each label as a named `<g>` of `<path>` glyphs. Identical render in
     every app, no font dependency, no `textPath`/baseline issues.

### B. Decide and embed/outline the label font

Pick a deliberate label typeface (brand font or a licensed substitute) and either
embed it (editable mode) or trace from it (outlined mode), replacing the hardcoded
`Arial,Helvetica,sans-serif`. Resolves finding #5.

### C. PDF export (optional, evaluate)

Wire `svg2pdf.js` + `jsPDF` (or `pdf-lib`) to offer a PDF download for print
hand-off. Evaluate curved-text fidelity before committing to it as a primary path.

### D. Emit width/height in mm (secondary)

Make `wrapSVG` actually use `physicalWidthMm` for the `width`/`height` attributes
(with `mm` units) so the document opens at true physical size. Resolves finding #6.

### E. "Opening in Illustrator" guidance in the UI

Short note: open/place into an RGB document (sRGB IEC61966-2.1), keep colours on
import rather than convert; expect curved labels as outlines/point-text.

## Recommended sequencing

1. **A (editable-mode fixes)** + **B** — biggest win for the most labels; low risk.
2. **A (outlined mode)** — the guaranteed cross-app deliverable; behind the toggle.
3. **D** — small, independent fix.
4. **C** and **E** — evaluate / polish.

## Verification

- Reproduce with `label-sample.svg` (a minimal artboard emitting a curved street
  `<textPath>` next to a park plain `<text>`): open in Illustrator (per-letter +
  high of path) vs Inkscape/browser (correct). Confirms the diagnosis.
- After A/B: export a real bbox, open in Illustrator — straight labels are single
  editable objects, centered on their roads; curved ones either editable
  `textPath` (editable mode) or a single path group (outlined mode).
- After outlined mode: diff render against the editable SVG in Illustrator,
  Inkscape, Affinity, and a browser — geometry should be identical everywhere.
- After D: confirm A4 export opens at ~297 mm wide in Illustrator/Inkscape.
- Run `bash tests/smoke.sh` to confirm the data pipeline is unaffected by label
  emit changes.

## Out of scope / explicitly rejected

- Native `.ai` file generation (no viable library).
- EPS export (no advantage over PDF).
- Coaxing Illustrator into honouring `<textPath>` — it will not; outlining or
  point-text are the only reliable routes.
