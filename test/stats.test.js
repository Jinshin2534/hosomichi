import { describe, it, expect } from 'vitest';
import { pathLength, narrowShare, routeStats } from '../src/lib/stats.js';

const edge = (length, n, source = 'estimated') => ({ length, n, source });

describe('pathLength', () => {
  it('辺の長さの合計', () => {
    expect(pathLength([edge(100, 0.9), edge(300, 0.5)])).toBe(400);
  });
  it('空なら 0', () => {
    expect(pathLength([])).toBe(0);
  });
});

describe('narrowShare', () => {
  it('n ≥ 0.7 の長さの割合', () => {
    expect(narrowShare([edge(100, 0.9), edge(300, 0.5)])).toBe(0.25);
  });
  it('ちょうど 0.7 は狭い道に数える', () => {
    expect(narrowShare([edge(100, 0.7), edge(100, 0.69)])).toBe(0.5);
  });
  it('空なら 0', () => {
    expect(narrowShare([])).toBe(0);
  });
});

describe('routeStats', () => {
  const chosen = {
    nodes: [1, 2, 3],
    edges: [edge(300, 0.9, 'measured'), edge(900, 0.75)],
  };
  const shortest = { nodes: [1, 3], edges: [edge(1000, 0.05)] };

  it('採用ルートと最短ルートの数字をまとめる', () => {
    const s = routeStats(chosen, shortest);
    expect(s.lengthM).toBe(1200);
    expect(s.detour).toBeCloseTo(1.2, 10);
    expect(s.narrowShare).toBe(1);
    expect(s.shortestNarrowShare).toBe(0);
    expect(s.measuredShare).toBe(0.25);
    expect(s.estimatedShare).toBe(0.75);
  });

  it('長さ0のルートでも 0 除算しない', () => {
    const empty = { nodes: [1], edges: [] };
    expect(routeStats(empty, empty)).toEqual({
      lengthM: 0,
      detour: 1,
      narrowShare: 0,
      shortestNarrowShare: 0,
      measuredShare: 0,
      estimatedShare: 0,
    });
  });
});
