import { describe, it, expect } from 'vitest';
import { buildGraph } from '../src/lib/graph.js';
import { shortestPath } from '../src/lib/dijkstra.js';
import { pathLength, narrowShare } from '../src/lib/stats.js';
import { planRoute, nearestNode, costFn, ALPHAS, SNAP_LIMIT_M } from '../src/lib/route.js';
import { randomTown } from './helpers/town.js';

// S から G へ、まっすぐの幹線道路（約 1000m）と、横に回り込む路地（約 1292m = 1.29倍）
const S = { lat: 35.0, lon: 139.0 };
const G = { lat: 35.009, lon: 139.0 };
const detourTown = {
  elements: [
    { type: 'node', id: 1, ...S },
    { type: 'node', id: 2, lat: 35.0045, lon: 139.0 },
    { type: 'node', id: 3, ...G },
    { type: 'node', id: 4, lat: 35.0, lon: 139.0016 },
    { type: 'node', id: 5, lat: 35.009, lon: 139.0016 },
    { type: 'way', id: 10, nodes: [1, 2, 3], tags: { highway: 'primary' } },
    { type: 'way', id: 11, nodes: [1, 4, 5, 3], tags: { highway: 'service', service: 'alley' } },
  ],
};

describe('定数', () => {
  it('α は 8 通り、吸着の上限は 200m', () => {
    expect(ALPHAS).toEqual([0, 0.5, 1, 2, 4, 8, 16, 32]);
    expect(SNAP_LIMIT_M).toBe(200);
  });

  it('α=0 のコストは長さそのもの', () => {
    expect(costFn(0)({ length: 100, n: 0.05 })).toBe(100);
    expect(costFn(2)({ length: 100, n: 0.5 })).toBe(200);
  });
});

describe('nearestNode', () => {
  const g = buildGraph(detourTown);

  it('一番近い node と距離を返す', () => {
    const snap = nearestNode(g, { lat: 35.00451, lon: 139.0 });
    expect(snap.id).toBe(2);
    expect(snap.distance).toBeLessThan(2);
  });

  it('空のグラフなら null', () => {
    expect(nearestNode(buildGraph({ elements: [] }), S)).toBeNull();
  });
});

describe('planRoute: 決めうちの街', () => {
  const g = buildGraph(detourTown);

  it('上限 1.5 倍なら路地を通る', () => {
    const r = planRoute(g, S, G, 1.5);
    expect(r.ok).toBe(true);
    expect(r.chosen.nodes).toEqual([1, 4, 5, 3]);
    expect(r.shortest.nodes).toEqual([1, 2, 3]);
    expect(r.alpha).toBeGreaterThan(0);
    expect(r.startSnap.id).toBe(1);
    expect(r.goalSnap.id).toBe(3);
  });

  it('上限 1.2 倍なら最短ルートのまま（α=0）', () => {
    const r = planRoute(g, S, G, 1.2);
    expect(r.ok).toBe(true);
    expect(r.chosen.nodes).toEqual([1, 2, 3]);
    expect(r.alpha).toBe(0);
  });
});

describe('planRoute: エラー', () => {
  const g = buildGraph(detourTown);
  const far = { lat: 35.05, lon: 139.05 };

  it('出発地の 200m 以内に道がない', () => {
    expect(planRoute(g, far, G, 1.5)).toEqual({ ok: false, error: 'no-road-near-start' });
  });

  it('目的地の 200m 以内に道がない', () => {
    expect(planRoute(g, S, far, 1.5)).toEqual({ ok: false, error: 'no-road-near-goal' });
  });

  it('同じ node に吸着した', () => {
    expect(planRoute(g, S, { lat: 35.00001, lon: 139.0 }, 1.5)).toEqual({
      ok: false,
      error: 'same-point',
    });
  });

  it('つながっていない', () => {
    const split = buildGraph({
      elements: [
        { type: 'node', id: 1, ...S },
        { type: 'node', id: 2, lat: 35.001, lon: 139.0 },
        { type: 'node', id: 3, lat: 35.008, lon: 139.0 },
        { type: 'node', id: 4, ...G },
        { type: 'way', id: 10, nodes: [1, 2], tags: { highway: 'residential' } },
        { type: 'way', id: 11, nodes: [3, 4], tags: { highway: 'residential' } },
      ],
    });
    expect(planRoute(split, S, G, 1.5)).toEqual({ ok: false, error: 'unreachable' });
  });
});

describe('planRoute: 不変条件', () => {
  it('ランダムな街 300 個 × 上限 3 通りで常に成り立つ', () => {
    const EPS = 1e-6;
    let okCount = 0;
    let improved = 0;
    let unreachable = 0;

    for (let seed = 1; seed <= 300; seed++) {
      const town = randomTown(seed);
      const g = buildGraph(town.osm);
      for (const maxDetour of [1.2, 1.5, 2.0]) {
        const r = planRoute(g, town.start, town.goal, maxDetour);
        if (!r.ok) {
          expect(r.error).toBe('unreachable');
          unreachable++;
          continue;
        }
        okCount++;
        if (r.alpha > 0) improved++;
        const chosenLen = pathLength(r.chosen.edges);
        const shortestLen = pathLength(r.shortest.edges);

        // 遠回りは上限以内
        expect(chosenLen).toBeLessThanOrEqual(maxDetour * shortestLen + EPS);
        // 最短ルートは本当に最短
        expect(shortestLen).toBeLessThanOrEqual(chosenLen + EPS);
        // 狭い道の割合は最短ルート以上
        expect(narrowShare(r.chosen.edges)).toBeGreaterThanOrEqual(
          narrowShare(r.shortest.edges) - EPS,
        );
        // α=0 の探索結果が最短ルートと一致する
        const direct = shortestPath(g, r.startSnap.id, r.goalSnap.id, costFn(0));
        expect(pathLength(direct.edges)).toBeCloseTo(shortestLen, 6);
        // 経路が途切れずにつながっている
        for (const path of [r.chosen, r.shortest]) {
          expect(path.nodes[0]).toBe(r.startSnap.id);
          expect(path.nodes.at(-1)).toBe(r.goalSnap.id);
          expect(path.edges).toHaveLength(path.nodes.length - 1);
          path.edges.forEach((e, i) => {
            const pair = [path.nodes[i], path.nodes[i + 1]].sort((x, y) => x - y);
            expect([e.a, e.b].sort((x, y) => x - y)).toEqual(pair);
          });
        }
      }
    }

    // 検証が空回りしていないこと:
    // 道の欠けで分断される街が多すぎると検証の意味がなくなる
    expect(unreachable).toBeLessThan(900 * 0.2);
    // 半分以上のケースで実際に狭い道が増えている（α>0 が選ばれている）
    expect(improved).toBeGreaterThan(okCount * 0.5);
  });
});
