# MapExport Design System

## Overview

**MapExport** is a browser-based tool that generates Illustrator/Inkscape-ready SVG city maps from OpenStreetMap data, purpose-built for the **USE-IT** network — a European volunteer-run organisation that makes free, opinionated city guides for young travellers (18–30).

USE-IT stands for **"No Nonsense Tourist Info for Young People"** — maps are made by locals, not travel journalists. MapExport automates ~80% of the manual Illustrator tracing process that USE-IT volunteers currently do by hand.

### The Two Brands

| Brand | Role |
|---|---|
| **USE-IT** | Parent organisation / map brand. Bold, youthful, colourful (orange + mint). Tagline: "Made by locals, for young travellers." |
| **MapExport** | The export tool. Minimal, precise, paper-toned. A cartographer's instrument, not a consumer app. |

### Sources

- **GitHub repo**: `shifthappens/MapExport` — full source (index.html, script.js, style.css)
- **Uploaded assets**: `uploads/USE_IT_EUROPE.jpg` (logo), `uploads/Screenshot 2026-04-21 at 23.33.57.png`, `uploads/Screenshot 2026-04-21 at 23.34.36.png` (USE-IT website)
- **Reference doc**: `references/How to draw a good street map.md` — tutorial PDF from USE-IT Porto

---

## CONTENT FUNDAMENTALS

### Voice & Tone
- **Direct, functional, no fluff.** MapExport copy reads like a cartographer's notebook — precise, lowercase labels, no em-dashes, no exclamation marks.
- **Casing**: UI labels are ALL CAPS (UPPERCASE), 9–10px, letter-spacing ~1.5px. Body/help text is sentence case, 10–11px.
- **Person**: Second-person "you" implied but rarely stated. Prefer imperative: "Draw rectangle", "Export SVG", "Find a city".
- **Numbers**: Metric, abbreviated: "A3 @ 300dpi", "268px", "eps=8".
- **Emoji**: Never used in UI. Unicode symbols used sparingly as icons (⏳, ⬛, ✕, ↓) — functional only.
- **Error/status messages**: Short and lowercase: "Ready — draw an area to begin", "No area selected yet", "No exports yet".

### USE-IT Brand Voice (upstream)
- Energetic, inclusive, anti-tourist-trap. "No nonsense."
- "Made by locals" — emphasises authenticity over polish.
- Target audience: young people 18–30.
- All-caps display text in bold condensed style.

---

## VISUAL FOUNDATIONS

### Color System
See `colors_and_type.css` for full token definitions.

**MapExport UI palette** — warm paper tones with ink and a bold accent:
- Paper backgrounds: `#f7f4ed` / `#efeade` / `#e5dfce` — warm off-white, aged parchment feel
- Ink text: `#18180f` / `#3d3d2e` / `#7c7b68` — near-black with a warm olive undertone
- Accent red-orange: `#bf3b1e` — primary CTA, errors, active states
- Accent blue: `#1e5cbf` — links, secondary interactive (loading state)
- Green: `#2d6b35` — success states
- Borders: `#d4cebc` / `#c5bea8` — warm grey-beige

**Map output palette** (SVG colours for USE-IT preset):
- Building blocks: `#FEF6ED` fill + `#F4AFA7` stroke
- Water: `#A4DBF3`
- Parks: `#51A886`
- Roads: `#ffffff` fill + `#F4AFA7` casing

**USE-IT brand palette** (upstream organisation):
- Primary orange: `#f4501e`
- Mint green: `#7ecab6` (logo teal-mint)
- Olive: `#8b8a4a`
- Teal: `#3d7a8a`
- Dark red: `#c23b2a`
- Background: warm cream / mint / orange — bold flat blocks

### Typography
- **Display**: `Instrument Serif` — elegant italic serif, used for the product wordmark ("Map*Export*") and modal titles. Weight 400. The italic is key.
- **Monospace / UI**: `Geist Mono` — weights 300, 400, 500. ALL UI text, labels, inputs, buttons. Tight, technical, cartographic feel.
- **No sans-serif** — this is intentional. The pairing of a classical serif wordmark with a modern technical mono creates the "cartographer's studio" mood.
- Base font size: 13px body, 9–10px labels, 11px inputs/buttons.

### Spacing & Layout
- Sidebar: 268px fixed width
- Header: 54px fixed height
- Panel padding: 14px 16px
- Border radius: 2px (nearly square — sharp, functional)
- Gap system: 4px, 6px, 8px, 10px, 12px, 14px, 16px

### Backgrounds & Surfaces
- Flat, matte. No gradients on UI surfaces (one exception: sidebar fade hint).
- Paper layering: `--paper` → `--paper2` → `--paper3` for depth (input backgrounds, hover states).
- No shadows on cards or panels — borders only.
- The sidebar fade (linear-gradient to `--paper`) is the only decorative gradient.

### Borders & Radius
- All components: `border-radius: 2px` — very slight rounding, almost square.
- Border colour: `--border` (#d4cebc) default, `--border2` (#c5bea8) on hover/focus.
- No inset shadows. No drop shadows. Borders are the only depth cue.

### Animations & Transitions
- Duration: 0.1s–0.2s ease (very fast)
- Hover: opacity change (`.85` or `.8`) or background swap to next paper tone
- Active/press: colour fills (ink background, or accent fill)
- Loading: spinner (`border-right-color: transparent`, 0.7s linear infinite)
- Progress bar: `width` transition 0.4s ease
- No bounces, no spring physics, no scale transforms.

### Iconography
See ICONOGRAPHY section below.

### Cards & Components
- No card shadows
- Panels divided by 1px `--border` lines
- Step numbers: 16×16px circles with `--border2` border
- Help buttons: 16px circular, `--border2` border → hover to `--accent`

### Color Vibe of Imagery
- USE-IT illustrations: flat vector, 2-colour (orange + dark purple / mint + dark), bold halftone-style fills, retro-playful.
- Map output: deliberately muted pastel — cream, salmon, pale blue, sage green. Functional, not decorative.

---

## ICONOGRAPHY

MapExport uses **no icon font** and **no icon library**. Instead:

- **Unicode glyphs as functional icons**: `⏳` (recent), `⬛` (draw), `✕` (close), `↓` (download)
- **Inline SVG arrow** for select dropdowns (data URI, `fill='%237c7b68'`)
- **No emoji** in tool UI
- **USE-IT brand** uses custom flat vector illustrations (halftone-style, 2-colour). See `assets/use_it_logo.jpg`.

There is no bundled icon set. For any design work, use Unicode symbols or simple inline SVGs with `stroke-width: 1.5`, square linecaps, `--ink` or `--muted` colour.

---

## FILES

```
README.md                  — This file (you are here)
SKILL.md                   — Agent skill manifest (Claude Code compatible)
colors_and_type.css        — CSS custom properties: colors, typography, spacing tokens
components.css             — Ready-to-use component classes (buttons, inputs, panels, header, modal…)
colors_and_type.css        — CSS custom properties: colors + typography
assets/
  use_it_logo.jpg          — USE-IT Europe logo (multicolour)
  use_it_screenshot_1.png  — USE-IT website hero (orange, bold)
  use_it_screenshot_2.png  — USE-IT website section (mint + orange)
preview/
  colors-brand.html        — Brand color swatches
  colors-map.html          — Map output color palette
  colors-semantic.html     — Semantic UI colors (ink, paper, border)
  type-display.html        — Instrument Serif specimens
  type-mono.html           — Geist Mono scale
  type-labels.html         — UI label patterns
  spacing-tokens.html      — Spacing & radius tokens
  components-buttons.html  — Button states
  components-inputs.html   — Input + select fields
  components-panels.html   — Panel + step UI
  components-status.html   — Status bar + progress
ui_kits/
  mapexport/
    index.html             — Full interactive prototype of MapExport UI
    Header.jsx             — Header component
    Sidebar.jsx            — Sidebar panels
    MapArea.jsx            — Map area placeholder + toasts
    Modals.jsx             — Help modal
SKILL.md                   — Agent skill manifest
```
