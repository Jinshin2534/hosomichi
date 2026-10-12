import { describe, it, expect, afterEach, vi } from 'vitest';
import { fetchRoadData, RETRY_DELAYS_MS } from '../src/overpass.js';
import { tilesForBounds, TILE_DEG } from '../src/lib/tiles.js';

const bounds = { south: 35.0, west: 139.0, north: 35.0 + TILE_DEG * 1.5, east: 139.0 + TILE_DEG * 1.5 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

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
      await sleep(n === 1 ? 5 : 30); // 2本目が先に 400 で落ち、1本目は取得中のまま残る
      inFlight--;
      if (n === 1) return { ok: false, status: 400, json: async () => ({}) };
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

  it('RETRY_DELAYS_MS は 2秒・5秒', () => {
    expect(RETRY_DELAYS_MS).toEqual([2000, 5000]);
  });

  // URL ごとの呼び出し回数を数え、first タイルだけ statuses の順に応答するスタブ
  function stubByUrl(statuses) {
    const counts = new Map();
    vi.stubGlobal('fetch', async (url) => {
      const n = counts.get(url) ?? 0;
      counts.set(url, n + 1);
      const first = [...counts.keys()][0];
      const st = url === first ? (statuses[n] ?? statuses[statuses.length - 1]) : 200;
      if (st !== 200) return { ok: false, status: st, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ nodes: [], ways: [] }) };
    });
    return counts;
  }

  it('502 が1回だけ出たタイルは待って再試行し、成功する。進捗はタイル数で数える', async () => {
    vi.useFakeTimers();
    const counts = stubByUrl([502, 200]);
    const progress = [];
    const p = fetchRoadData(bounds, (d, t) => progress.push([d, t]));
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
    await expect(p).resolves.toBeDefined();
    const total = tilesForBounds(bounds).length;
    expect(progress.at(-1)).toEqual([total, total]);
    expect(progress.length).toBe(total);
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(total + 1);
  });

  it('502 が3回続いたら reject する（試行は3回まで）', async () => {
    vi.useFakeTimers();
    const counts = stubByUrl([502]);
    const p = fetchRoadData(bounds);
    const assertion = expect(p).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0] + RETRY_DELAYS_MS[1]);
    await assertion;
    expect([...counts.values()][0]).toBe(3);
  });

  it('400 は再試行せず reject する', async () => {
    vi.useFakeTimers();
    const counts = stubByUrl([400]);
    const assertion = expect(fetchRoadData(bounds)).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0] + RETRY_DELAYS_MS[1]);
    await assertion;
    expect([...counts.values()][0]).toBe(1);
  });

  it('ネットワークエラー(TypeError)は再試行する', async () => {
    vi.useFakeTimers();
    let first;
    let n = 0;
    vi.stubGlobal('fetch', async (url) => {
      first ??= url;
      if (url === first && n++ === 0) throw new TypeError('Failed to fetch');
      return { ok: true, status: 200, json: async () => ({ nodes: [], ways: [] }) };
    });
    const p = fetchRoadData(bounds);
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
    await expect(p).resolves.toBeDefined();
  });
});
