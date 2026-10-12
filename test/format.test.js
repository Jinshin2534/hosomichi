import { describe, it, expect } from 'vitest';
import {
  formatPercent,
  formatKm,
  formatDetour,
  formatLatLon,
  ERROR_MESSAGES,
  NO_IMPROVEMENT_NOTE,
} from '../src/lib/format.js';

describe('format', () => {
  it.each([
    [0.623, '62%'],
    [0, '0%'],
    [1, '100%'],
    [0.005, '1%'],
  ])('formatPercent(%d) → %s', (x, s) => {
    expect(formatPercent(x)).toBe(s);
  });

  it.each([
    [999, '999m'],
    [0, '0m'],
    [1000, '1.0km'],
    [2412, '2.4km'],
  ])('formatKm(%d) → %s', (m, s) => {
    expect(formatKm(m)).toBe(s);
  });

  it.each([
    [1, '1.0倍'],
    [1.31, '1.3倍'],
    [1.96, '2.0倍'],
  ])('formatDetour(%d) → %s', (x, s) => {
    expect(formatDetour(x)).toBe(s);
  });

  it('formatLatLon は小数4桁', () => {
    expect(formatLatLon({ lat: 35.7281, lon: 139.771 })).toBe('35.7281, 139.7710');
  });
});

describe('文言', () => {
  it('仕様書のエラー文言がそろっている', () => {
    expect(ERROR_MESSAGES).toEqual({
      'too-far': '5km以内で選んでください',
      'fetch-failed': '地図データを取得できませんでした。少し待って再試行してください',
      'no-road-near-start': '出発地の近くに歩ける道がありません',
      'no-road-near-goal': '目的地の近くに歩ける道がありません',
      'same-point': '出発地と目的地が近すぎます',
      unreachable: 'ルートが見つかりません',
      'no-start': '出発地を選んでください（現在地が取れていません）',
      unexpected: '予期しないエラーが起きました。もう一度お試しください',
    });
    expect(NO_IMPROVEMENT_NOTE).toBe('この範囲では狭い道を増やせませんでした');
  });
});
