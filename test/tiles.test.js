import { describe, it, expect } from 'vitest';
import { TILE_DEG, tileBounds, tilesForBounds } from '../src/lib/tiles.js';
import { fetchBounds } from '../src/lib/geo.js';
import { YANAKA } from './fixtures/points.js';

describe('tileBounds', () => {
  it('タイル番号から範囲を作る（小数6桁に丸める）', () => {
    expect(tileBounds({ tx: 4659, ty: 1190 })).toEqual({
      south: 35.7,
      west: 139.77,
      north: 35.73,
      east: 139.8,
    });
  });
  it('負の番号も扱える', () => {
    expect(tileBounds({ tx: -1, ty: -1 })).toEqual({ south: -0.03, west: -0.03, north: 0, east: 0 });
  });
});

describe('tilesForBounds', () => {
  it('1つのタイルに収まる範囲 → 1枚', () => {
    expect(tilesForBounds({ south: 35.71, west: 139.78, north: 35.72, east: 139.79 })).toEqual([
      { tx: 4659, ty: 1190 },
    ]);
  });
  it('境界線を縦横にまたぐ → 4枚（ty、tx の順）', () => {
    expect(tilesForBounds({ south: 35.72, west: 139.76, north: 35.74, east: 139.78 })).toEqual([
      { tx: 4658, ty: 1190 },
      { tx: 4659, ty: 1190 },
      { tx: 4658, ty: 1191 },
      { tx: 4659, ty: 1191 },
    ]);
  });
  it('タイルの合計が範囲を覆う', () => {
    const b = { south: 35.6913, west: 139.7022, north: 35.7511, east: 139.8199 };
    const bs = tilesForBounds(b).map(tileBounds);
    expect(Math.min(...bs.map((t) => t.south))).toBeLessThanOrEqual(b.south);
    expect(Math.min(...bs.map((t) => t.west))).toBeLessThanOrEqual(b.west);
    expect(Math.max(...bs.map((t) => t.north))).toBeGreaterThanOrEqual(b.north);
    expect(Math.max(...bs.map((t) => t.east))).toBeGreaterThanOrEqual(b.east);
  });
  it('谷中の取得範囲は 4 枚以内', () => {
    expect(tilesForBounds(fetchBounds(YANAKA.start, YANAKA.goal)).length).toBeLessThanOrEqual(4);
  });
  it('5km の斜めルートでも 12 枚以内', () => {
    const a = { lat: 35.69, lon: 139.7 };
    // 北東へ約 4.9km
    const b = { lat: 35.69 + 0.031, lon: 139.7 + 0.0385 };
    const n = tilesForBounds(fetchBounds(a, b)).length;
    expect(n).toBeLessThanOrEqual(12);
  });
  it('負の座標は切り捨てではなく floor', () => {
    expect(tilesForBounds({ south: -0.01, west: -0.01, north: 0.01, east: 0.01 })).toHaveLength(4);
    expect(tilesForBounds({ south: -0.01, west: -0.01, north: -0.005, east: -0.005 })).toEqual([
      { tx: -1, ty: -1 },
    ]);
  });
  it('TILE_DEG は 0.03', () => {
    expect(TILE_DEG).toBe(0.03);
  });
});
