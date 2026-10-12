import { tileToParams, expandOsm, mergeOsm } from './lib/overpassQuery.js';
import { tilesForBounds } from './lib/tiles.js';

// 公開 Overpass は IP あたり同時2本まで
const CONCURRENCY = 2;

// 範囲を固定タイルに分けて1枚ずつ取り、つなぎ合わせる。
// dev でも本番でも同一オリジンの /api/overpass を通す（経路を1本にそろえる）
export async function fetchRoadData(bounds, onProgress = () => {}) {
  const tiles = tilesForBounds(bounds);
  const results = new Array(tiles.length);
  let next = 0;
  let done = 0;

  async function worker() {
    while (next < tiles.length) {
      const i = next++;
      const res = await fetch(`/api/overpass?${tileToParams(tiles[i])}`, {
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) throw new Error(`overpass proxy ${res.status}`);
      results[i] = expandOsm(await res.json());
      onProgress(++done, tiles.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tiles.length) }, worker));
  return mergeOsm(results);
}
