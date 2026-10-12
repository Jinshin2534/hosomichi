import { describe, it, expect } from 'vitest';
import { buildGraph } from '../src/lib/graph.js';

const osm = {
  elements: [
    { type: 'node', id: 1, lat: 35.0, lon: 139.0 },
    { type: 'node', id: 2, lat: 35.001, lon: 139.0 },
    { type: 'node', id: 3, lat: 35.002, lon: 139.0 },
    { type: 'node', id: 4, lat: 35.001, lon: 139.001 },
    { type: 'node', id: 5, lat: 35.005, lon: 139.005 }, // どの way にも使われない
    { type: 'way', id: 10, nodes: [1, 2, 3], tags: { highway: 'residential' } },
    { type: 'way', id: 11, nodes: [2, 4], tags: { highway: 'steps', width: '1.5' } },
    { type: 'way', id: 12, nodes: [3, 4], tags: { highway: 'motorway' } }, // 除外
    { type: 'way', id: 13, nodes: [1, 99], tags: { highway: 'footway' } }, // node 99 がない
    { type: 'way', id: 14, nodes: [4, 4], tags: { highway: 'footway' } }, // 同じ node
    { type: 'way', id: 15, nodes: [1, 3] }, // tags なし
  ],
};

describe('buildGraph', () => {
  const g = buildGraph(osm);

  it('通れる辺だけが作られる', () => {
    expect(g.edges).toHaveLength(3);
    expect(g.edges.map((e) => e.wayId)).toEqual([10, 10, 11]);
  });

  it('辺は長さ・狭さ・根拠を持つ', () => {
    const [e12, , e24] = g.edges;
    expect(e12).toMatchObject({ id: 0, a: 1, b: 2, n: 0.5, source: 'estimated' });
    expect(Math.abs(e12.length - 111.195)).toBeLessThan(0.01);
    expect(e24).toMatchObject({ id: 2, a: 2, b: 4, n: 1.0, source: 'measured' });
  });

  it('無向グラフとして両向きにつながる', () => {
    expect(g.adj.get(2).map((x) => x.to).sort()).toEqual([1, 3, 4]);
    expect(g.adj.get(4).map((x) => x.to)).toEqual([2]);
    expect(g.adj.get(4)[0].edge).toBe(g.edges[2]);
  });

  it('辺に使われた node だけが入る', () => {
    expect([...g.nodes.keys()].sort()).toEqual([1, 2, 3, 4]);
    expect(g.nodes.get(1)).toEqual({ lat: 35.0, lon: 139.0 });
  });

  it('除外された way の区間はつながらない', () => {
    expect(g.adj.get(3).map((x) => x.to)).toEqual([2]);
  });

  it('空の応答でも壊れない', () => {
    const empty = buildGraph({ elements: [] });
    expect(empty.edges).toHaveLength(0);
    expect(empty.nodes.size).toBe(0);
  });
});
