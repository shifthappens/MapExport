# MapExport workshop

[mapexport-workshop.pptx](mapexport-workshop.pptx) is a 16-slide English
workshop deck. Its speaker notes support a live Inkscape demo, hands-on work
and feedback. Use [preview.html](preview.html) to review it in a browser and
[source/build.mjs](source/build.mjs) to rebuild it.

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

The source uses the `@oai/artifact-tool` presentation library supplied by the
Codex presentation runtime. It is not part of the web app's dependencies or
deployment. From the repository root, with that runtime's Node executable on
`PATH` and `NODE_PATH` pointing to its `node_modules` directory, run:

```sh
BUILD_DIR=/tmp/mapexport-workshop-build node presentations/source/build.mjs
```

This writes `candidate.pptx` and slide PNGs to the build directory. Before
replacing the published deck, use the Presentations skill's
`finalizePresentation` workflow to check package integrity, slide geometry,
font policy and re-import. The intended fonts are `Mayonnaise Black` and
`Apfel Grotezk`; slide dimensions are 12192000 × 6858000 EMU (16:9).
Render the final imported PPTX into `preview/slide-01.png` through
`preview/slide-16.png`, inspect every slide, and regenerate the gallery with:

```sh
python3 presentations/source/make-preview.py
```

The checked-in deck passed those automated checks and visual inspection of
all 16 final slide renders. Native Microsoft PowerPoint rendering was not
tested. Speaker notes contain the workshop script, sources and demo steps.

## Demo files

Open `assets/ghent-demo.svg` in Inkscape before the workshop. The comparison
file, `assets/ghent-recoloured.svg`, changes the fill of its 581 City blocks
paths to `#F2CA76`. Both preview maps were rendered with Inkscape. Keep the
original available as a fallback for participants whose export is still
running. The live demo instructions are in slide 10's speaker notes.
