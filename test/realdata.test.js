import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildGraph } from '../src/lib/graph.js';
import { planRoute } from '../src/lib/route.js';
import { pathLength, narrowShare } from '../src/lib/stats.js';
import { YANAKA } from './fixtures/points.js';

const osm = JSON.parse(readFileSync(new URL('./fixtures/yanaka.json', import.meta.url), 'utf8'));
const graph = buildGraph(osm);

describe('実データ: 日暮里駅 → 根津駅', () => {
  it('グラフが十分に大きい', () => {
    expect(graph.edges.length).toBeGreaterThan(500);
  });

  it.each([1.2, 1.5, 2.0])('上限 %s 倍でルートが出て、上限を守る', (maxDetour) => {
    const r = planRoute(graph, YANAKA.start, YANAKA.goal, maxDetour);
    expect(r.ok).toBe(true);
    expect(pathLength(r.chosen.edges)).toBeLessThanOrEqual(
      maxDetour * pathLength(r.shortest.edges) + 1e-6,
    );
  });

  it('上限 1.5 倍で、最短ルートより明らかに狭い道を通る', () => {
    const r = planRoute(graph, YANAKA.start, YANAKA.goal, 1.5);
    const chosen = narrowShare(r.chosen.edges);
    const shortest = narrowShare(r.shortest.edges);
    console.log(
      `狭い道: 採用 ${(chosen * 100).toFixed(0)}% / 最短 ${(shortest * 100).toFixed(0)}%、` +
        `遠回り ${(pathLength(r.chosen.edges) / pathLength(r.shortest.edges)).toFixed(2)}倍、α=${r.alpha}`,
    );
    expect(chosen).toBeGreaterThan(shortest + 0.1);
  });
});
