'use strict';

// ════════════════════════════════════════════════════════════════
//  HELP CONTENT
// ════════════════════════════════════════════════════════════════
const HELP = {
  search: {
    title: 'Find a city',
    content: `
      <p>Type a city, neighbourhood, or address and press <strong>Go</strong> to search. Select a result to fly the map to that location.</p>
      <p>The <strong>locate icon</strong> inside the search field flies the map to your current position instead, using the browser's geolocation. It's entirely optional — the browser only asks for location permission if you click it.</p>
      <p><strong>Use admin boundary</strong> draws the official administrative boundary of the matched area as a polygon on the map — useful as a visual reference frame.</p>
      <div class="tip">The boundary outline is shown on the map but is <em>not</em> included in the SVG export.</div>
    `
  },
  step1: {
    title: 'Select export area',
    content: `
      <p>Click <strong>Draw rectangle</strong>, then drag a box on the map to define what gets exported. The bounding box coordinates (N/S/E/W) are shown after drawing.</p>
      <p>You can redraw at any time — the new selection replaces the old one.</p>
      <p>The exported filename includes a place name, looked up automatically from the selection (reverse geocoded from the bbox centre, or taken from the matched place if you used <strong>Use admin boundary</strong>). If none can be found, you'll be asked to type one in right before export.</p>
      <ul>
        <li>Small areas (a few city blocks) export in under a minute</li>
        <li>A typical city centre can take 2–5 minutes</li>
        <li>Large areas may take 10+ minutes — the public OSM servers enforce rate limits, so the export pauses between requests</li>
      </ul>
      <p><strong>Print size</strong> (shown below the coordinates once you draw an area) isn't something you choose — it's derived from the shape of your rectangle, fit as large as possible inside the standard USE-IT plattegrond envelope (67.5 × 40.5cm @ 300dpi, or that rotated for a tall area). Need it bigger (gigantic-city format) or smaller (a small inset)? Scale the exported SVG in Illustrator/InDesign — line weights and labels scale right along with it.</p>
      <div class="tip">Exports can take a while because the public Overpass API rate-limits requests. A warning appears when the selected area is very large — consider splitting large exports into smaller sections.</div>
    `
  },
  step2: {
    title: 'Map style',
    content: `
      <p>The export uses a <strong>USE-IT</strong> city guide colour scheme — warm cream background, white roads, clear blue water, and green parks.</p>
      <p>This style is optimised for print city guides with high readability and a warm, inviting feel.</p>
      <div class="tip">Style only affects colours in the SVG — you can always re-colour individual layers in Illustrator or Inkscape after export.</div>
    `
  },
  step3: {
    title: 'Map layers',
    content: `
      <p>Toggle which types of features appear in the exported SVG. Unchecked layers are skipped entirely, making exports faster and files smaller.</p>
      <p>Each layer becomes a <strong>separate named group</strong> in the SVG — you can show, hide, lock, or re-style them individually in Illustrator or Inkscape.</p>
      <ul>
        <li><strong>Roads</strong> — all road types from motorways to footpaths</li>
        <li><strong>Water</strong> — rivers, lakes, and coastlines</li>
        <li><strong>Parks & green</strong> — parks, forests, and natural areas</li>
        <li><strong>Buildings</strong> — building footprints</li>
        <li><strong>Labels</strong> — road name text (per road type)</li>
      </ul>
      <div class="tip">Disable layers you don't need to make exports faster and files smaller.</div>
    `
  },
  step4: {
    title: 'Export options',
    content: `
      <p><strong>Format:</strong> Adobe Illustrator's SVG import is buggy enough that one file cannot be optimal in both Illustrator and standards-based tools, so pick the format for the tool you will open the file in. All paths are editable vectors in both.</p>
      <ul>
        <li><strong>SVG (Illustrator)</strong> — tweaked so the file opens cleanly in Illustrator (and places in InDesign 2020+): curved street names arrive pre-positioned letter by letter, and everything sticks to the SVG subset Illustrator understands. Don't expect this file to be optimal in other SVG viewers/editors.</li>
        <li><strong>SVG (Inkscape / others)</strong> — standards-based SVG for Inkscape, web browsers, and other conforming tools, with real Inkscape layers and text-on-path street names. Don't expect this file to open perfectly in Illustrator.</li>
      </ul>
      <p><strong>Labels on:</strong> Control which road types include name labels. More labels means a larger file and slower rendering in Illustrator.</p>
      <div class="tip">For large areas, disable layers and labels you don't need to keep file sizes manageable.</div>
    `
  },
  history: {
    title: 'Recent exports',
    content: `
      <p>Shows your recent exports with the area name and timestamp. Click any item to <strong>re-run that export</strong> with the same bounding box and current settings.</p>
      <p>Use the <strong>✕</strong> button on an item to remove it from the list.</p>
      <div class="tip">History is stored in your browser's local storage. Clearing your browser's site data will erase it.</div>
    `
  }
};

function showHelp(key) {
  const h = HELP[key];
  if (!h) return;
  document.getElementById('help-modal-title').textContent = h.title;
  document.getElementById('help-modal-body').innerHTML = h.content;
  document.getElementById('help-modal').classList.add('show');
}

function hideHelp() {
  document.getElementById('help-modal').classList.remove('show');
}

// ════════════════════════════════════════════════════════════════
//  STYLE PRESETS
// ════════════════════════════════════════════════════════════════
const PRESETS = {
  useit: {
    label: 'USE-IT',
    swatches: ['#ffffff','#ffffff','#A4DBF3','#51A886'],
    bg: '#ffffff',
    roads: {
      motorway:      { fill:'#ffffff', casing:'#F4AFA7' },
      trunk:         { fill:'#ffffff', casing:'#F4AFA7' },
      motorway_link: { fill:'#ffffff', casing:'#F4AFA7' },
      trunk_link:    { fill:'#ffffff', casing:'#F4AFA7' },
      primary:       { fill:'#ffffff', casing:'#F4AFA7' },
      primary_link:  { fill:'#ffffff', casing:'#F4AFA7' },
      secondary:     { fill:'#ffffff', casing:'#F4AFA7' },
      secondary_link:{ fill:'#ffffff', casing:'#F4AFA7' },
      tertiary:      { fill:'#ffffff', casing:'#F4AFA7' },
      tertiary_link: { fill:'#ffffff', casing:'#F4AFA7' },
      residential:   { fill:'#ffffff', casing:'#F4AFA7' },
      unclassified:  { fill:'#ffffff', casing:'#F4AFA7' },
      living_street: { fill:'#ffffff', casing:'#F4AFA7' },
      cycleway:      { fill:'#ffffff', casing:'#F4AFA7' },
      pedestrian:    { fill:'#ffffff', casing:'#F4AFA7' },
      footway:       { fill:'#ffffff', casing:'#F4AFA7' },
      path:          { fill:'#ffffff', casing:'#F4AFA7' },
      steps:         { fill:'#ffffff', casing:'#F4AFA7' },
    },
    water: '#A4DBF3', waterOp: 1,
    park:  '#51A886', parkOp: 1,
    // Countryside land cover (landcover layer): fields stay a quiet tint so
    // hamlet blocks and named parks keep the contrast; woods reuse park green.
    field: '#EAF0DA',
    building: '#FEF6ED', buildingStroke: '#F4AFA7',
    labelColor: '#2a2a20',
  },
};

let activePreset = 'useit';

// ════════════════════════════════════════════════════════════════
//  PRINT SIZE — derived from the bbox shape, not user-picked
// ════════════════════════════════════════════════════════════════
// USE-IT city maps aren't one fixed shape — city footprints vary too much to
// snap to a grid. What IS fixed is the largest page a USE-IT team ever prints
// a plattegrond within: 67.5 x 40.5cm (or that rotated, for a tall bbox). We
// fit the bbox's true geographic aspect ratio inside that envelope — as large
// as possible without exceeding it on either edge — which sets the physical
// size baked into the export (and with it, via getScaleFactor, how thick
// roads/labels render relative to the geography).
// A team that needs a bigger (gigantic-city, 6-square) or smaller (inset)
// final size just scales the vector output afterward in Illustrator/InDesign
// — stroke widths and label sizes scale right along with it, so the result
// is identical to having exported at that size directly.
const PRINT_ENVELOPE_MAX_MM = 675; // long edge, 67.5cm (5 squares)
const PRINT_ENVELOPE_MIN_MM = 405; // short edge, 40.5cm (3 squares)
const PRINT_DPI = 300;

function getPhysicalSizeMm(b) {
  const [xMin,yMin]=degToMerc(b.west,b.south), [xMax,yMax]=degToMerc(b.east,b.north);
  const aspect = (xMax-xMin)/(yMax-yMin); // real-world width/height
  const landscape = aspect >= 1;
  const envW = landscape ? PRINT_ENVELOPE_MAX_MM : PRINT_ENVELOPE_MIN_MM;
  const envH = landscape ? PRINT_ENVELOPE_MIN_MM : PRINT_ENVELOPE_MAX_MM;
  return aspect >= envW/envH
    ? { mmW: envW, mmH: envW/aspect }
    : { mmW: envH*aspect, mmH: envH };
}

// ════════════════════════════════════════════════════════════════
//  LAYER REGISTRY
// ════════════════════════════════════════════════════════════════
// ── Island-green exception ────────────────────────────────────────
// The parks layer hides nameless green city-wide — a deliberate stylistic
// choice: a USE-IT map shows named destinations, not every verge or street
// tree. The one place that rule produces a WRONG result is a river/lake island
// (an inner ring of a water multipolygon): if its real green cover happens to
// be nameless, hiding it leaves the island a blank hole in the map. So the
// parks query ALSO fetches these nameless land-cover tags as *candidates*, and
// pruneIslandGreens keeps only the ones that actually fall inside an island —
// everything else is dropped before it can render or punch a city block.
const ISLAND_GREEN = {
  leisure: new Set(['park', 'garden']),
  landuse: new Set(['grass', 'village_green', 'meadow', 'forest']),
  natural: new Set(['wood', 'scrub', 'wetland', 'heath']),
};
// The ISLAND_GREEN land-cover value an element carries, or null. Used both to
// gate the candidate (isIslandGreenCandidate) and to label the rendered patch.
function islandGreenCover(el) {
  if (!el || el.type === 'node' || !el.tags) return null;
  for (const key in ISLAND_GREEN) {
    const v = el.tags[key];
    if (v && ISLAND_GREEN[key].has(v)) return v;
  }
  return null;
}
function isIslandGreenCandidate(el) { return islandGreenCover(el) !== null; }
// A genuine, name-bearing green destination worth a place on a stylised map.
// Shared by the parks tagFilter and pruneIslandGreens (which must tell a real
// named park from a bare island candidate that still has to earn its place).
function parksNamedGate(el) {
  if (el.type === 'node' || !el.tags?.name) return false;
  const n = el.tags.name.toLowerCase().trim();
  if (n.length < 4) return false;
  if (/^(green|grass|groen|tuin|garden|garten|jardin|beplanting|planting|plantsoen|hedge|lawn|speeltuin|spielplatz|playground|parking|parkeerplaats|terrain|terrein|veld|field|berm|strip|border|rand|strook|perk|bloem|flower|rozenperk|heg|haag)/.test(n)) return false;
  return /^(park|garden|nature_reserve|recreation_ground)$/.test(el.tags.leisure || '')
    || /^(forest|cemetery|allotments|recreation_ground)$/.test(el.tags.landuse || '')
    || el.tags.natural === 'wood' || el.tags.amenity === 'grave_yard' || el.tags.tourism === 'zoo';
}
// Ray-cast point-in-polygon for [lon,lat]/[x,y] rings on the main thread
// (the block worker's own pointInPoly lives inside a source string, out of
// reach here).
function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// Closed inner rings (islands) of every water_bodies multipolygon, as [lon,lat]
// rings. The one authoritative definition of "inside an island", reused by
// pruneIslandGreens and (projected) by the block cutter.
function waterIslandRings(results) {
  const rings = [];
  const wb = results.find(r => r.layer?.id === 'water_bodies');
  if (!wb?.data?.elements) return rings;
  for (const el of wb.data.elements) {
    if (el.type !== 'relation' || !el.members) continue;
    for (const ring of stitchMultipolygonRings(el.members).inner) {
      if (ring.length >= 4) rings.push(ring.map(p => [p.lon, p.lat]));
    }
  }
  return rings;
}
// Drop nameless island-green candidates that aren't actually on an island, so
// the stylistic name gate still holds everywhere except real islands. Mutates
// the parks result in place. Idempotent (named greens always pass; a dropped
// candidate stays dropped), so it's safe to call from both the block-data prep
// and the SVG builder — whichever runs first, the other is a no-op.
function pruneIslandGreens(results) {
  const parks = results.find(r => r.layer?.id === 'parks');
  if (!parks?.data?.elements?.length) return;
  let islands = null; // computed lazily on the first candidate that needs it
  parks.data.elements = parks.data.elements.filter(el => {
    if (parksNamedGate(el)) return true;
    if (islands === null) islands = waterIslandRings(results);
    if (!islands.length) return false;
    const b = el.bounds;
    let cx, cy;
    if (b) { cx = (b.minlon + b.maxlon) / 2; cy = (b.minlat + b.maxlat) / 2; }
    else if (el.geometry?.length) {
      cx = el.geometry.reduce((s, p) => s + p.lon, 0) / el.geometry.length;
      cy = el.geometry.reduce((s, p) => s + p.lat, 0) / el.geometry.length;
    } else return false;
    return islands.some(ring => pointInRing(cx, cy, ring));
  });
}

const LAYER_REGISTRY = [
  { group: 'Natural', layers: [
    { id:'water_bodies', label:'Water bodies',     hint:'Lakes, reservoirs, docks, basins',    color:'#7eb8da', defaultOn:true,  type:'area', fillOpacity:0.85, strokeWidth:2,
      // Water SURFACES only (things that read as open water). natural=water|bay
      // plus the legacy/harbour variants that carry no natural=water of their
      // own: waterway=riverbank (pre-2018 river-area tagging), waterway=dock
      // and landuse=basin/reservoir (harbour + retention basins), leisure=marina.
      // Without these a coastal/harbour export paints a solid cream block over
      // the water. natural=coastline (the sea) is deliberately NOT here — it is
      // an unclosed line, handled by a separate plan.
      overpassQuery:(b)=>`wr["natural"~"water|bay"](${b});wr["waterway"~"^(riverbank|dock)$"](${b});wr["landuse"~"^(reservoir|basin)$"](${b});wr["leisure"="marina"](${b});`,
      tagFilter:el=>el.type!=='node'&&((/water|bay/.test(el.tags?.natural||''))||/^(riverbank|dock)$/.test(el.tags?.waterway||'')||/^(reservoir|basin)$/.test(el.tags?.landuse||'')||el.tags?.leisure==='marina') },
    { id:'waterways',    label:'Waterways',         hint:'Rivers, canals, streams',     color:'#7eb8da', defaultOn:true,  type:'line', strokeWidth:12,
      overpassQuery:(b)=>`way["waterway"~"river|canal|stream|drain"]["name"](${b});`,
      tagFilter:el=>el.type==='way'&&/river|canal|stream|drain/.test(el.tags?.waterway||'')&&el.tags?.name },
    { id:'parks',        label:'Parks & green',     hint:'Named parks, forests, cemeteries, gardens',     color:'#b8d89a', defaultOn:true,  type:'area', fillOpacity:1, strokeWidth:0,
      // Two kinds of fetch here. (1) Named green destinations big enough to
      // matter for orientation — parks, forests, cemeteries, gardens, zoos,
      // allotments — kept behind the ["name"] gate + junk-name filter in
      // parksNamedGate, which is what keeps stray city green off the map. (2)
      // The ISLAND_GREEN land-cover tags fetched WITHOUT a name as candidates;
      // pruneIslandGreens later drops every one that isn't inside a water-body
      // island, so nameless green only ever survives there. park|garden and
      // forest|wood are fetched nameless (a superset of their named form).
      overpassQuery:(b)=>`wr["leisure"~"^(park|garden)$"](${b});wr["landuse"~"^(grass|village_green|meadow|forest)$"](${b});wr["natural"~"^(wood|scrub|wetland|heath)$"](${b});wr["leisure"~"^(nature_reserve|recreation_ground)$"]["name"](${b});wr["landuse"~"^(cemetery|allotments|recreation_ground)$"]["name"](${b});wr["amenity"="grave_yard"]["name"](${b});wr["tourism"="zoo"]["name"](${b});`,
      tagFilter:el=>parksNamedGate(el)||isIslandGreenCandidate(el) },
    { id:'landcover',    label:'Countryside',       hint:'Farmland & woods outside built-up areas', color:'#9ec98f', defaultOn:true,  type:'area', fillOpacity:1, strokeWidth:0,
      // Rural land cover, fetched WITHOUT a name gate — the deliberate
      // "named destinations only" style rule (see parks above) is an URBAN
      // rule; in the countryside the fields and woods ARE the map. It paints
      // at the very bottom of LAYER_ORDER, so inside a city every one of
      // these polygons sits under the curb-to-curb block fill and stays
      // invisible — city output is unchanged. Only where the block cutter
      // classifies a face as countryside (see BLOCK_WORKER_SRC) does the
      // face stay unfilled and this layer show through. Named forests are
      // excluded here (!parksNamedGate) — those belong to parks, which also
      // labels them; without the exclusion the same polygon would paint twice.
      overpassQuery:(b)=>`wr["landuse"~"^(farmland|meadow|orchard|vineyard|forest)$"](${b});wr["natural"~"^(wood|scrub|heath)$"](${b});`,
      tagFilter:el=>el.type!=='node'&&!parksNamedGate(el)&&(/^(farmland|meadow|orchard|vineyard|forest)$/.test(el.tags?.landuse||'')||/^(wood|scrub|heath)$/.test(el.tags?.natural||'')) },
  ]},
  { group: 'Built environment', layers: [
    // City blocks are derived, not fetched: the worker fills the negative space of
    // the road/rail/water/park network (each road-bounded face = one solid block,
    // curb-to-curb). No overpassQuery → the Overpass fetch loop skips this layer; it
    // renders from ctx.precomputedBlocks, computed from the roads/water/parks results.
    { id:'city_blocks',  label:'City blocks',       hint:'Solid blocks filling the space between streets', color:'#d4c8b4', defaultOn:true,  type:'derived', fillOpacity:1, strokeWidth:0, strokeColor:'#b8a890' },
    { id:'roads',        label:'Roads & streets',   hint:'All roads, styled by type',   color:'#ffffff', defaultOn:true,  type:'roads',
      overpassQuery:(b)=>`way["highway"~"motorway|trunk|motorway_link|trunk_link|primary|secondary|primary_link|secondary_link|tertiary|tertiary_link|residential|unclassified|living_street|cycleway|footway|path|pedestrian|steps"](${b});`,
      tagFilter:el=>el.type==='way'&&/^(motorway|trunk|motorway_link|trunk_link|primary|secondary|primary_link|secondary_link|tertiary|tertiary_link|residential|unclassified|living_street|cycleway|footway|path|pedestrian|steps)$/.test(el.tags?.highway||'') },
    { id:'street_labels',label:'Street labels',     hint:'Road names by category',      color:'#222211', defaultOn:true,  type:'labels',
      overpassQuery:(b)=>`way["highway"~"motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|cycleway|pedestrian|footway"]["name"](${b});`,
      // cycleway/footway deliberately absent: PATH_STYLES classes render as
      // unlabelled dashes. overpassQuery still fetches them — the query string
      // feeds the cache key, so narrowing it would only invalidate the cache.
      tagFilter:el=>el.type==='way'&&/^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|pedestrian)$/.test(el.tags?.highway||'')&&el.tags?.name },
  ]},
  { group: 'Transit', layers: [
    { id:'rail',         label:'Railways',          hint:'Main line & narrow gauge',    color:'#444444', defaultOn:true,  type:'rail',
      overpassQuery:(b)=>`way["railway"~"rail|narrow_gauge|preserved"](${b});`,
      tagFilter:el=>el.type==='way'&&/^(rail|narrow_gauge|preserved)$/.test(el.tags?.railway||'') },
    { id:'metro',        label:'Metro / subway',    hint:'Underground & subway lines',  color:'#e63030', defaultOn:false, type:'metro',
      overpassQuery:(b)=>`way["railway"="subway"](${b});`,
      tagFilter:el=>el.type==='way'&&el.tags?.railway==='subway' },
    { id:'tram',         label:'Tram & light rail', hint:'Tram & light rail lines',     color:'#22aa88', defaultOn:false, type:'tram',
      overpassQuery:(b)=>`way["railway"~"tram|light_rail"](${b});`,
      tagFilter:el=>el.type==='way'&&/^(tram|light_rail)$/.test(el.tags?.railway||'') },
    { id:'transit_stops',label:'Transit stops',     hint:'Bus, tram & rail stops',      color:'#444444', defaultOn:false, type:'point', radius:2.5,
      overpassQuery:(b)=>`node["public_transport"~"stop_position|platform"](${b});node["highway"="bus_stop"](${b});node["railway"~"station|halt|tram_stop"](${b});`,
      tagFilter:el=>el.type==='node'&&(/stop_position|platform/.test(el.tags?.public_transport||'')||el.tags?.highway==='bus_stop'||/station|halt|tram_stop/.test(el.tags?.railway||'')) },
  ]},
  { group: 'Labels', layers: [
    { id:'water_labels', label:'Water & park names', hint:'Rivers, lakes, parks',       color:'#1a3a6a', defaultOn:true,  type:'feature_labels',
      overpassQuery:(b)=>`way["waterway"~"river|canal"]["name"](${b});wr["natural"="water"]["name"](${b});wr["leisure"~"park|garden"]["name"](${b});node["place"~"suburb|neighbourhood|quarter"]["name"](${b});`,
      tagFilter:el=>(el.type==='way'&&/river|canal/.test(el.tags?.waterway||'')&&el.tags?.name)||(el.type!=='node'&&el.tags?.natural==='water'&&el.tags?.name)||(el.type!=='node'&&/park|garden/.test(el.tags?.leisure||'')&&el.tags?.name)||(el.type==='node'&&/suburb|neighbourhood|quarter/.test(el.tags?.place||'')&&el.tags?.name) },
  ]},
];

// ════════════════════════════════════════════════════════════════
//  SUPERSESSIONS — §1.1
// ════════════════════════════════════════════════════════════════
// When two enabled layers would fetch overlapping elements, one of them
// can skip its own statement and pick its slice out of the other's
// response via tagFilter. Saves duplicated work server-side and cuts
// response bytes on the wire.
//
// Only triggers when every `requires` layer is also part of the SAME
// combined fetch — i.e. one of the uncachedLayers this round. If the
// superseder is already cached (its statement isn't in this fetch),
// stripping would drop the data from the wire entirely and the
// subordinate layer would get nothing.
const SUPERSESSIONS = {
  // roads' highway regex is a superset of street_labels' — and roads
  // doesn't require `["name"]`, so the named subset is still present.
  street_labels: [
    { strip:(b)=>`way["highway"~"motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|cycleway|pedestrian|footway"]["name"](${b});`,
      requires:['roads'] },
  ],
  // water_labels fetches four kinds of names; the river/canal and
  // natural=water slices are covered by waterways and water_bodies
  // respectively. leisure park|garden stays un-stripped: parks now fetches
  // both but name-gates them through a junk-name filter, so its slice isn't a
  // reliable superset. place=suburb|neighbourhood nodes have no superseder.
  water_labels: [
    { strip:(b)=>`way["waterway"~"river|canal"]["name"](${b});`,
      requires:['waterways'] },
    { strip:(b)=>`wr["natural"="water"]["name"](${b});`,
      requires:['water_bodies'] },
  ],
};

function supersededQuery(layer, b, inFetchSet) {
  let q = layer.overpassQuery(b);
  const rules = SUPERSESSIONS[layer.id];
  if (!rules) return q;
  for (const r of rules) {
    if (r.requires.every(id => inFetchSet.has(id))) {
      q = q.replace(r.strip(b), '');
    }
  }
  return q;
}

// ════════════════════════════════════════════════════════════════
//  ROAD STYLE TABLE (widths — colours come from active preset)
// ════════════════════════════════════════════════════════════════
const ROAD_WIDTHS = {
  motorway:{fillW:66,casingW:12},     trunk:{fillW:60,casingW:12},
  motorway_link:{fillW:42,casingW:12}, trunk_link:{fillW:42,casingW:12},
  primary:{fillW:54,casingW:12},      primary_link:{fillW:36,casingW:12},
  secondary:{fillW:48,casingW:12},    secondary_link:{fillW:30,casingW:12},
  tertiary:{fillW:42,casingW:12},     tertiary_link:{fillW:27,casingW:12},
  residential:{fillW:30,casingW:12},  unclassified:{fillW:27,casingW:12},
  living_street:{fillW:24,casingW:12},
  cycleway:{fillW:12,casingW:12,dash:'6 3'},
  pedestrian:{fillW:27,casingW:12},
  footway:{fillW:9,casingW:12,dash:'4 2'},
  path:{fillW:7.5,casingW:12,dash:'4 2'},
  steps:{fillW:9,casingW:12,dash:'2 2'},
  _default:{fillW:18,casingW:12},
};
// Small path classes render as ONE dashed stroke in the casing colour — no
// casing, no white fill, no street labels — so they can't be mistaken for
// streets (which bound city blocks; these don't). Dash code: long dash =
// cycleway, short dash = footway, fine thin dash = dirt path, wide short
// rungs = steps. w/dash are map px and scale with sf — the old ROAD_WIDTHS
// dash strings were unscaled, which is why these classes used to render as
// solid mini-streets at print sizes. Over parks/water the stroke is
// overprinted white via a clipPath (salmon vanishes on the park green).
const PATH_STYLES = {
  cycleway: { w:5.5, dash:[24,9] },
  footway:  { w:4.5, dash:[13,8] },
  path:     { w:3.5, dash:[7,8] },
  steps:    { w:12,  dash:[4.5,6] },
};

const ROAD_DRAW_ORDER=['path','footway','steps','cycleway','pedestrian','living_street','unclassified','residential','tertiary_link','tertiary','secondary_link','secondary','primary_link','primary','trunk_link','motorway_link','trunk','motorway'];
const TYPE_LABELS={motorway:'Motorways',trunk:'Trunk roads',motorway_link:'Motorway links',trunk_link:'Trunk links',primary:'Primary roads',primary_link:'Primary links',secondary:'Secondary roads',secondary_link:'Secondary links',tertiary:'Tertiary roads',tertiary_link:'Tertiary links',residential:'Residential streets',unclassified:'Unclassified roads',living_street:'Living streets',cycleway:'Cycleways',pedestrian:'Pedestrian areas',footway:'Footways',path:'Paths',steps:'Steps'};

// Label visibility per road category (controlled from UI). Default to labelling
// every named road type; the UI can switch individual categories off.
const LABEL_VISIBILITY = { motorway:true, trunk:true, primary:true, secondary:true, tertiary:true, residential:true };

// ════════════════════════════════════════════════════════════════
//  METRO PALETTE
// ════════════════════════════════════════════════════════════════
const METRO_PALETTE=['#e63030','#2979e6','#29b860','#f0a500','#9b30e6','#00aacc','#e67030','#cc2288','#55aa00','#886600'];

// ════════════════════════════════════════════════════════════════
//  APP STATE
// ════════════════════════════════════════════════════════════════
let map, bboxRect=null, bbox=null, isDrawing=false, drawStart=null;
let lastSvgString=null, lastSvgFilename=null;
let searchTimeout=null;
let currentAreaName='';       // best-known place name for the current bbox (silent, no UI field)
let areaNameLookup=null;      // in-flight reverse-geocode promise, if any
let areaNameLookupToken=0;    // invalidates a stale in-flight lookup after a redraw/re-pick
let lastResults=null;   // cached Overpass data from the most recent export fetch
let previewDebounce=null;
let failedTileLayerGroup=null; // Leaflet LayerGroup for failed-tile overlay rectangles
const endpointBackoff={};      // { endpoint -> { until: timestamp, delay: ms } }
let adaptiveTileDelay=350;     // ms between tile fetches; increases when 429s occur

// ════════════════════════════════════════════════════════════════
//  INIT MAP
// ════════════════════════════════════════════════════════════════
function initMap() {
  const mapEl = document.getElementById('map');
  function setMapHeight() {
    mapEl.style.height = (window.innerHeight - document.getElementById('hdr').offsetHeight) + 'px';
  }
  setMapHeight();
  window.addEventListener('resize', setMapHeight);
  map = L.map('map', { zoomControl:true }).setView([51.5555, 5.0913], 13);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom:19, crossOrigin:true
  }).addTo(map);
  failedTileLayerGroup = L.layerGroup().addTo(map);
  // Keep Leaflet's cached container size in sync with the real element size —
  // fires on initial layout settle, window resize, and header height changes.
  new ResizeObserver(() => map.invalidateSize()).observe(mapEl);
}

// ════════════════════════════════════════════════════════════════
//  PRESET UI
// ════════════════════════════════════════════════════════════════
function renderPresets() {
  const grid = document.getElementById('preset-grid');
  const p = PRESETS.useit;
  const swatchHtml = p.swatches.map(c => `<span style="background:${c};border:1px solid #ccc8b8"></span>`).join('');
  grid.innerHTML = `<div class="preset-btn active" style="grid-column:1/-1;cursor:default"><div class="preset-swatch">${swatchHtml}</div>${p.label}</div>`;
}

// ════════════════════════════════════════════════════════════════
//  LAYER LIST
// ════════════════════════════════════════════════════════════════
function renderLayers() {
  const list = document.getElementById('layers-list');
  list.innerHTML = '';
  LAYER_REGISTRY.forEach(group => {
    const gl = document.createElement('div');
    gl.className = 'layer-group-label';
    gl.textContent = group.group;
    list.appendChild(gl);
    group.layers.forEach(layer => {
      const row = document.createElement('div');
      row.className = 'layer-row';
      row.innerHTML = `<input type="checkbox" id="lyr-${layer.id}" ${layer.defaultOn?'checked':''}><span class="layer-swatch" style="background:${layer.color}"></span><label for="lyr-${layer.id}">${layer.label}<br><span class="layer-hint">${layer.hint}</span></label>`;
      row.querySelector('input').addEventListener('change', scheduleLivePreview);
      list.appendChild(row);
    });
  });
}

// ════════════════════════════════════════════════════════════════
//  LABEL TOGGLES
// ════════════════════════════════════════════════════════════════
function renderLabelToggles() {
  const wrap = document.getElementById('label-toggles');
  wrap.innerHTML = '';
  const cats = ['motorway','primary','secondary','tertiary','residential'];
  const fullNames = {motorway:'Motorway',primary:'Primary',secondary:'Secondary',tertiary:'Tertiary',residential:'Residential'};
  cats.forEach(cat => {
    const id = `lbl-${cat}`;
    const label = document.createElement('label');
    label.style.cssText='display:flex;align-items:center;gap:3px;font-size:9px;color:var(--muted);cursor:pointer;white-space:nowrap';
    label.innerHTML = `<input type="checkbox" id="${id}" ${LABEL_VISIBILITY[cat]?'checked':''} style="width:10px;height:10px;accent-color:var(--accent2)"> ${fullNames[cat]}`;
    label.querySelector('input').addEventListener('change', e => { LABEL_VISIBILITY[cat] = e.target.checked; scheduleLivePreview(); });
    wrap.appendChild(label);
  });
}

// ════════════════════════════════════════════════════════════════
//  BBOX DRAWING
// ════════════════════════════════════════════════════════════════
function startDraw() {
  if (isDrawing) return;
  isDrawing = true;
  document.getElementById('btn-draw').classList.add('active');
  document.getElementById('btn-draw').textContent = '⊹ Click on map to start';
  showToast('Click to set first corner, drag to define area');
  map.dragging.disable();
  map.getContainer().style.cursor = 'crosshair';

  function onDown(e) {
    drawStart = e.latlng;
    if (bboxRect) { map.removeLayer(bboxRect); bboxRect = null; }
    function onMove(ev) {
      if (bboxRect) map.removeLayer(bboxRect);
      bboxRect = L.rectangle([drawStart, ev.latlng], { color:'#bf3b1e', weight:1.5, fillColor:'#bf3b1e', fillOpacity:0.07, dashArray:'5 3' }).addTo(map);
    }
    function onUp(ev) {
      map.off('mousemove', onMove); map.off('mouseup', onUp); map.off('mousedown', onDown);
      map.dragging.enable(); map.getContainer().style.cursor = '';
      isDrawing = false;
      document.getElementById('btn-draw').classList.remove('active');
      document.getElementById('btn-draw').textContent = '⊹ Redraw rectangle';
      hideToast();
      const s=Math.min(drawStart.lat,ev.latlng.lat), n=Math.max(drawStart.lat,ev.latlng.lat);
      const w=Math.min(drawStart.lng,ev.latlng.lng), ea=Math.max(drawStart.lng,ev.latlng.lng);
      if (Math.abs(n-s)<0.001||Math.abs(ea-w)<0.001) { setStatus('Selection too small — try a larger area','error'); return; }
      bbox = {south:s, north:n, west:w, east:ea};
      updateBboxDisplay();
      document.getElementById('btn-export').disabled = false;
      setStatus('Area set — choose style and export','');
      setAreaName('');
      reverseGeocodeAreaName(bbox);
    }
    map.on('mousemove', onMove); map.on('mouseup', onUp);
  }
  map.on('mousedown', onDown);
}

function updateBboxDisplay() {
  const d = document.getElementById('bbox-display');
  const warn = document.getElementById('size-warning');
  if (!bbox) { d.innerHTML='<div>No area selected yet</div>'; warn.classList.remove('show'); return; }
  const {south,west,north,east} = bbox;
  const latSpan=north-south, lngSpan=east-west;
  const kmNS=(latSpan*111).toFixed(1), kmEW=(lngSpan*111*Math.cos((north+south)/2*Math.PI/180)).toFixed(1);
  const {mmW,mmH}=getPhysicalSizeMm(bbox);
  d.innerHTML=`<div style="color:var(--green);font-size:10px;margin-bottom:4px">✓ Area selected</div><div class="val">N ${north.toFixed(5)}</div><div class="val">S ${south.toFixed(5)}</div><div class="val">W ${west.toFixed(5)}</div><div class="val">E ${east.toFixed(5)}</div><div style="margin-top:4px;color:var(--muted);font-size:9.5px">≈ ${kmNS} × ${kmEW} km</div><div style="color:var(--muted);font-size:9.5px">Prints at ${(mmW/10).toFixed(1)} × ${(mmH/10).toFixed(1)}cm @ ${PRINT_DPI}dpi</div>`;

  // Size estimation
  const areaDeg = latSpan * lngSpan;
  const estElements = Math.round(areaDeg * 180000); // rough heuristic
  const estMB = (estElements * 0.0003).toFixed(1);
  if (areaDeg > 0.015) {
    document.getElementById('size-warning-text').textContent = `~${estElements.toLocaleString()} elements estimated, ~${estMB} MB. Consider a smaller area or higher simplification.`;
    warn.classList.add('show');
  } else {
    warn.classList.remove('show');
  }
}

// ════════════════════════════════════════════════════════════════
//  ADMIN BOUNDARY SEARCH
// ════════════════════════════════════════════════════════════════
async function fetchBoundaries(placeName) {
  const res = document.getElementById('boundary-results');
  res.innerHTML = '<div style="padding:6px 10px;font-size:9.5px;color:var(--muted)">Searching boundaries…</div>';
  res.classList.add('show');
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(placeName)}&format=json&limit=5&polygon_geojson=0&addressdetails=1&featuretype=city,town,village,suburb,neighbourhood,municipality`;
    const data = await (await fetch(url, {headers:{'Accept-Language':'en'}})).json();
    res.innerHTML = '';
    if (!data.length) { res.innerHTML='<div style="padding:6px 10px;font-size:9.5px;color:var(--muted)">No boundaries found</div>'; return; }
    data.filter(p => p.boundingbox).slice(0,5).forEach(place => {
      const item = document.createElement('div');
      item.className = 'boundary-item';
      const name = place.display_name.split(',').slice(0,3).join(',');
      const type = place.type || place.class;
      item.innerHTML = `<div style="font-size:10px;color:var(--ink)">${escXml(name)}</div><div style="font-size:9px;color:var(--muted)">${type} — click to use as export area</div>`;
      item.addEventListener('mousedown', () => {
        const [s,n,w,e] = place.boundingbox.map(parseFloat);
        bbox = {south:s, north:n, west:w, east:e};
        map.fitBounds([[s,w],[n,e]], {padding:[20,20]});
        if (bboxRect) map.removeLayer(bboxRect);
        bboxRect = L.rectangle([[s,w],[n,e]], {color:'#bf3b1e',weight:1.5,fillColor:'#bf3b1e',fillOpacity:0.07,dashArray:'5 3'}).addTo(map);
        updateBboxDisplay();
        document.getElementById('btn-export').disabled = false;
        setStatus('Boundary loaded — choose style and export','');
        setAreaName(pickAreaName(place.address, place.display_name));
        res.classList.remove('show');
      });
      res.appendChild(item);
    });
  } catch(e) {
    res.innerHTML = '<div style="padding:6px 10px;font-size:9.5px;color:var(--accent)">Failed to fetch boundaries</div>';
  }
}

// ════════════════════════════════════════════════════════════════
//  TILE CACHE  (server-side via cache.php, 7-day TTL)
// ════════════════════════════════════════════════════════════════
const TILE_SIZE = 0.1; // degrees per tile (~8×11 km at mid-latitudes)
const CACHE_PREFIX = 'mapexport_v3_';

// §3.1: short stable hash of a layer's overpassQuery source. Any tweak to
// the query template (added highway type, tightened regex, etc.) changes
// the hash, which changes the cache key, which retires stale cache entries
// silently. FNV-1a 32-bit → base36 (~6 chars). Not cryptographic — just
// cache-busting.
function fnv1a36(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
function layerQHash(layer) {
  if (layer._qHash) return layer._qHash;
  // overpassOut is part of the hash: the same query at a different output
  // verbosity (e.g. block_buildings' bounds-only 'tags bb') returns
  // differently-shaped elements, so it must not share a cache entry.
  return (layer._qHash = fnv1a36(layer.overpassQuery.toString() + (layer.overpassOut || '')));
}

function bboxToTiles(bbox) {
  // Adaptive path: if the export bbox is smaller than one grid cell on
  // BOTH axes, bypass the grid and issue one Overpass query bounded by
  // the real selection. A town-sized bbox that straddles grid lines
  // otherwise balloons to 2–4 tiles, all mostly empty. The cache key
  // encodes the exact bbox so repeat exports of the same selection still
  // hit the cache; grid-aligned entries stay disjoint.
  const latSpan = bbox.north - bbox.south, lonSpan = bbox.east - bbox.west;
  if (latSpan < TILE_SIZE * 0.95 && lonSpan < TILE_SIZE * 0.95) {
    return [{
      s: +bbox.south.toFixed(5), w: +bbox.west.toFixed(5),
      n: +bbox.north.toFixed(5), e: +bbox.east.toFixed(5),
      adaptive: true,
    }];
  }
  // Grid path for multi-cell exports. Epsilon nudge because 0.1 isn't
  // IEEE-representable: Math.floor(52.3/0.1) evaluates to 522 rather than
  // 523, which otherwise emits a bogus tile one row south of the selection.
  const tiles = [];
  const EPS = 1e-9;
  const s0 = Math.floor(bbox.south / TILE_SIZE + EPS) * TILE_SIZE;
  const w0 = Math.floor(bbox.west  / TILE_SIZE + EPS) * TILE_SIZE;
  for (let s = s0; s < bbox.north - EPS; s = +(s + TILE_SIZE).toFixed(10)) {
    for (let w = w0; w < bbox.east - EPS; w = +(w + TILE_SIZE).toFixed(10)) {
      tiles.push({ s: +s.toFixed(1), w: +w.toFixed(1),
                   n: +(s + TILE_SIZE).toFixed(1), e: +(w + TILE_SIZE).toFixed(1) });
    }
  }
  return tiles;
}

function tileCacheKey(layer, tile) {
  if (tile.adaptive) {
    return `${CACHE_PREFIX}${layer.id}_${layerQHash(layer)}_a_${tile.s}_${tile.w}_${tile.n}_${tile.e}`;
  }
  return `${CACHE_PREFIX}${layer.id}_${layerQHash(layer)}_${tile.s}_${tile.w}`;
}

async function cacheGet(key) {
  try {
    const res = await fetch(`cache.php?key=${encodeURIComponent(key)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data || null; // cache.php returns null JSON for misses
  } catch { return null; }
}

// §2.2: batch existence probe. Replaces N per-key GETs during the
// pre-fetch cache check with one round-trip. Returns a Set of keys that
// are known to be present on the server. On failure, returns an empty
// set — callers fall back to per-key cacheGet, same as before.
async function cacheExistsBatch(keys) {
  if (!keys.length) return new Set();
  try {
    // cache.php caps at 64 keys per call; chunk if necessary.
    const chunks = [];
    for (let i = 0; i < keys.length; i += 64) chunks.push(keys.slice(i, i + 64));
    const hits = new Set();
    await Promise.all(chunks.map(async ch => {
      const res = await fetch(`cache.php?exists=${ch.map(encodeURIComponent).join(',')}`);
      if (!res.ok) return;
      const data = await res.json();
      for (const [k, v] of Object.entries(data)) if (v) hits.add(k);
    }));
    return hits;
  } catch { return new Set(); }
}

async function cacheSet(key, data) {
  try {
    const json = JSON.stringify(data);
    // Gzip-compress to avoid hitting PHP post_max_size (8M) for large layers
    if (typeof CompressionStream !== 'undefined') {
      const blob = new Blob([json]);
      const cs = new CompressionStream('gzip');
      const stream = blob.stream().pipeThrough(cs);
      const compressed = await new Response(stream).blob();
      await fetch(`cache.php?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
        body: compressed
      });
    } else {
      // Fallback for browsers without CompressionStream
      await fetch(`cache.php?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: json
      });
    }
  } catch { /* fail silently — cache write failure doesn't block export */ }
}

function mergeElements(arrays) {
  const seen = new Set();
  const out = [];
  for (const arr of arrays) {
    for (const el of arr) {
      const k = el.type + el.id;
      if (!seen.has(k)) { seen.add(k); out.push(el); }
    }
  }
  return out;
}

// ════════════════════════════════════════════════════════════════
//  OVERPASS FETCH
// ════════════════════════════════════════════════════════════════
const OVERPASS_ENDPOINTS=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter'];
const MAX_TILE_RETRIES=3;

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

function getAvailableEndpoint(){
  const now=Date.now();
  return OVERPASS_ENDPOINTS.find(ep=>{ const b=endpointBackoff[ep]; return !b||now>=b.until; })||null;
}

function recordEndpoint429(ep){
  const prev=endpointBackoff[ep];
  const nextDelay=Math.min((prev?prev.delay:500)*2,4000);
  endpointBackoff[ep]={ until:Date.now()+nextDelay, delay:nextDelay };
}

async function fetchLayer(layer, bboxStr, bbox) {
  const tiles = bboxToTiles(bbox);
  const elementArrays = [];
  const failedTiles = [];
  let fetchCount = 0;

  for (const tile of tiles) {
    const key = tileCacheKey(layer, tile);
    const cached = await cacheGet(key);
    if (cached) {
      elementArrays.push(cached.elements || []);
      continue;
    }

    const tileBboxStr = `${tile.s},${tile.w},${tile.n},${tile.e}`;
    // §1.3: same bbox hoisting as fetchTileCombined — single-layer path too.
    const stmt = layer.overpassQuery(tileBboxStr).replaceAll(`(${tileBboxStr})`, '');
    const q = `[out:json][bbox:${tileBboxStr}][timeout:60];(${stmt});out ${layer.overpassOut || 'body geom'} qt;`;
    const body = 'data=' + encodeURIComponent(q);
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    let fetched = null;
    let tileRetries = 0;

    while (!fetched && tileRetries < MAX_TILE_RETRIES) {
      const ep = getAvailableEndpoint();

      if (!ep) {
        // All endpoints are rate-limited — wait for the soonest one to free up
        const soonest = Math.min(...OVERPASS_ENDPOINTS.map(e=>endpointBackoff[e]?.until||0));
        const waitMs = Math.max(0, soonest - Date.now()) + 200;
        setStatus(`Rate limited — waiting ${(waitMs/1000).toFixed(1)}s…`, 'loading');
        progress.log(`All endpoints rate-limited — waiting ${(waitMs/1000).toFixed(1)}s`, { warn: true });
        await sleep(waitMs);
        tileRetries++;
        continue;
      }

      try {
        const res = await fetch(ep, { method:'POST', headers, body, mode:'cors',
          signal: AbortSignal.timeout(62000) });
        if (res.status === 429) {
          const retryAfter = res.headers.get('Retry-After');
          const waitMs = retryAfter ? parseInt(retryAfter,10)*1000 : (endpointBackoff[ep]?.delay||500);
          recordEndpoint429(ep);
          adaptiveTileDelay = Math.min(adaptiveTileDelay + 150, 1500);
          setStatus(`Rate limited on ${new URL(ep).hostname} — waiting ${(waitMs/1000).toFixed(1)}s…`, 'loading');
          progress.log(`${new URL(ep).hostname} rate-limited — waiting ${(waitMs/1000).toFixed(1)}s`, { warn: true });
          await sleep(waitMs);
          tileRetries++;
          continue;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        fetched = await res.json();
      } catch(e) {
        console.warn(`Overpass failed (${ep}):`, e.message);
        tileRetries++;
      }
    }

    if (!fetched) {
      console.warn(`Tile ${tileBboxStr} failed after ${MAX_TILE_RETRIES} retries for layer ${layer.id}`);
      failedTiles.push(tile);
      continue;
    }

    cacheSet(key, fetched);
    elementArrays.push(fetched.elements || []);
    fetchCount++;
    if (fetchCount > 0 && tiles.indexOf(tile) < tiles.length - 1) {
      await sleep(adaptiveTileDelay);
    }
  }

  return { elements: mergeElements(elementArrays), failedTiles };
}

// ════════════════════════════════════════════════════════════════
//  COMBINED TILE FETCH — one Overpass call for all uncached layers
// ════════════════════════════════════════════════════════════════
// onProgress (optional) is invoked during the fetch with the payload
//   { phase: 'waiting',     elapsed,  endpoint }   // every ~500ms before first byte
//   { phase: 'downloading', received, total, endpoint }  // per streamed chunk
// Overpass has no mid-query progress, so 'waiting' is just elapsed time on
// the request (server-side compute + network latency). Once bytes arrive we
// stream the body via a ReadableStream reader so we can surface real
// download size — Content-Length is usually absent (chunked), so total=0.
async function fetchTileCombined(layers, tile, preferredEndpoint=null, onProgress=null) {
  const tileBboxStr = `${tile.s},${tile.w},${tile.n},${tile.e}`;
  // §1.1: strip statements superseded by another layer in THIS fetch.
  const inFetchSet = new Set(layers.map(l => l.id));
  // §1.3: hoist bbox to the global header so every statement drops its own
  // (bbox) filter. Keeps layer.overpassQuery(b) API unchanged; we just strip
  // the resulting `(<bbox>)` substring since it's always the same literal here.
  const combinedQueries = layers.map(l => supersededQuery(l, tileBboxStr, inFetchSet)).join('').replaceAll(`(${tileBboxStr})`, '');
  const q = `[out:json][bbox:${tileBboxStr}][timeout:120];(${combinedQueries});out body geom qt;`;
  const body = 'data=' + encodeURIComponent(q);
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  let fetched = null, retries = 0;

  while (!fetched && retries < MAX_TILE_RETRIES) {
    // §2.1: try preferredEndpoint first (if available); otherwise fall back
    // to the normal rotation. Lets two concurrent workers pin to different
    // endpoints so we don't hammer the same host.
    let ep = null;
    if (preferredEndpoint) {
      const b = endpointBackoff[preferredEndpoint];
      if (!b || Date.now() >= b.until) ep = preferredEndpoint;
    }
    if (!ep) ep = getAvailableEndpoint();
    if (!ep) {
      const soonest = Math.min(...OVERPASS_ENDPOINTS.map(e=>endpointBackoff[e]?.until||0));
      const waitMs = Math.max(0, soonest - Date.now()) + 200;
      setStatus(`Rate limited — waiting ${(waitMs/1000).toFixed(1)}s…`, 'loading');
      progress.log(`All endpoints rate-limited — waiting ${(waitMs/1000).toFixed(1)}s`, { warn: true });
      await sleep(waitMs);
      retries++;
      continue;
    }
    // TTFB heartbeat — Overpass can take 5–30s of server-side compute before
    // any bytes arrive. Without this the UI would be frozen on "0 MB" with
    // no evidence anything is happening.
    const reqStart = Date.now();
    let ttfbTimer = null;
    if (onProgress) {
      onProgress({ phase: 'waiting', elapsed: 0, endpoint: ep });
      ttfbTimer = setInterval(() => {
        onProgress({ phase: 'waiting', elapsed: Math.round((Date.now() - reqStart)/1000), endpoint: ep });
      }, 500);
    }
    try {
      const res = await fetch(ep, { method:'POST', headers, body, mode:'cors',
        signal: AbortSignal.timeout(120000) });
      if (ttfbTimer) { clearInterval(ttfbTimer); ttfbTimer = null; }
      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        const waitMs = retryAfter ? parseInt(retryAfter,10)*1000 : (endpointBackoff[ep]?.delay||500);
        recordEndpoint429(ep);
        adaptiveTileDelay = Math.min(adaptiveTileDelay + 150, 1500);
        setStatus(`Rate limited on ${new URL(ep).hostname} — waiting ${(waitMs/1000).toFixed(1)}s…`, 'loading');
        progress.log(`${new URL(ep).hostname} rate-limited — waiting ${(waitMs/1000).toFixed(1)}s`, { warn: true });
        await sleep(waitMs);
        retries++;
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Stream the body so we can surface bytes-received while it downloads.
      // Falls back to res.json() if the environment doesn't give us a
      // readable body stream.
      if (onProgress && res.body?.getReader) {
        const total = +res.headers.get('Content-Length') || 0;
        const reader = res.body.getReader();
        const chunks = [];
        let received = 0;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
          onProgress({ phase: 'downloading', received, total, endpoint: ep });
        }
        const merged = new Uint8Array(received);
        let offset = 0;
        for (const c of chunks) { merged.set(c, offset); offset += c.length; }
        fetched = JSON.parse(new TextDecoder().decode(merged));
      } else {
        fetched = await res.json();
      }
    } catch(e) {
      if (ttfbTimer) { clearInterval(ttfbTimer); ttfbTimer = null; }
      console.warn(`Combined fetch failed (${ep}):`, e.message);
      retries++;
    }
  }
  return fetched;
}

// Race the combined query across ALL currently-available endpoints and return
// the first successful response, aborting the losers. Used for single-tile
// exports (small areas): the old worker-pool handed the one tile to whichever
// endpoint grabbed it first, so a single slow/overloaded server could stall the
// whole export while the others sat idle. Racing makes the fastest server win.
async function fetchTileCombinedRace(layers, tile, onProgress=null) {
  const tileBboxStr = `${tile.s},${tile.w},${tile.n},${tile.e}`;
  const inFetchSet = new Set(layers.map(l => l.id));
  const combinedQueries = layers.map(l => supersededQuery(l, tileBboxStr, inFetchSet)).join('').replaceAll(`(${tileBboxStr})`, '');
  const q = `[out:json][bbox:${tileBboxStr}][timeout:120];(${combinedQueries});out body geom qt;`;
  const body = 'data=' + encodeURIComponent(q);
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };

  for (let attempt = 0; attempt < 2; attempt++) {
    const eps = OVERPASS_ENDPOINTS.filter(ep => { const bk = endpointBackoff[ep]; return !bk || Date.now() >= bk.until; });
    if (!eps.length) {
      const soonest = Math.min(...OVERPASS_ENDPOINTS.map(e=>endpointBackoff[e]?.until||0));
      await sleep(Math.max(0, soonest - Date.now()) + 200);
      continue;
    }
    const reqStart = Date.now();
    let ttfb = null;
    const label = `racing ${eps.length} server${eps.length>1?'s':''}`;
    if (onProgress) {
      onProgress({ phase:'waiting', elapsed:0, endpoint: label });
      ttfb = setInterval(() => onProgress({ phase:'waiting', elapsed: Math.round((Date.now()-reqStart)/1000), endpoint: label }), 500);
    }
    const controllers = eps.map(() => new AbortController());
    const attempts = eps.map((ep, i) => (async () => {
      const res = await fetch(ep, { method:'POST', headers, body, mode:'cors', signal: controllers[i].signal });
      if (res.status === 429) { recordEndpoint429(ep); throw new Error('429 ' + ep); }
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + ep);
      return { json: await res.json(), ep };
    })());
    try {
      const winner = await Promise.any(attempts);
      controllers.forEach((c, i) => { if (eps[i] !== winner.ep) c.abort(); });
      if (ttfb) clearInterval(ttfb);
      if (onProgress) onProgress({ phase:'downloading', received:0, total:0, endpoint: winner.ep });
      return winner.json;
    } catch (e) {
      if (ttfb) clearInterval(ttfb);
      // every endpoint failed this round — one retry, then give up
    }
  }
  return null;
}

// ════════════════════════════════════════════════════════════════
//  PROJECTION — Web Mercator
// ════════════════════════════════════════════════════════════════
function degToMerc(lng, lat) {
  return [lng*Math.PI/180, Math.log(Math.tan(Math.PI/4+(lat*Math.PI/180)/2))];
}
function makeProjector(b, W) {
  const [xMin,yMin]=degToMerc(b.west,b.south), [xMax,yMax]=degToMerc(b.east,b.north);
  const scale = W/(xMax-xMin);
  const H = Math.round((yMax-yMin)*scale);
  function pr(lat,lng) { const [mx,my]=degToMerc(lng,lat); return [(mx-xMin)*scale, H-(my-yMin)*scale]; }
  return {pr, H};
}

// ════════════════════════════════════════════════════════════════
//  DOUGLAS-PEUCKER
// ════════════════════════════════════════════════════════════════
// §4.1: iterative Douglas-Peucker. Previous recursive version did an
// O(n) pts.slice() on each split — heavy allocation on long ways. This
// variant uses an explicit stack + keep-bitset; byte-for-byte equivalent
// output verified against the recursive version over 500 randomized
// trials × 6 epsilons.
function dpSimplify(pts, eps) {
  const n = pts.length;
  if (n <= 2) return pts;
  const keep = new Uint8Array(n);
  keep[0] = keep[n-1] = 1;
  const stack = [[0, n-1]];
  while (stack.length) {
    const [lo, hi] = stack.pop();
    if (hi - lo < 2) continue;
    const [x1,y1] = pts[lo], [x2,y2] = pts[hi];
    const dx = x2-x1, dy = y2-y1, len = Math.hypot(dx,dy);
    let maxD = 0, idx = -1;
    for (let i = lo+1; i < hi; i++) {
      const [px, py] = pts[i];
      const d = len === 0 ? Math.hypot(px-x1, py-y1) : Math.abs(dy*px - dx*py + x2*y1 - y2*x1)/len;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > eps && idx !== -1) {
      keep[idx] = 1;
      stack.push([lo, idx]);
      stack.push([idx, hi]);
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i]);
  return out;
}
function geomToPathD(geom,pr,eps,close) {
  if (!geom?.length) return '';
  const pts=dpSimplify(geom.map(g=>pr(g.lat,g.lon)),eps);
  if (pts.length<2) return '';
  let d=`M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i=1;i<pts.length;i++) d+=`L${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)}`;
  return close?d+'Z':d;
}

// Multipolygon relations (e.g. a river mapped as a long chain of way segments
// under one "outer" role) come back from Overpass as separate open arcs, not
// closed rings — one arc per member way. Treating each member's geometry as
// its own ring (as both the renderer and the block-cutter used to) silently
// force-closes every arc with a straight chord from its last point back to
// its first, which can cut across dry land far from the real bank. Stitch
// same-role arcs end-to-end into the real closed ring(s) before use.
function stitchMultipolygonRings(members) {
  const samePoint = (a, b) => Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lon - b.lon) < 1e-7;
  function stitch(segs) {
    const remaining = segs.filter(s => s && s.length >= 2).map(s => s.slice());
    const rings = [];
    while (remaining.length) {
      let ring = remaining.shift();
      let grew = true;
      while (grew && !(ring.length >= 3 && samePoint(ring[0], ring[ring.length - 1]))) {
        grew = false;
        for (let i = 0; i < remaining.length; i++) {
          const seg = remaining[i];
          if (samePoint(ring[ring.length - 1], seg[0])) {
            ring = ring.concat(seg.slice(1));
          } else if (samePoint(ring[ring.length - 1], seg[seg.length - 1])) {
            ring = ring.concat(seg.slice(0, -1).reverse());
          } else if (samePoint(ring[0], seg[seg.length - 1])) {
            ring = seg.slice(0, -1).concat(ring);
          } else if (samePoint(ring[0], seg[0])) {
            ring = seg.slice(1).reverse().concat(ring);
          } else {
            continue;
          }
          remaining.splice(i, 1);
          grew = true;
          break;
        }
      }
      if (ring.length >= 3) rings.push(ring);
    }
    return rings;
  }
  const outerSegs = members.filter(m => (m.role || 'outer') === 'outer').map(m => m.geometry);
  const innerSegs = members.filter(m => m.role === 'inner').map(m => m.geometry);
  return { outer: stitch(outerSegs), inner: stitch(innerSegs) };
}

// ════════════════════════════════════════════════════════════════
//  BBOX CULLING — skip elements with no geometry inside export area
// ════════════════════════════════════════════════════════════════
function elementInBbox(el, b) {
  // Use Overpass-provided bounds when available (fastest path)
  if (el.bounds) {
    return el.bounds.maxlat >= b.south && el.bounds.minlat <= b.north &&
           el.bounds.maxlon >= b.west  && el.bounds.minlon <= b.east;
  }
  // Node (POI)
  if (el.type === 'node') {
    return el.lat >= b.south && el.lat <= b.north && el.lon >= b.west && el.lon <= b.east;
  }
  // Way — any node inside bbox is enough to include it (cross-boundary geometries are clipped by SVG clipPath)
  if (el.geometry?.length) {
    return el.geometry.some(g => g.lat >= b.south && g.lat <= b.north && g.lon >= b.west && g.lon <= b.east);
  }
  // Relation — check member geometries
  if (el.members?.length) {
    return el.members.some(m => m.geometry?.some(g =>
      g.lat >= b.south && g.lat <= b.north && g.lon >= b.west && g.lon <= b.east));
  }
  return true; // unknown structure — include by default
}

// ════════════════════════════════════════════════════════════════
//  NAME UTILS
// ════════════════════════════════════════════════════════════════
function safeName(s) { return (s||'').replace(/&/g,'and').replace(/[<>"']/g,'').replace(/\s+/g,'_').replace(/[^\w\-]/g,'_').slice(0,80); }
function escXml(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function makeUidGen() { const used=new Set(); return base=>{ if(!used.has(base)){used.add(base);return base;} let n=2; while(used.has(`${base}_${n}`))n++; const id=`${base}_${n}`;used.add(id);return id;}; }

// ════════════════════════════════════════════════════════════════
//  SCALE FACTOR — stroke widths scale with output size
// ════════════════════════════════════════════════════════════════
function getScaleFactor(W) {
  // Widths are tuned for A3@300dpi (4961px). Scale proportionally.
  return W / 4961;
}

// ════════════════════════════════════════════════════════════════
//  ROAD SEGMENT MERGING — stitch adjacent same-name ways into runs
// ════════════════════════════════════════════════════════════════
// OSM splits a street at every intersection and tag change, so one road
// becomes dozens of fragments (Ringbaan-Zuid = 105 ways). This stitches
// ways sharing the SAME name AND highway class into maximal continuous
// polylines ("runs"), matched exactly on shared node IDs (out body geom
// gives each way a `nodes` array index-aligned with `geometry`). Each run
// is shaped like a way ({type,id,tags,geometry}) so the renderer and the
// labeler consume it unchanged. Unnamed ways pass through untouched.
function mergeNamedWays(elements) {
  // Endpoint key: prefer the OSM node id; fall back to a rounded coordinate
  // so the stitcher still works if a data source omits `nodes`.
  const endKey = (el, end) => {
    const nodes = el.nodes;
    if (nodes && nodes.length) return 'n' + (end === 0 ? nodes[0] : nodes[nodes.length - 1]);
    const g = el.geometry, p = end === 0 ? g[0] : g[g.length - 1];
    return p.lat.toFixed(7) + ',' + p.lon.toFixed(7);
  };
  const runs = [];
  // Group by highway THEN name (nested Map) rather than a concatenated
  // string key — no separator character needed, so no risk of it colliding
  // with an OSM tag value.
  const groups = new Map(); // highway -> Map(name -> [ways])
  for (const el of elements) {
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) continue;
    const name = el.tags?.name;
    if (!name) { runs.push(el); continue; } // unnamed: passes through unchanged
    const hw = el.tags?.highway || '_default';
    let byName = groups.get(hw);
    if (!byName) { byName = new Map(); groups.set(hw, byName); }
    const ways = byName.get(name);
    if (ways) ways.push(el); else byName.set(name, [el]);
  }
  for (const byName of groups.values()) for (const ways of byName.values()) {
    if (ways.length === 1) { runs.push(ways[0]); continue; }
    for (const coords of stitchWays(ways, endKey))
      runs.push({ type: 'way', id: ways[0].id, tags: ways[0].tags, geometry: coords });
  }
  return runs;
}

// Decompose one same-name+type group into continuous coordinate runs,
// broken at nodes that aren't a clean degree-2 pass-through (dead ends,
// forks/T-junctions). Leftover pure cycles (ring roads, roundabouts) are
// each emitted as one closed run. Connections are endpoint-to-endpoint.
function stitchWays(ways, endKey) {
  const ends = ways.map(w => [endKey(w, 0), endKey(w, 1)]);
  const at = new Map(); // endpoint key -> [way indices touching it]
  ends.forEach(([a, b], i) => {
    (at.get(a) || at.set(a, []).get(a)).push(i);
    (at.get(b) || at.set(b, []).get(b)).push(i);
  });
  const degree = k => (at.get(k) || []).length;
  const used = new Uint8Array(ways.length);
  // geometry of way i oriented to begin at its endpoint `start` (0|1)
  const oriented = (i, start) => start === 0 ? ways[i].geometry : ways[i].geometry.slice().reverse();
  // Walk from way i, entering at endpoint `enterKey`, consuming clean
  // degree-2 connections until a dead end or fork. Returns joined coords.
  const buildChain = (i, enterKey) => {
    const begin = ends[i][0] === enterKey ? 0 : 1;
    const coords = oriented(i, begin).slice();
    used[i] = 1;
    let cur = i, far = ends[i][begin === 0 ? 1 : 0];
    while (degree(far) === 2) {
      const next = (at.get(far) || []).find(j => j !== cur && !used[j]);
      if (next === undefined) break;
      const ns = ends[next][0] === far ? 0 : 1;
      const seg = oriented(next, ns);
      for (let k = 1; k < seg.length; k++) coords.push(seg[k]); // skip shared node
      used[next] = 1;
      cur = next; far = ends[next][ns === 0 ? 1 : 0];
    }
    return coords;
  };
  const out = [];
  // Pass 1: open chains seeded at every non-degree-2 endpoint.
  for (let i = 0; i < ways.length; i++) {
    for (const e of [0, 1]) {
      if (!used[i] && degree(ends[i][e]) !== 2) out.push(buildChain(i, ends[i][e]));
    }
  }
  // Pass 2: anything left is a pure degree-2 cycle — emit one run each.
  for (let i = 0; i < ways.length; i++) {
    if (!used[i]) out.push(buildChain(i, ends[i][0]));
  }
  return out;
}

// ════════════════════════════════════════════════════════════════
//  ROADS BUILDER
// ════════════════════════════════════════════════════════════════
function buildRoadsLayer(elements, pr, W, ctx) {
  const sf = getScaleFactor(W);
  const eps = getEps();
  const preset = PRESETS[activePreset];
  const byType = new Map();
  mergeNamedWays(elements).forEach(el => {
    if (!el.geometry?.length) return;
    const hw = el.tags?.highway||'_default';
    if (!byType.has(hw)) byType.set(hw,[]);
    byType.get(hw).push(el);
  });
  if (!byType.size) return '';
  const types=[...byType.keys()].sort((a,b)=>(ROAD_DRAW_ORDER.indexOf(a)||50)-(ROAD_DRAW_ORDER.indexOf(b)||50));
  // Two-pass rendering: ALL casings first (wider, darker), then ALL fills
  // (narrower, lighter). SVG paint order = document order, so casings must all
  // precede all fills for road borders to sit under crossing roads at every
  // intersection — this is why casing and fill are NOT paired per street.
  // Within each pass we sub-group by highway= class (kept in ROAD_DRAW_ORDER so
  // minor classes still paint under major ones) and order streets alphabetically
  // inside each class, so a designer can grab a whole class at once or find one
  // named street fast. Casings and fills mirror the same class+alpha order.
  let casingGroups='', fillGroups='', pathGroups='', pathOverGroups='';
  const clipDs = ctx?.areaClipDs || [];
  const uid=makeUidGen();
  types.forEach(hw => {
    const ways=byType.get(hw);
    const w=ROAD_WIDTHS[hw]||ROAD_WIDTHS._default;
    const colors=preset.roads[hw]||{fill:'#ffffff',casing:'#cccccc'};
    const dash=w.dash?` stroke-dasharray="${w.dash}"`:'';
    const casingTotalW=((w.fillW+w.casingW)*sf).toFixed(2);
    const fillW=(w.fillW*sf).toFixed(2);
    const label=TYPE_LABELS[hw]||hw;
    const ps=PATH_STYLES[hw];
    const psW=ps?(ps.w*sf).toFixed(2):0;
    const psDash=ps?` stroke-dasharray="${ps.dash.map(v=>(v*sf).toFixed(1)).join(' ')}"`:'';
    // Alphabetical within the class (case-insensitive); named/ref'd ways sort
    // before unnamed stubs, which fall back to a stable original order.
    const sorted=ways.map((el,i)=>({el,i})).sort((a,b)=>{
      const na=(a.el.tags?.name||a.el.tags?.ref||'').toLowerCase();
      const nb=(b.el.tags?.name||b.el.tags?.ref||'').toLowerCase();
      if(na&&nb) return na.localeCompare(nb)||a.i-b.i;
      if(na) return -1; if(nb) return 1; return a.i-b.i;
    });
    let casings='', fills='', paths='', pathsOver='';
    sorted.forEach(({el,i}) => {
      const pts=el.geometry.map(g=>pr(g.lat,g.lon));
      const s=dpSimplify(pts, eps);
      if (s.length<2) return;
      let d=`M${s[0][0].toFixed(1)},${s[0][1].toFixed(1)}`;
      for(let j=1;j<s.length;j++) d+=`L${s[j][0].toFixed(1)},${s[j][1].toFixed(1)}`;
      const name=el.tags?.name||'', ref=el.tags?.ref||'';
      const pid=uid(name?safeName(name):ref?safeName(ref):`${hw}_${el.id||i}`);
      const lbl=escXml(name||ref||`${label} (${el.id||i})`);
      if (ps) {
        // Single dashed stroke; butt caps keep the dash rhythm crisp. Paint
        // attributes live on the class group below — every path in a class
        // shares them, and SVG 1.1 inheritance is safe in every consumer
        // (Illustrator included), so the per-path markup is just geometry.
        paths+=`\n        <path id="${pid}" inkscape:label="${lbl}" d="${d}"/>`;
        // White twin, clipped to parks/water — identical d and dash phase, so
        // the colour flips exactly at the green/blue edge.
        if (clipDs.length) pathsOver+=`\n          <path id="${pid}_green" inkscape:label="${lbl}" d="${d}"/>`;
        return;
      }
      casings+=`\n        <path id="${pid}_casing" inkscape:label="${lbl}" d="${d}"/>`;
      fills+=`\n        <path id="${pid}" inkscape:label="${lbl}" d="${d}"/>`;
    });
    const pathPaint=`fill="none" stroke-width="${psW}" stroke-linecap="butt" stroke-linejoin="round"${psDash}`;
    if (paths) pathGroups+=`\n      <g id="roads_paths_${hw}" inkscape:label="${escXml(label)}" ${pathPaint} stroke="${colors.casing}">${paths}\n      </g>`;
    if (pathsOver) pathOverGroups+=`\n        <g id="roads_paths_${hw}_on_green" inkscape:label="${escXml(label)} (over parks/water)" ${pathPaint} stroke="#ffffff">${pathsOver}\n        </g>`;
    if (casings) casingGroups+=`\n      <g id="roads_casings_${hw}" inkscape:label="${escXml(label)}" fill="none" stroke="${colors.casing}" stroke-width="${casingTotalW}" stroke-linecap="round" stroke-linejoin="round"${dash}>${casings}\n      </g>`;
    if (fills) fillGroups+=`\n      <g id="roads_fills_${hw}" inkscape:label="${escXml(label)}" fill="none" stroke="${colors.fill}" stroke-width="${fillW}" stroke-linecap="round" stroke-linejoin="round"${dash}>${fills}\n      </g>`;
  });
  if (!casingGroups&&!fillGroups&&!pathGroups) return '';
  // Paths & trails paint first (under street casings/fills), then the white
  // clipped twins, then the two street passes.
  let pathsBlock='';
  if (pathGroups) {
    let clipDef='', overlay='';
    if (pathOverGroups) {
      const clipPathMarkup=`<clipPath id="greenblue_clip" clipPathUnits="userSpaceOnUse">${clipDs.map(d=>`<path d="${d}" clip-rule="evenodd"/>`).join('')}</clipPath>`;
      // Illustrator only handles clipPaths reliably when they live in the
      // document-root <defs>; declaring one inline inside a <g> is legal
      // SVG (and fine in browsers/Inkscape) but risky there. The Illustrator
      // wrapper collects these and emits them at the root.
      if (ctx?.illustratorCompatible && ctx.illustratorDefs) ctx.illustratorDefs.push(clipPathMarkup);
      else clipDef=`\n    ${clipPathMarkup}`;
      overlay=`\n    <g id="roads_paths_green" inkscape:label="Paths over parks/water" clip-path="url(#greenblue_clip)">${pathOverGroups}\n    </g>`;
    }
    pathsBlock=`\n  <g id="roads_paths" inkscape:label="Paths &amp; trails">${clipDef}${pathGroups}\n  </g>${overlay}`;
  }
  return `  <g id="roads" inkscape:label="Roads &amp; streets" inkscape:groupmode="layer">${pathsBlock}\n  <g id="roads_casings" inkscape:label="Road casings">${casingGroups}\n  </g>\n  <g id="roads_fills" inkscape:label="Road fills">${fillGroups}\n  </g>\n  </g>\n`;
}

// ════════════════════════════════════════════════════════════════
//  RAIL BUILDER
// ════════════════════════════════════════════════════════════════
function buildRailLayer(elements, pr, W) {
  const sf=getScaleFactor(W), eps=getEps(), uid=makeUidGen();
  let casings='',sleepers='',rails='';
  elements.forEach((el,i) => {
    if (el.type!=='way'||!el.geometry?.length) return;
    const s=dpSimplify(el.geometry.map(g=>pr(g.lat,g.lon)),eps);
    if (s.length<2) return;
    let d=`M${s[0][0].toFixed(1)},${s[0][1].toFixed(1)}`;
    for(let j=1;j<s.length;j++) d+=`L${s[j][0].toFixed(1)},${s[j][1].toFixed(1)}`;
    const name=el.tags?.name||el.tags?.ref||'';
    const pid=uid(name?safeName(name):`rail_${el.id||i}`);
    const lbl=escXml(name||`Railway (${el.id||i})`);
    // Paint attributes are hoisted onto the sub-groups below (plain SVG 1.1
    // inheritance, safe everywhere incl. Illustrator). `opacity` stays on
    // each path: it is NOT an inherited property — on a group it flattens
    // the group before blending, which would stop crossing tracks from
    // darkening each other.
    casings+=`\n      <path id="${pid}_casing" inkscape:label="${lbl}" d="${d}"/>`;
    sleepers+=`\n      <path id="${pid}_sleepers" inkscape:label="${lbl}" d="${d}"/>`;
    rails+=`\n      <path id="${pid}" inkscape:label="${lbl}" d="${d}" opacity="0.5"/>`;
  });
  if (!casings) return '';
  return `  <g id="rail" inkscape:label="Railways" inkscape:groupmode="layer">\n    <g id="rail_casing" fill="none" stroke="#555555" stroke-width="${(12*sf).toFixed(2)}" stroke-linecap="butt" stroke-linejoin="round">${casings}\n    </g>\n    <g id="rail_sleepers" fill="none" stroke="#eeeeee" stroke-width="${(6*sf).toFixed(2)}" stroke-linecap="butt" stroke-dasharray="${(30*sf).toFixed(1)} ${(24*sf).toFixed(1)}">${sleepers}\n    </g>\n    <g id="rail_tracks" fill="none" stroke="#333333" stroke-width="${(1.8*sf).toFixed(2)}" stroke-linecap="butt">${rails}\n    </g>\n  </g>\n`;
}

// ════════════════════════════════════════════════════════════════
//  METRO BUILDER
// ════════════════════════════════════════════════════════════════
function buildMetroLayer(elements, pr, W) {
  const sf=getScaleFactor(W), eps=getEps();
  const lineMap=new Map();
  elements.forEach(el => {
    if (el.type!=='way'||!el.geometry?.length) return;
    const key=el.tags?.ref||el.tags?.name||el.tags?.colour||el.tags?.color||'_default';
    if (!lineMap.has(key)) lineMap.set(key,{color:null,ways:[]});
    lineMap.get(key).ways.push(el);
    if (el.tags?.colour&&!lineMap.get(key).color) lineMap.get(key).color=el.tags.colour;
    if (el.tags?.color&&!lineMap.get(key).color)  lineMap.get(key).color=el.tags.color;
  });
  if (!lineMap.size) return '';
  let pi=0;
  lineMap.forEach(line=>{ if(!line.color) line.color=METRO_PALETTE[pi++%METRO_PALETTE.length]; });
  let lineGroups='';
  lineMap.forEach((line,key)=>{
    const uid=makeUidGen();
    let casings='',fills='';
    line.ways.forEach((el,i)=>{
      const s=dpSimplify(el.geometry.map(g=>pr(g.lat,g.lon)),eps);
      if (s.length<2) return;
      let d=`M${s[0][0].toFixed(1)},${s[0][1].toFixed(1)}`;
      for(let j=1;j<s.length;j++) d+=`L${s[j][0].toFixed(1)},${s[j][1].toFixed(1)}`;
      const name=el.tags?.name||el.tags?.ref||key;
      const pid=uid(safeName(name!=='_default'?name:`metro_${el.id||i}`));
      const lbl=escXml(name!=='_default'?name:`Metro (${el.id||i})`);
      // Shared paint attributes live on the casing/fill groups below;
      // per-path opacity stays put (not inherited — see rail builder).
      casings+=`\n      <path id="${pid}_casing" inkscape:label="${lbl}" d="${d}" opacity="0.85"/>`;
      fills+=`\n      <path id="${pid}" inkscape:label="${lbl}" d="${d}" opacity="0.82"/>`;
    });
    if (!fills) return;
    const lid=safeName(key!=='_default'?key:'metro_default');
    const llbl=escXml(key!=='_default'?key:'Metro line');
    lineGroups+=`\n  <g id="metro_${lid}" inkscape:label="Metro — ${llbl}" inkscape:groupmode="layer">\n    <g id="metro_${lid}_casing" fill="none" stroke="white" stroke-width="${(24*sf).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round">${casings}\n    </g>\n    <g id="metro_${lid}_fill" fill="none" stroke="${line.color}" stroke-width="${(16.5*sf).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round">${fills}\n    </g>\n  </g>`;
  });
  return lineGroups?`  <g id="metro" inkscape:label="Metro / subway" inkscape:groupmode="layer">${lineGroups}\n  </g>\n`:'';
}

// ════════════════════════════════════════════════════════════════
//  TRAM BUILDER
// ════════════════════════════════════════════════════════════════
function buildTramLayer(elements, pr, W) {
  const sf=getScaleFactor(W), eps=getEps(), uid=makeUidGen();
  let casings='',fills='';
  elements.forEach((el,i)=>{
    if (el.type!=='way'||!el.geometry?.length) return;
    const s=dpSimplify(el.geometry.map(g=>pr(g.lat,g.lon)),eps);
    if (s.length<2) return;
    let d=`M${s[0][0].toFixed(1)},${s[0][1].toFixed(1)}`;
    for(let j=1;j<s.length;j++) d+=`L${s[j][0].toFixed(1)},${s[j][1].toFixed(1)}`;
    const name=el.tags?.name||el.tags?.ref||'';
    const pid=uid(name?safeName(name):`tram_${el.id||i}`);
    const lbl=escXml(name||`Tram (${el.id||i})`);
    // Shared paint attributes live on the casing/fill groups below;
    // per-path opacity stays put (not inherited — see rail builder).
    casings+=`\n      <path id="${pid}_casing" inkscape:label="${lbl}" d="${d}" opacity="0.6"/>`;
    fills+=`\n      <path id="${pid}" inkscape:label="${lbl}" d="${d}" opacity="0.9"/>`;
  });
  if (!casings) return '';
  return `  <g id="tram" inkscape:label="Tram &amp; light rail" inkscape:groupmode="layer">\n    <g id="tram_casing" fill="none" stroke="#555555" stroke-width="${(10.5*sf).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round">${casings}\n    </g>\n    <g id="tram_fill" fill="none" stroke="#aaee44" stroke-width="${(6*sf).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round">${fills}\n    </g>\n  </g>\n`;
}

// ════════════════════════════════════════════════════════════════
//  LABELS — street labels with textPath + halo
// ════════════════════════════════════════════════════════════════
const LABEL_STYLES={
  motorway:     {size:40,weight:700,minLen:100,spacing:900},
  trunk:        {size:40,weight:700,minLen:100,spacing:900},
  primary:      {size:36,weight:600,minLen:80, spacing:800},
  secondary:    {size:32,weight:600,minLen:70, spacing:700},
  tertiary:     {size:28,weight:500,minLen:60, spacing:600},
  residential:  {size:22,weight:500,minLen:50, spacing:500},
  unclassified: {size:22,weight:500,minLen:50, spacing:500},
  living_street:{size:18,weight:400,minLen:45, spacing:450},
  cycleway:     {size:18,weight:400,minLen:45, spacing:450},
  footway:      {size:14,weight:400,minLen:40, spacing:400},
  pedestrian:   {size:18,weight:400,minLen:45, spacing:450},
  _default:     {size:22,weight:400,minLen:50, spacing:480},
};
// Uppercase chars are wider than lowercase; include letter-spacing in estimate
function approxTextWidth(t,fs,ls=0){return t.length*(fs*0.65+ls);}

// ── Illustrator-compatible typography helpers ─────────────────────
// Arial advance widths in em fractions (from the Arial AFM metrics, 1000
// units/em). Used ONLY by the Illustrator pipeline, which lays curved street
// labels out one glyph at a time and therefore needs real per-character
// advances — the flat approxTextWidth estimate above is fine for fitting
// decisions but would render "ILL" as wide as "WWW".
const ARIAL_ADVANCE_WIDTHS = {
  ' ': 0.278, '!': 0.278, '"': 0.355, "'": 0.191, '’': 0.222, '(': 0.333,
  ')': 0.333, ',': 0.278, '-': 0.333, '.': 0.278, '/': 0.278, ':': 0.278,
  ';': 0.278, '&': 0.667, '?': 0.556,
  '0': 0.556, '1': 0.556, '2': 0.556, '3': 0.556, '4': 0.556, '5': 0.556,
  '6': 0.556, '7': 0.556, '8': 0.556, '9': 0.556,
  'A': 0.667, 'B': 0.667, 'C': 0.722, 'D': 0.722, 'E': 0.667, 'F': 0.611,
  'G': 0.778, 'H': 0.722, 'I': 0.278, 'J': 0.500, 'K': 0.667, 'L': 0.556,
  'M': 0.833, 'N': 0.722, 'O': 0.778, 'P': 0.667, 'Q': 0.778, 'R': 0.722,
  'S': 0.667, 'T': 0.611, 'U': 0.722, 'V': 0.667, 'W': 0.944, 'X': 0.667,
  'Y': 0.667, 'Z': 0.611,
  'a': 0.556, 'b': 0.556, 'c': 0.500, 'd': 0.556, 'e': 0.556, 'f': 0.278,
  'g': 0.556, 'h': 0.556, 'i': 0.222, 'j': 0.222, 'k': 0.500, 'l': 0.222,
  'm': 0.833, 'n': 0.556, 'o': 0.556, 'p': 0.556, 'q': 0.556, 'r': 0.333,
  's': 0.500, 't': 0.278, 'u': 0.556, 'v': 0.500, 'w': 0.722, 'x': 0.500,
  'y': 0.500, 'z': 0.500,
};
// Advance width of one character in px. Accented characters (É, Ü, ĳ…)
// fall back to their base letter via Unicode decomposition; anything still
// unknown uses the same 0.65em average as approxTextWidth.
function glyphAdvanceWidth(character, fontSize) {
  let emFraction = ARIAL_ADVANCE_WIDTHS[character];
  if (emFraction === undefined) {
    const baseCharacter = character.normalize('NFD')[0];
    emFraction = ARIAL_ADVANCE_WIDTHS[baseCharacter];
  }
  return (emFraction === undefined ? 0.65 : emFraction) * fontSize;
}
// Illustrator has no Arial Medium/Semibold: importing font-weight 500/600
// triggers a missing-style substitution dialog. Browsers already resolve
// those weights to Arial Regular/Bold, so snapping to 400/700 changes
// nothing visually — it just names the style Illustrator actually has.
// (CSS font matching rounds 500 down and 600 up for a 400/700 family.)
function illustratorFontWeight(fontWeight) {
  return fontWeight >= 550 ? 700 : 400;
}
// Older Illustrator versions read a CSS font-family LIST as one literal
// font name ("Arial,Helvetica,sans-serif" — not installed), so the
// Illustrator pipeline names exactly one font.
const STANDARD_FONT_FAMILY = 'Arial,Helvetica,sans-serif';
const ILLUSTRATOR_FONT_FAMILY = 'Arial';
function pathLength(pts){let l=0;for(let i=1;i<pts.length;i++)l+=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]);return l;}
// Real-world length of a lat/lon polyline in metres (zoom-independent), used
// to decide whether a street is large enough to deserve a label.
function geoLength(geom){let m=0;for(let i=1;i<geom.length;i++){const a=geom[i-1],b=geom[i];const dx=(b.lon-a.lon)*Math.cos((a.lat+b.lat)/2*Math.PI/180),dy=b.lat-a.lat;m+=Math.hypot(dx,dy);}return m*111320;}
function angleAtMid(pts){
  const total=pathLength(pts); let acc=0,mid=total*0.5;
  for(let i=1;i<pts.length;i++){
    const seg=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]);
    if(acc+seg>=mid){let a=Math.atan2(pts[i][1]-pts[i-1][1],pts[i][0]-pts[i-1][0])*180/Math.PI;if(a>90)a-=180;if(a<-90)a+=180;return a;}
    acc+=seg;
  } return 0;
}
// Point + reading angle at a given arc-length along a polyline. Used to
// place repeated street labels at fixed intervals along a merged run.
function pointAngleAtLength(pts,target){
  let acc=0;
  for(let i=1;i<pts.length;i++){
    const dx=pts[i][0]-pts[i-1][0],dy=pts[i][1]-pts[i-1][1],seg=Math.hypot(dx,dy);
    if(acc+seg>=target){
      const t=seg===0?0:(target-acc)/seg;
      let a=Math.atan2(dy,dx)*180/Math.PI;if(a>90)a-=180;if(a<-90)a+=180;
      return {x:pts[i-1][0]+dx*t,y:pts[i-1][1]+dy*t,angle:a};
    }
    acc+=seg;
  }
  const last=pts[pts.length-1];
  return {x:last[0],y:last[1],angle:0};
}
// Interpolated point at arc-length s along a polyline, given precomputed
// cumulative lengths (arcLens[i] = arc-length up to pts[i]).
function pointAtArcLen(pp,arcLens,s){for(let i=1;i<pp.length;i++)if(arcLens[i]>=s){const t=(s-arcLens[i-1])/((arcLens[i]-arcLens[i-1])||1);return [pp[i-1][0]+(pp[i][0]-pp[i-1][0])*t,pp[i-1][1]+(pp[i][1]-pp[i-1][1])*t];}return pp[pp.length-1];}
// Best straight baseline for a label span [s0,s1]: least-squares line through
// evenly resampled points of the arc. Returns the sample centroid (where a
// straight label should be anchored), the reading angle of the fitted line,
// and the worst perpendicular deviation of the road from it. The local
// tangent at the span's midpoint is NOT a substitute: on an asymmetric bend
// it tilts the label by up to the whole bend and anchors it off the chord,
// which is exactly what makes straight labels veer off slightly bendy roads.
function fitStraightBaseline(pp,arcLens,s0,s1){
  const len=Math.max(1,s1-s0), n=Math.max(8,Math.min(64,Math.ceil(len/8)));
  const smp=[]; let sx=0,sy=0;
  for(let k=0;k<=n;k++){const p=pointAtArcLen(pp,arcLens,s0+len*k/n);smp.push(p);sx+=p[0];sy+=p[1];}
  const cx=sx/(n+1), cy=sy/(n+1);
  let sxx=0,sxy=0,syy=0;
  for(const p of smp){const dx=p[0]-cx,dy=p[1]-cy;sxx+=dx*dx;sxy+=dx*dy;syy+=dy*dy;}
  const th=0.5*Math.atan2(2*sxy,sxx-syy);
  const ux=Math.cos(th),uy=Math.sin(th);
  let maxDev=0;
  for(const p of smp){const d=Math.abs((p[1]-cy)*ux-(p[0]-cx)*uy);if(d>maxDev)maxDev=d;}
  let a=th*180/Math.PI; if(a>90)a-=180; if(a<-90)a+=180;
  return {cx,cy,angle:a,maxDev};
}
// Footprint collision for street labels. A label is modelled as a ribbon of
// overlapping circles along its actual baseline (straight, diagonal OR curved),
// so a vertical / bent / textPath label collides correctly — the old single
// horizontal box mismodelled everything that wasn't roughly horizontal. Backed
// by a spatial hash so stamping many circles stays cheap.
function makeFootprintGrid(cell=80){
  const map=new Map();
  const cellsOf=(x,y,r)=>{const o=[];for(let gx=Math.floor((x-r)/cell);gx<=Math.floor((x+r)/cell);gx++)for(let gy=Math.floor((y-r)/cell);gy<=Math.floor((y+r)/cell);gy++)o.push(gx+'/'+gy);return o;};
  return {
    hits(x,y,r){for(const k of cellsOf(x,y,r)){const a=map.get(k);if(a)for(const b of a)if((x-b[0])**2+(y-b[1])**2<(r+b[2])**2)return true;}return false;},
    put(x,y,r){const box=[x,y,r];for(const k of cellsOf(x,y,r)){const a=map.get(k);if(a)a.push(box);else map.set(k,[box]);}}
  };
}
// Ribbon radius for a label of font-size fs (half the text height plus a
// small gap) and a straight ribbon of circle centres between two points —
// shared by street labels, feature labels and the rail-corridor stamps so
// every label family collides through one mechanism.
const fpR=fs=>fs*0.62+Math.max(3,fs*0.22);
const fpLine=(x0,y0,x1,y1,r)=>{const n=Math.max(1,Math.ceil(Math.hypot(x1-x0,y1-y0)/r)),o=[];for(let k=0;k<=n;k++){const t=k/n;o.push([x0+(x1-x0)*t,y0+(y1-y0)*t]);}return o;};
// Stamp a whole polyline into the grid as a corridor of radius r — used to
// claim the rail bed so no street/feature name prints across the tracks.
const stampPolyline=(grid,pts,r)=>{for(let i=1;i<pts.length;i++)for(const p of fpLine(pts[i-1][0],pts[i-1][1],pts[i][0],pts[i][1],r))grid.put(p[0],p[1],r);};

// Compact, multilingual street-name abbreviations, applied ONLY when the full
// name will not fit (so a tight street can still carry a path-following label).
// Suffix rules match the glued compound endings used by Germanic/Scandinavian
// languages; the rest match standalone type-words and honorifics. The tokens
// are distinct enough across languages that the whole set can be applied
// without knowing the country, and anything unmatched is left as-is. This is a
// bounded table, not an exhaustive per-country database.
// Curated from the OSM Name finder/Abbreviations list, European languages only.
// Suffix rules (anchored with $) match the glued compound endings of Germanic /
// Scandinavian languages; the rest match standalone type-words and honorifics
// with word boundaries. Distinct enough across languages that the whole set can
// be applied safely; anything unmatched is left as-is.
const ABBREV=[
  // ── compound suffixes (Dutch / German / Scandinavian, glued to the name) ──
  [/straat$/i,'str.'],[/stra(ß|ss)e$/i,'str.'],[/stræde$/i,'str.'],
  [/gracht$/i,'gr.'],[/singel$/i,'sngl.'],[/steenweg$/i,'stwg.'],
  [/plein$/i,'pl.'],[/platz$/i,'pl.'],[/plass(en)?$/i,'pl.'],
  [/laan$/i,'ln.'],[/gasse$/i,'g.'],[/katu$/i,'k.'],
  [/gatan$/i,'g.'],[/gata$/i,'g.'],[/gade$/i,'g.'],
  [/vägen$/i,'v.'],[/veien$/i,'v.'],[/vegen$/i,'v.'],[/allee$/i,'al.'],
  // ── standalone type-words (Romance / Slavic / Turkic / Finno-Ugric) ──
  [/\bavenida\b/i,'Av.'],[/\bavinguda\b/i,'Av.'],[/\bavenue\b/i,'Av.'],
  [/\bboulevard\b/i,'Bd'],[/\bbulevar\b/i,'Bd'],[/\bbulevardul\b/i,'Bd'],
  [/\bpla(ç|c)a\b/i,'Pl.'],[/\bplace\b/i,'Pl.'],[/\bplaza\b/i,'Pl.'],
  [/\brue\b/i,'R.'],[/\brua\b/i,'R.'],[/\bcalle\b/i,'C/'],[/\bcarrer\b/i,'C/'],
  [/\bpasseig\b/i,'Pg.'],[/\bpassatge\b/i,'Ptge.'],[/\bpassage\b/i,'Pass.'],[/\bpaseo\b/i,'Po.'],
  [/\brambla\b/i,'Rbla.'],[/\bcarretera\b/i,'Ctra.'],[/\bcamino\b/i,'Cno.'],[/\bchemin\b/i,'Ch.'],[/\bestrada\b/i,'Estr.'],
  [/\bviale\b/i,'V.le'],[/\bvicolo\b/i,'V.lo'],[/\bcorso\b/i,'C.so'],[/\bpiazza\b/i,'P.za'],[/\blargo\b/i,'L.go'],[/\bvia\b/i,'V.'],
  [/\bpraça\b/i,'Pç.'],[/\btravessa\b/i,'Tv.'],[/\balameda\b/i,'Al.'],
  [/\bulica\b/i,'ul.'],[/\bulice\b/i,'ul.'],[/\baleja\b/i,'al.'],[/\baleea\b/i,'Al.'],[/\bplac\b/i,'pl.'],
  [/\bstrada\b/i,'Str.'],[/\bnám(ě|e)stí\b/i,'nám.'],[/\btřída\b/i,'tř.'],
  [/\bcaddesi\b/i,'Cad.'],[/\bsoka(k|ğı)\b/i,'Sk.'],[/\bbulvarı\b/i,'Bul.'],[/\bmeydanı\b/i,'Mey.'],
  [/\butca\b/i,'u.'],
  // ── honorifics / titles ──
  [/\bprofessor\b/i,'Prof.'],[/\bprofesora\b/i,'prof.'],[/\bdo[ck]tora?\b/i,'Dr.'],[/\bingenieur\b/i,'Ir.'],[/\bmeester\b/i,'Mr.'],
  [/\b(generaal|general|général|generała)\b/i,'Gen.'],[/\bkolonel\b/i,'Kol.'],
  [/\bburgemeester\b/i,'Burg.'],[/\bminister\b/i,'Min.'],[/\bpresident\b/i,'Pres.'],
  [/\bkoningin\b/i,'Kon.'],[/\bkoning\b/i,'Kon.'],[/\bprins(es)?\b/i,'Pr.'],
  [/\bpastoor\b/i,'Past.'],[/\bmonseigneur\b/i,'Mgr.'],[/\bkardina[ae]l\b/i,'Kard.'],[/\bbroeder\b/i,'Br.'],[/\bzuster\b/i,'Zr.'],
  [/\b(sint|saint|sankt)\b/i,'St.'],[/\bsanta\b/i,'Sta.'],[/\bsanto\b/i,'Sto.'],[/\bsan\b/i,'S.'],[/\bsão\b/i,'S.'],
  [/\bświętego\b/i,'św.'],[/\bświętej\b/i,'św.'],[/\bksiędza\b/i,'ks.'],[/\bmarszałka\b/i,'marsz.'],
  [/\bsvatého\b/i,'sv.'],
  // ── Cyrillic prefixes (whole word, surrounded by space/edges) ──
  [/(^|\s)улица(\s|$)/i,'$1ул.$2'],[/(^|\s)вулиця(\s|$)/i,'$1вул.$2'],
  [/(^|\s)площад[ьья]?(\s|$)/i,'$1пл.$2'],[/(^|\s)проспект(\s|$)/i,'$1просп.$2'],
  [/(^|\s)(бул[еь]вар|булевард)(\s|$)/i,'$1бул.$3'],[/(^|\s)набережная(\s|$)/i,'$1наб.$2'],
];
function abbreviateName(name){
  let s=name;
  for(const [re,rep] of ABBREV) if(re.test(s)) s=s.replace(re,rep);
  return s;
}

function buildLabelsLayer(elements, pr, W, H, sharedGrid, options = {}) {
  // Illustrator pipeline: identical label PLACEMENT, different EMISSION
  // (per-glyph point text instead of <textPath>, single font name, snapped
  // weights). Everything Illustrator-specific below checks this one flag.
  const illustratorCompatible = !!options.illustratorCompatible;
  const labelFontFamily = illustratorCompatible ? ILLUSTRATOR_FONT_FAMILY : STANDARD_FONT_FAMILY;
  const labelFontWeight = weight => illustratorCompatible ? illustratorFontWeight(weight) : weight;
  const sf=getScaleFactor(W);
  const preset=PRESETS[activePreset];
  // The export passes one grid shared with feature labels (and pre-stamped
  // rail corridors) via ctx.labelGrid; a fresh grid is only a fallback for
  // direct unit-test calls.
  const grid=sharedGrid||makeFootprintGrid();
  const defs=[],texts=[];
  let pid=0;
  // Suppress same-name labels that land close together (e.g. the two
  // carriageways of a divided road) while still allowing a long street to
  // repeat its name far apart. Keyed by name → already-placed [x,y] centres.
  const placedByName=new Map();
  const nearName=(name,x,y,gap)=>{const a=placedByName.get(name);if(!a)return false;for(const p of a)if(Math.hypot(x-p[0],y-p[1])<gap)return true;return false;};
  const recordName=(name,x,y)=>{const a=placedByName.get(name);if(a)a.push([x,y]);else placedByName.set(name,[[x,y]]);};
  // Footprint helpers: a label occupies a ribbon of circles (fpR/fpLine at
  // module scope) along its baseline. fits() rejects if any circle hits an
  // already-placed one; stamp() registers them.
  const fpPath=(pp,s0,s1,r)=>{const len=Math.max(1,s1-s0),n=Math.max(1,Math.ceil(len/r)),o=[];for(let k=0;k<=n;k++){const p=pointAngleAtLength(pp,s0+len*k/n);o.push([p.x,p.y]);}return o;};
  const fpFits=(fp,r)=>{for(const p of fp)if(grid.hits(p[0],p[1],r))return false;return true;};
  const fpStamp=(fp,r)=>{for(const p of fp)grid.put(p[0],p[1],r);};
  // Canvas gates. A label may only exist where it can be read: entirely-inside
  // placements are always OK; a partially clipped one is allowed ONLY as a
  // bonus repeat once the same street already has a fully visible label
  // (policy 2026-07-03). Entirely-outside placements used to burn the street's
  // same-name budget while being invisible — never place those.
  const fpInside =(fp,r)=>fp.every(p=>p[0]>=r&&p[0]<=W-r&&p[1]>=r&&p[1]<=H-r);
  const fpVisible=(fp,r)=>fp.some (p=>p[0]>=-r&&p[0]<=W+r&&p[1]>=-r&&p[1]<=H+r);
  // Street names that already own at least one fully visible label (across
  // all of the street's runs) — the precondition for clipped bonus repeats.
  const fullyVisibleNames=new Set();
  // Curvature over an arc: total heading change (degrees) — how much a label
  // placed there would wrap — plus the sharpest turn concentrated inside any
  // window of `win` px of arc. Sums the turn at every actual path vertex in
  // range (so a kink/hairpin is caught, not stepped over). The distinction
  // matters typographically: 60° spread over a gentle arc reads fine, but the
  // same 60° inside a couple of glyph widths jams the letters on the bend's
  // inside and tears a gap on its outside ("DOC TOR") — and that holds
  // whether the turn sits at one vertex or is spread over a tight elbow of
  // several vertices, which is why a per-vertex max is not enough.
  const bendOver=(pp,arcLens,s0,s1,win)=>{
    let bend=0; const vs=[];
    for(let i=1;i<pp.length-1;i++){
      if(arcLens[i]<=s0||arcLens[i]>=s1)continue;
      const a1=Math.atan2(pp[i][1]-pp[i-1][1],pp[i][0]-pp[i-1][0]),a2=Math.atan2(pp[i+1][1]-pp[i][1],pp[i+1][0]-pp[i][0]);
      let d=Math.abs(a2-a1)*180/Math.PI;if(d>180)d=360-d;
      bend+=d; vs.push([arcLens[i],d]);
    }
    let maxTurn=0;
    for(let a=0;a<vs.length;a++){
      let acc=0;
      for(let b=a;b<vs.length&&vs[b][0]-vs[a][0]<=win;b++)acc+=vs[b][1];
      if(acc>maxTurn)maxTurn=acc;
    }
    return {bend,maxTurn};
  };
  // Each label gets its OWN baseline sub-path covering just its extent, oriented
  // to read left-to-right (or bottom-to-top when vertical). This is what stops
  // labels rendering mirrored/upside-down when they land on a stretch of road
  // that runs right-to-left — a whole-path reverse can't fix that per-label.
  // Reading-orientation rule: reverse unless the chord reads left-to-right,
  // or bottom-to-top when near-vertical. "Near-vertical" uses a deadband
  // RELATIVE to the height (10%) — a fixed ±0.5px band is razor thin on tall
  // chords, where a tiny end-hook in the road flips the classification back
  // and forth (a ~1.5°-off-vertical label is vertical for reading purposes).
  const misoriented=(dx,dy)=>{const t=Math.max(0.5,Math.abs(dy)*0.1);return dx<-t||(dx<=t&&dy>0);};
  const subPath=(pp,arcLens,s0,s1)=>{const out=[pointAtArcLen(pp,arcLens,s0)];for(let i=0;i<pp.length;i++)if(arcLens[i]>s0&&arcLens[i]<s1)out.push(pp[i]);out.push(pointAtArcLen(pp,arcLens,s1));const a=out[0],b=out[out.length-1];if(misoriented(b[0]-a[0],b[1]-a[1]))out.reverse();return out;};
  const subD=(sub)=>{let s=`M${sub[0][0].toFixed(1)},${sub[0][1].toFixed(1)}`;for(let i=1;i<sub.length;i++)s+=`L${sub[i][0].toFixed(1)},${sub[i][1].toFixed(1)}`;return s;};
  // Offset a reading-oriented polyline perpendicular ("down" in glyph terms)
  // by o px — used to shift textPath baselines so the ALPHABETIC baseline
  // sits at road-centre + capHeight/2. That bakes vertical centring into
  // plain geometry: no dominant-baseline, which QuickLook and Illustrator
  // ignore (labels rendered sitting ON the road axis instead of across it).
  const offsetPolyline=(pts,o)=>{
    const n=pts.length,out=[];
    for(let i=0;i<n;i++){
      const p0=pts[Math.max(0,i-1)],p1=pts[Math.min(n-1,i+1)];
      const dx=p1[0]-p0[0],dy=p1[1]-p0[1],l=Math.hypot(dx,dy)||1;
      out.push([pts[i][0]-dy/l*o,pts[i][1]+dx/l*o]);
    }
    return out;
  };
  // Round a textPath baseline's corners (Chaikin corner cutting, endpoints
  // pinned) before glyphs are laid along it. textPath places each glyph
  // straddling the local tangent, so a hard vertex jams letters together on
  // the inside of the bend and tears a gap on the outside ("DOC TOR");
  // cutting the corner spreads one sharp turn over several shallow ones.
  const smoothPolyline=(pts,rounds=2)=>{
    let a=pts;
    for(let k=0;k<rounds&&a.length>2;k++){
      const o=[a[0]];
      for(let i=0;i<a.length-1;i++){
        const p=a[i],q=a[i+1];
        o.push([p[0]*0.75+q[0]*0.25,p[1]*0.75+q[1]*0.25],[p[0]*0.25+q[0]*0.75,p[1]*0.25+q[1]*0.75]);
      }
      o.push(a[a.length-1]);
      a=o;
    }
    return a;
  };
  // Vertical centring is BAKED INTO GEOMETRY everywhere: the alphabetic
  // baseline is placed capHeight/2 (≈0.36em for Arial) below the road axis,
  // numerically. No dominant-baseline attribute — browsers honour it but
  // QuickLook and Illustrator don't, which made labels sit on/above their
  // street in exactly the renderers designers use.
  const CAP_HALF=0.36;
  // Low-pass a label baseline for per-glyph layout (Illustrator pipeline).
  // Resamples the polyline at uniform arc-length steps of fontSize/4, then
  // runs a pinned-endpoint [1,2,1]/4 relaxation enough times that the
  // effective Gaussian sigma is ~0.9em — bends narrower than a glyph are
  // typographic noise and get spread across neighbouring letters instead of
  // being swallowed whole by one. (Each relaxation pass adds 1/2 sample² of
  // variance, so rounds = 2·(sigma/step)² with sigma=0.9em, step=0.25em.)
  // The inward pull this causes on a genuine bend is ~sigma²/(2·radius) —
  // sub-pixel on ordinary street curvature, and still well under capHeight
  // on the tightest label-worthy bends.
  const smoothBaselineForGlyphLayout=(points,fontSize)=>{
    const arcLens=[0];
    for(let i=1;i<points.length;i++)
      arcLens.push(arcLens[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
    const totalLength=arcLens[arcLens.length-1];
    const step=fontSize*0.25;
    const sampleCount=Math.max(2,Math.ceil(totalLength/step));
    let samples=[];
    for(let k=0;k<=sampleCount;k++)
      samples.push(pointAtArcLen(points,arcLens,totalLength*k/sampleCount));
    const relaxationRounds=Math.round(2*Math.pow(0.9/0.25,2)); // ≈ 26
    for(let round=0;round<relaxationRounds&&samples.length>2;round++){
      const relaxed=[samples[0]];
      for(let i=1;i<samples.length-1;i++)
        relaxed.push([
          (samples[i-1][0]+2*samples[i][0]+samples[i+1][0])/4,
          (samples[i-1][1]+2*samples[i][1]+samples[i+1][1])/4
        ]);
      relaxed.push(samples[samples.length-1]);
      samples=relaxed;
    }
    return samples;
  };
  // Illustrator emission for curved labels. Illustrator's <textPath> import
  // is the single worst SVG quirk this exporter deals with: versions before
  // 23.0.6 place the glyphs along the path but never rotate them, every
  // version explodes the text into one point-text object per letter anyway,
  // and percentage startOffset handling is unreliable. So the Illustrator
  // pipeline does the glyph layout itself (the same idea as Maperitive's
  // precision-typo mode): one rotated single-character <text> per glyph,
  // centred on the same reading-oriented offset baseline the standard
  // pipeline hands to <textPath>. Illustrator opens the group as plain
  // point-text objects that render identically in every version.
  const emitCurvedLabelAsGlyphs=(hw,name,attrs,label,baseline,fs)=>{
    // The incoming baseline is a polyline: all of its curvature sits at
    // discrete vertices, and Chaikin corner-cutting (2 rounds) still leaves
    // each bend concentrated in a span narrower than one glyph. A browser
    // hides that inside <textPath>, but per-glyph layout samples the tangent
    // locally — so one letter would swallow an entire 8–11° bend while its
    // neighbours stay flat, which reads as letters "dancing" along the
    // street. Low-pass the baseline first: resample at uniform arc-length
    // steps, then relax with a [1,2,1]/4 kernel until no curvature feature
    // is narrower than roughly a glyph width. Endpoints stay pinned, and the
    // smoothed line deviates from the road axis by well under capHeight.
    const smoothedBaseline=smoothBaselineForGlyphLayout(baseline,fs);
    const arcLens=[0];
    for(let i=1;i<smoothedBaseline.length;i++)
      arcLens.push(arcLens[i-1]+Math.hypot(smoothedBaseline[i][0]-smoothedBaseline[i-1][0],smoothedBaseline[i][1]-smoothedBaseline[i-1][1]));
    const baselineLength=arcLens[arcLens.length-1];
    // Tracking matches the letter-spacing every caller bakes into attrs
    // (uniformly fontSize*0.08); per-glyph layout adds it between advances
    // instead, so strip the attribute — on one-character texts it would
    // only trail dead space after each glyph.
    const letterSpacing=fs*0.08;
    const attributesWithoutSpacing=attrs.replace(/ ?letter-spacing="[^"]*"/,'');
    const characters=[...label];
    const advanceWidths=characters.map(character=>glyphAdvanceWidth(character,fs));
    const totalTextWidth=advanceWidths.reduce((sum,width)=>sum+width,0)+letterSpacing*(characters.length-1);
    // Centre the run on the baseline — the equivalent of startOffset="50%".
    // The baseline sub-path carries ~10% slack around the fitted label width
    // (subFor uses ±0.55·width), so clamping at the ends is a sub-pixel
    // safety net, not a layout mechanism.
    let penArcPosition=(baselineLength-totalTextWidth)/2;
    const glyphTexts=[];
    for(let index=0;index<characters.length;index++){
      const character=characters[index];
      const advance=advanceWidths[index];
      const glyphCenterArc=Math.max(0,Math.min(baselineLength,penArcPosition+advance/2));
      penArcPosition+=advance+letterSpacing;
      if(character===' ') continue; // nothing to draw, advance already taken
      const [x,y]=pointAtArcLen(smoothedBaseline,arcLens,glyphCenterArc);
      // Local tangent over the glyph's own extent — with a floor of 0.8em,
      // because narrow glyphs ('I', '.') would otherwise sample a window so
      // short that any residual vertex makes them rotate out of step with
      // their neighbours. Raw atan2 angle, NOT normalised into ±90° like
      // pointAngleAtLength does for whole labels: the baseline is already
      // reading-oriented, so the tangent direction IS the glyph rotation
      // (momentarily past vertical on a wiggle is correct, flipping it
      // there would turn one letter upside down).
      const tangentHalfWindow=Math.max(advance,fs*0.8)/2;
      const behind=pointAtArcLen(smoothedBaseline,arcLens,Math.max(0,glyphCenterArc-tangentHalfWindow));
      const ahead=pointAtArcLen(smoothedBaseline,arcLens,Math.min(baselineLength,glyphCenterArc+tangentHalfWindow));
      const angle=Math.atan2(ahead[1]-behind[1],ahead[0]-behind[0])*180/Math.PI;
      glyphTexts.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" transform="rotate(${angle.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})">${escXml(character)}</text>`);
    }
    // Font attributes, anchor and fill inherit from the group to every glyph.
    texts.push({hw,name,svg:`<g id="lbl_${safeName(name)}_${pid++}" ${attributesWithoutSpacing} text-anchor="middle" fill="${preset.labelColor}">${glyphTexts.join('')}</g>`});
  };
  // Emit one path-following label centred on its own oriented sub-path (the
  // sub-path itself is shifted perpendicular by capHeight/2). Used only for
  // genuinely curved stretches: Illustrator imports <textPath> as one
  // point-text object PER LETTER, so straight labels go through emitStraight.
  const emitPath=(hw,name,attrs,label,sub,fs)=>{
    sub=smoothPolyline(sub);
    let off=offsetPolyline(sub,fs*CAP_HALF);
    // The perpendicular shift can nudge a near-vertical chord across the
    // reading-orientation deadband (subPath decided on the road chord, not
    // the emitted one). Re-check on the geometry actually emitted and flip —
    // reverse + re-offset, so the glyph side flips along with the direction.
    const oa=off[0],ob=off[off.length-1];
    if(misoriented(ob[0]-oa[0],ob[1]-oa[1])) off=offsetPolyline([...sub].reverse(),fs*CAP_HALF);
    if (illustratorCompatible) { emitCurvedLabelAsGlyphs(hw,name,attrs,label,off,fs); return; }
    const id=`lp${pid++}`;defs.push(`<path id="${id}" inkscape:label="${escXml(name)} (path)" d="${subD(off)}"/>`);texts.push({hw,name,svg:`<text id="lbl_${safeName(name)}_${pid++}" inkscape:label="${escXml(name)}" ${attrs} text-anchor="middle" fill="${preset.labelColor}"><textPath href="#${id}" startOffset="50%">${escXml(label)}</textPath></text>`});};
  // Emit one straight label as a single rotated <text> — a real, single
  // editable text object (unlike <textPath>, which Illustrator explodes into
  // one object per letter). (cx,cy) is the centroid of the span's fitted
  // baseline, rotated to the fitted angle (averages a gentle bend instead of
  // inheriting one segment's heading); the baseline offset is baked into y
  // and rotates with the anchor, so it stays perpendicular at any angle.
  const emitStraight=(hw,name,attrs,label,cx,cy,angle,fs)=>{texts.push({hw,name,svg:`<text id="lbl_${safeName(name)}_${pid++}" inkscape:label="${escXml(name)}" ${attrs} text-anchor="middle" transform="rotate(${angle.toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)})" x="${cx.toFixed(1)}" y="${(cy+fs*CAP_HALF).toFixed(1)}" fill="${preset.labelColor}">${escXml(label)}</text>`});};

  const MIN_STREET_M=25;          // streets shorter than this overall get no label
  // A chosen stretch is emitted as a single rotated <text> (one editable
  // object in Illustrator instead of one per letter) when the road never
  // wanders more than this fraction of the font size from the span's fitted
  // baseline. A deviation test, not a degrees test: total heading change is
  // length-blind (a 10° drift across a long label displaces its ends by far
  // more than across a short one), which is what used to let long straight
  // labels veer visibly off gently-bending streets. Spans that deviate more
  // keep <textPath> so they still follow the road.
  const STRAIGHT_MAX_DEV=0.3;
  // Cycle/foot paths are "minor": a street is never labelled on one of these
  // when a real-road run of the same name exists.
  const MINOR=new Set(['cycleway','footway','path','steps']);
  // Importance order for which streets claim label space first.
  const RANK=['motorway','trunk','primary','secondary','tertiary','unclassified','residential','living_street','pedestrian','cycleway','footway','path','steps'];
  const rankOf=hw=>{const i=RANK.indexOf(hw);return i<0?RANK.length:i;};
  // Square test must be language-free and must never mistake a bent/branched
  // street for a square (a false positive writes a street name horizontally,
  // which is exactly what we forbid). Geometry can't do this — bent streets are
  // as "2D" as small plazas — so we trust only OSM's area mapping: an explicit
  // place=square / area=yes, or a closed pedestrian/foot way (how a plaza is
  // drawn). An under-mapped square just gets normal street treatment, which is
  // never "written across".
  const isClosedRun=r=>r.pts.length>=3 && Math.hypot(r.pts[0][0]-r.pts[r.pts.length-1][0],r.pts[0][1]-r.pts[r.pts.length-1][1])<2;
  const looksLikeSquare=rs=>rs.some(r=>
    r.el.tags?.place==='square' || r.el.tags?.area==='yes' ||
    (isClosedRun(r) && (r.hw==='pedestrian'||r.hw==='footway'||r.hw==='living_street')));

  // Merge fragments into continuous runs, project + measure each, drop hidden
  // classes, and group by name so the label can be placed on the street's main
  // (longest real-road) run rather than on whichever fragment sorts first.
  const groups=new Map();
  for (const el of mergeNamedWays(elements)) {
    if (!el.geometry||el.geometry.length<2||!el.tags?.name) continue;
    const hw=el.tags.highway||'_default';
    if (LABEL_VISIBILITY.hasOwnProperty(hw)&&!LABEL_VISIBILITY[hw]) continue;
    const pts=el.geometry.map(g=>pr(g.lat,g.lon));
    const r={el,hw,pts,lenPx:pathLength(pts),lenM:geoLength(el.geometry)};
    const a=groups.get(el.tags.name); if(a)a.push(r); else groups.set(el.tags.name,[r]);
  }
  // Per street: prefer real-road runs over cycle/footpaths, longest first; drop
  // the whole street if even its main run is below the size gate; classify
  // squares from geometry.
  const streets=[];
  for (const [name,rs] of groups) {
    const nonMinor=rs.filter(r=>!MINOR.has(r.hw));
    const pool=(nonMinor.length?nonMinor:rs).sort((a,b)=>b.lenPx-a.lenPx);
    if (pool[0].lenM<MIN_STREET_M) continue;
    // rank by the street's most important class, so a road that is mostly
    // residential but has a tertiary stretch still claims space in the tertiary
    // tier (and its long run wins collisions before the dense grid fills up).
    const bestRank=Math.min(...pool.map(r=>rankOf(r.hw)));
    const hasRoundabout=rs.some(r=>r.el.tags?.junction==='roundabout');
    // Roundabouts follow the ring curve, so they are never "squares".
    const isSquare = !hasRoundabout && looksLikeSquare(rs);
    streets.push({name,pool,rs,bestRank,isSquare});
  }
  // Important/long streets claim label space first.
  streets.sort((a,b)=>a.bestRank-b.bestRank||b.pool[0].lenPx-a.pool[0].lenPx);

  for (const {name,pool,rs,isSquare} of streets) {
    const displayName=name.toUpperCase();

    // ── Square / plaza: one horizontal label at the feature centroid, sized by
    //    the most important class touching it ──
    if (isSquare) {
      const best=pool.reduce((a,b)=>rankOf(a.hw)<=rankOf(b.hw)?a:b);
      const style=LABEL_STYLES[best.hw]||LABEL_STYLES._default;
      const roadW=ROAD_WIDTHS[best.hw]||ROAD_WIDTHS._default;
      const sz=Math.min(style.size*sf, roadW.fillW*sf*0.75); if(sz<3) continue;
      const ls=sz*0.08, textW=approxTextWidth(displayName,sz,ls), nameGap=style.spacing*sf*0.85;
      const all=rs.flatMap(r=>r.pts);
      const cx=all.reduce((s,p)=>s+p[0],0)/all.length, cy=all.reduce((s,p)=>s+p[1],0)/all.length;
      const r=fpR(sz), fp=fpLine(cx-textW/2,cy,cx+textW/2,cy,r);
      // Single-placement site: must be entirely on the canvas or not at all.
      if (!fpInside(fp,r)||nearName(name,cx,cy,nameGap)||!fpFits(fp,r)) continue;
      fpStamp(fp,r); recordName(name,cx,cy); fullyVisibleNames.add(name);
      const attrs=`font-family="${labelFontFamily}" font-size="${sz.toFixed(1)}" font-weight="${labelFontWeight(style.weight)}" letter-spacing="${ls.toFixed(1)}"`;
      texts.push({hw:best.hw,name,svg:`<text id="lbl_${safeName(name)}_${pid++}" inkscape:label="${escXml(name)}" ${attrs} text-anchor="middle" x="${cx.toFixed(1)}" y="${(cy+sz*0.36).toFixed(1)}" fill="${preset.labelColor}">${escXml(displayName)}</text>`});
      continue;
    }

    // ── Linear streets (and roundabouts): label each significant run ──
    // Coverage-first placement: scan many positions along the run, and when
    // every spot collides at full size, progressively shrink the font until a
    // label fits. A street is only skipped when even a tiny label fits nowhere.
    const MIN_FS=5;
    for (const {el,hw,pts,lenPx,lenM} of pool) {
      if (lenM<MIN_STREET_M) continue; // skip this street's tiny secondary stubs
      const style=LABEL_STYLES[hw]||LABEL_STYLES._default;
      const roadW=ROAD_WIDTHS[hw]||ROAD_WIDTHS._default;
      const sz0=Math.min(style.size*sf, roadW.fillW*sf*0.75); if(sz0<3) continue;
      const nameGap=style.spacing*sf*0.85;
      const closed=pts.length>=3 && Math.hypot(pts[0][0]-pts[pts.length-1][0],pts[0][1]-pts[pts.length-1][1])<2;
      const ringLike = closed && el.tags?.junction==='roundabout';
      // Abbreviate once the full name won't fit at the base size.
      let label=displayName;
      if (lenPx<approxTextWidth(label,sz0,sz0*0.08)){ const ab=abbreviateName(name).toUpperCase(); if(ab!==displayName) label=ab; }
      let pathPts=[...pts];
      const arcLens=[0]; for(let i=1;i<pathPts.length;i++) arcLens.push(arcLens[i-1]+Math.hypot(pathPts[i][0]-pathPts[i-1][0],pathPts[i][1]-pathPts[i-1][1]));
      const attrsFor=(fs,ls)=>`font-family="${labelFontFamily}" font-size="${fs.toFixed(1)}" font-weight="${labelFontWeight(style.weight)}" letter-spacing="${ls.toFixed(1)}"`;
      const subFor=(c,lw)=>subPath(pathPts,arcLens,Math.max(0,c-lw*0.55),Math.min(lenPx,c+lw*0.55));

      // Roundabout: name follows the ring curve (centre it if the ring is too small).
      if (ringLike) {
        const ls=sz0*0.08, lw=approxTextWidth(label,sz0,ls), r=fpR(sz0), attrs=attrsFor(sz0,ls);
        if (lenPx>=lw) {
          const fp=fpPath(pathPts,lenPx/2-lw/2,lenPx/2+lw/2,r);
          const mid=pointAngleAtLength(pathPts,lenPx/2);
          // Single-placement site: entirely on the canvas or not at all.
          if (!fpInside(fp,r)||nearName(name,mid.x,mid.y,nameGap)||!fpFits(fp,r)) continue;
          fpStamp(fp,r); recordName(name,mid.x,mid.y); fullyVisibleNames.add(name);
          emitPath(hw,name,attrs,label,subFor(lenPx/2,lw),sz0);
          continue;
        }
        const cx=pts.reduce((s,p)=>s+p[0],0)/pts.length, cy=pts.reduce((s,p)=>s+p[1],0)/pts.length;
        const fp=fpLine(cx-lw/2,cy,cx+lw/2,cy,r);
        if (!fpInside(fp,r)||nearName(name,cx,cy,nameGap)||!fpFits(fp,r)) continue;
        fpStamp(fp,r); recordName(name,cx,cy); fullyVisibleNames.add(name);
        texts.push({hw,name,svg:`<text id="lbl_${safeName(name)}_${pid++}" inkscape:label="${escXml(name)}" ${attrs} text-anchor="middle" x="${cx.toFixed(1)}" y="${(cy+sz0*0.36).toFixed(1)}" fill="${preset.labelColor}">${escXml(label)}</text>`});
        continue;
      }

      // Start at the largest font that fits the run length, then shrink ×0.8 on
      // collision. At each size scan ~24 positions and place up to the ideal
      // repeat count; stop shrinking as soon as ≥1 label lands.
      const baseW=approxTextWidth(label,sz0,sz0*0.08);
      const fitFs=lenPx>=baseW ? sz0 : sz0*lenPx/baseW*0.98;
      const ideal=Math.max(1,Math.round(lenPx/(style.spacing*sf)));
      // Keep the label text clear of the junction mouths at the run's ends —
      // a label reaching s=0 or s=lenPx visually bleeds onto the crossing
      // street (the reported "name pokes into another street"). If the inset
      // range is empty at this size, the shrink loop tries a smaller font.
      const endPad=((roadW.fillW+roadW.casingW)*sf)/2 + 4*sf;
      // Shrink floor: shrinking exists to fit a SHORT RUN, not to squeeze
      // dwarf labels past collisions or same-name suppression. A street with
      // no label yet may drop to half its class size; once the name is placed
      // anywhere, extra runs must stay near full size or go unlabelled — a
      // 9px repeat beside a 22px sibling reads as a rendering bug (the
      // Roggestraat case), and the histogram showed dozens of 5–9px labels.
      const minFs=Math.max(MIN_FS, sz0*(placedByName.has(name)?0.75:0.5));
      // A label draped over a sharp corner/tight elbow is never acceptable:
      // glyphs jam on the inside of the kink and split on the outside
      // regardless of size. 30° per ~2 glyph heights empirically: at 40° a
      // kink under a label still reads as a broken word ("DOC TOR") even
      // after baseline smoothing.
      const MAX_TURN=30;
      for (let fs=fitFs; fs>=minFs; fs*=0.8) {
        const ls=fs*0.08, lw=approxTextWidth(label,fs,ls), r=fpR(fs);
        if (lw>lenPx) continue;
        const attrs=attrsFor(fs,ls);
        const step=Math.max(8, lenPx/30);
        // score every candidate by how much the label would wrap, then place
        // the straightest first — so a label sits on a straight stretch rather
        // than the first (possibly curved) spot that happens to fit.
        const cands=[];
        for (let center=lw/2+endPad; center<=lenPx-lw/2-endPad+0.5; center+=step)
          cands.push({center, ...bendOver(pathPts,arcLens,center-lw/2,center+lw/2,fs*2.2)});
        cands.sort((a,b)=>a.bend-b.bend);
        const cap=80; // total-wrap ceiling; corners are gated by MAX_TURN above
        // A straight label is allowed only while the road stays close to the
        // fitted baseline on BOTH measures: within the room between glyph
        // edge and road-fill edge (so the letters stay inside the street),
        // and within STRAIGHT_MAX_DEV×font (so a wide road can't carry a
        // visibly off-road straight label). Beyond either, textPath.
        const devCap=Math.min(fs*STRAIGHT_MAX_DEV, Math.max(0.5,(roadW.fillW*sf)/2 - fs*0.36 - 1));
        const placedC=[];
        // Two-tier canvas policy: pass 1 places only fully-inside labels;
        // pass 2 adds partially clipped repeats, and runs only when the name
        // already owns a fully visible label somewhere. Entirely-offscreen
        // candidates are never placed by either pass.
        const passPlace=(clippedPass)=>{
          for (const c of cands) {
            if (placedC.length>=ideal || c.bend>cap) break;
            if (c.maxTurn>MAX_TURN) continue;
            if (placedC.some(pc=>Math.abs(pc-c.center)<style.spacing*sf*0.8)) continue;
            const fit=fitStraightBaseline(pathPts,arcLens,c.center-lw/2,c.center+lw/2);
            const straight=fit.maxDev<=devCap;
            const p=straight?{x:fit.cx,y:fit.cy}:pointAngleAtLength(pathPts,c.center);
            if (nearName(name,p.x,p.y,nameGap)) continue;
            // Footprint matches what is actually drawn: a straight ribbon along
            // the fitted baseline, or a ribbon along the road for textPath.
            const rad=fit.angle*Math.PI/180, hx=Math.cos(rad)*lw/2, hy=Math.sin(rad)*lw/2;
            const fp=straight?fpLine(fit.cx-hx,fit.cy-hy,fit.cx+hx,fit.cy+hy,r)
                             :fpPath(pathPts,c.center-lw/2,c.center+lw/2,r);
            const inside=fpInside(fp,r);
            if (clippedPass ? (inside||!fpVisible(fp,r)) : !inside) continue;
            if (!fpFits(fp,r)) continue;
            fpStamp(fp,r); recordName(name,p.x,p.y);
            if (inside) fullyVisibleNames.add(name);
            if (straight) emitStraight(hw,name,attrs,label,fit.cx,fit.cy,fit.angle,fs);
            else emitPath(hw,name,attrs,label,subFor(c.center,lw),fs);
            placedC.push(c.center);
          }
        };
        passPlace(false);
        if (fullyVisibleNames.has(name)) passPlace(true);
        if (placedC.length>0) break; // labelled at this size; no need to shrink further
      }
    }
  }
  if (!texts.length) return '';
  // Split labels into one sub-group per highway= class (ordered by importance,
  // matching the road tiers) and alphabetically within each, so a designer can
  // hide/restyle a whole class at once or find a single name fast. Paint order
  // among labels is irrelevant — the collision engine guarantees they never
  // overlap — so this reordering is purely organisational, with no visual change.
  const byHw=new Map();
  for (const t of texts){ if(!byHw.has(t.hw)) byHw.set(t.hw,[]); byHw.get(t.hw).push(t); }
  const hwOrder=[...byHw.keys()].sort((a,b)=>rankOf(a)-rankOf(b)||a.localeCompare(b));
  let labelGroups='';
  for (const hw of hwOrder){
    const arr=byHw.get(hw).sort((a,b)=>a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    const lbl=TYPE_LABELS[hw]||hw;
    labelGroups+=`\n    <g id="labels_${hw}" inkscape:label="${escXml(lbl)}">${arr.map(t=>t.svg).join('')}</g>`;
  }
  // The <defs> hold the curved labels' baseline paths — only the standard
  // pipeline has any (the Illustrator pipeline bakes glyph positions and
  // needs no baselines; Illustrator also dislikes <defs> nested this deep).
  const defsBlock=defs.length?`<defs>${defs.join('')}</defs>`:'';
  return `  <g id="street_labels" inkscape:label="Street labels" inkscape:groupmode="layer">\n    ${defsBlock}${labelGroups}\n  </g>\n`;
}

// ════════════════════════════════════════════════════════════════
//  FEATURE LABELS — water bodies, parks, neighbourhoods
// ════════════════════════════════════════════════════════════════
function buildFeatureLabelsLayer(elements, pr, W, H, sharedGrid, options = {}) {
  // Same flag as buildLabelsLayer: identical placement, Illustrator-safe
  // emission (two-element halo, single font name, snapped weights).
  const illustratorCompatible = !!options.illustratorCompatible;
  const labelFontFamily = illustratorCompatible ? ILLUSTRATOR_FONT_FAMILY : STANDARD_FONT_FAMILY;
  const sf=getScaleFactor(W);
  const preset=PRESETS[activePreset];
  // Same ribbon-of-circles footprint model and (in a real export) the same
  // grid as street labels, so feature-vs-feature, feature-vs-street and
  // street-vs-street collisions are one mechanism. Feature labels build
  // first (LAYER_ORDER) and claim their single possible anchor; street
  // labels, which have many candidate spots, dodge them.
  const grid=sharedGrid||makeFootprintGrid();
  let labels='';

  elements.forEach(el=>{
    const name=el.tags?.name; if (!name) return;
    let cx,cy,sz,weight,color;
    const place=el.tags?.place, natural=el.tags?.natural, leisure=el.tags?.leisure, waterway=el.tags?.waterway;

    if (place==='suburb'||place==='neighbourhood'||place==='quarter') {
      if (el.type!=='node') return;
      [cx,cy]=pr(el.lat,el.lon); sz=24*sf; weight=500; color='#2a2a20';
    } else if (waterway==='river'||waterway==='canal') {
      if (el.type!=='way'||!el.geometry?.length) return;
      const pts=el.geometry.map(g=>pr(g.lat,g.lon));
      const mid=pts[Math.floor(pts.length/2)]; [cx,cy]=mid;
      sz=26*sf; weight=400; color='#3a6a9a';
    } else if (natural==='water'||leisure==='park'||leisure==='garden') {
      if (el.type==='way'&&el.geometry?.length) {
        const pts=el.geometry.map(g=>pr(g.lat,g.lon));
        cx=pts.reduce((s,p)=>s+p[0],0)/pts.length;
        cy=pts.reduce((s,p)=>s+p[1],0)/pts.length;
      } else if (el.type==='node') { [cx,cy]=pr(el.lat,el.lon); }
      else return;
      sz=natural==='water'?24*sf:22*sf; weight=400;
      color=natural==='water'?'#3a6a9a':'#3a6a3a';
    } else return;

    const tw=approxTextWidth(name,sz), r=fpR(sz);
    const fp=fpLine(cx-tw/2,cy,cx+tw/2,cy,r);
    // Single-placement label: its anchor is fixed, so it is either entirely
    // on the canvas or skipped — a river/park straddling the edge loses its
    // name in this export (nudging the anchor inward looks wrong faster
    // than it helps).
    if (!fp.every(p=>p[0]>=r&&p[0]<=W-r&&p[1]>=r&&p[1]<=H-r)) return;
    for (const p of fp) if (grid.hits(p[0],p[1],r)) return;
    for (const p of fp) grid.put(p[0],p[1],r);

    const haloSz=(sz*0.15+1.5).toFixed(1);
    const italicAttr=waterway?'font-style="italic"':'';
    const fid=`feat_${safeName(name)}`;
    const eName=escXml(name);
    // Vertical centring baked into y (mixed-case optical centre ≈ 0.35em
    // below the middle) instead of dominant-baseline, which QuickLook and
    // Illustrator ignore — same treatment as street labels.
    const by=(cy+sz*0.35).toFixed(1);
    if (illustratorCompatible) {
      // Illustrator doesn't know paint-order (SVG 2), so the halo is its own
      // stroke-only <text> painted under the fill copy — same two-element
      // technique this exporter always used, just without the (ignored
      // there, risky elsewhere) paint-order attribute.
      const illustratorWeight=illustratorFontWeight(weight);
      labels+=`<text id="${fid}_halo" x="${cx.toFixed(1)}" y="${by}" font-family="${labelFontFamily}" font-size="${sz.toFixed(1)}" font-weight="${illustratorWeight}" ${italicAttr} text-anchor="middle" stroke="white" stroke-width="${haloSz}" stroke-linejoin="round" fill="none">${eName}</text>`;
      labels+=`<text id="${fid}" x="${cx.toFixed(1)}" y="${by}" font-family="${labelFontFamily}" font-size="${sz.toFixed(1)}" font-weight="${illustratorWeight}" ${italicAttr} text-anchor="middle" fill="${color}" opacity="0.9">${eName}</text>`;
    } else {
      // Standards pipeline: one element does halo + fill via
      // paint-order="stroke" (stroke first, fill on top). fill-opacity
      // keeps the 0.9 ink transparency of the old fill copy while the halo
      // stroke stays fully opaque — identical compositing to the historical
      // two-element form, at half the element count.
      labels+=`<text id="${fid}" inkscape:label="${eName}" x="${cx.toFixed(1)}" y="${by}" font-family="${labelFontFamily}" font-size="${sz.toFixed(1)}" font-weight="${weight}" ${italicAttr} text-anchor="middle" fill="${color}" fill-opacity="0.9" stroke="white" stroke-width="${haloSz}" stroke-linejoin="round" paint-order="stroke">${eName}</text>`;
    }
  });

  if (!labels) return '';
  return `  <g id="water_labels" inkscape:label="Water &amp; park names" inkscape:groupmode="layer">\n    ${labels}\n  </g>\n`;
}

// ════════════════════════════════════════════════════════════════
//  SIMPLIFICATION EPSILON
//  Douglas-Peucker base tolerance in px. Fixed at what used to be the
//  default position of the removed "Simplify" slider — the other slider
//  values were never a real trade-off worth a UI control.
// ════════════════════════════════════════════════════════════════
const SIMPLIFY_EPSILON = 0.6;
function getEps() {
  return SIMPLIFY_EPSILON;
}
// Per-feature tolerances used by the renderer (renderLayerSVG's EPS object)
// for large area fills and thin line strokes. Block-cutter geometry prep
// (prepareBlockData) must use these same values, not the flat getEps(), or
// the cut void drifts from the painted shape — see the water/park/waterway
// fix below and the analogous road fix (CHANGELOG 2026-07-05).
function getAreaLargeEps() {
  return SIMPLIFY_EPSILON * 1.4;
}
function getLineEps() {
  return SIMPLIFY_EPSILON * 0.6;
}

// ════════════════════════════════════════════════════════════════
//  CITY BLOCKS — Web Worker + ClipperLib
//  Produces individual <path> elements for each block between roads.
//  Runs in a Web Worker so the UI never freezes.
// ════════════════════════════════════════════════════════════════

// Worker source as string — will be turned into a blob URL
const BLOCK_WORKER_SRC = `
importScripts('https://cdn.jsdelivr.net/npm/clipper-lib@6.4.2/clipper.min.js');

// Douglas-Peucker simplification (copied for worker context)
function dpS(pts, eps) {
  if (pts.length <= 2) return pts;
  const [x1,y1] = pts[0], [x2,y2] = pts[pts.length-1];
  const dx = x2-x1, dy = y2-y1, len = Math.hypot(dx,dy);
  let maxD = 0, idx = 0;
  for (let i = 1; i < pts.length-1; i++) {
    const d = len === 0 ? Math.hypot(pts[i][0]-x1,pts[i][1]-y1)
      : Math.abs(dy*pts[i][0]-dx*pts[i][1]+x2*y1-y2*x1)/len;
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD > eps) {
    const l = dpS(pts.slice(0,idx+1),eps), r = dpS(pts.slice(idx),eps);
    return [...l.slice(0,-1), ...r];
  }
  return [pts[0], pts[pts.length-1]];
}

// Point-in-polygon (ray casting)
function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Area-weighted (shoelace) polygon centroid. A vertex average is skewed
// off-center for concave, many-vertex shapes — like a block hugging a
// curvy riverbank — which let submerged blocks slip past the water-overlap
// check below. pts is a Clipper path: [{X,Y}, ...].
function polyCentroid(pts) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].X, yi = pts[i].Y, xj = pts[j].X, yj = pts[j].Y;
    const cross = xj * yi - xi * yj;
    a += cross;
    cx += (xi + xj) * cross;
    cy += (yi + yj) * cross;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-9) {
    let sx = 0, sy = 0;
    for (const p of pts) { sx += p.X; sy += p.Y; }
    return [sx / pts.length, sy / pts.length];
  }
  return [cx / (6 * a), cy / (6 * a)];
}

// Sorted x-crossings of a horizontal line at height y through a ring.
function scanlineCrossings(ring, y) {
  const xs = [];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i].Y, yj = ring[j].Y;
    if ((yi > y) !== (yj > y)) xs.push(ring[i].X + (ring[j].X - ring[i].X) * (y - yi) / (yj - yi));
  }
  return xs.sort((a, b) => a - b);
}
// Interval difference: spans minus every span in subs (both lists of [lo,hi]).
function subtractSpans(spans, subs) {
  let out = spans;
  for (const [sLo, sHi] of subs) {
    const next = [];
    for (const [lo, hi] of out) {
      if (sHi <= lo || sLo >= hi) { next.push([lo, hi]); continue; }
      if (sLo > lo) next.push([lo, sLo]);
      if (sHi < hi) next.push([sHi, hi]);
    }
    out = next;
  }
  return out;
}
// A point GUARANTEED to lie inside the ring and OUTSIDE every hole — the
// midpoint of the widest land span where a horizontal line through the
// ring's vertical middle crosses it, holes subtracted out first. Unlike the
// area centroid, this never lands outside a concave shape (e.g. a banana-
// curved river island), so the water-overlap check below can't wrongly
// discard an island block whose centroid falls out in the channel — and
// unlike a bare outer-ring scanline, it can't land inside a hole either (a
// courtyard pond sitting dead-centre in an otherwise dry block used to pick
// its "interior" point inside the pond and get the whole block discarded
// as water). pts/holes: Clipper paths ([{X,Y}, ...]).
function polyInteriorPoint(pts, holes) {
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) { if (p.Y < minY) minY = p.Y; if (p.Y > maxY) maxY = p.Y; }
  const y = (minY + maxY) / 2;
  const xs = scanlineCrossings(pts, y);
  let spans = [];
  for (let k = 0; k + 1 < xs.length; k += 2) spans.push([xs[k], xs[k + 1]]);
  if (holes) {
    for (const h of holes) {
      const hxs = scanlineCrossings(h, y);
      const hspans = [];
      for (let k = 0; k + 1 < hxs.length; k += 2) hspans.push([hxs[k], hxs[k + 1]]);
      spans = subtractSpans(spans, hspans);
    }
  }
  let bestSpan = null, bestW = -1;
  for (const s of spans) { const w = s[1] - s[0]; if (w > bestW) { bestW = w; bestSpan = s; } }
  return bestSpan ? [(bestSpan[0] + bestSpan[1]) / 2, y] : polyCentroid(pts);
}

self.onmessage = function(e) {
  const { lines, areas, waterPolys, waterHoles, waterwayLines, W, H, bigFacePx2, mPerPx, clusterRings } = e.data;
  const CLP = ClipperLib;
  // Clipper works on integer coordinates; work at SCALE× so the cut keeps
  // sub-pixel fidelity to the rendered strokes, unscale when emitting paths.
  const SCALE = 10;

  self.postMessage({ type:'progress', msg:'Buffering roads…', pct:10 });

  // Buffer lines by width group
  const widthGroups = new Map();
  for (const { pts, halfW } of lines) {
    if (!widthGroups.has(halfW)) widthGroups.set(halfW, []);
    widthGroups.get(halfW).push(pts.map(([x,y]) => ({ X: Math.round(x*SCALE), Y: Math.round(y*SCALE) })));
  }

  const allVoids = [];

  // Offset each width group in batches
  let groupsDone = 0, totalGroups = widthGroups.size;
  for (const [halfW, paths] of widthGroups) {
    const BATCH = 300;
    for (let i = 0; i < paths.length; i += BATCH) {
      const co = new CLP.ClipperOffset();
      // Rendered strokes are linecap/linejoin round — buffer the same way,
      // with arcs tight enough (±0.25px) that the block edge hugs the casing.
      co.ArcTolerance = 0.25 * SCALE;
      co.MiterLimit = 2;
      const batch = paths.slice(i, i + BATCH);
      for (const p of batch) {
        co.AddPath(p, CLP.JoinType.jtRound, CLP.EndType.etOpenRound);
      }
      const buf = new CLP.Paths();
      co.Execute(buf, halfW * SCALE);
      for (const bp of buf) {
        const cl = CLP.Clipper.CleanPolygon(bp, 0.2 * SCALE);
        if (cl && cl.length >= 3) allVoids.push(cl);
      }
    }
    groupsDone++;
    self.postMessage({ type:'progress', msg:'Buffering roads…', pct: 10 + Math.round(30 * groupsDone / totalGroups) });
  }

  // Add area voids (parks, water) — already closed polygons
  for (const { pts } of areas) {
    const path = pts.map(([x,y]) => ({ X: Math.round(x*SCALE), Y: Math.round(y*SCALE) }));
    if (path.length >= 3) allVoids.push(path);
  }

  // Buffer waterway centerlines into standalone polygons too, kept separate
  // from allVoids/voidClean (which also has roads/rail mixed in). Narrower
  // canals often have no natural=water area — only this centerline — so the
  // water-overlap safety check below needs these to catch blocks slipping
  // through over them, not just over closed water_bodies polygons.
  // The offset union isn't only solid rings: where waterways fork and rejoin
  // (a river splitting around an island) the buffers close a loop and the
  // union comes back with a HOLE ring over the enclosed dry land. Each ring
  // therefore carries its orientation sign (+1 solid, -1 hole) so the check
  // below can wind them instead of treating every ring as water.
  const waterwayVoidPolys = []; // { pts: [[x,y],...], sign: +1 | -1 }
  if (waterwayLines && waterwayLines.length) {
    const wwGroups = new Map();
    for (const { pts, halfW } of waterwayLines) {
      if (!wwGroups.has(halfW)) wwGroups.set(halfW, []);
      wwGroups.get(halfW).push(pts.map(([x,y]) => ({ X: Math.round(x*SCALE), Y: Math.round(y*SCALE) })));
    }
    for (const [halfW, paths] of wwGroups) {
      const co = new CLP.ClipperOffset();
      co.ArcTolerance = 0.25 * SCALE;
      co.MiterLimit = 2;
      for (const p of paths) co.AddPath(p, CLP.JoinType.jtRound, CLP.EndType.etOpenRound);
      const buf = new CLP.Paths();
      co.Execute(buf, halfW * SCALE);
      for (const bp of buf) {
        if (bp && bp.length >= 3) {
          waterwayVoidPolys.push({
            pts: bp.map(p => [p.X / SCALE, p.Y / SCALE]),
            sign: CLP.Clipper.Area(bp) >= 0 ? 1 : -1,
          });
        }
      }
    }
  }

  self.postMessage({ type:'progress', msg:'Merging ' + allVoids.length + ' shapes…', pct:45 });

  // Union all voids
  const uc = new CLP.Clipper();
  for (const vp of allVoids) {
    uc.AddPath(vp, CLP.PolyType.ptSubject, true);
  }
  const voidUnion = new CLP.Paths();
  uc.Execute(CLP.ClipType.ctUnion, voidUnion, CLP.PolyFillType.pftNonZero, CLP.PolyFillType.pftNonZero);

  self.postMessage({ type:'progress', msg:'Simplifying…', pct:60 });

  // Clean the union result (sub-pixel only — anything coarser pulls the
  // block edge visibly away from the casing)
  const voidClean = [];
  for (const p of voidUnion) {
    const cl = CLP.Clipper.CleanPolygon(p, 0.2 * SCALE);
    if (cl && cl.length >= 3) voidClean.push(cl);
  }

  const bboxPath = [
    { X:0, Y:0 }, { X: Math.round(W*SCALE), Y:0 },
    { X: Math.round(W*SCALE), Y: Math.round(H*SCALE) }, { X:0, Y: Math.round(H*SCALE) }
  ];

  self.postMessage({ type:'progress', msg:'Cutting blocks…', pct:72 });

  // Stylised USE-IT city blocks: the city block is the negative space BETWEEN
  // the streets — the whole canvas minus the road/rail/water/park network. Each
  // road-bounded face becomes one solid shape, filled curb-to-curb (no building
  // detail, no gaps). Diff: bbox − voids = blocks.
  const dc = new CLP.Clipper();
  dc.AddPath(bboxPath, CLP.PolyType.ptSubject, true);
  for (const vp of voidClean) dc.AddPath(vp, CLP.PolyType.ptClip, true);
  const tree = new CLP.PolyTree();
  dc.Execute(CLP.ClipType.ctDifference, tree, CLP.PolyFillType.pftNonZero, CLP.PolyFillType.pftNonZero);

  self.postMessage({ type:'progress', msg:'Tracing blocks…', pct:86 });

  // Collect raw block contours from PolyTree
  const rawBlocks = []; // { outer: ClipperPath, holes: [ClipperPath] }
  const minArea = 400 * SCALE * SCALE; // 400 px² in scaled units

  function walk(node) {
    if (node.IsHole()) return;
    const c = node.Contour();
    if (!c || c.length < 3) return;
    if (Math.abs(CLP.Clipper.Area(c)) < minArea) return;
    const holes = [];
    for (let i = 0; i < node.ChildCount(); i++) {
      const child = node.Childs()[i];
      const hc = child.Contour();
      if (hc && hc.length >= 3) holes.push(hc);
      for (let j = 0; j < child.ChildCount(); j++) walk(child.Childs()[j]);
    }
    rawBlocks.push({ outer: c, holes });
  }

  for (let i = 0; i < tree.ChildCount(); i++) walk(tree.Childs()[i]);

  const blocks = [];
  let countrysideFaces = 0;

  function toD(path) {
    const pts = path.map(p => [p.X / SCALE, p.Y / SCALE]);
    const s = dpS(pts, 0.4);
    if (s.length < 3) return '';
    let d = 'M' + s[0][0].toFixed(1) + ',' + s[0][1].toFixed(1);
    for (let i = 1; i < s.length; i++) d += 'L' + s[i][0].toFixed(1) + ',' + s[i][1].toFixed(1);
    return d + 'Z';
  }

  // Faces above this net paintable area are countryside, not city blocks
  // (threshold sized in prepareBlockData; Infinity = classify nothing).
  const bigPx2 = (bigFacePx2 || Infinity) * SCALE * SCALE;

  // Hamlet clusters: buffered union of the building/parcel outlines, computed
  // once and intersected with each countryside face below. Morphological
  // closing — dilate wide enough that neighbouring houses fuse into one
  // chunky USE-IT-style block, erode most of it back so an isolated barn
  // doesn't balloon.
  let clusterPolys = null;
  if (clusterRings && clusterRings.length && mPerPx) {
    const DILATE_M = 18, ERODE_M = 10;
    const co = new CLP.ClipperOffset();
    co.ArcTolerance = 0.5 * SCALE;
    co.MiterLimit = 2;
    for (const r of clusterRings) {
      const p = r.map(([x,y]) => ({ X: Math.round(x*SCALE), Y: Math.round(y*SCALE) }));
      if (p.length >= 3) co.AddPath(p, CLP.JoinType.jtRound, CLP.EndType.etClosedPolygon);
    }
    const grown = new CLP.Paths();
    co.Execute(grown, (DILATE_M / mPerPx) * SCALE);
    const co2 = new CLP.ClipperOffset();
    co2.ArcTolerance = 0.5 * SCALE;
    co2.MiterLimit = 2;
    co2.AddPaths(grown, CLP.JoinType.jtRound, CLP.EndType.etClosedPolygon);
    clusterPolys = new CLP.Paths();
    co2.Execute(clusterPolys, -(ERODE_M / mPerPx) * SCALE);
  }

  for (const raw of rawBlocks) {
    // Skip blocks whose interior is inside water (safety check — water is
    // already in voidClean, but partial coverage/epsilon drift can leave
    // slivers). Tested at a guaranteed-interior point, not the centroid, which
    // for a concave island block lands out in the channel.
    const [cx, cy] = polyInteriorPoint(raw.outer, raw.holes);
    const px = cx / SCALE, py = cy / SCALE; // waterPolys/holes are unscaled px
    // A point inside a water island (an inner ring) is dry land — it stays a
    // block even though it also sits inside the water OUTER ring, and even
    // where a waterway centerline runs straight through the island corridor
    // (OSM often maps one centerline through the whole channel, not routed
    // around each islet). So island membership skips BOTH water checks below.
    const onIsland = waterHoles && waterHoles.some(wh => pointInPoly(px, py, wh));
    let inWater = false;
    if (!onIsland) {
      for (const wp of waterPolys) {
        if (pointInPoly(px, py, wp)) { inWater = true; break; }
      }
      if (!inWater) {
        // Wind the buffered waterway rings (+1 solid, -1 hole) instead of
        // treating each as solid: land enclosed by a waterway loop (a river
        // forking around an island) sits inside a hole ring, and a bare
        // point-in-ring test would drown its block.
        let wind = 0;
        for (const wp of waterwayVoidPolys) {
          if (pointInPoly(px, py, wp.pts)) wind += wp.sign;
        }
        if (wind > 0) inWater = true;
      }
    }
    if (inWater) continue;

    // Countryside face: emit the face itself as an UNPAINTED placeholder
    // (kind:'countryside' — the renderer skips it, the coverage lint counts
    // it as deliberately-background land), plus one 'hamlet' block per
    // building cluster inside it.
    const netArea = Math.abs(CLP.Clipper.Area(raw.outer))
      - raw.holes.reduce((s, h) => s + Math.abs(CLP.Clipper.Area(h)), 0);
    if (netArea > bigPx2) {
      countrysideFaces++;
      const faceOuter = toD(raw.outer);
      if (faceOuter) blocks.push({ kind:'countryside', outer: faceOuter, holes: raw.holes.map(h => toD(h)).filter(d => d) });
      if (clusterPolys && clusterPolys.length) {
        const ic = new CLP.Clipper();
        ic.AddPath(raw.outer, CLP.PolyType.ptSubject, true);
        for (const h of raw.holes) ic.AddPath(h, CLP.PolyType.ptSubject, true);
        ic.AddPaths(clusterPolys, CLP.PolyType.ptClip, true);
        const itree = new CLP.PolyTree();
        ic.Execute(CLP.ClipType.ctIntersection, itree, CLP.PolyFillType.pftNonZero, CLP.PolyFillType.pftNonZero);
        (function walkClusters(nodes) {
          for (const node of nodes) {
            if (!node.IsHole()) {
              const c = node.Contour();
              if (c && c.length >= 3 && Math.abs(CLP.Clipper.Area(c)) >= minArea) {
                const hd = toD(c);
                if (hd) {
                  const hh = [];
                  for (let i = 0; i < node.ChildCount(); i++) {
                    const hc = node.Childs()[i].Contour();
                    if (hc && hc.length >= 3) { const dd = toD(hc); if (dd) hh.push(dd); }
                  }
                  blocks.push({ kind:'hamlet', outer: hd, holes: hh });
                }
              }
            }
            walkClusters(node.Childs());
          }
        })(itree.Childs());
      }
      continue;
    }

    const outer = toD(raw.outer);
    if (!outer) continue;
    const holes = raw.holes.map(h => toD(h)).filter(d => d);
    blocks.push({ kind:'urban', outer, holes });
  }

  // needsBuildings: countryside faces exist but no cluster input was given —
  // the caller should fetch buildings and run again. An empty clusterRings
  // array means "already fetched, nothing there" and does NOT re-trigger.
  self.postMessage({ type:'done', blocks, needsBuildings: countrysideFaces > 0 && !clusterRings });
};
`;

let blockWorkerUrl = null;
function getBlockWorkerUrl() {
  if (!blockWorkerUrl) {
    blockWorkerUrl = URL.createObjectURL(new Blob([BLOCK_WORKER_SRC], { type: 'application/javascript' }));
  }
  return blockWorkerUrl;
}

// Sign of a projected ring's signed area (winding direction only). Used to
// orient outer vs. inner rings so the nonZero void union carves island/
// courtyard holes deterministically instead of depending on OSM ring winding.
function ringIsPositive(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return a > 0;
}

// A face whose net paintable area exceeds this is COUNTRYSIDE, not a city
// block: it isn't filled curb-to-curb, only its building clusters are (see
// BLOCK_WORKER_SRC). Calibrated against the committed trail exports: the
// largest face in dense-city Ghent is 0.084 km², genuine rural faces run
// kilometres² — 0.35 km² sits 4× above the one and far below the other.
const COUNTRYSIDE_MIN_KM2 = 0.35;

// Prepare geometry data for the worker (project + simplify on main thread).
// Collects the street/rail/water/park network whose negative space forms the
// city blocks. `b` (the export bbox) sizes the countryside-face threshold in
// px²; without it every face is treated as a city block (legacy behaviour).
function prepareBlockData(allResults, pr, W, H, b) {
  // Nameless island-green candidates must be resolved to real islands before
  // they can void a block (off-island ones would punch spurious holes); this
  // is idempotent and also runs in buildSVG, whichever executes first.
  pruneIslandGreens(allResults);
  const sf = getScaleFactor(W);
  // The cutters must trace the SAME polylines the renderer strokes, or the
  // block edge drifts away from the road casing — so roads go through
  // mergeNamedWays + the render epsilon, exactly like buildRoadsLayer.
  const eps = getEps();
  // Water/park areas and waterway lines render at their own tolerances
  // (renderLayerSVG's EPS.area_large / EPS.line) — not the flat road eps —
  // so the cutter must simplify them the same way or its void drifts from
  // the painted shape (this is what let cream block slivers show over
  // rivers/canals; see CHANGELOG).
  const areaLargeEps = getAreaLargeEps();
  const lineEps = getLineEps();
  // Roads paint OVER blocks, so pull the block edge this far under the
  // casing: absorbs the remaining sub-pixel offset error without visibly
  // changing the contour. Water paints UNDER blocks — no tuck there.
  const ROAD_TUCK = 0.5;

  // Confirmed design rule (2026-07-06): the smallest block-bounding class is a
  // residential/unclassified street; footway/cycleway/path/steps NEVER cut
  // blocks, so one block face may legitimately span several visually separate
  // areas (reference case: the Tilburg station strip along Burg. Brokxlaan,
  // crossed only by Locomotiefboulevard (footway) and Willem II-passage
  // (cycleway)). Those classes render as unlabelled dashes — see PATH_STYLES.
  const BLOCK_ROADS = new Set(['motorway','trunk','primary','secondary','tertiary',
    'residential','unclassified','living_street','pedestrian',
    'motorway_link','trunk_link','primary_link','secondary_link','tertiary_link']);

  const lines = []; // { pts: [[x,y],...], halfW }
  const areas = []; // { pts: [[x,y],...] }
  const waterPolys = []; // OUTER water rings — a block centroid inside one is "in water"…
  const waterHoles = []; // …unless it's also inside one of these INNER rings (an island)
  const waterwayLines = []; // waterway centerlines (with halfW) for the same filter

  for (const { layer, data } of allResults) {
    if (!data?.elements?.length) continue;

    // Roads → lines with half-width (merged first: simplifying a stitched
    // run gives different points than simplifying its pieces, and the
    // renderer strokes the stitched run)
    if (layer.type === 'roads') {
      for (const el of mergeNamedWays(data.elements)) {
        const hw = el.tags?.highway || '_default';
        if (!BLOCK_ROADS.has(hw)) continue;
        const w = ROAD_WIDTHS[hw] || ROAD_WIDTHS._default;
        const halfW = (w.fillW + w.casingW) * sf / 2 - ROAD_TUCK;
        const pts = dpSimplify(el.geometry.map(g => pr(g.lat, g.lon)), eps);
        if (pts.length >= 2) lines.push({ pts, halfW });
      }
    }

    // Parks & water bodies → closed areas. Simplified at the renderer's
    // area_large tolerance (not the flat road eps) — these are large,
    // many-vertex rings (riverbanks, park boundaries) where a coarser
    // tolerance produces a visibly different polygon than the one painted,
    // leaving cream block slivers over the water/park it should have voided.
    if (layer.id === 'parks' || layer.id === 'water_bodies') {
      const isWater = layer.id === 'water_bodies';
      for (const el of data.elements) {
        // A relation's members are open arcs, not rings — stitch them into real
        // closed rings first (see stitchMultipolygonRings), or a multi-way
        // river/park boundary force-closes into chord-shaped fake polygons that
        // cut across dry land. Keep the outer/inner roles: the nonZero void
        // union only carves an island (or a park courtyard) as a hole when its
        // inner ring is wound OPPOSITE its outer, and OSM ring winding is
        // arbitrary — so orient outers positive and inners negative explicitly.
        let outerRings, innerRings;
        if (el.type === 'way') { outerRings = [el.geometry]; innerRings = []; }
        else if (el.type === 'relation' && el.members) {
          const r = stitchMultipolygonRings(el.members); outerRings = r.outer; innerRings = r.inner;
        } else { outerRings = []; innerRings = []; }
        for (const [rings, isOuter] of [[outerRings, true], [innerRings, false]]) {
          for (const geom of rings) {
            if (!geom || geom.length < 3) continue;
            const pts = dpSimplify(geom.map(g => pr(g.lat, g.lon)), areaLargeEps);
            if (pts.length < 3) continue;
            if (ringIsPositive(pts) !== isOuter) pts.reverse();
            areas.push({ pts });
            if (isWater) (isOuter ? waterPolys : waterHoles).push(pts);
          }
        }
      }
    }

    // Waterways → lines, simplified at the renderer's line tolerance (same
    // reasoning as above — a canal centerline is a long winding polyline).
    if (layer.id === 'waterways') {
      for (const el of data.elements) {
        if (el.type !== 'way' || !el.geometry?.length || el.geometry.length < 2) continue;
        const halfW = 12 * sf / 2;
        const pts = dpSimplify(el.geometry.map(g => pr(g.lat, g.lon)), lineEps);
        if (pts.length >= 2) { lines.push({ pts, halfW }); waterwayLines.push({ pts, halfW }); }
      }
    }

    // Rail/tram/metro → lines
    if (layer.type === 'rail' || layer.type === 'tram' || layer.type === 'metro') {
      for (const el of data.elements) {
        if (el.type !== 'way' || !el.geometry?.length || el.geometry.length < 2) continue;
        const halfW = 20 * sf / 2;
        const pts = dpSimplify(el.geometry.map(g => pr(g.lat, g.lon)), eps);
        if (pts.length >= 2) lines.push({ pts, halfW });
      }
    }
  }

  // Ground scale, for the countryside threshold and the hamlet-cluster
  // buffers (metres → px). Mercator stretch across a city-scale bbox is
  // far below what would matter for either.
  let bigFacePx2, mPerPx;
  if (b) {
    const midLat = (b.north + b.south) / 2;
    mPerPx = ((b.east - b.west) * 111320 * Math.cos(midLat * Math.PI / 180)) / W;
    bigFacePx2 = COUNTRYSIDE_MIN_KM2 * 1e6 / (mPerPx * mPerPx);
  }

  return { lines, areas, waterPolys, waterHoles, waterwayLines, W, H, bigFacePx2, mPerPx };
}

// Buildings (+ residential/farmyard parcels) that trace hamlet blocks inside
// countryside faces. Not a LAYER_REGISTRY entry — no checkbox, never rendered
// as its own layer — but shaped like one so tileCacheKey/fetchLayer treat it
// identically to visible layers. Fetched ON DEMAND, only after the block
// worker reports countryside faces, so a pure-city export never pays for a
// bbox-wide building download.
const BLOCK_BUILDINGS_LAYER = {
  id:'block_buildings', label:'Buildings (hamlet blocks)',
  // Buildings ONLY — deliberately no landuse=residential/farmyard zoning:
  // it's unreliably mapped, and as a bounds rectangle (see overpassOut) a
  // diagonal village polygon swallows land across several road faces.
  overpassQuery:(b)=>`wr["building"](${b});`,
  // Bounds only ('tags bb'), not full outlines: a building's bounding box is
  // 2 coordinate pairs instead of every wall vertex — a fraction of the
  // payload on building-heavy tiles — and after the dilate/erode merge in the
  // worker the resulting hamlet blocks are visually identical. Fine for
  // building-sized shapes; do not add large-area queries to this layer
  // without switching them back to real geometry.
  overpassOut:'tags bb',
  tagFilter:el=>el.type!=='node'&&!!el.tags?.building,
};

// Project the fetched building/parcel outlines to px rings for the worker.
// Bounds-only elements (the normal case, see overpassOut above) become their
// bounding rectangle; full geometry — e.g. an older cache entry — uses its
// outer ring(s). Courtyards are noise at hamlet-block stylisation either way.
function prepareClusterData(elements, pr) {
  const rings = [];
  for (const el of elements) {
    let outers = [];
    if (el.type === 'way' && el.geometry?.length >= 3) outers = [el.geometry];
    else if (el.type === 'relation' && el.members) outers = stitchMultipolygonRings(el.members).outer;
    else if (el.bounds) {
      const { minlat, minlon, maxlat, maxlon } = el.bounds;
      outers = [[{ lat:minlat, lon:minlon }, { lat:minlat, lon:maxlon }, { lat:maxlat, lon:maxlon }, { lat:maxlat, lon:minlon }]];
    }
    for (const g of outers) {
      const pts = g.map(p => pr(p.lat, p.lon));
      if (pts.length >= 3) rings.push(pts);
    }
  }
  return rings;
}

// Run block computation in Web Worker. Resolves { blocks, needsBuildings } —
// needsBuildings means countryside faces were found without cluster input, so
// the caller should fetch BLOCK_BUILDINGS_LAYER and call again with
// opts.clusterRings (see the export driver).
function computeBlocksAsync(allResults, pr, W, H, onProgress, opts = {}) {
  return new Promise((resolve, reject) => {
    const data = prepareBlockData(allResults, pr, W, H, opts.bbox);
    if (opts.clusterRings) data.clusterRings = opts.clusterRings;
    if (!data.lines.length && !data.areas.length) { resolve({ blocks: [], needsBuildings: false }); return; }

    const worker = new Worker(getBlockWorkerUrl());
    worker.onmessage = function(e) {
      if (e.data.type === 'progress' && onProgress) {
        onProgress(e.data.msg, e.data.pct);
      }
      if (e.data.type === 'done') {
        worker.terminate();
        resolve({ blocks: e.data.blocks, needsBuildings: !!e.data.needsBuildings });
      }
    };
    worker.onerror = function(err) {
      worker.terminate();
      console.error('Block worker error:', err);
      resolve({ blocks: [], needsBuildings: false }); // fail gracefully — skip blocks
    };
    worker.postMessage(data);
  });
}

// ════════════════════════════════════════════════════════════════
//  SVG BUILDER
// ════════════════════════════════════════════════════════════════
// Render a single layer to an SVG string fragment. Pure — no DOM, no
// globals beyond PRESETS/activePreset. Split out of buildSVG so the
// export driver can render layers one-by-one and yield to the event loop
// between them (enabling per-layer progress + keeping the UI responsive).
function renderLayerSVG({ layer, data }, ctx) {
  const { b, pr, W, H, preset, EPS } = ctx;
  // City blocks render from precomputed worker geometry, not from fetched
  // elements — check this before the empty-elements guard below.
  if (layer.id==='city_blocks') {
    // Countryside faces (kind:'countryside') are deliberately NOT painted:
    // out there the cream fill would misread scenery as built-up area. The
    // landcover layer and the page background show through instead, and the
    // built spots inside such a face arrive as separate 'hamlet' blocks
    // (buffered building clusters — see BLOCK_WORKER_SRC).
    const blocks = (ctx.precomputedBlocks || []).filter(blk => (blk.kind || 'urban') !== 'countryside');
    if (!blocks.length) return '';
    const fo = layer.fillOpacity ?? 0.8;
    // Hamlet blocks sit in open countryside with no road casing around them,
    // so unlike urban blocks (stroke:none, edges drawn by the casings) they
    // carry the casing-toned outline themselves or the cream fill vanishes
    // against pale land cover.
    const hamletStroke = ` stroke="${preset.buildingStroke}" stroke-width="${(2.5 * getScaleFactor(W)).toFixed(2)}" stroke-linejoin="round"`;
    let nb = 0, nh = 0;
    const paths = blocks.map(blk => {
      const d = blk.outer + (blk.holes.length ? ' ' + blk.holes.join(' ') : '');
      const isHamlet = blk.kind === 'hamlet';
      const [id, label] = isHamlet ? [`hamlet_${++nh}`, `Hamlet ${nh}`] : [`block_${++nb}`, `Block ${nb}`];
      return `<path id="${id}" inkscape:label="${label}" d="${d}" fill="${preset.building}" fill-opacity="${fo}" fill-rule="evenodd"${isHamlet ? hamletStroke : ' stroke="none"'}/>`;
    }).join('\n    ');
    return `  <g id="${layer.id}" inkscape:label="${escXml(layer.label)}" inkscape:groupmode="layer">\n    ${paths}\n  </g>\n`;
  }
  if (!data?.elements?.length) return '';
  const elements = data.elements.filter(el => elementInBbox(el, b));
  if (!elements.length) return '';
  if (layer.type==='roads')          return buildRoadsLayer(elements,pr,W,ctx);
  if (layer.type==='rail') {
    const svg=buildRailLayer(elements,pr,W);
    // The hatched rail bed must stay label-free: claim its corridor in the
    // shared label grid (rail builds before both label layers, see
    // LAYER_ORDER). Radius = half the casing width + a small clearance;
    // grid.hits adds the label's own ribbon radius on top.
    if (ctx.labelGrid && svg) {
      const rr=8*getScaleFactor(W);
      for (const el of elements) {
        if (el.type!=='way'||!el.geometry?.length) continue;
        stampPolyline(ctx.labelGrid, el.geometry.map(g=>pr(g.lat,g.lon)), rr);
      }
    }
    return svg;
  }
  if (layer.type==='metro')          return buildMetroLayer(elements,pr,W);
  if (layer.type==='tram')           return buildTramLayer(elements,pr,W);
  if (layer.type==='labels')         return buildLabelsLayer(elements,pr,W,H,ctx.labelGrid,{illustratorCompatible:ctx.illustratorCompatible});
  if (layer.type==='feature_labels') return buildFeatureLabelsLayer(elements,pr,W,H,ctx.labelGrid,{illustratorCompatible:ctx.illustratorCompatible});

  const large=['landuse_residential','landuse_industrial','water_bodies','parks','landcover'];
  const eps=layer.type==='line'?EPS.line:large.includes(layer.id)?EPS.area_large:EPS.area;
  const isArea=layer.type==='area';
  let allD='', circles='';

  let fillColor=layer.color, strokeColor=layer.strokeColor||layer.color;
  if (layer.id==='waterways') { fillColor=preset.water; strokeColor=preset.water; }
  if (layer.id==='water_bodies') {
    // One named <path> per water body (not one merged blob for the whole
    // layer), mirroring the parks pattern below — so a lake can be selected,
    // recoloured, or hidden by name in Illustrator/Inkscape.
    let content = '';
    const uid = makeUidGen();
    const sw = layer.strokeWidth ?? 0.5;
    elements.forEach(el => {
      let d = '';
      if (el.type === 'way') d = geomToPathD(el.geometry, pr, EPS.area_large, true);
      if (el.type === 'relation' && el.members) {
        const { outer, inner } = stitchMultipolygonRings(el.members);
        [...outer, ...inner].forEach(ring => { d += geomToPathD(ring, pr, EPS.area_large, true) + ' '; });
        d = d.trim();
      }
      if (!d) return;
      if (ctx.areaClipDs) ctx.areaClipDs.push(d);
      const name = el.tags?.name;
      const id = name ? uid(`water_${safeName(name)}`) : uid(`water${el.id ? '_' + el.id : ''}`);
      // Same self-coloured stroke the merged path carried: it seals the
      // sub-pixel seam between the water edge and the abutting block edge.
      content += `<path id="${id}" inkscape:label="${escXml(name || 'Water')}" d="${d}" fill="${preset.water}" fill-opacity="${preset.waterOp}" fill-rule="evenodd" stroke="${preset.water}" stroke-width="${sw}" stroke-linejoin="round"/>`;
    });
    if (!content) return '';
    return `  <g id="${layer.id}" inkscape:label="${escXml(layer.label)}" inkscape:groupmode="layer">\n    ${content}\n  </g>\n`;
  }
  if (layer.id==='landcover') {
    let content = '';
    const uid = makeUidGen();
    // Paint big polygons first, small ones on top. CORINE-import meadows can
    // span the whole bbox as ONE multipolygon; in fetch order it painted over
    // every forest patch inside it (visible only when hiding the meadow path).
    const approxDeg2 = el => {
      const b = el.bounds;
      if (b) return (b.maxlat - b.minlat) * (b.maxlon - b.minlon);
      const g = el.type === 'way' ? el.geometry : null;
      if (!g?.length) return 0;
      let s = Infinity, n = -Infinity, w = Infinity, e = -Infinity;
      for (const p of g) { if (p.lat < s) s = p.lat; if (p.lat > n) n = p.lat; if (p.lon < w) w = p.lon; if (p.lon > e) e = p.lon; }
      return (n - s) * (e - w);
    };
    [...elements].sort((a, z) => approxDeg2(z) - approxDeg2(a)).forEach(el => {
      const cover = (/^(farmland|meadow|orchard|vineyard|forest)$/.test(el.tags?.landuse || '') && el.tags.landuse)
                 || (/^(wood|scrub|heath)$/.test(el.tags?.natural || '') && el.tags.natural);
      if (!cover) return;
      let d = '';
      if (el.type === 'way') d = geomToPathD(el.geometry, pr, EPS.area_large, true);
      if (el.type === 'relation' && el.members) {
        const { outer, inner } = stitchMultipolygonRings(el.members);
        [...outer, ...inner].forEach(ring => { d += geomToPathD(ring, pr, EPS.area_large, true) + ' '; });
        d = d.trim();
      }
      if (!d) return;
      const fill = cover === 'forest' || cover === 'wood' ? preset.park : preset.field;
      const name = el.tags?.name;
      const id = name ? uid(`landcover_${safeName(name)}`) : uid(`landcover_${cover}${el.id ? '_' + el.id : ''}`);
      const label = name || cover.replace(/^\w/, c => c.toUpperCase());
      content += `<path id="${id}" inkscape:label="${escXml(label)}" d="${d}" fill="${fill}" fill-rule="evenodd" stroke="none"/>`;
    });
    if (!content) return '';
    return `  <g id="${layer.id}" inkscape:label="${escXml(layer.label)}" inkscape:groupmode="layer">\n    ${content}\n  </g>\n`;
  }
  if (layer.id==='parks') {
    fillColor=preset.park;
    let content = '';
    const uid = makeUidGen();
    elements.forEach(el => {
      const name = el.tags?.name;
      let d = '';
      if (el.type === 'way') d = geomToPathD(el.geometry, pr, EPS.area_large, true);
      if (el.type === 'relation' && el.members) {
        const { outer, inner } = stitchMultipolygonRings(el.members);
        [...outer, ...inner].forEach(ring => { d += geomToPathD(ring, pr, EPS.area_large, true) + ' '; });
        d = d.trim();
      }
      if (!d) return;
      if (ctx.areaClipDs) ctx.areaClipDs.push(d);
      // Named greens keep their name as id + label. A nameless element only
      // reaches here after pruneIslandGreens confirmed it sits inside a water
      // island, so its id/label come from the land-cover tag instead.
      let id, label;
      if (name) { id = uid(`park_${safeName(name)}`); label = name; }
      else {
        const cover = islandGreenCover(el) || 'green';
        id = uid(`green_${cover}${el.id ? '_' + el.id : ''}`);
        label = cover.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
      }
      content += `<path id="${id}" inkscape:label="${escXml(label)}" d="${d}" fill="${fillColor}" fill-rule="evenodd" stroke="none"/>`;
    });
    if (!content) return '';
    return `  <g id="${layer.id}" inkscape:label="${escXml(layer.label)}" inkscape:groupmode="layer">\n    ${content}\n  </g>\n`;
  }
  elements.forEach(el=>{
    if (layer.type==='point'&&el.type==='node'&&el.lat!=null) {
      const [x,y]=pr(el.lat,el.lon);
      const poiName=el.tags?.name||el.tags?.amenity||el.tags?.tourism||el.tags?.shop||layer.label;
      const poiId=`poi_${safeName(poiName)}_${el.id||Math.round(x)}`;
      circles+=`<circle id="${poiId}" inkscape:label="${escXml(poiName)}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${layer.radius||2}"/>`;
      return;
    }
    if (el.type==='way') allD+=geomToPathD(el.geometry,pr,eps,isArea)+' ';
    if (el.type==='relation'&&el.members) {
      const { outer, inner } = stitchMultipolygonRings(el.members);
      [...outer, ...inner].forEach(ring=>{allD+=geomToPathD(ring,pr,eps,isArea)+' ';});
    }
  });

  let content='';
  const d=allD.trim();
  if (d) {
    if (isArea) {
      // water_bodies/parks/landcover never reach here — each has its own
      // per-feature branch above.
      const fo=layer.fillOpacity??0.7;
      const sw=layer.strokeWidth??0.5;
      content+=`<path d="${d}" fill="${fillColor}" fill-opacity="${fo}" fill-rule="evenodd" stroke="${strokeColor}" stroke-width="${sw}" stroke-linejoin="round"/>`;
    } else {
      const sw=typeof layer.strokeWidth==='function'?layer.strokeWidth({}):(layer.strokeWidth??1);
      const dash=layer.strokeDash?` stroke-dasharray="${layer.strokeDash}"`:'';
      content+=`<path d="${d}" fill="none" stroke="${fillColor}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${dash} opacity="0.92"/>`;
    }
  }
  if (circles) content+=circles;
  if (!content) return '';
  return `  <g id="${layer.id}" inkscape:label="${escXml(layer.label)}" inkscape:groupmode="layer" fill="${fillColor}" opacity="${layer.type==='point'?'0.8':'1'}">\n    ${content}\n  </g>\n`;
}

// Build AND paint order (buildSVG walks sortedResults once). water_labels
// deliberately precedes street_labels: feature labels have exactly one
// possible anchor, so they stamp the shared label grid first and the
// flexible street labels dodge them. Z-order between the two label groups
// is irrelevant — the shared grid guarantees they never overlap.
const LAYER_ORDER = ['landcover','water_bodies','waterways','city_blocks','parks','roads','rail','tram','metro','transit_stops','water_labels','street_labels'];

function buildSVGContext(b, W, precomputedBlocks, options = {}) {
  const { pr, H } = makeProjector(b, W);
  return {
    b, pr, W, H,
    preset: PRESETS[activePreset],
    EPS: { area_large: getAreaLargeEps(), area: getEps()*0.9, line: getLineEps() },
    precomputedBlocks: precomputedBlocks || null,
    // Illustrator pipeline switch: same layer builders, Illustrator-safe
    // emission (see wrapSVGIllustrator for the full quirk list).
    illustratorCompatible: !!options.illustratorCompatible,
    // clipPath definitions that must live in the document-root <defs> in
    // Illustrator mode (it mishandles clipPaths declared inline in a <g>).
    illustratorDefs: [],
    // Park/water outline d-strings, filled by the parks and water_bodies
    // renders (they paint before roads, see LAYER_ORDER). The roads layer
    // turns them into the clipPath that overprints path dashes in white.
    areaClipDs: [],
    // One collision grid for the whole export: rail corridors stamp it,
    // then feature labels, then street labels — nothing can overlap.
    labelGrid: makeFootprintGrid(),
  };
}

// Standards-based wrapper: Inkscape, web browsers, QuickLook, and any other
// conforming SVG renderer. Carries Inkscape layer metadata and Dublin Core
// attribution. (No xmlns:xlink — textPath references use the SVG 2 plain
// `href`, which every consumer of this profile understands.)
function wrapSVG(layersSVG, ctx, physicalWidthMm) {
  const { b, W, H, preset } = ctx;
  const date = new Date().toISOString().slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     xmlns:dc="http://purl.org/dc/elements/1.1/"
     xmlns:cc="http://creativecommons.org/ns#"
     xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
     width="${W}"
     height="${H}"
     viewBox="0 0 ${W} ${H}"
     inkscape:document-units="px">
  <metadata><rdf:RDF><cc:Work rdf:about=""><dc:title>Map Export — ${date}</dc:title><dc:source>© OpenStreetMap contributors (ODbL)</dc:source><dc:description>Bbox: ${b.south.toFixed(5)},${b.west.toFixed(5)},${b.north.toFixed(5)},${b.east.toFixed(5)} | Style: ${activePreset}${physicalWidthMm ? ` | Print size: ${physicalWidthMm}mm × ${(physicalWidthMm*H/W).toFixed(1)}mm @ 300dpi` : ''}</dc:description></cc:Work></rdf:RDF></metadata>
  <defs>
    <clipPath id="map-clip">
      <rect x="0" y="0" width="${W}" height="${H}"/>
    </clipPath>
  </defs>
  <g id="background" inkscape:label="Background" inkscape:groupmode="layer">
    <rect width="${W}" height="${H}" fill="${preset.bg}"/>
  </g>
  <g id="map-content" inkscape:label="Map content" inkscape:groupmode="layer" clip-path="url(#map-clip)">
${layersSVG}  </g>
</svg>`;
}

// ── Illustrator-compatible wrapper ────────────────────────────────
// Adobe Illustrator's SVG import is a partial, buggy SVG 1.1 parser, so —
// like Maperitive's compatibility=illustrator mode — this wrapper (together
// with the illustratorCompatible flag in the layer builders) keeps the file
// inside the subset Illustrator actually understands:
//
//  1. No <textPath>: pre-23.0.6 doesn't rotate glyphs, every version
//     explodes the text into per-letter point text, and percentage
//     startOffset is unreliable → curved street labels are emitted glyph by
//     glyph (emitCurvedLabelAsGlyphs), so no xmlns:xlink either.
//  2. No paint-order (SVG 2, ignored by Illustrator) → feature-label halos
//     are two stacked <text> elements.
//  3. No inkscape:*/RDF metadata (parser risk, no value) → stripped below;
//     attribution moves into an XML comment. Illustrator names layers and
//     objects from id="" attributes, which everything already carries.
//  4. clipPaths only at the document root <defs> (declared inline in a <g>
//     they are unreliable) → collected via context.illustratorDefs.
//  5. Single font name (a comma list is read as one literal name by older
//     versions) and only real Arial styles: weights 500/600 snap to 400/700
//     (see illustratorFontWeight).
//  6. Artboard limit: Illustrator opens SVG at 1px = 1pt and its canvas
//     maxes out at 16383pt (~227in) — the fixed 67.5cm print envelope
//     (getPhysicalSizeMm) keeps every export well under that, so there's
//     nothing to warn about at runtime.
//
// Everything else deliberately stays plain SVG 1.1 in BOTH pipelines: hex
// colors only (no rgba()/hsl()), presentation attributes (no <style>/CSS
// classes), fixed-decimal coordinates (no scientific notation), baselines
// baked into geometry (no dominant-baseline).
function wrapSVGIllustrator(layersSVG, ctx, physicalWidthMm) {
  const { b, W, H, preset } = ctx;
  const date = new Date().toISOString().slice(0, 10);
  // The layer builders were written for the Inkscape profile; rather than
  // thread the flag through every emitter just to omit editor metadata,
  // strip the inkscape:* attributes here. Safe on our own markup: attribute
  // values are XML-escaped, so no stray quotes can end one early.
  const layersWithoutInkscapeAttributes = layersSVG.replace(/ inkscape:[\w-]+="[^"]*"/g, '');
  const rootDefs = ctx.illustratorDefs.length ? `\n    ${ctx.illustratorDefs.join('\n    ')}` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Illustrator-compatible export (Adobe SVG import profile — expect this
     file to be suboptimal in standards-based viewers; use the
     "SVG (Inkscape / others)" export for those).
     Map Export — ${date} | © OpenStreetMap contributors (ODbL)
     Bbox: ${b.south.toFixed(5)},${b.west.toFixed(5)},${b.north.toFixed(5)},${b.east.toFixed(5)} | Style: ${activePreset}${physicalWidthMm ? ` | Print size: ${physicalWidthMm}mm × ${(physicalWidthMm*H/W).toFixed(1)}mm @ 300dpi` : ''} -->
<svg xmlns="http://www.w3.org/2000/svg"
     width="${W}"
     height="${H}"
     viewBox="0 0 ${W} ${H}">
  <defs>
    <clipPath id="map-clip">
      <rect x="0" y="0" width="${W}" height="${H}"/>
    </clipPath>${rootDefs}
  </defs>
  <g id="background">
    <rect width="${W}" height="${H}" fill="${preset.bg}"/>
  </g>
  <g id="map-content" clip-path="url(#map-clip)">
${layersWithoutInkscapeAttributes}  </g>
</svg>`;
}

function sortedResults(results) {
  // indexOf -1 (unknown id) must sort LAST — the old `|| 999` fallback only
  // caught index 0 and let unknown layers sort first, under everything.
  const ord = id => { const i = LAYER_ORDER.indexOf(id); return i < 0 ? 999 : i; };
  return [...results].sort((a,z) => ord(a.layer.id) - ord(z.layer.id));
}

function buildSVG(results, b, W, physicalWidthMm=null, precomputedBlocks=null, options={}) {
  // Keep only island-verified nameless greens before rendering (idempotent;
  // prepareBlockData already ran this when blocks were computed).
  pruneIslandGreens(results);
  const ctx = buildSVGContext(b, W, precomputedBlocks, options);
  let layersSVG = '';
  for (const r of sortedResults(results)) layersSVG += renderLayerSVG(r, ctx);
  return ctx.illustratorCompatible
    ? wrapSVGIllustrator(layersSVG, ctx, physicalWidthMm)
    : wrapSVG(layersSVG, ctx, physicalWidthMm);
}

// ════════════════════════════════════════════════════════════════
//  LIVE PREVIEW — rebuilds SVG from cached data, no re-fetch
// ════════════════════════════════════════════════════════════════
function scheduleLivePreview() {
  if (!lastResults || !bbox) return;
  clearTimeout(previewDebounce);
  previewDebounce = setTimeout(async () => {
    const PREVIEW_W = 600;
    const selected = new Set(getAllSelectedLayers().map(l => l.id));
    const filtered = lastResults.filter(r => selected.has(r.layer.id) && r.layer.id !== 'city_blocks');
    if (!filtered.length) return;

    const svg = buildSVG(filtered, bbox, PREVIEW_W);
    const wrap = document.getElementById('preview-svg-wrap');
    wrap.innerHTML = svg;
    document.getElementById('preview-pane').classList.add('show');
    lastSvgString = svg;
  }, 120);
}


function getExportWidth(b) {
  return Math.round(getPhysicalSizeMm(b).mmW/25.4*PRINT_DPI);
}

function getAllSelectedLayers() {
  const layers=[];
  LAYER_REGISTRY.forEach(g=>g.layers.forEach(l=>{ if(document.getElementById('lyr-'+l.id)?.checked) layers.push(l); }));
  return layers;
}

// ════════════════════════════════════════════════════════════════
//  AREA NAME  (derives a sensible filename slug from the selection)
// ════════════════════════════════════════════════════════════════
function slugifyName(name) {
  return (name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}

// Picks the shortest human place name out of a Nominatim address breakdown
// (OSM often returns several usable candidates at once — official vs.
// colloquial, city vs. district — the shortest tends to be the plain city
// name), falling back to the leading segment of display_name.
function pickAreaName(address, displayName) {
  const a=address||{};
  const candidates=[a.city,a.town,a.village,a.hamlet,a.municipality,a.city_district,a.borough,a.suburb,a.county,a.state].filter(Boolean);
  if (candidates.length) return candidates.reduce((shortest,c)=>c.length<shortest.length?c:shortest);
  return displayName?displayName.split(',')[0].trim():'';
}

// Truncates a name for display in tight UI spots (e.g. the history list)
// so it can't wrap or overflow; the full name is kept in the filename/storage.
function truncateName(name, maxLen=24) {
  if (!name || name.length<=maxLen) return name;
  return name.slice(0,maxLen-1).trimEnd()+'…';
}

function setAreaName(name) {
  areaNameLookupToken++; // invalidate any in-flight reverse-geocode from a previous selection
  areaNameLookup=null;
  currentAreaName=name||'';
}

// Reverse-geocodes the bbox centre so a manually-drawn rectangle still gets
// a sensible default name, without ever showing a field for it — doExport()
// awaits this (or falls back to the name-prompt modal) before proceeding.
function reverseGeocodeAreaName(b) {
  const token=++areaNameLookupToken;
  currentAreaName='';
  areaNameLookup=(async () => {
    let name='';
    try {
      const lat=(b.north+b.south)/2, lon=(b.east+b.west)/2;
      const url=`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&zoom=10`;
      const data=await (await fetch(url,{headers:{'Accept-Language':'en'}})).json();
      name=pickAreaName(data.address, data.display_name);
    } catch(e) { /* leave blank — doExport() will prompt for one */ }
    if (token===areaNameLookupToken) { currentAreaName=name; areaNameLookup=null; }
    return name;
  })();
  return areaNameLookup;
}

// Shows the "name this map" modal, resolving to the typed name or null if
// the user cancels (via Cancel, Escape, or clicking the backdrop).
function promptForAreaName() {
  return new Promise(resolve => {
    const modal=document.getElementById('name-modal');
    const input=document.getElementById('name-modal-input');
    const error=document.getElementById('name-modal-error');
    const submitBtn=document.getElementById('name-modal-submit');
    const cancelBtn=document.getElementById('name-modal-cancel');
    input.value='';
    error.textContent='';
    modal.classList.add('show');
    setTimeout(()=>input.focus(),0);

    function cleanup() {
      modal.classList.remove('show');
      submitBtn.removeEventListener('click', onSubmit);
      cancelBtn.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKeydown);
      modal.removeEventListener('mousedown', onBackdrop);
    }
    function onSubmit() {
      const v=input.value.trim();
      if (!v) { error.textContent='Enter a name to continue'; input.focus(); return; }
      cleanup();
      resolve(v);
    }
    function onCancel() { cleanup(); resolve(null); }
    function onKeydown(e) {
      if (e.key==='Enter') onSubmit();
      else if (e.key==='Escape') onCancel();
    }
    function onBackdrop(e) { if (e.target===modal) onCancel(); }

    submitBtn.addEventListener('click', onSubmit);
    cancelBtn.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKeydown);
    modal.addEventListener('mousedown', onBackdrop);
  });
}

async function doExport() {
  if (!bbox) return;
  const selected=getAllSelectedLayers();
  if (!selected.length) { setStatus('Select at least one layer','error'); return; }
  if (areaNameLookup) { setStatus('Looking up a name for this area…','loading'); await areaNameLookup; }
  if (!slugifyName(currentAreaName)) {
    const typed=await promptForAreaName();
    if (typed===null) { setStatus('Export cancelled — no name given','error'); return; }
    setAreaName(typed);
  }
  const areaName=currentAreaName;
  const areaSlug=slugifyName(areaName);
  const physicalWidthMm=getPhysicalSizeMm(bbox).mmW;
  const W=Math.round(physicalWidthMm/25.4*PRINT_DPI);
  // Which serialization pipeline: Illustrator-compatible (default — most
  // USE-IT designers work in Illustrator) or standards-based SVG. See
  // wrapSVGIllustrator for what the Illustrator profile changes and why.
  const illustratorCompatible=document.getElementById('format-select')?.value!=='svg-standard';
  const bboxStr=`${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  // YYYY-MM-DD-HHMMSS (local time) so multiple exports on the same day don't collide.
  const d=new Date(),p2=n=>String(n).padStart(2,'0');
  const stamp=`${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
  const filename=`map-${activePreset}-${areaSlug}-${stamp}${illustratorCompatible?'-illustrator':''}.svg`;

  document.getElementById('btn-export').disabled=true;
  clearFailedTileOverlays();
  adaptiveTileDelay=350;

  const needsBlocks = selected.some(l => l.id === 'city_blocks');
  // city_blocks has no overpassQuery — it's derived from the other layers'
  // geometry in a worker (plus, for countryside faces only, an on-demand
  // BLOCK_BUILDINGS_LAYER fetch — see the compute_blocks stage below). The
  // combined fetch pipeline here only handles layers that query Overpass.
  const overpassLayers = selected.filter(l => typeof l.overpassQuery === 'function');
  const stages = [
    { id: 'plan_tiles',     label: 'Plan tiles' },
    { id: 'check_cache',    label: 'Check cache' },
    { id: 'fetch_tiles',    label: 'Fetch tiles' },
    ...(needsBlocks ? [{ id: 'compute_blocks', label: 'Compute blocks' }] : []),
    { id: 'render_svg',     label: 'Render SVG' },
    { id: 'finalize',       label: 'Finalize' },
  ];
  progress.begin(stages);
  progress.log(`Export: ${selected.length} layer${selected.length>1?'s':''}, ${W}px wide (${(physicalWidthMm/10).toFixed(1)}cm @ ${PRINT_DPI}dpi), style “${activePreset}”, format ${illustratorCompatible?'SVG (Illustrator)':'SVG (Inkscape / others)'}`);

  // Stage 1 — plan tiles
  progress.setStage('plan_tiles', 'active');
  const tiles=bboxToTiles(bbox);
  const adaptiveMode = tiles.length === 1 && tiles[0].adaptive;
  const midLat = (bbox.north + bbox.south) / 2;
  const tileKmNS = (t) => ((t.n - t.s) * 111).toFixed(1);
  const tileKmEW = (t) => ((t.e - t.w) * 111 * Math.cos(midLat * Math.PI/180)).toFixed(1);
  const sample = tiles[0];
  const sizeLabel = sample ? `~${tileKmEW(sample)}×${tileKmNS(sample)} km` : '';
  progress.setStage('plan_tiles', 'done', {
    meta: `${tiles.length} tile${tiles.length>1?'s':''}${adaptiveMode ? ' · adaptive' : ''}`,
    detail: '',
  });
  progress.log(
    adaptiveMode
      ? `Planned 1 adaptive query (${sizeLabel}) — bounded by export bbox`
      : `Planned ${tiles.length} tile${tiles.length>1?'s':''} on 0.1° grid (${sizeLabel} each)`
  );

  // ── Tile-first combined fetching ─────────────────────────────
  // Instead of one API call per tile per layer, we combine all
  // uncached layers into a single Overpass query per tile, then
  // split the response by tagFilter. For 10 layers × 4 tiles this
  // reduces 40 API calls down to at most 4.
  const layerElements={}; // layerId -> [...elements across tiles]
  selected.forEach(l=>{ layerElements[l.id]=[]; });
  let totalFailedTiles=0, fetchedTiles=0;

  // Stage 2 — cache probe
  progress.setStage('check_cache', 'active');
  const allKeys=[];
  for (const tile of tiles) for (const layer of overpassLayers) allKeys.push(tileCacheKey(layer,tile));
  const existingKeys=await cacheExistsBatch(allKeys);
  const cachedCount = existingKeys.size, totalKeys = allKeys.length, uncachedCount = totalKeys - cachedCount;
  progress.setStage('check_cache', 'done', { meta: `${cachedCount}/${totalKeys} cached` });
  progress.log(`Cache hit on ${cachedCount}/${totalKeys} (layer,tile) keys — ${uncachedCount} to fetch`);

  // Stage 3 — fetch tiles (or skip if nothing to fetch)
  const queue = tiles.map((tile, idx) => ({ tile, idx }));
  let tilesDone = 0, tilesFullyCached = 0;
  const fetchedMeta = () => `${fetchedTiles} fetched · ${tilesFullyCached} cached · ${totalFailedTiles} failed`;
  progress.setStage('fetch_tiles', 'active', { meta: `0/${tiles.length}`, detail: uncachedCount ? 'Waiting for endpoints…' : 'Nothing to fetch — all tiles cached' });

  async function worker(endpoint) {
    const host = new URL(endpoint).hostname;
    while (queue.length) {
      const { tile, idx } = queue.shift();
      const uncachedLayers = [];

      const cacheReads = overpassLayers.map(async layer => {
        const key = tileCacheKey(layer, tile);
        if (!existingKeys.has(key)) return { layer, cached: null };
        return { layer, cached: await cacheGet(key) };
      });
      for (const { layer, cached } of await Promise.all(cacheReads)) {
        if (cached) layerElements[layer.id].push(...(cached.elements || []));
        else uncachedLayers.push(layer);
      }

      if (!uncachedLayers.length) {
        tilesDone++; tilesFullyCached++;
        progress.setStage('fetch_tiles', 'active', {
          meta: `${tilesDone}/${tiles.length}`,
          detail: `Tile ${idx+1}: all layers cached`,
        });
        progress.bar(Math.round((tilesDone/tiles.length)*70));
        continue;
      }

      progress.setStage('fetch_tiles', 'active', {
        meta: `${tilesDone}/${tiles.length} · ${fetchedMeta()}`,
        detail: `Tile ${idx+1}/${tiles.length}: ${uncachedLayers.map(l=>l.label).join(', ')} on ${host}`,
      });

      // Per-tile fetch progress: shows TTFB elapsed, then bytes received.
      // Log a one-time warning if the server-side compute stalls past 15s.
      let warnedSlow = false;
      const onFetchProgress = (info) => {
        let line = `Tile ${idx+1}/${tiles.length} on ${host}: `;
        if (info.phase === 'waiting') {
          line += info.elapsed === 0
            ? 'sent query, awaiting response…'
            : `running query… ${info.elapsed}s`;
          if (!warnedSlow && info.elapsed >= 15) {
            warnedSlow = true;
            progress.log(`Tile ${idx+1}: Overpass still computing (${info.elapsed}s+) — large area?`, { warn: true });
          }
        } else if (info.phase === 'downloading') {
          const mb = (info.received / 1024 / 1024).toFixed(2);
          line += info.total
            ? `downloading… ${mb} / ${(info.total/1024/1024).toFixed(2)} MB`
            : `downloading… ${mb} MB`;
        }
        progress.setStage('fetch_tiles', 'active', {
          meta: `${tilesDone}/${tiles.length} · ${fetchedMeta()}`,
          detail: line,
        });
      };

      // Single-tile exports: race all endpoints (the fastest wins) instead of
      // pinning to this worker's one endpoint. Multi-tile already parallelizes
      // across endpoints via the worker pool, so keep the pinned path there.
      const combined = tiles.length === 1
        ? await fetchTileCombinedRace(uncachedLayers, tile, onFetchProgress)
        : await fetchTileCombined(uncachedLayers, tile, endpoint, onFetchProgress);
      if (!combined) {
        console.warn(`Tile ${idx+1}/${tiles.length} failed after retries`);
        totalFailedTiles++;
        showFailedTileOverlays([tile], `tile ${idx+1}`);
        tilesDone++;
        progress.log(`Tile ${idx+1}/${tiles.length} failed after retries`, { warn: true });
        progress.bar(Math.round((tilesDone/tiles.length)*70));
        continue;
      }

      for (const layer of uncachedLayers) {
        const elements = layer.tagFilter
          ? combined.elements.filter(layer.tagFilter)
          : combined.elements;
        layerElements[layer.id].push(...elements);
        cacheSet(tileCacheKey(layer, tile), { elements });
      }

      fetchedTiles++;
      tilesDone++;
      progress.log(`Tile ${idx+1}/${tiles.length} fetched (${uncachedLayers.length} layer${uncachedLayers.length>1?'s':''}) from ${host}`);
      progress.bar(Math.round((tilesDone/tiles.length)*70));
      // Per-endpoint throttle: only sleep if there's more work for this
      // worker to pick up. Keeps parallel workers from being artificially
      // serialized through a shared timer.
      if (queue.length) await sleep(adaptiveTileDelay);
    }
  }

  await Promise.all(OVERPASS_ENDPOINTS.map(worker));

  const fetchStageState = totalFailedTiles && totalFailedTiles === tiles.length ? 'failed' : 'done';
  progress.setStage('fetch_tiles', fetchStageState, { meta: fetchedMeta(), detail: '' });

  // Build results in the format buildSVG expects
  const results=selected.map(layer=>({
    layer,
    data:{ elements: mergeElements([layerElements[layer.id]]), failedTiles:[] }
  }));
  // Abort only if there's nothing left to render: every Overpass layer came back
  // empty AND we're not about to build blocks from vector tiles.
  const overpassResults = results.filter(r => overpassLayers.includes(r.layer));
  const allOverpassFailed = overpassResults.length > 0 && overpassResults.every(r => !r.data.elements.length);
  if (allOverpassFailed && !needsBlocks) {
    progress.log('All fetches failed — aborting export', { warn: true });
    progress.end();
    document.getElementById('btn-export').disabled=false;
    setStatus('All fetches failed — check your connection','error');
    return;
  }

  // Cache results for live preview
  lastResults = results;

  // Count elements for size warning
  const totalElements=results.reduce((s,r)=>s+(r.data?.elements?.length||0),0);
  const estMB=(totalElements*0.0003).toFixed(1);

  // Stage — compute city blocks (negative space of the street/water/park network)
  let precomputedBlocks = null;
  if (needsBlocks) {
    progress.setStage('compute_blocks', 'active', { detail: 'Starting worker…' });
    const { pr: blockPr, H: blockH } = makeProjector(bbox, W);
    const onBlockProgress = (msg, pct) => {
      progress.setStage('compute_blocks', 'active', { detail: msg });
      progress.bar(70 + Math.round(pct * 0.20));
    };
    let blockRes = await computeBlocksAsync(results, blockPr, W, blockH, onBlockProgress, { bbox });
    // Countryside faces need building footprints to trace hamlet blocks.
    // Fetched only now, only when such faces exist — a pure-city export
    // (every face under the threshold) never downloads a single building.
    if (blockRes.needsBuildings) {
      progress.setStage('compute_blocks', 'active', { detail: 'Countryside faces found — fetching buildings…' });
      progress.log('Countryside faces found — fetching building footprints for hamlet blocks');
      const { elements } = await fetchLayer(BLOCK_BUILDINGS_LAYER, bboxStr, bbox);
      const kept = elements.filter(BLOCK_BUILDINGS_LAYER.tagFilter);
      progress.log(`Fetched ${kept.length} building/parcel outlines`);
      blockRes = await computeBlocksAsync(results, blockPr, W, blockH, onBlockProgress,
        { bbox, clusterRings: prepareClusterData(kept, blockPr) });
    }
    precomputedBlocks = blockRes.blocks;
    const painted = precomputedBlocks.filter(bl => (bl.kind || 'urban') !== 'countryside').length;
    progress.setStage('compute_blocks', 'done', { meta: `${painted} blocks` });
    progress.log(`Computed ${painted} city/hamlet blocks (${precomputedBlocks.length - painted} countryside faces left unpainted)`);
  }

  // Stage — render SVG, per-layer
  progress.setStage('render_svg', 'active', { detail: 'Preparing…' });
  const ctx = buildSVGContext(bbox, W, precomputedBlocks, { illustratorCompatible });
  const ordered = sortedResults(results);
  let layersSVG = '';
  const renderStart = needsBlocks ? 90 : 70;
  const renderSpan = 98; // leave 2% for finalize
  for (let i = 0; i < ordered.length; i++) {
    const r = ordered[i];
    const n = r.data?.elements?.length || 0;
    progress.setStage('render_svg', 'active', {
      meta: `${i+1}/${ordered.length}`,
      detail: `${r.layer.label} (${n.toLocaleString()} elements)`,
    });
    layersSVG += renderLayerSVG(r, ctx);
    progress.bar(renderStart + Math.round(((i+1)/ordered.length) * (renderSpan - renderStart)));
    // Yield to the event loop so the overlay actually repaints between layers.
    if (i < ordered.length - 1) await new Promise(r => setTimeout(r, 0));
  }
  progress.setStage('render_svg', 'done', { meta: `${ordered.length} layers`, detail: '' });

  // Stage 5 — finalize
  progress.setStage('finalize', 'active', { detail: 'Wrapping SVG…' });
  await new Promise(r=>setTimeout(r,0));
  const svg = illustratorCompatible
    ? wrapSVGIllustrator(layersSVG, ctx, physicalWidthMm)
    : wrapSVG(layersSVG, ctx, physicalWidthMm);
  const actualMB=(svg.length/1024/1024).toFixed(1);
  lastSvgString=svg; lastSvgFilename=filename;
  progress.setStage('finalize', 'done', { meta: `${actualMB} MB`, detail: '' });
  progress.bar(100);
  progress.log(`Done — ${actualMB} MB, ${totalElements.toLocaleString()} elements`);

  // Brief pause so the user registers the 100% state, then hide + reveal.
  await new Promise(r=>setTimeout(r,250));
  progress.end();
  showPreview(svg,filename);
  document.getElementById('btn-export').disabled=false;
  setStatus(`✓ ${selected.length} layers · ${W}px wide · ${actualMB} MB · ${totalElements.toLocaleString()} elements`,'success');
  showFailedTileSummary(totalFailedTiles);
  saveHistory(bbox, activePreset, W, filename, actualMB, totalElements, areaName);
}

function triggerDownload(svg,filename) {
  const blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}

function showPreview(svg,filename) {
  document.getElementById('preview-svg-wrap').innerHTML=svg;
  document.getElementById('preview-pane').classList.add('show');
}

// ════════════════════════════════════════════════════════════════
//  HISTORY  (localStorage)
// ════════════════════════════════════════════════════════════════
function saveHistory(b, preset, W, filename, mb, elements, areaName) {
  try {
    const key='mapexport_history';
    const existing=JSON.parse(localStorage.getItem(key)||'[]');
    const now=new Date();
    const entry={
      id: Date.now(),
      date: now.toLocaleDateString(),
      time: now.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}),
      label: filename.replace('.svg',''),
      bbox: b,
      preset, W, mb, elements, areaName,
      layers: getAllSelectedLayers().map(l=>l.id),
    };
    existing.unshift(entry);
    localStorage.setItem(key, JSON.stringify(existing.slice(0,10)));
    renderHistory();
  } catch(e) {}
}

function renderHistory() {
  try {
    const list=document.getElementById('history-list');
    const header=document.getElementById('history-header');
    const items=JSON.parse(localStorage.getItem('mapexport_history')||'[]');
    if (!items.length) {
      list.innerHTML='<div id="no-history">No exports yet</div>';
      if (header) header.style.display='none';
      return;
    }
    if (header) header.style.display='flex';
    list.innerHTML='';
    items.forEach(entry=>{
      const div=document.createElement('div');
      div.className='history-item';
      const {south,west,north,east}=entry.bbox;
      const kmNS=((north-south)*111).toFixed(0), kmEW=((east-west)*111*Math.cos((north+south)/2*Math.PI/180)).toFixed(0);
      const name=entry.areaName||entry.preset;
      const when=entry.time?`${entry.date} ${entry.time}`:entry.date;
      div.innerHTML=`<div class="hi-info"><div class="hi-label" title="${escXml(name)}">${escXml(truncateName(name))}</div><div class="hi-meta">${when} · ${kmNS}×${kmEW}km · ${entry.W}px · ${entry.mb}MB</div></div><button class="hi-del" title="Remove">✕</button>`;
      div.querySelector('.hi-del').addEventListener('click', e=>{
        e.stopPropagation();
        try { const h=JSON.parse(localStorage.getItem('mapexport_history')||'[]'); localStorage.setItem('mapexport_history',JSON.stringify(h.filter(x=>x.id!==entry.id))); renderHistory(); } catch(e){}
      });
      div.addEventListener('click', ()=>{
        bbox=entry.bbox;
        map.fitBounds([[entry.bbox.south,entry.bbox.west],[entry.bbox.north,entry.bbox.east]],{padding:[20,20]});
        if (bboxRect) map.removeLayer(bboxRect);
        bboxRect=L.rectangle([[entry.bbox.south,entry.bbox.west],[entry.bbox.north,entry.bbox.east]],{color:'#bf3b1e',weight:1.5,fillColor:'#bf3b1e',fillOpacity:0.07,dashArray:'5 3'}).addTo(map);
        updateBboxDisplay();
        document.getElementById('btn-export').disabled=false;
        setAreaName(entry.areaName||'');
        // Restore preset
        activePreset=PRESETS[entry.preset]?entry.preset:'useit';
        document.querySelectorAll('.preset-btn').forEach(b=>{b.classList.toggle('active',b.dataset.preset===activePreset);});
        setStatus(`Loaded: ${entry.areaName||entry.preset} · ${entry.date}${entry.time?' '+entry.time:''}`,'success');
      });
      list.appendChild(div);
    });
  } catch(e) {}
}

// ════════════════════════════════════════════════════════════════
//  CITY SEARCH
// ════════════════════════════════════════════════════════════════
async function searchCity(query) {
  if (!query.trim()) return;
  const statusEl=document.getElementById('search-status');
  const resEl=document.getElementById('search-results');
  statusEl.textContent='Searching…'; resEl.classList.remove('show'); resEl.innerHTML='';
  try {
    const data=await (await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`,{headers:{'Accept-Language':'en'}})).json();
    statusEl.textContent='';
    if (!data.length) { statusEl.textContent='No results found'; return; }
    data.forEach(place=>{
      const item=document.createElement('div');
      item.className='search-result-item';
      const name=place.display_name.split(',').slice(0,2).join(',');
      const detail=place.display_name.split(',').slice(2,4).join(',').trim();
      item.innerHTML=`<div class="res-name">${escXml(name)}</div><div class="res-detail">${escXml(detail)}</div>`;
      item.addEventListener('mousedown',()=>{
        map.setView([parseFloat(place.lat),parseFloat(place.lon)],13);
        resEl.classList.remove('show'); resEl.innerHTML='';
        document.getElementById('search-input').value=place.display_name.split(',')[0];
        statusEl.textContent='';
      });
      resEl.appendChild(item);
    });
    resEl.classList.add('show');
  } catch(e) { statusEl.textContent='Search failed'; }
}

// Flies the map to the user's position via the browser Geolocation API.
// Only ever called from the locate button — the permission prompt must
// never appear on page load; searching by name stays the default flow.
function locateMe() {
  const statusEl=document.getElementById('search-status');
  const btn=document.getElementById('btn-locate');
  if (!('geolocation' in navigator)) { statusEl.textContent='Geolocation is not supported by this browser'; return; }
  if (!window.isSecureContext) { statusEl.textContent='Geolocation needs HTTPS (or localhost)'; return; }
  btn.classList.add('locating');
  statusEl.textContent='Locating…';
  navigator.geolocation.getCurrentPosition(async pos=>{
    btn.classList.remove('locating');
    statusEl.textContent='';
    const lat=pos.coords.latitude, lon=pos.coords.longitude;
    map.setView([lat,lon],13);
    // Fill the search box with the place name so "Use admin boundary"
    // works right away without retyping.
    try {
      const data=await (await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&zoom=10`,{headers:{'Accept-Language':'en'}})).json();
      const name=pickAreaName(data.address, data.display_name);
      if (name) document.getElementById('search-input').value=name;
    } catch(e) { /* map already moved — name lookup is a nicety */ }
  }, err=>{
    btn.classList.remove('locating');
    statusEl.textContent = err.code===err.PERMISSION_DENIED ? 'Location permission denied'
      : err.code===err.TIMEOUT ? 'Location request timed out'
      : 'Could not determine your location';
  }, {enableHighAccuracy:false, timeout:10000, maximumAge:60000});
}

// ════════════════════════════════════════════════════════════════
//  FAILED TILE OVERLAYS
// ════════════════════════════════════════════════════════════════
function showFailedTileOverlays(tiles, layerLabel) {
  if (!failedTileLayerGroup) return;
  tiles.forEach(tile => {
    const rect = L.rectangle(
      [[tile.s, tile.w], [tile.n, tile.e]],
      { color:'#bf3b1e', weight:1, fillColor:'#e03020', fillOpacity:0.25,
        dashArray:'4 3', className:'failed-tile-rect' }
    );
    rect.bindTooltip(
      `<span class="failed-tile-tooltip">Failed: ${layerLabel}</span>`,
      { permanent:false, direction:'top', className:'failed-tile-tooltip-wrap' }
    );
    failedTileLayerGroup.addLayer(rect);
  });
}

function clearFailedTileOverlays() {
  if (failedTileLayerGroup) failedTileLayerGroup.clearLayers();
}

function showFailedTileSummary(count) {
  const existing = document.getElementById('failed-tile-banner');
  if (existing) existing.remove();
  if (count === 0) return;
  const banner = document.createElement('div');
  banner.id = 'failed-tile-banner';
  banner.innerHTML =
    `<span>${count} tile${count>1?'s':''} failed — highlighted in red on map</span>` +
    `<button id="btn-retry-failed" class="failed-tile-retry-btn">Retry</button>` +
    `<button id="btn-dismiss-failed" class="failed-tile-dismiss-btn">✕</button>`;
  document.getElementById('status-bar').after(banner);
  document.getElementById('btn-dismiss-failed').addEventListener('click', () => {
    banner.remove(); clearFailedTileOverlays();
  });
  document.getElementById('btn-retry-failed').addEventListener('click', () => {
    banner.remove(); clearFailedTileOverlays(); doExport();
  });
}

// ════════════════════════════════════════════════════════════════
//  UI HELPERS
// ════════════════════════════════════════════════════════════════
function setStatus(msg,type){
  document.getElementById('status-text').textContent=msg;
  document.getElementById('status-bar').className=type||'';
}
function showToast(msg){const t=document.getElementById('map-toast');t.textContent=msg;t.classList.remove('hidden');}
function hideToast(){document.getElementById('map-toast').classList.add('hidden');}

// ── Granular run-progress view ────────────────────────────────────
// Drives the overlay checklist: a fixed list of stages (pending / active /
// done / failed), each with an optional meta counter and an active-only
// detail line, plus a bounded scrolling activity log with elapsed-time
// prefixes. Keeps setStatus in sync as a terse sidebar one-liner.
const progress = (() => {
  let t0 = 0, tick = null, stages = [], logLines = [];
  const MAX_LOG = 12;

  const fmtElapsed = () => {
    const s = Math.max(0, Math.round((Date.now() - t0) / 1000));
    return String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0');
  };

  const render = () => {
    const ul = document.getElementById('progress-stages');
    ul.innerHTML = stages.map(st => `
      <li class="stage ${st.state}" data-id="${st.id}">
        <div class="stage-row">
          <span class="stage-icon"></span>
          <span class="stage-label">${st.label}</span>
          <span class="stage-meta">${st.meta || ''}</span>
        </div>
        <div class="stage-detail">${st.detail || ''}</div>
      </li>
    `).join('');
  };

  const renderLog = () => {
    const box = document.getElementById('progress-log');
    box.innerHTML = logLines.map(l =>
      `<div class="log-line ${l.warn ? 'warn' : ''}"><span class="log-time">${l.t}</span>${l.msg}</div>`
    ).join('');
    box.scrollTop = box.scrollHeight;
  };

  return {
    begin(initialStages) {
      t0 = Date.now();
      stages = initialStages.map(s => ({ state: 'pending', meta: '', detail: '', ...s }));
      logLines = [];
      document.getElementById('progress-overlay').classList.add('show');
      document.getElementById('progress-overlay').classList.remove('fading');
      document.getElementById('progress-bar').style.width = '0%';
      document.getElementById('progress-pct').textContent = '0%';
      document.getElementById('progress-elapsed').textContent = '00:00';
      render();
      renderLog();
      if (tick) clearInterval(tick);
      tick = setInterval(() => {
        document.getElementById('progress-elapsed').textContent = fmtElapsed();
      }, 500);
    },
    addStage(stage, beforeId) {
      const s = { state: 'pending', meta: '', detail: '', ...stage };
      if (beforeId) {
        const i = stages.findIndex(x => x.id === beforeId);
        if (i >= 0) { stages.splice(i, 0, s); render(); return; }
      }
      stages.push(s);
      render();
    },
    removeStage(id) {
      stages = stages.filter(s => s.id !== id);
      render();
    },
    setStage(id, state, patch = {}) {
      const s = stages.find(x => x.id === id);
      if (!s) return;
      // Auto-close any stage we pass over by marking pending ones before this one as done.
      if (state === 'active') {
        for (const prev of stages) {
          if (prev.id === id) break;
          if (prev.state === 'active') prev.state = 'done';
        }
      }
      s.state = state;
      if ('meta' in patch) s.meta = patch.meta;
      if ('detail' in patch) s.detail = patch.detail;
      render();
      // Keep sidebar status in sync with whatever is active right now.
      if (state === 'active') setStatus(s.label + (patch.detail ? ' — ' + patch.detail : '…'), 'loading');
    },
    bar(pct) {
      const n = Math.max(0, Math.min(100, Math.round(pct)));
      document.getElementById('progress-bar').style.width = n + '%';
      document.getElementById('progress-pct').textContent = n + '%';
    },
    log(msg, opts = {}) {
      logLines.push({ t: fmtElapsed(), msg, warn: !!opts.warn });
      if (logLines.length > MAX_LOG) logLines = logLines.slice(-MAX_LOG);
      renderLog();
    },
    end() {
      if (tick) { clearInterval(tick); tick = null; }
      const overlay = document.getElementById('progress-overlay');
      // Hide immediately — we tried a CSS fade but the big innerHTML parse in
      // showPreview can block the main thread long enough that the timer
      // races with the following DOM reveal. Preview panel appearing covers
      // the transition visually.
      overlay.classList.remove('show');
      overlay.classList.remove('fading');
    },
  };
})();

// ════════════════════════════════════════════════════════════════
//  BOOT
// ════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded',()=>{
  initMap();
  renderLayers();
  renderLabelToggles();
  renderHistory();

  // Delete-all history button (with confirmation)
  document.getElementById('btn-history-clear').addEventListener('click', () => {
    if (!confirm('Delete all recent exports?')) return;
    localStorage.removeItem('mapexport_history');
    renderHistory();
  });

  // Sidebar scroll-fade: hide gradient when scrolled to bottom
  const sidebarInner = document.getElementById('sidebar-inner');
  const sidebarFade = document.getElementById('sidebar-fade');
  function updateSidebarFade() {
    const atBottom = sidebarInner.scrollTop + sidebarInner.clientHeight >= sidebarInner.scrollHeight - 8;
    const noScroll = sidebarInner.scrollHeight <= sidebarInner.clientHeight;
    sidebarFade.classList.toggle('hidden', atBottom || noScroll);
  }
  sidebarInner.addEventListener('scroll', updateSidebarFade);
  new ResizeObserver(updateSidebarFade).observe(sidebarInner.firstElementChild);
  updateSidebarFade();

  if (location.protocol==='file:') {
    const warn=document.createElement('div');
    warn.style.cssText='position:fixed;top:0;left:0;right:0;z-index:9999;background:#bf3b1e;color:#fff;font-family:Geist Mono,monospace;font-size:11px;padding:8px 16px;text-align:center;';
    warn.innerHTML='⚠ Local file — fetching requires a web server. Run: <strong>python3 -m http.server 8080</strong> then open <strong>http://localhost:8080/index.html</strong>';
    document.body.appendChild(warn);
    document.getElementById('btn-export').disabled=true;
  }

  // Search
  document.getElementById('btn-search').addEventListener('click',()=>searchCity(document.getElementById('search-input').value));
  document.getElementById('btn-locate').addEventListener('click',locateMe);
  document.getElementById('search-input').addEventListener('keydown',e=>{if(e.key==='Enter')searchCity(e.target.value);});
  document.getElementById('search-input').addEventListener('input',e=>{clearTimeout(searchTimeout);if(e.target.value.length>2)searchTimeout=setTimeout(()=>searchCity(e.target.value),500);});
  document.addEventListener('click',e=>{if(!e.target.closest('#search-wrap'))document.getElementById('search-results').classList.remove('show');if(!e.target.closest('.panel'))document.getElementById('boundary-results').classList.remove('show');});

  // Boundary button
  document.getElementById('btn-boundary').addEventListener('click',()=>{
    const q=document.getElementById('search-input').value;
    if (q.trim()) fetchBoundaries(q);
    else setStatus('Type a city name first, then click Use admin boundary','error');
  });

  document.getElementById('btn-draw').addEventListener('click',startDraw);
  document.getElementById('btn-export').addEventListener('click',doExport);
  document.getElementById('btn-dl').addEventListener('click',()=>{if(lastSvgString)triggerDownload(lastSvgString,lastSvgFilename);});
  document.getElementById('btn-preview-close').addEventListener('click',()=>document.getElementById('preview-pane').classList.remove('show'));

  // Help modal
  document.querySelectorAll('.help-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); showHelp(btn.dataset.help); });
  });
  document.getElementById('help-modal-close').addEventListener('click', hideHelp);
  document.getElementById('help-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('help-modal')) hideHelp();
  });

  // Mobile notice
  const mobileNotice = document.getElementById('mobile-notice');
  if (mobileNotice) {
    if (localStorage.getItem('mapexport_mobile_ok')) {
      mobileNotice.classList.add('dismissed');
    }
    document.getElementById('btn-mobile-ok').addEventListener('click', () => {
      mobileNotice.classList.add('dismissed');
      localStorage.setItem('mapexport_mobile_ok', '1');
    });
  }

  setTimeout(()=>hideToast(),4000);
});
