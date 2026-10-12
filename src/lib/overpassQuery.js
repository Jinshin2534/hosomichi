import { HIGHWAY_KINDS } from './narrowness.js';

// 5km＋余白でも収まる上限（日本の緯度なら東西 0.1 度 ≈ 8〜9km）
const MAX_SPAN_DEG = 0.1;
const KEYS = [
  ['s', 'south'],
  ['w', 'west'],
  ['n', 'north'],
  ['e', 'east'],
];

const fix6 = (v) => v.toFixed(6);

export function buildRoadQuery({ south, west, north, east }) {
  const bbox = [south, west, north, east].map(fix6).join(',');
  const kinds = HIGHWAY_KINDS.join('|');
  return `[out:json][timeout:25];way["highway"~"^(${kinds})$"](${bbox});(._;>;);out body qt;`;
}

export function boundsToParams(bounds) {
  return KEYS.map(([short, long]) => `${short}=${fix6(bounds[long])}`).join('&');
}

export function parseBoundsParams(params) {
  const b = {};
  for (const [short, long] of KEYS) {
    const raw = params.get(short);
    if (raw === null || raw.trim() === '') return null;
    const v = Number(raw);
    if (!Number.isFinite(v)) return null;
    b[long] = v;
  }
  if (b.south < -90 || b.north > 90 || b.west < -180 || b.east > 180) return null;
  if (b.south >= b.north || b.west >= b.east) return null;
  if (b.north - b.south > MAX_SPAN_DEG || b.east - b.west > MAX_SPAN_DEG) return null;
  return b;
}
