import { describe, it, expect } from 'vitest';
import {
  narrowness,
  parseWidth,
  isExcluded,
  HIGHWAY_KINDS,
  NARROW_THRESHOLD,
} from '../src/lib/narrowness.js';

describe('parseWidth', () => {
  it.each([
    ['3', 3],
    ['3 m', 3],
    ['2.5', 2.5],
    ['4m', 4],
    ['1.8 meters', 1.8],
  ])('%s → %d', (value, width) => {
    expect(parseWidth(value)).toBe(width);
  });

  it.each([[undefined], [''], ['narrow'], ['3;4'], ['0'], ['-2']])('%s → null', (value) => {
    expect(parseWidth(value)).toBeNull();
  });
});

describe('narrowness: width タグ（実測）が種別より優先される', () => {
  it.each([
    ['2', 1.0],
    ['2.1', 0.75],
    ['4', 0.75],
    ['4.5', 0.4],
    ['6', 0.4],
    ['6.5', 0.1],
  ])('width=%s → %d', (width, n) => {
    expect(narrowness({ highway: 'residential', width })).toEqual({ n, source: 'measured' });
  });

  it('幹線道路でも width があれば実測を使う', () => {
    expect(narrowness({ highway: 'primary', width: '3' })).toEqual({ n: 0.75, source: 'measured' });
  });

  it('読めない width は種別からの推定に落ちる', () => {
    expect(narrowness({ highway: 'residential', width: 'narrow' })).toEqual({
      n: 0.5,
      source: 'estimated',
    });
  });
});

describe('narrowness: 種別からの推定', () => {
  it.each([
    [{ highway: 'footway', footway: 'sidewalk' }, 0.05],
    [{ highway: 'service', service: 'alley' }, 0.9],
    [{ highway: 'steps' }, 0.9],
    [{ highway: 'footway' }, 0.9],
    [{ highway: 'path' }, 0.9],
    [{ highway: 'track' }, 0.9],
    [{ highway: 'cycleway', foot: 'designated' }, 0.9],
    [{ highway: 'cycleway', foot: 'yes' }, 0.9],
    [{ highway: 'living_street' }, 0.75],
    [{ highway: 'pedestrian' }, 0.75],
    [{ highway: 'service' }, 0.6],
    [{ highway: 'service', service: 'driveway' }, 0.6],
    [{ highway: 'residential' }, 0.5],
    [{ highway: 'unclassified' }, 0.5],
    [{ highway: 'road' }, 0.5],
    [{ highway: 'tertiary' }, 0.2],
    [{ highway: 'tertiary_link' }, 0.2],
    [{ highway: 'secondary' }, 0.05],
    [{ highway: 'primary_link' }, 0.05],
    [{ highway: 'trunk' }, 0.05],
  ])('%o → %d', (tags, n) => {
    expect(narrowness(tags)).toEqual({ n, source: 'estimated' });
  });
});

describe('除外', () => {
  it.each([
    [{}],
    [{ highway: 'motorway' }],
    [{ highway: 'motorway_link' }],
    [{ highway: 'construction' }],
    [{ highway: 'proposed' }],
    [{ highway: 'bus_stop' }],
    [{ highway: 'residential', access: 'private' }],
    [{ highway: 'service', access: 'no' }],
    [{ highway: 'footway', foot: 'no' }],
    [{ highway: 'cycleway' }],
    [{ highway: 'cycleway', foot: 'permissive' }],
    [{ highway: 'pedestrian', area: 'yes' }],
  ])('%o は除外', (tags) => {
    expect(isExcluded(tags)).toBe(true);
    expect(narrowness(tags)).toBeNull();
  });

  it.each([['yes'], ['designated'], ['permissive']])(
    'access=private でも foot=%s なら通れる',
    (foot) => {
      expect(narrowness({ highway: 'service', access: 'private', foot })).toEqual({
        n: 0.6,
        source: 'estimated',
      });
    },
  );
});

describe('定数', () => {
  it('HIGHWAY_KINDS は通れる種別だけを含む', () => {
    expect(HIGHWAY_KINDS).toContain('steps');
    expect(HIGHWAY_KINDS).toContain('residential');
    expect(HIGHWAY_KINDS).not.toContain('motorway');
  });

  it('狭い道の閾値は 0.7', () => {
    expect(NARROW_THRESHOLD).toBe(0.7);
  });
});
