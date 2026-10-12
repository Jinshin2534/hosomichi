import { NARROW_THRESHOLD } from './narrowness.js';

export function bandForN(n) {
  if (n >= NARROW_THRESHOLD) return 'narrow';
  if (n >= 0.4) return 'middle';
  return 'wide';
}

const latLngOf = (nodes, id) => {
  const c = nodes.get(id);
  return [c.lat, c.lon];
};

export function pathLatLngs(path, nodes) {
  return path.nodes.map((id) => latLngOf(nodes, id));
}

// ルートを狭さの帯ごとの線に分ける。同じ帯が続く辺はひとつの線にまとめる
export function segmentsByBand(path, nodes) {
  const segments = [];
  path.edges.forEach((edge, i) => {
    const band = bandForN(edge.n);
    const to = latLngOf(nodes, path.nodes[i + 1]);
    const last = segments.at(-1);
    if (last && last.band === band) {
      last.latlngs.push(to);
    } else {
      segments.push({ band, latlngs: [latLngOf(nodes, path.nodes[i]), to] });
    }
  });
  return segments;
}
