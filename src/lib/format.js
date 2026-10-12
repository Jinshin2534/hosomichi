export function formatPercent(x) {
  return `${Math.round(x * 100)}%`;
}

export function formatKm(m) {
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
}

export function formatDetour(x) {
  return `${x.toFixed(1)}倍`;
}

export function formatLatLon(p) {
  return `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`;
}

export const ERROR_MESSAGES = {
  'too-far': '5km以内で選んでください',
  'fetch-failed': '地図データを取得できませんでした。少し待って再試行してください',
  'no-road-near-start': '出発地の近くに歩ける道がありません',
  'no-road-near-goal': '目的地の近くに歩ける道がありません',
  'same-point': '出発地と目的地が近すぎます',
  unreachable: 'ルートが見つかりません',
  'no-start': '出発地を選んでください（現在地が取れていません）',
  unexpected: '予期しないエラーが起きました。もう一度お試しください',
};

export const NO_IMPROVEMENT_NOTE = 'この範囲では狭い道を増やせませんでした';
