import { NARROW_THRESHOLD } from './narrowness.js';

export function pathLength(edges) {
  let sum = 0;
  for (const e of edges) sum += e.length;
  return sum;
}

function shareOf(edges, pick) {
  const total = pathLength(edges);
  if (total === 0) return 0;
  return pathLength(edges.filter(pick)) / total;
}

export function narrowShare(edges) {
  return shareOf(edges, (e) => e.n >= NARROW_THRESHOLD);
}

export function routeStats(chosen, shortest) {
  const lengthM = pathLength(chosen.edges);
  const shortestM = pathLength(shortest.edges);
  return {
    lengthM,
    detour: shortestM === 0 ? 1 : lengthM / shortestM,
    narrowShare: narrowShare(chosen.edges),
    shortestNarrowShare: narrowShare(shortest.edges),
    measuredShare: shareOf(chosen.edges, (e) => e.source === 'measured'),
    estimatedShare: shareOf(chosen.edges, (e) => e.source === 'estimated'),
  };
}
