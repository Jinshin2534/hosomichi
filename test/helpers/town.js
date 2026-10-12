// シード固定の乱数（mulberry32）
export function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const KINDS = [
  { highway: 'primary' },
  { highway: 'tertiary' },
  { highway: 'residential' },
  { highway: 'service' },
  { highway: 'service', service: 'alley' },
  { highway: 'footway' },
  { highway: 'steps' },
  { highway: 'living_street' },
];

// size×size の歪んだ格子状の街を Overpass 応答の形で作る。
// node id は 1 から。左上が 1、右下が size*size。
export function randomTown(seed, size = 8) {
  const rand = mulberry32(seed);
  const elements = [];
  const id = (r, c) => r * size + c + 1;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      elements.push({
        type: 'node',
        id: id(r, c),
        lat: 35 + r * 0.0005 + (rand() - 0.5) * 0.0002,
        lon: 139 + c * 0.0006 + (rand() - 0.5) * 0.0002,
      });
    }
  }
  let wayId = 1000;
  const addWay = (a, b) => {
    if (rand() < 0.15) return; // ところどころ道がない
    elements.push({
      type: 'way',
      id: wayId++,
      nodes: [a, b],
      tags: KINDS[Math.floor(rand() * KINDS.length)],
    });
  };
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (c < size - 1) addWay(id(r, c), id(r, c + 1));
      if (r < size - 1) addWay(id(r, c), id(r + 1, c));
    }
  }
  const nodeById = new Map(elements.filter((e) => e.type === 'node').map((e) => [e.id, e]));
  const at = (nid) => ({ lat: nodeById.get(nid).lat, lon: nodeById.get(nid).lon });
  return { osm: { elements }, start: at(1), goal: at(size * size) };
}
