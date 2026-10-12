// 二分ヒープ（[cost, node] の最小ヒープ）
class MinHeap {
  constructor() {
    this.items = [];
  }
  get size() {
    return this.items.length;
  }
  push(item) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

export function shortestPath(graph, from, to, weight) {
  if (!graph.adj.has(from) || !graph.adj.has(to)) return null;
  if (from === to) return { nodes: [from], edges: [] };

  const dist = new Map([[from, 0]]);
  const prev = new Map(); // node → { node, edge }
  const done = new Set();
  const heap = new MinHeap();
  heap.push([0, from]);

  while (heap.size > 0) {
    const [d, u] = heap.pop();
    if (done.has(u)) continue;
    done.add(u);
    if (u === to) break;
    for (const { to: v, edge } of graph.adj.get(u)) {
      if (done.has(v)) continue;
      const nd = d + weight(edge);
      if (nd < (dist.get(v) ?? Infinity)) {
        dist.set(v, nd);
        prev.set(v, { node: u, edge });
        heap.push([nd, v]);
      }
    }
  }

  if (!done.has(to)) return null;
  const nodes = [to];
  const edges = [];
  let cur = to;
  while (cur !== from) {
    const step = prev.get(cur);
    edges.push(step.edge);
    nodes.push(step.node);
    cur = step.node;
  }
  nodes.reverse();
  edges.reverse();
  return { nodes, edges };
}
