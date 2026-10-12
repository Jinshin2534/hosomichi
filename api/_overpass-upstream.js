// サーバ側から Overpass を叩く。Vercel 関数（api/overpass.js）と Vite の dev middleware で共有する。
import net from 'node:net';
import { buildRoadQuery } from '../src/lib/overpassQuery.js';

// Node の happy eyeballs は1アドレスあたり250msで次へ進む。ドイツの Overpass までは往復でそれを超えるので全滅する（IPv6 不通＋片方のサーバ拒否の環境で実測）。1秒に延ばす
net.setDefaultAutoSelectFamilyAttemptTimeout(1000);

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

export async function fetchRoads(bounds) {
  const query = buildRoadQuery(bounds);
  let lastError = new Error('no endpoint');
  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          // OSM 系サービスは User-Agent がないと 406 を返す。Node の fetch は UA を送らないので明示する
          'User-Agent': 'hosomichi/1.0 (https://hosomichi.vercel.app)',
        },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) {
        lastError = new Error(`overpass ${res.status}`);
        continue;
      }
      return await res.json();
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}
