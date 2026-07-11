// engine-v2.js — MapExport export engine v2 (experimental).
//
// A second map-construction engine that coexists with v1 behind the
// "Engine v2 (experimental)" UI toggle. v1 (the script.js pipeline) stays
// untouched and remains the production default until v2 is validated
// city-by-city. This file owns only the v2 assembly + orchestration; it
// shares projection, fetch/cache plumbing, presets and SVG wrappers with v1
// by referencing them directly (loaded as a classic script AFTER script.js,
// so all of script.js's top-level declarations are in scope here).
//
// The v2 model (milestones 2-6): faces = bbox minus the buffered
// road/rail/tram/metro network; a small face with a building becomes a cream
// block, with water/green/waterway strokes subtracted mechanically (plain
// Clipper difference, evenodd holes — NO water heuristics: no winding, no
// island checks, no interior-point tests). Area features come from one
// combined fetch classified through the ordered AREA_FEATURES table;
// natural=coastline closes into a sea polygon. A final coverage fallback pass
// paints any small buildingless face that no layer covered as cream in a
// separate counted fallback_blocks group (this is also how river islands
// render — no island machinery). Transit and labels run v1's own builders on
// the shared context; squares fill as open plazas; tunnels neither draw nor
// bound blocks. See plans/2026-07-10_export-engine-v2.md — the milestone
// checkboxes there are the single source of truth for progress.

const EngineV2 = (() => {
  // v2's flat layer list. Renderable layers reuse v1's own registry objects,
  // looked up (not copied): identical overpassQuery → identical layerQHash →
  // v1 and v2 share the same cache.php entries for free.
  const findLayer = (id) => LAYER_REGISTRY.flatMap(g => g.layers).find(l => l.id === id);
  const roadsLayer = findLayer('roads');

  // Rail, tram and metro both cut faces (a hard block boundary in the USE-IT
  // style) and render, through v1's own builders (sleepers, tram/metro
  // palettes) via renderLayerSVG. Underground segments drop out of the CUTTER
  // via the tunnel filter, so a metro line only cuts where it surfaces; what
  // the builders draw is v1 semantics, unchanged. Transit stops render only.
  const railLayer = findLayer('rail');
  const tramLayer = findLayer('tram');
  const metroLayer = findLayer('metro');
  const transitStopsLayer = findLayer('transit_stops');

  // Labels reuse the full v1 engine (placement, collision grid, abbreviations,
  // both emission pipelines) via renderLayerSVG. Feature labels render before
  // street labels in layerOrder: they have exactly one possible anchor, so
  // they stamp the shared ctx.labelGrid first — same reasoning as v1's
  // LAYER_ORDER. Rail corridors stamped that grid earlier in the same pass.
  const waterLabelsLayer = findLayer('water_labels');
  const streetLabelsLayer = findLayer('street_labels');

  // Buildings are fetched for every v2 export (bounding boxes) and serve two
  // purposes: classifying faces (does a small face contain a building?) and
  // forming hamlet blobs inside rural faces. Reuse v1's BLOCK_BUILDINGS_LAYER
  // object directly so its cache entry is shared. Fetch-only, never rendered.
  const buildingsLayer = BLOCK_BUILDINGS_LAYER;

  // The area-features layers v2 renders into. These are v1's own registry
  // objects, so their per-feature renderers (mechanical stitch + evenodd fill,
  // colours from PRESETS.useit) are reused verbatim by feeding them the
  // elements the AREA_FEATURES classifier bucketed. See classifyAreaFeatures.
  const waterBodiesLayer = findLayer('water_bodies');
  const waterwaysLayer = findLayer('waterways');
  const parksLayer = findLayer('parks');
  const landcoverLayer = findLayer('landcover');

  // One combined fetch that brings back everything the AREA_FEATURES table can
  // paint (water surfaces, named green, sports/recreation green, countryside
  // land cover), plus the two coded exceptions (natural=coastline for the sea,
  // linear waterways for stroked rivers/canals). Deliberately NOT fetched:
  // cream-equivalent categories (landuse=residential/grass, gardens,
  // flowerbeds) — the cream face below already covers that land, and fetching
  // them is the 776-stray-patches failure mode. Fetch cost is not a design
  // input (plan principle), so the query is written plainly for robustness.
  // Fetch-only: its raw elements are classified into the layers above, never
  // rendered directly. layerQHash gives it its own cache namespace for free.
  const areaFeaturesLayer = {
    id: 'area_features', label: 'Area features', type: 'fetch',
    overpassQuery: (b) => [
      // Water surfaces (things that read as open water).
      `wr["natural"~"^(water|bay)$"](${b});`,
      `wr["waterway"~"^(riverbank|dock)$"](${b});`,
      `wr["landuse"~"^(reservoir|basin)$"](${b});`,
      `wr["leisure"~"^(marina|swimming_pool)$"](${b});`,
      // Sea (open ways, closed against the bbox on the water side).
      `way["natural"="coastline"](${b});`,
      // Linear waterways → stroked lines.
      `way["waterway"~"^(river|stream|canal)$"](${b});`,
      // Named green destinations (v1's parksNamedGate set).
      `wr["leisure"~"^(park|garden|nature_reserve|recreation_ground)$"]["name"](${b});`,
      `wr["landuse"~"^(forest|cemetery|allotments|recreation_ground)$"]["name"](${b});`,
      `wr["natural"="wood"]["name"](${b});`,
      `wr["amenity"="grave_yard"]["name"](${b});`,
      `wr["tourism"="zoo"]["name"](${b});`,
      // Green sports/recreation (rendered distinct from cream, so nameless too).
      `wr["leisure"~"^(pitch|stadium|sports_centre|golf_course|dog_park|nature_reserve)$"](${b});`,
      // Countryside land cover (named forests classify as green above; the
      // nameless remainder is the countryside land the block cutter shows through).
      `wr["landuse"~"^(farmland|meadow|forest)$"](${b});`,
      `wr["natural"="wood"](${b});`,
    ].join(''),
  };

  // v2 owns its own derived layer entries (no overpassQuery). Their geometry is
  // computed by the face worker and pushed in as results whose data carries
  // { blocks }, not { elements }. city_blocks holds the primary cream faces and
  // hamlet blobs; fallback_blocks holds the coverage-guarantee patches (see
  // renderFallbackBlocks). Both sit below water in layerOrder.
  const cityBlocksLayer = { id: 'city_blocks', label: 'City blocks', type: 'derived' };
  const fallbackBlocksLayer = { id: 'fallback_blocks', label: 'Fallback blocks', type: 'derived' };

  const layers = [roadsLayer, railLayer, tramLayer, metroLayer, transitStopsLayer, waterLabelsLayer, streetLabelsLayer, buildingsLayer, areaFeaturesLayer, cityBlocksLayer];

  // Fetched to feed the face cutter / classifier, but never rendered as their
  // own layer. area_features is the fetch vehicle for water/green/landcover —
  // those render under their own ids after classification, not as area_features.
  const fetchOnlyIds = new Set([buildingsLayer.id, areaFeaturesLayer.id]);

  // The full v2 paint order from the plan. fallback_blocks sits directly after
  // city_blocks — its own group (structurally distinguishable, counted per
  // export) but the same z-band: both stay BELOW water/waterways/parks so a
  // missed overlap can never show cream over water.
  const layerOrder = [
    'landcover',
    'city_blocks',
    'fallback_blocks',
    'water_bodies',
    'waterways',
    'parks',
    'roads',
    'rail',
    'tram',
    'metro',
    'transit_stops',
    'water_labels',
    'street_labels',
  ];

  // Cream fill for city blocks. v1 renders blocks as #FEF6ED at
  // fill-opacity="0.8" over white — a pure style choice from commit a7ab512.
  // v2 bakes that flattened colour as a solid fill with no opacity attribute,
  // deliberately: the opacity carried no meaning, so folding it out keeps the
  // block a single opaque paint that later layers can sit cleanly above.
  const CREAM = '#FEF8F1';

  // Sort a result list into v2 paint order. Unknown ids sort last (same
  // convention as v1's sortedResults).
  function sortResults(results) {
    const orderIndex = (id) => {
      const i = layerOrder.indexOf(id);
      return i < 0 ? 999 : i;
    };
    return [...results].sort((a, z) => orderIndex(a.layer.id) - orderIndex(z.layer.id));
  }

  // ════════════════════════════════════════════════════════════════
  //  AREA_FEATURES — one ordered declarative table
  //
  //  First matching row wins (specific before generic). Each row maps a tag
  //  pattern to a category; each category maps to exactly one render layer +
  //  paint style (the colour lives in the v1 renderer / PRESETS.useit, reused
  //  verbatim). Adding a forgotten OSM tag later is one row, never a new code
  //  path. Only render-DISTINCT categories get a row: anything that would paint
  //  cream anyway is neither fetched nor listed here.
  //
  //  Categories → layers:
  //    water     → water_bodies (blue)
  //    green     → parks        (park green)
  //    landcover → landcover    (farmland=field tint, wood/forest=park green,
  //                              coloured by tag inside v1's landcover renderer)
  //
  //  Two deliberate coded exceptions live OUTSIDE this table, not as rows:
  //  natural=coastline (the sea, closed against the bbox) and linear waterways
  //  (stroked lines). Both are handled in classifyAreaFeatures before the table.
  //
  //  No aeroway/military/power rows: v1 renders none of them distinct from
  //  cream and PRESETS.useit carries no colour for them, so per the plan's
  //  "where v1 renders them distinctly from cream" qualifier there is nothing
  //  to port — that land falls into cream blocks like any other. Add a row here
  //  (plus its query statement + preset colour) if a city ever needs one.
  // ════════════════════════════════════════════════════════════════
  const AREA_FEATURES = [
    { match: (t) => /^(water|bay)$/.test(t.natural || ''), category: 'water' },
    { match: (t) => /^(riverbank|dock)$/.test(t.waterway || ''), category: 'water' },
    { match: (t) => /^(reservoir|basin)$/.test(t.landuse || ''), category: 'water' },
    { match: (t) => /^(marina|swimming_pool)$/.test(t.leisure || ''), category: 'water' },
    // Named green destinations: reuse v1's exact gate (name + junk-name filter),
    // so v2 keeps the "named parks only, not every verge" look.
    { match: (t) => parksNamedGate({ type: 'way', tags: t }), category: 'green' },
    // Sports/recreation green, nameless allowed (reads green, not cream).
    { match: (t) => /^(pitch|stadium|sports_centre|golf_course|dog_park|nature_reserve)$/.test(t.leisure || ''), category: 'green' },
    // Countryside land cover: farmland/meadow → field tint, wood/forest → park
    // green. v1's landcover renderer picks the colour from the tag.
    { match: (t) => /^(farmland|meadow)$/.test(t.landuse || ''), category: 'landcover' },
    { match: (t) => t.landuse === 'forest' || t.natural === 'wood', category: 'landcover' },
  ];

  // Category for a tag set, or null. First matching row wins.
  function classifyAreaTags(tags) {
    for (const row of AREA_FEATURES) {
      if (row.match(tags)) return row.category;
    }
    return null;
  }

  // A way whose geometry closes (a real ring). The table's geometry gate: only
  // closed ways and multipolygon relations may paint an area; nodes and open
  // ways are discarded (a place=square node cannot fill an area).
  function isClosedWay(el) {
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 4) return false;
    const a = el.geometry[0], z = el.geometry[el.geometry.length - 1];
    return Math.abs(a.lat - z.lat) < 1e-9 && Math.abs(a.lon - z.lon) < 1e-9;
  }

  // Split one area-features fetch into per-layer element buckets. Coastline and
  // linear waterways are pulled out by their own coded paths BEFORE the table;
  // everything else passes the closed-way/multipolygon gate, then the table.
  function classifyAreaFeatures(elements) {
    const water = [], green = [], landcover = [], waterways = [], coastline = [];
    for (const el of (elements || [])) {
      if (el.type === 'node') continue;
      const tags = el.tags || {};
      if (tags.natural === 'coastline' && el.type === 'way') { coastline.push(el); continue; }
      if (el.type === 'way' && /^(river|stream|canal)$/.test(tags.waterway || '')) { waterways.push(el); continue; }
      if (!(isClosedWay(el) || (el.type === 'relation' && el.members))) continue;
      const category = classifyAreaTags(tags);
      if (category === 'water') water.push(el);
      else if (category === 'green') green.push(el);
      else if (category === 'landcover') landcover.push(el);
    }
    return { water, green, landcover, waterways, coastline };
  }

  // ── Coastline → sea ────────────────────────────────────────────────
  // OSM tags the open sea as natural=coastline (unclosed ways, land on the LEFT
  // of the way direction / water on the right), never as a water polygon. To
  // fill it we stitch the coastline into chains, clip them to the export bbox,
  // and close each chain along the bbox edge on the water side into a sea
  // polygon that then flows through the ordinary water path (rendered as water,
  // subtracted from blocks). Done in lat/lon space, where "water on the right"
  // is the plain geographic convention (no projection y-flip to reason about).
  //
  // Scope (per plans/2026-07-07_coastline-sea-fill.md): handles the common
  // single-coast-across-frame case; punts on deeply nested coastline
  // (island-in-lake-in-island) and on a frame entirely at sea (assumes land,
  // a no-op). The water-side sign MUST be asserted against a coastal city
  // (Bremerhaven/Oulu) during M7 validation — the required M3 test cities are
  // inland, so this path is a strict no-op for them.

  const samePt = (a, b) => Math.abs(a.lat - b.lat) < 1e-9 && Math.abs(a.lon - b.lon) < 1e-9;

  // Stitch coastline ways end-to-end into maximal open chains.
  function stitchCoastlineChains(ways) {
    const remaining = ways.filter(w => w.geometry && w.geometry.length >= 2).map(w => w.geometry.slice());
    const chains = [];
    while (remaining.length) {
      let chain = remaining.shift();
      let grew = true;
      while (grew) {
        grew = false;
        for (let i = 0; i < remaining.length; i++) {
          const seg = remaining[i];
          if (samePt(chain[chain.length - 1], seg[0])) chain = chain.concat(seg.slice(1));
          else if (samePt(chain[chain.length - 1], seg[seg.length - 1])) chain = chain.concat(seg.slice(0, -1).reverse());
          else if (samePt(chain[0], seg[seg.length - 1])) chain = seg.slice(0, -1).concat(chain);
          else if (samePt(chain[0], seg[0])) chain = seg.slice(1).reverse().concat(chain);
          else continue;
          remaining.splice(i, 1);
          grew = true;
          break;
        }
      }
      chains.push(chain);
    }
    return chains;
  }

  // Clip a lat/lon polyline to the bbox, returning the inside runs (each a list
  // of points whose first and last lie on the bbox edge, unless the whole run
  // is interior). Straight-line boundary crossings only — coastline vertices
  // are dense enough that this is faithful at map scale.
  function clipChainToBbox(chain, bbox) {
    const inside = (p) => p.lat >= bbox.south && p.lat <= bbox.north && p.lon >= bbox.west && p.lon <= bbox.east;
    const intersect = (a, b) => {
      // Clip segment a→b against each bbox edge, returning the point where it
      // first enters/leaves; Liang-Barsky style parametric clip.
      let t0 = 0, t1 = 1;
      const dx = b.lon - a.lon, dy = b.lat - a.lat;
      const clip = (p, q) => {
        if (p === 0) return q >= 0;
        const r = q / p;
        if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
        else { if (r < t0) return false; if (r < t1) t1 = r; }
        return true;
      };
      if (clip(-dx, a.lon - bbox.west) && clip(dx, bbox.east - a.lon) &&
          clip(-dy, a.lat - bbox.south) && clip(dy, bbox.north - a.lat)) {
        return { enter: { lon: a.lon + t0 * dx, lat: a.lat + t0 * dy }, exit: { lon: a.lon + t1 * dx, lat: a.lat + t1 * dy }, t0, t1 };
      }
      return null;
    };
    const runs = [];
    let current = null;
    for (let i = 0; i < chain.length; i++) {
      const p = chain[i];
      if (inside(p)) {
        if (!current) {
          current = [];
          if (i > 0) { const seg = intersect(chain[i - 1], p); if (seg) current.push(seg.enter); }
        }
        current.push(p);
      } else if (current) {
        const seg = intersect(chain[i - 1], p);
        if (seg) current.push(seg.exit);
        runs.push(current);
        current = null;
      } else if (i > 0) {
        // Both endpoints outside, but the segment may cross the bbox entirely.
        const seg = intersect(chain[i - 1], p);
        if (seg && seg.t1 > seg.t0) runs.push([seg.enter, seg.exit]);
      }
    }
    if (current) runs.push(current);
    return runs.filter(r => r.length >= 2);
  }

  // Close one clipped coastline run into a sea polygon by walking the bbox
  // perimeter from its exit point back to its entry point, choosing the walk
  // direction that puts the polygon on the water (right-hand) side of the coast.
  function closeSeaPolygon(run, bbox) {
    const W = bbox.east - bbox.west, Hh = bbox.north - bbox.south;
    // Perimeter parameter (CCW from the SW corner) of a point on the bbox edge.
    const param = (p) => {
      if (Math.abs(p.lat - bbox.south) < 1e-9) return p.lon - bbox.west;                 // bottom
      if (Math.abs(p.lon - bbox.east) < 1e-9) return W + (p.lat - bbox.south);           // right
      if (Math.abs(p.lat - bbox.north) < 1e-9) return W + Hh + (bbox.east - p.lon);      // top
      return 2 * W + Hh + (bbox.north - p.lat);                                          // left
    };
    const P = 2 * (W + Hh);
    const corners = [
      { t: W, p: { lon: bbox.east, lat: bbox.south } },
      { t: W + Hh, p: { lon: bbox.east, lat: bbox.north } },
      { t: 2 * W + Hh, p: { lon: bbox.west, lat: bbox.north } },
      { t: P, p: { lon: bbox.west, lat: bbox.south } },
    ];
    const a = run[0], b = run[run.length - 1];
    const walk = (from, to, dir) => {
      // Corner points strictly between params `from` and `to`, walking in dir
      // (+1 = increasing/CCW, -1 = decreasing/CW), wrapping around P.
      const out = [];
      const norm = (t) => ((t % P) + P) % P;
      let steps = 0;
      const ordered = dir > 0 ? corners : corners.slice().reverse();
      for (let k = 0; k < ordered.length * 2 && steps < ordered.length * 2; k++) {
        const c = ordered[k % ordered.length];
        const between = dir > 0
          ? norm(c.t - from) > 0 && norm(c.t - from) < norm(to - from)
          : norm(from - c.t) > 0 && norm(from - c.t) < norm(from - to);
        if (between) out.push(c.p);
        steps++;
      }
      return out;
    };
    const build = (dir) => run.concat(walk(param(b), param(a), dir));
    // Test point just to the right of the coast's first interior segment; water
    // is on the right of the way direction. Right normal of (dx,dy) is (dy,-dx).
    const s0 = run[0], s1 = run[1];
    const dx = s1.lon - s0.lon, dy = s1.lat - s0.lat, len = Math.hypot(dx, dy) || 1;
    const eps = Math.min(W, Hh) * 1e-3;
    const test = { lon: (s0.lon + s1.lon) / 2 + (dy / len) * eps, lat: (s0.lat + s1.lat) / 2 + (-dx / len) * eps };
    const ccw = build(1);
    return ringContains(ccw, test) ? ccw : build(-1);
  }

  // Ray-cast point-in-ring on a lat/lon ring ([{lat,lon}, ...]).
  function ringContains(ring, pt) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i].lon, yi = ring[i].lat, xj = ring[j].lon, yj = ring[j].lat;
      if (((yi > pt.lat) !== (yj > pt.lat)) && pt.lon < (xj - xi) * (pt.lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // Synthetic water elements for the sea, one per closed sea polygon. Shaped
  // like an OSM way so v1's water renderer and the ring projector consume them
  // unchanged. Empty (inland frame with no coastline) → a strict no-op.
  function buildSeaElements(coastlineWays, bbox) {
    if (!coastlineWays || !coastlineWays.length) return [];
    const seaElements = [];
    let n = 0;
    for (const chain of stitchCoastlineChains(coastlineWays)) {
      for (const run of clipChainToBbox(chain, bbox)) {
        const ring = closeSeaPolygon(run, bbox);
        if (ring.length >= 4) seaElements.push({ type: 'way', id: `sea_${++n}`, tags: { natural: 'water', name: 'Sea' }, geometry: ring });
      }
    }
    return seaElements;
  }

  // Build the classified render results (water/waterways/parks/landcover) from
  // one area-features fetch, with the closed sea folded into the water bucket.
  // Each result reuses a v1 registry layer object, so renderLayerSVG paints it
  // exactly as v1 would. Returns { renderResults, classified } — classified
  // (with sea merged) also seeds the worker's subtraction geometry.
  function buildAreaResults(areaFeatureElements, bbox) {
    const classified = classifyAreaFeatures(areaFeatureElements);
    const seaElements = buildSeaElements(classified.coastline, bbox);
    classified.water = classified.water.concat(seaElements);
    const renderResults = [
      { layer: landcoverLayer, data: { elements: classified.landcover } },
      { layer: waterBodiesLayer, data: { elements: classified.water } },
      { layer: waterwaysLayer, data: { elements: classified.waterways } },
      { layer: parksLayer, data: { elements: classified.green } },
    ];
    return { renderResults, classified };
  }

  // ════════════════════════════════════════════════════════════════
  //  FACE CUTTER — Web Worker + ClipperLib
  //
  //  Faces = bbox minus the buffered road/rail cutter network (the same first
  //  stage as v1). Each face is then classified by building presence alone,
  //  then has water/green/waterway strokes subtracted mechanically:
  //   - small face with >= 1 building  → cream city block = face minus the
  //     block void (water + green + buffered waterway strokes), evenodd holes,
  //   - small face with no building    → no primary block; the coverage
  //     fallback paints face minus the fallback void (block void + landcover)
  //     as cream, so dry river islands and data gaps are never left bare,
  //   - large (countryside) face       → an unpainted placeholder (for the
  //     coverage lint) plus hamlet blobs with the same block-void subtraction.
  //  Subtraction is plain Clipper difference with the void's inner rings kept
  //  as holes — there are NO water heuristics anywhere in here by design.
  // ════════════════════════════════════════════════════════════════

  // Worker source as a string — turned into a blob URL below. Written for the
  // worker context (no access to the page's functions), so the few helpers it
  // needs are inlined. Uses string concatenation, never ${…}, so the outer
  // template literal needs no escaping.
  const FACE_WORKER_SRC = `
importScripts('https://cdn.jsdelivr.net/npm/clipper-lib@6.4.2/clipper.min.js');

// Douglas-Peucker simplification (worker-local copy).
function simplifyPath(points, epsilon) {
  if (points.length <= 2) return points;
  const first = points[0], last = points[points.length - 1];
  const dx = last[0] - first[0], dy = last[1] - first[1], len = Math.hypot(dx, dy);
  let maxDistance = 0, index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const distance = len === 0
      ? Math.hypot(points[i][0] - first[0], points[i][1] - first[1])
      : Math.abs(dy * points[i][0] - dx * points[i][1] + last[0] * first[1] - last[1] * first[0]) / len;
    if (distance > maxDistance) { maxDistance = distance; index = i; }
  }
  if (maxDistance > epsilon) {
    const left = simplifyPath(points.slice(0, index + 1), epsilon);
    const right = simplifyPath(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[points.length - 1]];
}

// Ray-casting point-in-polygon on an unscaled ring ([[x,y], ...]).
function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

self.onmessage = function(event) {
  const data = event.data;
  const cutterLines = data.cutterLines;
  const buildingCenters = data.buildingCenters;
  const clusterRings = data.clusterRings;
  // Area-feature geometry for the mechanical subtraction. Each *Polys entry is
  // an unscaled ring [[x,y], ...], already oriented on the main thread (outer
  // positive, inner negative) so lake islands / park courtyards union as holes.
  const waterPolys = data.waterPolys || [];
  const greenPolys = data.greenPolys || [];
  const landcoverPolys = data.landcoverPolys || [];
  const waterwayLines = data.waterwayLines || [];
  const W = data.W, H = data.H, bigFacePx2 = data.bigFacePx2, mPerPx = data.mPerPx;
  const Clipper = ClipperLib;
  // Clipper works on integer coordinates; buffer at SCALE× so the cut keeps
  // sub-pixel fidelity to the rendered strokes, unscale when emitting paths.
  const SCALE = 10;

  self.postMessage({ type: 'progress', msg: 'Buffering cutters…', pct: 10 });

  // Buffer each cutter line by its width group. Round caps/joins because the
  // strokes render round, arcs tight (±0.25px) so the face edge hugs the casing.
  const widthGroups = new Map();
  for (const line of cutterLines) {
    if (!widthGroups.has(line.halfW)) widthGroups.set(line.halfW, []);
    widthGroups.get(line.halfW).push(line.pts.map(p => ({ X: Math.round(p[0] * SCALE), Y: Math.round(p[1] * SCALE) })));
  }

  const voids = [];
  let groupsDone = 0;
  const totalGroups = widthGroups.size;
  for (const entry of widthGroups) {
    const halfW = entry[0], paths = entry[1];
    const BATCH = 300;
    for (let i = 0; i < paths.length; i += BATCH) {
      const offset = new Clipper.ClipperOffset();
      offset.ArcTolerance = 0.25 * SCALE;
      offset.MiterLimit = 2;
      const batch = paths.slice(i, i + BATCH);
      for (const p of batch) offset.AddPath(p, Clipper.JoinType.jtRound, Clipper.EndType.etOpenRound);
      const buffered = new Clipper.Paths();
      offset.Execute(buffered, halfW * SCALE);
      for (const bp of buffered) {
        const cleaned = Clipper.Clipper.CleanPolygon(bp, 0.2 * SCALE);
        if (cleaned && cleaned.length >= 3) voids.push(cleaned);
      }
    }
    groupsDone++;
    self.postMessage({ type: 'progress', msg: 'Buffering cutters…', pct: 10 + Math.round(30 * groupsDone / totalGroups) });
  }

  self.postMessage({ type: 'progress', msg: 'Merging ' + voids.length + ' cutters…', pct: 45 });

  // Union the cutter voids into one network.
  const unionClipper = new Clipper.Clipper();
  for (const v of voids) unionClipper.AddPath(v, Clipper.PolyType.ptSubject, true);
  const voidUnion = new Clipper.Paths();
  unionClipper.Execute(Clipper.ClipType.ctUnion, voidUnion, Clipper.PolyFillType.pftNonZero, Clipper.PolyFillType.pftNonZero);

  const voidClean = [];
  for (const p of voidUnion) {
    const cleaned = Clipper.Clipper.CleanPolygon(p, 0.2 * SCALE);
    if (cleaned && cleaned.length >= 3) voidClean.push(cleaned);
  }

  self.postMessage({ type: 'progress', msg: 'Cutting faces…', pct: 65 });

  // Faces = bbox rectangle minus the cutter union. Each road/rail-bounded face
  // is one PolyTree contour with its holes.
  const bboxPath = [
    { X: 0, Y: 0 }, { X: Math.round(W * SCALE), Y: 0 },
    { X: Math.round(W * SCALE), Y: Math.round(H * SCALE) }, { X: 0, Y: Math.round(H * SCALE) }
  ];
  const faceClipper = new Clipper.Clipper();
  faceClipper.AddPath(bboxPath, Clipper.PolyType.ptSubject, true);
  for (const v of voidClean) faceClipper.AddPath(v, Clipper.PolyType.ptClip, true);
  const faceTree = new Clipper.PolyTree();
  faceClipper.Execute(Clipper.ClipType.ctDifference, faceTree, Clipper.PolyFillType.pftNonZero, Clipper.PolyFillType.pftNonZero);

  self.postMessage({ type: 'progress', msg: 'Classifying faces…', pct: 80 });

  // Confetti guard: faces and hamlet blobs below 400 px² are dropped as
  // traffic-island noise. Ported from v1's minArea.
  const minArea = 400 * SCALE * SCALE;

  const rawFaces = [];
  function collectFace(node) {
    if (node.IsHole()) return;
    const contour = node.Contour();
    if (contour && contour.length >= 3 && Math.abs(Clipper.Clipper.Area(contour)) >= minArea) {
      const holes = [];
      for (let i = 0; i < node.ChildCount(); i++) {
        const child = node.Childs()[i];
        const hc = child.Contour();
        if (hc && hc.length >= 3) holes.push(hc);
        for (let j = 0; j < child.ChildCount(); j++) collectFace(child.Childs()[j]);
      }
      rawFaces.push({ outer: contour, holes: holes });
    }
  }
  for (let i = 0; i < faceTree.ChildCount(); i++) collectFace(faceTree.Childs()[i]);

  function toPathD(path) {
    const pts = path.map(p => [p.X / SCALE, p.Y / SCALE]);
    const simplified = simplifyPath(pts, 0.4);
    if (simplified.length < 3) return '';
    let d = 'M' + simplified[0][0].toFixed(1) + ',' + simplified[0][1].toFixed(1);
    for (let i = 1; i < simplified.length; i++) d += 'L' + simplified[i][0].toFixed(1) + ',' + simplified[i][1].toFixed(1);
    return d + 'Z';
  }

  // ── Mechanical water/green/landcover subtraction (NO heuristics) ──────
  const ptSubject = Clipper.PolyType.ptSubject, ptClip = Clipper.PolyType.ptClip;
  const ctUnion = Clipper.ClipType.ctUnion, ctDifference = Clipper.ClipType.ctDifference, ctIntersection = Clipper.ClipType.ctIntersection;
  const NZ = Clipper.PolyFillType.pftNonZero;

  function scaleRing(ring) {
    return ring.map(p => ({ X: Math.round(p[0] * SCALE), Y: Math.round(p[1] * SCALE) }));
  }

  // Buffer linear waterways into stroke polygons at their drawn half-width, so
  // they subtract from blocks exactly as wide as the blue line the renderer paints.
  function bufferLinesToPolys(lineList) {
    const out = [];
    const groups = new Map();
    for (const line of lineList) {
      if (!groups.has(line.halfW)) groups.set(line.halfW, []);
      groups.get(line.halfW).push(scaleRing(line.pts));
    }
    for (const entry of groups) {
      const halfW = entry[0], paths = entry[1];
      const offset = new Clipper.ClipperOffset();
      offset.ArcTolerance = 0.25 * SCALE;
      offset.MiterLimit = 2;
      for (const p of paths) offset.AddPath(p, Clipper.JoinType.jtRound, Clipper.EndType.etOpenRound);
      const buffered = new Clipper.Paths();
      offset.Execute(buffered, halfW * SCALE);
      for (const bp of buffered) if (bp && bp.length >= 3) out.push(bp);
    }
    return out;
  }

  // One nonZero union of a set of void rings. Area rings arrive already oriented
  // (outer positive, inner negative) so islands/courtyards stay as holes;
  // buffered waterway strokes are appended as solid rings. Plain Clipper —
  // nothing here decides whether a ring "is water".
  function buildVoid(polyGroups, extraScaledPaths) {
    const clipper = new Clipper.Clipper();
    for (const group of polyGroups) for (const ring of group) {
      const sp = scaleRing(ring);
      if (sp.length >= 3) clipper.AddPath(sp, ptSubject, true);
    }
    for (const p of (extraScaledPaths || [])) if (p.length >= 3) clipper.AddPath(p, ptSubject, true);
    const out = new Clipper.Paths();
    clipper.Execute(ctUnion, out, NZ, NZ);
    return out;
  }

  // subject (an array of scaled rings: a face's outer + holes, or a Paths list)
  // minus a void, as a PolyTree ready for emitTree.
  function subtractVoid(subjectPaths, voidPaths) {
    const clipper = new Clipper.Clipper();
    for (const p of subjectPaths) if (p && p.length >= 3) clipper.AddPath(p, ptSubject, true);
    for (const v of voidPaths) if (v && v.length >= 3) clipper.AddPath(v, ptClip, true);
    const tree = new Clipper.PolyTree();
    clipper.Execute(ctDifference, tree, NZ, NZ);
    return tree;
  }

  // Emit one block per solid contour of a difference tree, holes as evenodd
  // subpaths. Net area (outer minus holes) gates the confetti guard; a nested
  // solid (an island inside a lake inside a face) recurses into its own block.
  function emitTree(tree, kind, out) {
    (function recurse(nodes) {
      for (const node of nodes) {
        if (!node.IsHole()) {
          const contour = node.Contour();
          if (contour && contour.length >= 3) {
            const holeDs = [];
            let holesArea = 0;
            for (let i = 0; i < node.ChildCount(); i++) {
              const hc = node.Childs()[i].Contour();
              if (hc && hc.length >= 3) { holesArea += Math.abs(Clipper.Clipper.Area(hc)); const hd = toPathD(hc); if (hd) holeDs.push(hd); }
            }
            const netArea = Math.abs(Clipper.Clipper.Area(contour)) - holesArea;
            if (netArea >= minArea) {
              const outerD = toPathD(contour);
              if (outerD) out.push({ kind: kind, outer: outerD, holes: holeDs, areaPx: netArea / (SCALE * SCALE) });
            }
          }
          for (let i = 0; i < node.ChildCount(); i++) recurse(node.Childs()[i].Childs());
        }
      }
    })(tree.Childs());
  }

  const waterwayStrokePaths = bufferLinesToPolys(waterwayLines);
  // Blocks lose water, green and waterway strokes (all paint above the block).
  // The coverage fallback additionally loses landcover (farmland/wood paints too),
  // so it only paints land that truly no layer covered.
  const blockVoid = buildVoid([waterPolys, greenPolys], waterwayStrokePaths);
  const fallbackVoid = buildVoid([waterPolys, greenPolys, landcoverPolys], waterwayStrokePaths);

  // Countryside threshold in scaled area units. A face at/above this is rural
  // (not filled curb-to-curb); below it and containing a building it becomes a
  // city block. bigFacePx2 is COUNTRYSIDE_MIN_KM2 expressed in px², sized on
  // the main thread; Infinity means "classify nothing as countryside".
  const bigFaceScaled = (bigFacePx2 || Infinity) * SCALE * SCALE;

  // Hamlet clusters: morphological closing of the building bounding boxes —
  // dilate wide enough that neighbouring rural houses fuse into one chunky
  // USE-IT block, then erode most of it back so a lone barn doesn't balloon.
  // DILATE_M is the rural-spacing tuning knob (18 m bridges ~36 m gaps) and
  // only ever applies inside large faces, so raising it never touches city
  // blocks. Ported as-is from v1's hamlet code.
  let clusterPolys = null;
  if (clusterRings && clusterRings.length && mPerPx) {
    const DILATE_M = 18, ERODE_M = 10;
    const dilateOffset = new Clipper.ClipperOffset();
    dilateOffset.ArcTolerance = 0.5 * SCALE;
    dilateOffset.MiterLimit = 2;
    for (const ring of clusterRings) {
      const p = ring.map(pt => ({ X: Math.round(pt[0] * SCALE), Y: Math.round(pt[1] * SCALE) }));
      if (p.length >= 3) dilateOffset.AddPath(p, Clipper.JoinType.jtRound, Clipper.EndType.etClosedPolygon);
    }
    const grown = new Clipper.Paths();
    dilateOffset.Execute(grown, (DILATE_M / mPerPx) * SCALE);
    const erodeOffset = new Clipper.ClipperOffset();
    erodeOffset.ArcTolerance = 0.5 * SCALE;
    erodeOffset.MiterLimit = 2;
    erodeOffset.AddPaths(grown, Clipper.JoinType.jtRound, Clipper.EndType.etClosedPolygon);
    clusterPolys = new Clipper.Paths();
    erodeOffset.Execute(clusterPolys, -(ERODE_M / mPerPx) * SCALE);
  }

  const blocks = [];
  for (const face of rawFaces) {
    const netAreaScaled = Math.abs(Clipper.Clipper.Area(face.outer))
      - face.holes.reduce((sum, h) => sum + Math.abs(Clipper.Clipper.Area(h)), 0);
    const faceSubject = [face.outer].concat(face.holes);

    if (netAreaScaled >= bigFaceScaled) {
      // Large (countryside) face: no cream fill. Emit an unpainted placeholder
      // (the renderer skips kind:'countryside'; the coverage lint counts its
      // geometry, so open countryside is treated as intentional background, not
      // a gap) plus one hamlet blob per building cluster, with the same
      // water/green/waterway subtraction the urban blocks get.
      const faceOuterD = toPathD(face.outer);
      if (faceOuterD) blocks.push({ kind: 'countryside', outer: faceOuterD, holes: face.holes.map(h => toPathD(h)).filter(d => d), areaPx: netAreaScaled / (SCALE * SCALE) });
      if (clusterPolys && clusterPolys.length) {
        const intersectClipper = new Clipper.Clipper();
        for (const p of faceSubject) intersectClipper.AddPath(p, ptSubject, true);
        intersectClipper.AddPaths(clusterPolys, ptClip, true);
        const hamletPaths = new Clipper.Paths();
        intersectClipper.Execute(ctIntersection, hamletPaths, NZ, NZ);
        emitTree(subtractVoid(hamletPaths, blockVoid), 'hamlet', blocks);
      }
      continue;
    }

    // Small face: a city block only if it contains at least one building. Test
    // each building bbox centre against the face outer ring (respecting holes),
    // with a face-bbox prefilter first so 20k+ buildings × N faces stays fast.
    const outerRing = face.outer.map(p => [p.X / SCALE, p.Y / SCALE]);
    const holeRings = face.holes.map(h => h.map(p => [p.X / SCALE, p.Y / SCALE]));
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of outerRing) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
    let hasBuilding = false;
    for (const center of buildingCenters) {
      const cx = center[0], cy = center[1];
      if (cx < minX || cx > maxX || cy < minY || cy > maxY) continue;
      if (!pointInRing(cx, cy, outerRing)) continue;
      let inHole = false;
      for (const holeRing of holeRings) {
        if (pointInRing(cx, cy, holeRing)) { inHole = true; break; }
      }
      if (inHole) continue;
      hasBuilding = true;
      break;
    }

    if (hasBuilding) {
      // Cream city block = face minus the block void, evenodd holes. A pond in
      // the block becomes a hole; a face split by a river yields two blocks.
      emitTree(subtractVoid(faceSubject, blockVoid), 'urban', blocks);
    } else {
      // No building → no primary block. The coverage fallback paints whatever
      // water/green/landcover/waterways did NOT cover — dry river islands and
      // OSM data gaps — as cream, so land is never left bare. This is how river
      // islands render in v2: no island machinery, just face minus the union.
      emitTree(subtractVoid(faceSubject, fallbackVoid), 'fallback', blocks);
    }
  }

  self.postMessage({ type: 'done', blocks: blocks });
};
`;

  let faceWorkerUrl = null;
  function getFaceWorkerUrl() {
    if (!faceWorkerUrl) {
      faceWorkerUrl = URL.createObjectURL(new Blob([FACE_WORKER_SRC], { type: 'application/javascript' }));
    }
    return faceWorkerUrl;
  }

  // Block-cutting road classes, ported verbatim from v1's prepareBlockData:
  // the smallest block-bounding class is a residential/unclassified street;
  // footway/cycleway/path/steps NEVER cut, so one face may legitimately span
  // several visually separate areas.
  const BLOCK_ROADS = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary',
    'residential', 'unclassified', 'living_street', 'pedestrian',
    'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link']);

  // Roads paint OVER blocks, so pull the face edge this far under the casing to
  // absorb sub-pixel offset error without visibly moving the contour. Ported
  // from v1's ROAD_TUCK.
  const ROAD_TUCK = 0.5;

  // A tunnel must not bound a face — its surface is open ground above. Drop
  // tunnel=yes|culvert from the cutter; bridges and building_passage/covered
  // stay (they are surface-level obstacles in the USE-IT style).
  function isTunnel(el) {
    const t = el.tags?.tunnel;
    return t === 'yes' || t === 'culvert';
  }

  // Building bbox centre in projected px, for face classification. Buildings
  // are fetched as bounds ('tags bb'), so the centre is the bbox midpoint;
  // fall back to geometry-bbox midpoint for full-geometry cache entries.
  function buildingCenterPx(el, pr) {
    if (el.bounds) {
      const { minlat, minlon, maxlat, maxlon } = el.bounds;
      return pr((minlat + maxlat) / 2, (minlon + maxlon) / 2);
    }
    if (el.geometry?.length) {
      let sLat = Infinity, nLat = -Infinity, wLon = Infinity, eLon = -Infinity;
      for (const g of el.geometry) {
        if (g.lat < sLat) sLat = g.lat;
        if (g.lat > nLat) nLat = g.lat;
        if (g.lon < wLon) wLon = g.lon;
        if (g.lon > eLon) eLon = g.lon;
      }
      return pr((sLat + nLat) / 2, (wLon + eLon) / 2);
    }
    return null;
  }

  // Project a set of area-feature elements into oriented rings for the worker's
  // subtraction void. Rings are simplified at getAreaLargeEps() — the SAME
  // tolerance the renderer paints them at (NOT the flat road getEps()), or the
  // void would drift from the painted shape and leave cream slivers; this is
  // the warning at the eps definitions in script.js. Each ring is oriented
  // (outer positive, inner negative via ringIsPositive) so the worker's nonZero
  // union keeps islands/courtyards as holes — no winding heuristic downstream.
  function collectAreaPolys(elements, pr) {
    const areaLargeEps = getAreaLargeEps();
    const polys = [];
    for (const el of (elements || [])) {
      let outerRings = [], innerRings = [];
      if (el.type === 'way' && el.geometry?.length >= 3) { outerRings = [el.geometry]; }
      else if (el.type === 'relation' && el.members) {
        const stitched = stitchMultipolygonRings(el.members);
        outerRings = stitched.outer; innerRings = stitched.inner;
      }
      for (const [rings, isOuter] of [[outerRings, true], [innerRings, false]]) {
        for (const geom of rings) {
          if (!geom || geom.length < 3) continue;
          const pts = dpSimplify(geom.map(g => pr(g.lat, g.lon)), areaLargeEps);
          if (pts.length < 3) continue;
          if (ringIsPositive(pts) !== isOuter) pts.reverse();
          polys.push(pts);
        }
      }
    }
    return polys;
  }

  // Build the face-worker payload from the cutter results (roads + rail), the
  // fetched building elements, and the classified area features (water / green /
  // landcover / linear waterways). Projects + simplifies the cutter polylines
  // exactly like v1's prepareBlockData (same merge, same epsilon, same widths)
  // so the face edge traces the same line the renderer strokes, and projects the
  // area features into the worker's subtraction/fallback voids.
  function prepareFaceData(cutterResults, buildingElements, classified, pr, W, H, bbox) {
    const scaleFactor = getScaleFactor(W);
    const roadEps = getEps();
    const lineEps = getLineEps();
    const area = classified || { water: [], green: [], landcover: [], waterways: [] };

    const cutterLines = []; // { pts: [[x,y], ...], halfW }
    for (const { layer, data } of cutterResults) {
      if (!data?.elements?.length) continue;

      // Roads → lines with half-width. Merge named ways first (the renderer
      // strokes the stitched run, so simplifying the pieces would drift), and
      // drop tunnels before merging so a tunnel segment can't bound a face.
      if (layer.type === 'roads') {
        const surface = data.elements.filter(el => !isTunnel(el));
        for (const el of mergeNamedWays(surface)) {
          const highway = el.tags?.highway || '_default';
          if (!BLOCK_ROADS.has(highway)) continue;
          const width = ROAD_WIDTHS[highway] || ROAD_WIDTHS._default;
          const halfW = (width.fillW + width.casingW) * scaleFactor / 2 - ROAD_TUCK;
          const pts = dpSimplify(el.geometry.map(g => pr(g.lat, g.lon)), roadEps);
          if (pts.length >= 2) cutterLines.push({ pts, halfW });
        }
      }

      // Rail/tram/metro → lines, cut at v1's fixed rail half-width (no
      // ROAD_TUCK — they carry no casing the block hides under). Tunnels
      // dropped too, so underground lines never bound a face.
      if (layer.type === 'rail' || layer.type === 'tram' || layer.type === 'metro') {
        for (const el of data.elements) {
          if (el.type !== 'way' || !el.geometry?.length || el.geometry.length < 2) continue;
          if (isTunnel(el)) continue;
          const halfW = 20 * scaleFactor / 2;
          const pts = dpSimplify(el.geometry.map(g => pr(g.lat, g.lon)), roadEps);
          if (pts.length >= 2) cutterLines.push({ pts, halfW });
        }
      }
    }

    // Linear waterways → buffered strokes at their drawn half-width (v1's
    // 12 px stroke), simplified at the renderer's line tolerance. They subtract
    // from blocks and, as stroked lines, also count toward coverage.
    const waterwayLines = []; // { pts: [[x,y], ...], halfW }
    for (const el of area.waterways) {
      if (el.type !== 'way' || !el.geometry?.length || el.geometry.length < 2) continue;
      const halfW = 12 * scaleFactor / 2;
      const pts = dpSimplify(el.geometry.map(g => pr(g.lat, g.lon)), lineEps);
      if (pts.length >= 2) waterwayLines.push({ pts, halfW });
    }

    // Area voids for subtraction (oriented rings, area_large eps — see above).
    const waterPolys = collectAreaPolys(area.water, pr);
    const greenPolys = collectAreaPolys(area.green, pr);
    const landcoverPolys = collectAreaPolys(area.landcover, pr);

    // Building centres for classification, building rings for hamlet blobs.
    const buildingCenters = [];
    for (const el of (buildingElements || [])) {
      const center = buildingCenterPx(el, pr);
      if (center) buildingCenters.push(center);
    }
    const clusterRings = prepareClusterData(buildingElements || [], pr);

    // Ground scale, for the countryside threshold and the hamlet buffers
    // (metres → px). Mercator stretch across a city-scale bbox is negligible
    // for either. COUNTRYSIDE_MIN_KM2 is v1's shared 0.35 km² constant.
    const midLat = (bbox.north + bbox.south) / 2;
    const mPerPx = ((bbox.east - bbox.west) * 111320 * Math.cos(midLat * Math.PI / 180)) / W;
    const bigFacePx2 = COUNTRYSIDE_MIN_KM2 * 1e6 / (mPerPx * mPerPx);

    return {
      cutterLines, waterwayLines, waterPolys, greenPolys, landcoverPolys,
      buildingCenters, clusterRings, W, H, bigFacePx2, mPerPx,
      // Roads/rail cutters plus waterway strokes, in the {pts,halfW} shape the
      // coverage lint's markLine expects (it treats these as painted corridors).
      lines: cutterLines.concat(waterwayLines),
    };
  }

  // Run the face cutter in a Web Worker. Resolves { blocks }. Mirrors v1's
  // computeBlocksAsync lifecycle; the message protocol is shape-compatible
  // with v1's ({type:'progress'} / {type:'done', ...}).
  function computeFacesAsync(cutterResults, buildingElements, classified, pr, W, H, onProgress, opts = {}) {
    return new Promise((resolve) => {
      const data = prepareFaceData(cutterResults, buildingElements, classified, pr, W, H, opts.bbox);
      if (!data.cutterLines.length) { resolve({ blocks: [] }); return; }

      const worker = new Worker(getFaceWorkerUrl());
      worker.onmessage = function(e) {
        if (e.data.type === 'progress' && onProgress) onProgress(e.data.msg, e.data.pct);
        if (e.data.type === 'done') {
          worker.terminate();
          resolve({ blocks: e.data.blocks });
        }
      };
      worker.onerror = function(err) {
        worker.terminate();
        console.error('Face worker error:', err);
        resolve({ blocks: [] }); // fail gracefully — skip blocks
      };
      worker.postMessage(data);
    });
  }

  // Render the derived city_blocks result: the primary cream faces. Only urban
  // and hamlet blocks paint; countryside placeholders (kept for the coverage
  // lint) and fallback patches (their own group) are skipped here. Evenodd, so
  // subtracted water/green become holes. One <path> per block.
  function renderCityBlocks(blocks, ctx) {
    let urbanCount = 0, hamletCount = 0;
    // Hamlet blobs sit in open countryside with no road casing around them, so
    // (as in v1) they carry a casing-toned outline of their own — without it
    // the cream fill vanishes against the pale landcover painting beneath.
    const hamletStroke = ` stroke="${ctx.preset.buildingStroke}" stroke-width="${(2.5 * getScaleFactor(ctx.W)).toFixed(2)}" stroke-linejoin="round"`;
    const paths = (blocks || []).filter(blk => blk.kind === 'urban' || blk.kind === 'hamlet').map(blk => {
      const isHamlet = blk.kind === 'hamlet';
      const [id, label] = isHamlet
        ? [`hamlet_${++hamletCount}`, `Hamlet ${hamletCount}`]
        : [`block_${++urbanCount}`, `Block ${urbanCount}`];
      const d = blk.outer + (blk.holes && blk.holes.length ? ' ' + blk.holes.join(' ') : '');
      return `<path id="${id}" inkscape:label="${label}" d="${d}" fill="${CREAM}" fill-rule="evenodd"${isHamlet ? hamletStroke : ' stroke="none"'}/>`;
    }).join('\n    ');
    if (!paths) return '';
    return `  <g id="city_blocks" inkscape:label="City blocks" inkscape:groupmode="layer">\n    ${paths}\n  </g>\n`;
  }

  // Render the coverage-fallback patches: cream land that no other layer covered
  // (buildingless small faces, dry river islands, OSM data gaps). Visually
  // identical to a city block, but its own group so gaps stay auditable and
  // countable. Sits below water in layerOrder, same as city_blocks.
  function renderFallbackBlocks(blocks) {
    let n = 0;
    const paths = (blocks || []).filter(blk => blk.kind === 'fallback').map(blk => {
      const d = blk.outer + (blk.holes && blk.holes.length ? ' ' + blk.holes.join(' ') : '');
      return `<path id="fallback_${++n}" inkscape:label="Fallback ${n}" d="${d}" fill="${CREAM}" fill-rule="evenodd" stroke="none"/>`;
    }).join('\n    ');
    if (!paths) return '';
    return `  <g id="fallback_blocks" inkscape:label="Fallback blocks" inkscape:groupmode="layer">\n    ${paths}\n  </g>\n`;
  }

  // ── Squares + tunnels (milestone 6) ────────────────────────────────
  // Tunnels are not surface: tunnel=yes|culvert ways drop from the drawn
  // road/rail/tram network and from street labels (the block cutter already
  // drops them since M2, so a tunnel neither draws nor bounds a block).
  // Bridges, tunnel=building_passage and covered=yes stay — those are
  // usable surface. Metro is the deliberate exception: that layer IS the
  // underground network, drawn as a schematic overlay, so it keeps its
  // tunnel segments.
  const isTunnelElement = (el) => /^(yes|culvert)$/.test(el.tags?.tunnel || '');

  // An open plaza: canonical square tagging (the shared isSquareTagged
  // predicate, also used by the street-label builder) on a closed way that is
  // not a roundabout. A square renders as one filled polygon in the pedestrian
  // surface colour instead of having its ring stroked as a street. Its
  // perimeter still feeds the block cutter, so neighbouring cream keeps
  // ending at the plaza edge.
  function isSquareElement(el) {
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 4) return false;
    if (!isSquareTagged(el.tags)) return false;
    if (el.tags?.junction === 'roundabout') return false;
    return samePt(el.geometry[0], el.geometry[el.geometry.length - 1]);
  }

  function renderSquares(squareElements, ctx) {
    if (!squareElements.length) return '';
    const fill = ctx.preset.roads.pedestrian.fill;
    const uid = makeUidGen();
    let paths = '';
    for (const el of squareElements) {
      const d = geomToPathD(el.geometry, ctx.pr, ctx.EPS.area, true);
      if (!d) continue;
      const name = el.tags?.name;
      const id = uid(name ? `square_${safeName(name)}` : `square${el.id ? '_' + el.id : ''}`);
      // Same self-coloured seam stroke the water bodies carry: it seals the
      // sub-pixel gap between the plaza edge and the abutting block edge.
      paths += `<path id="${id}" inkscape:label="${escXml(name || 'Square')}" d="${d}" fill="${fill}" fill-rule="evenodd" stroke="${fill}" stroke-width="1" stroke-linejoin="round"/>`;
    }
    if (!paths) return '';
    return `  <g id="squares" inkscape:label="Squares" inkscape:groupmode="layer">\n    ${paths}\n  </g>\n`;
  }

  // v2's per-layer dispatcher. Derived block layers render from precomputed
  // worker geometry; fetch-only inputs (buildings, area_features) never
  // render here; roads/rail/tram/street-labels get the square + tunnel
  // treatment above; everything else is byte-for-byte v1, delegated to
  // renderLayerSVG (water/parks/landcover/waterways included).
  function renderLayer(result, ctx) {
    if (fetchOnlyIds.has(result.layer.id)) return '';
    if (result.layer.id === 'city_blocks') return renderCityBlocks(result.data?.blocks || [], ctx);
    if (result.layer.id === 'fallback_blocks') return renderFallbackBlocks(result.data?.blocks || []);
    if (result.layer.id === 'roads') {
      const elements = result.data?.elements || [];
      const squares = elements.filter(isSquareElement);
      const streets = elements.filter(el => !isSquareElement(el) && !isTunnelElement(el));
      // Squares paint first, so street strokes crossing a plaza stay on top.
      return renderSquares(squares, ctx)
        + renderLayerSVG({ layer: result.layer, data: { elements: streets } }, ctx);
    }
    if (result.layer.type === 'rail' || result.layer.type === 'tram' || result.layer.id === streetLabelsLayer.id) {
      const surfaceElements = (result.data?.elements || []).filter(el => !isTunnelElement(el));
      return renderLayerSVG({ layer: result.layer, data: { elements: surfaceElements } }, ctx);
    }
    return renderLayerSVG(result, ctx);
  }

  // v2's one-shot assembly, mirroring v1's buildSVG. Results-only: the caller
  // has already computed the blocks and separated out the fetch-only inputs.
  //
  // Context: we reuse v1's buildSVGContext unchanged, with precomputedBlocks
  // = null — v2's blocks ride in a result's data.blocks, not ctx.
  function buildSVG(results, exportBbox, widthPx, physicalWidthMm = null, options = {}) {
    const ctx = buildSVGContext(exportBbox, widthPx, null, options);
    let layersSVG = '';
    for (const result of sortResults(results)) {
      layersSVG += renderLayer(result, ctx);
    }
    return ctx.illustratorCompatible
      ? wrapSVGIllustrator(layersSVG, ctx, physicalWidthMm)
      : wrapSVG(layersSVG, ctx, physicalWidthMm);
  }

  // Browser-side v2 orchestration. Mirrors v1's doExport shape but lean:
  // v2 ignores the layer checkboxes and always builds its own fixed layer
  // set. Reuses v1's shared helpers (bbox guard, area-name resolution,
  // size/width computation, fetchLayer, progress overlay, preview, history)
  // so preview/download/history behave identically.
  async function doExport() {
    if (!bbox) return;

    // Area-name resolution — identical to v1: await any in-flight
    // reverse-geocode, then fall back to the shared name-prompt modal.
    if (areaNameLookup) {
      setStatus('Looking up a name for this area…', 'loading');
      await areaNameLookup;
    }
    if (!slugifyName(currentAreaName)) {
      const typed = await promptForAreaName();
      if (typed === null) {
        setStatus('Export cancelled — no name given', 'error');
        return;
      }
      setAreaName(typed);
    }
    const areaName = currentAreaName;
    const areaSlug = slugifyName(areaName);

    const physicalWidthMm = getPhysicalSizeMm(bbox).mmW;
    const widthPx = Math.round(physicalWidthMm / 25.4 * PRINT_DPI);
    const illustratorCompatible = document.getElementById('format-select')?.value !== 'svg-standard';
    const bboxStr = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;

    // YYYY-MM-DD-HHMMSS local time, same as v1, with a `-v2` marker before
    // the timestamp so v1 and v2 exports of the same area never collide and
    // stay distinguishable on disk.
    const now = new Date();
    const pad2 = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
    const filename = `map-${activePreset}-${areaSlug}-v2-${stamp}${illustratorCompatible ? '-illustrator' : ''}.svg`;

    document.getElementById('btn-export').disabled = true;

    const stages = [
      { id: 'fetch', label: 'Fetch layers' },
      { id: 'faces', label: 'Cut faces' },
      { id: 'render', label: 'Render SVG' },
      { id: 'finalize', label: 'Finalize' },
    ];
    progress.begin(stages);
    progress.log(`Engine v2 export: ${widthPx}px wide (${(physicalWidthMm / 10).toFixed(1)}cm @ ${PRINT_DPI}dpi), style “${activePreset}”`);

    // Fetch stage. One fetchLayer call per v2 layer with an overpassQuery
    // (roads, rail, buildings). No combined-tile pooling yet — the single
    // combined v2 bundle arrives with the area-features milestone (M3).
    const fetchableLayers = layers.filter((l) => typeof l.overpassQuery === 'function');
    progress.setStage('fetch', 'active', { meta: `0/${fetchableLayers.length}` });
    const results = [];
    let fetched = 0;
    let totalFailedTiles = 0;
    for (const layer of fetchableLayers) {
      progress.setStage('fetch', 'active', {
        meta: `${fetched}/${fetchableLayers.length}`,
        detail: layer.label,
      });
      const { elements, failedTiles } = await fetchLayer(layer, bboxStr, bbox);
      totalFailedTiles += failedTiles.length;
      // fetchLayer returns raw tile elements; the per-layer tagFilter narrows
      // them to this layer's slice (v1 applies it in its combined fetch loop).
      const kept = layer.tagFilter ? elements.filter(layer.tagFilter) : elements;
      results.push({ layer, data: { elements: kept, failedTiles } });
      fetched++;
      progress.log(`${layer.id}: ${kept.length} element${kept.length === 1 ? '' : 's'}`);
      progress.bar(Math.round((fetched / fetchableLayers.length) * 55));
    }
    progress.setStage('fetch', 'done', { meta: `${fetched}/${fetchableLayers.length}`, detail: '' });

    const totalElements = results.reduce((sum, r) => sum + (r.data?.elements?.length || 0), 0);
    if (!totalElements) {
      progress.log('No elements fetched — aborting export', { warn: true });
      progress.end();
      document.getElementById('btn-export').disabled = false;
      setStatus('Nothing to render — check your connection', 'error');
      return;
    }

    // Classify the combined area-features fetch into the render layers and the
    // worker's subtraction geometry. The sea is closed against the bbox here and
    // folded into the water bucket. area_features itself is fetch-only.
    const areaFeatureElements = results.find(r => r.layer.id === areaFeaturesLayer.id)?.data.elements || [];
    const { renderResults: areaRenderResults, classified } = buildAreaResults(areaFeatureElements, bbox);

    // Faces stage. The cutter reads roads + rail/tram/metro; buildings classify
    // faces and seed hamlet blobs; water/green/landcover/waterways feed the
    // mechanical subtraction. Buildings and area_features are fetch-only.
    progress.setStage('faces', 'active', { detail: 'Starting worker…' });
    const { pr, H } = makeProjector(bbox, widthPx);
    const buildingElements = results.find(r => r.layer.id === buildingsLayer.id)?.data.elements || [];
    // Cutter input = roads + rail/tram/metro only (buildings + area_features are
    // not cutters; area geometry subtracts, it does not bound faces).
    const cutterResults = results.filter(r => r.layer.type === 'roads' || r.layer.type === 'rail' || r.layer.type === 'tram' || r.layer.type === 'metro');
    const onFaceProgress = (msg, pct) => {
      progress.setStage('faces', 'active', { detail: msg });
      progress.bar(55 + Math.round(pct * 0.25));
    };
    const { blocks } = await computeFacesAsync(cutterResults, buildingElements, classified, pr, widthPx, H, onFaceProgress, { bbox });
    const urbanBlocks = blocks.filter(b => (b.kind || 'urban') === 'urban').length;
    const hamletBlocks = blocks.filter(b => b.kind === 'hamlet').length;
    const fallbackBlocks = blocks.filter(b => b.kind === 'fallback').length;
    progress.setStage('faces', 'done', { meta: `${urbanBlocks + hamletBlocks} blocks` });
    progress.log(`city_blocks: ${urbanBlocks} urban, ${hamletBlocks} hamlet; fallback_blocks: ${fallbackBlocks} patches`);

    // Renderable results = everything except the fetch-only inputs, plus the
    // classified area layers and the two derived block layers. Both block
    // results carry the full block list; each renderer filters by kind.
    const renderableResults = results.filter(r => !fetchOnlyIds.has(r.layer.id));
    renderableResults.push(...areaRenderResults);
    renderableResults.push({ layer: cityBlocksLayer, data: { blocks } });
    renderableResults.push({ layer: fallbackBlocksLayer, data: { blocks } });

    // Cache for the shared live-preview path.
    lastResults = renderableResults;

    // Render stage.
    progress.setStage('render', 'active', { detail: 'Assembling SVG…' });
    await new Promise((r) => setTimeout(r, 0));
    const svg = buildSVG(renderableResults, bbox, widthPx, physicalWidthMm, { illustratorCompatible });
    progress.setStage('render', 'done', { meta: `${renderableResults.length} layer${renderableResults.length > 1 ? 's' : ''}`, detail: '' });
    progress.bar(90);

    // Finalize — same conventions as v1 so preview/download/history work.
    progress.setStage('finalize', 'active', { detail: 'Wrapping up…' });
    const actualMB = (svg.length / 1024 / 1024).toFixed(1);
    lastSvgString = svg;
    lastSvgFilename = filename;
    progress.setStage('finalize', 'done', { meta: `${actualMB} MB`, detail: '' });
    progress.bar(100);
    progress.log(`Done — ${actualMB} MB, ${totalElements.toLocaleString()} elements`);

    await new Promise((r) => setTimeout(r, 250));
    progress.end();
    showPreview(svg, filename);
    document.getElementById('btn-export').disabled = false;
    setStatus(`✓ Engine v2 · ${widthPx}px wide · ${actualMB} MB · ${urbanBlocks + hamletBlocks} blocks · ${fallbackBlocks} fallback`, 'success');
    saveHistory(bbox, activePreset, widthPx, filename, actualMB, totalElements, areaName);
  }

  return {
    layers, layerOrder, buildSVG, doExport,
    // Exposed for the headless test harness (tests/real-export.mjs).
    FACE_WORKER_SRC, prepareFaceData, fetchOnlyIds, buildingsLayer, cityBlocksLayer, fallbackBlocksLayer,
    areaFeaturesLayer, AREA_FEATURES, classifyAreaFeatures, buildAreaResults, buildSeaElements,
  };
})();
