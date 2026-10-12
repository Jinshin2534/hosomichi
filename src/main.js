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
  runId: 0, // go() の実行ごとに増やす
  inputsVersion: 0, // 入力が変わるたびに増やし、古い入力で走った結果を捨てる
  lastResult: null,
};

const panel = createPanel({
  onGo: () => go(),
  onDetourChange: (r) => {
    state.maxDetour = r;
    state.inputsVersion++;
    if (!state.busy) clearResult();
  },
  onLocate: () => {
    if (state.user) view.center(state.user);
  },
});
const view = createMap(document.getElementById('map'), {
  onPick: pick,
  getInsets: () => panel.insets(),
});

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

// 入力が変わったら古い結果は捨てる
function clearResult() {
  panel.hideResult();
  view.clearRoute();
  panel.setStatus('');
  state.lastResult = null;
}

function pick(role, point) {
  state[role] = point;
  state.inputsVersion++;
  if (!state.busy) clearResult(); // 計算中は走っている実行に触らない
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

  const version = state.inputsVersion;
  const runId = ++state.runId;
  const maxDetour = state.maxDetour;
  state.busy = true;
  refresh();
  panel.hideResult();
  view.clearRoute();
  panel.setStatus('道のデータを集めています…');
  try {
    let osm;
    try {
      osm = await fetchRoadData(fetchBounds(start, goal), (done, total) => {
        if (runId !== state.runId || version !== state.inputsVersion) return;
        panel.setStatus(`道のデータを集めています…（${done}/${total}）`);
      });
    } catch {
      if (version !== state.inputsVersion) {
        panel.setStatus('');
        return;
      }
      panel.setStatus(ERROR_MESSAGES['fetch-failed'], 'error');
      return;
    }
    if (version !== state.inputsVersion) {
      panel.setStatus('');
      return;
    }
    panel.setStatus('ほそみちを探しています…');
    await new Promise((resolve) => setTimeout(resolve, 0)); // 文言を描画させてから重い計算に入る
    if (version !== state.inputsVersion) {
      panel.setStatus('');
      return;
    }

    try {
      const graph = buildGraph(osm);
      const result = planRoute(graph, start, goal, maxDetour);
      if (!result.ok) {
        panel.setStatus(ERROR_MESSAGES[result.error], 'error');
        return;
      }
      const stats = routeStats(result.chosen, result.shortest);
      state.lastResult = { ...result, stats };
      // パネルが伸びてから余白を測る（先に測ると下側がパネルに隠れる）
      panel.setStatus('');
      panel.showResult(stats, result.alpha === 0);
      view.drawRoute(segmentsByBand(result.chosen, graph.nodes), pathLatLngs(result.shortest, graph.nodes), {
        insets: panel.insets(),
      });
    } catch (err) {
      console.error(err);
      panel.hideResult();
      view.clearRoute();
      state.lastResult = null;
      panel.setStatus(ERROR_MESSAGES.unexpected, 'error');
    }
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
