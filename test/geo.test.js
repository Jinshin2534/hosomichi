import { describe, it, expect } from 'vitest';
import { distanceM, isTooFar, fetchBounds, MAX_DISTANCE_M } from '../src/lib/geo.js';

const TOKYO = { lat: 35.6812, lon: 139.7671 };
const SHINJUKU = { lat: 35.6896, lon: 139.7006 };
const NIPPORI = { lat: 35.7281, lon: 139.771 };
const NEZU = { lat: 35.7175, lon: 139.7656 };

describe('distanceM', () => {
  it('同じ地点は 0m', () => {
    expect(distanceM(TOKYO, TOKYO)).toBe(0);
  });

  it('緯度 0.001 度は約 111.2m', () => {
    const d = distanceM({ lat: 35, lon: 139 }, { lat: 35.001, lon: 139 });
    expect(Math.abs(d - 111.195)).toBeLessThan(0.01);
  });

  it('東京駅〜新宿駅は約 6km', () => {
    const d = distanceM(TOKYO, SHINJUKU);
    expect(d).toBeGreaterThan(5900);
    expect(d).toBeLessThan(6200);
  });
});

describe('isTooFar', () => {
  it('上限は 5000m', () => {
    expect(MAX_DISTANCE_M).toBe(5000);
  });

  it('東京駅〜新宿駅は遠すぎる', () => {
    expect(isTooFar(TOKYO, SHINJUKU)).toBe(true);
  });

  it('日暮里駅〜根津駅は範囲内', () => {
    expect(isTooFar(NIPPORI, NEZU)).toBe(false);
  });
});

describe('fetchBounds', () => {
  it('短い距離では余白が最低 300m になる', () => {
    const a = { lat: 35, lon: 139 };
    const b = { lat: 35.009, lon: 139 }; // 約 1000m → 20% は 200m なので 300m に切り上げ
    const box = fetchBounds(a, b);
    expect(Math.abs(distanceM(a, { lat: box.south, lon: 139 }) - 300)).toBeLessThan(0.5);
    expect(Math.abs(distanceM(b, { lat: box.north, lon: 139 }) - 300)).toBeLessThan(0.5);
    const westDist = distanceM({ lat: 35.0045, lon: 139 }, { lat: 35.0045, lon: box.west });
    expect(Math.abs(westDist - 300)).toBeLessThan(3);
  });

  it('長い距離では余白が直線距離の 20%', () => {
    const a = { lat: 35, lon: 139 };
    const b = { lat: 35.036, lon: 139 }; // 約 4003m → 余白 約 800m
    const box = fetchBounds(a, b);
    const margin = distanceM(a, b) * 0.2;
    expect(Math.abs(distanceM(a, { lat: box.south, lon: 139 }) - margin)).toBeLessThan(0.5);
  });

  it('点の順序によらず south < north, west < east', () => {
    const box = fetchBounds(NIPPORI, NEZU);
    expect(box.south).toBeLessThan(NEZU.lat);
    expect(box.north).toBeGreaterThan(NIPPORI.lat);
    expect(box.west).toBeLessThan(NEZU.lon);
    expect(box.east).toBeGreaterThan(NIPPORI.lon);
  });
});
