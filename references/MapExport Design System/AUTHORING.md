# MapExport Design System authoring

The canonical font files live in `fonts/` in this directory. Use
Mayonnaise Black for display text and Apfel Grotezk Regular or Fett for body
text and emphasis.

Use the WOFF2 files in browser work:

- `fonts/Mayonnaise_Black.woff2`
- `fonts/Apfel_Grotezk_Regular.woff2`
- `fonts/Apfel_Grotezk_Fett.woff2`

Use their matching desktop TTF equivalents in presentation and design tools:

- `fonts/Mayonnaise_Black.ttf`
- `fonts/Apfel_Grotezk_Regular.ttf`
- `fonts/Apfel_Grotezk_Fett.ttf`

The older prose in this design-system bundle mentions Barlow and Geist. Those
names are not the actual MapExport UI typography. The `@font-face` declarations
and font-family tokens in `colors_and_type.css` are the source of truth.

MapExport does not keep a duplicate root `fonts/` directory. Local HTML and
CSS load these canonical WOFF2 assets directly. The deployment workflow copies
them into a generated root `fonts/` directory only while preparing the
production bundle, where font URLs remain `fonts/...`.

## Workshop deliverables

The English workshop is a 12-slide deck with speaker notes, a live Inkscape
demo, hands-on work and feedback:

- [Deck](../../presentations/mapexport-workshop-merged.pptx)
- [Browser preview](../../presentations/preview.html)
- [Live Gent export](../../presentations/assets/ghent-demo.svg), captured on
  2026-09-13
- [Presentation source](../../presentations/source/build.mjs)
