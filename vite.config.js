import { defineConfig } from 'vite';
import { fetchTile } from './api/_overpass-upstream.js';
import { parseTileParams } from './src/lib/overpassQuery.js';

// dev でも本番と同じ /api/overpass を叩けるようにする。
// 経路を1本にそろえておかないと「dev では動くのに本番だけ壊れる」が起きる。
function overpassDev() {
  return {
    name: 'overpass-dev',
    configureServer(server) {
      server.middlewares.use('/api/overpass', async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        const tile = parseTileParams(new URL(req.url, 'http://localhost').searchParams);
        if (!tile) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'bad tile' }));
          return;
        }
        try {
          res.end(JSON.stringify(await fetchTile(tile)));
        } catch (e) {
          console.error(e);
          res.statusCode = 502;
          res.end(JSON.stringify({ error: 'upstream failed' }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [overpassDev()],
  server: { port: 5790, strictPort: true },
  test: { include: ['test/**/*.test.js'] },
});
