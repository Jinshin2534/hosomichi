# ほそみち Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 出発地→目的地を、遠回りの上限内で道幅の狭い道をなるべく多く通って案内するスマホ向けWebアプリ「ほそみち」を作る。

**Architecture:** Overpass API から範囲内の道を取得し、ブラウザ内で無向グラフを作り、「長さ ×（1 + α ×（1 − 狭さ））」のコストで α を8通り試すダイクストラ法を回して、遠回りの上限内で狭い道の割合が最大のルートを採用する。経路計算はすべて `src/lib` の純粋関数で、画面（Leaflet）は `src/map.js` / `src/panel.js` / `src/main.js` が配線する。Overpass へはサーバ側（Vercel 関数・Vite dev middleware 共通の `api/_overpass-upstream.js`）経由で GET する。

**Tech Stack:** Vite 8 + 素のJS（ES modules）+ pnpm、Leaflet 1.9、Vitest 4、Vercel（サーバ関数1本）

**仕様書:** `docs/superpowers/specs/2026-10-12-hosomichi-design.md`

## Global Constraints

- プロジェクトの場所: `/Users/nokokoro/ranzo_project/hosomichi`（git リポジトリ、ブランチ `master`）
- パッケージマネージャ: pnpm。dev server は port **5730**（`strictPort: true`）
- テストは `test/**/*.test.js`、`pnpm test`（= `vitest run`）で実行
- `src/lib` 内のファイルは DOM・`fetch`・`window` に触れない
- 直線距離の上限: **5000m**。吸着の上限: **200m**。狭い道の閾値: **n ≥ 0.7**
- α の候補: **0, 0.5, 1, 2, 4, 8, 16, 32**。遠回りの上限の選択肢: **1.2 / 1.5 / 2.0**（初期値 1.5）
- 取得範囲の余白: 直線距離の **20%、最低 300m**
- 位置情報が使えない場合の地図の中心: 東京駅 **(35.6812, 139.7671)**
- UI の文言は日本語。座標は `{ lat, lon }` で受け渡す（Leaflet に渡すときだけ `[lat, lon]` 配列にする）
- コミットメッセージの末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` を付ける

## File Structure

| ファイル | 役割 |
|---|---|
| `package.json` / `vite.config.js` / `vercel.json` / `.gitignore` | 設定 |
| `src/lib/narrowness.js` | OSM タグ → 狭さ点数 `{ n, source }` または除外 `null` |
| `src/lib/geo.js` | 距離、5km 判定、取得範囲 |
| `src/lib/graph.js` | Overpass JSON → 無向グラフ |
| `src/lib/dijkstra.js` | 重み関数つき最短経路 |
| `src/lib/stats.js` | 長さ・狭い道の割合・根拠の内訳 |
| `src/lib/route.js` | 吸着と α 8通りの探索 |
| `src/lib/segments.js` | ルート → 狭さの帯ごとの線 |
| `src/lib/format.js` | 表示形式・エラー文言 |
| `src/lib/overpassQuery.js` | クエリ組み立て・範囲パラメータの検証 |
| `api/_overpass-upstream.js` | サーバ側で Overpass を叩く |
| `api/overpass.js` | Vercel 関数 |
| `src/overpass.js` | ブラウザ側の取得 |
| `scripts/fetch-fixture.js` | 実データ fixture の保存 |
| `index.html` / `src/style.css` / `src/map.js` / `src/panel.js` / `src/main.js` | 画面 |
| `test/*.test.js`、`test/fixtures/` | テスト |

## 共通のデータ形

後のタスクはこの形に依存する。

```js
// Graph（graph.js が作る）
{
  nodes: Map<number, { lat: number, lon: number }>,
  adj: Map<number, Array<{ to: number, edge: Edge }>>,
  edges: Edge[],
}
// Edge
{ id: number, a: number, b: number, length: number /* m */, n: number, source: 'measured' | 'estimated', wayId: number }
// Path（dijkstra.js が返す）。edges[i] は nodes[i] と nodes[i+1] を結ぶ
{ nodes: number[], edges: Edge[] }
```

---

### Task 1: 雛形と狭さ点数（narrowness）

**Files:**
- Create: `package.json`, `.gitignore`, `vite.config.js`
- Create: `src/lib/narrowness.js`
- Test: `test/narrowness.test.js`

**Interfaces:**
- Consumes: なし
- Produces:
  - `NARROW_THRESHOLD: number`（= 0.7）
  - `HIGHWAY_KINDS: string[]`（グラフに入れうる `highway` の値の一覧）
  - `parseWidth(value: string | undefined): number | null`
  - `isExcluded(tags: object): boolean`
  - `narrowness(tags: object): { n: number, source: 'measured' | 'estimated' } | null`

- [ ] **Step 1: 雛形を作る**

`package.json`:

```json
{
  "name": "hosomichi",
  "version": "1.0.0",
  "description": "ほそみち — 狭い道を選んで案内する散歩ナビ",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "fixture": "node scripts/fetch-fixture.js"
  }
}
```

`.gitignore`:

```
node_modules
dist
.vercel
```

`vite.config.js`:

```js
import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5730, strictPort: true },
  test: { include: ['test/**/*.test.js'] },
});
```

Run:

```bash
cd /Users/nokokoro/ranzo_project/hosomichi && pnpm add leaflet@^1.9.4 && pnpm add -D vite vitest
```

- [ ] **Step 2: 失敗するテストを書く**

`test/narrowness.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  narrowness,
  parseWidth,
  isExcluded,
  HIGHWAY_KINDS,
  NARROW_THRESHOLD,
} from '../src/lib/narrowness.js';

describe('parseWidth', () => {
  it.each([
    ['3', 3],
    ['3 m', 3],
    ['2.5', 2.5],
    ['4m', 4],
    ['1.8 meters', 1.8],
  ])('%s → %d', (value, width) => {
    expect(parseWidth(value)).toBe(width);
  });

  it.each([[undefined], [''], ['narrow'], ['3;4'], ['0'], ['-2']])('%s → null', (value) => {
    expect(parseWidth(value)).toBeNull();
  });
});

describe('narrowness: width タグ（実測）が種別より優先される', () => {
  it.each([
    ['2', 1.0],
    ['2.1', 0.75],
    ['4', 0.75],
    ['4.5', 0.4],
    ['6', 0.4],
    ['6.5', 0.1],
  ])('width=%s → %d', (width, n) => {
    expect(narrowness({ highway: 'residential', width })).toEqual({ n, source: 'measured' });
  });

  it('幹線道路でも width があれば実測を使う', () => {
    expect(narrowness({ highway: 'primary', width: '3' })).toEqual({ n: 0.75, source: 'measured' });
  });

  it('読めない width は種別からの推定に落ちる', () => {
    expect(narrowness({ highway: 'residential', width: 'narrow' })).toEqual({
      n: 0.5,
      source: 'estimated',
    });
  });
});

describe('narrowness: 種別からの推定', () => {
  it.each([
    [{ highway: 'footway', footway: 'sidewalk' }, 0.05],
    [{ highway: 'service', service: 'alley' }, 0.9],
    [{ highway: 'steps' }, 0.9],
    [{ highway: 'footway' }, 0.9],
    [{ highway: 'path' }, 0.9],
    [{ highway: 'track' }, 0.9],
    [{ highway: 'cycleway', foot: 'designated' }, 0.9],
    [{ highway: 'cycleway', foot: 'yes' }, 0.9],
    [{ highway: 'living_street' }, 0.75],
    [{ highway: 'pedestrian' }, 0.75],
    [{ highway: 'service' }, 0.6],
    [{ highway: 'service', service: 'driveway' }, 0.6],
    [{ highway: 'residential' }, 0.5],
    [{ highway: 'unclassified' }, 0.5],
    [{ highway: 'road' }, 0.5],
    [{ highway: 'tertiary' }, 0.2],
    [{ highway: 'tertiary_link' }, 0.2],
    [{ highway: 'secondary' }, 0.05],
    [{ highway: 'primary_link' }, 0.05],
    [{ highway: 'trunk' }, 0.05],
  ])('%o → %d', (tags, n) => {
    expect(narrowness(tags)).toEqual({ n, source: 'estimated' });
  });
});

describe('除外', () => {
  it.each([
    [{}],
    [{ highway: 'motorway' }],
    [{ highway: 'motorway_link' }],
    [{ highway: 'construction' }],
    [{ highway: 'proposed' }],
    [{ highway: 'bus_stop' }],
    [{ highway: 'residential', access: 'private' }],
    [{ highway: 'service', access: 'no' }],
    [{ highway: 'footway', foot: 'no' }],
    [{ highway: 'cycleway' }],
    [{ highway: 'cycleway', foot: 'permissive' }],
    [{ highway: 'pedestrian', area: 'yes' }],
  ])('%o は除外', (tags) => {
    expect(isExcluded(tags)).toBe(true);
    expect(narrowness(tags)).toBeNull();
  });

  it.each([['yes'], ['designated'], ['permissive']])(
    'access=private でも foot=%s なら通れる',
    (foot) => {
      expect(narrowness({ highway: 'service', access: 'private', foot })).toEqual({
        n: 0.6,
        source: 'estimated',
      });
    },
  );
});

describe('定数', () => {
  it('HIGHWAY_KINDS は通れる種別だけを含む', () => {
    expect(HIGHWAY_KINDS).toContain('steps');
    expect(HIGHWAY_KINDS).toContain('residential');
    expect(HIGHWAY_KINDS).not.toContain('motorway');
  });

  it('狭い道の閾値は 0.7', () => {
    expect(NARROW_THRESHOLD).toBe(0.7);
  });
});
```

- [ ] **Step 3: 失敗を確認する**

Run: `pnpm test`
Expected: FAIL（`Failed to resolve import "../src/lib/narrowness.js"`）

- [ ] **Step 4: 実装する**

`src/lib/narrowness.js`:

```js
// 道の狭さ点数 n（0〜1、1が一番狭い）。
// 日本の OSM では width タグはまれなので、あれば実測、なければ highway 種別から推定する。

export const NARROW_THRESHOLD = 0.7;

const HIGHWAY_N = {
  steps: 0.9,
  footway: 0.9,
  path: 0.9,
  track: 0.9,
  cycleway: 0.9,
  living_street: 0.75,
  pedestrian: 0.75,
  service: 0.6,
  residential: 0.5,
  unclassified: 0.5,
  road: 0.5,
  tertiary: 0.2,
  tertiary_link: 0.2,
  secondary: 0.05,
  secondary_link: 0.05,
  primary: 0.05,
  primary_link: 0.05,
  trunk: 0.05,
  trunk_link: 0.05,
};

export const HIGHWAY_KINDS = Object.keys(HIGHWAY_N);

const FOOT_ALLOWED = new Set(['yes', 'designated', 'permissive']);

export function parseWidth(value) {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d+(?:\.\d+)?)\s*(?:m|meters?|metres?)?$/i);
  if (!m) return null;
  const width = Number(m[1]);
  return width > 0 ? width : null;
}

function widthToN(width) {
  if (width <= 2) return 1.0;
  if (width <= 4) return 0.75;
  if (width <= 6) return 0.4;
  return 0.1;
}

export function isExcluded(tags) {
  const highway = tags.highway;
  if (!highway || !(highway in HIGHWAY_N)) return true;
  if (tags.area === 'yes') return true;
  if (tags.foot === 'no') return true;
  if (highway === 'cycleway' && tags.foot !== 'yes' && tags.foot !== 'designated') return true;
  if ((tags.access === 'private' || tags.access === 'no') && !FOOT_ALLOWED.has(tags.foot)) {
    return true;
  }
  return false;
}

export function narrowness(tags) {
  if (isExcluded(tags)) return null;
  const width = parseWidth(tags.width);
  if (width !== null) return { n: widthToN(width), source: 'measured' };
  // 大通り沿いの歩道は footway でも実質は大通り
  if (tags.footway === 'sidewalk') return { n: 0.05, source: 'estimated' };
  if (tags.service === 'alley') return { n: 0.9, source: 'estimated' };
  return { n: HIGHWAY_N[tags.highway], source: 'estimated' };
}
```

- [ ] **Step 5: 通ることを確認する**

Run: `pnpm test`
Expected: PASS（narrowness.test.js のテストがすべて通る）

- [ ] **Step 6: コミット**

```bash
git add package.json pnpm-lock.yaml .gitignore vite.config.js src/lib/narrowness.js test/narrowness.test.js
git commit -m "feat: 雛形と道の狭さ点数

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 距離と取得範囲（geo）

**Files:**
- Create: `src/lib/geo.js`
- Test: `test/geo.test.js`

**Interfaces:**
- Consumes: なし
- Produces:
  - `MAX_DISTANCE_M: number`（= 5000）
  - `distanceM(a: {lat, lon}, b: {lat, lon}): number`（m、haversine、地球半径 6371008.8m）
  - `isTooFar(a, b): boolean`（`distanceM > 5000`）
  - `fetchBounds(a, b): { south, west, north, east }`（度）

- [ ] **Step 1: 失敗するテストを書く**

`test/geo.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { distanceM, isTooFar, fetchBounds, MAX_DISTANCE_M } from '../src/lib/geo.js';

const TOKYO = { lat: 35.6812, lon: 139.7671 };
const SHINJUKU = { lat: 35.6896, lon: 139.7006 };
const NIPPORI = { lat: 35.7281, lon: 139.771 };
const NEZU = { lat: 35.7175, lon: 139.7656 };

describe('distanceM', () => {
  it('同じ地点は 0m', () => {
    expect(distanceM(TOKYO, TOKYO)).toBe(0);
  });

  it('緯度 0.001 度は約 111.2m', () => {
    const d = distanceM({ lat: 35, lon: 139 }, { lat: 35.001, lon: 139 });
    expect(Math.abs(d - 111.195)).toBeLessThan(0.01);
  });

  it('東京駅〜新宿駅は約 6km', () => {
    const d = distanceM(TOKYO, SHINJUKU);
    expect(d).toBeGreaterThan(5900);
    expect(d).toBeLessThan(6200);
  });
});

describe('isTooFar', () => {
  it('上限は 5000m', () => {
    expect(MAX_DISTANCE_M).toBe(5000);
  });

  it('東京駅〜新宿駅は遠すぎる', () => {
    expect(isTooFar(TOKYO, SHINJUKU)).toBe(true);
  });

  it('日暮里駅〜根津駅は範囲内', () => {
    expect(isTooFar(NIPPORI, NEZU)).toBe(false);
  });
});

describe('fetchBounds', () => {
  it('短い距離では余白が最低 300m になる', () => {
    const a = { lat: 35, lon: 139 };
    const b = { lat: 35.009, lon: 139 }; // 約 1000m → 20% は 200m なので 300m に切り上げ
    const box = fetchBounds(a, b);
    expect(Math.abs(distanceM(a, { lat: box.south, lon: 139 }) - 300)).toBeLessThan(0.5);
    expect(Math.abs(distanceM(b, { lat: box.north, lon: 139 }) - 300)).toBeLessThan(0.5);
    const westDist = distanceM({ lat: 35.0045, lon: 139 }, { lat: 35.0045, lon: box.west });
    expect(Math.abs(westDist - 300)).toBeLessThan(3);
  });

  it('長い距離では余白が直線距離の 20%', () => {
    const a = { lat: 35, lon: 139 };
    const b = { lat: 35.036, lon: 139 }; // 約 4003m → 余白 約 800m
    const box = fetchBounds(a, b);
    const margin = distanceM(a, b) * 0.2;
    expect(Math.abs(distanceM(a, { lat: box.south, lon: 139 }) - margin)).toBeLessThan(0.5);
  });

  it('点の順序によらず south < north, west < east', () => {
    const box = fetchBounds(NIPPORI, NEZU);
    expect(box.south).toBeLessThan(NEZU.lat);
    expect(box.north).toBeGreaterThan(NIPPORI.lat);
    expect(box.west).toBeLessThan(NEZU.lon);
    expect(box.east).toBeGreaterThan(NIPPORI.lon);
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `pnpm test test/geo.test.js`
Expected: FAIL（`Failed to resolve import "../src/lib/geo.js"`）

- [ ] **Step 3: 実装する**

`src/lib/geo.js`:

```js
const EARTH_RADIUS_M = 6371008.8;
const RAD = Math.PI / 180;
const M_PER_DEG_LAT = EARTH_RADIUS_M * RAD;

export const MAX_DISTANCE_M = 5000;
const MARGIN_RATIO = 0.2;
const MIN_MARGIN_M = 300;

export function distanceM(a, b) {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isTooFar(a, b) {
  return distanceM(a, b) > MAX_DISTANCE_M;
}

// 出発地と目的地の外接矩形に、直線距離の 20%（最低 300m）の余白を足す
export function fetchBounds(a, b) {
  const margin = Math.max(distanceM(a, b) * MARGIN_RATIO, MIN_MARGIN_M);
  const midLat = (a.lat + b.lat) / 2;
  const dLat = margin / M_PER_DEG_LAT;
  const dLon = margin / (M_PER_DEG_LAT * Math.cos(midLat * RAD));
  return {
    south: Math.min(a.lat, b.lat) - dLat,
    west: Math.min(a.lon, b.lon) - dLon,
    north: Math.max(a.lat, b.lat) + dLat,
    east: Math.max(a.lon, b.lon) + dLon,
  };
}
```

- [ ] **Step 4: 通ることを確認する**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/lib/geo.js test/geo.test.js
git commit -m "feat: 距離と取得範囲の計算

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: グラフの構築（graph）

**Files:**
- Create: `src/lib/graph.js`
- Test: `test/graph.test.js`

**Interfaces:**
- Consumes: `narrowness(tags)`（Task 1）、`distanceM(a, b)`（Task 2）
- Produces: `buildGraph(osm: { elements: Array }): Graph`（形は冒頭の「共通のデータ形」）。除外された way、座標のない node を含む辺、同じ node 同士の辺は入れない。辺に使われた node だけが `nodes` / `adj` に入る。

- [ ] **Step 1: 失敗するテストを書く**

`test/graph.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildGraph } from '../src/lib/graph.js';

const osm = {
  elements: [
    { type: 'node', id: 1, lat: 35.0, lon: 139.0 },
    { type: 'node', id: 2, lat: 35.001, lon: 139.0 },
    { type: 'node', id: 3, lat: 35.002, lon: 139.0 },
    { type: 'node', id: 4, lat: 35.001, lon: 139.001 },
    { type: 'node', id: 5, lat: 35.005, lon: 139.005 }, // どの way にも使われない
    { type: 'way', id: 10, nodes: [1, 2, 3], tags: { highway: 'residential' } },
    { type: 'way', id: 11, nodes: [2, 4], tags: { highway: 'steps', width: '1.5' } },
    { type: 'way', id: 12, nodes: [3, 4], tags: { highway: 'motorway' } }, // 除外
    { type: 'way', id: 13, nodes: [1, 99], tags: { highway: 'footway' } }, // node 99 がない
    { type: 'way', id: 14, nodes: [4, 4], tags: { highway: 'footway' } }, // 同じ node
    { type: 'way', id: 15, nodes: [1, 3] }, // tags なし
  ],
};

describe('buildGraph', () => {
  const g = buildGraph(osm);

  it('通れる辺だけが作られる', () => {
    expect(g.edges).toHaveLength(3);
    expect(g.edges.map((e) => e.wayId)).toEqual([10, 10, 11]);
  });

  it('辺は長さ・狭さ・根拠を持つ', () => {
    const [e12, , e24] = g.edges;
    expect(e12).toMatchObject({ id: 0, a: 1, b: 2, n: 0.5, source: 'estimated' });
    expect(Math.abs(e12.length - 111.195)).toBeLessThan(0.01);
    expect(e24).toMatchObject({ id: 2, a: 2, b: 4, n: 1.0, source: 'measured' });
  });

  it('無向グラフとして両向きにつながる', () => {
    expect(g.adj.get(2).map((x) => x.to).sort()).toEqual([1, 3, 4]);
    expect(g.adj.get(4).map((x) => x.to)).toEqual([2]);
    expect(g.adj.get(4)[0].edge).toBe(g.edges[2]);
  });

  it('辺に使われた node だけが入る', () => {
    expect([...g.nodes.keys()].sort()).toEqual([1, 2, 3, 4]);
    expect(g.nodes.get(1)).toEqual({ lat: 35.0, lon: 139.0 });
  });

  it('除外された way の区間はつながらない', () => {
    expect(g.adj.get(3).map((x) => x.to)).toEqual([2]);
  });

  it('空の応答でも壊れない', () => {
    const empty = buildGraph({ elements: [] });
    expect(empty.edges).toHaveLength(0);
    expect(empty.nodes.size).toBe(0);
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `pnpm test test/graph.test.js`
Expected: FAIL（`Failed to resolve import "../src/lib/graph.js"`）

- [ ] **Step 3: 実装する**

`src/lib/graph.js`:

```js
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
```

- [ ] **Step 4: 通ることを確認する**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/lib/graph.js test/graph.test.js
git commit -m "feat: Overpass 応答から歩ける道のグラフを作る

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 最短経路（dijkstra）

**Files:**
- Create: `src/lib/dijkstra.js`
- Test: `test/dijkstra.test.js`

**Interfaces:**
- Consumes: Graph の形（Task 3）
- Produces: `shortestPath(graph: Graph, from: number, to: number, weight: (edge: Edge) => number): Path | null`
  - `from === to` なら `{ nodes: [from], edges: [] }`
  - `from` か `to` がグラフにない、またはつながっていなければ `null`

- [ ] **Step 1: 失敗するテストを書く**

`test/dijkstra.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { shortestPath } from '../src/lib/dijkstra.js';

// [a, b, length, n] の一覧から Graph を手で作る
function tinyGraph(list) {
  const nodes = new Map();
  const adj = new Map();
  const edges = [];
  for (const [a, b, length, n] of list) {
    for (const id of [a, b]) {
      if (!nodes.has(id)) {
        nodes.set(id, { lat: 0, lon: 0 });
        adj.set(id, []);
      }
    }
    const edge = { id: edges.length, a, b, length, n, source: 'estimated', wayId: edges.length };
    edges.push(edge);
    adj.get(a).push({ to: b, edge });
    adj.get(b).push({ to: a, edge });
  }
  return { nodes, adj, edges };
}

const byLength = (e) => e.length;

// 1 —(100, 広い)— 2 —(100, 広い)— 4
// 1 —(120, 狭い)— 3 —(120, 狭い)— 4
// 5 は孤立（6 とだけつながる）
const g = tinyGraph([
  [1, 2, 100, 0.05],
  [2, 4, 100, 0.05],
  [1, 3, 120, 0.9],
  [3, 4, 120, 0.9],
  [5, 6, 50, 0.5],
]);

describe('shortestPath', () => {
  it('長さだけなら広い道を通る', () => {
    const p = shortestPath(g, 1, 4, byLength);
    expect(p.nodes).toEqual([1, 2, 4]);
    expect(p.edges.map((e) => e.id)).toEqual([0, 1]);
  });

  it('重み関数を変えると狭い道を通る', () => {
    const p = shortestPath(g, 1, 4, (e) => e.length * (1 + 4 * (1 - e.n)));
    expect(p.nodes).toEqual([1, 3, 4]);
    expect(p.edges.map((e) => e.id)).toEqual([2, 3]);
  });

  it('逆向きにも辿れる', () => {
    expect(shortestPath(g, 4, 1, byLength).nodes).toEqual([4, 2, 1]);
  });

  it('出発と目的が同じなら長さ0の経路', () => {
    expect(shortestPath(g, 2, 2, byLength)).toEqual({ nodes: [2], edges: [] });
  });

  it('つながっていなければ null', () => {
    expect(shortestPath(g, 1, 5, byLength)).toBeNull();
  });

  it('グラフにない node なら null', () => {
    expect(shortestPath(g, 1, 999, byLength)).toBeNull();
    expect(shortestPath(g, 999, 1, byLength)).toBeNull();
  });

  it('大きめの格子でも正しい長さを返す', () => {
    // 20x20 の格子、辺の長さはすべて 1。角から角は 38
    const list = [];
    const id = (r, c) => r * 20 + c;
    for (let r = 0; r < 20; r++) {
      for (let c = 0; c < 20; c++) {
        if (c < 19) list.push([id(r, c), id(r, c + 1), 1, 0.5]);
        if (r < 19) list.push([id(r, c), id(r + 1, c), 1, 0.5]);
      }
    }
    const p = shortestPath(tinyGraph(list), id(0, 0), id(19, 19), byLength);
    expect(p.edges).toHaveLength(38);
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `pnpm test test/dijkstra.test.js`
Expected: FAIL（`Failed to resolve import "../src/lib/dijkstra.js"`）

- [ ] **Step 3: 実装する**

`src/lib/dijkstra.js`:

```js
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
```

- [ ] **Step 4: 通ることを確認する**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/lib/dijkstra.js test/dijkstra.test.js
git commit -m "feat: 重み関数つきダイクストラ法

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: ルートの数字（stats）

**Files:**
- Create: `src/lib/stats.js`
- Test: `test/stats.test.js`

**Interfaces:**
- Consumes: `NARROW_THRESHOLD`（Task 1）、Path / Edge の形
- Produces:
  - `pathLength(edges: Edge[]): number`
  - `narrowShare(edges: Edge[]): number`（n ≥ 0.7 の辺の長さ / 全長。全長0なら0）
  - `routeStats(chosen: Path, shortest: Path): { lengthM, detour, narrowShare, shortestNarrowShare, measuredShare, estimatedShare }`（`detour` は最短の長さが0なら1）

- [ ] **Step 1: 失敗するテストを書く**

`test/stats.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { pathLength, narrowShare, routeStats } from '../src/lib/stats.js';

const edge = (length, n, source = 'estimated') => ({ length, n, source });

describe('pathLength', () => {
  it('辺の長さの合計', () => {
    expect(pathLength([edge(100, 0.9), edge(300, 0.5)])).toBe(400);
  });
  it('空なら 0', () => {
    expect(pathLength([])).toBe(0);
  });
});

describe('narrowShare', () => {
  it('n ≥ 0.7 の長さの割合', () => {
    expect(narrowShare([edge(100, 0.9), edge(300, 0.5)])).toBe(0.25);
  });
  it('ちょうど 0.7 は狭い道に数える', () => {
    expect(narrowShare([edge(100, 0.7), edge(100, 0.69)])).toBe(0.5);
  });
  it('空なら 0', () => {
    expect(narrowShare([])).toBe(0);
  });
});

describe('routeStats', () => {
  const chosen = {
    nodes: [1, 2, 3],
    edges: [edge(300, 0.9, 'measured'), edge(900, 0.75)],
  };
  const shortest = { nodes: [1, 3], edges: [edge(1000, 0.05)] };

  it('採用ルートと最短ルートの数字をまとめる', () => {
    const s = routeStats(chosen, shortest);
    expect(s.lengthM).toBe(1200);
    expect(s.detour).toBeCloseTo(1.2, 10);
    expect(s.narrowShare).toBe(1);
    expect(s.shortestNarrowShare).toBe(0);
    expect(s.measuredShare).toBe(0.25);
    expect(s.estimatedShare).toBe(0.75);
  });

  it('長さ0のルートでも 0 除算しない', () => {
    const empty = { nodes: [1], edges: [] };
    expect(routeStats(empty, empty)).toEqual({
      lengthM: 0,
      detour: 1,
      narrowShare: 0,
      shortestNarrowShare: 0,
      measuredShare: 0,
      estimatedShare: 0,
    });
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `pnpm test test/stats.test.js`
Expected: FAIL（`Failed to resolve import "../src/lib/stats.js"`）

- [ ] **Step 3: 実装する**

`src/lib/stats.js`:

```js
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
```

- [ ] **Step 4: 通ることを確認する**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/lib/stats.js test/stats.test.js
git commit -m "feat: ルートの長さ・狭い道の割合・根拠の内訳

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: ルートの選び方（route）と不変条件

**Files:**
- Create: `src/lib/route.js`
- Test: `test/route.test.js`
- Create: `test/helpers/town.js`（ランダムな街を作るテスト用ヘルパー）

**Interfaces:**
- Consumes: `shortestPath`（Task 4）、`pathLength` / `narrowShare`（Task 5）、`distanceM`（Task 2）、`buildGraph`（Task 3、テストのみ）
- Produces:
  - `ALPHAS: number[]`（= `[0, 0.5, 1, 2, 4, 8, 16, 32]`）
  - `SNAP_LIMIT_M: number`（= 200）
  - `costFn(alpha: number): (edge: Edge) => number`
  - `nearestNode(graph: Graph, point: {lat, lon}): { id: number, distance: number } | null`（グラフが空なら null）
  - `planRoute(graph, start: {lat, lon}, goal: {lat, lon}, maxDetour: number)` →
    - 成功: `{ ok: true, chosen: Path, shortest: Path, alpha: number, startSnap: {id, distance}, goalSnap: {id, distance} }`
    - 失敗: `{ ok: false, error: 'no-road-near-start' | 'no-road-near-goal' | 'same-point' | 'unreachable' }`
  - `alpha === 0` ⇔ 最短ルートより狭い道を増やせなかった

- [ ] **Step 1: テスト用のランダムな街を作るヘルパーを書く**

`test/helpers/town.js`:

```js
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
```

- [ ] **Step 2: 失敗するテストを書く**

`test/route.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildGraph } from '../src/lib/graph.js';
import { shortestPath } from '../src/lib/dijkstra.js';
import { pathLength, narrowShare } from '../src/lib/stats.js';
import { planRoute, nearestNode, costFn, ALPHAS, SNAP_LIMIT_M } from '../src/lib/route.js';
import { randomTown } from './helpers/town.js';

// S から G へ、まっすぐの幹線道路（約 1000m）と、横に回り込む路地（約 1292m = 1.29倍）
const S = { lat: 35.0, lon: 139.0 };
const G = { lat: 35.009, lon: 139.0 };
const detourTown = {
  elements: [
    { type: 'node', id: 1, ...S },
    { type: 'node', id: 2, lat: 35.0045, lon: 139.0 },
    { type: 'node', id: 3, ...G },
    { type: 'node', id: 4, lat: 35.0, lon: 139.0016 },
    { type: 'node', id: 5, lat: 35.009, lon: 139.0016 },
    { type: 'way', id: 10, nodes: [1, 2, 3], tags: { highway: 'primary' } },
    { type: 'way', id: 11, nodes: [1, 4, 5, 3], tags: { highway: 'service', service: 'alley' } },
  ],
};

describe('定数', () => {
  it('α は 8 通り、吸着の上限は 200m', () => {
    expect(ALPHAS).toEqual([0, 0.5, 1, 2, 4, 8, 16, 32]);
    expect(SNAP_LIMIT_M).toBe(200);
  });

  it('α=0 のコストは長さそのもの', () => {
    expect(costFn(0)({ length: 100, n: 0.05 })).toBe(100);
    expect(costFn(2)({ length: 100, n: 0.5 })).toBe(200);
  });
});

describe('nearestNode', () => {
  const g = buildGraph(detourTown);

  it('一番近い node と距離を返す', () => {
    const snap = nearestNode(g, { lat: 35.00451, lon: 139.0 });
    expect(snap.id).toBe(2);
    expect(snap.distance).toBeLessThan(2);
  });

  it('空のグラフなら null', () => {
    expect(nearestNode(buildGraph({ elements: [] }), S)).toBeNull();
  });
});

describe('planRoute: 決めうちの街', () => {
  const g = buildGraph(detourTown);

  it('上限 1.5 倍なら路地を通る', () => {
    const r = planRoute(g, S, G, 1.5);
    expect(r.ok).toBe(true);
    expect(r.chosen.nodes).toEqual([1, 4, 5, 3]);
    expect(r.shortest.nodes).toEqual([1, 2, 3]);
    expect(r.alpha).toBeGreaterThan(0);
    expect(r.startSnap.id).toBe(1);
    expect(r.goalSnap.id).toBe(3);
  });

  it('上限 1.2 倍なら最短ルートのまま（α=0）', () => {
    const r = planRoute(g, S, G, 1.2);
    expect(r.ok).toBe(true);
    expect(r.chosen.nodes).toEqual([1, 2, 3]);
    expect(r.alpha).toBe(0);
  });
});

describe('planRoute: エラー', () => {
  const g = buildGraph(detourTown);
  const far = { lat: 35.05, lon: 139.05 };

  it('出発地の 200m 以内に道がない', () => {
    expect(planRoute(g, far, G, 1.5)).toEqual({ ok: false, error: 'no-road-near-start' });
  });

  it('目的地の 200m 以内に道がない', () => {
    expect(planRoute(g, S, far, 1.5)).toEqual({ ok: false, error: 'no-road-near-goal' });
  });

  it('同じ node に吸着した', () => {
    expect(planRoute(g, S, { lat: 35.00001, lon: 139.0 }, 1.5)).toEqual({
      ok: false,
      error: 'same-point',
    });
  });

  it('つながっていない', () => {
    const split = buildGraph({
      elements: [
        { type: 'node', id: 1, ...S },
        { type: 'node', id: 2, lat: 35.001, lon: 139.0 },
        { type: 'node', id: 3, lat: 35.008, lon: 139.0 },
        { type: 'node', id: 4, ...G },
        { type: 'way', id: 10, nodes: [1, 2], tags: { highway: 'residential' } },
        { type: 'way', id: 11, nodes: [3, 4], tags: { highway: 'residential' } },
      ],
    });
    expect(planRoute(split, S, G, 1.5)).toEqual({ ok: false, error: 'unreachable' });
  });
});

describe('planRoute: 不変条件', () => {
  it('ランダムな街 300 個 × 上限 3 通りで常に成り立つ', () => {
  const EPS = 1e-6;
  let okCount = 0;
  let improved = 0;
  let unreachable = 0;

  for (let seed = 1; seed <= 300; seed++) {
    const town = randomTown(seed);
    const g = buildGraph(town.osm);
    for (const maxDetour of [1.2, 1.5, 2.0]) {
      const r = planRoute(g, town.start, town.goal, maxDetour);
      if (!r.ok) {
        expect(r.error).toBe('unreachable');
        unreachable++;
        continue;
      }
      okCount++;
      if (r.alpha > 0) improved++;
      const chosenLen = pathLength(r.chosen.edges);
      const shortestLen = pathLength(r.shortest.edges);

      // 遠回りは上限以内
      expect(chosenLen).toBeLessThanOrEqual(maxDetour * shortestLen + EPS);
      // 最短ルートは本当に最短
      expect(shortestLen).toBeLessThanOrEqual(chosenLen + EPS);
      // 狭い道の割合は最短ルート以上
      expect(narrowShare(r.chosen.edges)).toBeGreaterThanOrEqual(
        narrowShare(r.shortest.edges) - EPS,
      );
      // α=0 の探索結果が最短ルートと一致する
      const direct = shortestPath(g, r.startSnap.id, r.goalSnap.id, costFn(0));
      expect(pathLength(direct.edges)).toBeCloseTo(shortestLen, 6);
      // 経路が途切れずにつながっている
      for (const path of [r.chosen, r.shortest]) {
        expect(path.nodes[0]).toBe(r.startSnap.id);
        expect(path.nodes.at(-1)).toBe(r.goalSnap.id);
        expect(path.edges).toHaveLength(path.nodes.length - 1);
        path.edges.forEach((e, i) => {
          const pair = [path.nodes[i], path.nodes[i + 1]].sort((x, y) => x - y);
          expect([e.a, e.b].sort((x, y) => x - y)).toEqual(pair);
        });
      }
    }
  }

  // 検証が空回りしていないこと:
  // 道の欠けで分断される街が多すぎると検証の意味がなくなる
  expect(unreachable).toBeLessThan(900 * 0.2);
  // 半分以上のケースで実際に狭い道が増えている（α>0 が選ばれている）
  expect(improved).toBeGreaterThan(okCount * 0.5);
  });
});
```

- [ ] **Step 3: 失敗を確認する**

Run: `pnpm test test/route.test.js`
Expected: FAIL（`Failed to resolve import "../src/lib/route.js"`）

- [ ] **Step 4: 実装する**

`src/lib/route.js`:

```js
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
```

- [ ] **Step 5: 通ることを確認する**

Run: `pnpm test`
Expected: PASS。不変条件が落ちた場合はテストを緩めず、`route.js` か `dijkstra.js` の不具合として原因を調べる。末尾の「検証が空回りしていない」の2つの expect だけが落ちた場合は `test/helpers/town.js` の道の欠け率（0.15）を見直す（ルート側ではなく街の作りの問題）。

- [ ] **Step 6: コミット**

```bash
git add src/lib/route.js test/route.test.js test/helpers/town.js
git commit -m "feat: 遠回りの上限内で狭い道が最も多いルートを選ぶ

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 地図の線と表示形式（segments / format）

**Files:**
- Create: `src/lib/segments.js`, `src/lib/format.js`
- Test: `test/segments.test.js`, `test/format.test.js`

**Interfaces:**
- Consumes: Path / Graph の形
- Produces:
  - `bandForN(n: number): 'narrow' | 'middle' | 'wide'`（n ≥ 0.7 → narrow、n ≥ 0.4 → middle、それ以外 → wide）
  - `segmentsByBand(path: Path, nodes: Graph['nodes']): Array<{ band, latlngs: [number, number][] }>`（同じ帯が続く辺はつなげる）
  - `pathLatLngs(path: Path, nodes): [number, number][]`
  - `formatPercent(x: number): string`（0.623 → `'62%'`）
  - `formatKm(m: number): string`（999 → `'999m'`、2412 → `'2.4km'`）
  - `formatDetour(x: number): string`（1.31 → `'1.3倍'`）
  - `formatLatLon(p: {lat, lon}): string`（→ `'35.7281, 139.7710'`）
  - `ERROR_MESSAGES: Record<string, string>`（キー: `too-far`, `fetch-failed`, `no-road-near-start`, `no-road-near-goal`, `same-point`, `unreachable`, `no-start`）
  - `NO_IMPROVEMENT_NOTE: string`

- [ ] **Step 1: 失敗するテストを書く**

`test/segments.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { bandForN, segmentsByBand, pathLatLngs } from '../src/lib/segments.js';

describe('bandForN', () => {
  it.each([
    [1.0, 'narrow'],
    [0.7, 'narrow'],
    [0.69, 'middle'],
    [0.4, 'middle'],
    [0.39, 'wide'],
    [0.05, 'wide'],
  ])('%d → %s', (n, band) => {
    expect(bandForN(n)).toBe(band);
  });
});

const nodes = new Map([
  [1, { lat: 35.0, lon: 139.0 }],
  [2, { lat: 35.001, lon: 139.0 }],
  [3, { lat: 35.002, lon: 139.0 }],
  [4, { lat: 35.003, lon: 139.0 }],
]);
const path = {
  nodes: [1, 2, 3, 4],
  edges: [{ n: 0.9 }, { n: 0.75 }, { n: 0.2 }],
};

describe('segmentsByBand', () => {
  it('同じ帯が続く辺はひとつの線にまとめる', () => {
    expect(segmentsByBand(path, nodes)).toEqual([
      {
        band: 'narrow',
        latlngs: [
          [35.0, 139.0],
          [35.001, 139.0],
          [35.002, 139.0],
        ],
      },
      {
        band: 'wide',
        latlngs: [
          [35.002, 139.0],
          [35.003, 139.0],
        ],
      },
    ]);
  });

  it('辺がなければ空', () => {
    expect(segmentsByBand({ nodes: [1], edges: [] }, nodes)).toEqual([]);
  });
});

describe('pathLatLngs', () => {
  it('node の座標を順に並べる', () => {
    expect(pathLatLngs({ nodes: [3, 1], edges: [{ n: 0.5 }] }, nodes)).toEqual([
      [35.002, 139.0],
      [35.0, 139.0],
    ]);
  });
});
```

`test/format.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  formatPercent,
  formatKm,
  formatDetour,
  formatLatLon,
  ERROR_MESSAGES,
  NO_IMPROVEMENT_NOTE,
} from '../src/lib/format.js';

describe('format', () => {
  it.each([
    [0.623, '62%'],
    [0, '0%'],
    [1, '100%'],
    [0.005, '1%'],
  ])('formatPercent(%d) → %s', (x, s) => {
    expect(formatPercent(x)).toBe(s);
  });

  it.each([
    [999, '999m'],
    [0, '0m'],
    [1000, '1.0km'],
    [2412, '2.4km'],
  ])('formatKm(%d) → %s', (m, s) => {
    expect(formatKm(m)).toBe(s);
  });

  it.each([
    [1, '1.0倍'],
    [1.31, '1.3倍'],
    [1.96, '2.0倍'],
  ])('formatDetour(%d) → %s', (x, s) => {
    expect(formatDetour(x)).toBe(s);
  });

  it('formatLatLon は小数4桁', () => {
    expect(formatLatLon({ lat: 35.7281, lon: 139.771 })).toBe('35.7281, 139.7710');
  });
});

describe('文言', () => {
  it('仕様書のエラー文言がそろっている', () => {
    expect(ERROR_MESSAGES).toEqual({
      'too-far': '5km以内で選んでください',
      'fetch-failed': '地図データを取得できませんでした。少し待って再試行してください',
      'no-road-near-start': '出発地の近くに歩ける道がありません',
      'no-road-near-goal': '目的地の近くに歩ける道がありません',
      'same-point': '出発地と目的地が近すぎます',
      unreachable: 'ルートが見つかりません',
      'no-start': '出発地を選んでください（現在地が取れていません）',
    });
    expect(NO_IMPROVEMENT_NOTE).toBe('この範囲では狭い道を増やせませんでした');
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `pnpm test test/segments.test.js test/format.test.js`
Expected: FAIL（`Failed to resolve import`）

- [ ] **Step 3: 実装する**

`src/lib/segments.js`:

```js
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
```

`src/lib/format.js`:

```js
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
};

export const NO_IMPROVEMENT_NOTE = 'この範囲では狭い道を増やせませんでした';
```

- [ ] **Step 4: 通ることを確認する**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/lib/segments.js src/lib/format.js test/segments.test.js test/format.test.js
git commit -m "feat: ルートの帯分けと表示形式・文言

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Overpass 経由の取得と実データでの確認

**Files:**
- Create: `src/lib/overpassQuery.js`
- Create: `api/_overpass-upstream.js`, `api/overpass.js`, `vercel.json`
- Create: `src/overpass.js`
- Modify: `vite.config.js`（dev middleware を追加）
- Create: `scripts/fetch-fixture.js`, `test/fixtures/points.js`, `test/fixtures/yanaka.json`（スクリプトで生成）
- Test: `test/overpassQuery.test.js`, `test/realdata.test.js`

**Interfaces:**
- Consumes: `HIGHWAY_KINDS`（Task 1）、`fetchBounds`（Task 2）、`buildGraph`（Task 3）、`planRoute`（Task 6）、`narrowShare`（Task 5）
- Produces:
  - `buildRoadQuery(bounds: {south, west, north, east}): string`
  - `boundsToParams(bounds): string`（`'s=..&w=..&n=..&e=..'`、小数6桁）
  - `parseBoundsParams(params: URLSearchParams): {south, west, north, east} | null`（数値でない・範囲外・南北や東西が逆・幅が 0.1 度を超える場合は null）
  - `fetchRoads(bounds): Promise<object>`（`api/_overpass-upstream.js`、サーバ側。ミラーを順に試し、全部失敗したら throw）
  - `fetchRoadData(bounds): Promise<object>`（`src/overpass.js`、ブラウザ側。`/api/overpass?…` を GET、失敗したら throw）
  - `YANAKA: { start: {lat, lon}, goal: {lat, lon} }`（`test/fixtures/points.js`）

なぜ GET でサーバがクエリを組み立てるか: Overpass は `*.vercel.app` からのブラウザ直叩きを遮断する。また過去のアプリ（とまり火）で、Vercel 関数をリクエストボディに依存させたら本番だけ `FUNCTION_INVOCATION_FAILED` になった。範囲だけをクエリ文字列で渡し、クエリ本体はサーバで作る。dev でも同じ `/api/overpass` を通して、経路を1本にそろえる。

- [ ] **Step 1: 失敗するテストを書く**

`test/overpassQuery.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildRoadQuery, boundsToParams, parseBoundsParams } from '../src/lib/overpassQuery.js';
import { HIGHWAY_KINDS } from '../src/lib/narrowness.js';

const bounds = { south: 35.71, west: 139.76, north: 35.73, east: 139.78 };

describe('buildRoadQuery', () => {
  const q = buildRoadQuery(bounds);

  it('JSON 出力で始まる', () => {
    expect(q.startsWith('[out:json]')).toBe(true);
  });

  it('範囲は south,west,north,east の順で小数6桁', () => {
    expect(q).toContain('(35.710000,139.760000,35.730000,139.780000)');
  });

  it('通れる種別だけを取り、node も一緒に取る', () => {
    for (const kind of HIGHWAY_KINDS) expect(q).toContain(kind);
    expect(q).not.toContain('motorway');
    expect(q).toContain('(._;>;);out body qt;');
  });
});

describe('boundsToParams / parseBoundsParams', () => {
  it('往復で同じ範囲に戻る', () => {
    const params = new URLSearchParams(boundsToParams(bounds));
    expect(parseBoundsParams(params)).toEqual(bounds);
  });

  it('小数6桁に丸める', () => {
    expect(boundsToParams({ south: 1.23456789, west: 2, north: 3, east: 4 })).toBe(
      's=1.234568&w=2.000000&n=3.000000&e=4.000000',
    );
  });

  it.each([
    ['', 'パラメータなし'],
    ['s=35.71&w=139.76&n=35.73', 'e がない'],
    ['s=abc&w=139.76&n=35.73&e=139.78', '数値でない'],
    ['s=35.73&w=139.76&n=35.71&e=139.78', '南北が逆'],
    ['s=35.71&w=139.78&n=35.73&e=139.76', '東西が逆'],
    ['s=35.5&w=139.76&n=35.73&e=139.78', '南北の幅が 0.1 度超'],
    ['s=35.71&w=139.6&n=35.73&e=139.78', '東西の幅が 0.1 度超'],
    ['s=-91&w=139.76&n=-90.95&e=139.78', '緯度が範囲外'],
    ['s=35.71&w=180.5&n=35.73&e=180.55', '経度が範囲外'],
  ])('%s → null（%s）', (qs) => {
    expect(parseBoundsParams(new URLSearchParams(qs))).toBeNull();
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `pnpm test test/overpassQuery.test.js`
Expected: FAIL（`Failed to resolve import "../src/lib/overpassQuery.js"`）

- [ ] **Step 3: クエリまわりを実装する**

`src/lib/overpassQuery.js`:

```js
import { HIGHWAY_KINDS } from './narrowness.js';

// 5km＋余白でも収まる上限（日本の緯度なら東西 0.1 度 ≈ 8〜9km）
const MAX_SPAN_DEG = 0.1;
const KEYS = [
  ['s', 'south'],
  ['w', 'west'],
  ['n', 'north'],
  ['e', 'east'],
];

const fix6 = (v) => v.toFixed(6);

export function buildRoadQuery({ south, west, north, east }) {
  const bbox = [south, west, north, east].map(fix6).join(',');
  const kinds = HIGHWAY_KINDS.join('|');
  return `[out:json][timeout:25];way["highway"~"^(${kinds})$"](${bbox});(._;>;);out body qt;`;
}

export function boundsToParams(bounds) {
  return KEYS.map(([short, long]) => `${short}=${fix6(bounds[long])}`).join('&');
}

export function parseBoundsParams(params) {
  const b = {};
  for (const [short, long] of KEYS) {
    const raw = params.get(short);
    if (raw === null || raw.trim() === '') return null;
    const v = Number(raw);
    if (!Number.isFinite(v)) return null;
    b[long] = v;
  }
  if (b.south < -90 || b.north > 90 || b.west < -180 || b.east > 180) return null;
  if (b.south >= b.north || b.west >= b.east) return null;
  if (b.north - b.south > MAX_SPAN_DEG || b.east - b.west > MAX_SPAN_DEG) return null;
  return b;
}
```

- [ ] **Step 4: 通ることを確認する**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 5: サーバ側・ブラウザ側の取得を書く**

`api/_overpass-upstream.js`:

```js
// サーバ側から Overpass を叩く。Vercel 関数（api/overpass.js）と Vite の dev middleware で共有する。
import { buildRoadQuery } from '../src/lib/overpassQuery.js';

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

export async function fetchRoads(bounds) {
  const query = buildRoadQuery(bounds);
  let lastError = new Error('no endpoint');
  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          // OSM 系サービスは User-Agent がないと 406 を返す。Node の fetch は UA を送らないので明示する
          'User-Agent': 'hosomichi/1.0 (https://hosomichi.vercel.app)',
        },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) {
        lastError = new Error(`overpass ${res.status}`);
        continue;
      }
      return await res.json();
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}
```

`api/overpass.js`:

```js
// Overpass は vercel.app からのブラウザ直叩きを遮断するので、同一オリジンのここを経由させる。
// リクエストボディには依存しない（範囲だけをクエリ文字列で受け取り、クエリ本体はサーバで組み立てる）。
import { fetchRoads } from './_overpass-upstream.js';
import { parseBoundsParams } from '../src/lib/overpassQuery.js';

export default async function handler(req, res) {
  const bounds = parseBoundsParams(new URL(req.url, 'http://localhost').searchParams);
  if (!bounds) {
    res.status(400).json({ error: 'bad bounds' });
    return;
  }
  try {
    const json = await fetchRoads(bounds);
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json(json);
  } catch (e) {
    res.status(502).json({ error: String(e?.message ?? e) });
  }
}
```

`vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "functions": {
    "api/overpass.js": {
      "maxDuration": 60
    }
  }
}
```

`src/overpass.js`:

```js
import { boundsToParams } from './lib/overpassQuery.js';

// dev でも本番でも同一オリジンの /api/overpass を通す（経路を1本にそろえる）
export async function fetchRoadData(bounds) {
  const res = await fetch(`/api/overpass?${boundsToParams(bounds)}`, {
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`overpass proxy ${res.status}`);
  return res.json();
}
```

`vite.config.js`（全体を置き換え）:

```js
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
  server: { port: 5730, strictPort: true },
  test: { include: ['test/**/*.test.js'] },
});
```

- [ ] **Step 6: 実データの fixture を保存する**

`test/fixtures/points.js`:

```js
// 日暮里駅 → 根津駅（谷中の路地を抜ける、約 1.3km）
export const YANAKA = {
  start: { lat: 35.7281, lon: 139.771 },
  goal: { lat: 35.7175, lon: 139.7656 },
};
```

`scripts/fetch-fixture.js`:

```js
// 谷中付近の道データを Overpass から取って test/fixtures/yanaka.json に保存する
import { mkdirSync, writeFileSync } from 'node:fs';
import { fetchRoads } from '../api/_overpass-upstream.js';
import { fetchBounds } from '../src/lib/geo.js';
import { YANAKA } from '../test/fixtures/points.js';

const osm = await fetchRoads(fetchBounds(YANAKA.start, YANAKA.goal));
const dir = new URL('../test/fixtures/', import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL('yanaka.json', dir), JSON.stringify(osm));
const ways = osm.elements.filter((e) => e.type === 'way').length;
console.log(`保存しました: way ${ways} 本 / 要素 ${osm.elements.length} 個`);
```

Run: `pnpm fixture`
Expected: `保存しました: way <数百〜数千> 本 / 要素 <数千以上> 個`。失敗したら少し待ってから再実行する（Overpass の混雑）。

- [ ] **Step 7: 実データのテストを書く**

`test/realdata.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildGraph } from '../src/lib/graph.js';
import { planRoute } from '../src/lib/route.js';
import { pathLength, narrowShare } from '../src/lib/stats.js';
import { YANAKA } from './fixtures/points.js';

const osm = JSON.parse(readFileSync(new URL('./fixtures/yanaka.json', import.meta.url), 'utf8'));
const graph = buildGraph(osm);

describe('実データ: 日暮里駅 → 根津駅', () => {
  it('グラフが十分に大きい', () => {
    expect(graph.edges.length).toBeGreaterThan(500);
  });

  it.each([1.2, 1.5, 2.0])('上限 %s 倍でルートが出て、上限を守る', (maxDetour) => {
    const r = planRoute(graph, YANAKA.start, YANAKA.goal, maxDetour);
    expect(r.ok).toBe(true);
    expect(pathLength(r.chosen.edges)).toBeLessThanOrEqual(
      maxDetour * pathLength(r.shortest.edges) + 1e-6,
    );
  });

  it('上限 1.5 倍で、最短ルートより明らかに狭い道を通る', () => {
    const r = planRoute(graph, YANAKA.start, YANAKA.goal, 1.5);
    const chosen = narrowShare(r.chosen.edges);
    const shortest = narrowShare(r.shortest.edges);
    console.log(
      `狭い道: 採用 ${(chosen * 100).toFixed(0)}% / 最短 ${(shortest * 100).toFixed(0)}%、` +
        `遠回り ${(pathLength(r.chosen.edges) / pathLength(r.shortest.edges)).toFixed(2)}倍、α=${r.alpha}`,
    );
    expect(chosen).toBeGreaterThan(shortest + 0.1);
  });
});
```

- [ ] **Step 8: 通ることを確認する**

Run: `pnpm test`
Expected: PASS。console に「狭い道: 採用 xx% / 最短 yy%…」が出る。`最短ルートより明らかに狭い道を通る` が落ちた場合は、閾値を下げて通さない。出力された数字と、採用ルートの辺の `n` の分布を見て、点数表（Task 1）とルート選択（Task 6）のどちらの問題かを調べてユーザーに報告する。

- [ ] **Step 9: コミット**

```bash
git add src/lib/overpassQuery.js api vercel.json src/overpass.js vite.config.js scripts test/fixtures test/overpassQuery.test.js test/realdata.test.js
git commit -m "feat: Overpass 経由で道を取得、谷中の実データで検証

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 画面（地図・パネル・配線）とブラウザでの確認

**Files:**
- Create: `index.html`, `src/style.css`, `src/map.js`, `src/panel.js`, `src/main.js`
- Create: `.claude/launch.json`

**Interfaces:**
- Consumes: `fetchRoadData`（Task 8）、`isTooFar` / `fetchBounds`（Task 2）、`buildGraph`（Task 3）、`planRoute`（Task 6）、`routeStats`（Task 5）、`segmentsByBand` / `pathLatLngs` / `formatPercent` / `formatKm` / `formatDetour` / `formatLatLon` / `ERROR_MESSAGES` / `NO_IMPROVEMENT_NOTE`（Task 7）
- Produces:
  - `createMap(el, { onPick })` → `{ map, setStart(p|null), setGoal(p|null), setUser(p), center(p), drawRoute(segments, shortestLatLngs, { bottomPadding }), clearRoute() }`。`onPick(role: 'start' | 'goal', p: {lat, lon})`
  - `createPanel({ onGo, onDetourChange, onLocate })` → `{ setPoints({ startLabel, goalLabel }), setGoEnabled(bool), setStatus(text, kind?), showResult(stats, noImprovement), hideResult(), bottomInset() }`
  - `window.__app = { state, setStart(lat, lon), setGoal(lat, lon), go() }`（検証用。`go()` は完了まで待てる Promise を返す）

ヘッドレスのブラウザでは `html, body { height: 100% }` の連鎖が潰れて地図が 0×0 になることがある（とまり火で踏んだ）。地図は `100vh` と `min-height` の床で高さを決める。

- [ ] **Step 1: HTML を書く**

`index.html`:

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="description" content="狭い道・路地を選んで案内する散歩ナビ" />
    <title>ほそみち</title>
  </head>
  <body>
    <div id="map"></div>
    <button id="locate" type="button" aria-label="現在地に戻る">◎</button>

    <section id="panel" aria-label="ルートの設定と結果">
      <button id="panel-toggle" type="button" aria-label="パネルを開閉">
        <span class="handle"></span>
      </button>
      <h1>ほそみち</h1>
      <p id="hint">地図を長押し（PCは右クリック）して目的地を選んでください</p>

      <dl id="points">
        <dt>出発</dt>
        <dd id="start-label">現在地（取得中）</dd>
        <dt>目的地</dt>
        <dd id="goal-label">未設定</dd>
      </dl>

      <fieldset id="detour">
        <legend>遠回りの上限</legend>
        <label><input type="radio" name="detour" value="1.2" /> 1.2倍</label>
        <label><input type="radio" name="detour" value="1.5" checked /> 1.5倍</label>
        <label><input type="radio" name="detour" value="2" /> 2.0倍</label>
      </fieldset>

      <button id="go" type="button" disabled>ほそみちで行く</button>
      <p id="status" role="status"></p>

      <div id="result" hidden>
        <p class="share">
          狭い道 <strong id="r-share"></strong>
          <span class="sub">（最短なら <span id="r-short-share"></span>）</span>
        </p>
        <p>遠回り <span id="r-detour"></span> ・ <span id="r-length"></span></p>
        <p class="evidence">
          幅の根拠：実測 <span id="r-measured"></span>／種別から推定 <span id="r-estimated"></span>
        </p>
        <p id="r-note" class="note" hidden></p>
        <ul class="legend">
          <li><span class="swatch narrow"></span>狭い</li>
          <li><span class="swatch middle"></span>ふつう</li>
          <li><span class="swatch wide"></span>広い</li>
          <li><span class="swatch shortest"></span>最短ルート</li>
        </ul>
      </div>
    </section>

    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

- [ ] **Step 2: CSS を書く**

`src/style.css`:

```css
:root {
  --bg: #fbf8f3;
  --ink: #2b2620;
  --muted: #6f665b;
  --accent: #8a2b0a;
  --line: #e4ddd2;
  --error: #b3261e;
  --narrow: #8a2b0a;
  --middle: #e0832f;
  --wide: #f3c48c;
  --shortest: #777;
  font-family: system-ui, -apple-system, 'Hiragino Sans', 'Noto Sans JP', sans-serif;
  color: var(--ink);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
}

/* height:100% の連鎖はヘッドレスで潰れるので、100vh と床で決める */
#map {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  min-height: 480px;
  z-index: 0;
}

#locate {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 500;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: #fff;
  font-size: 20px;
  box-shadow: 0 2px 6px rgb(0 0 0 / 0.15);
  cursor: pointer;
}

#panel {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 500;
  max-height: 55vh;
  overflow-y: auto;
  padding: 4px 16px calc(16px + env(safe-area-inset-bottom));
  background: var(--bg);
  border-radius: 16px 16px 0 0;
  box-shadow: 0 -2px 12px rgb(0 0 0 / 0.15);
}

@media (min-width: 768px) {
  #panel {
    left: 16px;
    right: auto;
    bottom: 16px;
    width: 360px;
    border-radius: 16px;
  }
}

#panel.collapsed > :not(#panel-toggle):not(h1) {
  display: none;
}

#panel-toggle {
  display: block;
  width: 100%;
  height: 20px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}

#panel-toggle .handle {
  display: block;
  width: 40px;
  height: 4px;
  margin: 0 auto;
  border-radius: 2px;
  background: var(--line);
}

h1 {
  margin: 0 0 4px;
  font-size: 20px;
  letter-spacing: 0.1em;
  color: var(--accent);
}

#hint {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--muted);
}

#points {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 12px;
  margin: 0 0 8px;
  font-size: 14px;
}

#points dt {
  color: var(--muted);
}

#points dd {
  margin: 0;
}

#detour {
  display: flex;
  gap: 12px;
  margin: 0 0 12px;
  padding: 0;
  border: 0;
  font-size: 14px;
}

#detour legend {
  float: left;
  margin-right: 4px;
  color: var(--muted);
}

#go {
  width: 100%;
  padding: 12px;
  border: 0;
  border-radius: 10px;
  background: var(--accent);
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}

#go:disabled {
  opacity: 0.4;
  cursor: default;
}

#status {
  min-height: 1.4em;
  margin: 8px 0 0;
  font-size: 14px;
  color: var(--muted);
}

#status.error {
  color: var(--error);
}

#result p {
  margin: 4px 0;
  font-size: 14px;
}

#result .share {
  font-size: 16px;
}

#result .share strong {
  font-size: 28px;
  color: var(--accent);
}

#result .sub,
#result .evidence {
  color: var(--muted);
}

#result .evidence {
  font-size: 12px;
}

#result .note {
  color: var(--error);
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  font-size: 12px;
  color: var(--muted);
}

.swatch {
  display: inline-block;
  width: 18px;
  height: 4px;
  margin-right: 4px;
  vertical-align: middle;
  border-radius: 2px;
}

.swatch.narrow {
  background: var(--narrow);
}

.swatch.middle {
  background: var(--middle);
}

.swatch.wide {
  background: var(--wide);
}

.swatch.shortest {
  background: repeating-linear-gradient(90deg, var(--shortest) 0 5px, transparent 5px 9px);
}

.pin {
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 2px solid #fff;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  box-shadow: 0 1px 4px rgb(0 0 0 / 0.3);
}

.pin-start {
  background: #2a7de1;
}

.pin-goal {
  background: var(--accent);
}

.pick {
  display: grid;
  gap: 6px;
}

.pick button {
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  font-size: 14px;
  cursor: pointer;
}
```

- [ ] **Step 3: 地図を書く**

`src/map.js`:

```js
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const TOKYO = [35.6812, 139.7671];
const BAND_STYLE = {
  narrow: { color: '#8a2b0a', weight: 7 },
  middle: { color: '#e0832f', weight: 6 },
  wide: { color: '#f3c48c', weight: 5 },
};

export function createMap(el, { onPick }) {
  const map = L.map(el, { zoomControl: false }).setView(TOKYO, 16);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  const routeLayer = L.layerGroup().addTo(map);
  let startMarker = null;
  let goalMarker = null;
  let userDot = null;

  // 長押し（iOS Safari では Leaflet の tapHold が contextmenu に変換する）と右クリック
  map.on('contextmenu', (e) => {
    const box = document.createElement('div');
    box.className = 'pick';
    for (const [role, label] of [
      ['start', 'ここを出発地に'],
      ['goal', 'ここを目的地に'],
    ]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => {
        map.closePopup();
        onPick(role, { lat: e.latlng.lat, lon: e.latlng.lng });
      });
      box.append(button);
    }
    L.popup().setLatLng(e.latlng).setContent(box).openOn(map);
  });

  function pin(marker, point, cls, label) {
    if (!point) {
      marker?.remove();
      return null;
    }
    const ll = [point.lat, point.lon];
    if (marker) return marker.setLatLng(ll);
    return L.marker(ll, {
      icon: L.divIcon({ className: `pin ${cls}`, html: label, iconSize: [28, 28], iconAnchor: [14, 14] }),
    }).addTo(map);
  }

  return {
    map,
    setStart(point) {
      startMarker = pin(startMarker, point, 'pin-start', '出');
    },
    setGoal(point) {
      goalMarker = pin(goalMarker, point, 'pin-goal', '着');
    },
    setUser(point) {
      const ll = [point.lat, point.lon];
      if (userDot) {
        userDot.setLatLng(ll);
        return;
      }
      userDot = L.circleMarker(ll, {
        radius: 7,
        color: '#fff',
        weight: 2,
        fillColor: '#2a7de1',
        fillOpacity: 1,
      }).addTo(map);
    },
    center(point) {
      map.setView([point.lat, point.lon], Math.max(map.getZoom(), 16));
    },
    drawRoute(segments, shortestLatLngs, { bottomPadding }) {
      routeLayer.clearLayers();
      L.polyline(shortestLatLngs, { color: '#777', weight: 4, dashArray: '6 8', opacity: 0.8 }).addTo(
        routeLayer,
      );
      for (const s of segments) {
        L.polyline(s.latlngs, {
          ...BAND_STYLE[s.band],
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(routeLayer);
      }
      const all = segments.flatMap((s) => s.latlngs).concat(shortestLatLngs);
      if (all.length > 0) {
        map.fitBounds(L.latLngBounds(all), {
          paddingTopLeft: [24, 72],
          paddingBottomRight: [24, bottomPadding + 24],
        });
      }
    },
    clearRoute() {
      routeLayer.clearLayers();
    },
  };
}
```

- [ ] **Step 4: パネルを書く**

`src/panel.js`:

```js
import { formatPercent, formatKm, formatDetour, NO_IMPROVEMENT_NOTE } from './lib/format.js';

const $ = (id) => document.getElementById(id);

export function createPanel({ onGo, onDetourChange, onLocate }) {
  $('go').addEventListener('click', onGo);
  $('locate').addEventListener('click', onLocate);
  $('panel-toggle').addEventListener('click', () => $('panel').classList.toggle('collapsed'));
  for (const radio of document.querySelectorAll('input[name="detour"]')) {
    radio.addEventListener('change', () => onDetourChange(Number(radio.value)));
  }

  return {
    setPoints({ startLabel, goalLabel }) {
      $('start-label').textContent = startLabel;
      $('goal-label').textContent = goalLabel;
    },
    setGoEnabled(enabled) {
      $('go').disabled = !enabled;
    },
    setStatus(text, kind = 'info') {
      const el = $('status');
      el.textContent = text;
      el.classList.toggle('error', kind === 'error');
    },
    showResult(stats, noImprovement) {
      $('r-share').textContent = formatPercent(stats.narrowShare);
      $('r-short-share').textContent = formatPercent(stats.shortestNarrowShare);
      $('r-detour').textContent = formatDetour(stats.detour);
      $('r-length').textContent = formatKm(stats.lengthM);
      $('r-measured').textContent = formatPercent(stats.measuredShare);
      $('r-estimated').textContent = formatPercent(stats.estimatedShare);
      const note = $('r-note');
      note.textContent = noImprovement ? NO_IMPROVEMENT_NOTE : '';
      note.hidden = !noImprovement;
      $('result').hidden = false;
    },
    hideResult() {
      $('result').hidden = true;
    },
    bottomInset() {
      return window.innerWidth >= 768 ? 0 : $('panel').getBoundingClientRect().height;
    },
  };
}
```

- [ ] **Step 5: 配線を書く**

`src/main.js`:

```js
import './style.css';
import { createMap } from './map.js';
import { createPanel } from './panel.js';
import { fetchRoadData } from './overpass.js';
import { isTooFar, fetchBounds } from './lib/geo.js';
import { buildGraph } from './lib/graph.js';
import { planRoute } from './lib/route.js';
import { routeStats } from './lib/stats.js';
import { segmentsByBand, pathLatLngs } from './lib/segments.js';
import { ERROR_MESSAGES, formatLatLon } from './lib/format.js';

const state = {
  start: null, // null なら現在地を使う
  goal: null,
  user: null,
  geoFailed: false,
  maxDetour: 1.5,
  busy: false,
  lastResult: null,
};

const panel = createPanel({
  onGo: () => go(),
  onDetourChange: (r) => {
    state.maxDetour = r;
  },
  onLocate: () => {
    if (state.user) view.center(state.user);
  },
});
const view = createMap(document.getElementById('map'), { onPick: pick });

const startPoint = () => state.start ?? state.user;

function startLabel() {
  if (state.start) return formatLatLon(state.start);
  if (state.user) return '現在地';
  return state.geoFailed ? '現在地（取得できません）' : '現在地（取得中）';
}

function refresh() {
  panel.setPoints({
    startLabel: startLabel(),
    goalLabel: state.goal ? formatLatLon(state.goal) : '未設定',
  });
  panel.setGoEnabled(!state.busy && state.goal !== null);
  view.setStart(state.start);
  view.setGoal(state.goal);
}

function pick(role, point) {
  state[role] = point;
  refresh();
}

async function go() {
  const start = startPoint();
  const goal = state.goal;
  if (!goal || state.busy) return;
  if (!start) {
    panel.setStatus(ERROR_MESSAGES['no-start'], 'error');
    return;
  }
  if (isTooFar(start, goal)) {
    panel.setStatus(ERROR_MESSAGES['too-far'], 'error');
    return;
  }

  state.busy = true;
  refresh();
  panel.hideResult();
  view.clearRoute();
  panel.setStatus('道のデータを集めています…');
  try {
    let osm;
    try {
      osm = await fetchRoadData(fetchBounds(start, goal));
    } catch {
      panel.setStatus(ERROR_MESSAGES['fetch-failed'], 'error');
      return;
    }
    panel.setStatus('ほそみちを探しています…');
    await new Promise((resolve) => setTimeout(resolve, 0)); // 文言を描画させてから重い計算に入る

    const graph = buildGraph(osm);
    const result = planRoute(graph, start, goal, state.maxDetour);
    if (!result.ok) {
      panel.setStatus(ERROR_MESSAGES[result.error], 'error');
      return;
    }
    const stats = routeStats(result.chosen, result.shortest);
    state.lastResult = { ...result, stats };
    view.drawRoute(segmentsByBand(result.chosen, graph.nodes), pathLatLngs(result.shortest, graph.nodes), {
      bottomPadding: panel.bottomInset(),
    });
    panel.setStatus('');
    panel.showResult(stats, result.alpha === 0);
  } finally {
    state.busy = false;
    refresh();
  }
}

function watchUser() {
  if (!('geolocation' in navigator)) {
    state.geoFailed = true;
    refresh();
    return;
  }
  let first = true;
  navigator.geolocation.watchPosition(
    (pos) => {
      state.user = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      state.geoFailed = false;
      view.setUser(state.user);
      if (first) {
        view.center(state.user);
        first = false;
      }
      refresh();
    },
    () => {
      state.geoFailed = true;
      refresh();
    },
    { enableHighAccuracy: true, maximumAge: 5000 },
  );
}

// ヘッドレス検証用
window.__app = {
  state,
  setStart: (lat, lon) => pick('start', { lat, lon }),
  setGoal: (lat, lon) => pick('goal', { lat, lon }),
  go,
};

refresh();
watchUser();
```

- [ ] **Step 6: ビルドとテストが通ることを確認する**

Run: `pnpm test && pnpm build`
Expected: テストはすべて PASS、`vite build` が `dist/` を出力してエラーなし

- [ ] **Step 7: プレビュー設定を作り、ブラウザで確認する**

`.claude/launch.json`:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "hosomichi",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["dev"],
      "port": 5730
    }
  ]
}
```

確認手順（built-in browser の preview ツール）:

1. `preview_start {name: "hosomichi"}`
2. `read_console_messages` でエラーがないこと
3. `javascript_tool` で谷中のルートを出す:
   ```js
   window.__app.setStart(35.7281, 139.771);
   window.__app.setGoal(35.7175, 139.7656);
   await window.__app.go();
   ({ ok: window.__app.state.lastResult?.ok, stats: window.__app.state.lastResult?.stats, status: document.getElementById('status').textContent })
   ```
   Expected: `ok: true`、`stats.narrowShare > stats.shortestNarrowShare`、`status` が空
4. `read_page` でパネルに「狭い道 xx%（最短なら yy%）」「遠回り x.x倍 ・ x.xkm」「幅の根拠：…」が出ていること
5. `computer {action: "screenshot"}` で、色分けした線と灰色の点線が地図に描かれていること、出・着のピンが出ていることを目で確認する
6. 5km 超のエラー: `window.__app.setGoal(35.6896, 139.7006); await window.__app.go(); document.getElementById('status').textContent` → `'5km以内で選んでください'`
7. `resize_window {preset: "mobile"}` → 再読み込み → 手順 3 → スクリーンショットで、パネルが下に出て地図とルートが見えること。終わったら `resize_window {preset: "desktop"}`
8. 地図を右クリックして「ここを目的地に」のポップアップが出ること（`computer` の `right_click` → `screenshot`）

問題があればソースを直して手順 2 からやり直す。

- [ ] **Step 8: コミット**

```bash
git add index.html src/style.css src/map.js src/panel.js src/main.js .claude/launch.json
git commit -m "feat: 地図とパネルの画面

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: README と仕上げ

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: すべて
- Produces: なし

- [ ] **Step 1: README を書く**

`README.md`:

````markdown
# ほそみち

狭い道・路地を選んで案内する散歩ナビ。出発地から目的地まで、遠回りの上限（最短の 1.2 / 1.5 / 2.0 倍）の範囲で、道幅の狭い道をなるべく多く通るルートを出します。

## 使い方

1. 地図を長押し（PC では右クリック）して目的地を選ぶ。出発地は現在地（同じ操作で変えられる）
2. 遠回りの上限を選んで「ほそみちで行く」
3. 線の色が濃いほど狭い道。灰色の点線は比較用の最短ルート

## しくみ

- 道データは OpenStreetMap（Overpass API）。道ごとに狭さ点数 n（0〜1）を付ける。`width` タグがあれば実測値、なければ道の種別（路地・階段・生活道路・幹線など）から推定する。画面には実測と推定の割合を出す
- コスト「長さ ×（1 + α ×（1 − n））」で α を 0〜32 の 8 通り試し、遠回りの上限内で狭い道（n ≥ 0.7）の割合が最大のルートを採用する
- 直線距離 5km まで

## 開発

```bash
pnpm install
pnpm dev        # http://localhost:5730
pnpm test
pnpm fixture    # 谷中の実データ fixture を取り直す
```

Overpass は `*.vercel.app` からのブラウザ直叩きを遮断するため、dev・本番とも同一オリジンの `/api/overpass`（範囲だけを GET で受け取り、サーバでクエリを組み立てる）を通します。

地図データ © OpenStreetMap contributors
````

- [ ] **Step 2: 最終確認**

Run: `pnpm test && pnpm build`
Expected: すべて PASS、ビルド成功

- [ ] **Step 3: コミット**

```bash
git add README.md
git commit -m "docs: README

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
