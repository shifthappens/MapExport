// tests/park-paths.mjs — offline guard for AF-06's green-path rule.
//
// White dashed paths are useful wayfinding on water, but applying that same
// treatment to every anonymous trail over green turns parks and cemeteries
// into technical-looking hatching. This exercises the actual v1 renderer
// shared by both engines: water keeps every path class white, while green
// keeps only cycleways and named paths white. Each path is emitted once inside
// the single toggleable paths layer, with a root paint pattern deciding its
// colour or transparency over water and green.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const check = (name, condition) => {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}`);
  if (!condition) failures++;
};

function loadRenderer() {
  const elProxy = new Proxy(function () {}, {
    get(_target, key) {
      if (key === 'style' || key === 'classList' || key === 'dataset') return elProxy;
      if (key === 'getContext') return () => ({ measureText: () => ({ width: 0 }) });
      if (key === 'querySelectorAll') return () => [];
      if (['textContent', 'innerHTML', 'value', 'className'].includes(key)) return '';
      if (key === 'checked') return true;
      if (typeof key === 'symbol') return undefined;
      return elProxy;
    },
    set() { return true; }, apply() { return elProxy; },
  });
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, performance,
    fetch: () => Promise.reject(new Error('no network in park-paths')),
    Blob, Response, Request, Headers, URL, AbortController, AbortSignal, TextEncoder, TextDecoder,
    document: {
      getElementById: () => elProxy, querySelector: () => elProxy, querySelectorAll: () => [],
      createElement: () => elProxy, createElementNS: () => elProxy, addEventListener() {},
      body: elProxy, documentElement: elProxy,
    },
    navigator: { userAgent: 'node', clipboard: {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
  vm.createContext(sandbox);
  const source = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');
  vm.runInContext(`${source}\n;globalThis.__X={buildSVG,LAYER_REGISTRY};`, sandbox,
    { filename: 'park-paths-sandbox.js' });
  return sandbox.__X;
}

const X = loadRenderer();
const layer = id => {
  const found = X.LAYER_REGISTRY.flatMap(group => group.layers).find(item => item.id === id);
  if (!found) throw new Error(`missing layer ${id}`);
  return found;
};
const bbox = { south: 51.000, west: 5.000, north: 51.020, east: 5.030 };
const point = (lat, lon) => ({ lat, lon });
const ring = (id, tags, south, west, north, east) => ({
  type: 'way', id, tags,
  geometry: [point(south, west), point(south, east), point(north, east), point(north, west), point(south, west)],
});
const line = (id, tags, y) => ({
  type: 'way', id, tags,
  geometry: [point(y, 5.001), point(y, 5.029)],
});

const water = ring(1, { natural: 'water', name: 'Canal' }, 51.004, 5.004, 51.016, 5.011);
const park = ring(2, { leisure: 'park', name: 'Town Park' }, 51.004, 5.019, 51.016, 5.026);
const paths = [
  line(11, { highway: 'footway' }, 51.006),
  line(12, { highway: 'steps' }, 51.008),
  line(13, { highway: 'cycleway' }, 51.010),
  line(14, { highway: 'path', name: 'Terrasse_des_N_gociants' }, 51.012),
];
const svg = X.buildSVG([
  { layer: layer('water_bodies'), data: { elements: [water] } },
  { layer: layer('parks'), data: { elements: [park] } },
  { layer: layer('roads'), data: { elements: paths } },
], bbox, 1400);
const illustratorSvg = X.buildSVG([
  { layer: layer('water_bodies'), data: { elements: [water] } },
  { layer: layer('parks'), data: { elements: [park] } },
  { layer: layer('roads'), data: { elements: paths } },
], bbox, 1400, null, null, { illustratorCompatible: true });

const pathElementCount = (markup, id) =>
  (markup.match(new RegExp(`<path id="${id}"(?:\\s|>)`, 'g')) || []).length;
const pathIds = ['footway_11', 'steps_12', 'cycleway_13', 'Terrasse_des_N_gociants'];
check('keeps every path class in one path group',
  ['roads_paths_footway', 'roads_paths_steps', 'roads_paths_cycleway', 'roads_paths_path']
    .every(id => svg.includes(`id="${id}"`)));
check('emits exactly one SVG path per OSM path entity',
  pathIds.every(id => pathElementCount(svg, id) === 1));
check('named path keeps its exact designer-facing id',
  pathElementCount(svg, 'Terrasse_des_N_gociants') === 1);
check('shares one selected paint pattern across selected path classes',
  svg.includes('<pattern id="roads_path_paint_F4AFA7_selected"') &&
  !svg.includes('roads_path_paint_cycleway_selected') &&
  !svg.includes('roads_path_paint_path_selected'));
check('shares one hidden-green paint pattern and mask across anonymous classes',
  svg.includes('<pattern id="roads_path_paint_F4AFA7_hidden"') &&
  svg.includes('<mask id="roads_path_paint_F4AFA7_hidden_outside_green"') &&
  !svg.includes('roads_path_paint_footway_hidden') &&
  !svg.includes('roads_path_paint_steps_hidden'));
check('selected paths point at their single area-aware stroke',
  svg.includes('id="cycleway_13" inkscape:label="Cycleways (13)" stroke="url(#roads_path_paint_F4AFA7_selected)"') &&
  svg.includes('id="Terrasse_des_N_gociants" inkscape:label="Terrasse_des_N_gociants" stroke="url(#roads_path_paint_F4AFA7_selected)"'));
check('anonymous paths point at a masked stroke and have no duplicate path copy',
  svg.includes('id="footway_11" inkscape:label="Footways (11)" stroke="url(#roads_path_paint_F4AFA7_hidden)"') &&
  svg.includes('id="steps_12" inkscape:label="Steps (12)" stroke="url(#roads_path_paint_F4AFA7_hidden)"') &&
  pathIds.every(id => pathElementCount(svg, id) === 1));
check('paint definitions are emitted once at the document root',
  svg.indexOf('<pattern id="roads_path_paint_') < svg.indexOf('<g id="map-content"'));
check('there are no legacy water or park duplicate groups',
  !svg.includes('water_clip') && !svg.includes('green_clip') &&
  !svg.includes('roads_paths_water') && !svg.includes('roads_paths_green') &&
  !svg.includes('roads_paths_green_hidden') && !svg.includes('roads_paths_green_outside'));
check('Illustrator output keeps patterns and masks in root defs',
  illustratorSvg.includes('<pattern id="roads_path_paint_F4AFA7_hidden"') &&
  illustratorSvg.includes('<mask id="roads_path_paint_F4AFA7_hidden_outside_green"') &&
  illustratorSvg.indexOf('<mask id="roads_path_paint_F4AFA7_hidden_outside_green"') < illustratorSvg.indexOf('<g id="map-content"') &&
  !illustratorSvg.includes('inkscape:'));

const outsideSvg = X.buildSVG([
  { layer: layer('roads'), data: { elements: paths } },
], bbox, 1400);
check('paths outside water and green need no paint pattern',
  !outsideSvg.includes('<pattern id="roads_path_paint_') &&
  outsideSvg.includes('id="roads_paths_footway"') &&
  pathIds.slice(0, 2).every(id => pathElementCount(outsideSvg, id) === 1));

const anonymousOnlySvg = X.buildSVG([
  { layer: layer('parks'), data: { elements: [park] } },
  { layer: layer('roads'), data: { elements: [paths[0], paths[1]] } },
], bbox, 1400);
check('anonymous-only green exports still emit one masked path each',
  anonymousOnlySvg.includes('<pattern id="roads_path_paint_F4AFA7_hidden"') &&
  anonymousOnlySvg.includes('<mask id="roads_path_paint_F4AFA7_hidden_outside_green"') &&
  pathIds.slice(0, 2).every(id => pathElementCount(anonymousOnlySvg, id) === 1) &&
  !anonymousOnlySvg.includes('roads_paths_green_hidden'));
check('the single paths layer remains the toggle boundary',
  (anonymousOnlySvg.match(/<g id="roads_paths"/g) || []).length === 1 &&
  anonymousOnlySvg.includes('id="footway_11" inkscape:label="Footways (11)" stroke="url(#roads_path_paint_F4AFA7_hidden)"') &&
  !anonymousOnlySvg.includes('id="roads_paths_green_hidden"'));

if (failures) {
  console.error(`\n${failures} park-paths check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log('\nAll park-paths checks passed.');
}
