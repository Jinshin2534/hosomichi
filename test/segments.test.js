import { describe, it, expect } from 'vitest';
import { bandForN, segmentsByBand, pathLatLngs } from '../src/lib/segments.js';

describe('bandForN', () => {
  it.each([
    [1.0, 'narrow'],
    [0.7, 'narrow'],
    [0.69, 'middle'],
    [0.4, 'middle'],
    [0.39, 'wide'],
    [0.05, 'wide'],
  ])('%d → %s', (n, band) => {
    expect(bandForN(n)).toBe(band);
  });
});

const nodes = new Map([
  [1, { lat: 35.0, lon: 139.0 }],
  [2, { lat: 35.001, lon: 139.0 }],
  [3, { lat: 35.002, lon: 139.0 }],
  [4, { lat: 35.003, lon: 139.0 }],
]);
const path = {
  nodes: [1, 2, 3, 4],
  edges: [{ n: 0.9 }, { n: 0.75 }, { n: 0.2 }],
};

describe('segmentsByBand', () => {
  it('同じ帯が続く辺はひとつの線にまとめる', () => {
    expect(segmentsByBand(path, nodes)).toEqual([
      {
        band: 'narrow',
        latlngs: [
          [35.0, 139.0],
          [35.001, 139.0],
          [35.002, 139.0],
        ],
      },
      {
        band: 'wide',
        latlngs: [
          [35.002, 139.0],
          [35.003, 139.0],
        ],
      },
    ]);
  });

  it('辺がなければ空', () => {
    expect(segmentsByBand({ nodes: [1], edges: [] }, nodes)).toEqual([]);
  });
});

describe('pathLatLngs', () => {
  it('node の座標を順に並べる', () => {
    expect(pathLatLngs({ nodes: [3, 1], edges: [{ n: 0.5 }] }, nodes)).toEqual([
      [35.002, 139.0],
      [35.0, 139.0],
    ]);
  });
});
