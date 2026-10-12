import { describe, it, expect, afterEach, vi } from 'vitest';
import { fetchRoads } from '../api/_overpass-upstream.js';

const bounds = { south: 35.7, west: 139.77, north: 35.73, east: 139.8 };
const good = { elements: [{ type: 'node', id: 1, lat: 35.7, lon: 139.77 }] };
const ok = (json) => ({ ok: true, status: 200, json: async () => json });

afterEach(() => vi.unstubAllGlobals());

describe('fetchRoads', () => {
  it('200 でも remark がエラーなら次のミラーを試す', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok({ elements: [], remark: 'runtime error: Query timed out in "query"' }))
      .mockResolvedValueOnce(ok(good));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchRoads(bounds)).resolves.toEqual(good);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('非 ok なら次のミラーを試す', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
        .mockResolvedValueOnce(ok(good)),
    );
    await expect(fetchRoads(bounds)).resolves.toEqual(good);
  });

  it('全部だめなら reject', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }));
    await expect(fetchRoads(bounds)).rejects.toThrow('overpass 503');
  });
});
