// 谷中付近の道データを Overpass から取って test/fixtures/yanaka.json に保存する
import { mkdirSync, writeFileSync } from 'node:fs';
import { fetchRoads } from '../api/_overpass-upstream.js';
import { fetchBounds } from '../src/lib/geo.js';
import { YANAKA } from '../test/fixtures/points.js';

const osm = await fetchRoads(fetchBounds(YANAKA.start, YANAKA.goal));
const dir = new URL('../test/fixtures/', import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL('yanaka.json', dir), JSON.stringify(osm));
const ways = osm.elements.filter((e) => e.type === 'way').length;
console.log(`保存しました: way ${ways} 本 / 要素 ${osm.elements.length} 個`);
