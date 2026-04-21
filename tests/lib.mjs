import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

export const TILBURG = {
  name: 'tilburg',
  south: 51.530, west: 5.040, north: 51.590, east: 5.130,
};

export function bboxStr(b) { return `${b.south},${b.west},${b.north},${b.east}`; }

export const OVERPASS_ENDPOINTS = [
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];

export const SCRIPT_PATH = path.join(ROOT, 'script.js');
export const FIXTURE_DIR = path.join(HERE, 'fixtures', TILBURG.name);

// Parse LAYER_REGISTRY out of script.js.
// Matches { id:'<id>', ... overpassQuery:(b)=>`<template>`, ... }
// Template must not contain unescaped backticks (current code doesn't).
export function extractLayers(scriptSrc = fs.readFileSync(SCRIPT_PATH, 'utf8')) {
  const layers = [];
  const matches = [...scriptSrc.matchAll(/\{\s*id:'([a-z_]+)'/g)];
  for (let i = 0; i < matches.length; i++) {
    const id = matches[i][1];
    const from = matches[i].index;
    const to = i + 1 < matches.length ? matches[i + 1].index : scriptSrc.length;
    const slice = scriptSrc.slice(from, to);
    const qMatch = slice.match(/overpassQuery:\(b\)=>`([^`]+)`/);
    if (!qMatch) continue;
    const template = qMatch[1];
    layers.push({
      id,
      queryTemplate: template,
      overpassQuery: (b) => template.replaceAll('${b}', b),
    });
  }
  return layers;
}

const epBackoff = new Map(); // ep -> { until, delay }

function pickEndpoint() {
  const now = Date.now();
  return OVERPASS_ENDPOINTS.find(ep => {
    const b = epBackoff.get(ep);
    return !b || now >= b.until;
  }) || null;
}

function record429(ep) {
  const prev = epBackoff.get(ep);
  const next = Math.min((prev?.delay || 5000) * 2, 60_000);
  epBackoff.set(ep, { until: Date.now() + next, delay: next });
  return next;
}

export async function postOverpass(query, { maxAttempts = 8 } = {}) {
  let attempt = 0;
  while (attempt < maxAttempts) {
    let ep = pickEndpoint();
    if (!ep) {
      const soonest = Math.min(...OVERPASS_ENDPOINTS.map(e => epBackoff.get(e)?.until || 0));
      const wait = Math.max(1000, soonest - Date.now() + 200);
      process.stdout.write(`(all endpoints cooling, wait ${(wait/1000).toFixed(1)}s) `);
      await sleep(wait);
      continue;
    }
    const body = 'data=' + encodeURIComponent(query);
    const t0 = Date.now();
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'USE-IT-MapExport/1.0 (https://coen.at/mapexport; hello@coen.at)',
        },
        body,
        signal: AbortSignal.timeout(180_000),
      });
      const elapsed = Date.now() - t0;
      if (res.status === 429) {
        const waited = record429(ep);
        process.stdout.write(`(429 on ${new URL(ep).hostname}, cooling ${(waited/1000).toFixed(0)}s) `);
        attempt++;
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const bytes = JSON.stringify(json).length;
      return { ep, json, elapsed, bytes };
    } catch (err) {
      process.stdout.write(`(${err.message} on ${new URL(ep).hostname}) `);
      record429(ep);
      attempt++;
    }
  }
  throw new Error(`Overpass failed after ${maxAttempts} attempts across all endpoints`);
}

export async function fetchLayer(layer, bbox) {
  const q = `[out:json][timeout:60];(${layer.overpassQuery(bboxStr(bbox))});out body geom qt;`;
  return postOverpass(q);
}

// For fixtures: strip geometry + member details, keep only what tests need
// (type, id, tags). Reduces fixture size by ~10-20x without losing any
// information used by query-equivalence or tagFilter-based pipeline-equivalence.
export function slimElement(el) {
  const out = { type: el.type, id: el.id };
  if (el.tags) out.tags = el.tags;
  return out;
}
export function slimResponse(json) {
  return { ...json, elements: (json.elements || []).map(slimElement) };
}

export function elementIdSet(elements) {
  return new Set((elements || []).map(e => `${e.type[0]}${e.id}`));
}

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
export { path, fs };
