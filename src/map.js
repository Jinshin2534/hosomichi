import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const TOKYO = [35.6812, 139.7671];
const BAND_STYLE = {
  narrow: { color: '#8a2b0a', weight: 7 },
  middle: { color: '#e0832f', weight: 6 },
  wide: { color: '#f3c48c', weight: 5 },
};

export function createMap(el, { onPick, getBottomInset }) {
  const map = L.map(el, { zoomControl: false, attributionControl: false }).setView(TOKYO, 16);
  // 下のパネルに隠れないよう左上（右上は現在地ボタン）
  L.control.attribution({ position: 'topleft' }).addTo(map);
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
    L.popup({
      autoPanPaddingTopLeft: [16, 72],
      autoPanPaddingBottomRight: [16, getBottomInset() + 16],
    })
      .setLatLng(e.latlng).setContent(box).openOn(map);
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
