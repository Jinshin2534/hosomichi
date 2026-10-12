import { HIGHWAY_KINDS } from './narrowness.js';
import { tileBounds } from './tiles.js';


const fix6 = (v) => v.toFixed(6);

export function buildRoadQuery({ south, west, north, east }) {
  const bbox = [south, west, north, east].map(fix6).join(',');
  const kinds = HIGHWAY_KINDS.join('|');
  return `[out:json][timeout:25];way["highway"~"^(${kinds})$"](${bbox});(._;>;);out body qt;`;
}

// サーバは 0.03度の固定タイル1枚だけを返す（キャッシュキーが正規化され、広い範囲も頼めない）
export function tileToParams({ tx, ty }) {
  return `tx=${tx}&ty=${ty}`;
}

export function parseTileParams(params) {
  const raw = { tx: params.get('tx'), ty: params.get('ty') };
  if (!/^-?\d+$/.test(raw.tx ?? '') || !/^-?\d+$/.test(raw.ty ?? '')) return null;
  const tile = { tx: Number(raw.tx), ty: Number(raw.ty) };
  const b = tileBounds(tile);
  if (b.south < -90 || b.north > 90 || b.west < -180 || b.east > 180) return null;
  return tile;
}

// narrowness() が読むタグだけ。ほかは通信量の無駄
const KEPT_TAGS = ['highway', 'width', 'footway', 'service', 'foot', 'access', 'area'];

export function compactOsm(osm) {
  const nodes = [];
  const ways = [];
  for (const el of osm.elements) {
    if (el.type === 'node') {
      nodes.push(el.id, el.lat, el.lon);
    } else if (el.type === 'way') {
      const tags = {};
      for (const k of KEPT_TAGS) if (el.tags && k in el.tags) tags[k] = el.tags[k];
      ways.push([el.id, el.nodes, tags]);
    }
  }
  return { nodes, ways };
}

export function expandOsm({ nodes, ways }) {
  const elements = [];
  for (let i = 0; i < nodes.length; i += 3) {
    elements.push({ type: 'node', id: nodes[i], lat: nodes[i + 1], lon: nodes[i + 2] });
  }
  for (const [id, wayNodes, tags] of ways) elements.push({ type: 'way', id, nodes: wayNodes, tags });
  return { elements };
}

// タイルの境界をまたぐ way は複数タイルに現れる（node の座標は同じ）
export function mergeOsm(list) {
  const seen = new Set();
  const elements = [];
  for (const osm of list) {
    for (const el of osm.elements) {
      const key = `${el.type}/${el.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      elements.push(el);
    }
  }
  return { elements };
}
