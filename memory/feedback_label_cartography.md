---
name: feedback-label-cartography
description: User feedback on street label quality — must follow the road, never overflow, no horizontal linear streets
metadata:
  type: feedback
---

Street labels must make cartographic sense. The user will inspect the output closely.

**Why:** this is a print map tool for designers; labels that look wrong (mirrored,
overlapping, written across the road, overflowing past the street) break the product.

**How to apply:**
- Every linear street label must read along its road. Near-straight stretches
  are emitted as a single rotated `<text>` (one editable object — Illustrator
  imports `<textPath>` as one object PER LETTER), anchored on the span's
  least-squares baseline (centroid + fitted angle from `fitStraightBaseline`),
  never on the local tangent at the midpoint. Straight-vs-textPath is decided
  by max deviation from that baseline (≤ STRAIGHT_MAX_DEV × font size) — a
  degrees-of-bend threshold is length-blind and let long labels veer off
  gently bending roads. Curved stretches keep `<textPath>` so they still
  follow the bend.
  Never horizontal across a linear street — only tag-mapped squares/plazas get
  centred horizontal text.
- Labels must never overflow past the road they sit on. If the name doesn't fit,
  abbreviate first, then shrink the font to fit. Small fonts are fine.
- No overlapping labels. Verify with real rendered glyph extents, not axis-aligned
  boxes (which mismodel curved/diagonal text).
- Labels must never be mirrored/upside-down. Each label needs its own oriented
  sub-path, not a whole-run reverse.
- Prefer straight stretches over curves for label placement. Never wrap >80° (120°
  hard cap at tiny sizes).
- Always verify by measuring the actual rendered output (overlap pairs, bend
  distribution, mirrored count) — the collision model approximates; the renderer
  is ground truth.
