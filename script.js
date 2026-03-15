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
    swatches: ['#f5f0e1','#ffffff','#7eb8da','#b8d89a'],
    bg: '#f5f0e1',
    roads: {
      motorway:      { fill:'#ffffff', casing:'#b8b4a8' },
      trunk:         { fill:'#ffffff', casing:'#b8b4a8' },
      motorway_link: { fill:'#ffffff', casing:'#b8b4a8' },
      trunk_link:    { fill:'#ffffff', casing:'#b8b4a8' },
      primary:       { fill:'#ffffff', casing:'#c8c4b8' },
      primary_link:  { fill:'#ffffff', casing:'#c8c4b8' },
      secondary:     { fill:'#ffffff', casing:'#c8c4b8' },
      secondary_link:{ fill:'#ffffff', casing:'#c8c4b8' },
      tertiary:      { fill:'#ffffff', casing:'#d0ccc0' },
      tertiary_link: { fill:'#ffffff', casing:'#d0ccc0' },
      residential:   { fill:'#ffffff', casing:'#d0ccc0' },
      unclassified:  { fill:'#ffffff', casing:'#d0ccc0' },
      living_street: { fill:'#ffffff', casing:'#d8d4c8' },
      service:       { fill:'#ffffff', casing:'#d8d4c8' },
      cycleway:      { fill:'#e8e4d8', casing:'#c8c4b8' },
      pedestrian:    { fill:'#ffffff', casing:'#d0ccc0' },
      footway:       { fill:'#e8e4d8', casing:'#d0ccc0' },
      path:          { fill:'#e8e4d8', casing:'#d0ccc0' },
      track:         { fill:'#e8e4d8', casing:'#d0ccc0' },
      steps:         { fill:'#e0dcd0', casing:'#c8c4b8' },
    },
    water: '#7eb8da', waterOp: 0.85,
    park:  '#b8d89a', parkOp: 0.6,
    building: '#d4c8b4', buildingStroke: '#b8a890',
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
      overpassQuery:(b)=>`way["natural"~"water|bay"](${b});relation["natural"="water"](${b});way["landuse"="reservoir"](${b});` },
    { id:'waterways',    label:'Waterways',         hint:'Rivers, canals, streams',     color:'#7eb8da', defaultOn:true,  type:'line', strokeWidth:12,
      overpassQuery:(b)=>`way["waterway"~"river|canal|stream|drain"]["name"](${b});` },
    { id:'parks',        label:'Parks & green',     hint:'Parks, gardens, forests',     color:'#b8d89a', defaultOn:true,  type:'area', fillOpacity:0.6, strokeWidth:1.5,
      overpassQuery:(b)=>`way["leisure"~"park|garden|nature_reserve|recreation_ground"](${b});relation["leisure"~"park|garden"](${b});way["landuse"~"grass|forest|meadow|village_green|allotments|orchard"](${b});way["natural"~"wood|scrub|heath|grassland"](${b});` },
  ]},
  { group: 'Built environment', layers: [
    { id:'buildings',    label:'Buildings',         hint:'All building footprints',     color:'#d4c8b4', defaultOn:true,  type:'area', fillOpacity:0.8, strokeWidth:1.5, strokeColor:'#b8a890',
      overpassQuery:(b)=>`way["building"](${b});relation["building"](${b});` },
    { id:'roads',        label:'Roads & streets',   hint:'All roads, styled by type',   color:'#ffffff', defaultOn:true,  type:'roads',
      overpassQuery:(b)=>`way["highway"~"motorway|trunk|motorway_link|trunk_link|primary|secondary|primary_link|secondary_link|tertiary|tertiary_link|residential|unclassified|living_street|service|cycleway|footway|path|pedestrian|steps|track"](${b});` },
    { id:'street_labels',label:'Street labels',     hint:'Road names by category',      color:'#222211', defaultOn:true,  type:'labels',
      overpassQuery:(b)=>`way["highway"~"motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|cycleway|pedestrian|footway"]["name"](${b});` },
  ]},
  { group: 'Transit', layers: [
    { id:'rail',         label:'Railways',          hint:'Main line & narrow gauge',    color:'#444444', defaultOn:true,  type:'rail',
      overpassQuery:(b)=>`way["railway"~"rail|narrow_gauge|preserved"](${b});` },
    { id:'metro',        label:'Metro / subway',    hint:'Underground & subway lines',  color:'#e63030', defaultOn:true,  type:'metro',
      overpassQuery:(b)=>`way["railway"="subway"](${b});` },
    { id:'tram',         label:'Tram & light rail', hint:'Tram & light rail lines',     color:'#22aa88', defaultOn:true,  type:'tram',
      overpassQuery:(b)=>`way["railway"~"tram|light_rail"](${b});` },
    { id:'transit_stops',label:'Transit stops',     hint:'Bus, tram & rail stops',      color:'#444444', defaultOn:false, type:'point', radius:2.5,
      overpassQuery:(b)=>`node["public_transport"~"stop_position|platform"](${b});node["highway"="bus_stop"](${b});node["railway"~"station|halt|tram_stop"](${b});` },
  ]},
  { group: 'Points of interest', layers: [
    { id:'poi_amenity',  label:'Amenities',         hint:'Cafes, restaurants, bars',    color:'#bf3b1e', defaultOn:false, type:'point', radius:2,
      overpassQuery:(b)=>`node["amenity"~"cafe|restaurant|bar|pub|fast_food"](${b});` },
    { id:'poi_tourism',  label:'Tourism',           hint:'Attractions, museums, hotels',color:'#1e5cbf', defaultOn:false, type:'point', radius:2.5,
      overpassQuery:(b)=>`node["tourism"](${b});` },
    { id:'poi_shops',    label:'Shops',             hint:'Retail & supermarkets',       color:'#b05020', defaultOn:false, type:'point', radius:2,
      overpassQuery:(b)=>`node["shop"](${b});` },
  ]},
  { group: 'Land use', layers: [
    { id:'landuse_residential', label:'Residential zones', hint:'Residential land use', color:'#e8dfc8', defaultOn:false, type:'area', fillOpacity:0.4, strokeWidth:0.2,
      overpassQuery:(b)=>`way["landuse"="residential"](${b});relation["landuse"="residential"](${b});` },
    { id:'landuse_industrial',  label:'Industrial zones',  hint:'Industrial & commercial',color:'#c8b8d4',defaultOn:false, type:'area', fillOpacity:0.45, strokeWidth:0.2,
      overpassQuery:(b)=>`way["landuse"~"industrial|commercial|retail"](${b});` },
  ]},
  { group: 'Labels', layers: [
    { id:'water_labels', label:'Water & park names', hint:'Rivers, lakes, parks',       color:'#1a3a6a', defaultOn:true,  type:'feature_labels',
      overpassQuery:(b)=>`way["waterway"~"river|canal"]["name"](${b});relation["natural"="water"]["name"](${b});way["natural"="water"]["name"](${b});way["leisure"~"park|garden"]["name"](${b});relation["leisure"~"park|garden"]["name"](${b});node["place"~"suburb|neighbourhood|quarter"]["name"](${b});` },
  ]},
];

// ════════════════════════════════════════════════════════════════
//  ROAD STYLE TABLE (widths — colours come from active preset)
// ════════════════════════════════════════════════════════════════
const ROAD_WIDTHS = {
  motorway:{fillW:66,casingW:12},     trunk:{fillW:60,casingW:12},
  motorway_link:{fillW:42,casingW:9}, trunk_link:{fillW:42,casingW:9},
  primary:{fillW:54,casingW:10.5},    primary_link:{fillW:36,casingW:9},
  secondary:{fillW:48,casingW:9},     secondary_link:{fillW:30,casingW:7.5},
  tertiary:{fillW:42,casingW:7.5},    tertiary_link:{fillW:27,casingW:6},
  residential:{fillW:30,casingW:6},   unclassified:{fillW:27,casingW:6},
  living_street:{fillW:24,casingW:4.5}, service:{fillW:18,casingW:4.5},
  cycleway:{fillW:12,casingW:3.6,dash:'6 3'},
  pedestrian:{fillW:27,casingW:4.5},
  footway:{fillW:9,casingW:3,dash:'4 2'},
  path:{fillW:7.5,casingW:2.4,dash:'4 2'},
  track:{fillW:9,casingW:2.4,dash:'5 3'},
  steps:{fillW:9,casingW:3,dash:'2 2'},
  _default:{fillW:18,casingW:4.5},
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
  const shortNames = {motorway:'Mwy',primary:'Pri',secondary:'Sec',tertiary:'Ter',residential:'Res',cycleway:'Cyc'};
  cats.forEach(cat => {
    const id = `lbl-${cat}`;
    const label = document.createElement('label');
    label.style.cssText='display:flex;align-items:center;gap:3px;font-size:9px;color:var(--muted);cursor:pointer;white-space:nowrap';
    label.innerHTML = `<input type="checkbox" id="${id}" ${LABEL_VISIBILITY[cat]?'checked':''} style="width:10px;height:10px;accent-color:var(--accent2)"> ${shortNames[cat]}`;
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
    const data = await (await fetch(url, {headers:{'Accept-Language':'en','User-Agent':'MapExport/1.0'}})).json();
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
const CACHE_PREFIX = 'mapexport_v1_';

function bboxToTiles(bbox) {
  const tiles = [];
  const s0 = Math.floor(bbox.south / TILE_SIZE) * TILE_SIZE;
  const w0 = Math.floor(bbox.west  / TILE_SIZE) * TILE_SIZE;
  for (let s = s0; s < bbox.north; s = +(s + TILE_SIZE).toFixed(10)) {
    for (let w = w0; w < bbox.east; w = +(w + TILE_SIZE).toFixed(10)) {
      tiles.push({ s: +s.toFixed(1), w: +w.toFixed(1),
                   n: +(s + TILE_SIZE).toFixed(1), e: +(w + TILE_SIZE).toFixed(1) });
    }
  }
  return tiles;
}

function tileCacheKey(layerId, tile) {
  return `${CACHE_PREFIX}${layerId}_${tile.s}_${tile.w}`;
}

async function cacheGet(key) {
  try {
    const res = await fetch(`cache.php?key=${encodeURIComponent(key)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data || null; // cache.php returns null JSON for misses
  } catch { return null; }
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
const OVERPASS_ENDPOINTS=['https://overpass-api.de/api/interpreter','https://maps.mail.ru/osm/tools/overpass/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
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
    const key = tileCacheKey(layer.id, tile);
    const cached = await cacheGet(key);
    if (cached) {
      elementArrays.push(cached.elements || []);
      continue;
    }

    const tileBboxStr = `${tile.s},${tile.w},${tile.n},${tile.e}`;
    const q = `[out:json][timeout:60];(${layer.overpassQuery(tileBboxStr)});out body geom qt;`;
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
function dpSimplify(pts, eps) {
  if (pts.length<=2) return pts;
  const [x1,y1]=pts[0],[x2,y2]=pts[pts.length-1];
  const dx=x2-x1, dy=y2-y1, len=Math.hypot(dx,dy);
  let maxD=0, idx=0;
  for (let i=1;i<pts.length-1;i++) {
    const d=len===0?Math.hypot(pts[i][0]-x1,pts[i][1]-y1):Math.abs(dy*pts[i][0]-dx*pts[i][1]+x2*y1-y2*x1)/len;
    if (d>maxD){maxD=d;idx=i;}
  }
  if (maxD>eps) { const l=dpSimplify(pts.slice(0,idx+1),eps),r=dpSimplify(pts.slice(idx),eps); return [...l.slice(0,-1),...r]; }
  return [pts[0],pts[pts.length-1]];
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
  let typeGroups='';
  types.forEach(hw => {
    const ways=byType.get(hw);
    const w=ROAD_WIDTHS[hw]||ROAD_WIDTHS._default;
    const colors=preset.roads[hw]||{fill:'#ffffff',casing:'#cccccc'};
    const dash=w.dash?` stroke-dasharray="${w.dash}"`:'';
    const fillW=(w.fillW*sf).toFixed(2), totalW=((w.fillW+w.casingW*2)*sf).toFixed(2);
    const label=TYPE_LABELS[hw]||hw;
    const uid=makeUidGen();
    let casings='',fills='';
    ways.forEach((el,i) => {
      const pts=el.geometry.map(g=>pr(g.lat,g.lon));
      const s=dpSimplify(pts, eps);
      if (s.length<2) return;
      let d=`M${s[0][0].toFixed(1)},${s[0][1].toFixed(1)}`;
      for(let j=1;j<s.length;j++) d+=`L${s[j][0].toFixed(1)},${s[j][1].toFixed(1)}`;
      const name=el.tags?.name||'', ref=el.tags?.ref||'';
      const pid=uid(name?safeName(name):ref?safeName(ref):`${hw}_${el.id||i}`);
      const lbl=name||ref||`${label} (${el.id||i})`;
      casings+=`\n      <path id="${pid}_casing" inkscape:label="${lbl}" d="${d}" fill="none" stroke="${colors.casing}" stroke-width="${totalW}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`;
      fills+=`\n      <path id="${pid}" inkscape:label="${lbl}" d="${d}" fill="none" stroke="${colors.fill}" stroke-width="${fillW}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`;
    });
    if (!fills) return;
    typeGroups+=`\n  <g id="roads_${hw}" inkscape:label="${label}" inkscape:groupmode="layer">\n    <g id="roads_${hw}_casing" inkscape:label="${label} — casing">${casings}\n    </g>\n    <g id="roads_${hw}_fill" inkscape:label="${label} — fill">${fills}\n    </g>\n  </g>`;
  });
  return typeGroups?`  <g id="roads" inkscape:label="Roads &amp; streets" inkscape:groupmode="layer">${typeGroups}\n  </g>\n`:'';
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
    const lbl=name||`Railway (${el.id||i})`;
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
      const lbl=name!=='_default'?name:`Metro (${el.id||i})`;
      casings+=`\n      <path id="${pid}_casing" inkscape:label="${lbl}" d="${d}" fill="none" stroke="white" stroke-width="${(24*sf).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>`;
      fills+=`\n      <path id="${pid}" inkscape:label="${lbl}" d="${d}" fill="none" stroke="${line.color}" stroke-width="${(16.5*sf).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.82"/>`;
    });
    if (!fills) return;
    const lid=safeName(key!=='_default'?key:'metro_default');
    const llbl=key!=='_default'?key:'Metro line';
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
    const lbl=name||`Tram (${el.id||i})`;
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
  motorway:     {size:40,weight:700,minLen:200,spacing:900},
  trunk:        {size:40,weight:700,minLen:200,spacing:900},
  primary:      {size:36,weight:600,minLen:180,spacing:800},
  secondary:    {size:32,weight:600,minLen:160,spacing:700},
  tertiary:     {size:28,weight:500,minLen:140,spacing:600},
  residential:  {size:22,weight:500,minLen:100,spacing:500},
  unclassified: {size:22,weight:500,minLen:100,spacing:500},
  living_street:{size:18,weight:400,minLen:90, spacing:450},
  cycleway:     {size:18,weight:400,minLen:90, spacing:450},
  footway:      {size:14,weight:400,minLen:80, spacing:400},
  pedestrian:   {size:18,weight:400,minLen:90, spacing:450},
  _default:     {size:22,weight:400,minLen:90, spacing:480},
};
function approxTextWidth(t,fs){return t.length*fs*0.55;}
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
  sorted.forEach(el=>{
    if (el.type!=='way'||!el.geometry?.length||!el.tags?.name) return;
    const name=el.tags.name, hw=el.tags.highway||'_default';
    // Check label visibility toggle
    if (LABEL_VISIBILITY.hasOwnProperty(hw) && !LABEL_VISIBILITY[hw]) return;
    const style=LABEL_STYLES[hw]||LABEL_STYLES._default;
    // Get road fill width to constrain label size
    const roadW=ROAD_WIDTHS[hw]||ROAD_WIDTHS._default;
    const maxFontSize=roadW.fillW*sf*0.75; // text must fit inside road width
    const sz=Math.min(style.size*sf, maxFontSize);
    if (sz<4) return; // too small to read
    const displayName=name.toUpperCase();
    const pts=el.geometry.map(g=>pr(g.lat,g.lon));
    const len=pathLength(pts);
    const textW=approxTextWidth(displayName,sz);
    if (len<style.minLen*sf||len<textW*1.1) return;
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
    // Offset path vertically to center text on road: shift by ~0.35em downward
    // We achieve this by using dominant-baseline="central" on the text
    let d=`M${pathPts[0][0].toFixed(1)},${pathPts[0][1].toFixed(1)}`;
    for(let i=1;i<pathPts.length;i++) d+=`L${pathPts[i][0].toFixed(1)},${pathPts[i][1].toFixed(1)}`;
    defs.push(`<path id="${pathId}" inkscape:label="${name} (path)" d="${d}"/>`);
    const offset=Math.max(0,(len-textW)/2);
    const offsetPct=((offset/len)*100).toFixed(1);
    const attrs=`font-family="Arial,Helvetica,sans-serif" font-size="${sz.toFixed(1)}" font-weight="${style.weight}" text-anchor="start" dominant-baseline="central" letter-spacing="${(sz*0.08).toFixed(1)}"`;
    texts.push(`<text id="${textId}" inkscape:label="${name}" ${attrs} fill="${preset.labelColor}"><textPath href="#${pathId}" startOffset="${offsetPct}%">${displayName}</textPath></text>`);
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
    labels+=`<text id="${fid}_halo" inkscape:label="${name} (halo)" x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" font-family="Arial,Helvetica,sans-serif" font-size="${sz.toFixed(1)}" font-weight="${weight}" ${italicAttr} text-anchor="middle" dominant-baseline="middle" stroke="white" stroke-width="${haloSz}" stroke-linejoin="round" fill="none" paint-order="stroke">${name}</text>`;
    labels+=`<text id="${fid}" inkscape:label="${name}" x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" font-family="Arial,Helvetica,sans-serif" font-size="${sz.toFixed(1)}" font-weight="${weight}" ${italicAttr} text-anchor="middle" dominant-baseline="middle" fill="${color}" opacity="0.9">${name}</text>`;
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
//  SVG BUILDER
// ════════════════════════════════════════════════════════════════
function buildSVG(results, b, W, physicalWidthMm=null) {
  const {pr,H}=makeProjector(b,W);
  const preset=PRESETS[activePreset];
  const EPS={area_large:getEps()*1.4, area:getEps()*0.9, line:getEps()*0.6};
  const layerOrder=['landuse_residential','landuse_industrial','parks','water_bodies','waterways','buildings','roads','rail','tram','metro','transit_stops','poi_amenity','poi_tourism','poi_shops','street_labels','water_labels'];
  const sorted=[...results].sort((a,z)=>(layerOrder.indexOf(a.layer.id)||999)-(layerOrder.indexOf(z.layer.id)||999));
  let layersSVG='';

  sorted.forEach(({layer,data})=>{
    if (!data?.elements?.length) return;
    // Cull elements entirely outside the export bbox before any rendering
    const elements = data.elements.filter(el => elementInBbox(el, b));
    if (!elements.length) return;
    if (layer.type==='roads')         { layersSVG+=buildRoadsLayer(elements,pr,W); return; }
    if (layer.type==='rail')          { layersSVG+=buildRailLayer(elements,pr,W); return; }
    if (layer.type==='metro')         { layersSVG+=buildMetroLayer(elements,pr,W); return; }
    if (layer.type==='tram')          { layersSVG+=buildTramLayer(elements,pr,W); return; }
    if (layer.type==='labels')        { layersSVG+=buildLabelsLayer(elements,pr,W,H); return; }
    if (layer.type==='feature_labels'){ layersSVG+=buildFeatureLabelsLayer(elements,pr,W,H); return; }

    const large=['landuse_residential','landuse_industrial','water_bodies','parks'];
    const eps=layer.type==='line'?EPS.line:large.includes(layer.id)?EPS.area_large:EPS.area;
    const isArea=layer.type==='area';
    let allD='', circles='';

    // Apply preset colors to known layers
    let fillColor=layer.color, strokeColor=layer.strokeColor||layer.color;
    if (layer.id==='water_bodies'||layer.id==='waterways') { fillColor=preset.water; strokeColor=preset.water; }
    if (layer.id==='parks') { fillColor=preset.park; strokeColor=preset.park; }
    if (layer.id==='buildings') { fillColor=preset.building; strokeColor=preset.buildingStroke; }

    elements.forEach(el=>{
      if (layer.type==='point'&&el.type==='node'&&el.lat!=null) {
        const [x,y]=pr(el.lat,el.lon);
        const poiName=el.tags?.name||el.tags?.amenity||el.tags?.tourism||el.tags?.shop||layer.label;
        const poiId=`poi_${safeName(poiName)}_${el.id||Math.round(x)}`;
        circles+=`<circle id="${poiId}" inkscape:label="${poiName}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${layer.radius||2}"/>`;
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
        if (layer.id==='buildings') {
          // Buildings: stroke first (bottom), then fill on top — adjacent buildings
          // merge into blocks because fill covers internal shared borders
          content+=`<path d="${d}" fill="none" fill-rule="evenodd" stroke="${strokeColor}" stroke-width="${sw}" stroke-linejoin="round" opacity="${fo}"/>`;
          content+=`<path d="${d}" fill="${fillColor}" fill-opacity="${fo}" fill-rule="evenodd" stroke="none"/>`;
        } else {
          content+=`<path d="${d}" fill="${fillColor}" fill-opacity="${fo}" fill-rule="evenodd" stroke="${strokeColor}" stroke-width="${sw}" stroke-linejoin="round"/>`;
        }
      } else {
        const sw=typeof layer.strokeWidth==='function'?layer.strokeWidth({}):(layer.strokeWidth??1);
        const dash=layer.strokeDash?` stroke-dasharray="${layer.strokeDash}"`:'';
        content+=`<path d="${d}" fill="none" stroke="${fillColor}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${dash} opacity="0.92"/>`;
      }
    }
    if (circles) content+=circles;
    if (!content) return;
    layersSVG+=`  <g id="${layer.id}" inkscape:label="${layer.label}" inkscape:groupmode="layer" fill="${fillColor}" opacity="${layer.type==='point'?'0.8':'1'}">\n    ${content}\n  </g>\n`;
  });

  const date=new Date().toISOString().slice(0,10);
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

// ════════════════════════════════════════════════════════════════
//  LIVE PREVIEW — rebuilds SVG from cached data, no re-fetch
// ════════════════════════════════════════════════════════════════
function scheduleLivePreview() {
  if (!lastResults || !bbox) return;
  clearTimeout(previewDebounce);
  previewDebounce = setTimeout(() => {
    const PREVIEW_W = 600;
    const selected = new Set(getAllSelectedLayers().map(l => l.id));
    // Filter cached results to only checked layers
    const filtered = lastResults.filter(r => selected.has(r.layer.id));
    if (!filtered.length) return;
    const svg = buildSVG(filtered, bbox, PREVIEW_W);
    const wrap = document.getElementById('preview-svg-wrap');
    wrap.innerHTML = svg;
    document.getElementById('preview-pane').classList.add('show');
    // Update the download button to use latest filtered SVG
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
  showProgress('Starting export…',0);

  const results=[];
  let failCount=0;
  let totalFailedTiles=0;
  const tiles=bboxToTiles(bbox);
  for (let i=0;i<selected.length;i++) {
    const layer=selected[i];
    const cachedCount=(await Promise.all(tiles.map(t=>cacheGet(tileCacheKey(layer.id,t))))).filter(Boolean).length;
    const cacheLabel=cachedCount===tiles.length?'↩ Cached':cachedCount>0?`↩ ${cachedCount}/${tiles.length} tiles cached`:'Fetching';
    updateProgress(`${cacheLabel}: ${layer.label} (${i+1}/${selected.length})…`, Math.round((i/selected.length)*85));
    try {
      const result=await fetchLayer(layer,bboxStr,bbox);
      results.push({layer, data:result});
      if (result.failedTiles && result.failedTiles.length>0) {
        showFailedTileOverlays(result.failedTiles, layer.label);
        totalFailedTiles+=result.failedTiles.length;
        if (result.elements.length===0) failCount++;
      }
    }
    catch(e) { failCount++; results.push({layer,data:null}); console.warn('Layer failed:',layer.id,e); }
    await sleep(350);
  }
  if (failCount===selected.length) { hideProgress(); document.getElementById('btn-export').disabled=false; setStatus('All fetches failed — check your connection','error'); return; }

  // Cache results for live preview
  lastResults = results;

  // Count elements for size warning
  const totalElements=results.reduce((s,r)=>s+(r.data?.elements?.length||0),0);
  const estMB=(totalElements*0.0003).toFixed(1);

  updateProgress('Building SVG…',90);
  await new Promise(r=>setTimeout(r,50));
  const svg=buildSVG(results,bbox,W,physicalWidthMm);
  const actualMB=(svg.length/1024/1024).toFixed(1);
  lastSvgString=svg; lastSvgFilename=filename;

  updateProgress('Done!',100);
  await new Promise(r=>setTimeout(r,400));
  hideProgress();
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
    const items=JSON.parse(localStorage.getItem('mapexport_history')||'[]');
    if (!items.length) { list.innerHTML='<div id="no-history">No exports yet</div>'; return; }
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
    const data=await (await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`,{headers:{'Accept-Language':'en','User-Agent':'MapExport/1.0'}})).json();
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
function showProgress(label,pct){document.getElementById('progress-overlay').classList.add('show');updateProgress(label,pct);}
function updateProgress(label,pct){document.getElementById('progress-label').textContent=label;document.getElementById('progress-bar').style.width=pct+'%';setStatus(label,'loading');}
function hideProgress(){document.getElementById('progress-overlay').classList.remove('show');}

// ════════════════════════════════════════════════════════════════
//  BOOT
// ════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded',()=>{
  initMap();
  renderPresets();
  renderLayers();
  renderLabelToggles();
  renderHistory();

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
