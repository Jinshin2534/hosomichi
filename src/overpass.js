import { boundsToParams } from './lib/overpassQuery.js';

// dev でも本番でも同一オリジンの /api/overpass を通す（経路を1本にそろえる）
export async function fetchRoadData(bounds) {
  const res = await fetch(`/api/overpass?${boundsToParams(bounds)}`, {
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`overpass proxy ${res.status}`);
  return res.json();
}
