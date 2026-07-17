// Offline check of engine-v2's AREA_FEATURES table binding (no network, no
// DOM). AF-03a bound natural=scrub|heath into the existing 'grass' paint-only
// route (one AREA_FEATURES row) so scrub/heath land no longer falls through
// to the cream "Uncategorized" fallback. This test is deliberately set up to
// grow with later AREA_FEATURES units (AF-03b/c): it exercises the full
// classify → bucket → render path, not just the new row in isolation.
//
// Two harnesses:
//  - a light vm sandbox (stubbed script.js globals) for the pure classify/
//    bucket functions (classifyAreaTags via AREA_FEATURES, classifyAreaFeatures,
//    buildAreaResults) — same pattern as tests/sea-sign.mjs / hamlet-grounding.mjs;
//  - a full vm sandbox (real script.js + engine-v2.js concatenated in one vm
//    script, DOM stubbed) for renderLandcover, which is v1 machinery
//    (geomToPathD/safeName/escXml/PRESETS) engine-v2.js only has in scope
//    when loaded after script.js — same concatenation tests/real-export.mjs
//    uses. renderLandcover itself is not part of EngineV2's public return
//    object, so the source string is patched (in memory only, not on disk)
//    to add it to the export, the same trick sea-sign.mjs uses for buildSeaElements.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const engineSrc = readFileSync(join(repoRoot, 'engine-v2.js'), 'utf8');
const scriptSrc = readFileSync(join(repoRoot, 'script.js'), 'utf8');

let failures = 0;
const check = (name, cond) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`);
  if (!cond) failures++;
};

// ── light harness: pure classify/bucket functions ──────────────────
const mkLayer = (id) => ({ id, label: id, type: id, overpassQuery: () => '' });
const lightCtx = vm.createContext({
  LAYER_REGISTRY: [{ group: 'stub', layers: ['roads', 'rail', 'tram', 'metro', 'water_bodies', 'waterways', 'parks', 'landcover', 'transit_stops', 'water_labels', 'street_labels'].map(mkLayer) }],
  BLOCK_BUILDINGS_LAYER: mkLayer('buildings'),
  // Real parksNamedGate logic (mirrored from script.js), not a stub-false:
  // the 'green' regression check below needs a named park to actually gate
  // through, and a junk-named one to still be rejected.
  parksNamedGate: (el) => {
    if (el.type === 'node' || !el.tags?.name) return false;
    const n = el.tags.name.toLowerCase().trim();
    if (n.length < 4) return false;
    if (/^(green|grass|groen|tuin|garden|garten|jardin|beplanting|planting|plantsoen|hedge|lawn|speeltuin|spielplatz|playground|parking|parkeerplaats|terrain|terrein|veld|field|berm|strip|border|rand|strook|perk|bloem|flower|rozenperk|heg|haag)/.test(n)) return false;
    return /^(park|garden|nature_reserve|recreation_ground)$/.test(el.tags.leisure || '')
      || /^(forest|cemetery|allotments|recreation_ground)$/.test(el.tags.landuse || '')
      || el.tags.natural === 'wood' || el.tags.amenity === 'grave_yard' || el.tags.tourism === 'zoo';
  },
  isSquareTagged: () => false,
  console,
});
vm.runInContext(engineSrc + '\n;globalThis.__X2 = EngineV2;', lightCtx);
const X2 = lightCtx.__X2;

// A closed square ring ~111m per side (~12,321 m²), well above the 80 m²
// grass-display declutter floor.
const closedWay = (id, tags, cx = 5.0, cy = 51.0, halfDeg = 0.0005) => ({
  type: 'way', id, tags,
  geometry: [
    { lat: cy - halfDeg, lon: cx - halfDeg },
    { lat: cy - halfDeg, lon: cx + halfDeg },
    { lat: cy + halfDeg, lon: cx + halfDeg },
    { lat: cy + halfDeg, lon: cx - halfDeg },
    { lat: cy - halfDeg, lon: cx - halfDeg },
  ],
});
// A mini way well under the 80 m² floor (~5.5m side, ~30 m²).
const miniWay = (id, tags) => closedWay(id, tags, 5.0, 51.0, 0.000025);

// (a) classifyAreaTags via the exposed AREA_FEATURES table: scrub/heath → 'grass'.
const classifyTags = (tags) => {
  for (const row of X2.AREA_FEATURES) if (row.match(tags)) return row.category;
  return null;
};
check("natural=scrub tags classify as 'grass'", classifyTags({ natural: 'scrub' }) === 'grass');
check("natural=heath tags classify as 'grass'", classifyTags({ natural: 'heath' }) === 'grass');

// (b) a closed scrub way above the declutter floor lands in the landcover
// paint bucket (classified.grass) via buildAreaResults/classifyAreaFeatures.
const scrubWay = closedWay(1001, { natural: 'scrub' });
const heathWay = closedWay(1002, { natural: 'heath' });
const bbox = { south: 50.999, north: 51.001, west: 4.999, east: 5.001 };
const { renderResults, classified } = X2.buildAreaResults([scrubWay, heathWay], bbox);
check('scrub way lands in classified.grass', classified.grass.includes(scrubWay));
check('heath way lands in classified.grass', classified.grass.includes(heathWay));
check('scrub/heath do NOT land in classified.landcover (kept out of the open-land signal)',
  !classified.landcover.includes(scrubWay) && !classified.landcover.includes(heathWay));
const landcoverRenderResult = renderResults.find(r => r.layer.id === 'landcover');
check('scrub/heath reach the landcover render bucket (paint set = landcover + grass)',
  landcoverRenderResult.data.elements.includes(scrubWay) && landcoverRenderResult.data.elements.includes(heathWay));

// (d) regressions: named park stays 'green', farmland stays 'landcover',
// natural=wetland stays unbound (label-only — AF-03b, no row yet), and a
// mini scrub patch under the declutter floor is dropped entirely.
const namedPark = closedWay(2001, { leisure: 'park', name: 'Vondelpark' });
const farmland = closedWay(2002, { landuse: 'farmland' });
const wetland = closedWay(2003, { natural: 'wetland' });
const miniScrub = miniWay(2004, { natural: 'scrub' });
const regression = X2.classifyAreaFeatures([namedPark, farmland, wetland, miniScrub]);
check("named park still classifies 'green'", regression.green.includes(namedPark));
check("farmland still classifies 'landcover'", regression.landcover.includes(farmland));
check('natural=wetland is still unbound (label-only, AF-03b)', regression.labelOnly.includes(wetland));
check('natural=wetland does not leak into any painted bucket',
  !regression.water.includes(wetland) && !regression.green.includes(wetland) &&
  !regression.landcover.includes(wetland) && !regression.grass.includes(wetland) && !regression.beach.includes(wetland));
check('a mini scrub patch under the 80 m² declutter floor is dropped (not painted, not label-only)',
  !regression.grass.includes(miniScrub) && !regression.labelOnly.includes(miniScrub) &&
  !regression.landcover.includes(miniScrub));

// (e) determinism: re-running classification on the same elements yields the
// same bucketing (same ids in the same buckets), run to run.
const run2 = X2.classifyAreaFeatures([scrubWay, heathWay, namedPark, farmland, wetland, miniScrub]);
const idsOf = (arr) => arr.map(e => e.id).sort().join(',');
const run1 = X2.classifyAreaFeatures([scrubWay, heathWay, namedPark, farmland, wetland, miniScrub]);
check('classification is deterministic across repeated runs (grass bucket)', idsOf(run1.grass) === idsOf(run2.grass));
check('classification is deterministic across repeated runs (landcover bucket)', idsOf(run1.landcover) === idsOf(run2.landcover));
check('classification is deterministic across repeated runs (green bucket)', idsOf(run1.green) === idsOf(run2.green));
check('classification is deterministic across repeated runs (labelOnly bucket)', idsOf(run1.labelOnly) === idsOf(run2.labelOnly));

// ── heavy harness: renderLandcover (real v1 machinery) ──────────────
// engine-v2.js is loaded as a classic script AFTER script.js in production,
// sharing script.js's top-level declarations (geomToPathD, safeName, escXml,
// PRESETS, makeProjector, makeUidGen, getEps*...) — see the file's own header
// comment. Concatenate both sources into one vm script, same as
// tests/real-export.mjs, with a minimal DOM stub (renderLandcover never
// touches the DOM itself; script.js's top level only needs addEventListener
// to no-op at eval time for its DOMContentLoaded registration).
const elProxy = new Proxy(function () {}, {
  get(_t, p) {
    if (typeof p === 'symbol') return undefined;
    return elProxy;
  }, set() { return true; }, apply() { return elProxy; },
});
const heavySandbox = {
  console,
  document: { getElementById: () => elProxy, querySelector: () => elProxy, querySelectorAll: () => [], createElement: () => elProxy, createElementNS: () => elProxy, addEventListener() {}, body: elProxy, documentElement: elProxy },
  window: undefined, navigator: { userAgent: 'node' }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
};
heavySandbox.window = heavySandbox; heavySandbox.globalThis = heavySandbox; heavySandbox.self = heavySandbox;
vm.createContext(heavySandbox);

// In-memory-only source patch: expose renderLandcover on EngineV2's return
// object so this test can call it directly. engine-v2.js on disk is
// unchanged by this — the patch is applied to the string read into this
// test process, never written back.
const returnMarker = 'return {\n    layers, layerOrder, buildSVG, doExport,';
if (!engineSrc.includes(returnMarker)) throw new Error('area-binding.mjs: EngineV2 return statement shape changed — update the renderLandcover exposure patch');
const patchedEngineSrc = engineSrc.replace(returnMarker, 'return {\n    layers, layerOrder, buildSVG, doExport, renderLandcover,');

const heavyTail = '\n;globalThis.__x2 = EngineV2;\nglobalThis.__x1 = { makeProjector, makeUidGen, getAreaLargeEps, getEps, getLineEps, PRESETS };';
vm.runInContext(scriptSrc + '\n;\n' + patchedEngineSrc + heavyTail, heavySandbox);
const V1 = heavySandbox.__x1;
const V2 = heavySandbox.__x2;

const preset = V1.PRESETS.useit;
const { pr, H } = V1.makeProjector(bbox, 1000);
const ctx = { b: bbox, pr, W: 1000, H, preset, EPS: { area_large: V1.getAreaLargeEps(), area: V1.getEps() * 0.9, line: V1.getLineEps() }, uid: V1.makeUidGen() };

const scrubSvg = V2.renderLandcover({ data: { elements: [scrubWay] } }, ctx);
// (c) renderLandcover paints scrub with preset.field (the same quiet field
// tint as farmland — NOT preset.park), and emits a usable inkscape:label.
check('renderLandcover emits a path for the scrub element', /<path /.test(scrubSvg));
check('renderLandcover fills scrub with preset.field (field tint, like farmland)', scrubSvg.includes(`fill="${preset.field}"`));
check('renderLandcover does NOT fill scrub with preset.park', !scrubSvg.includes(`fill="${preset.park}"`));
check('renderLandcover emits a usable inkscape:label for the scrub element', /inkscape:label="Scrub"/.test(scrubSvg));

const heathSvg = V2.renderLandcover({ data: { elements: [heathWay] } }, ctx);
check('renderLandcover fills heath with preset.field too', heathSvg.includes(`fill="${preset.field}"`));
check('renderLandcover emits a usable inkscape:label for the heath element', /inkscape:label="Heath"/.test(heathSvg));

// A named scrub patch labels by name (matches the landcover renderer's
// existing name-first convention, exercised here as a light regression guard
// on the row addition, not new behaviour).
const namedScrub = closedWay(3001, { natural: 'scrub', name: 'Dok-Zuid' });
const namedScrubSvg = V2.renderLandcover({ data: { elements: [namedScrub] } }, ctx);
check('a named scrub patch labels by its name', namedScrubSvg.includes('inkscape:label="Dok-Zuid"'));

process.exit(failures ? 1 : 0);
