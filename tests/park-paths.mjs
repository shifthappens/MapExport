// tests/park-paths.mjs — offline guard for AF-06's green-path rule.
//
// White dashed paths are useful wayfinding on water, but applying that same
// treatment to every anonymous trail over green turns parks and cemeteries
// into technical-looking hatching. This exercises the actual v1 renderer
// shared by both engines: water keeps every path class white, while green
// keeps only cycleways and named paths white. Anonymous trails are removed from
// the visible green-area paint entirely; an optional hidden group retains them
// for editors, while the visible copy remains present outside green.
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
  line(14, { highway: 'path', name: 'Promenade' }, 51.012),
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

check('keeps every path class in the path export',
  ['roads_paths_footway', 'roads_paths_steps', 'roads_paths_cycleway', 'roads_paths_path']
    .every(id => svg.includes(`id="${id}"`) || svg.includes(`id="${id}_outside_green"`)));
check('keeps a distinct water clip and overlay root',
  svg.includes('id="water_clip"') && svg.includes('id="roads_paths_water"'));
check('water keeps every path class white for contrast',
  ['roads_paths_footway_on_water', 'roads_paths_steps_on_water', 'roads_paths_cycleway_on_water', 'roads_paths_path_on_water']
    .every(id => svg.includes(`id="${id}"`)));
check('keeps a distinct green clip and selected-path overlay root',
  svg.includes('id="green_clip"') && svg.includes('id="roads_paths_green"'));
check('green keeps the white overlay for cycleways and named paths',
  svg.includes('id="roads_paths_cycleway_on_green"') && svg.includes('id="roads_paths_path_on_green"'));
check('green has an inverse mask for the visible anonymous-path copy',
  svg.includes('id="green_mask"') && svg.includes('mask="url(#green_mask)"'));
check('green places anonymous footways and steps in the outside-green copy',
  svg.includes('id="roads_paths_footway_outside_green"') &&
  svg.includes('id="roads_paths_steps_outside_green"'));
check('anonymous green paths are absent from the visible base path groups',
  !svg.includes('<g id="roads_paths_footway"') &&
  !svg.includes('<g id="roads_paths_steps"'));
check('green has no legacy park-coloured anonymous-path overlay',
  !svg.includes('id="roads_paths_footway_muted_on_green"') &&
  !svg.includes('id="roads_paths_steps_muted_on_green"'));
check('green retains anonymous paths only in an off-by-default optional group',
  svg.includes('id="roads_paths_green_hidden"') &&
  svg.includes('inkscape:label="Anonymous paths in parks (optional)"') &&
  svg.includes('style="display:none"') &&
  svg.includes('id="roads_paths_footway_hidden_in_green"') &&
  svg.includes('id="roads_paths_steps_hidden_in_green"'));
check('Illustrator output keeps the inverse mask in root defs',
  illustratorSvg.includes('<mask id="green_mask"') &&
  illustratorSvg.indexOf('<mask id="green_mask"') < illustratorSvg.indexOf('<g id="roads_paths_green_outside"') &&
  illustratorSvg.includes('style="display:none"') &&
  !illustratorSvg.includes('inkscape:'));

const outsideSvg = X.buildSVG([
  { layer: layer('roads'), data: { elements: paths } },
], bbox, 1400);
check('paths outside water and green have no clipped white overlay',
  !outsideSvg.includes('roads_paths_water') && !outsideSvg.includes('roads_paths_green') &&
  outsideSvg.includes('id="roads_paths_footway"'));

const anonymousOnlySvg = X.buildSVG([
  { layer: layer('parks'), data: { elements: [park] } },
  { layer: layer('roads'), data: { elements: [paths[0], paths[1]] } },
], bbox, 1400);
check('anonymous-only green exports still include the masked visible copy',
  anonymousOnlySvg.includes('id="roads_paths_green_outside"') &&
  anonymousOnlySvg.includes('id="roads_paths_green_hidden"') &&
  anonymousOnlySvg.includes('id="roads_paths_footway_outside_green"'));

if (failures) {
  console.error(`\n${failures} park-paths check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log('\nAll park-paths checks passed.');
}
