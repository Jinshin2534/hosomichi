import { shortestPath } from './dijkstra.js';
import { pathLength, narrowShare } from './stats.js';
import { distanceM } from './geo.js';

export const ALPHAS = [0, 0.5, 1, 2, 4, 8, 16, 32];
export const SNAP_LIMIT_M = 200;

// α が大きいほど広い道（n が小さい道）を長く数える
export function costFn(alpha) {
  return (edge) => edge.length * (1 + alpha * (1 - edge.n));
}

export function nearestNode(graph, point) {
  let best = null;
  for (const [id, c] of graph.nodes) {
    const d = distanceM(point, c);
    if (!best || d < best.distance) best = { id, distance: d };
  }
  return best;
}

export function planRoute(graph, start, goal, maxDetour) {
  const startSnap = nearestNode(graph, start);
  if (!startSnap || startSnap.distance > SNAP_LIMIT_M) return { ok: false, error: 'no-road-near-start' };
  const goalSnap = nearestNode(graph, goal);
  if (!goalSnap || goalSnap.distance > SNAP_LIMIT_M) return { ok: false, error: 'no-road-near-goal' };
  if (startSnap.id === goalSnap.id) return { ok: false, error: 'same-point' };

  const shortest = shortestPath(graph, startSnap.id, goalSnap.id, costFn(0));
  if (!shortest) return { ok: false, error: 'unreachable' };
  const limit = maxDetour * pathLength(shortest.edges);

  // α と遠回りは比例するとは限らないので、二分探索せずに全部試して一番良いものを取る。
  // α=0（最短）は必ず条件を満たすので、採用ルートは必ず決まる。
  let best = {
    path: shortest,
    alpha: 0,
    share: narrowShare(shortest.edges),
    length: pathLength(shortest.edges),
  };
  for (const alpha of ALPHAS.slice(1)) {
    const path = shortestPath(graph, startSnap.id, goalSnap.id, costFn(alpha));
    const length = pathLength(path.edges);
    if (length > limit + 1e-9) continue;
    const share = narrowShare(path.edges);
    if (share > best.share || (share === best.share && length < best.length)) {
      best = { path, alpha, share, length };
    }
  }

  return { ok: true, chosen: best.path, shortest, alpha: best.alpha, startSnap, goalSnap };
}
