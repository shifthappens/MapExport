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
// the shared context; squares neither cut nor paint (they read cream as land,
// named ones get a feature label); tunnels neither draw nor bound blocks. See
// plans/2026-07-10_export-engine-v2.md — the milestone
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
  // the builders draw is v1 semantics, unchanged. Transit stops (dot symbols)
  // are deliberately OFF in v2 (removed 2026-07-12): they cluttered the clean
  // USE-IT plate without carrying wayfinding value at this scale, so v2's fixed
  // layer set simply omits them. v1's registry keeps the layer untouched.
  const railLayer = findLayer('rail');
  const tramLayer = findLayer('tram');
  const metroLayer = findLayer('metro');

  // Labels reuse the full v1 engine (placement, collision grid, abbreviations,
  // both emission pipelines) via renderLayerSVG. Feature labels render before
  // street labels in layerOrder: they have exactly one possible anchor, so
  // they stamp the shared ctx.labelGrid first — same reasoning as v1's
  // LAYER_ORDER. Rail corridors stamped that grid earlier in the same pass.
  const waterLabelsLayer = findLayer('water_labels');
  const streetLabelsLayer = findLayer('street_labels');

  // Buildings are fetched for every v2 export (bounding boxes) and serve two
  // purposes: classifying faces (does a small face contain a building?) and
  // forming hamlet blobs inside rural faces — and, in v2, draws standalone
  // buildings on green-open land, which needs REAL footprints rather than the
  // bounds rectangles v1's hamlet merge is happy with (a relation's bounds box
  // spans its whole campus — Ghent stamped one across the Coupure). Same query
  // as v1, geometry output; the cache key hashes overpassOut, so v1's
  // bounds-only entries and these coexist. Fetch-only, never rendered as a
  // layer of its own.
  const buildingsLayer = { ...BLOCK_BUILDINGS_LAYER, overpassOut: 'body geom' };

  // The buildings fetch (and ONLY that fetch) is padded past the frame by this
  // many ground metres. A clipped edge face keeps its buildings even when they
  // all sit just outside the frame, so it classifies urban instead of falling to
  // Uncategorized (cause A of the misclassification study). Buildings never paint
  // or cut, so the geometry is unaffected; the padded bbox just gets its own
  // cache entry (Overpass cost is not a design input, §8).
  const BUILDING_FETCH_PAD_M = 100;
  function padBboxMeters(b, meters) {
    const dLat = meters / 111320;
    const midLat = (b.north + b.south) / 2;
    const dLon = meters / (111320 * Math.cos(midLat * Math.PI / 180));
    return { south: b.south - dLat, north: b.north + dLat, west: b.west - dLon, east: b.east + dLon };
  }

  // The area-features layers v2 renders into. These are v1's own registry
  // objects, so their per-feature renderers (mechanical stitch + evenodd fill,
  // colours from PRESETS.useit) are reused verbatim by feeding them the
  // elements the AREA_FEATURES classifier bucketed. See classifyAreaFeatures.
  const waterBodiesLayer = findLayer('water_bodies');
  const waterwaysLayer = findLayer('waterways');
  const parksLayer = findLayer('parks');
  const landcoverLayer = findLayer('landcover');

  // Beach/sand is v2-only — v1 has no such layer, so there is nothing to look
  // up in LAYER_REGISTRY; v2 owns id/label itself. Rendered by renderBeach
  // (paint-only overlay, no subtraction void — see AREA_FEATURES below).
  const beachLayer = { id: 'beach', label: 'Beaches' };

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
      // Sports/recreation: label-only (no AREA_FEATURES row — nameless green
      // in cities broke the named-parks rule; named nature reserves still
      // paint via the gate row).
      `wr["leisure"~"^(pitch|stadium|sports_centre|golf_course|dog_park|nature_reserve)$"](${b});`,
      // Countryside land cover (named forests classify as green above; the
      // nameless remainder is the countryside land the block cutter shows through).
      `wr["landuse"~"^(farmland|meadow|forest)$"](${b});`,
      `wr["natural"="wood"](${b});`,
      // Grass display tint (v2-only): unnamed parks/gardens paint as green under
      // fallback holes and in countryside — v1's ISLAND_GREEN look, never ported.
      // landuse=grass/village_green already arrive via the label-only landuse
      // sweep below; unnamed leisure=park/garden are matched by neither the named
      // parksNamedGate fetch above nor that sweep, so they need their own line.
      // This is a PAINT signal only — the grass rows are excluded from the
      // open-land classification signal (see AREA_FEATURES / the face worker).
      `wr["leisure"~"^(park|garden)$"](${b});`,
      // Label-only sweep. Never painted: anything here that no AREA_FEATURES
      // row claims lands in the labelOnly bucket, used solely to give
      // Uncategorized patches a designer-facing name (what OSM says the land
      // is). Broad on purpose — fetch cost is not a design input, and the
      // parksNamedGate/table rows are tag-specific, so widening the fetch
      // cannot widen what paints.
      `wr["landuse"](${b});`,
      `wr["natural"~"^(scrub|shrubbery|heath|grassland|sand|beach|wetland|shingle|bare_rock)$"](${b});`,
      `wr["amenity"="parking"](${b});`,
      `wr["man_made"~"^(embankment|pier|breakwater)$"](${b});`,
      `wr["aeroway"~"^(aerodrome|apron|runway|taxiway|helipad)$"](${b});`,
      `wr["military"](${b});`,
    ].join(''),
  };

  // Rural place nodes (v2-only) ground hamlet blobs: a morphological cluster
  // blob paints as a hamlet only when one of these attests a nearby settlement
  // (see the grounding helpers). Nodes ONLY — a place=* on a way/relation is a
  // boundary label, not a settlement point. Fetch-only: classified into
  // {x,y,tier,name} on the main thread and passed to the face worker.
  const placeNodesLayer = {
    id: 'place_nodes', label: 'Place nodes', type: 'fetch',
    overpassQuery: (b) => `node["place"~"^(hamlet|isolated_dwelling|farm|village|locality)$"](${b});`,
  };

  // v2 owns its own derived layer entries (no overpassQuery). Their geometry is
  // computed by the face worker and pushed in as results whose data carries
  // { blocks }, not { elements }. city_blocks holds the primary cream faces and
  // hamlet blobs; fallback_blocks holds the coverage-guarantee patches (see
  // renderFallbackBlocks). Both sit below water in layerOrder.
  const cityBlocksLayer = { id: 'city_blocks', label: 'City blocks', type: 'derived' };
  const fallbackBlocksLayer = { id: 'fallback_blocks', label: 'Fallback blocks', type: 'derived' };

  const layers = [roadsLayer, railLayer, tramLayer, metroLayer, waterLabelsLayer, streetLabelsLayer, buildingsLayer, areaFeaturesLayer, placeNodesLayer, cityBlocksLayer];

  // Fetched to feed the face cutter / classifier, but never rendered as their
  // own layer. area_features is the fetch vehicle for water/green/landcover —
  // those render under their own ids after classification, not as area_features.
  const fetchOnlyIds = new Set([buildingsLayer.id, areaFeaturesLayer.id, placeNodesLayer.id]);

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
    'beach',
    'roads',
    'rail',
    'tram',
    'metro',
    'water_labels',
    'street_labels',
  ];

  // Cream fill for city blocks. v1 renders blocks as #FEF6ED at
  // fill-opacity="0.8" over white — a pure style choice from commit a7ab512.
  // v2 bakes that flattened colour as a solid fill with no opacity attribute,
  // deliberately: the opacity carried no meaning, so folding it out keeps the
  // block a single opaque paint that later layers can sit cleanly above.
  const CREAM = '#FEF8F1';

  // Beach/sand fill. Pale warm sand — more saturated than block cream
  // (#FEF8F1) so it reads as material, far from park green (#b8d89a) and
  // water blue, light enough not to compete with roads.
  const SAND = '#F5E6B8';

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
  //    beach     → beach        (sand — natural=beach|sand, v2-only layer)
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
    // so v2 keeps the "named parks only, not every verge" look. No nameless
    // sports/recreation row: v1 never fetches pitches/sports centres, and a
    // nameless-green row broke the named-only rule in cities (Bremerhaven
    // review) — those elements are still fetched, but label-only.
    { match: (t) => parksNamedGate({ type: 'way', tags: t }), category: 'green' },
    // Countryside land cover: farmland/meadow → field tint, wood/forest → park
    // green. v1's landcover renderer picks the colour from the tag.
    { match: (t) => /^(farmland|meadow)$/.test(t.landuse || ''), category: 'landcover' },
    { match: (t) => t.landuse === 'forest' || t.natural === 'wood', category: 'landcover' },
    // Grass display rows (v2-only, category 'grass'): landuse=grass/village_green
    // and UNNAMED leisure=park/garden. They paint through the landcover layer
    // (green tint) exactly like the rows above, and subtract from the fallback
    // void so they show through fallback holes — but they are deliberately a
    // SEPARATE category so they can be kept OUT of the open-land classification
    // signal (the ≥0.35 share test). Grass in the signal would flip genuinely
    // urban faces en masse: Tilburg tags 39% of its Uncategorized patches
    // landuse=grass. Named parks/gardens matched the green row above already; the
    // !name guard here keeps this to the nameless remainder.
    { match: (t) => /^(grass|village_green)$/.test(t.landuse || ''), category: 'grass' },
    { match: (t) => /^(park|garden)$/.test(t.leisure || '') && !t.name, category: 'grass' },
    // Beach/sand: its own paint-only overlay layer, placed after landcover and
    // before the label-only fallthrough so it wins the patch instead of just
    // naming an Uncategorized one. Paints above blocks (like parks) but is
    // NOT part of any subtraction void — cream stays underneath.
    { match: (t) => /^(beach|sand)$/.test(t.natural || ''), category: 'beach' },
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
    const water = [], green = [], landcover = [], grass = [], beach = [], waterways = [], coastline = [], labelOnly = [];
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
      else if (category === 'grass') grass.push(el);
      else if (category === 'beach') beach.push(el);
      // No row claims it → label-only: never painted, but its tags name the
      // land under an Uncategorized patch (see renderFallbackBlocks). Beach
      // elements are matched by the row above, so they never reach here and
      // never surface as an "Uncategorized"/labelled patch underneath.
      else if (el.tags) labelOnly.push(el);
    }
    return { water, green, landcover, grass, beach, waterways, coastline, labelOnly };
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
  // Scope (per plans/2026-07-07_coastline-sea-fill.md): handles any number of
  // coast crossings (estuaries, archipelagos — one shared boundary walk joins
  // all runs) and closed island rings inside the frame (holes by orientation).
  // Punts on a frame entirely at sea with no coastline in view (assumes land,
  // a no-op) and on lakes-in-islands-in-lakes. Asserted offline by
  // tests/sea-sign.mjs and against Bremerhaven/Oulu in M7 validation.

  const samePt = (a, b) => Math.abs(a.lat - b.lat) < 1e-9 && Math.abs(a.lon - b.lon) < 1e-9;

  // Stitch coastline ways end-to-end into maximal chains. Each chain is
  // { pts, names }: names collects the name= of every contributing way, so
  // the sea naming in buildSeaElements can tell island names from open
  // coast's — an island ring split into several individually-open ways
  // (Oulu's islet "Elba") only reveals itself as an island AFTER stitching,
  // when the chain closes.
  function stitchCoastlineChains(ways) {
    const remaining = ways.filter(w => w.geometry && w.geometry.length >= 2)
      .map(w => ({ pts: w.geometry.slice(), names: w.tags?.name ? [w.tags.name] : [] }));
    const chains = [];
    while (remaining.length) {
      let chain = remaining.shift();
      let grew = true;
      while (grew) {
        grew = false;
        for (let i = 0; i < remaining.length; i++) {
          const seg = remaining[i];
          const cp = chain.pts, sp = seg.pts;
          if (samePt(cp[cp.length - 1], sp[0])) chain.pts = cp.concat(sp.slice(1));
          else if (samePt(cp[cp.length - 1], sp[sp.length - 1])) chain.pts = cp.concat(sp.slice(0, -1).reverse());
          else if (samePt(cp[0], sp[sp.length - 1])) chain.pts = sp.slice(0, -1).concat(cp);
          else if (samePt(cp[0], sp[0])) chain.pts = sp.slice(1).reverse().concat(cp);
          else continue;
          chain.names = chain.names.concat(seg.names);
          remaining.splice(i, 1);
          grew = true;
          break;
        }
      }
      chains.push(chain);
    }
    return chains;
  }

  // A closed ring stored with its seam vertex inside the frame would be
  // clipped into two dangling half-runs (each with one interior endpoint) and
  // dropped as incomplete — Oulu's edge-straddling islands hit this. Rotate
  // such rings to start at a vertex outside the bbox so the clip only splits
  // at true edge crossings. Fully-interior rings are left alone (they stay
  // closed and classify as island/lagoon by orientation).
  function rotateSeamOutsideBbox(chain, bbox) {
    if (!samePt(chain[0], chain[chain.length - 1])) return chain;
    const inside = (p) => p.lat >= bbox.south && p.lat <= bbox.north && p.lon >= bbox.west && p.lon <= bbox.east;
    if (!inside(chain[0])) return chain;
    const open = chain.slice(0, -1);
    const k = open.findIndex(p => !inside(p));
    if (k < 0) return chain;
    const rotated = open.slice(k).concat(open.slice(0, k));
    rotated.push(rotated[0]);
    return rotated;
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

  // Perimeter parameter (counterclockwise from the SW corner) of a point on
  // the bbox edge, plus the frame corners — shared by the sea-closing walk.
  // The 1e-7° tolerance absorbs the float error of clipped crossing points.
  function perimeterGeometry(bbox) {
    const width = bbox.east - bbox.west, height = bbox.north - bbox.south;
    const total = 2 * (width + height);
    const param = (p) => {
      if (Math.abs(p.lat - bbox.south) < 1e-7) return p.lon - bbox.west;                    // bottom
      if (Math.abs(p.lon - bbox.east) < 1e-7) return width + (p.lat - bbox.south);          // right
      if (Math.abs(p.lat - bbox.north) < 1e-7) return width + height + (bbox.east - p.lon); // top
      return 2 * width + height + (bbox.north - p.lat);                                     // left
    };
    const corners = [
      { t: width, p: { lon: bbox.east, lat: bbox.south } },
      { t: width + height, p: { lon: bbox.east, lat: bbox.north } },
      { t: 2 * width + height, p: { lon: bbox.west, lat: bbox.north } },
      { t: total, p: { lon: bbox.west, lat: bbox.south } },
    ];
    return { param, corners, total };
  }

  const onBboxEdge = (p, bbox) =>
    Math.abs(p.lat - bbox.south) < 1e-7 || Math.abs(p.lat - bbox.north) < 1e-7 ||
    Math.abs(p.lon - bbox.west) < 1e-7 || Math.abs(p.lon - bbox.east) < 1e-7;

  // Shoelace orientation of a lat/lon ring: positive = counterclockwise.
  const ringIsCCWLatLon = (ring) => ring.reduce((sum, p, i) => {
    const q = ring[(i + 1) % ring.length];
    return sum + (p.lon * q.lat - q.lon * p.lat);
  }, 0) > 0;

  // Close the open boundary runs into sea polygons with one shared walk: from
  // each run's exit the sea boundary continues along the frame edge CLOCKWISE
  // (decreasing perimeter parameter — the direction that keeps the water,
  // which lies on the RIGHT of the coastline direction, enclosed) until it
  // meets the nearest entry of any run, collecting frame corners on the way.
  // This handles any number of coast crossings (estuaries, archipelagos) —
  // the single-run-at-a-time closure it replaces stacked overlapping
  // whole-frame polygons on Oulu's 25-crossing coastline.
  function closeSeaRuns(runs, bbox) {
    if (!runs.length) return [];
    const { param, corners, total } = perimeterGeometry(bbox);
    const norm = (t) => ((t % total) + total) % total;
    const entries = runs.map((run, index) => ({ index, t: param(run[0]) }));
    const visited = new Array(runs.length).fill(false);
    const polygons = [];
    for (let start = 0; start < runs.length; start++) {
      if (visited[start]) continue;
      const ring = [];
      let currentIndex = start;
      // Consistent data returns to the start run within runs.length hops.
      for (let hop = 0; hop <= runs.length; hop++) {
        visited[currentIndex] = true;
        ring.push(...runs[currentIndex]);
        const exitT = param(runs[currentIndex][runs[currentIndex].length - 1]);
        // Nearest entry clockwise from this exit (0 = the run closes onto its
        // own entry after a full lap, so treat it as the farthest).
        let next = null;
        for (const e of entries) {
          const distance = norm(exitT - e.t) || total;
          if (!next || distance < next.distance) next = { index: e.index, distance };
        }
        const passedCorners = corners
          .map((c) => ({ p: c.p, distance: norm(exitT - c.t) }))
          .filter((c) => c.distance > 0 && c.distance < next.distance)
          .sort((a, z) => a.distance - z.distance);
        ring.push(...passedCorners.map((c) => c.p));
        if (next.index === start) break;
        if (visited[next.index]) {
          console.warn('engine-v2: inconsistent coastline runs — sea polygon closed early');
          break;
        }
        currentIndex = next.index;
      }
      if (ring.length >= 3) {
        // Close explicitly so downstream stitching treats each polygon as a
        // finished ring and never tries to join two sea polygons end-to-end.
        ring.push(ring[0]);
        polygons.push(ring);
      }
    }
    return polygons;
  }

  // One synthetic multipolygon relation for the sea. Outer rings come from the
  // boundary walk plus any closed clockwise coastline rings (water inside — a
  // coastline-tagged lagoon); closed counterclockwise rings are islands (land
  // inside, per OSM's land-on-the-left convention) and become inner rings, so
  // the renderer's evenodd fill and the worker's oriented union both treat
  // them as holes. Empty (inland frame, no coastline) → a strict no-op.
  function buildSeaElements(coastlineWays, bbox, overrideName) {
    if (!coastlineWays || !coastlineWays.length) return [];
    const outerRings = [], innerRings = [], boundaryRuns = [], openChainNames = [];
    for (const chain of stitchCoastlineChains(coastlineWays)) {
      // Only chains that stay OPEN after stitching may name the sea: a chain
      // that closes is an island (or lagoon) ring carrying the island's name,
      // even when its constituent ways were individually open (Oulu's "Elba").
      if (!samePt(chain.pts[0], chain.pts[chain.pts.length - 1])) openChainNames.push(...chain.names);
      for (const run of clipChainToBbox(rotateSeamOutsideBbox(chain.pts, bbox), bbox)) {
        if (run.length >= 4 && samePt(run[0], run[run.length - 1])) {
          (ringIsCCWLatLon(run) ? innerRings : outerRings).push(run);
        } else if (onBboxEdge(run[0], bbox) && onBboxEdge(run[run.length - 1], bbox)) {
          boundaryRuns.push(run);
        } else {
          // An open chain that neither closes nor reaches the frame edge is
          // incomplete OSM data; painting a guessed sea would be worse than
          // painting none.
          console.warn(`engine-v2: dropping incomplete coastline chain (${run.length} pts, ` +
            `${run[0].lat.toFixed(5)},${run[0].lon.toFixed(5)} → ` +
            `${run[run.length - 1].lat.toFixed(5)},${run[run.length - 1].lon.toFixed(5)})`);
        }
      }
    }
    outerRings.push(...closeSeaRuns(boundaryRuns, bbox));
    if (!outerRings.length) {
      if (innerRings.length) console.warn('engine-v2: coastline islands without a sea polygon — dropped');
      return [];
    }
    // Name the sea. A manual override (the "Sea name" field / the
    // --sea-name CLI flag) wins over anything OSM says. Otherwise: if every
    // named coastline chain that stays OPEN after stitching agrees on one
    // name, use it. Closed chains are islands and carry the island's name,
    // never the sea's — tested on stitched chains, not raw ways, because a
    // split island ring is open way-by-way (openChainNames above); most open
    // coastline is unnamed (Bremerhaven's Außenweser) — with no override
    // those keep the generic 'Sea', which only names the layer group and
    // paints no map label (see buildAreaResults / ENGINE-V2.md §6).
    const override = typeof overrideName === 'string' ? overrideName.trim() : '';
    let seaName;
    if (override) {
      seaName = override;
    } else {
      const coastNames = new Set(openChainNames);
      seaName = coastNames.size === 1 ? coastNames.values().next().value : 'Sea';
    }
    return [{
      type: 'relation', id: 'sea', tags: { natural: 'water', name: seaName },
      members: [
        ...outerRings.map((geometry) => ({ type: 'way', role: 'outer', geometry })),
        ...innerRings.map((geometry) => ({ type: 'way', role: 'inner', geometry })),
      ],
    }];
  }

  // A robust interior point of the sea, for anchoring the sea's map label. The
  // bounds centre is useless here — for a coastal frame it usually lands on
  // land — so this walks the largest sea outer ring and returns the point
  // farthest from every boundary (outer edge AND island holes), a cheap
  // pole-of-inaccessibility grid probe. Returns { lat, lon } inside the water,
  // or null if the sea has no outer ring. Lat/lon space; longitude is scaled by
  // cos(lat) in the distance metric so the "most interior" pick stays roughly
  // isotropic. The point-in-ring / hole tests guarantee containment regardless
  // of the metric.
  function ringAreaLatLon(ring) {
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      a += ring[j].lon * ring[i].lat - ring[i].lon * ring[j].lat;
    }
    return Math.abs(a / 2);
  }
  function pointInRingLatLon(lat, lon, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const yi = ring[i].lat, xi = ring[i].lon, yj = ring[j].lat, xj = ring[j].lon;
      if (((yi > lat) !== (yj > lat)) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function distToRingLatLon(lat, lon, ring, kx) {
    let min = Infinity;
    const px = lon * kx, py = lat;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const ax = ring[j].lon * kx, ay = ring[j].lat, bx = ring[i].lon * kx, by = ring[i].lat;
      const dx = bx - ax, dy = by - ay;
      const t = (dx || dy) ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
      const cx = ax + t * dx, cy = ay + t * dy;
      const d = Math.hypot(px - cx, py - cy);
      if (d < min) min = d;
    }
    return min;
  }
  function seaInteriorPoint(seaRelation) {
    const outers = (seaRelation.members || []).filter(m => m.role === 'outer' && m.geometry?.length >= 3).map(m => m.geometry);
    const inners = (seaRelation.members || []).filter(m => m.role === 'inner' && m.geometry?.length >= 3).map(m => m.geometry);
    if (!outers.length) return null;
    let outer = outers[0], bestArea = ringAreaLatLon(outers[0]);
    for (const r of outers) { const a = ringAreaLatLon(r); if (a > bestArea) { bestArea = a; outer = r; } }
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const p of outer) {
      if (p.lat < minLat) minLat = p.lat; if (p.lat > maxLat) maxLat = p.lat;
      if (p.lon < minLon) minLon = p.lon; if (p.lon > maxLon) maxLon = p.lon;
    }
    const kx = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180) || 1;
    let best = null, bestDist = -1;
    const N = 32;
    for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) {
      const lat = minLat + (maxLat - minLat) * j / N;
      const lon = minLon + (maxLon - minLon) * i / N;
      if (!pointInRingLatLon(lat, lon, outer)) continue;
      let inHole = false;
      for (const h of inners) if (pointInRingLatLon(lat, lon, h)) { inHole = true; break; }
      if (inHole) continue;
      let d = distToRingLatLon(lat, lon, outer, kx);
      for (const h of inners) d = Math.min(d, distToRingLatLon(lat, lon, h, kx));
      if (d > bestDist) { bestDist = d; best = { lat, lon }; }
    }
    return best;
  }

  // Build the classified render results (water/waterways/parks/landcover) from
  // one area-features fetch, with the closed sea folded into the water bucket.
  // Each result reuses a v1 registry layer object, so renderLayerSVG paints it
  // exactly as v1 would. options.seaName is the manual sea-name override.
  // Returns { renderResults, classified, seaLabel } — classified (with sea
  // merged) also seeds the worker's subtraction geometry; seaLabel is a
  // synthetic water-label node (or null) for the label engine.
  function buildAreaResults(areaFeatureElements, bbox, options = {}) {
    const classified = classifyAreaFeatures(areaFeatureElements);
    const seaElements = buildSeaElements(classified.coastline, bbox, options.seaName);
    classified.water = classified.water.concat(seaElements);
    // The sea gets a RENDERED map label only when it has a real name — a manual
    // override, or a unique open-coastline name. The generic 'Sea' fallback
    // names the layer group but paints no label (ENGINE-V2.md §6). The anchor
    // is a robust interior point of the sea water, fed to v1's feature-label
    // engine as a natural=water node so it inherits the exact water styling,
    // halo and shared collision grid.
    let seaLabel = null;
    if (seaElements.length) {
      const name = seaElements[0].tags.name;
      if (name && name !== 'Sea') {
        const anchor = seaInteriorPoint(seaElements[0]);
        if (anchor) seaLabel = { type: 'node', id: 'sea_label', lat: anchor.lat, lon: anchor.lon, tags: { natural: 'water', name } };
      }
    }
    const renderResults = [
      // Landcover PAINT set = the open-land signal cover (farmland/meadow/
      // wood/forest) plus the grass display rows (grass/village_green, unnamed
      // park/garden). The two are one painted layer but split for classification:
      // only the former feeds the open-land share test (see prepareFaceData /
      // the face worker). Order is landcover-then-grass, matched exactly by the
      // worker's landcoverElements so the occlusion-cull indices line up.
      { layer: landcoverLayer, data: { elements: [...classified.landcover, ...classified.grass] } },
      { layer: waterBodiesLayer, data: { elements: classified.water } },
      { layer: waterwaysLayer, data: { elements: classified.waterways } },
      { layer: parksLayer, data: { elements: classified.green } },
      { layer: beachLayer, data: { elements: classified.beach } },
    ];
    return { renderResults, classified, seaLabel };
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

  // ── Hamlet grounding ────────────────────────────────────────────────
  // A morphological cluster blob only becomes a hamlet when OSM attests a
  // nearby rural settlement via a place node, so urban forest/harbour/park
  // faces that read as "countryside" stop growing invented cream hamlets. Two
  // tiers, radii in ground metres (the worker converts to px via mPerPx): a
  // settlement-tier node (place=hamlet/isolated_dwelling/farm/village) grounds
  // a blob within HAMLET_GROUND_SETTLEMENT_M; a locality-tier node
  // (place=locality — named but formally unpopulated, e.g. French lieux-dits)
  // only within the tighter HAMLET_GROUND_LOCALITY_M.
  //
  // Radii measured on the three-city diagnosis (2026-07-12): Nievre's 59 real
  // hamlets are all ≤928 m from a hamlet/isolated_dwelling node (≤442 m from
  // any rural node); Bremerhaven's 36 false blobs have zero rural place nodes
  // in the bbox; Oulu's 71 false blobs are ≥588 m from the only rural node (a
  // locality). 1000 m / 300 m keeps all 59 real and rejects all 107 false.
  const HAMLET_GROUND_SETTLEMENT_M = 1000;
  const HAMLET_GROUND_LOCALITY_M = 300;

  // Pure, unit-agnostic (all lengths in export px). Both are stringified into
  // the face worker below AND exercised offline by tests/hamlet-grounding.mjs.

  // Distance from a point to a polygon ring: 0 when the point is inside the
  // ring, else the smallest distance to any ring segment. Simple O(vertices)
  // pass — blob and node counts are tiny, so nothing cleverer is warranted.
  function pointToPolygonDistancePx(px, py, ringPx) {
    let inside = false;
    for (let i = 0, j = ringPx.length - 1; i < ringPx.length; j = i++) {
      const xi = ringPx[i][0], yi = ringPx[i][1], xj = ringPx[j][0], yj = ringPx[j][1];
      if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) return 0;
    let min = Infinity;
    for (let i = 0, j = ringPx.length - 1; i < ringPx.length; j = i++) {
      const ax = ringPx[j][0], ay = ringPx[j][1], bx = ringPx[i][0], by = ringPx[i][1];
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
      let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d < min) min = d;
    }
    return min;
  }

  // The nearest place node that grounds this contour, or null when none is in
  // range: a settlement-tier node within settlementRadiusPx, a locality-tier
  // node within localityRadiusPx (distance 0 when the node sits inside the
  // contour). "Nearest" is by boundary distance among the in-range nodes, so
  // an emitted hamlet takes its closest attesting name.
  function groundHamletContour(ringPx, placeNodesPx, settlementRadiusPx, localityRadiusPx) {
    let best = null, bestDist = Infinity;
    for (const node of placeNodesPx) {
      const radius = node.tier === 'locality' ? localityRadiusPx : settlementRadiusPx;
      const d = pointToPolygonDistancePx(node.x, node.y, ringPx);
      if (d <= radius && d < bestDist) { bestDist = d; best = node; }
    }
    return best;
  }

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
  // Rural place nodes ({x,y,tier,name}, in export px), for grounding hamlet
  // blobs against attested settlements (see the hamlet face loop below).
  const placeNodes = data.placeNodes || [];
  // Area-feature geometry for the mechanical subtraction. Each *Polys entry is
  // an unscaled ring [[x,y], ...], already oriented on the main thread (outer
  // positive, inner negative) so lake islands / park courtyards union as holes.
  const waterPolys = data.waterPolys || [];
  const greenPolys = data.greenPolys || [];
  // landcoverPolys is the PAINT set (landcover + grass display rows) — it feeds
  // the fallback void so grass shows through fallback holes. openLandPolys is the
  // narrower open-land SIGNAL set (landcover only, no grass) for the ≥0.35 share
  // test. urbanPolys is the residential/commercial/retail classification signal.
  const landcoverPolys = data.landcoverPolys || [];
  const openLandPolys = data.openLandPolys || [];
  const urbanPolys = data.urbanPolys || [];
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

  // Block-styling floor: pieces below 400 px² are too small to be blocks
  // (v1's minArea) — but they are NOT dropped anymore: emitTree downgrades
  // them to fallback cream, and collectFace keeps every face above a
  // degenerate-ring guard, because a dropped sliver is a bare-page sliver
  // (junction micro-faces were a measured bare-pixel class in every city).
  const minArea = 400 * SCALE * SCALE;
  const tinyGuard = 4 * SCALE * SCALE;

  const rawFaces = [];
  function collectFace(node) {
    if (node.IsHole()) return;
    const contour = node.Contour();
    if (contour && contour.length >= 3 && Math.abs(Clipper.Clipper.Area(contour)) >= tinyGuard) {
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

  // Parse an emitted "Mx,y Lx,y … Z" path back into a Clipper ring at the given
  // scale. Used only by the occlusion cull below, on the SAME path strings the
  // renderer paints, so the cull tests the exact painted block shapes.
  function pathDToRing(d, scale) {
    const nums = (d || '').match(/-?[\\d.]+/g);
    if (!nums || nums.length < 6) return null;
    const ring = [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
      ring.push({ X: Math.round(parseFloat(nums[i]) * scale), Y: Math.round(parseFloat(nums[i + 1]) * scale) });
    }
    return ring.length >= 3 ? ring : null;
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
  function emitTree(tree, kind, out, name) {
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
            // Below the block floor it can't be a styled block, but it must
            // still paint. A sub-floor crumb is a junction pocket wherever it
            // occurs (urban, fallback or hamlet tree), so downgrade to kind
            // 'sliver' — road-space that paints as junction infill in the roads
            // layer, not land. (tinyGuard confetti is still dropped.)
            if (netArea >= tinyGuard) {
              const outerD = toPathD(contour);
              const pieceKind = netArea >= minArea ? kind : 'sliver';
              if (outerD) {
                const rec = { kind: pieceKind, outer: outerD, holes: holeDs, areaPx: netArea / (SCALE * SCALE) };
                if (name) rec.name = name; // attesting place name, for the hamlet label
                out.push(rec);
              }
            }
          }
          for (let i = 0; i < node.ChildCount(); i++) recurse(node.Childs()[i].Childs());
        }
      }
    })(tree.Childs());
  }

  // Every ring of a PolyTree node's subtree (outer + holes + nested solids),
  // matching PolyTreeToPaths for that single node. Used to build the exact
  // complement of the kept hamlet blobs (ENGINE-V2.md §3).
  function collectContourPaths(node, out) {
    const c = node.Contour();
    if (c && c.length) out.push(c);
    for (let i = 0; i < node.ChildCount(); i++) collectContourPaths(node.Childs()[i], out);
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

  // Open-land signal for big-face classification: green + landcover cover
  // (NOT water — harbour basins sit inside dock faces and would fake a rural
  // signal). A big face is only "countryside" if OSM actually shows open land
  // across a real share of it; a big face without that cover is just a
  // coarsely-roaded urban face (dock peninsulas, industrial estates) and gets
  // the ordinary curb-to-curb treatment — hamlet blobs there invent hamlets
  // inside the city (Bremerhaven M7 review).
  const openLandVoid = buildVoid([greenPolys, openLandPolys], null);
  const waterVoid = buildVoid([waterPolys], waterwayStrokePaths);
  // Urban-landuse signal (residential/commercial/retail cover). A buildingless
  // face this covers ≥ URBAN_LANDUSE_MIN_SHARE of (over its land area) is city,
  // not open land — much of OSM maps a district by its landuse polygon and never
  // its individual buildings. Classification only: never subtracted, never painted.
  const urbanVoid = buildVoid([urbanPolys], null);
  // Hidden-green cover: the landcover paint rows ALONE (grass + landcover,
  // parks/water/waterways excluded). Named green needs no equivalent — it is
  // subtracted from every block and shows through the holes — but landcover
  // paints UNDER blocks, so cream over it erases ground OSM shows green. This
  // void measures exactly that erasure risk (see the green-dominance rule in
  // isUrbanPiece).
  const landcoverVoid = buildVoid([landcoverPolys], null);
  // Per-element landcover rings ({ index, rings }): the paint cull and the
  // green-remainder merge both address individual painted elements, not the
  // unioned void.
  const landcoverElements = data.landcoverElements || [];
  const COUNTRYSIDE_MIN_OPEN_SHARE = 0.35;
  const URBAN_LANDUSE_MIN_SHARE = 0.5;
  // A piece whose ground OSM paints this much landcover (grass included) is open
  // land whose green cream would erase, so it is demoted no matter how built it
  // is. Grass is common in cities, so the bar sits well above the 0.35 non-grass
  // open-land gate.
  const GREEN_OPEN_MIN_SHARE = 0.6;
  function intersectArea(faceSubject, clipPaths) {
    const clipper = new Clipper.Clipper();
    for (const p of faceSubject) clipper.AddPath(p, ptSubject, true);
    clipper.AddPaths(clipPaths, ptClip, true);
    const out = new Clipper.Paths();
    clipper.Execute(ctIntersection, out, NZ, NZ);
    let area = 0;
    for (const p of out) area += Clipper.Clipper.Area(p); // signed: holes subtract
    return Math.abs(area);
  }

  // Net land area (net polygon area minus water) of a subject, floored at 1 so it
  // never divides to zero. The shared denominator for every share test.
  function landAreaOf(subjectPaths, netScaled) {
    return Math.max(1, netScaled - intersectArea(subjectPaths, waterVoid));
  }

  // Total building footprint (bbox px²) whose centre falls inside this subject
  // (outer ring, respecting holes). bbox-prefiltered so 20k+ buildings × N
  // pieces stays fast. Unscaled rings ([[x,y], ...]). This is the built-up
  // COVERAGE signal — what share of a face buildings actually cover — not the
  // old "≥1 building" switch. Shared by the small-face test and the countryside
  // remainder re-test.
  function subjectBuildingArea(outerRing, holeRings) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of outerRing) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
    let total = 0;
    for (const center of buildingCenters) {
      const cx = center[0], cy = center[1];
      if (cx < minX || cx > maxX || cy < minY || cy > maxY) continue;
      if (!pointInRing(cx, cy, outerRing)) continue;
      let inHole = false;
      for (const holeRing of holeRings) { if (pointInRing(cx, cy, holeRing)) { inHole = true; break; } }
      if (inHole) continue;
      total += center[2] || 0;
    }
    return total;
  }

  // Built-up threshold: a face is a city block only when buildings actually
  // COVER a real share of its land, not merely when one exists. A lone house on
  // a big green island covers ~1–2 % of it and is not built-up, so the face
  // falls through to the open-land / urban-landuse test and reads green (its
  // grass/wood/garden shows through the fallback holes); a genuine block — even
  // a small one with a single house — sits well above this. Footprint is the
  // building bbox (overestimates a rotated roof, but consistently, so the
  // threshold holds; the fetch is unchanged). This REPLACES the old
  // "≥1 building ⇒ urban" switch, which painted a mostly-green face with one
  // stray building solid cream (Erfurt's Gera river islands). It is NOT the
  // rejected green-share gate (≥35 % green flipped 10 % of Oulu): that asked
  // "is it green", this asks "are the buildings sparse", so a leafy-but-built
  // neighbourhood keeps real coverage and stays cream.
  const BUILT_MIN_SHARE = 0.05;
  function isUrbanPiece(subjectPaths, netScaled, buildingArea, gateBuildings) {
    const landArea = landAreaOf(subjectPaths, netScaled);
    const builtUp = (buildingArea * SCALE * SCALE) / landArea >= BUILT_MIN_SHARE;
    // Green dominance overrides built-up: when the landcover paint rows —
    // which only show through fallback holes, so a cream block HIDES them —
    // cover most of the piece's land, the piece is open land no matter how
    // much of it buildings cover. The caller re-draws its buildings as
    // standalone blocks (emitPieceBuildings) so no built fabric is lost:
    // green ground with cream buildings on it, the way OSM depicts it
    // (Erfurt's Gera island: 82% landcover, the mills held it cream). This is
    // NOT the rejected all-sizes green gate (35% openland flipped 10% of
    // Oulu): landcover-only at 60% asks "would cream erase what OSM paints
    // here", and a demoted piece keeps its buildings visible.
    if (intersectArea(subjectPaths, landcoverVoid) / landArea >= GREEN_OPEN_MIN_SHARE) return false;
    // Built-up faces stay urban and are never demoted by the open-land gate
    // (gateBuildings=false); the countryside remainder re-test passes
    // gateBuildings=true, letting the gate apply to its pieces too (they were
    // all fallback before, so it cannot regress). The gate always applies to the
    // urban-landuse promotion, which only ADDS blocks.
    if (builtUp && !gateBuildings) return true;
    if (intersectArea(subjectPaths, openLandVoid) / landArea >= COUNTRYSIDE_MIN_OPEN_SHARE) return false;
    if (builtUp) return true;
    // A landuse=residential/commercial polygon promotes a buildingless-but-covered
    // face to a city block (much of OSM maps a district by its landuse and never
    // its buildings). Green that OSM would paint here is already protected above:
    // named parks show through block holes, and landcover-dominant ground was
    // demoted by the green-dominance rule; nothing green survives to this point.
    return intersectArea(subjectPaths, urbanVoid) / landArea >= URBAN_LANDUSE_MIN_SHARE;
  }

  // Net (outer minus holes) area of a scaled contour + its hole contours.
  function netAreaOfContour(outer, holes) {
    return Math.abs(Clipper.Clipper.Area(outer)) - holes.reduce((s, h) => s + Math.abs(Clipper.Clipper.Area(h)), 0);
  }

  const blocks = [];

  // A piece the green rules read as open land: the landcover paint rows cover
  // most of its land, so cream would hide what OSM shows. Its coverage
  // remainder merges into its landcover (mergeGreenRemainder) and its
  // buildings draw standalone. One shared predicate so classification,
  // remainder handling and building emission can never disagree about which
  // pieces are green ground.
  function isGreenOpenPiece(subjectPaths, netScaled) {
    return intersectArea(subjectPaths, landcoverVoid) / landAreaOf(subjectPaths, netScaled) >= GREEN_OPEN_MIN_SHARE;
  }

  // Merge a green-open piece's coverage remainder INTO its landcover instead
  // of emitting a cream patch beside it. Root cause of those patches: OSM
  // maps a green piece as several abutting park/garden/grass polygons and
  // leaves the slivers between them (path verges, yard gaps) unmapped — only
  // the district-wide landuse polygon covers them, so the coverage fallback
  // painted them cream and labelled them "Residential". Here the remainder
  // unions into the piece's largest-overlap landcover element, growing that
  // one painted shape over the gaps: one merged polygon in the panel, no
  // extra patch, no colour seam, and the complement rule still holds (the
  // piece stays exactly covered by landcover ∪ water/green holes).
  const mergedLandcover = new Set(); // element indices with a grown shape
  function mergeGreenRemainder(pieceSubject) {
    const remainder = Clipper.Clipper.PolyTreeToPaths(subtractVoid(pieceSubject, fallbackVoid));
    if (!remainder.length) return;
    // Largest-overlap landcover element in this piece takes the remainder.
    let best = null, bestArea = 0;
    for (const lc of landcoverElements) {
      let area = 0;
      for (const ring of (lc.rings || [])) {
        const sp = scaleRing(ring);
        if (sp.length >= 3) area += intersectArea(pieceSubject, [sp]);
      }
      if (area > bestArea) { bestArea = area; best = lc; }
    }
    if (!best) return; // unreachable for a green-open piece, but stay safe
    const unionClipper = new Clipper.Clipper();
    for (const p of remainder) if (p.length >= 3) unionClipper.AddPath(p, ptSubject, true);
    for (const ring of best.rings) {
      const sp = scaleRing(ring);
      if (sp.length >= 3) unionClipper.AddPath(sp, ptSubject, true);
    }
    const merged = new Clipper.Paths();
    unionClipper.Execute(ctUnion, merged, NZ, NZ);
    if (!merged.length) return;
    // Mutate the element's rings so a second piece merging into the same
    // element builds on the grown shape, and the final rings ship once.
    best.rings = merged.map(p => p.map(pt => [pt.X / SCALE, pt.Y / SCALE]));
    mergedLandcover.add(best.index);
  }

  // Standalone buildings for green-dominant open land. A piece the
  // green-dominance rule keeps out of the cream (see isUrbanPiece) still owes
  // the map its built structures — OSM shows green ground WITH buildings on
  // it, and hiding them would trade one erasure for another. Every building
  // footprint is clipped to the piece and emitted as its own small cream
  // block (rendered like hamlet blobs: cream fill, building outline).
  // Callers gate on isGreenOpenPiece — ordinary fallback pieces draw nothing
  // here, and the countryside remainder never calls this: buildings there are
  // the hamlet machinery's, whose grounding rules must not be resurrected
  // around.
  let scaledBuildingRings = null;
  function getScaledBuildingRings() {
    if (scaledBuildingRings) return scaledBuildingRings;
    scaledBuildingRings = [];
    for (const ring of (clusterRings || [])) {
      const sp = scaleRing(ring);
      if (sp.length < 3) continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of sp) {
        if (p.X < x0) x0 = p.X; if (p.X > x1) x1 = p.X;
        if (p.Y < y0) y0 = p.Y; if (p.Y > y1) y1 = p.Y;
      }
      scaledBuildingRings.push({ path: sp, x0, y0, x1, y1 });
    }
    return scaledBuildingRings;
  }
  function emitPieceBuildings(pieceSubject, pieceNet) {
    const rings = getScaledBuildingRings();
    if (!rings.length) return;
    // bbox prefilter against the piece's outer ring, exact clip decides.
    let px0 = Infinity, py0 = Infinity, px1 = -Infinity, py1 = -Infinity;
    for (const p of pieceSubject[0]) {
      if (p.X < px0) px0 = p.X; if (p.X > px1) px1 = p.X;
      if (p.Y < py0) py0 = p.Y; if (p.Y > py1) py1 = p.Y;
    }
    const clipper = new Clipper.Clipper();
    let any = false;
    for (const b of rings) {
      if (b.x1 < px0 || b.x0 > px1 || b.y1 < py0 || b.y0 > py1) continue;
      clipper.AddPath(b.path, ptSubject, true);
      any = true;
    }
    if (!any) return;
    for (const p of pieceSubject) clipper.AddPath(p, ptClip, true);
    const clipped = new Clipper.Paths();
    clipper.Execute(ctIntersection, clipped, NZ, NZ);
    if (!clipped.length) return;
    // Buildings only ever stand on paintable land: subtract the block void so
    // a houseboat doesn't stamp cream onto the water and a park pavilion
    // doesn't punch a cream box into its named park (both render as their
    // ground does everywhere else). Face-level pieces still CONTAIN water and
    // named green — mass-level pieces already had this subtracted, where it
    // is a no-op.
    const tree = subtractVoid(clipped, blockVoid);
    // Buildings are far below the block floor by design, so emitTree's sliver
    // reclassification would swallow them — emit directly, confetti-guarded.
    for (const node of tree.Childs()) {
      if (node.IsHole()) continue;
      const contour = node.Contour();
      if (!contour || contour.length < 3) continue;
      const holes = [];
      let holesArea = 0;
      for (let i = 0; i < node.ChildCount(); i++) {
        const hc = node.Childs()[i].Contour();
        if (hc && hc.length >= 3) { holesArea += Math.abs(Clipper.Clipper.Area(hc)); holes.push(hc); }
      }
      const netArea = Math.abs(Clipper.Clipper.Area(contour)) - holesArea;
      if (netArea < tinyGuard) continue;
      const outerD = toPathD(contour);
      if (outerD) blocks.push({ kind: 'building', outer: outerD, holes: holes.map(h => toPathD(h)).filter(d => d), areaPx: netArea / (SCALE * SCALE) });
    }
  }

  // Classify each solid contour of a difference tree on its own. A passing piece
  // IS already the exact curb-to-curb block shape (its subject minus blockVoid),
  // so it emits verbatim as an urban block (same floor guards as emitTree); a
  // failing piece additionally subtracts fallbackVoid (the extra landcover
  // subtraction lets landcover show through) and emits as fallback. Shared by:
  //   • the countryside remainder re-test (gateBuildings=true — its pieces were
  //     all fallback before, so the open-land gate there can only ADD blocks);
  //   • the small/medium per-land-mass split (gateBuildings=false — building
  //     presence alone still makes a mass urban, so no mass a building already
  //     claimed is demoted; honours the measured 5% abort, ENGINE-V2.md §3).
  // Either way the piece's whole area paints cream except holes another layer
  // paints, so the complement rule (§3) holds and no seam or bare sliver opens.
  function classifyPieces(nodes, gateBuildings) {
    for (const node of nodes) {
      if (node.IsHole()) continue;
      const outer = node.Contour();
      const holes = [], deeperSolids = [];
      for (let i = 0; i < node.ChildCount(); i++) {
        const child = node.Childs()[i];
        const hc = child.Contour();
        if (hc && hc.length >= 3) holes.push(hc);
        for (let j = 0; j < child.ChildCount(); j++) deeperSolids.push(child.Childs()[j]);
      }
      if (outer && outer.length >= 3) {
        const pieceSubject = [outer].concat(holes);
        const pieceNet = netAreaOfContour(outer, holes);
        const outerRing = outer.map(p => [p.X / SCALE, p.Y / SCALE]);
        const holeRings = holes.map(h => h.map(p => [p.X / SCALE, p.Y / SCALE]));
        if (isUrbanPiece(pieceSubject, pieceNet, subjectBuildingArea(outerRing, holeRings), gateBuildings)) {
          // Already the exact block shape — emit verbatim, with the same floor
          // guards emitTree applies (nested solids are classified by this walk).
          if (pieceNet >= tinyGuard) {
            const outerD = toPathD(outer);
            if (outerD) blocks.push({ kind: pieceNet >= minArea ? 'urban' : 'sliver', outer: outerD, holes: holes.map(h => toPathD(h)).filter(d => d), areaPx: pieceNet / (SCALE * SCALE) });
          }
        } else {
          // Urban-side mass split only: the countryside remainder
          // (gateBuildings=true) owns its buildings via the hamlet machinery
          // and keeps its deliberately-cream remainder (quays, floodplain).
          if (!gateBuildings && isGreenOpenPiece(pieceSubject, pieceNet)) {
            mergeGreenRemainder(pieceSubject);
            emitPieceBuildings(pieceSubject, pieceNet);
          } else {
            emitTree(subtractVoid(pieceSubject, fallbackVoid), 'fallback', blocks);
          }
        }
      }
      classifyPieces(deeperSolids, gateBuildings);
    }
  }

  for (const face of rawFaces) {
    const netAreaScaled = Math.abs(Clipper.Clipper.Area(face.outer))
      - face.holes.reduce((sum, h) => sum + Math.abs(Clipper.Clipper.Area(h)), 0);
    const faceSubject = [face.outer].concat(face.holes);

    let isCountryside = false;
    if (netAreaScaled >= bigFaceScaled) {
      const landArea = Math.max(1, netAreaScaled - intersectArea(faceSubject, waterVoid));
      isCountryside = intersectArea(faceSubject, openLandVoid) / landArea >= COUNTRYSIDE_MIN_OPEN_SHARE;
    }

    if (isCountryside) {
      // Countryside face: no curb-to-curb cream fill. Emit an unpainted
      // placeholder for stats (the renderer skips kind:'countryside'), one
      // hamlet blob per building cluster, and a fallback remainder so whatever
      // landcover/green/water/hamlets do NOT cover still paints cream instead
      // of bare page (harbour quays and unfarmed floodplain were the
      // Bremerhaven reference failure).
      const faceOuterD = toPathD(face.outer);
      if (faceOuterD) blocks.push({ kind: 'countryside', outer: faceOuterD, holes: face.holes.map(h => toPathD(h)).filter(d => d), areaPx: netAreaScaled / (SCALE * SCALE) });
      // The fallback remainder subtracts the PAINTED hamlet shapes (not the
      // raw cluster blobs): complement built from the same polygons that get
      // emitted, so no seam can open between a blob and the cream around it
      // (the Oulu forest-edge bites came from exactly that disagreement).
      let hamletPaintedPaths = null;
      if (clusterPolys && clusterPolys.length) {
        const intersectClipper = new Clipper.Clipper();
        for (const p of faceSubject) intersectClipper.AddPath(p, ptSubject, true);
        intersectClipper.AddPaths(clusterPolys, ptClip, true);
        const hamletPaths = new Clipper.Paths();
        intersectClipper.Execute(ctIntersection, hamletPaths, NZ, NZ);
        const hamletTree = subtractVoid(hamletPaths, blockVoid);
        // Ground each blob against the rural place nodes: only a blob with a
        // qualifying node in range paints as a hamlet (and takes its name);
        // ungrounded blobs are dropped so their area falls back to the cream
        // remainder — this is what stops urban faces inventing hamlets. Only
        // the KEPT blobs feed hamletPaintedPaths, so the remainder repaints
        // exactly the dropped areas (complement rule, ENGINE-V2.md §3).
        const settlementRadiusPx = HAMLET_GROUND_SETTLEMENT_M / mPerPx;
        const localityRadiusPx = HAMLET_GROUND_LOCALITY_M / mPerPx;
        const keptPaths = [];
        for (const node of hamletTree.Childs()) {
          if (node.IsHole()) continue;
          const contour = node.Contour();
          if (!contour || contour.length < 3) continue;
          const ringPx = contour.map(pt => [pt.X / SCALE, pt.Y / SCALE]);
          const groundNode = groundHamletContour(ringPx, placeNodes, settlementRadiusPx, localityRadiusPx);
          if (!groundNode) continue;
          emitTree({ Childs: () => [node] }, 'hamlet', blocks, groundNode.name);
          collectContourPaths(node, keptPaths);
        }
        if (keptPaths.length) hamletPaintedPaths = keptPaths;
      }
      // Re-test the non-hamlet remainder (cause C). After ungrounded blobs are
      // dropped, a countryside face's dense pocket — a real city district inside
      // a big forest/harbour/park face, or a dropped hamlet with no rural place
      // node — must still get the building/urban-landuse test, or it paints as
      // Uncategorized despite carrying 9–123 buildings (Bremerhaven Bürgerpark).
      // Granularity matters: the test runs on each solid piece of face minus
      // (block void ∪ kept hamlets) — the pieces water/green/waterways carve
      // out — NOT on the remainder as a whole, whose open-land share is high by
      // countryside construction and would veto every pocket. A piece that
      // passes emits as an urban block DIRECTLY: it already is exactly the
      // curb-to-curb block shape (face minus block void), so the complement
      // rule (§3) holds by construction. A piece that fails additionally
      // subtracts fallbackVoid (a superset of blockVoid; the extra landcover
      // subtraction is the only difference) and emits as fallback — the same
      // shape the wholesale remainder used to paint there. Either way the
      // piece's whole area is painted cream except holes another layer paints,
      // so no seam or bare sliver can open.
      let remainderClip = blockVoid;
      if (hamletPaintedPaths && hamletPaintedPaths.length) {
        const clipUnion = new Clipper.Clipper();
        clipUnion.AddPaths(blockVoid, ptSubject, true);
        clipUnion.AddPaths(hamletPaintedPaths, ptSubject, true);
        remainderClip = new Clipper.Paths();
        clipUnion.Execute(ctUnion, remainderClip, NZ, NZ);
      }
      const remainderTree = subtractVoid(faceSubject, remainderClip);
      classifyPieces(remainderTree.Childs(), true);
      continue;
    }

    // Small/medium face (not countryside): a curb-to-curb cream city block when
    // the shared urban test passes, else fallback cream. Building presence alone
    // still makes a face urban (gateBuildings=false — see isUrbanPiece for the
    // measured rejection of gating that); the urban-landuse signal additionally
    // promotes buildingless-but-covered faces.
    const outerRing = face.outer.map(p => [p.X / SCALE, p.Y / SCALE]);
    const holeRings = face.holes.map(h => h.map(p => [p.X / SCALE, p.Y / SCALE]));
    const buildingArea = subjectBuildingArea(outerRing, holeRings);

    if (isUrbanPiece(faceSubject, netAreaScaled, buildingArea, false)) {
      // Cream city block = face minus the block void, evenodd holes. A pond in
      // the block becomes a hole; a face split by a river yields two blocks.
      // Per-land-mass classification: when the void (water + green + waterway
      // strokes) splits the face's land into MORE than one disjoint mass — a
      // river island, a park-severed parcel — classify each mass on its own
      // rather than blanket-painting them all urban. A buildingless open-land
      // mass (the Erfurt Gera wood island, whose parent road-bounded face spans
      // the river so whole-face metrics read urban) then paints fallback and its
      // landcover shows through — the universal, heuristic-free island fix. A
      // single-mass face takes the identical emit as before (untouched by
      // construction); gateBuildings=false keeps every building-bearing mass
      // urban, so no urban land is demoted (§3, the measured 5% abort).
      const blockTree = subtractVoid(faceSubject, blockVoid);
      const solidMasses = blockTree.Childs().filter(n => !n.IsHole());
      if (solidMasses.length <= 1) {
        emitTree(blockTree, 'urban', blocks);
      } else {
        classifyPieces(blockTree.Childs(), false);
      }
    } else {
      // No block → the coverage fallback paints whatever water/green/landcover/
      // waterways did NOT cover (dry river islands, OSM data gaps, open-land
      // faces), so land is never left bare — landcover shows through its
      // holes. Green-open pieces merge that remainder into their landcover
      // (one grown green shape, no cream wedge) and draw their buildings;
      // everything else stays a cream patch. This is how river islands render
      // in v2: no island machinery.
      if (isGreenOpenPiece(faceSubject, netAreaScaled)) {
        mergeGreenRemainder(faceSubject);
        emitPieceBuildings(faceSubject, netAreaScaled);
      } else {
        emitTree(subtractVoid(faceSubject, fallbackVoid), 'fallback', blocks);
      }
    }
  }

  // ── Occlusion cull: landcover fully hidden under painted OPAQUE layers ──
  // Landcover sits at the BOTTOM of the paint order (§4). A landcover polygon
  // whose whole area lies under the union of the OPAQUE layers painted above it
  // is invisible, so it is dropped from PAINT only. This never touches any
  // subtraction void (blockVoid/fallbackVoid are already built), so coverage —
  // the geometric lint and the render check — is unaffected: the cull only
  // removes ink another opaque layer already covers. Covering set = the opaque
  // painted layers above landcover: urban + hamlet city blocks (cream), named
  // parks (green, fillOpacity 1) and water bodies (opaque since 2026-07-12 —
  // preset.waterOp is 1). Deliberately EXCLUDED: fallback blocks (fallbackVoid
  // already subtracts landcover, so a fallback patch is holed exactly where
  // landcover paints — it can never cover it, by construction); waterway strokes
  // and roads (opaque but thin — a river line or street rarely covers a whole
  // landcover polygon, so omitting them only keeps ink, never adds a bare gap:
  // conservative). Water is semi-consequential here mainly for woods that run
  // into a lake/dock; the big new win is a wood fully inside a NAMED forest/park
  // (Tilburg's "invisible forest" observation). Each covering layer contributes
  // its region with HOLES already punched (a pond hole in a block, an island
  // hole in a lake) BEFORE the regions are unioned, so a hole in one layer that
  // another layer fills over stays counted as covered. A finer grid than the
  // cutter's SCALE (100 vs 10) so the "is it empty?" test does not cull on
  // coarse rounding, and any remainder above ~1px² keeps the element.
  const CULL_SCALE = 100;
  const culledLandcover = [];
  if (landcoverElements.length) {
    const scaleRingCull = ring => {
      const sp = [];
      for (const p of ring) sp.push({ X: Math.round(p[0] * CULL_SCALE), Y: Math.round(p[1] * CULL_SCALE) });
      return sp.length >= 3 ? sp : null;
    };
    // NonZero union of a set of pre-oriented ring groups (outer +, hole −), so
    // each group's own holes self-punch — the same discipline as buildVoid.
    const unionOrientedRings = groups => {
      const c = new Clipper.Clipper();
      let any = false;
      for (const group of groups) for (const ring of group) {
        const sp = scaleRingCull(ring); if (sp) { c.AddPath(sp, ptSubject, true); any = true; }
      }
      const out = new Clipper.Paths();
      if (any) c.Execute(ctUnion, out, NZ, NZ);
      return out;
    };
    // Block region (urban + hamlet + standalone buildings): union of outers
    // minus their pond holes. Buildings are opaque cream above landcover too,
    // so landcover fully under one is just as invisible.
    const blockOuters = [], blockHoles = [];
    for (const blk of blocks) {
      if (blk.kind !== 'urban' && blk.kind !== 'hamlet' && blk.kind !== 'building') continue;
      const o = pathDToRing(blk.outer, CULL_SCALE); if (o) blockOuters.push(o);
      for (const hd of (blk.holes || [])) { const h = pathDToRing(hd, CULL_SCALE); if (h) blockHoles.push(h); }
    }
    let blockRegion = new Clipper.Paths();
    if (blockOuters.length) {
      const uc = new Clipper.Clipper();
      for (const o of blockOuters) uc.AddPath(o, ptSubject, true);
      uc.Execute(ctUnion, blockRegion, NZ, NZ);
      if (blockHoles.length) {
        const hc = new Clipper.Clipper();
        hc.AddPaths(blockRegion, ptSubject, true);
        for (const h of blockHoles) hc.AddPath(h, ptClip, true);
        const holed = new Clipper.Paths();
        hc.Execute(ctDifference, holed, NZ, NZ);
        blockRegion = holed;
      }
    }
    // Named parks + water bodies arrive as oriented rings (holes as negatives).
    const greenRegion = unionOrientedRings([greenPolys]);
    const waterRegion = unionOrientedRings([waterPolys]);
    // Covering union of the three opaque regions.
    const coverClipper = new Clipper.Clipper();
    let hasCover = false;
    for (const r of [blockRegion, greenRegion, waterRegion]) if (r.length) { coverClipper.AddPaths(r, ptSubject, true); hasCover = true; }
    const covering = new Clipper.Paths();
    if (hasCover) coverClipper.Execute(ctUnion, covering, NZ, NZ);
    if (covering.length) {
      const EMPTY = CULL_SCALE * CULL_SCALE; // ~1px² of remaining ink = "covered"
      for (const lc of landcoverElements) {
        // A merged element carries a green-open piece's coverage remainder —
        // definitionally exposed ink, never cullable.
        if (mergedLandcover.has(lc.index)) continue;
        const subj = [];
        for (const ring of (lc.rings || [])) { const sp = scaleRingCull(ring); if (sp) subj.push(sp); }
        if (!subj.length) continue;
        const dc = new Clipper.Clipper();
        for (const s of subj) dc.AddPath(s, ptSubject, true);
        for (const b of covering) dc.AddPath(b, ptClip, true);
        const remainder = new Clipper.Paths();
        dc.Execute(ctDifference, remainder, NZ, NZ);
        let remArea = 0;
        for (const p of remainder) remArea += Math.abs(Clipper.Clipper.Area(p));
        if (remArea < EMPTY) culledLandcover.push(lc.index);
      }
    }
  }

  self.postMessage({
    type: 'done', blocks: blocks, culledLandcover: culledLandcover,
    greenGroundMerges: [...mergedLandcover].map(index => ({ index, rings: landcoverElements[index].rings })),
  });
};
`
  // Hamlet-grounding constants + pure helpers, injected as worker-local copies
  // of the main-thread source (single source of truth; see their definitions
  // above). Function declarations hoist into the worker scope, so onmessage
  // can call them.
  + '\nconst HAMLET_GROUND_SETTLEMENT_M = ' + HAMLET_GROUND_SETTLEMENT_M + ';'
  + '\nconst HAMLET_GROUND_LOCALITY_M = ' + HAMLET_GROUND_LOCALITY_M + ';'
  + '\n' + pointToPolygonDistancePx.toString()
  + '\n' + groundHamletContour.toString() + '\n';

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
  // Returns [x, y, bboxAreaPx] — the projected bbox centre plus the projected
  // bbox area (px²), the building's footprint proxy for the built-up-coverage
  // test (a lone footprint in a big green face is not built-up; see
  // subjectBuildingArea / isUrbanPiece). No extra fetch: the bounds are already
  // in the 'tags bb' buildings response.
  function buildingCenterPx(el, pr) {
    let minlat, minlon, maxlat, maxlon;
    if (el.bounds) {
      ({ minlat, minlon, maxlat, maxlon } = el.bounds);
    } else if (el.geometry?.length) {
      minlat = Infinity, maxlat = -Infinity, minlon = Infinity, maxlon = -Infinity;
      for (const g of el.geometry) {
        if (g.lat < minlat) minlat = g.lat;
        if (g.lat > maxlat) maxlat = g.lat;
        if (g.lon < minlon) minlon = g.lon;
        if (g.lon > maxlon) maxlon = g.lon;
      }
    } else {
      return null;
    }
    const c = pr((minlat + maxlat) / 2, (minlon + maxlon) / 2);
    const sw = pr(minlat, minlon), ne = pr(maxlat, maxlon);
    const area = Math.abs((ne[0] - sw[0]) * (ne[1] - sw[1]));
    return [c[0], c[1], area];
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
  function prepareFaceData(cutterResults, buildingElements, classified, pr, W, H, bbox, placeNodeElements) {
    const scaleFactor = getScaleFactor(W);
    const roadEps = getEps();
    const lineEps = getLineEps();
    const area = classified || { water: [], green: [], landcover: [], grass: [], waterways: [], labelOnly: [] };

    const cutterLines = []; // { pts: [[x,y], ...], halfW }
    for (const { layer, data } of cutterResults) {
      if (!data?.elements?.length) continue;

      // Rail/tram/metro deliberately do NOT cut (removed 2026-07-12): a rail
      // carve at 20 px·sf plus a corridor_beds layer that repainted exactly
      // that band cream was net-zero ink and pure designer-facing machinery.
      // Blocks now simply paint under the drawn tracks, so no "Railway"
      // between-track faces or rail-side slivers are ever constructed. The
      // cutter network is roads only.
      if (layer.type !== 'roads') continue;

      // Roads → lines with half-width. Merge named ways first (the renderer
      // strokes the stitched run, so simplifying the pieces would drift), and
      // drop tunnels before merging so a tunnel segment can't bound a face.
      // Squares are skipped (they no longer cut — see isSquareElement): a
      // square is just land inside its face, painted cream by classification.
      const surface = data.elements.filter(el => !isTunnel(el) && !isSquareElement(el));
      for (const el of mergeNamedWays(surface)) {
        const highway = el.tags?.highway || '_default';
        if (!BLOCK_ROADS.has(highway)) continue;
        const width = ROAD_WIDTHS[highway] || ROAD_WIDTHS._default;
        const halfW = (width.fillW + width.casingW) * scaleFactor / 2 - ROAD_TUCK;
        const pts = dpSimplify(el.geometry.map(g => pr(g.lat, g.lon)), roadEps);
        if (pts.length >= 2) cutterLines.push({ pts, halfW });
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
    // Two landcover sets, deliberately split (see AREA_FEATURES grass rows):
    //  - paint set (landcover + grass display rows) → landcoverPolys, which
    //    feeds the FALLBACK void so every painted landcover (grass included)
    //    shows through fallback holes;
    //  - open-land SIGNAL set (landcover only, no grass) → openLandPolys, the
    //    ≥0.35 share test in the worker. Grass must stay out of that signal or
    //    it flips genuinely urban faces to countryside/fallback en masse.
    const paintLandcover = [...(area.landcover || []), ...(area.grass || [])];
    const landcoverPolys = collectAreaPolys(paintLandcover, pr);
    const openLandPolys = collectAreaPolys(area.landcover, pr);
    // Urban-landuse classification signal: landuse=residential/commercial/retail
    // polygons carry no building footprints in much of OSM (dominant in Erfurt:
    // 37/43 above-floor Uncategorized patches are residential/commercial), yet
    // the land is plainly city. Projected exactly like the void polys above and
    // unioned into the worker's urbanVoid, they let a buildingless-but-covered
    // face still classify urban. INDUSTRIAL is excluded on purpose (Bremerhaven's
    // industrial-tagged open quays would wrongly read as cream city blocks). Like
    // buildingCenters, these only classify — they never paint or cut.
    const urbanLanduse = new Set(['residential', 'commercial', 'retail']);
    // amenity=parking counts as city fabric too (Coen, 2026-07-13): a parking
    // lot is paved block-land and reads as cream on a USE-IT map, so a piece
    // it covers promotes like residential/commercial instead of surfacing as
    // an "Uncategorized/Parking" patch. Same discipline as the landuse set:
    // classification only, never painted or cut.
    const urbanElements = (area.labelOnly || []).filter(el =>
      urbanLanduse.has(el.tags?.landuse) || el.tags?.amenity === 'parking');
    const urbanPolys = collectAreaPolys(urbanElements, pr);
    // The paint set kept per-element (index into the landcover render array =
    // [...landcover, ...grass]) so the worker's occlusion cull reports exactly
    // which painted elements are hidden under the city blocks. Paint-only: feeds
    // the render filter, never a subtraction void, so coverage is unaffected.
    const landcoverElements = paintLandcover.map((el, index) => ({ index, rings: collectAreaPolys([el], pr) }));

    // Building centres for classification, building rings for hamlet blobs.
    const buildingCenters = [];
    for (const el of (buildingElements || [])) {
      const center = buildingCenterPx(el, pr);
      if (center) buildingCenters.push(center);
    }
    const clusterRings = prepareClusterData(buildingElements || [], pr);

    // Rural place nodes → {x,y,tier,name} in export px, for grounding hamlet
    // blobs in the worker. Nodes carry lat/lon directly; locality is the
    // tighter-radius tier (see the grounding helpers), everything else is
    // settlement tier.
    const placeNodes = [];
    for (const el of (placeNodeElements || [])) {
      if (typeof el.lat !== 'number' || typeof el.lon !== 'number') continue;
      const [x, y] = pr(el.lat, el.lon);
      const tier = el.tags?.place === 'locality' ? 'locality' : 'settlement';
      placeNodes.push({ x, y, tier, name: el.tags?.name || null });
    }

    // Ground scale, for the countryside threshold and the hamlet buffers
    // (metres → px). Mercator stretch across a city-scale bbox is negligible
    // for either. COUNTRYSIDE_MIN_KM2 is v1's shared 0.35 km² constant.
    const midLat = (bbox.north + bbox.south) / 2;
    const mPerPx = ((bbox.east - bbox.west) * 111320 * Math.cos(midLat * Math.PI / 180)) / W;
    const bigFacePx2 = COUNTRYSIDE_MIN_KM2 * 1e6 / (mPerPx * mPerPx);

    return {
      cutterLines, waterwayLines, waterPolys, greenPolys, landcoverPolys, openLandPolys, urbanPolys, landcoverElements,
      buildingCenters, clusterRings, placeNodes, W, H, bigFacePx2, mPerPx,
      // Roads/rail cutters plus waterway strokes, in the {pts,halfW} shape the
      // coverage lint's markLine expects (it treats these as painted corridors).
      lines: cutterLines.concat(waterwayLines),
    };
  }

  // Run the face cutter in a Web Worker. Resolves { blocks }. Mirrors v1's
  // computeBlocksAsync lifecycle; the message protocol is shape-compatible
  // with v1's ({type:'progress'} / {type:'done', ...}).
  function computeFacesAsync(cutterResults, buildingElements, classified, pr, W, H, onProgress, opts = {}) {
    return new Promise((resolve, reject) => {
      const data = prepareFaceData(cutterResults, buildingElements, classified, pr, W, H, opts.bbox, opts.placeNodeElements);
      if (!data.cutterLines.length) { resolve({ blocks: [] }); return; }

      let worker;
      try {
        worker = new Worker(getFaceWorkerUrl());
      } catch (cause) {
        reject(new ExportFailure({
          source: 'engine-v2',
          phase: 'worker',
          userMessage: 'Map faces could not be computed. Try the export again.',
          cause,
          details: { operation: 'start' },
        }));
        return;
      }
      worker.onmessage = function(e) {
        if (e.data.type === 'progress' && onProgress) onProgress(e.data.msg, e.data.pct);
        if (e.data.type === 'done') {
          worker.terminate();
          resolve({ blocks: e.data.blocks, culledLandcover: e.data.culledLandcover || [], greenGroundMerges: e.data.greenGroundMerges || [] });
        }
      };
      worker.onerror = function(err) {
        worker.terminate();
        console.error('Face worker error:', err);
        reject(new ExportFailure({
          source: 'engine-v2',
          phase: 'worker',
          userMessage: 'Map faces could not be computed. Try the export again.',
          cause: err?.error || err,
          details: { operation: 'compute' },
        }));
      };
      try {
        worker.postMessage(data);
      } catch (cause) {
        worker.terminate();
        reject(new ExportFailure({
          source: 'engine-v2',
          phase: 'worker',
          userMessage: 'Map faces could not be computed. Try the export again.',
          cause,
          details: { operation: 'postMessage' },
        }));
      }
    });
  }

  // Render the derived city_blocks result: the primary cream faces. Only urban,
  // hamlet and standalone-building blocks paint; countryside placeholders (kept
  // for the coverage lint) and fallback patches (their own group) are skipped
  // here. Evenodd, so subtracted water/green become holes. One <path> per block.
  function renderCityBlocks(blocks, ctx) {
    let urbanCount = 0, hamletCount = 0, buildingCount = 0;
    // Hamlet blobs and standalone buildings sit on open ground with no road
    // casing around them, so (as in v1) they carry a casing-toned outline of
    // their own — without it the cream fill vanishes against the pale
    // landcover painting beneath.
    const hamletStroke = ` stroke="${ctx.preset.buildingStroke}" stroke-width="${(2.5 * getScaleFactor(ctx.W)).toFixed(2)}" stroke-linejoin="round"`;
    const paths = (blocks || []).filter(blk => blk.kind === 'urban' || blk.kind === 'hamlet' || blk.kind === 'building').map(blk => {
      const outlined = blk.kind !== 'urban';
      const [id, label] = blk.kind === 'hamlet'
        ? [`hamlet_${++hamletCount}`, blk.name ? `Hamlet “${escXml(blk.name)}”` : `Hamlet ${hamletCount}`]
        : blk.kind === 'building'
          ? [`building_${++buildingCount}`, `Building ${buildingCount}`]
          : [`block_${++urbanCount}`, `Block ${urbanCount}`];
      const d = blk.outer + (blk.holes && blk.holes.length ? ' ' + blk.holes.join(' ') : '');
      return `<path id="${id}" inkscape:label="${label}" d="${d}" fill="${CREAM}" fill-rule="evenodd"${outlined ? hamletStroke : ' stroke="none"'}/>`;
    }).join('\n    ');
    if (!paths) return '';
    return `  <g id="city_blocks" inkscape:label="City blocks" inkscape:groupmode="layer">\n    ${paths}\n  </g>\n`;
  }

  // Render the coverage-fallback patches: cream land that no other layer covered
  // (buildingless small faces, dry river islands, OSM data gaps). Visually
  // identical to a city block, but its own group so gaps stay auditable and
  // countable. Sits below water in layerOrder, same as city_blocks.
  // Designer-facing category VALUE for an Uncategorized patch, from the tags
  // of a label-only element found under it: the tag value only ("Railway",
  // "Parking"), capitalized, underscores as spaces. First key wins. This is
  // also the sub-group key renderFallbackBlocks groups patches by — the part
  // of the label before any OSM name.
  function fallbackCategoryValue(tags) {
    for (const k of ['landuse', 'natural', 'railway', 'aeroway', 'military', 'leisure', 'amenity', 'man_made']) {
      if (tags[k]) {
        const v = tags[k].replace(/_/g, ' ');
        return v.charAt(0).toUpperCase() + v.slice(1);
      }
    }
    return null;
  }

  // Full per-path label: the category value plus the OSM name, if any
  // ("Parking “Autoranta”").
  function fallbackCategoryLabel(tags) {
    const value = fallbackCategoryValue(tags);
    return value ? value + (tags.name ? ` “${tags.name}”` : '') : null;
  }

  // Representative interior point of a patch outer ring: the vertex mean when
  // it lands inside the ring, else a coarsening grid probe over the ring bbox.
  // Label-grade only — a rare miss labels one patch generically, nothing more.
  function patchLabelPoint(ring) {
    const inRing = (x, y) => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
        if (((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    };
    let mx = 0, my = 0, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of ring) {
      mx += x; my += y;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    mx /= ring.length; my /= ring.length;
    if (inRing(mx, my)) return [mx, my];
    for (let n = 4; n <= 32; n *= 2) {
      for (let i = 1; i < n; i++) for (let j = 1; j < n; j++) {
        const x = minX + (maxX - minX) * i / n, y = minY + (maxY - minY) * j / n;
        if (inRing(x, y)) return [x, y];
      }
    }
    return [mx, my];
  }

  // The Uncategorized layer (kind:'fallback' internally): land the coverage
  // pass painted cream because no fetched feature claimed it. Each patch is
  // labelled with what the label-only fetch says the land is (rail yard,
  // parking, scrub, …) so a designer can decide per patch what to do with it.
  function renderFallbackBlocks(blocks, labelElements, ctx) {
    // Project the label-only polygons once, with a bbox each for prefiltering.
    const areas = [];
    for (const el of (labelElements || [])) {
      const rings = el.type === 'way'
        ? [el.geometry]
        : (el.members || []).filter(m => m.role !== 'inner' && m.geometry?.length >= 4).map(m => m.geometry);
      for (const geom of rings) {
        if (!geom || geom.length < 3) continue;
        const pts = geom.map(g => ctx.pr(g.lat, g.lon));
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const [x, y] of pts) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
        areas.push({ pts, minX, minY, maxX, maxY, tags: el.tags });
      }
    }
    const inPts = (pts, x, y) => {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
        if (((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    };
    // Sub-group patches by category so a designer can grab a whole category at
    // once, instead of scrolling one flat list. (Sub-floor slivers are no
    // longer fallback blocks — they paint as junction infill in the roads
    // layer, kind 'sliver' — so every fallback patch here is ≥ the block floor
    // by construction and there is no Slivers subgroup.)
    const groups = new Map(); // subgroup id -> { label, paths: [] }
    let n = 0;
    for (const blk of (blocks || [])) {
      if (blk.kind !== 'fallback') continue;
      const d = blk.outer + (blk.holes && blk.holes.length ? ' ' + blk.holes.join(' ') : '');
      const outerRing = [...blk.outer.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(m => [+m[1], +m[2]]);
      let label = 'Uncategorized';
      let category = 'Uncategorized'; // the sub-group key: label minus any OSM name
      if (outerRing.length >= 3) {
        const [x, y] = patchLabelPoint(outerRing);
        const cats = [];
        let firstValue = null;
        for (const a of areas) {
          if (x < a.minX || x > a.maxX || y < a.minY || y > a.maxY) continue;
          if (!inPts(a.pts, x, y)) continue;
          const cat = fallbackCategoryLabel(a.tags);
          if (cat && !cats.includes(cat)) {
            cats.push(cat);
            if (firstValue === null) firstValue = fallbackCategoryValue(a.tags);
          }
        }
        // Categorized patches read as their category ("Railway", "Parking
        // “Autoranta”"); "Uncategorized" is reserved for truly untagged land.
        if (cats.length) { label = cats.slice(0, 2).join(' + '); category = firstValue || 'Uncategorized'; }
      }
      // Self-coloured seam stroke (as on water bodies): fallback patches
      // often abut hamlet blobs and each other edge-to-edge, and the
      // sub-pixel gap between two unstroked fills renders as a hairline of
      // page background.
      const path = `<path id="fallback_${++n}" inkscape:label="${escXml(label)}" d="${d}" fill="${CREAM}" fill-rule="evenodd" stroke="${CREAM}" stroke-width="1" stroke-linejoin="round"/>`;
      const subId = `uncat_${safeName(category).toLowerCase()}`;
      if (!groups.has(subId)) groups.set(subId, { label: category, paths: [] });
      groups.get(subId).paths.push(path);
    }
    if (!groups.size) return '';
    // Category sub-groups first (alphabetical), then the Uncategorized
    // catch-all (truly untagged land) last, so the specific buckets surface
    // before the generic one in the panel.
    const ids = [...groups.keys()].filter(id => id !== 'uncat_uncategorized')
      .sort((a, b) => groups.get(a).label.localeCompare(groups.get(b).label));
    if (groups.has('uncat_uncategorized')) ids.push('uncat_uncategorized');
    const subgroups = ids.map(id => {
      const g = groups.get(id);
      return `    <g id="${id}" inkscape:label="${escXml(g.label)}">\n      ${g.paths.join('\n      ')}\n    </g>`;
    }).join('\n');
    return `  <g id="fallback_blocks" inkscape:label="Uncategorized" inkscape:groupmode="layer">\n${subgroups}\n  </g>\n`;
  }

  // ── Tunnels (milestone 6) ──────────────────────────────────────────
  // Tunnels are not surface: tunnel=yes|culvert ways drop from the drawn
  // road/rail/tram network and from street labels (the block cutter already
  // drops them since M2, so a tunnel neither draws nor bounds a block).
  // Bridges, tunnel=building_passage and covered=yes stay — those are
  // usable surface. Metro is the deliberate exception: that layer IS the
  // underground network, drawn as a schematic overlay, so it keeps its
  // tunnel segments.
  const isTunnelElement = (el) => /^(yes|culvert)$/.test(el.tags?.tunnel || '');

  // Canonical square tagging (the shared isSquareTagged predicate, also used by
  // the street-label builder) on a closed way that is not a roundabout. Squares
  // no longer paint a plaza or cut faces (removed 2026-07-12): a square is land
  // inside its face, painted cream like the block around it. This predicate now
  // only excludes squares from the road cutter and the road stroke passes, and
  // (when named) selects them for a feature label.
  function isSquareElement(el) {
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 4) return false;
    if (!isSquareTagged(el.tags)) return false;
    if (el.tags?.junction === 'roundabout') return false;
    return samePt(el.geometry[0], el.geometry[el.geometry.length - 1]);
  }

  // v1's roads layer group opening tag (script.js renderRoadsLayer). The
  // junction-infill path is spliced in right after it, as the first child.
  const ROADS_GROUP_OPEN = '<g id="roads" inkscape:label="Roads &amp; streets" inkscape:groupmode="layer">';

  // Sub-floor slivers (kind 'sliver' — junction pockets below the block-styling
  // floor, fully surrounded by cutter bands) are road-space, not land. Paint
  // them ONCE as a single multi-subpath path in the road fill colour (white),
  // spliced in as the first child of the roads layer so casings and fills
  // stroke over it. Designers never see a per-sliver list.
  function renderJunctionInfill(blocks, ctx) {
    const subpaths = [];
    for (const blk of (blocks || [])) {
      if (blk.kind !== 'sliver') continue;
      subpaths.push(blk.outer + (blk.holes && blk.holes.length ? ' ' + blk.holes.join(' ') : ''));
    }
    if (!subpaths.length) return '';
    const fill = (ctx.preset.roads.residential || ctx.preset.roads.pedestrian || {}).fill || '#ffffff';
    return `<path id="roads_junction_infill" inkscape:label="Junction infill" d="${subpaths.join(' ')}" fill="${fill}" fill-rule="evenodd" stroke="${fill}" stroke-width="1"/>`;
  }

  // One named path per waterway, mirroring v1's per-feature water_bodies
  // pattern: same-named ways merge into one path (a river fetched as many
  // segments becomes one "Geeste"), nameless ways carry their waterway tag as
  // the label. v1 merges the whole layer into a single anonymous path, which
  // editors display as "path124" — useless to a designer. Stroke attributes
  // otherwise match v1's line emission (round caps) but paint OPAQUE: v1's
  // 0.92 was a shine-through softening with no purpose here (no design reads
  // through a river), and dropping it makes a waterway exactly the same blue
  // as the water_bodies it flows into — one water colour, no faint body/way
  // seam. The width is v2-only: it scales with export size (12 * getScaleFactor) to
  // MATCH the cutter's waterwayLines half-width in prepareFaceData (also
  // `12 * scaleFactor / 2`) — per the contract's complement rule (§3), the
  // painted stroke and the subtracted void must be the same width, and a
  // fixed 12px paint against a scaled void only agreed by coincidence at the
  // A3@300dpi baseline (scaleFactor 1). v1 keeps the fixed-12px quirk (see
  // ENGINE-V2.md §8) — this only touches v2's own renderer.
  function renderWaterways(result, ctx) {
    const elements = (result.data?.elements || []).filter(el => el.type === 'way' && el.geometry?.length >= 2);
    if (!elements.length) return '';
    const water = ctx.preset.water;
    const strokeWidth = (12 * getScaleFactor(ctx.W)).toFixed(2);
    const uid = makeUidGen();
    const groups = new Map();
    for (const el of elements) {
      const key = el.tags?.name ? `n:${el.tags.name}` : `a:${el.id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(el);
    }
    let content = '';
    for (const els of groups.values()) {
      let d = '';
      for (const el of els) d += geomToPathD(el.geometry, ctx.pr, ctx.EPS.line, false) + ' ';
      d = d.trim();
      if (!d) continue;
      const name = els[0].tags?.name;
      const kind = els[0].tags?.waterway || 'waterway';
      const id = name ? uid(`waterway_${safeName(name)}`) : uid(`waterway_${kind}_${els[0].id}`);
      const label = name || kind.replace(/^\w/, c => c.toUpperCase());
      content += `<path id="${id}" inkscape:label="${escXml(label)}" d="${d}" fill="none" stroke="${water}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    if (!content) return '';
    return `  <g id="waterways" inkscape:label="Waterways" inkscape:groupmode="layer">\n    ${content}\n  </g>\n`;
  }

  // Landcover paint (v2-only renderer). v1's renderLayerSVG landcover branch
  // only paints farmland/meadow/orchard/vineyard/forest/wood/scrub/heath — it
  // has no case for the v2 grass display rows (grass/village_green, unnamed
  // park/garden), so those would silently not paint if routed through it. Rather
  // than edit v1 (the contract forbids changing script.js for a v2 feature),
  // this mirrors v1's landcover emission verbatim for the shared covers and adds
  // the grass rows on top, all as green tint (v1's ISLAND_GREEN colour). Big
  // polygons paint first / small on top, same as v1, so a bbox-spanning meadow
  // import never hides the woods inside it.
  function renderLandcover(result, ctx) {
    const elements = result.data?.elements || [];
    if (!elements.length) return '';
    const preset = ctx.preset;
    const uid = makeUidGen();
    const approxDeg2 = (el) => {
      const b = el.bounds;
      if (b) return (b.maxlat - b.minlat) * (b.maxlon - b.minlon);
      const g = el.type === 'way' ? el.geometry : null;
      if (!g?.length) return 0;
      let s = Infinity, n = -Infinity, w = Infinity, e = -Infinity;
      for (const p of g) { if (p.lat < s) s = p.lat; if (p.lat > n) n = p.lat; if (p.lon < w) w = p.lon; if (p.lon > e) e = p.lon; }
      return (n - s) * (e - w);
    };
    // The land-cover value + fill for a tag set, or null when nothing paints.
    // farmland/meadow/orchard/vineyard/scrub/heath → quiet field tint; forest/
    // wood and the grass display rows → park green.
    const coverFill = (t) => {
      const lu = t?.landuse || '', nat = t?.natural || '', le = t?.leisure || '';
      if (/^(farmland|meadow|orchard|vineyard)$/.test(lu)) return { cover: lu, fill: preset.field };
      if (lu === 'forest') return { cover: 'forest', fill: preset.park };
      if (nat === 'wood') return { cover: 'wood', fill: preset.park };
      if (/^(scrub|heath)$/.test(nat)) return { cover: nat, fill: preset.field };
      if (/^(grass|village_green)$/.test(lu)) return { cover: lu, fill: preset.park };
      if (/^(park|garden)$/.test(le)) return { cover: le, fill: preset.park };
      return null;
    };
    let content = '';
    [...elements].sort((a, z) => approxDeg2(z) - approxDeg2(a)).forEach((el) => {
      const cf = coverFill(el.tags || {});
      if (!cf) return;
      let d = '';
      if (el._mergedRings) {
        // Grown shape from the worker: the element's own rings unioned with
        // the coverage remainder of the green-open piece(s) it lies in.
        // Already projected px at the void's simplification tolerance.
        d = el._mergedRings.map(ring => 'M' + ring.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L') + 'Z').join(' ');
      } else if (el.type === 'way') d = geomToPathD(el.geometry, ctx.pr, ctx.EPS.area_large, true);
      else if (el.type === 'relation' && el.members) {
        const { outer, inner } = stitchMultipolygonRings(el.members);
        for (const ring of [...outer, ...inner]) d += geomToPathD(ring, ctx.pr, ctx.EPS.area_large, true) + ' ';
        d = d.trim();
      }
      if (!d) return;
      const name = el.tags?.name;
      const id = name ? uid(`landcover_${safeName(name)}`) : uid(`landcover_${cf.cover}${el.id ? '_' + el.id : ''}`);
      const label = name || cf.cover.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
      // Merged shapes now carry the ground others abut edge-to-edge, with
      // nothing painted beneath — a self-coloured seam stroke closes the
      // sub-pixel joint (same discipline as water/beach/fallback seams).
      const seam = el._mergedRings ? ` stroke="${cf.fill}" stroke-width="1" stroke-linejoin="round"` : ' stroke="none"';
      content += `<path id="${id}" inkscape:label="${escXml(label)}" d="${d}" fill="${cf.fill}" fill-rule="evenodd"${seam}/>`;
    });
    if (!content) return '';
    return `  <g id="landcover" inkscape:label="Countryside" inkscape:groupmode="layer">\n    ${content}\n  </g>\n`;
  }

  // Beach/sand as its own painted layer, above blocks and parks (layerOrder
  // puts it right after 'parks'). Paint-only overlay like parks: NOT part of
  // any subtraction void (blockVoid/fallbackVoid in the worker are unchanged),
  // so cream stays underneath and coverage is unaffected either way. Emission
  // mirrors renderWaterways above / the parks branch in script.js's
  // renderLayerSVG: one named path per element, self-coloured seam stroke so
  // abutting fills don't show a page-background hairline.
  function renderBeach(result, ctx) {
    const elements = result.data?.elements || [];
    if (!elements.length) return '';
    const uid = makeUidGen();
    let content = '';
    for (const el of elements) {
      let d = '';
      if (el.type === 'way') d = geomToPathD(el.geometry, ctx.pr, ctx.EPS.area_large, true);
      else if (el.type === 'relation' && el.members) {
        const { outer, inner } = stitchMultipolygonRings(el.members);
        for (const ring of [...outer, ...inner]) d += geomToPathD(ring, ctx.pr, ctx.EPS.area_large, true) + ' ';
        d = d.trim();
      }
      if (!d) continue;
      const name = el.tags?.name;
      const kind = el.tags?.natural === 'sand' ? 'Sand' : 'Beach';
      const id = name ? uid(`beach_${safeName(name)}`) : uid(`beach_${el.id ?? 'x'}`);
      const label = name || kind;
      content += `<path id="${id}" inkscape:label="${escXml(label)}" d="${d}" fill="${SAND}" fill-rule="evenodd" stroke="${SAND}" stroke-width="1" stroke-linejoin="round"/>`;
    }
    if (!content) return '';
    return `  <g id="beach" inkscape:label="Beaches" inkscape:groupmode="layer">\n    ${content}\n  </g>\n`;
  }

  // ── Human-readable group labels for merged road/rail paths ────────
  // v1's roads_casings_<hw>/roads_fills_<hw> groups already carry an
  // inkscape:label (v1's own TYPE_LABELS), and rail_casing/rail_sleepers/
  // rail_tracks carry none at all. Rewriting the former in script.js would
  // change an existing attribute's VALUE, not just add one — that fails the
  // "diff shows only added label attributes" bar for touching v1 (per the
  // contract's change discipline: v1 is not modified for v2 features). So
  // this display-name scheme is applied entirely here, as a v2-only
  // string-transform of the markup v1's buildRoadsLayer/buildRailLayer
  // already returned — script.js itself is untouched.
  const ROAD_CLASS_LABELS = {
    motorway: 'Motorways', trunk: 'Motorways',
    primary: 'Main roads',
    secondary: 'Secondary roads',
    tertiary: 'Tertiary roads',
    residential: 'Residential streets', unclassified: 'Residential streets', living_street: 'Residential streets',
    service: 'Service roads',
    pedestrian: 'Pedestrian',
    footway: 'Footpaths & cycleways', cycleway: 'Footpaths & cycleways', path: 'Footpaths & cycleways', steps: 'Footpaths & cycleways',
    track: 'Tracks',
  };
  // Anything not in the table above (motorway_link, primary_link, an
  // unexpected future highway= value…) falls back to its capitalized tag
  // value, underscores read as spaces — same idiom as fallbackCategoryLabel.
  function roadClassLabel(hw) {
    if (ROAD_CLASS_LABELS[hw]) return ROAD_CLASS_LABELS[hw];
    const v = (hw || 'unclassified').replace(/_/g, ' ');
    return v.charAt(0).toUpperCase() + v.slice(1);
  }

  // Rewrite the roads_casings_<hw>/roads_fills_<hw> group inkscape:labels to
  // the display-name scheme above, with " (outline)"/" (surface)" appended
  // per pass — the SVG the browser's layer panel shows should read as human
  // names, not v1's per-tag TYPE_LABELS. Regex string-transform, not a
  // rebuild: the markup is v1's own, only the label attribute value changes.
  function relabelRoadGroups(svg) {
    return svg
      .replace(/(<g id="roads_casings_)([a-z_]+)("\s+inkscape:label=")[^"]*(")/g,
        (m, pre, hw, mid, post) => `${pre}${hw}${mid}${escXml(roadClassLabel(hw))} (outline)${post}`)
      .replace(/(<g id="roads_fills_)([a-z_]+)("\s+inkscape:label=")[^"]*(")/g,
        (m, pre, hw, mid, post) => `${pre}${hw}${mid}${escXml(roadClassLabel(hw))} (surface)${post}`);
  }

  // Add inkscape:label to v1's anonymous rail_casing/rail_sleepers/rail_tracks
  // groups (pure attribute addition, but kept alongside relabelRoadGroups so
  // both road and rail group labels live in one v2-only place).
  function relabelRailGroups(svg) {
    return svg
      .replace('<g id="rail_casing" ', '<g id="rail_casing" inkscape:label="Railway (outline)" ')
      .replace('<g id="rail_sleepers" ', '<g id="rail_sleepers" inkscape:label="Railway sleepers" ')
      .replace('<g id="rail_tracks" ', '<g id="rail_tracks" inkscape:label="Railway tracks" ');
  }

  // v2's per-layer dispatcher. Derived block layers render from precomputed
  // worker geometry; fetch-only inputs (buildings, area_features) never
  // render here; roads/rail/tram/street-labels get the square + tunnel
  // treatment above; everything else is byte-for-byte v1, delegated to
  // renderLayerSVG (water/parks/landcover included).
  function renderLayer(result, ctx) {
    if (fetchOnlyIds.has(result.layer.id)) return '';
    if (result.layer.id === 'city_blocks') return renderCityBlocks(result.data?.blocks || [], ctx);
    if (result.layer.id === 'fallback_blocks') return renderFallbackBlocks(result.data?.blocks || [], result.data?.labelElements, ctx);
    if (result.layer.id === 'waterways') return renderWaterways(result, ctx);
    if (result.layer.id === 'landcover') return renderLandcover(result, ctx);
    if (result.layer.id === 'beach') return renderBeach(result, ctx);
    if (result.layer.id === 'roads') {
      const elements = result.data?.elements || [];
      // Squares are excluded from the road stroke passes (they are neither
      // stroked as streets nor filled as plazas — they paint cream as land via
      // the block classification). Tunnels drop too. The junction-infill path
      // is spliced into this group's head in buildSVG.
      const streets = elements.filter(el => !isSquareElement(el) && !isTunnelElement(el));
      // relabelRoadGroups is a v2-only post-processing pass (see its comment):
      // v1's roads_casings_<hw>/roads_fills_<hw> groups already carry an
      // inkscape:label, so rewriting it in script.js would change an existing
      // attribute value, not just add one.
      return relabelRoadGroups(renderLayerSVG({ layer: result.layer, data: { elements: streets } }, ctx));
    }
    if (result.layer.type === 'rail' || result.layer.type === 'tram' || result.layer.id === streetLabelsLayer.id) {
      const surfaceElements = (result.data?.elements || []).filter(el => !isTunnelElement(el));
      const svg = renderLayerSVG({ layer: result.layer, data: { elements: surfaceElements } }, ctx);
      // v1's rail_casing/rail_sleepers/rail_tracks groups carry no
      // inkscape:label at all — relabelRailGroups adds one (v2-only).
      return result.layer.type === 'rail' ? relabelRailGroups(svg) : svg;
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
    // Sub-floor slivers (junction pockets, below the block-styling floor) are
    // road-space, not land: they paint once as a single road-fill path at the
    // very start of the roads layer, so casings/fills stroke over them (see
    // renderJunctionInfill / ENGINE-V2.md §2).
    const infillBlocks = results.find(r => r.layer.id === cityBlocksLayer.id)?.data?.blocks || [];
    const junctionInfill = renderJunctionInfill(infillBlocks, ctx);
    // Named squares get a map label through the same feature-label path parks
    // use: a synthetic leisure=park node anchored at the square's interior
    // point, appended to the water_labels elements so it inherits that layer's
    // styling, halo and shared collision grid. Built here (not in doExport) so
    // every buildSVG caller — browser and test harness alike — gets the same
    // labels; appended non-mutatingly, so a second buildSVG call (e.g. the
    // Illustrator variant) cannot duplicate them. The interior point reuses
    // seaInteriorPoint's pole-of-inaccessibility walk (fed the square's single
    // outer ring), which stays inside concave plazas where a centroid would
    // not. Styling matches park labels for now — provisional; squares may earn
    // their own colour.
    const squareLabelNodes = [];
    for (const el of (results.find(r => r.layer.type === 'roads')?.data?.elements || [])) {
      if (!isSquareElement(el) || !el.tags?.name) continue;
      const anchor = seaInteriorPoint({ members: [{ role: 'outer', geometry: el.geometry }] });
      if (!anchor) continue;
      squareLabelNodes.push({ type: 'node', id: `square_label_${el.id}`, lat: anchor.lat, lon: anchor.lon, tags: { leisure: 'park', name: el.tags.name } });
    }
    let layersSVG = '';
    // Water bodies + Waterways are adjacent in the paint order, so they can
    // share one "Water" parent layer without moving a single paint — purely
    // tree organization for the designer's layers panel. Buffered here and
    // flushed in place (either child may be absent on inland/dry areas).
    //
    // The green layers are deliberately NOT grouped the same way. "Countryside"
    // (landcover) sits at the bottom band so it hides under city blocks and
    // shows only through rural faces; "Parks & green" sits near the top so
    // named parks stay visible over blocks and water. Four layers separate
    // them, and an SVG parent group needs contiguous children, so nesting the
    // two would have to reorder paint. Coen's call (2026-07-14): leave them as
    // separate top-level layers rather than change the render for panel tidiness.
    let pendingWater = null;
    const flushWater = () => {
      if (pendingWater === null) return;
      if (pendingWater) layersSVG += `  <g id="water" inkscape:label="Water" inkscape:groupmode="layer">\n${pendingWater}  </g>\n`;
      pendingWater = null;
    };
    for (const result of sortResults(results)) {
      let renderResult = result;
      if (result.layer.id === waterLabelsLayer.id && squareLabelNodes.length) {
        renderResult = { layer: result.layer, data: { ...result.data, elements: [...(result.data?.elements || []), ...squareLabelNodes] } };
      }
      let layerSVG = renderLayer(renderResult, ctx);
      if (result.layer.id === 'roads' && junctionInfill) {
        layerSVG = layerSVG.replace(ROADS_GROUP_OPEN, ROADS_GROUP_OPEN + junctionInfill);
      }
      if (result.layer.id === waterBodiesLayer.id || result.layer.id === 'waterways') {
        pendingWater = (pendingWater || '') + layerSVG;
        continue;
      }
      flushWater();
      layersSVG += layerSVG;
    }
    flushWater();
    return ctx.illustratorCompatible
      ? wrapSVGIllustrator(layersSVG, ctx, physicalWidthMm)
      : wrapSVG(layersSVG, ctx, physicalWidthMm);
  }

  // Browser-side v2 orchestration. Mirrors v1's doExport shape but lean:
  // v2 ignores the layer checkboxes and always builds its own fixed layer
  // set. Reuses v1's shared helpers (bbox guard, area-name resolution,
  // size/width computation, fetchLayer, progress overlay, export state and
  // history). Its preview is rebuilt by this engine's own buildSVG function.
  async function doExport() {
    if (!bbox || exportInProgress) return;

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
    const seaNameOverride = (document.getElementById('v2-sea-name')?.value || '').trim();
    const exportSettings = getExportSettings(EXPORT_ENGINE.V2, bbox, {
      widthPx,
      physicalWidthMm,
      format: illustratorCompatible ? 'svg-illustrator' : 'svg-standard',
      seaName: seaNameOverride,
    });

    // YYYY-MM-DD-HHMMSS local time, same as v1, with a `-v2` marker before
    // the timestamp so v1 and v2 exports of the same area never collide and
    // stay distinguishable on disk.
    const now = new Date();
    const pad2 = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
    const filename = `map-${activePreset}-${areaSlug}-v2-${stamp}${illustratorCompatible ? '-illustrator' : ''}.svg`;

    return runExportLifecycle(EXPORT_ENGINE.V2, async (runId) => {

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
      // Only the buildings layer fetches a padded bbox (see BUILDING_FETCH_PAD_M):
      // edge faces whose buildings sit just off-frame must still classify urban.
      const fetchBbox = layer.id === buildingsLayer.id ? padBboxMeters(bbox, BUILDING_FETCH_PAD_M) : bbox;
      const fetchBboxStr = `${fetchBbox.south},${fetchBbox.west},${fetchBbox.north},${fetchBbox.east}`;
      const { elements, failedTiles } = await fetchLayer(layer, fetchBboxStr, fetchBbox);
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
      throw new ExportFailure({
        source: 'engine-v2',
        phase: 'fetch',
        userMessage: 'Nothing to render — check your connection and try again.',
        details: { reason: 'empty-result' },
      });
    }

    // Classify the combined area-features fetch into the render layers and the
    // worker's subtraction geometry. The sea is closed against the bbox here and
    // folded into the water bucket. area_features itself is fetch-only.
    const areaFeatureElements = results.find(r => r.layer.id === areaFeaturesLayer.id)?.data.elements || [];
    // Manual sea-name override from the field next to the v2 toggle; blank falls
    // back to the coastline-derived name (or the nameless 'Sea', no label).
    const { renderResults: areaRenderResults, classified, seaLabel } = buildAreaResults(areaFeatureElements, bbox, { seaName: seaNameOverride });
    // Feed the sea's map label through v1's feature-label engine: append it to
    // the water_labels elements so it shares that layer's styling, halo and
    // collision grid. Null when the sea is nameless (no override, no unique
    // open-coastline name) — the layer stays 'Sea' with no map label.
    if (seaLabel) {
      const waterLabelsResult = results.find(r => r.layer.id === waterLabelsLayer.id);
      if (waterLabelsResult) waterLabelsResult.data.elements = [...(waterLabelsResult.data.elements || []), seaLabel];
    }
    // (Named-square feature labels are injected in buildSVG, so the test
    // harness path gets them too.)

    // Faces stage. The cutter reads roads + rail/tram/metro; buildings classify
    // faces and seed hamlet blobs; water/green/landcover/waterways feed the
    // mechanical subtraction. Buildings and area_features are fetch-only.
    progress.setStage('faces', 'active', { detail: 'Starting worker…' });
    const { pr, H } = makeProjector(bbox, widthPx);
    const buildingElements = results.find(r => r.layer.id === buildingsLayer.id)?.data.elements || [];
    // Rural place nodes ground hamlet blobs (fetch-only, projected in the worker
    // payload — see prepareFaceData / the hamlet face loop).
    const placeNodeElements = results.find(r => r.layer.id === placeNodesLayer.id)?.data.elements || [];
    // Cutter input = roads only (rail/tram/metro stopped cutting 2026-07-12 —
    // see prepareFaceData; buildings + area_features are not cutters either;
    // area geometry subtracts, it does not bound faces).
    const cutterResults = results.filter(r => r.layer.type === 'roads');
    const onFaceProgress = (msg, pct) => {
      progress.setStage('faces', 'active', { detail: msg });
      progress.bar(55 + Math.round(pct * 0.25));
    };
    const { blocks, culledLandcover, greenGroundMerges } = await computeFacesAsync(cutterResults, buildingElements, classified, pr, widthPx, H, onFaceProgress, { bbox, placeNodeElements });
    // Green-remainder merges (paint-only, before the cull filter reindexes):
    // a merged element paints the worker's grown rings — its own shape unioned
    // with the coverage remainder of the green-open piece(s) it lies in — so
    // the unmapped gaps inside a green piece belong to the green polygon
    // itself instead of becoming cream "Residential" patches beside it.
    if (greenGroundMerges && greenGroundMerges.length) {
      const landcoverResult = areaRenderResults.find(r => r.layer.id === landcoverLayer.id);
      if (landcoverResult) {
        for (const { index, rings } of greenGroundMerges) {
          const el = landcoverResult.data.elements[index];
          if (el) landcoverResult.data.elements[index] = { ...el, _mergedRings: rings };
        }
      }
      progress.log(`landcover: ${greenGroundMerges.length} element${greenGroundMerges.length === 1 ? '' : 's'} grown over green-open coverage remainders`);
    }
    // Occlusion cull (paint-only): drop landcover elements the worker found
    // fully hidden under the city blocks. Indices are into classified.landcover,
    // which is the SAME array the landcover render result holds — filter it in
    // place so the cull touches paint alone (voids/coverage stay as computed).
    if (culledLandcover && culledLandcover.length) {
      const cull = new Set(culledLandcover);
      const landcoverResult = areaRenderResults.find(r => r.layer.id === landcoverLayer.id);
      if (landcoverResult) landcoverResult.data.elements = landcoverResult.data.elements.filter((_, i) => !cull.has(i));
      progress.log(`landcover: ${cull.size} element${cull.size === 1 ? '' : 's'} culled (fully hidden under city blocks)`);
    }
    const urbanBlocks = blocks.filter(b => (b.kind || 'urban') === 'urban').length;
    const hamletBlocks = blocks.filter(b => b.kind === 'hamlet').length;
    const buildingBlocks = blocks.filter(b => b.kind === 'building').length;
    const fallbackBlocks = blocks.filter(b => b.kind === 'fallback').length;
    progress.setStage('faces', 'done', { meta: `${urbanBlocks + hamletBlocks} blocks` });
    progress.log(`city_blocks: ${urbanBlocks} urban, ${hamletBlocks} hamlet, ${buildingBlocks} standalone buildings; fallback_blocks: ${fallbackBlocks} patches`);

    // Renderable results = everything except the fetch-only inputs, plus the
    // classified area layers and the two derived block layers. Both block
    // results carry the full block list; each renderer filters by kind.
    const renderableResults = results.filter(r => !fetchOnlyIds.has(r.layer.id));
    renderableResults.push(...areaRenderResults);
    renderableResults.push({ layer: cityBlocksLayer, data: { blocks } });
    renderableResults.push({ layer: fallbackBlocksLayer, data: { blocks, labelElements: classified.labelOnly } });

    // Render stage.
    progress.setStage('render', 'active', { detail: 'Assembling SVG…' });
    await new Promise((r) => setTimeout(r, 0));
    const svg = buildSVG(renderableResults, bbox, widthPx, physicalWidthMm, { illustratorCompatible });
    progress.setStage('render', 'done', { meta: `${renderableResults.length} layer${renderableResults.length > 1 ? 's' : ''}`, detail: '' });
    progress.bar(90);

    // Finalize — same conventions as v1 so export state/history stay shared.
    progress.setStage('finalize', 'active', { detail: 'Wrapping up…' });
    const actualMB = (svg.length / 1024 / 1024).toFixed(1);
    progress.setStage('finalize', 'done', { meta: `${actualMB} MB`, detail: '' });
    progress.bar(100);
    progress.log(`Done — ${actualMB} MB, ${totalElements.toLocaleString()} elements`);

    await new Promise((r) => setTimeout(r, 250));

    // Commit output state only after fetch, worker and render all completed.
    commitSuccessfulExport({
      svg,
      filename,
      engine: EXPORT_ENGINE.V2,
      results: renderableResults,
      exportBbox: bbox,
      widthPx,
      physicalWidthMm,
      runId,
      settings: exportSettings,
    });
    setStatus(`✓ Engine v2 · ${widthPx}px wide · ${actualMB} MB · ${urbanBlocks + hamletBlocks} blocks · ${fallbackBlocks} fallback`, 'success');
    saveHistory(bbox, activePreset, widthPx, filename, actualMB, totalElements, areaName);
    return { filename, totalElements };
    });
  }

  return {
    layers, layerOrder, buildSVG, doExport,
    // Exposed for the headless test harness (tests/real-export.mjs).
    FACE_WORKER_SRC, prepareFaceData, computeFacesAsync, fetchOnlyIds, buildingsLayer, cityBlocksLayer, fallbackBlocksLayer,
    areaFeaturesLayer, placeNodesLayer, AREA_FEATURES, classifyAreaFeatures, buildAreaResults, buildSeaElements, seaInteriorPoint,
    // Building-fetch padding (cause A) — shared with the headless harness.
    padBboxMeters, BUILDING_FETCH_PAD_M,
    // Hamlet grounding (pure; exercised by tests/hamlet-grounding.mjs).
    pointToPolygonDistancePx, groundHamletContour, HAMLET_GROUND_SETTLEMENT_M, HAMLET_GROUND_LOCALITY_M,
  };
})();
