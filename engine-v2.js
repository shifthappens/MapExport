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
// Milestone 2 (face cutter): v2 renders roads plus building-presence city
// blocks and rural hamlet blobs. The block model is deliberately different
// from v1: it has NO water heuristics at all (no winding, no island checks,
// no interior-point water tests). A face is a city block purely because it
// is small and contains a building; water/green subtraction and the coverage
// fallback pass arrive in milestone 3. See
// plans/2026-07-10_export-engine-v2.md — the milestone checkboxes there are
// the single source of truth for progress.

const EngineV2 = (() => {
  // v2's flat layer list. Renderable layers reuse v1's own registry objects,
  // looked up (not copied): identical overpassQuery → identical layerQHash →
  // v1 and v2 share the same cache.php entries for free.
  const roadsLayer = LAYER_REGISTRY.flatMap(g => g.layers).find(l => l.id === 'roads');

  // Rail, tram and metro are cutter input only in this milestone: v1 cuts
  // faces with all three (a hard block boundary in the USE-IT style), but v2
  // does not yet draw them — that port lands in milestone 4. So they are
  // fetch-only inputs alongside buildings, kept out of the rendered results.
  // Underground segments drop out via the tunnel filter, so a metro line only
  // cuts where it actually surfaces.
  const railLayer = LAYER_REGISTRY.flatMap(g => g.layers).find(l => l.id === 'rail');
  const tramLayer = LAYER_REGISTRY.flatMap(g => g.layers).find(l => l.id === 'tram');
  const metroLayer = LAYER_REGISTRY.flatMap(g => g.layers).find(l => l.id === 'metro');

  // Buildings are fetched for every v2 export (bounding boxes) and serve two
  // purposes: classifying faces (does a small face contain a building?) and
  // forming hamlet blobs inside rural faces. Reuse v1's BLOCK_BUILDINGS_LAYER
  // object directly so its cache entry is shared. Fetch-only, never rendered.
  const buildingsLayer = BLOCK_BUILDINGS_LAYER;

  // v2 owns its own city_blocks layer entry (derived — no overpassQuery). The
  // blocks are computed by the face worker and pushed in as a result whose
  // data carries { blocks }, not { elements }.
  const cityBlocksLayer = { id: 'city_blocks', label: 'City blocks', type: 'derived' };

  const layers = [roadsLayer, railLayer, tramLayer, metroLayer, buildingsLayer, cityBlocksLayer];

  // Fetched to feed the face cutter, but never rendered in this milestone.
  const fetchOnlyIds = new Set([railLayer.id, tramLayer.id, metroLayer.id, buildingsLayer.id]);

  // The full v2 paint order from the plan. Only roads and city_blocks render
  // yet, but the sort is written against the complete order so later
  // milestones drop their layers into place without touching the assembler.
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

  // Cream fill for city blocks. v1 renders blocks as #FEF6ED at
  // fill-opacity="0.8" over white — a pure style choice from commit a7ab512.
  // v2 bakes that flattened colour as a solid fill with no opacity attribute,
  // deliberately: the opacity carried no meaning, so folding it out keeps the
  // block a single opaque paint that later layers can sit cleanly above.
  const CREAM = '#FEF8F1';

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
  //  FACE CUTTER — Web Worker + ClipperLib
  //
  //  Faces = bbox minus the buffered road/rail cutter network (the same first
  //  stage as v1). Each face is then classified by building presence alone:
  //   - small face with >= 1 building  → cream city block (the face IS the
  //     block; water/green subtraction is milestone 3),
  //   - small face with no building    → nothing,
  //   - large (countryside) face       → no cream, only hamlet blobs built
  //     from the building bounding boxes.
  //  There are NO water heuristics anywhere in here by design.
  // ════════════════════════════════════════════════════════════════

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

  // Confetti guard: faces and hamlet blobs below 400 px² are dropped as
  // traffic-island noise. Ported from v1's minArea.
  const minArea = 400 * SCALE * SCALE;

  const rawFaces = [];
  function collectFace(node) {
    if (node.IsHole()) return;
    const contour = node.Contour();
    if (contour && contour.length >= 3 && Math.abs(Clipper.Clipper.Area(contour)) >= minArea) {
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

  const blocks = [];
  for (const face of rawFaces) {
    const netAreaScaled = Math.abs(Clipper.Clipper.Area(face.outer))
      - face.holes.reduce((sum, h) => sum + Math.abs(Clipper.Clipper.Area(h)), 0);

    if (netAreaScaled >= bigFaceScaled) {
      // Large (countryside) face: no cream fill. Emit one hamlet blob per
      // building cluster clipped to the face.
      if (clusterPolys && clusterPolys.length) {
        const intersectClipper = new Clipper.Clipper();
        intersectClipper.AddPath(face.outer, Clipper.PolyType.ptSubject, true);
        for (const h of face.holes) intersectClipper.AddPath(h, Clipper.PolyType.ptSubject, true);
        intersectClipper.AddPaths(clusterPolys, Clipper.PolyType.ptClip, true);
        const hamletTree = new Clipper.PolyTree();
        intersectClipper.Execute(Clipper.ClipType.ctIntersection, hamletTree, Clipper.PolyFillType.pftNonZero, Clipper.PolyFillType.pftNonZero);
        (function collectHamlets(nodes) {
          for (const node of nodes) {
            if (!node.IsHole()) {
              const contour = node.Contour();
              if (contour && contour.length >= 3 && Math.abs(Clipper.Clipper.Area(contour)) >= minArea) {
                const outerD = toPathD(contour);
                if (outerD) {
                  const holeDs = [];
                  for (let i = 0; i < node.ChildCount(); i++) {
                    const hc = node.Childs()[i].Contour();
                    if (hc && hc.length >= 3) { const hd = toPathD(hc); if (hd) holeDs.push(hd); }
                  }
                  blocks.push({ kind: 'hamlet', outer: outerD, holes: holeDs, areaPx: Math.abs(Clipper.Clipper.Area(contour)) / (SCALE * SCALE) });
                }
              }
            }
            collectHamlets(node.Childs());
          }
        })(hamletTree.Childs());
      }
      continue;
    }

    // Small face: a city block only if it contains at least one building. Test
    // each building bbox centre against the face outer ring (respecting holes),
    // with a face-bbox prefilter first so 20k+ buildings × N faces stays fast.
    const outerRing = face.outer.map(p => [p.X / SCALE, p.Y / SCALE]);
    const holeRings = face.holes.map(h => h.map(p => [p.X / SCALE, p.Y / SCALE]));
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of outerRing) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
    let hasBuilding = false;
    for (const center of buildingCenters) {
      const cx = center[0], cy = center[1];
      if (cx < minX || cx > maxX || cy < minY || cy > maxY) continue;
      if (!pointInRing(cx, cy, outerRing)) continue;
      let inHole = false;
      for (const holeRing of holeRings) {
        if (pointInRing(cx, cy, holeRing)) { inHole = true; break; }
      }
      if (inHole) continue;
      hasBuilding = true;
      break;
    }
    if (!hasBuilding) continue;

    const outerD = toPathD(face.outer);
    if (!outerD) continue;
    const holeDs = face.holes.map(h => toPathD(h)).filter(d => d);
    blocks.push({ kind: 'urban', outer: outerD, holes: holeDs, areaPx: netAreaScaled / (SCALE * SCALE) });
  }

  self.postMessage({ type: 'done', blocks: blocks });
};
`;

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
  function buildingCenterPx(el, pr) {
    if (el.bounds) {
      const { minlat, minlon, maxlat, maxlon } = el.bounds;
      return pr((minlat + maxlat) / 2, (minlon + maxlon) / 2);
    }
    if (el.geometry?.length) {
      let sLat = Infinity, nLat = -Infinity, wLon = Infinity, eLon = -Infinity;
      for (const g of el.geometry) {
        if (g.lat < sLat) sLat = g.lat;
        if (g.lat > nLat) nLat = g.lat;
        if (g.lon < wLon) wLon = g.lon;
        if (g.lon > eLon) eLon = g.lon;
      }
      return pr((sLat + nLat) / 2, (wLon + eLon) / 2);
    }
    return null;
  }

  // Build the face-worker payload from the cutter results (roads + rail) and
  // the fetched building elements. Projects + simplifies the cutter polylines
  // exactly like v1's prepareBlockData (same merge, same epsilon, same widths)
  // so the face edge traces the same line the renderer strokes.
  function prepareFaceData(cutterResults, buildingElements, pr, W, H, bbox) {
    const scaleFactor = getScaleFactor(W);
    const roadEps = getEps();

    const cutterLines = []; // { pts: [[x,y], ...], halfW }
    for (const { layer, data } of cutterResults) {
      if (!data?.elements?.length) continue;

      // Roads → lines with half-width. Merge named ways first (the renderer
      // strokes the stitched run, so simplifying the pieces would drift), and
      // drop tunnels before merging so a tunnel segment can't bound a face.
      if (layer.type === 'roads') {
        const surface = data.elements.filter(el => !isTunnel(el));
        for (const el of mergeNamedWays(surface)) {
          const highway = el.tags?.highway || '_default';
          if (!BLOCK_ROADS.has(highway)) continue;
          const width = ROAD_WIDTHS[highway] || ROAD_WIDTHS._default;
          const halfW = (width.fillW + width.casingW) * scaleFactor / 2 - ROAD_TUCK;
          const pts = dpSimplify(el.geometry.map(g => pr(g.lat, g.lon)), roadEps);
          if (pts.length >= 2) cutterLines.push({ pts, halfW });
        }
      }

      // Rail/tram/metro → lines, cut at v1's fixed rail half-width (no
      // ROAD_TUCK — they carry no casing the block hides under). Tunnels
      // dropped too, so underground lines never bound a face.
      if (layer.type === 'rail' || layer.type === 'tram' || layer.type === 'metro') {
        for (const el of data.elements) {
          if (el.type !== 'way' || !el.geometry?.length || el.geometry.length < 2) continue;
          if (isTunnel(el)) continue;
          const halfW = 20 * scaleFactor / 2;
          const pts = dpSimplify(el.geometry.map(g => pr(g.lat, g.lon)), roadEps);
          if (pts.length >= 2) cutterLines.push({ pts, halfW });
        }
      }
    }

    // Building centres for classification, building rings for hamlet blobs.
    const buildingCenters = [];
    for (const el of (buildingElements || [])) {
      const center = buildingCenterPx(el, pr);
      if (center) buildingCenters.push(center);
    }
    const clusterRings = prepareClusterData(buildingElements || [], pr);

    // Ground scale, for the countryside threshold and the hamlet buffers
    // (metres → px). Mercator stretch across a city-scale bbox is negligible
    // for either. COUNTRYSIDE_MIN_KM2 is v1's shared 0.35 km² constant.
    const midLat = (bbox.north + bbox.south) / 2;
    const mPerPx = ((bbox.east - bbox.west) * 111320 * Math.cos(midLat * Math.PI / 180)) / W;
    const bigFacePx2 = COUNTRYSIDE_MIN_KM2 * 1e6 / (mPerPx * mPerPx);

    return { cutterLines, buildingCenters, clusterRings, W, H, bigFacePx2, mPerPx };
  }

  // Run the face cutter in a Web Worker. Resolves { blocks }. Mirrors v1's
  // computeBlocksAsync lifecycle; the message protocol is shape-compatible
  // with v1's ({type:'progress'} / {type:'done', ...}).
  function computeFacesAsync(cutterResults, buildingElements, pr, W, H, onProgress, opts = {}) {
    return new Promise((resolve) => {
      const data = prepareFaceData(cutterResults, buildingElements, pr, W, H, opts.bbox);
      if (!data.cutterLines.length) { resolve({ blocks: [] }); return; }

      const worker = new Worker(getFaceWorkerUrl());
      worker.onmessage = function(e) {
        if (e.data.type === 'progress' && onProgress) onProgress(e.data.msg, e.data.pct);
        if (e.data.type === 'done') {
          worker.terminate();
          resolve({ blocks: e.data.blocks });
        }
      };
      worker.onerror = function(err) {
        worker.terminate();
        console.error('Face worker error:', err);
        resolve({ blocks: [] }); // fail gracefully — skip blocks
      };
      worker.postMessage(data);
    });
  }

  // Render the derived city_blocks result. One <path> per block, cream, no
  // stroke, evenodd (holes arrive in M3). Urban and hamlet blocks share the
  // same paint; only their id/label conventions differ, following v1.
  function renderCityBlocks(blocks) {
    if (!blocks || !blocks.length) return '';
    let urbanCount = 0, hamletCount = 0;
    const paths = blocks.map(blk => {
      const isHamlet = blk.kind === 'hamlet';
      const [id, label] = isHamlet
        ? [`hamlet_${++hamletCount}`, `Hamlet ${hamletCount}`]
        : [`block_${++urbanCount}`, `Block ${urbanCount}`];
      const d = blk.outer + (blk.holes && blk.holes.length ? ' ' + blk.holes.join(' ') : '');
      return `<path id="${id}" inkscape:label="${label}" d="${d}" fill="${CREAM}" fill-rule="evenodd" stroke="none"/>`;
    }).join('\n    ');
    return `  <g id="city_blocks" inkscape:label="City blocks" inkscape:groupmode="layer">\n    ${paths}\n  </g>\n`;
  }

  // v2's per-layer dispatcher. city_blocks renders from precomputed worker
  // geometry; fetch-only inputs (rail, buildings) never render here; every
  // other type is still byte-for-byte v1, delegated to renderLayerSVG.
  function renderLayer(result, ctx) {
    if (fetchOnlyIds.has(result.layer.id)) return '';
    if (result.layer.id === 'city_blocks') return renderCityBlocks(result.data?.blocks || []);
    return renderLayerSVG(result, ctx);
  }

  // v2's one-shot assembly, mirroring v1's buildSVG. Results-only: the caller
  // has already computed the blocks and separated out the fetch-only inputs.
  //
  // Context: we reuse v1's buildSVGContext unchanged, with precomputedBlocks
  // = null — v2's blocks ride in a result's data.blocks, not ctx.
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
      const { elements, failedTiles } = await fetchLayer(layer, bboxStr, bbox);
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
      progress.end();
      document.getElementById('btn-export').disabled = false;
      setStatus('Nothing to render — check your connection', 'error');
      return;
    }

    // Faces stage. The cutter reads roads + rail; buildings classify faces and
    // seed hamlet blobs. Buildings and rail are fetch-only, so they are kept
    // out of the rendered result set below.
    progress.setStage('faces', 'active', { detail: 'Starting worker…' });
    const { pr, H } = makeProjector(bbox, widthPx);
    const buildingElements = results.find(r => r.layer.id === buildingsLayer.id)?.data.elements || [];
    const cutterResults = results.filter(r => r.layer.id !== buildingsLayer.id); // everything but buildings: roads + rail/tram/metro
    const onFaceProgress = (msg, pct) => {
      progress.setStage('faces', 'active', { detail: msg });
      progress.bar(55 + Math.round(pct * 0.25));
    };
    const { blocks } = await computeFacesAsync(cutterResults, buildingElements, pr, widthPx, H, onFaceProgress, { bbox });
    const urbanBlocks = blocks.filter(b => (b.kind || 'urban') === 'urban').length;
    const hamletBlocks = blocks.filter(b => b.kind === 'hamlet').length;
    progress.setStage('faces', 'done', { meta: `${blocks.length} blocks` });
    progress.log(`city_blocks: ${blocks.length} blocks (${urbanBlocks} urban, ${hamletBlocks} hamlet)`);

    // Renderable results = everything except the fetch-only inputs, plus the
    // derived blocks. This keeps buildSVG results-only.
    const renderableResults = results.filter(r => !fetchOnlyIds.has(r.layer.id));
    renderableResults.push({ layer: cityBlocksLayer, data: { blocks } });

    // Cache for the shared live-preview path.
    lastResults = renderableResults;

    // Render stage.
    progress.setStage('render', 'active', { detail: 'Assembling SVG…' });
    await new Promise((r) => setTimeout(r, 0));
    const svg = buildSVG(renderableResults, bbox, widthPx, physicalWidthMm, { illustratorCompatible });
    progress.setStage('render', 'done', { meta: `${renderableResults.length} layer${renderableResults.length > 1 ? 's' : ''}`, detail: '' });
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
    setStatus(`✓ Engine v2 · ${widthPx}px wide · ${actualMB} MB · ${blocks.length} blocks`, 'success');
    saveHistory(bbox, activePreset, widthPx, filename, actualMB, totalElements, areaName);
  }

  return {
    layers, layerOrder, buildSVG, doExport,
    // Exposed for the headless test harness (tests/real-export.mjs).
    FACE_WORKER_SRC, prepareFaceData, fetchOnlyIds, buildingsLayer, cityBlocksLayer,
  };
})();
