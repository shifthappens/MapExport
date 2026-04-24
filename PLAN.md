# Plan: Replace buildings layer with landuse areas

## Context

The current `buildings` layer fetches every individual building footprint via
`wr["building"]` — potentially tens of thousands of polygons in a dense city
centre. This is the heaviest Overpass query in the stack and a primary cause of
timeouts and rate-limit pressure.

Crucially, **the fetched building elements are never used**. The SVG renderer
skips them entirely and instead renders `precomputedBlocks` — shapes computed
by a Web Worker from road geometry alone (roads + water + parks define the
voids; everything else is a block). The buildings query is dead weight.

Option 1: replace the query with `landuse` areas (residential, commercial,
retail, industrial). These are neighbourhood-scale polygons — far fewer
elements, much lighter fetch. Render them directly as filled areas (same path
as parks/water), eliminating the Web Worker block computation for this layer
entirely.

## Key findings

| Item | Location |
|------|----------|
| Layer definition | `script.js` lines 157–159 |
| Block computation trigger | `script.js` lines 1688–1696 |
| Block SVG rendering (buildings special-case) | `script.js` lines 1470–1482 |
| `prepareBlockData` (uses roads/parks/water, NOT buildings) | `script.js` lines 1323–1389 |
| Parks generic area renderer (model to follow) | `script.js` ~lines 1435–1468 |
| Test fixture | `tests/fixtures/tilburg/buildings.json` + `_meta.json` |

## Changes

### 1. `script.js` — layer definition (lines 157–159)

Replace the layer object:

```js
// BEFORE
{ id:'buildings', label:'Buildings', hint:'All building footprints',
  color:'#d4c8b4', defaultOn:true, type:'area', fillOpacity:0.8,
  strokeWidth:1.5, strokeColor:'#b8a890',
  overpassQuery:(b)=>`wr["building"](${b});`,
  tagFilter:el=>el.type!=='node'&&!!el.tags?.building },

// AFTER
{ id:'buildings', label:'City blocks', hint:'Residential, commercial & industrial zones',
  color:'#d4c8b4', defaultOn:true, type:'area', fillOpacity:0.8,
  strokeWidth:0, strokeColor:'#b8a890',
  overpassQuery:(b)=>`wr["landuse"~"residential|commercial|retail|industrial"](${b});`,
  tagFilter:el=>el.type!=='node'&&/^(residential|commercial|retail|industrial)$/.test(el.tags?.landuse||'') },
```

Keep `id:'buildings'` so the SVG layer name and any downstream tooling is unchanged.
Set `strokeWidth:0` — landuse polygons are coarse and don't need outlines.

### 2. `script.js` — replace buildings SVG special-case (lines 1470–1482)

Replace the `if (layer.id==='buildings' && precomputedBlocks …)` block with a
new renderer that groups paths by landuse category and names them individually:

```js
if (layer.id === 'buildings') {
  fillColor = preset.building;
  const fo = layer.fillOpacity ?? 0.8;
  const categories = ['residential','commercial','retail','industrial'];
  const buckets = Object.fromEntries(categories.map(c => [c, []]));

  for (const el of elements) {
    const cat = el.tags?.landuse;
    if (!buckets[cat]) continue;
    const d = buildAreaPath(el, pr);   // use existing geometry→path helper
    if (!d) continue;
    const idx = buckets[cat].length + 1;
    buckets[cat].push(
      `<path id="${cat}_block_${idx}" inkscape:label="${cat} block ${idx}" ` +
      `d="${d}" fill="${fillColor}" fill-opacity="${fo}" fill-rule="evenodd" stroke="none"/>`
    );
  }

  const subgroups = categories
    .filter(c => buckets[c].length)
    .map(c =>
      `    <g id="buildings_${c}" inkscape:label="${c[0].toUpperCase()}${c.slice(1)}" inkscape:groupmode="layer">\n` +
      `      ${buckets[c].join('\n      ')}\n    </g>`
    ).join('\n');

  if (subgroups) {
    layersSVG += `  <g id="${layer.id}" inkscape:label="${escXml(layer.label)}" inkscape:groupmode="layer">\n${subgroups}\n  </g>\n`;
  }
  return;
}
```

Each category becomes a sublayer (`buildings_residential`, `buildings_commercial`,
etc.) and each polygon gets an individual id (`residential_block_1`, …).
The geometry-to-path conversion reuses whatever helper the parks renderer
already calls for way/relation geometry — identify it while implementing and
call it the same way.

### 3. `script.js` — remove block computation trigger (lines 1688–1696)

Delete (or comment out) the `hasBuildingsLayer` / `computeBlocksAsync` block:

```js
// DELETE these lines:
const hasBuildingsLayer = results.some(r => r.layer.id === 'buildings');
let precomputedBlocks = null;
if (hasBuildingsLayer) {
  updateProgress('Computing city blocks…', 85);
  const {pr,H} = makeProjector(bbox, W);
  precomputedBlocks = await computeBlocksAsync(results, pr, W, H, (msg, pct) => {
    updateProgress(msg, 85 + Math.round(pct * 0.1));
  });
}
```

Also remove `precomputedBlocks` from the `buildSVG(…)` call signature and its
parameter list — it is no longer passed or used.

The Web Worker code (`BLOCK_WORKER_SRC`, `getBlockWorkerUrl`,
`prepareBlockData`, `computeBlocksAsync`) can be left in place for now as dead
code and cleaned up separately, to keep this diff focused.

### 4. Test fixture — recapture buildings layer

Run:
```bash
node tests/capture-one.mjs buildings
```

This re-fetches against Tilburg with the new query, writes a new
`tests/fixtures/tilburg/buildings.json` and patches `_meta.json`.

## Verification

1. `node tests/supersession.mjs` — buildings is not in SUPERSESSIONS, should
   pass unchanged.
2. `node tests/pipeline-equivalence.mjs` — needs new fixtures first (step 4
   above); then verify buildings row shows OK.
3. Manual visual test — open the app, draw a city-centre bbox, export. Verify
   landuse blocks render in the expected cream colour at neighbourhood scale.
   Confirm no console errors and no Web Worker progress message appears.
