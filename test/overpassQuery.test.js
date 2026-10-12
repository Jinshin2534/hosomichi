import { describe, it, expect } from 'vitest';
import {
  buildRoadQuery,
  tileToParams,
  parseTileParams,
  compactOsm,
  expandOsm,
  mergeOsm,
} from '../src/lib/overpassQuery.js';
import { buildGraph } from '../src/lib/graph.js';
import { HIGHWAY_KINDS } from '../src/lib/narrowness.js';

const bounds = { south: 35.71, west: 139.76, north: 35.73, east: 139.78 };

describe('buildRoadQuery', () => {
  const q = buildRoadQuery(bounds);

  it('JSON 出力で始まる', () => {
    expect(q.startsWith('[out:json]')).toBe(true);
  });

  it('範囲は south,west,north,east の順で小数6桁', () => {
    expect(q).toContain('(35.710000,139.760000,35.730000,139.780000)');
  });

  it('通れる種別だけを取り、node も一緒に取る', () => {
    for (const kind of HIGHWAY_KINDS) expect(q).toContain(kind);
    expect(q).not.toContain('motorway');
    expect(q).toContain('(._;>;);out body qt;');
  });
});

describe('tileToParams / parseTileParams', () => {
  it('往復で同じタイルに戻る', () => {
    expect(tileToParams({ tx: 4659, ty: -3 })).toBe('tx=4659&ty=-3');
    expect(parseTileParams(new URLSearchParams(tileToParams({ tx: 4659, ty: -3 })))).toEqual({
      tx: 4659,
      ty: -3,
    });
  });

  it.each([
    ['', 'パラメータなし'],
    ['tx=1', 'ty がない'],
    ['ty=1', 'tx がない'],
    ['tx=1.5&ty=2', '小数'],
    ['tx=abc&ty=2', '数値でない'],
    ['tx=&ty=2', '空'],
    ['tx=1&ty=4000', '緯度が範囲外'],
    ['tx=1&ty=-4000', '緯度が範囲外（負）'],
    ['tx=99999&ty=1', '経度が範囲外'],
    ['tx=-99999&ty=1', '経度が範囲外（負）'],
  ])('%s → null（%s）', (qs) => {
    expect(parseTileParams(new URLSearchParams(qs))).toBeNull();
  });
});

const raw = {
  elements: [
    { type: 'node', id: 1, lat: 35.7, lon: 139.7, tags: { name: '交差点' } },
    { type: 'node', id: 2, lat: 35.7, lon: 139.701 },
    { type: 'node', id: 3, lat: 35.701, lon: 139.701 },
    { type: 'way', id: 10, nodes: [1, 2, 3], tags: { highway: 'residential', width: '3', name: '路地' } },
    { type: 'way', id: 11, nodes: [1, 3], tags: { highway: 'footway', footway: 'sidewalk' } },
    { type: 'relation', id: 99, members: [] },
  ],
};

describe('compactOsm / expandOsm', () => {
  it('必要なタグだけ残し、node は平らな配列にする', () => {
    const c = compactOsm(raw);
    expect(c.nodes).toEqual([1, 35.7, 139.7, 2, 35.7, 139.701, 3, 35.701, 139.701]);
    expect(c.ways[0]).toEqual([10, [1, 2, 3], { highway: 'residential', width: '3' }]);
    expect(JSON.stringify(c)).not.toContain('name');
  });

  it('往復してもグラフの辺が同じ', () => {
    const a = buildGraph(raw).edges;
    const b = buildGraph(expandOsm(compactOsm(raw))).edges;
    expect(b.length).toBe(a.length);
    expect(b.length).toBeGreaterThan(0);
    expect(b).toEqual(a);
  });
});

describe('mergeOsm', () => {
  it('同じ type+id の重複を取り除く', () => {
    const merged = mergeOsm([expandOsm(compactOsm(raw)), expandOsm(compactOsm(raw))]);
    expect(merged.elements).toHaveLength(5);
    expect(buildGraph(merged).edges).toEqual(buildGraph(raw).edges);
  });
});
