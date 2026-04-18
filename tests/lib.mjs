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

export async function postOverpass(query, { endpointIdx = 0 } = {}) {
  const ep = OVERPASS_ENDPOINTS[endpointIdx % OVERPASS_ENDPOINTS.length];
  const body = 'data=' + encodeURIComponent(query);
  const t0 = Date.now();
  const res = await fetch(ep, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(120_000),
  });
  const elapsed = Date.now() - t0;
  if (!res.ok) throw new Error(`Overpass ${ep} HTTP ${res.status}`);
  const json = await res.json();
  const bytes = JSON.stringify(json).length;
  return { ep, json, elapsed, bytes };
}

export async function fetchLayer(layer, bbox) {
  const q = `[out:json][timeout:60];(${layer.overpassQuery(bboxStr(bbox))});out body geom qt;`;
  return postOverpass(q);
}

export function elementIdSet(elements) {
  return new Set((elements || []).map(e => `${e.type[0]}${e.id}`));
}

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
export { path, fs };
