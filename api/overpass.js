// Overpass は vercel.app からのブラウザ直叩きを遮断するので、同一オリジンのここを経由させる。
// リクエストボディには依存しない（タイル番号だけをクエリ文字列で受け取り、クエリ本体はサーバで組み立てる）。
import { fetchTile } from './_overpass-upstream.js';
import { parseTileParams } from '../src/lib/overpassQuery.js';

export default async function handler(req, res) {
  const tile = parseTileParams(new URL(req.url, 'http://localhost').searchParams);
  if (!tile) {
    res.status(400).json({ error: 'bad tile' });
    return;
  }
  try {
    const json = await fetchTile(tile);
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json(json);
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: 'upstream failed' });
  }
}
