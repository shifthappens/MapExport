'use strict';

// ════════════════════════════════════════════════════════════════
//  HELP CONTENT
// ════════════════════════════════════════════════════════════════
const HELP = {
  search: {
    title: 'Find a city',
    content: `
      <p>Type a city, neighbourhood, or address and press <strong>Go</strong> to search. Select a result to fly the map to that location.</p>
      <p><strong>Use admin boundary</strong> draws the official administrative boundary of the matched area as a polygon on the map — useful as a visual reference frame.</p>
      <div class="tip">The boundary outline is shown on the map but is <em>not</em> included in the SVG export.</div>
    `
  },
  step1: {
    title: 'Select export area',
    content: `
      <p>Click <strong>Draw rectangle</strong>, then drag a box on the map to define what gets exported. The bounding box coordinates (N/S/E/W) are shown after drawing.</p>
      <p>You can redraw at any time — the new selection replaces the old one.</p>
      <ul>
        <li>Small areas (a few city blocks) export in seconds</li>
        <li>Large city areas can take 30+ seconds</li>
        <li>Very large areas may time out on the OSM API</li>
      </ul>
      <div class="tip">A warning appears automatically when the selected area is very large. Consider splitting large exports into smaller sections.</div>
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
      <div class="tip">Disable layers you don't need. Buildings in particular can add thousands of paths and slow down the export significantly.</div>
    `
  },
  step4: {
    title: 'Export options',
    content: `
      <p><strong>Format:</strong> SVG — compatible with Adobe Illustrator and Inkscape. All paths are editable vectors.</p>
      <p><strong>Print size:</strong> Sets the SVG canvas dimensions. A3 @ 300dpi is a good default for print work. Use Custom px for specific pixel dimensions.</p>
      <p><strong>Simplify:</strong> Reduces the number of points on paths. Higher values create smaller, simpler files — useful for large areas where fine detail isn't needed.</p>
      <p><strong>Labels on:</strong> Control which road types include name labels. More labels means a larger file and slower rendering in Illustrator.</p>
      <div class="tip">For large areas, try Simplify 3–4 and disable building labels to keep file sizes manageable.</div>
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
      service:       { fill:'#ffffff', casing:'#F4AFA7' },
      cycleway:      { fill:'#ffffff', casing:'#F4AFA7' },
      pedestrian:    { fill:'#ffffff', casing:'#F4AFA7' },
      footway:       { fill:'#ffffff', casing:'#F4AFA7' },
      path:          { fill:'#ffffff', casing:'#F4AFA7' },
      track:         { fill:'#ffffff', casing:'#F4AFA7' },
      steps:         { fill:'#ffffff', casing:'#F4AFA7' },
    },
    water: '#A4DBF3', waterOp: 1,
    park:  '#51A886', parkOp: 1,
    building: '#FEF6ED', buildingStroke: '#F4AFA7',
    labelColor: '#2a2a20',
  },
};

let activePreset = 'useit';

// ════════════════════════════════════════════════════════════════
//  PRINT SIZES  (width in px)
// ════════════════════════════════════════════════════════════════
const PRINT_SIZES = {
  a4_300: 3508,   // A4 landscape @ 300dpi
  a3_300: 4961,   // A3
  a2_300: 7016,   // A2
  a1_300: 9933,   // A1
};
// Physical long-edge widths in mm for each preset (used to set SVG width/height in mm
// so Illustrator/Inkscape open the document at the correct physical size rather than
// interpreting px as pt and producing a document ~4× too large)
const PRINT_PHYSICAL_MM = {
  a4_300: 297,   // A4 long edge
  a3_300: 420,   // A3 long edge
  a2_300: 594,   // A2 long edge
  a1_300: 841,   // A1 long edge
};

// ════════════════════════════════════════════════════════════════
//  LAYER REGISTRY
// ════════════════════════════════════════════════════════════════
const LAYER_REGISTRY = [
  { group: 'Natural', layers: [
    { id:'water_bodies', label:'Water bodies',     hint:'Lakes, reservoirs, ponds',    color:'#7eb8da', defaultOn:true,  type:'area', fillOpacity:0.85, strokeWidth:2,
      overpassQuery:(b)=>`wr["natural"~"water|bay"](${b});way["landuse"="reservoir"](${b});`,
      tagFilter:el=>el.type!=='node'&&((/water|bay/.test(el.tags?.natural||''))||el.tags?.landuse==='reservoir') },
    { id:'waterways',    label:'Waterways',         hint:'Rivers, canals, streams',     color:'#7eb8da', defaultOn:true,  type:'line', strokeWidth:12,
      overpassQuery:(b)=>`way["waterway"~"river|canal|stream|drain"]["name"](${b});`,
      tagFilter:el=>el.type==='way'&&/river|canal|stream|drain/.test(el.tags?.waterway||'')&&el.tags?.name },
    { id:'parks',        label:'Parks & green',     hint:'Named parks, forests, reserves',     color:'#b8d89a', defaultOn:true,  type:'area', fillOpacity:1, strokeWidth:0,
      overpassQuery:(b)=>`wr["leisure"~"park|nature_reserve|recreation_ground"]["name"](${b});wr["landuse"="forest"]["name"](${b});wr["natural"="wood"]["name"](${b});`,
      tagFilter:el=>{if(el.type==='node'||!el.tags?.name)return false;const n=el.tags.name.toLowerCase().trim();if(n.length<4)return false;if(/^(green|grass|groen|tuin|garden|garten|jardin|beplanting|planting|plantsoen|hedge|lawn|speeltuin|spielplatz|playground|parking|parkeerplaats|terrain|terrein|veld|field|berm|strip|border|rand|strook|perk|bloem|flower|rozenperk|heg|haag)/.test(n))return false;return /park|nature_reserve|recreation_ground/.test(el.tags?.leisure||'')||el.tags?.landuse==='forest'||el.tags?.natural==='wood';} },
  ]},
  { group: 'Built environment', layers: [
    { id:'buildings',    label:'Buildings',         hint:'All building footprints',     color:'#d4c8b4', defaultOn:true,  type:'area', fillOpacity:0.8, strokeWidth:1.5, strokeColor:'#b8a890',
      overpassQuery:(b)=>`wr["building"](${b});`,
      tagFilter:el=>el.type!=='node'&&!!el.tags?.building },
    { id:'roads',        label:'Roads & streets',   hint:'All roads, styled by type',   color:'#ffffff', defaultOn:true,  type:'roads',
      overpassQuery:(b)=>`way["highway"~"motorway|trunk|motorway_link|trunk_link|primary|secondary|primary_link|secondary_link|tertiary|tertiary_link|residential|unclassified|living_street|service|cycleway|footway|path|pedestrian|steps|track"](${b});`,
      tagFilter:el=>el.type==='way'&&/^(motorway|trunk|motorway_link|trunk_link|primary|secondary|primary_link|secondary_link|tertiary|tertiary_link|residential|unclassified|living_street|service|cycleway|footway|path|pedestrian|steps|track)$/.test(el.tags?.highway||'') },
    { id:'street_labels',label:'Street labels',     hint:'Road names by category',      color:'#222211', defaultOn:true,  type:'labels',
      overpassQuery:(b)=>`way["highway"~"motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|cycleway|pedestrian|footway"]["name"](${b});`,
      tagFilter:el=>el.type==='way'&&/^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|cycleway|pedestrian|footway)$/.test(el.tags?.highway||'')&&el.tags?.name },
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
  // respectively. leisure park|garden stays (parks' regex omits
  // `garden`), and place=suburb|neighbourhood nodes have no superseder.
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
  motorway:{fillW:66,casingW:6},     trunk:{fillW:60,casingW:6},
  motorway_link:{fillW:42,casingW:6}, trunk_link:{fillW:42,casingW:6},
  primary:{fillW:54,casingW:6},      primary_link:{fillW:36,casingW:6},
  secondary:{fillW:48,casingW:6},    secondary_link:{fillW:30,casingW:6},
  tertiary:{fillW:42,casingW:6},     tertiary_link:{fillW:27,casingW:6},
  residential:{fillW:30,casingW:6},  unclassified:{fillW:27,casingW:6},
  living_street:{fillW:24,casingW:6}, service:{fillW:18,casingW:6},
  cycleway:{fillW:12,casingW:6,dash:'6 3'},
  pedestrian:{fillW:27,casingW:6},
  footway:{fillW:9,casingW:6,dash:'4 2'},
  path:{fillW:7.5,casingW:6,dash:'4 2'},
  track:{fillW:9,casingW:6,dash:'5 3'},
  steps:{fillW:9,casingW:6,dash:'2 2'},
  _default:{fillW:18,casingW:6},
};
const ROAD_DRAW_ORDER=['track','path','footway','steps','cycleway','pedestrian','service','living_street','unclassified','residential','tertiary_link','tertiary','secondary_link','secondary','primary_link','primary','trunk_link','motorway_link','trunk','motorway'];
const TYPE_LABELS={motorway:'Motorways',trunk:'Trunk roads',motorway_link:'Motorway links',trunk_link:'Trunk links',primary:'Primary roads',primary_link:'Primary links',secondary:'Secondary roads',secondary_link:'Secondary links',tertiary:'Tertiary roads',tertiary_link:'Tertiary links',residential:'Residential streets',unclassified:'Unclassified roads',living_street:'Living streets',service:'Service roads',cycleway:'Cycleways',pedestrian:'Pedestrian areas',footway:'Footways',path:'Paths',track:'Tracks',steps:'Steps'};

// Label visibility per road category (controlled from UI)
const LABEL_VISIBILITY = { motorway:true, trunk:true, primary:true, secondary:true, tertiary:true, residential:false, cycleway:false, footway:false };

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
  window.addEventListener('resize', () => { setMapHeight(); map && map.invalidateSize(); });
  map = L.map('map', { zoomControl:true }).setView([51.5555, 5.0913], 13);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom:19, crossOrigin:true
  }).addTo(map);
  failedTileLayerGroup = L.layerGroup().addTo(map);
  setTimeout(() => map.invalidateSize(), 100);
  setTimeout(() => map.invalidateSize(), 500);
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
  const cats = ['motorway','primary','secondary','tertiary','residential','cycleway'];
  const fullNames = {motorway:'Motorway',primary:'Primary',secondary:'Secondary',tertiary:'Tertiary',residential:'Residential',cycleway:'Cycleway'};
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
  d.innerHTML=`<div style="color:var(--green);font-size:10px;margin-bottom:4px">✓ Area selected</div><div class="val">N ${north.toFixed(5)}</div><div class="val">S ${south.toFixed(5)}</div><div class="val">W ${west.toFixed(5)}</div><div class="val">E ${east.toFixed(5)}</div><div style="margin-top:4px;color:var(--muted);font-size:9.5px">≈ ${kmNS} × ${kmEW} km</div>`;

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
      item.innerHTML = `<div style="font-size:10px;color:var(--ink)">${name}</div><div style="font-size:9px;color:var(--muted)">${type} — click to use as export area</div>`;
      item.addEventListener('mousedown', () => {
        const [s,n,w,e] = place.boundingbox.map(parseFloat);
        bbox = {south:s, north:n, west:w, east:e};
        map.fitBounds([[s,w],[n,e]], {padding:[20,20]});
        if (bboxRect) map.removeLayer(bboxRect);
        bboxRect = L.rectangle([[s,w],[n,e]], {color:'#bf3b1e',weight:1.5,fillColor:'#bf3b1e',fillOpacity:0.07,dashArray:'5 3'}).addTo(map);
        updateBboxDisplay();
        document.getElementById('btn-export').disabled = false;
        setStatus('Boundary loaded — choose style and export','');
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
  return (layer._qHash = fnv1a36(layer.overpassQuery.toString()));
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
const OVERPASS_ENDPOINTS=['https://overpass.private.coffee/api/interpreter','https://overpass-api.de/api/interpreter'];
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
    const q = `[out:json][bbox:${tileBboxStr}][timeout:60];(${stmt});out body geom qt;`;
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
//  ROADS BUILDER
// ════════════════════════════════════════════════════════════════
function buildRoadsLayer(elements, pr, W) {
  const sf = getScaleFactor(W);
  const eps = getEps();
  const preset = PRESETS[activePreset];
  const byType = new Map();
  elements.forEach(el => {
    if (el.type!=='way'||!el.geometry?.length) return;
    const hw = el.tags?.highway||'_default';
    if (!byType.has(hw)) byType.set(hw,[]);
    byType.get(hw).push(el);
  });
  if (!byType.size) return '';
  const types=[...byType.keys()].sort((a,b)=>(ROAD_DRAW_ORDER.indexOf(a)||50)-(ROAD_DRAW_ORDER.indexOf(b)||50));
  // Two-pass rendering: casings first (wider, darker), then fills (narrower, lighter)
  // This creates proper bordered roads regardless of layer order
  let allCasings='', allFills='';
  const uid=makeUidGen();
  types.forEach(hw => {
    const ways=byType.get(hw);
    const w=ROAD_WIDTHS[hw]||ROAD_WIDTHS._default;
    const colors=preset.roads[hw]||{fill:'#ffffff',casing:'#cccccc'};
    const dash=w.dash?` stroke-dasharray="${w.dash}"`:'';
    const casingTotalW=((w.fillW+w.casingW)*sf).toFixed(2);
    const fillW=(w.fillW*sf).toFixed(2);
    const label=TYPE_LABELS[hw]||hw;
    let casings='', fills='';
    ways.forEach((el,i) => {
      const pts=el.geometry.map(g=>pr(g.lat,g.lon));
      const s=dpSimplify(pts, eps);
      if (s.length<2) return;
      let d=`M${s[0][0].toFixed(1)},${s[0][1].toFixed(1)}`;
      for(let j=1;j<s.length;j++) d+=`L${s[j][0].toFixed(1)},${s[j][1].toFixed(1)}`;
      const name=el.tags?.name||'', ref=el.tags?.ref||'';
      const pid=uid(name?safeName(name):ref?safeName(ref):`${hw}_${el.id||i}`);
      const lbl=escXml(name||ref||`${label} (${el.id||i})`);
      casings+=`\n      <path id="${pid}_casing" d="${d}" fill="none" stroke="${colors.casing}" stroke-width="${casingTotalW}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`;
      fills+=`\n      <path id="${pid}" inkscape:label="${lbl}" d="${d}" fill="none" stroke="${colors.fill}" stroke-width="${fillW}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`;
    });
    if (casings) allCasings+=casings;
    if (fills) allFills+=fills;
  });
  if (!allCasings&&!allFills) return '';
  return `  <g id="roads" inkscape:label="Roads &amp; streets" inkscape:groupmode="layer">\n  <g id="roads_casings" inkscape:label="Road casings">${allCasings}\n  </g>\n  <g id="roads_fills" inkscape:label="Road fills">${allFills}\n  </g>\n  </g>\n`;
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
    casings+=`\n      <path id="${pid}_casing" inkscape:label="${lbl}" d="${d}" fill="none" stroke="#555555" stroke-width="${(12*sf).toFixed(2)}" stroke-linecap="butt" stroke-linejoin="round"/>`;
    sleepers+=`\n      <path id="${pid}_sleepers" inkscape:label="${lbl}" d="${d}" fill="none" stroke="#eeeeee" stroke-width="${(6*sf).toFixed(2)}" stroke-linecap="butt" stroke-dasharray="${(30*sf).toFixed(1)} ${(24*sf).toFixed(1)}"/>`;
    rails+=`\n      <path id="${pid}" inkscape:label="${lbl}" d="${d}" fill="none" stroke="#333333" stroke-width="${(1.8*sf).toFixed(2)}" stroke-linecap="butt" opacity="0.5"/>`;
  });
  if (!casings) return '';
  return `  <g id="rail" inkscape:label="Railways" inkscape:groupmode="layer">\n    <g id="rail_casing">${casings}\n    </g>\n    <g id="rail_sleepers">${sleepers}\n    </g>\n    <g id="rail_tracks">${rails}\n    </g>\n  </g>\n`;
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
      casings+=`\n      <path id="${pid}_casing" inkscape:label="${lbl}" d="${d}" fill="none" stroke="white" stroke-width="${(24*sf).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>`;
      fills+=`\n      <path id="${pid}" inkscape:label="${lbl}" d="${d}" fill="none" stroke="${line.color}" stroke-width="${(16.5*sf).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.82"/>`;
    });
    if (!fills) return;
    const lid=safeName(key!=='_default'?key:'metro_default');
    const llbl=escXml(key!=='_default'?key:'Metro line');
    lineGroups+=`\n  <g id="metro_${lid}" inkscape:label="Metro — ${llbl}" inkscape:groupmode="layer">\n    <g id="metro_${lid}_casing">${casings}\n    </g>\n    <g id="metro_${lid}_fill">${fills}\n    </g>\n  </g>`;
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
    casings+=`\n      <path id="${pid}_casing" inkscape:label="${lbl}" d="${d}" fill="none" stroke="#555555" stroke-width="${(10.5*sf).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/>`;
    fills+=`\n      <path id="${pid}" inkscape:label="${lbl}" d="${d}" fill="none" stroke="#aaee44" stroke-width="${(6*sf).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`;
  });
  if (!casings) return '';
  return `  <g id="tram" inkscape:label="Tram &amp; light rail" inkscape:groupmode="layer">\n    <g id="tram_casing">${casings}\n    </g>\n    <g id="tram_fill">${fills}\n    </g>\n  </g>\n`;
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
function pathLength(pts){let l=0;for(let i=1;i<pts.length;i++)l+=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]);return l;}
function angleAtMid(pts){
  const total=pathLength(pts); let acc=0,mid=total*0.5;
  for(let i=1;i<pts.length;i++){
    const seg=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]);
    if(acc+seg>=mid){let a=Math.atan2(pts[i][1]-pts[i-1][1],pts[i][0]-pts[i-1][0])*180/Math.PI;if(a>90)a-=180;if(a<-90)a+=180;return a;}
    acc+=seg;
  } return 0;
}
function makeCollisionGrid(){
  const placed=[];
  return {
    overlaps(cx,cy,w,h,pad=4){const hw=w/2+pad,hh=h/2+pad;for(const r of placed)if(Math.abs(cx-r.cx)<hw+r.hw&&Math.abs(cy-r.cy)<hh+r.hh)return true;return false;},
    add(cx,cy,w,h,pad=4){placed.push({cx,cy,hw:w/2+pad,hh:h/2+pad});}
  };
}

function buildLabelsLayer(elements, pr, W, H) {
  const sf=getScaleFactor(W);
  const preset=PRESETS[activePreset];
  const collision=makeCollisionGrid();
  const defs=[],texts=[];
  let pid=0;
  const sorted=[...elements].sort((a,b)=>{
    const order=['motorway','trunk','primary','secondary','tertiary','residential'];
    return (order.indexOf(a.tags?.highway||'')||99)-(order.indexOf(b.tags?.highway||'')||99);
  });
  const placedNames=new Map();

  // Pre-pass: group all roundabout segments by name so that a roundabout
  // split into many short arcs (like Sint-Annaplein) still gets one label
  // placed at the collective centroid of all its segments.
  const roundaboutHandled=new Set();
  const roundaboutGroups=new Map(); // name → {hw, elements:[]}
  sorted.forEach(el=>{
    if (el.type!=='way'||!el.geometry?.length||!el.tags?.name) return;
    if (el.tags?.junction!=='roundabout') return;
    const name=el.tags.name, hw=el.tags.highway||'_default';
    if (!roundaboutGroups.has(name)) roundaboutGroups.set(name,{hw,elements:[]});
    roundaboutGroups.get(name).elements.push(el);
  });
  roundaboutGroups.forEach(({hw,elements},name)=>{
    elements.forEach(el=>roundaboutHandled.add(el.id));
    if (LABEL_VISIBILITY.hasOwnProperty(hw)&&!LABEL_VISIBILITY[hw]) return;
    const style=LABEL_STYLES[hw]||LABEL_STYLES._default;
    const roadW=ROAD_WIDTHS[hw]||ROAD_WIDTHS._default;
    const maxFontSize=roadW.fillW*sf*0.75;
    const sz=Math.min(style.size*sf,maxFontSize);
    if (sz<4) return;
    const displayName=name.toUpperCase();
    const ls=sz*0.08;
    const textW=approxTextWidth(displayName,sz,ls);
    const allPts=elements.flatMap(el=>el.geometry.map(g=>pr(g.lat,g.lon)));
    const cx=allPts.reduce((s,p)=>s+p[0],0)/allPts.length;
    const cy=allPts.reduce((s,p)=>s+p[1],0)/allPts.length;
    const lastX=placedNames.get(name);
    if (lastX!==undefined&&Math.abs(cx-lastX)<style.spacing*sf) return;
    const lh=sz*1.4;
    if (collision.overlaps(cx,cy,textW,lh)) return;
    collision.add(cx,cy,textW,lh);
    placedNames.set(name,cx);
    const textId=`lbl_${safeName(name)}_${pid++}`;
    const attrs=`font-family="Arial,Helvetica,sans-serif" font-size="${sz.toFixed(1)}" font-weight="${style.weight}" text-anchor="middle" dominant-baseline="central" letter-spacing="${ls.toFixed(1)}"`;
    texts.push(`<text id="${textId}" inkscape:label="${escXml(name)}" ${attrs} x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" fill="${preset.labelColor}">${escXml(displayName)}</text>`);
  });

  sorted.forEach(el=>{
    if (el.type!=='way'||!el.geometry?.length||!el.tags?.name) return;
    if (roundaboutHandled.has(el.id)) return; // already handled in pre-pass
    const name=el.tags.name, hw=el.tags.highway||'_default';
    // Check label visibility toggle
    if (LABEL_VISIBILITY.hasOwnProperty(hw) && !LABEL_VISIBILITY[hw]) return;
    const style=LABEL_STYLES[hw]||LABEL_STYLES._default;
    const roadW=ROAD_WIDTHS[hw]||ROAD_WIDTHS._default;
    const maxFontSize=roadW.fillW*sf*0.75;
    const sz=Math.min(style.size*sf, maxFontSize);
    if (sz<4) return;
    const displayName=name.toUpperCase();
    const ls=sz*0.08;
    const pts=el.geometry.map(g=>pr(g.lat,g.lon));
    const textW=approxTextWidth(displayName,sz,ls);

    // Closed-loop named areas (squares, plazas): place a centered label at centroid.
    const isClosed = pts.length>=3 &&
      Math.hypot(pts[0][0]-pts[pts.length-1][0], pts[0][1]-pts[pts.length-1][1]) < 2;
    const isArea = isClosed && (hw==='pedestrian' || el.tags?.area==='yes');

    if (isArea) {
      const cx=pts.reduce((s,p)=>s+p[0],0)/pts.length;
      const cy=pts.reduce((s,p)=>s+p[1],0)/pts.length;
      const lastX=placedNames.get(name);
      if (lastX!==undefined&&Math.abs(cx-lastX)<style.spacing*sf) return;
      const lh=sz*1.4;
      if (collision.overlaps(cx,cy,textW,lh)) return;
      collision.add(cx,cy,textW,lh);
      placedNames.set(name,cx);
      const textId=`lbl_${safeName(name)}_${pid++}`;
      const attrs=`font-family="Arial,Helvetica,sans-serif" font-size="${sz.toFixed(1)}" font-weight="${style.weight}" text-anchor="middle" dominant-baseline="central" letter-spacing="${ls.toFixed(1)}"`;
      texts.push(`<text id="${textId}" inkscape:label="${escXml(name)}" ${attrs} x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" fill="${preset.labelColor}">${escXml(displayName)}</text>`);
      return;
    }

    const len=pathLength(pts);
    if (len<style.minLen*sf||len<textW*1.05) return;
    let pathPts=[...pts];
    if (pathPts.length>=2&&pathPts[0][0]>pathPts[pathPts.length-1][0]) pathPts.reverse();
    const mid=pathPts[Math.floor(pathPts.length/2)];
    const cx=mid[0],cy=mid[1];
    const lastX=placedNames.get(name);
    if (lastX!==undefined&&Math.abs(cx-lastX)<style.spacing*sf) return;
    const angle=angleAtMid(pathPts);
    const lh=sz*1.4, pad=Math.abs(Math.sin(angle*Math.PI/180))*lh;
    if (collision.overlaps(cx,cy,textW+pad,lh+pad)) return;
    collision.add(cx,cy,textW+pad,lh+pad);
    placedNames.set(name,cx);
    const pathId=`lp${pid++}`;
    const textId=`lbl_${safeName(name)}_${pid}`;
    let d=`M${pathPts[0][0].toFixed(1)},${pathPts[0][1].toFixed(1)}`;
    for(let i=1;i<pathPts.length;i++) d+=`L${pathPts[i][0].toFixed(1)},${pathPts[i][1].toFixed(1)}`;
    defs.push(`<path id="${pathId}" inkscape:label="${escXml(name)} (path)" d="${d}"/>`);
    const offset=Math.max(0,(len-textW)/2);
    const offsetPct=((offset/len)*100).toFixed(1);
    const attrs=`font-family="Arial,Helvetica,sans-serif" font-size="${sz.toFixed(1)}" font-weight="${style.weight}" text-anchor="start" dominant-baseline="central" letter-spacing="${ls.toFixed(1)}"`;
    texts.push(`<text id="${textId}" inkscape:label="${escXml(name)}" ${attrs} fill="${preset.labelColor}"><textPath xlink:href="#${pathId}" startOffset="${offsetPct}%">${escXml(displayName)}</textPath></text>`);
  });
  if (!defs.length) return '';
  return `  <g id="street_labels" inkscape:label="Street labels" inkscape:groupmode="layer">\n    <defs>${defs.join('')}</defs>\n    <g id="label_text">${texts.join('')}</g>\n  </g>\n`;
}

// ════════════════════════════════════════════════════════════════
//  FEATURE LABELS — water bodies, parks, neighbourhoods
// ════════════════════════════════════════════════════════════════
function buildFeatureLabelsLayer(elements, pr, W, H) {
  const sf=getScaleFactor(W);
  const preset=PRESETS[activePreset];
  const collision=makeCollisionGrid();
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

    const tw=approxTextWidth(name,sz), th=sz*1.4;
    if (collision.overlaps(cx,cy,tw,th,6)) return;
    collision.add(cx,cy,tw,th,6);

    const haloSz=(sz*0.15+1.5).toFixed(1);
    const italicAttr=waterway?'font-style="italic"':'';
    const fid=`feat_${safeName(name)}`;
    const eName=escXml(name);
    labels+=`<text id="${fid}_halo" inkscape:label="${eName} (halo)" x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" font-family="Arial,Helvetica,sans-serif" font-size="${sz.toFixed(1)}" font-weight="${weight}" ${italicAttr} text-anchor="middle" dominant-baseline="middle" stroke="white" stroke-width="${haloSz}" stroke-linejoin="round" fill="none" paint-order="stroke">${eName}</text>`;
    labels+=`<text id="${fid}" inkscape:label="${eName}" x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" font-family="Arial,Helvetica,sans-serif" font-size="${sz.toFixed(1)}" font-weight="${weight}" ${italicAttr} text-anchor="middle" dominant-baseline="middle" fill="${color}" opacity="0.9">${eName}</text>`;
  });

  if (!labels) return '';
  return `  <g id="water_labels" inkscape:label="Water &amp; park names" inkscape:groupmode="layer">\n    ${labels}\n  </g>\n`;
}

// ════════════════════════════════════════════════════════════════
//  SIMPLIFICATION EPSILON from slider
// ════════════════════════════════════════════════════════════════
function getEps() {
  const v=parseInt(document.getElementById('simplify-slider')?.value||2);
  return [0.3,0.6,1.0,1.6,2.4][v-1];
}

// ════════════════════════════════════════════════════════════════
//  CITY BLOCKS (ClipperLib: buffer roads → union → subtract from bbox)
// ════════════════════════════════════════════════════════════════

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

self.onmessage = function(e) {
  const { lines, areas, waterPolys, W, H } = e.data;
  const CLP = ClipperLib;

  self.postMessage({ type:'progress', msg:'Buffering roads…', pct:10 });

  // Buffer lines by width group
  const widthGroups = new Map();
  for (const { pts, halfW } of lines) {
    if (!widthGroups.has(halfW)) widthGroups.set(halfW, []);
    widthGroups.get(halfW).push(pts.map(([x,y]) => ({ X: Math.round(x), Y: Math.round(y) })));
  }

  const allVoids = [];

  // Offset each width group in batches
  let groupsDone = 0, totalGroups = widthGroups.size;
  for (const [halfW, paths] of widthGroups) {
    const BATCH = 300;
    for (let i = 0; i < paths.length; i += BATCH) {
      const co = new CLP.ClipperOffset();
      co.ArcTolerance = halfW * 2; // very coarse arcs = fast
      co.MiterLimit = 2;
      const batch = paths.slice(i, i + BATCH);
      for (const p of batch) {
        co.AddPath(p, CLP.JoinType.jtSquare, CLP.EndType.etOpenSquare);
      }
      const buf = new CLP.Paths();
      co.Execute(buf, halfW);
      for (const bp of buf) {
        const cl = CLP.Clipper.CleanPolygon(bp, 4);
        if (cl && cl.length >= 3) allVoids.push(cl);
      }
    }
    groupsDone++;
    self.postMessage({ type:'progress', msg:'Buffering roads…', pct: 10 + Math.round(30 * groupsDone / totalGroups) });
  }

  // Add area voids (parks, water) — already closed polygons
  for (const { pts } of areas) {
    const path = pts.map(([x,y]) => ({ X: Math.round(x), Y: Math.round(y) }));
    if (path.length >= 3) allVoids.push(path);
  }

  self.postMessage({ type:'progress', msg:'Merging ' + allVoids.length + ' shapes…', pct:45 });

  // Union all voids
  const uc = new CLP.Clipper();
  for (const vp of allVoids) {
    uc.AddPath(vp, CLP.PolyType.ptSubject, true);
  }
  const voidUnion = new CLP.Paths();
  uc.Execute(CLP.ClipType.ctUnion, voidUnion, CLP.PolyFillType.pftNonZero, CLP.PolyFillType.pftNonZero);

  self.postMessage({ type:'progress', msg:'Simplifying…', pct:65 });

  // Clean the union result
  const voidClean = [];
  for (const p of voidUnion) {
    const cl = CLP.Clipper.CleanPolygon(p, 6);
    if (cl && cl.length >= 3) voidClean.push(cl);
  }

  self.postMessage({ type:'progress', msg:'Cutting blocks…', pct:75 });

  // Diff: bbox minus voids = blocks
  const bbox = [
    { X:0, Y:0 }, { X: Math.round(W), Y:0 },
    { X: Math.round(W), Y: Math.round(H) }, { X:0, Y: Math.round(H) }
  ];
  const dc = new CLP.Clipper();
  dc.AddPath(bbox, CLP.PolyType.ptSubject, true);
  for (const vp of voidClean) {
    dc.AddPath(vp, CLP.PolyType.ptClip, true);
  }
  const tree = new CLP.PolyTree();
  dc.Execute(CLP.ClipType.ctDifference, tree, CLP.PolyFillType.pftNonZero, CLP.PolyFillType.pftNonZero);

  self.postMessage({ type:'progress', msg:'Tracing blocks…', pct:85 });

  // Collect raw block contours from PolyTree
  const rawBlocks = []; // { outer: ClipperPath, holes: [ClipperPath] }
  const minArea = 400;

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

  function toD(path) {
    const pts = path.map(p => [p.X, p.Y]);
    const s = dpS(pts, 2.0);
    if (s.length < 3) return '';
    let d = 'M' + s[0][0].toFixed(0) + ',' + s[0][1].toFixed(0);
    for (let i = 1; i < s.length; i++) d += 'L' + s[i][0].toFixed(0) + ',' + s[i][1].toFixed(0);
    return d + 'Z';
  }

  for (const raw of rawBlocks) {
    // Skip blocks whose centroid is inside a water body
    const c = raw.outer;
    let cx = 0, cy = 0;
    for (const p of c) { cx += p.X; cy += p.Y; }
    cx /= c.length; cy /= c.length;
    let inWater = false;
    if (waterPolys && waterPolys.length) {
      for (const wp of waterPolys) {
        if (pointInPoly(cx, cy, wp)) { inWater = true; break; }
      }
    }
    if (inWater) continue;

    const outer = toD(raw.outer);
    if (!outer) continue;
    const holes = raw.holes.map(h => toD(h)).filter(d => d);
    blocks.push({ outer, holes });
  }

  self.postMessage({ type:'done', blocks });
};
`;

let blockWorkerUrl = null;
function getBlockWorkerUrl() {
  if (!blockWorkerUrl) {
    blockWorkerUrl = URL.createObjectURL(new Blob([BLOCK_WORKER_SRC], { type: 'application/javascript' }));
  }
  return blockWorkerUrl;
}

// Prepare geometry data for the worker (project + simplify on main thread)
function prepareBlockData(allResults, pr, W, H) {
  const sf = getScaleFactor(W);
  const eps = 8.0; // aggressive simplification — blocks are simple shapes

  const BLOCK_ROADS = new Set(['motorway','trunk','primary','secondary','tertiary',
    'residential','unclassified','living_street','pedestrian',
    'motorway_link','trunk_link','primary_link','secondary_link','tertiary_link']);

  const lines = []; // { pts: [[x,y],...], halfW }
  const areas = []; // { pts: [[x,y],...] }
  const waterPolys = []; // water body polygons for filtering blocks inside water

  for (const { layer, data } of allResults) {
    if (!data?.elements?.length) continue;

    // Roads → lines with half-width
    if (layer.type === 'roads') {
      for (const el of data.elements) {
        if (el.type !== 'way' || !el.geometry?.length || el.geometry.length < 2) continue;
        const hw = el.tags?.highway || '_default';
        if (!BLOCK_ROADS.has(hw)) continue;
        const w = ROAD_WIDTHS[hw] || ROAD_WIDTHS._default;
        const halfW = Math.round((w.fillW + w.casingW) * sf / 2);
        const pts = dpSimplify(el.geometry.map(g => pr(g.lat, g.lon)), eps);
        if (pts.length >= 2) lines.push({ pts, halfW });
      }
    }

    // Parks & water bodies → closed areas
    if (layer.id === 'parks' || layer.id === 'water_bodies') {
      for (const el of data.elements) {
        const geoms = el.type === 'way' ? [el.geometry] :
          el.type === 'relation' && el.members ? el.members.map(m => m.geometry) : [];
        for (const geom of geoms) {
          if (!geom || geom.length < 3) continue;
          const pts = dpSimplify(geom.map(g => pr(g.lat, g.lon)), eps);
          if (pts.length >= 3) {
            areas.push({ pts });
            if (layer.id === 'water_bodies') waterPolys.push(pts);
          }
        }
      }
    }

    // Waterways → lines
    if (layer.id === 'waterways') {
      for (const el of data.elements) {
        if (el.type !== 'way' || !el.geometry?.length || el.geometry.length < 2) continue;
        const halfW = Math.round(12 * sf / 2);
        const pts = dpSimplify(el.geometry.map(g => pr(g.lat, g.lon)), eps);
        if (pts.length >= 2) lines.push({ pts, halfW });
      }
    }

    // Rail/tram/metro → lines
    if (layer.type === 'rail' || layer.type === 'tram' || layer.type === 'metro') {
      for (const el of data.elements) {
        if (el.type !== 'way' || !el.geometry?.length || el.geometry.length < 2) continue;
        const halfW = Math.round(20 * sf / 2);
        const pts = dpSimplify(el.geometry.map(g => pr(g.lat, g.lon)), eps);
        if (pts.length >= 2) lines.push({ pts, halfW });
      }
    }
  }

  return { lines, areas, waterPolys, W, H };
}

// Run block computation in Web Worker, returns promise of block array
function computeBlocksAsync(allResults, pr, W, H, onProgress) {
  return new Promise((resolve, reject) => {
    const data = prepareBlockData(allResults, pr, W, H);
    if (!data.lines.length && !data.areas.length) { resolve([]); return; }

    const worker = new Worker(getBlockWorkerUrl());
    worker.onmessage = function(e) {
      if (e.data.type === 'progress' && onProgress) {
        onProgress(e.data.msg, e.data.pct);
      }
      if (e.data.type === 'done') {
        worker.terminate();
        resolve(e.data.blocks);
      }
    };
    worker.onerror = function(err) {
      worker.terminate();
      console.error('Block worker error:', err);
      resolve([]); // fail gracefully — skip blocks
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
  const { b, pr, W, H, preset, EPS, precomputedBlocks } = ctx;
  if (!data?.elements?.length) return '';
  const elements = data.elements.filter(el => elementInBbox(el, b));
  if (!elements.length) return '';
  if (layer.type==='roads')          return buildRoadsLayer(elements,pr,W);
  if (layer.type==='rail')           return buildRailLayer(elements,pr,W);
  if (layer.type==='metro')          return buildMetroLayer(elements,pr,W);
  if (layer.type==='tram')           return buildTramLayer(elements,pr,W);
  if (layer.type==='labels')         return buildLabelsLayer(elements,pr,W,H);
  if (layer.type==='feature_labels') return buildFeatureLabelsLayer(elements,pr,W,H);

  const large=['landuse_residential','landuse_industrial','water_bodies','parks'];
  const eps=layer.type==='line'?EPS.line:large.includes(layer.id)?EPS.area_large:EPS.area;
  const isArea=layer.type==='area';
  let allD='', circles='';

  let fillColor=layer.color, strokeColor=layer.strokeColor||layer.color;
  if (layer.id==='water_bodies'||layer.id==='waterways') { fillColor=preset.water; strokeColor=preset.water; }
  if (layer.id==='parks') {
    fillColor=preset.park;
    let content = '';
    const uid = makeUidGen();
    elements.forEach(el => {
      const name = el.tags?.name;
      if (!name) return;
      let d = '';
      if (el.type === 'way') d = geomToPathD(el.geometry, pr, EPS.area_large, true);
      if (el.type === 'relation' && el.members) {
        el.members.forEach(m => { d += geomToPathD(m.geometry, pr, EPS.area_large, true) + ' '; });
        d = d.trim();
      }
      if (!d) return;
      const parkId = uid(`park_${safeName(name)}`);
      content += `<path id="${parkId}" inkscape:label="${escXml(name)}" d="${d}" fill="${fillColor}" fill-rule="evenodd" stroke="none"/>`;
    });
    if (!content) return '';
    return `  <g id="${layer.id}" inkscape:label="${escXml(layer.label)}" inkscape:groupmode="layer">\n    ${content}\n  </g>\n`;
  }
  if (layer.id==='buildings' && precomputedBlocks && precomputedBlocks.length) {
    fillColor=preset.building; strokeColor=preset.buildingStroke;
    const fo = layer.fillOpacity ?? 0.8;
    let content = '';
    for (let i = 0; i < precomputedBlocks.length; i++) {
      const bl = precomputedBlocks[i];
      const pathD = bl.outer + (bl.holes.length ? ' ' + bl.holes.join(' ') : '');
      content += `<path id="block_${i}" d="${pathD}" fill="${fillColor}" fill-opacity="${fo}" fill-rule="evenodd" stroke="none"/>`;
    }
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
    if (el.type==='relation'&&el.members) el.members.forEach(m=>{allD+=geomToPathD(m.geometry,pr,eps,isArea)+' ';});
  });

  let content='';
  const d=allD.trim();
  if (d) {
    if (isArea) {
      const fo=layer.id==='water_bodies'?preset.waterOp:layer.id==='parks'?preset.parkOp:(layer.fillOpacity??0.7);
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

const LAYER_ORDER = ['landuse_residential','landuse_industrial','water_bodies','waterways','buildings','parks','roads','rail','tram','metro','transit_stops','poi_amenity','poi_tourism','poi_shops','street_labels','water_labels'];

function buildSVGContext(b, W, precomputedBlocks) {
  const { pr, H } = makeProjector(b, W);
  return {
    b, pr, W, H,
    preset: PRESETS[activePreset],
    EPS: { area_large: getEps()*1.4, area: getEps()*0.9, line: getEps()*0.6 },
    precomputedBlocks,
  };
}

function wrapSVG(layersSVG, ctx, physicalWidthMm) {
  const { b, W, H, preset } = ctx;
  const date = new Date().toISOString().slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     xmlns:dc="http://purl.org/dc/elements/1.1/"
     xmlns:cc="http://creativecommons.org/ns#"
     xmlns:xlink="http://www.w3.org/1999/xlink"
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

function sortedResults(results) {
  return [...results].sort((a,z) => (LAYER_ORDER.indexOf(a.layer.id) || 999) - (LAYER_ORDER.indexOf(z.layer.id) || 999));
}

function buildSVG(results, b, W, physicalWidthMm=null, precomputedBlocks=null) {
  const ctx = buildSVGContext(b, W, precomputedBlocks);
  let layersSVG = '';
  for (const r of sortedResults(results)) layersSVG += renderLayerSVG(r, ctx);
  return wrapSVG(layersSVG, ctx, physicalWidthMm);
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
    const filtered = lastResults.filter(r => selected.has(r.layer.id));
    if (!filtered.length) return;

    // Compute blocks for preview if buildings layer is active
    let blocks = null;
    if (selected.has('buildings')) {
      const {pr,H} = makeProjector(bbox, PREVIEW_W);
      blocks = await computeBlocksAsync(filtered, pr, PREVIEW_W, H);
    }

    const svg = buildSVG(filtered, bbox, PREVIEW_W, null, blocks);
    const wrap = document.getElementById('preview-svg-wrap');
    wrap.innerHTML = svg;
    document.getElementById('preview-pane').classList.add('show');
    lastSvgString = svg;
  }, 120);
}


function getExportWidth() {
  const size=document.getElementById('print-size').value;
  if (size==='custom') return parseInt(document.getElementById('svg-width').value)||3508;
  return PRINT_SIZES[size]||3508;
}

function getAllSelectedLayers() {
  const layers=[];
  LAYER_REGISTRY.forEach(g=>g.layers.forEach(l=>{ if(document.getElementById('lyr-'+l.id)?.checked) layers.push(l); }));
  return layers;
}

async function doExport() {
  if (!bbox) return;
  const selected=getAllSelectedLayers();
  if (!selected.length) { setStatus('Select at least one layer','error'); return; }
  const W=getExportWidth();
  const physicalWidthMm=PRINT_PHYSICAL_MM[document.getElementById('print-size').value]||null;
  const bboxStr=`${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const date=new Date().toISOString().slice(0,10);
  const filename=`map-${activePreset}-${date}.svg`;

  document.getElementById('btn-export').disabled=true;
  clearFailedTileOverlays();
  adaptiveTileDelay=350;

  const hasBuildingsLayer = selected.some(l => l.id === 'buildings');
  const stages = [
    { id: 'plan_tiles',     label: 'Plan tiles' },
    { id: 'check_cache',    label: 'Check cache' },
    { id: 'fetch_tiles',    label: 'Fetch tiles' },
    ...(hasBuildingsLayer ? [{ id: 'compute_blocks', label: 'Compute city blocks' }] : []),
    { id: 'render_svg',     label: 'Render SVG' },
    { id: 'finalize',       label: 'Finalize' },
  ];
  progress.begin(stages);
  progress.log(`Export: ${selected.length} layer${selected.length>1?'s':''}, ${W}px wide, style “${activePreset}”`);

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
  for (const tile of tiles) for (const layer of selected) allKeys.push(tileCacheKey(layer,tile));
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

      const cacheReads = selected.map(async layer => {
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

      const combined = await fetchTileCombined(uncachedLayers, tile, endpoint, onFetchProgress);
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
  const failCount=results.filter(r=>!r.data.elements.length).length;
  if (failCount===selected.length) {
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

  // Stage 4 — compute city blocks (only if buildings layer is selected)
  let precomputedBlocks = null;
  if (hasBuildingsLayer) {
    progress.setStage('compute_blocks', 'active', { detail: 'Starting worker…' });
    const {pr,H}=makeProjector(bbox,W);
    let lastBlockMsg = '';
    precomputedBlocks = await computeBlocksAsync(results, pr, W, H, (msg, pct) => {
      progress.setStage('compute_blocks', 'active', { detail: msg });
      progress.bar(70 + Math.round(pct * 0.2));
      if (msg !== lastBlockMsg) { progress.log(`Blocks: ${msg}`); lastBlockMsg = msg; }
    });
    progress.setStage('compute_blocks', 'done', { meta: `${precomputedBlocks?.length||0} blocks`, detail: '' });
    progress.bar(90);
  }

  // Stage 5 — render SVG, per-layer
  progress.setStage('render_svg', 'active', { detail: 'Preparing…' });
  const ctx = buildSVGContext(bbox, W, precomputedBlocks);
  const ordered = sortedResults(results);
  let layersSVG = '';
  const renderBase = hasBuildingsLayer ? 90 : 70;
  const renderSpan = 100 - renderBase - 2; // leave 2% for finalize
  for (let i = 0; i < ordered.length; i++) {
    const r = ordered[i];
    const n = r.data?.elements?.length || 0;
    progress.setStage('render_svg', 'active', {
      meta: `${i+1}/${ordered.length}`,
      detail: `${r.layer.label} (${n.toLocaleString()} elements)`,
    });
    layersSVG += renderLayerSVG(r, ctx);
    progress.bar(renderBase + Math.round(((i+1)/ordered.length) * renderSpan));
    // Yield to the event loop so the overlay actually repaints between layers.
    if (i < ordered.length - 1) await new Promise(r => setTimeout(r, 0));
  }
  progress.setStage('render_svg', 'done', { meta: `${ordered.length} layers`, detail: '' });

  // Stage 6 — finalize
  progress.setStage('finalize', 'active', { detail: 'Wrapping SVG…' });
  await new Promise(r=>setTimeout(r,0));
  const svg = wrapSVG(layersSVG, ctx, physicalWidthMm);
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
  saveHistory(bbox, activePreset, W, filename, actualMB, totalElements);
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
function saveHistory(b, preset, W, filename, mb, elements) {
  try {
    const key='mapexport_history';
    const existing=JSON.parse(localStorage.getItem(key)||'[]');
    const entry={
      id: Date.now(),
      date: new Date().toLocaleDateString(),
      label: filename.replace('.svg',''),
      bbox: b,
      preset, W, mb, elements,
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
      div.innerHTML=`<div><div class="hi-label">${entry.date} · ${entry.preset}</div><div class="hi-meta">${kmNS}×${kmEW}km · ${entry.W}px · ${entry.mb}MB</div></div><button class="hi-del" title="Remove">✕</button>`;
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
        // Restore preset
        activePreset=PRESETS[entry.preset]?entry.preset:'useit';
        document.querySelectorAll('.preset-btn').forEach(b=>{b.classList.toggle('active',b.dataset.preset===activePreset);});
        setStatus(`Loaded: ${entry.date} export`,'success');
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
      item.innerHTML=`<div class="res-name">${name}</div><div class="res-detail">${detail}</div>`;
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

  // Print size
  document.getElementById('print-size').addEventListener('change', e=>{
    document.getElementById('custom-width-row').style.display=e.target.value==='custom'?'flex':'none';
  });

  // Simplify slider
  const slider=document.getElementById('simplify-slider');
  const sliderLabels=['Fine','Balanced','Medium','Rough','Coarse'];
  slider.addEventListener('input',()=>{ document.getElementById('simplify-val').textContent=sliderLabels[slider.value-1]; });
  document.getElementById('simplify-val').textContent=sliderLabels[slider.value-1];

  // Search
  document.getElementById('btn-search').addEventListener('click',()=>searchCity(document.getElementById('search-input').value));
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

  setTimeout(()=>hideToast(),4000);
});
