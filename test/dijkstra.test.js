import { describe, it, expect } from 'vitest';
import { shortestPath } from '../src/lib/dijkstra.js';

// [a, b, length, n] の一覧から Graph を手で作る
function tinyGraph(list) {
  const nodes = new Map();
  const adj = new Map();
  const edges = [];
  for (const [a, b, length, n] of list) {
    for (const id of [a, b]) {
      if (!nodes.has(id)) {
        nodes.set(id, { lat: 0, lon: 0 });
        adj.set(id, []);
      }
    }
    const edge = { id: edges.length, a, b, length, n, source: 'estimated', wayId: edges.length };
    edges.push(edge);
    adj.get(a).push({ to: b, edge });
    adj.get(b).push({ to: a, edge });
  }
  return { nodes, adj, edges };
}

const byLength = (e) => e.length;

// 1 —(100, 広い)— 2 —(100, 広い)— 4
// 1 —(120, 狭い)— 3 —(120, 狭い)— 4
// 5 は孤立（6 とだけつながる）
const g = tinyGraph([
  [1, 2, 100, 0.05],
  [2, 4, 100, 0.05],
  [1, 3, 120, 0.9],
  [3, 4, 120, 0.9],
  [5, 6, 50, 0.5],
]);

describe('shortestPath', () => {
  it('長さだけなら広い道を通る', () => {
    const p = shortestPath(g, 1, 4, byLength);
    expect(p.nodes).toEqual([1, 2, 4]);
    expect(p.edges.map((e) => e.id)).toEqual([0, 1]);
  });

  it('重み関数を変えると狭い道を通る', () => {
    const p = shortestPath(g, 1, 4, (e) => e.length * (1 + 4 * (1 - e.n)));
    expect(p.nodes).toEqual([1, 3, 4]);
    expect(p.edges.map((e) => e.id)).toEqual([2, 3]);
  });

  it('逆向きにも辿れる', () => {
    expect(shortestPath(g, 4, 1, byLength).nodes).toEqual([4, 2, 1]);
  });

  it('出発と目的が同じなら長さ0の経路', () => {
    expect(shortestPath(g, 2, 2, byLength)).toEqual({ nodes: [2], edges: [] });
  });

  it('つながっていなければ null', () => {
    expect(shortestPath(g, 1, 5, byLength)).toBeNull();
  });

  it('グラフにない node なら null', () => {
    expect(shortestPath(g, 1, 999, byLength)).toBeNull();
    expect(shortestPath(g, 999, 1, byLength)).toBeNull();
  });

  it('大きめの格子でも正しい長さを返す', () => {
    // 20x20 の格子、辺の長さはすべて 1。角から角は 38
    const list = [];
    const id = (r, c) => r * 20 + c;
    for (let r = 0; r < 20; r++) {
      for (let c = 0; c < 20; c++) {
        if (c < 19) list.push([id(r, c), id(r, c + 1), 1, 0.5]);
        if (r < 19) list.push([id(r, c), id(r + 1, c), 1, 0.5]);
      }
    }
    const p = shortestPath(tinyGraph(list), id(0, 0), id(19, 19), byLength);
    expect(p.edges).toHaveLength(38);
  });
});
