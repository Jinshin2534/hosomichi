const EARTH_RADIUS_M = 6371008.8;
const RAD = Math.PI / 180;
const M_PER_DEG_LAT = EARTH_RADIUS_M * RAD;

export const MAX_DISTANCE_M = 5000;
const MARGIN_RATIO = 0.2;
const MIN_MARGIN_M = 300;

export function distanceM(a, b) {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isTooFar(a, b) {
  return distanceM(a, b) > MAX_DISTANCE_M;
}

// 出発地と目的地の外接矩形に、直線距離の 20%（最低 300m）の余白を足す
export function fetchBounds(a, b) {
  const margin = Math.max(distanceM(a, b) * MARGIN_RATIO, MIN_MARGIN_M);
  const midLat = (a.lat + b.lat) / 2;
  const dLat = margin / M_PER_DEG_LAT;
  const dLon = margin / (M_PER_DEG_LAT * Math.cos(midLat * RAD));
  return {
    south: Math.min(a.lat, b.lat) - dLat,
    west: Math.min(a.lon, b.lon) - dLon,
    north: Math.max(a.lat, b.lat) + dLat,
    east: Math.max(a.lon, b.lon) + dLon,
  };
}
