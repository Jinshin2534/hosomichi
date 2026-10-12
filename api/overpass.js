// Overpass は vercel.app からのブラウザ直叩きを遮断するので、同一オリジンのここを経由させる。
// リクエストボディには依存しない（範囲だけをクエリ文字列で受け取り、クエリ本体はサーバで組み立てる）。
import { fetchRoads } from './_overpass-upstream.js';
import { parseBoundsParams } from '../src/lib/overpassQuery.js';

export default async function handler(req, res) {
  const bounds = parseBoundsParams(new URL(req.url, 'http://localhost').searchParams);
  if (!bounds) {
    res.status(400).json({ error: 'bad bounds' });
    return;
  }
  try {
    const json = await fetchRoads(bounds);
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json(json);
  } catch (e) {
    res.status(502).json({ error: String(e?.message ?? e) });
  }
}
