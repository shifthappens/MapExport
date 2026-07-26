// Offline check of engine-v2's AREA_FEATURES table binding (no network, no
// DOM). It covers the rows added by AF-03a/b/c — scrub/heath and wetland on the
// paint-only 'grass' route, and golf/dog park/sports centre/allotments as the
// v2-only 'recreation' category — and exercises the full classify → bucket →
// render path rather than the rows in isolation, so later rows can join it.
//
// Two harnesses:
//  - a light vm sandbox (stubbed script.js globals) for the pure classify and
//    bucket functions, as in sea-sign.mjs;
//  - a full sandbox with script.js and engine-v2.js concatenated for
//    renderLandcover, which needs v1 machinery in scope. renderLandcover is not
//    part of EngineV2's public return, so the source string is patched in
//    memory to export it — the same trick sea-sign.mjs uses.
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
check("natural=wetland tags classify as 'grass' (AF-03b, same paint-only route)", classifyTags({ natural: 'wetland' }) === 'grass');
check("leisure=golf_course tags classify as 'recreation'", classifyTags({ leisure: 'golf_course' }) === 'recreation');
check("leisure=dog_park tags classify as 'recreation'", classifyTags({ leisure: 'dog_park' }) === 'recreation');
check("leisure=sports_centre tags classify as 'recreation'", classifyTags({ leisure: 'sports_centre' }) === 'recreation');
check("nameless landuse=allotments tags classify as 'recreation'", classifyTags({ landuse: 'allotments' }) === 'recreation');
// Table order guard: a properly NAMED allotments still hits the named-green
// gate row first ('green', paints park green via the parks layer), so the
// recreation row only catches what the gate rejects.
check("named landuse=allotments still classify as 'green' (gate row wins)",
  classifyTags({ landuse: 'allotments', name: 'Slotenkouter' }) === 'green');

// (b) a closed scrub way above the declutter floor lands in the landcover
// paint bucket (classified.grass) via buildAreaResults/classifyAreaFeatures.
const scrubWay = closedWay(1001, { natural: 'scrub' });
const heathWay = closedWay(1002, { natural: 'heath' });
const wetlandWay = closedWay(1003, { natural: 'wetland' });
const golfWay = closedWay(1004, { leisure: 'golf_course' });
const dogParkWay = closedWay(1005, { leisure: 'dog_park' });
const sportsWay = closedWay(1006, { leisure: 'sports_centre' });
const allotmentsWay = closedWay(1007, { landuse: 'allotments' });
const bbox = { south: 50.999, north: 51.001, west: 4.999, east: 5.001 };
const { renderResults, classified } = X2.buildAreaResults(
  [scrubWay, heathWay, wetlandWay, golfWay, dogParkWay, sportsWay, allotmentsWay], bbox);
check('scrub way lands in classified.grass', classified.grass.includes(scrubWay));
check('heath way lands in classified.grass', classified.grass.includes(heathWay));
check('wetland way lands in classified.grass (AF-03b)', classified.grass.includes(wetlandWay));
check('scrub/heath/wetland do NOT land in classified.landcover (kept out of the open-land signal)',
  !classified.landcover.includes(scrubWay) && !classified.landcover.includes(heathWay) && !classified.landcover.includes(wetlandWay));
check('golf/dog park/sports centre/allotments land in classified.recreation',
  classified.recreation.includes(golfWay) && classified.recreation.includes(dogParkWay) &&
  classified.recreation.includes(sportsWay) && classified.recreation.includes(allotmentsWay));
check('recreation ways do NOT leak into green/grass/landcover buckets',
  [golfWay, dogParkWay, sportsWay, allotmentsWay].every(el =>
    !classified.green.includes(el) && !classified.grass.includes(el) && !classified.landcover.includes(el)));
const landcoverRenderResult = renderResults.find(r => r.layer.id === 'landcover');
check('scrub/heath/wetland reach the landcover render bucket (paint set = landcover + grass)',
  landcoverRenderResult.data.elements.includes(scrubWay) && landcoverRenderResult.data.elements.includes(heathWay) &&
  landcoverRenderResult.data.elements.includes(wetlandWay));
const recreationRenderResult = renderResults.find(r => r.layer.id === 'parks_recreation');
check('recreation ways reach the parks_recreation render bucket',
  !!recreationRenderResult &&
  [golfWay, dogParkWay, sportsWay, allotmentsWay].every(el => recreationRenderResult.data.elements.includes(el)));
check('recreation ways do NOT reach the landcover render bucket',
  [golfWay, dogParkWay, sportsWay, allotmentsWay].every(el => !landcoverRenderResult.data.elements.includes(el)));
check("parks_recreation sits directly after parks in v2's layer order",
  X2.layerOrder.indexOf('parks_recreation') === X2.layerOrder.indexOf('parks') + 1);

// (d) regressions: named park stays 'green', farmland stays 'landcover',
// unnamed pitch/stadium stay label-only (the nameless-green rule AF-03b must
// NOT widen), and mini patches under the grass declutter floor are dropped.
const namedPark = closedWay(2001, { leisure: 'park', name: 'Vondelpark' });
const farmland = closedWay(2002, { landuse: 'farmland' });
const wetland = closedWay(2003, { natural: 'wetland' });
const miniScrub = miniWay(2004, { natural: 'scrub' });
const miniWetland = miniWay(2005, { natural: 'wetland' });
const pitch = closedWay(2006, { leisure: 'pitch' });
const stadium = closedWay(2007, { leisure: 'stadium' });
const regression = X2.classifyAreaFeatures([namedPark, farmland, wetland, miniScrub, miniWetland, pitch, stadium]);
check("named park still classifies 'green'", regression.green.includes(namedPark));
check("farmland still classifies 'landcover'", regression.landcover.includes(farmland));
check('natural=wetland is bound to the grass paint route (AF-03b), no longer label-only',
  regression.grass.includes(wetland) && !regression.labelOnly.includes(wetland));
check('natural=wetland does not leak into water/green/landcover/recreation/beach',
  !regression.water.includes(wetland) && !regression.green.includes(wetland) &&
  !regression.landcover.includes(wetland) && !regression.recreation.includes(wetland) && !regression.beach.includes(wetland));
check('unnamed pitch/stadium stay label-only (recreation rows must not widen the nameless-green rule)',
  regression.labelOnly.includes(pitch) && regression.labelOnly.includes(stadium) &&
  !regression.recreation.includes(pitch) && !regression.recreation.includes(stadium));
check('a mini scrub patch under the 80 m² declutter floor is dropped (not painted, not label-only)',
  !regression.grass.includes(miniScrub) && !regression.labelOnly.includes(miniScrub) &&
  !regression.landcover.includes(miniScrub));
check('a mini wetland patch under the 80 m² declutter floor is dropped too (same grass route)',
  !regression.grass.includes(miniWetland) && !regression.labelOnly.includes(miniWetland) &&
  !regression.landcover.includes(miniWetland));

// (f) AF-03c — urban-landuse classification signal. Institutional built land
// (landuse=institutional|education|religious) now promotes a
// buildingless-but-covered face like residential/commercial/retail and
// amenity=parking already did, at the SAME thresholds (no numbers moved).
// Industry and the working-land family must never feed the signal ("industry
// is never silently promoted to residential").
for (const lu of ['residential', 'commercial', 'retail', 'institutional', 'education', 'religious']) {
  check(`landuse=${lu} feeds the urban signal`, X2.isUrbanSignalElement({ tags: { landuse: lu } }));
}
check('amenity=parking feeds the urban signal (Coen, 2026-07-13)',
  X2.isUrbanSignalElement({ tags: { amenity: 'parking' } }));
for (const lu of ['industrial', 'brownfield', 'construction', 'depot', 'landfill', 'quarry', 'railway', 'garages', 'grass', 'farmland']) {
  check(`landuse=${lu} does NOT feed the urban signal`, !X2.isUrbanSignalElement({ tags: { landuse: lu } }));
}
check('a tagless element does not feed the urban signal', !X2.isUrbanSignalElement({}));
check('institutional/education/religious have NO AREA_FEATURES row (classification only, never painted)',
  classifyTags({ landuse: 'institutional' }) === null &&
  classifyTags({ landuse: 'education' }) === null &&
  classifyTags({ landuse: 'religious' }) === null);

// (e) determinism: re-running classification on the same elements yields the
// same bucketing (same ids in the same buckets), run to run.
const determinismSet = [scrubWay, heathWay, wetlandWay, golfWay, dogParkWay, sportsWay, allotmentsWay, namedPark, farmland, miniScrub];
const run2 = X2.classifyAreaFeatures(determinismSet);
const idsOf = (arr) => arr.map(e => e.id).sort().join(',');
const run1 = X2.classifyAreaFeatures(determinismSet);
check('classification is deterministic across repeated runs (grass bucket)', idsOf(run1.grass) === idsOf(run2.grass));
check('classification is deterministic across repeated runs (landcover bucket)', idsOf(run1.landcover) === idsOf(run2.landcover));
check('classification is deterministic across repeated runs (green bucket)', idsOf(run1.green) === idsOf(run2.green));
check('classification is deterministic across repeated runs (recreation bucket)', idsOf(run1.recreation) === idsOf(run2.recreation));
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
const patchedEngineSrc = engineSrc.replace(returnMarker, 'return {\n    layers, layerOrder, buildSVG, doExport, renderLandcover, renderRecreation, renderFallbackBlocks,');

const heavyTail = '\n;globalThis.__x2 = EngineV2;\nglobalThis.__x1 = { makeProjector, makeUidGen, getAreaLargeEps, getEps, getLineEps, PRESETS, LAYER_REGISTRY };';
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

// Wetland paints through the same landcover renderer as the quiet field tint
// (like farmland/scrub), NOT park green (AF-03b).
const wetlandSvg = V2.renderLandcover({ data: { elements: [wetlandWay] } }, ctx);
check('renderLandcover fills wetland with preset.field (field tint, like farmland)', wetlandSvg.includes(`fill="${preset.field}"`));
check('renderLandcover does NOT fill wetland with preset.park', !wetlandSvg.includes(`fill="${preset.park}"`));
check('renderLandcover emits a usable inkscape:label for the wetland element', /inkscape:label="Wetland"/.test(wetlandSvg));

// ── renderRecreation (AF-03b, v2-only) ──────────────────────────────
const namedGolf = closedWay(3101, { leisure: 'golf_course', name: 'Golfclub De Palingbeek' });
const recSvg = V2.renderRecreation({ data: { elements: [golfWay, dogParkWay, sportsWay, allotmentsWay, namedGolf] } }, ctx);
check('renderRecreation emits its own "Recreation grounds" editor group',
  recSvg.includes('<g id="parks_recreation" inkscape:label="Recreation grounds" inkscape:groupmode="layer">'));
check('renderRecreation fills recreation grounds with preset.park (park green)', recSvg.includes(`fill="${preset.park}"`));
check('renderRecreation does NOT use the field tint', !recSvg.includes(`fill="${preset.field}"`));
check('nameless elements label by kind (Golf course / Dog park / Sports centre / Allotments)',
  recSvg.includes('inkscape:label="Golf course"') && recSvg.includes('inkscape:label="Dog park"') &&
  recSvg.includes('inkscape:label="Sports centre"') && recSvg.includes('inkscape:label="Allotments"'));
check('a named recreation ground labels by its name', recSvg.includes('inkscape:label="Golfclub De Palingbeek"'));
check('renderRecreation emits one path per element', (recSvg.match(/<path /g) || []).length === 5);

// Recreation grounds join ctx.greenClipDs exactly like named parks. AF-06
// deliberately keeps an unnamed footway in its subdued base style there;
// a named path remains the useful orientation aid and gets the white twin.
const clipCtx = { ...ctx, uid: V1.makeUidGen(), greenClipDs: [] };
V2.renderRecreation({ data: { elements: [golfWay, dogParkWay] } }, clipCtx);
check('renderRecreation pushes each painted shape into ctx.greenClipDs', clipCtx.greenClipDs.length === 2);
// End-to-end: a named path crossing the golf course produces the white overlay
// group + green clipPath in a full buildSVG (roads render after
// parks_recreation in paint order, so the clip list is complete when they
// consume it).
const roadsLayerV1 = V1.LAYER_REGISTRY.flatMap(g => g.layers).find(l => l.id === 'roads');
const footway = { type: 'way', id: 4201, tags: { highway: 'footway', name: 'Golf path' },
  geometry: [ { lat: 50.9995, lon: 4.9995 }, { lat: 51.0, lon: 5.0 }, { lat: 51.0005, lon: 5.0005 } ] };
const clipSvg = V2.buildSVG([
  { layer: { id: 'parks_recreation', label: 'Recreation grounds' }, data: { elements: [golfWay] } },
  { layer: roadsLayerV1, data: { elements: [footway] } },
], bbox, 1000);
check('a named footway over a recreation ground gets the white overlay group (roads_paths_green)',
  clipSvg.includes('id="roads_paths_green"') && clipSvg.includes('id="green_clip"'));

// ── buildSVG: "Parks & green" parent nesting (AF-03b) ───────────────
// Parks and recreation grounds are adjacent in paint order and share one
// parent layer; the inner v1 parks group is relabelled "Parks" (it was "Named
// parks" until AF-07d let nameless leisure=park into the same group).
const parksLayerV1 = V1.LAYER_REGISTRY.flatMap(g => g.layers).find(l => l.id === 'parks');
const nestedSvg = V2.buildSVG([
  { layer: parksLayerV1, data: { elements: [namedPark] } },
  { layer: { id: 'parks_recreation', label: 'Recreation grounds' }, data: { elements: [golfWay] } },
], bbox, 1000);
const parentTag = '<g id="parks_green" inkscape:label="Parks &amp; green" inkscape:groupmode="layer">';
const parentIdx = nestedSvg.indexOf(parentTag);
const namedIdx = nestedSvg.indexOf('<g id="parks" inkscape:label="Parks"');
const recIdx = nestedSvg.indexOf('<g id="parks_recreation" inkscape:label="Recreation grounds"');
const parentClose = nestedSvg.indexOf('</g>', recIdx);
check('buildSVG wraps parks + recreation in one "Parks & green" parent layer', parentIdx !== -1);
check('the inner v1 parks group is relabelled "Parks" (id stays "parks")', namedIdx !== -1);
check('the recreation group sits inside the parent, after the parks group',
  parentIdx !== -1 && namedIdx > parentIdx && recIdx > namedIdx && parentClose !== -1);
check('no double "Parks & green" label survives inside the parent',
  parentIdx !== -1 && nestedSvg.indexOf('inkscape:label="Parks &amp; green"', parentIdx + parentTag.length) === -1);

// A named scrub patch labels by name (matches the landcover renderer's
// existing name-first convention, exercised here as a light regression guard
// on the row addition, not new behaviour).
const namedScrub = closedWay(3001, { natural: 'scrub', name: 'Dok-Zuid' });
const namedScrubSvg = V2.renderLandcover({ data: { elements: [namedScrub] } }, ctx);
check('a named scrub patch labels by its name', namedScrubSvg.includes('inkscape:label="Dok-Zuid"'));

// ── renderFallbackBlocks: semantic editor families (AF-03c) ─────────
// Known built/paved/worked land stays cream fallback paint but groups under
// recognizable family names ("Working land" / "Railway grounds" / "Paved
// areas") instead of one raw tag-value group each; unknown tags keep their raw
// value group and untagged land stays "Uncategorized". Pure panel
// organization — the emitted paths (paint) are unchanged.
const [cx, cy] = ctx.pr(51.0, 5.0); // centre of the test bbox, in export px
const patchAt = (px, py) => ({
  kind: 'fallback',
  outer: `M ${px - 20},${py - 20} L ${px + 20},${py - 20} L ${px + 20},${py + 20} L ${px - 20},${py + 20} Z`,
  holes: [],
});
// closedWay's default footprint (±0.0005°) covers the bbox centre, so a patch
// at (cx, cy) sits under any default-placed label element; (cx + 300, cy) is
// outside that footprint, so a patch there matches nothing → Uncategorized.
const centrePatch = () => patchAt(cx, cy);
const fbSvg = (tags, blocks = [centrePatch()], els = [closedWay(4001, tags)]) =>
  V2.renderFallbackBlocks(blocks, tags ? els : [], { ...ctx, uid: V1.makeUidGen() });

const industrialFb = fbSvg({ landuse: 'industrial' });
check('an industrial fallback patch groups under "Working land"',
  industrialFb.includes('inkscape:label="Working land"'));
check('the industrial patch itself keeps its specific "Industrial" label',
  industrialFb.includes('inkscape:label="Industrial"'));
for (const lu of ['brownfield', 'construction', 'depot', 'landfill', 'quarry']) {
  check(`landuse=${lu} groups under "Working land" too`,
    fbSvg({ landuse: lu }).includes('inkscape:label="Working land"'));
}
check('landuse=railway groups under "Railway grounds"',
  fbSvg({ landuse: 'railway' }).includes('inkscape:label="Railway grounds"'));
check('a railway=* area tag groups under "Railway grounds" too',
  fbSvg({ railway: 'yard' }).includes('inkscape:label="Railway grounds"'));
const parkingFb = fbSvg({ amenity: 'parking', name: 'Autoranta' });
check('amenity=parking groups under "Paved areas"',
  parkingFb.includes('inkscape:label="Paved areas"'));
check('the parking patch label keeps value + OSM name (Parking “Autoranta”)',
  parkingFb.includes('inkscape:label="Parking “Autoranta”"'));
check('landuse=garages groups under "Paved areas" too',
  fbSvg({ landuse: 'garages' }).includes('inkscape:label="Paved areas"'));
check('a residential remnant keeps its raw "Residential" group (no family)',
  fbSvg({ landuse: 'residential' }).includes('inkscape:label="Residential"'));
check('an untagged patch stays "Uncategorized"',
  fbSvg(null).includes('inkscape:label="Uncategorized"'));
// Ordering: family groups sort alphabetically with the other categories and
// the Uncategorized catch-all stays last.
const mixedFb = V2.renderFallbackBlocks(
  [centrePatch(), patchAt(cx + 300, cy)],
  [closedWay(4002, { landuse: 'industrial' })],
  { ...ctx, uid: V1.makeUidGen() });
const workIdx = mixedFb.indexOf('inkscape:label="Working land"');
const uncatIdx = mixedFb.indexOf('inkscape:label="Uncategorized"', mixedFb.indexOf('inkscape:groupmode="layer"') + 1);
check('mixed export: Working land group exists and the Uncategorized catch-all comes last',
  workIdx !== -1 && uncatIdx > workIdx);
check('family grouping changes no paint: both patches still emit cream paths',
  (mixedFb.match(/<path /g) || []).length === 2);

process.exit(failures ? 1 : 0);
