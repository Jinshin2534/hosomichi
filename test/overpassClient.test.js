import { describe, it, expect, afterEach, vi } from 'vitest';
import { fetchRoadData } from '../src/overpass.js';
import { tilesForBounds, TILE_DEG } from '../src/lib/tiles.js';

const bounds = { south: 35.0, west: 139.0, north: 35.0 + TILE_DEG * 1.5, east: 139.0 + TILE_DEG * 1.5 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

afterEach(() => vi.unstubAllGlobals());

describe('fetchRoadData', () => {
  it('タイルが1枚失敗したら reject し、その後は onProgress も新規取得もしない。同時取得は2本まで', async () => {
    expect(tilesForBounds(bounds).length).toBeGreaterThanOrEqual(4);
    let inFlight = 0;
    let maxInFlight = 0;
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      const n = calls++;
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await sleep(n === 1 ? 5 : 30); // 2本目が先に 502 で落ち、1本目は取得中のまま残る
      inFlight--;
      if (n === 1) return { ok: false, status: 502, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ nodes: [], ways: [] }) };
    });

    const progress = [];
    await expect(fetchRoadData(bounds, (d, t) => progress.push([d, t]))).rejects.toThrow();
    const afterReject = progress.length;
    const callsAfterReject = calls;
    for (let i = 0; i < 5; i++) await sleep(20);

    expect(progress.length).toBe(afterReject);
    expect(calls).toBe(callsAfterReject);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });
});
