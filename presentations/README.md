# MapExport workshop

[mapexport-workshop-merged.pptx](mapexport-workshop-merged.pptx) is a 12-slide English
workshop deck. Its speaker notes support a live Inkscape demo, hands-on work
and feedback. Use [preview.html](preview.html) to review it in a browser with the merged exercise on slide 11. It preserves the edits in the
14-slide PowerPoint that was open at the time of the merge. That original
file is left intact.

Slide 11 keeps the red workshop background. Its four-step checklist asks
participants to export a small area, recolour the blocks, explore layers and
save a working copy with one observation. All three original slides' help
tips remain visible, including the Gent SVG link and the early-finisher task.

`assets/ghent-demo.svg` is a live Gent v1 export captured on 2026-09-13. It is
the SVG used for the demo; `assets/` also contains the supporting screenshots.

## Fonts

Workshop and UI authoring use the canonical files in
`../references/MapExport Design System/fonts/`: Mayonnaise Black for display
text, and Apfel Grotezk Regular/Fett for body text and emphasis. Use the WOFF2
files for the web and their matching TTF files in desktop tools.

Before opening the deck in PowerPoint, install all three TTF files (on macOS,
open each in Font Book and choose Install). Restart PowerPoint if it was
already open. Fonts are not embedded in the PPTX; a computer without these
fonts may substitute other typefaces. The browser preview includes rendered
slide images and preserves the intended appearance without installation.

The older bundled design-system prose names Barlow and Geist, but those are
not the UI's active typefaces. `colors_and_type.css` is the source of truth.
The repository has no root `fonts/` directory: the deployment workflow creates
it only while building production assets.

## Rebuilding

The current PPTX is the source of truth for the manually edited deck.
`source/build.mjs` reproduces the original 16-slide version and must not be
used to overwrite the current deck. For this merge, `source/build-workshop-slide.mjs`
creates the replacement workshop slide using `@oai/artifact-tool` in the Codex
presentation runtime. `source/merge-workshop.py` (Python with lxml) inserts
that slide into a copy of the edited 14-slide source and removes its old
slides 12–13, preserving other slide content and adding clickable links.

With the runtime's Node executable on `PATH` and `NODE_PATH` pointing to its
`node_modules`, the merge can be repeated from the repository root:

```sh
BUILD_DIR=/tmp/mapexport-workshop-merge node presentations/source/build-workshop-slide.mjs
python3 presentations/source/merge-workshop.py source-14-slides.pptx /tmp/mapexport-workshop-merge/workshop-slide.pptx candidate.pptx
```

Before
replacing the published deck, use the Presentations skill's
`finalizePresentation` workflow to check package integrity, slide geometry,
font policy and re-import. The intended fonts are `Mayonnaise Black` and
`Apfel Grotezk`; slide dimensions are 12192000 × 6858000 EMU (16:9).
Render the final imported PPTX into `preview/slide-01.png` through
`preview/slide-12.png`, inspect every slide, and regenerate the gallery with:

```sh
python3 presentations/source/make-preview.py
```

The checked-in deck passed those automated checks and visual inspection of
all 12 final slide renders. Native Microsoft PowerPoint rendering was not
tested. Speaker notes contain the workshop script, sources and demo steps.

## Demo files

The workshop slide links to https://coen.at/ghent.svg, the public demo URL
provided by Coen. `assets/ghent-demo.svg` remains the local backup. The comparison
file, `assets/ghent-recoloured.svg`, changes the fill of its 581 City blocks
paths to `#F2CA76`. Both preview maps were rendered with Inkscape. Keep the
original available as a fallback for participants whose export is still
running. The live demo instructions are in slide 10's speaker notes.
