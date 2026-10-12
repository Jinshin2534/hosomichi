import { describe, it, expect } from 'vitest';
import { buildRoadQuery, boundsToParams, parseBoundsParams } from '../src/lib/overpassQuery.js';
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

describe('boundsToParams / parseBoundsParams', () => {
  it('往復で同じ範囲に戻る', () => {
    const params = new URLSearchParams(boundsToParams(bounds));
    expect(parseBoundsParams(params)).toEqual(bounds);
  });

  it('小数6桁に丸める', () => {
    expect(boundsToParams({ south: 1.23456789, west: 2, north: 3, east: 4 })).toBe(
      's=1.234568&w=2.000000&n=3.000000&e=4.000000',
    );
  });

  it.each([
    ['', 'パラメータなし'],
    ['s=35.71&w=139.76&n=35.73', 'e がない'],
    ['s=abc&w=139.76&n=35.73&e=139.78', '数値でない'],
    ['s=35.73&w=139.76&n=35.71&e=139.78', '南北が逆'],
    ['s=35.71&w=139.78&n=35.73&e=139.76', '東西が逆'],
    ['s=35.5&w=139.76&n=35.73&e=139.78', '南北の幅が 0.1 度超'],
    ['s=35.71&w=139.6&n=35.73&e=139.78', '東西の幅が 0.1 度超'],
    ['s=-91&w=139.76&n=-90.95&e=139.78', '緯度が範囲外'],
    ['s=35.71&w=180.5&n=35.73&e=180.55', '経度が範囲外'],
  ])('%s → null（%s）', (qs) => {
    expect(parseBoundsParams(new URLSearchParams(qs))).toBeNull();
  });
});
