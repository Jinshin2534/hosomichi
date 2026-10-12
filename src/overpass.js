import { tileToParams, expandOsm, mergeOsm } from './lib/overpassQuery.js';
import { tilesForBounds } from './lib/tiles.js';

// 公開 Overpass は IP あたり同時2本まで
const CONCURRENCY = 2;

// 混雑時の 502/503/504 やネットワークエラーは、待ってから同じタイルを取り直す（最大3回試行）
export const RETRY_DELAYS_MS = [2000, 5000];
const RETRYABLE_STATUS = new Set([502, 503, 504]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 範囲を固定タイルに分けて1枚ずつ取り、つなぎ合わせる。
// dev でも本番でも同一オリジンの /api/overpass を通す（経路を1本にそろえる）
export async function fetchRoadData(bounds, onProgress = () => {}) {
  const tiles = tilesForBounds(bounds);
  const results = new Array(tiles.length);
  let next = 0;
  let done = 0;
  let failed = false;
  const controller = new AbortController();

  async function fetchTile(tile) {
    for (let attempt = 0; ; attempt++) {
      const timeout = AbortSignal.timeout(60000);
      try {
        const res = await fetch(`/api/overpass?${tileToParams(tile)}`, {
          signal: AbortSignal.any([controller.signal, timeout]),
        });
        if (!res.ok) {
          const err = new Error(`overpass proxy ${res.status}`);
          err.retryable = RETRYABLE_STATUS.has(res.status);
          throw err;
        }
        return expandOsm(await res.json());
      } catch (err) {
        const retryable = err.retryable ?? err instanceof TypeError;
        if (!retryable || controller.signal.aborted || timeout.aborted || attempt >= RETRY_DELAYS_MS.length) throw err;
        await sleep(RETRY_DELAYS_MS[attempt]);
        // 待っている間に他タイルが失敗していたら、これ以上リトライしない
        if (failed) throw err;
      }
    }
  }

  async function worker() {
    while (!failed && next < tiles.length) {
      const i = next++;
      try {
        const data = await fetchTile(tiles[i]);
        if (failed) return;
        results[i] = data;
      } catch (err) {
        // 最初の失敗で全員を止める（取得中のものは中断、以降は進捗も出さない）
        failed = true;
        controller.abort();
        throw err;
      }
      onProgress(++done, tiles.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tiles.length) }, worker));
  return mergeOsm(results);
}
