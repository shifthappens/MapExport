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
// Milestone 1 (scaffold): v2 renders a roads-only map end to end. Later
// milestones add the face cutter, area-features table, transit, labels,
// squares and tunnels. See plans/2026-07-10_export-engine-v2.md — the
// milestone checkboxes there are the single source of truth for progress.

const EngineV2 = (() => {
  // v2's flat layer list. For M1 it is exactly v1's own `roads` registry
  // object, looked up (not copied) from LAYER_REGISTRY. Reusing the same
  // object is deliberate: identical overpassQuery → identical layerQHash →
  // v1 and v2 share the same cache.php entries for free.
  const roadsLayer = LAYER_REGISTRY.flatMap(g => g.layers).find(l => l.id === 'roads');
  const layers = [roadsLayer];

  // The full v2 paint order from the plan. Only `roads` exists yet, but the
  // sort is written against the complete order so later milestones drop their
  // layers into place without touching the assembler.
  const layerOrder = [
    'landcover',
    'city_blocks',
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

  // Sort a result list into v2 paint order. Unknown ids sort last (same
  // convention as v1's sortedResults).
  function sortResults(results) {
    const orderIndex = (id) => {
      const i = layerOrder.indexOf(id);
      return i < 0 ? 999 : i;
    };
    return [...results].sort((a, z) => orderIndex(a.layer.id) - orderIndex(z.layer.id));
  }

  // v2's per-layer dispatcher. For M1 every layer type v2 renders (roads
  // today) is byte-for-byte identical to v1, so we delegate straight to v1's
  // renderLayerSVG. Later milestones give this function v2-specific branches
  // (cream faces below water, area-features table, ported labels) before
  // falling back to v1 for the still-shared types.
  function renderLayer(result, ctx) {
    return renderLayerSVG(result, ctx);
  }

  // v2's one-shot assembly, mirroring v1's buildSVG.
  //
  // Context: we reuse v1's buildSVGContext unchanged. With precomputedBlocks
  // = null it produces exactly the fields the roads path and both wrappers
  // read (pr, H, preset, EPS, illustratorCompatible, illustratorDefs,
  // areaClipDs, labelGrid) and does nothing v1-specific that is wrong for a
  // roads-only map — the city_blocks branch simply never runs without blocks.
  // A bespoke v2 context would only re-derive the same fields.
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
      { id: 'render', label: 'Render SVG' },
      { id: 'finalize', label: 'Finalize' },
    ];
    progress.begin(stages);
    progress.log(`Engine v2 export: ${layers.length} layer${layers.length > 1 ? 's' : ''}, ${widthPx}px wide (${(physicalWidthMm / 10).toFixed(1)}cm @ ${PRINT_DPI}dpi), style “${activePreset}”`);

    // Fetch stage. One fetchLayer call per v2 layer with an overpassQuery.
    // No combined-tile pooling yet — the single combined v2 bundle (roads +
    // buildings + area features in one query per tile) arrives with the
    // area-features milestone (M3); until then per-layer fetch is enough and
    // keeps this scaffold small.
    progress.setStage('fetch', 'active', { meta: `0/${layers.length}` });
    const fetchableLayers = layers.filter((l) => typeof l.overpassQuery === 'function');
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
      // fetchLayer returns raw tile elements; the per-layer tagFilter is what
      // narrows them to this layer's slice (v1 applies it in its combined
      // fetch loop).
      const kept = layer.tagFilter ? elements.filter(layer.tagFilter) : elements;
      results.push({ layer, data: { elements: kept, failedTiles } });
      fetched++;
      progress.log(`${layer.id}: ${kept.length} element${kept.length === 1 ? '' : 's'}`);
      progress.bar(Math.round((fetched / fetchableLayers.length) * 70));
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

    // Cache for the shared live-preview path.
    lastResults = results;

    // Render stage.
    progress.setStage('render', 'active', { detail: 'Assembling SVG…' });
    await new Promise((r) => setTimeout(r, 0));
    const svg = buildSVG(results, bbox, widthPx, physicalWidthMm, { illustratorCompatible });
    progress.setStage('render', 'done', { meta: `${results.length} layer${results.length > 1 ? 's' : ''}`, detail: '' });
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
    setStatus(`✓ Engine v2 · ${widthPx}px wide · ${actualMB} MB · ${totalElements.toLocaleString()} elements`, 'success');
    saveHistory(bbox, activePreset, widthPx, filename, actualMB, totalElements, areaName);
  }

  return { layers, layerOrder, buildSVG, doExport };
})();
