import { defineConfig } from 'vite';
import { fetchRoads } from './api/_overpass-upstream.js';
import { parseBoundsParams } from './src/lib/overpassQuery.js';

// dev でも本番と同じ /api/overpass を叩けるようにする。
// 経路を1本にそろえておかないと「dev では動くのに本番だけ壊れる」が起きる。
function overpassDev() {
  return {
    name: 'overpass-dev',
    configureServer(server) {
      server.middlewares.use('/api/overpass', async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        const bounds = parseBoundsParams(new URL(req.url, 'http://localhost').searchParams);
        if (!bounds) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'bad bounds' }));
          return;
        }
        try {
          res.end(JSON.stringify(await fetchRoads(bounds)));
        } catch (e) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: String(e?.message ?? e) }));
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
