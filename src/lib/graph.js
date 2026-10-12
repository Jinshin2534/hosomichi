import { narrowness } from './narrowness.js';
import { distanceM } from './geo.js';

// Overpass の応答（way と node）を、歩ける道の無向グラフにする
export function buildGraph(osm) {
  const coords = new Map();
  for (const el of osm.elements) {
    if (el.type === 'node') coords.set(el.id, { lat: el.lat, lon: el.lon });
  }

  const nodes = new Map();
  const adj = new Map();
  const edges = [];

  const addNode = (id, c) => {
    if (!nodes.has(id)) {
      nodes.set(id, c);
      adj.set(id, []);
    }
  };

  for (const el of osm.elements) {
    if (el.type !== 'way' || !el.tags) continue;
    const score = narrowness(el.tags);
    if (!score) continue;
    for (let i = 0; i < el.nodes.length - 1; i++) {
      const a = el.nodes[i];
      const b = el.nodes[i + 1];
      const ca = coords.get(a);
      const cb = coords.get(b);
      if (!ca || !cb || a === b) continue;
      const edge = {
        id: edges.length,
        a,
        b,
        length: distanceM(ca, cb),
        n: score.n,
        source: score.source,
        wayId: el.id,
      };
      edges.push(edge);
      addNode(a, ca);
      addNode(b, cb);
      adj.get(a).push({ to: b, edge });
      adj.get(b).push({ to: a, edge });
    }
  }

  return { nodes, adj, edges };
}
