// 道の狭さ点数 n（0〜1、1が一番狭い）。
// 日本の OSM では width タグはまれなので、あれば実測、なければ highway 種別から推定する。

export const NARROW_THRESHOLD = 0.7;

const HIGHWAY_N = {
  steps: 0.9,
  footway: 0.9,
  path: 0.9,
  track: 0.9,
  cycleway: 0.9,
  living_street: 0.75,
  pedestrian: 0.75,
  service: 0.6,
  residential: 0.5,
  unclassified: 0.5,
  road: 0.5,
  tertiary: 0.2,
  tertiary_link: 0.2,
  secondary: 0.05,
  secondary_link: 0.05,
  primary: 0.05,
  primary_link: 0.05,
  trunk: 0.05,
  trunk_link: 0.05,
};

export const HIGHWAY_KINDS = Object.keys(HIGHWAY_N);

const FOOT_ALLOWED = new Set(['yes', 'designated', 'permissive']);

export function parseWidth(value) {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d+(?:\.\d+)?)\s*(?:m|meters?|metres?)?$/i);
  if (!m) return null;
  const width = Number(m[1]);
  return width > 0 ? width : null;
}

function widthToN(width) {
  if (width <= 2) return 1.0;
  if (width <= 4) return 0.75;
  if (width <= 6) return 0.4;
  return 0.1;
}

export function isExcluded(tags) {
  const highway = tags.highway;
  if (!highway || !(highway in HIGHWAY_N)) return true;
  if (tags.area === 'yes') return true;
  if (tags.foot === 'no') return true;
  if (highway === 'cycleway' && tags.foot !== 'yes' && tags.foot !== 'designated') return true;
  if ((tags.access === 'private' || tags.access === 'no') && !FOOT_ALLOWED.has(tags.foot)) {
    return true;
  }
  return false;
}

export function narrowness(tags) {
  if (isExcluded(tags)) return null;
  const width = parseWidth(tags.width);
  if (width !== null) return { n: widthToN(width), source: 'measured' };
  // 大通り沿いの歩道は footway でも実質は大通り
  if (tags.footway === 'sidewalk') return { n: 0.05, source: 'estimated' };
  if (tags.service === 'alley') return { n: 0.9, source: 'estimated' };
  return { n: HIGHWAY_N[tags.highway], source: 'estimated' };
}
