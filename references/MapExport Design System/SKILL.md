---
name: mapexport-design
description: Use this skill to generate well-branded interfaces and assets for MapExport / USE-IT City Map Builder — a browser-based OSM-to-SVG tool for creating city maps in the USE-IT.travel visual style. Contains design guidelines, color tokens, typography, brand assets, and a UI kit.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Quick reference

**Fonts**: `Barlow Condensed` (700/800, ALL CAPS) for headings/labels; `Geist Mono` (400/500) for inputs, body, technical text. Both on Google Fonts.

**Key files to import into production:**
- `colors_and_type.css` — all CSS custom properties (colors, spacing, radius, font stacks)
- `components.css` — ready-to-use classes for every component (buttons, inputs, panels, modals, status, header)
- `fonts/` — Mayonnaise_Black.woff2, Apfel_Grotezk_Regular.woff2, Apfel_Grotezk_Fett.woff2
- Orange (primary): `#f4501e`
- Mint: `#7ecab6`
- Cream bg: `#fef9e4`
- Ink: `#18180f`
- Accent (error/active): `#bf3b1e`

**Key rules**:
- Border radius: 2px everywhere (near-square, functional)
- No shadows — borders only for depth
- Transitions: 0.15s ease, opacity or background swap
- Buttons: Barlow Condensed 700+, uppercase, 2px border-radius
- Panel labels: Barlow Condensed 700, 11–13px, uppercase, 1.5px letter-spacing
- All CSS tokens in `colors_and_type.css`
- UI kit prototype at `ui_kits/mapexport/index.html`
