// 取得範囲を固定グリッド（0.03度 ≈ 3km）のタイルに分ける。タイルが固定なので CDN キャッシュが効く
export const TILE_DEG = 0.03;

const round6 = (v) => Number(v.toFixed(6));
// 浮動小数点の誤差でタイル境界ぴったりの値が1つ下に落ちないようにする
const index = (v) => Math.floor(v / TILE_DEG + 1e-9);

export function tileBounds({ tx, ty }) {
  return {
    south: round6(ty * TILE_DEG),
    west: round6(tx * TILE_DEG),
    north: round6((ty + 1) * TILE_DEG),
    east: round6((tx + 1) * TILE_DEG),
  };
}

export function tilesForBounds({ south, west, north, east }) {
  const tiles = [];
  for (let ty = index(south); ty <= index(north); ty++) {
    for (let tx = index(west); tx <= index(east); tx++) tiles.push({ tx, ty });
  }
  return tiles;
}
