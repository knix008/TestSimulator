// Map pane: where the photos of the list were taken (GPS in EXIF), on
// OpenStreetMap tiles (can be turned off in the settings). Click a marker to
// select its photos; right-click the map to place the selected photos there.
import { t } from '../i18n.js';
import { fs } from '../platform/fs.js';
import { app, saveCatalogSoon, setSelection, targetPaths } from '../store.js';
import { clear, debounce, h } from './dom.js';
import { icon } from './icons.js';
import { contextMenu } from './menu.js';

const TILE = 256;
const lon2x = (lon, z) => ((lon + 180) / 360) * TILE * 2 ** z;
const lat2y = (lat, z) => {
  const r = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * TILE * 2 ** z;
};
const x2lon = (x, z) => (x / (TILE * 2 ** z)) * 360 - 180;
const y2lat = (y, z) => {
  const n = Math.PI - (2 * Math.PI * y) / (TILE * 2 ** z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

export function createMapPane() {
  const el = h('div.pane-body.map-pane');
  const map = h('div.map', { tabIndex: 0, dataset: { drop: '__map__' } });
  const tiles = h('div.map-tiles');
  const markers = h('div.map-markers');
  const note = h('div.map-note');
  const toolbar = h('div.map-tools',
    h('button.tool.small', { type: 'button', title: t('map.zoomIn'), html: icon('plus'), onclick: () => zoomBy(1) }),
    h('button.tool.small', { type: 'button', title: t('map.zoomOut'), html: icon('minus'), onclick: () => zoomBy(-1) }),
    h('button.tool.small', { type: 'button', title: t('map.fit'), html: icon('fit'), onclick: () => fit(true) }),
    h('button.tool.small', { type: 'button', title: t('map.openExternal'), html: icon('external'), onclick: () => fs.openUrl(`https://www.openstreetmap.org/#map=${zoom}/${center.lat.toFixed(5)}/${center.lon.toFixed(5)}`) }));
  map.append(tiles, markers, toolbar);
  el.append(map, note, h('div.map-attribution', '© OpenStreetMap contributors'));

  let zoom = 2;
  let center = { lat: 30, lon: 0 };
  let points = [];
  let userMoved = false;

  function collect() {
    const groups = new Map();
    for (const item of app.state.list) {
      const m = app.catalog.get(item.path)?.meta;
      if (m?.lat == null) continue;
      const key = `${m.lat.toFixed(4)},${m.lon.toFixed(4)}`;
      if (!groups.has(key)) groups.set(key, { lat: m.lat, lon: m.lon, paths: [] });
      groups.get(key).paths.push(item.path);
    }
    points = [...groups.values()];
  }

  function fit(force = false) {
    if (userMoved && !force) return;
    const selected = points.filter((p) => p.paths.some((path) => app.state.selection.has(path)));
    const use = selected.length ? selected : points;
    if (!use.length) return;
    const w = map.clientWidth || 280;
    const hgt = map.clientHeight || 280;
    const lats = use.map((p) => p.lat);
    const lons = use.map((p) => p.lon);
    center = { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lon: (Math.min(...lons) + Math.max(...lons)) / 2 };
    zoom = 16;
    while (zoom > 1) {
      const dx = lon2x(Math.max(...lons), zoom) - lon2x(Math.min(...lons), zoom);
      const dy = lat2y(Math.min(...lats), zoom) - lat2y(Math.max(...lats), zoom);
      if (dx < w - 60 && dy < hgt - 60) break;
      zoom -= 1;
    }
    if (use.length === 1) zoom = Math.min(zoom, 14);
    if (force) userMoved = false;
    draw();
  }

  function draw() {
    const w = map.clientWidth;
    const hgt = map.clientHeight;
    if (!w || !hgt) return;
    const cx = lon2x(center.lon, zoom);
    const cy = lat2y(center.lat, zoom);
    const left = cx - w / 2;
    const top = cy - hgt / 2;
    clear(tiles);
    if (app.settings.mapTiles) {
      const n = 2 ** zoom;
      for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + hgt) / TILE); ty++) {
        if (ty < 0 || ty >= n) continue;
        for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + w) / TILE); tx++) {
          const wrapped = ((tx % n) + n) % n;
          const img = h('img.map-tile', { src: `https://tile.openstreetmap.org/${zoom}/${wrapped}/${ty}.png`, alt: '', draggable: false, referrerPolicy: 'strict-origin-when-cross-origin' });
          img.style.transform = `translate(${tx * TILE - left}px, ${ty * TILE - top}px)`;
          img.onerror = () => img.classList.add('failed');
          tiles.append(img);
        }
      }
    }
    clear(markers);
    for (const point of points) {
      const x = lon2x(point.lon, zoom) - left;
      const y = lat2y(point.lat, zoom) - top;
      if (x < -20 || y < -20 || x > w + 20 || y > hgt + 20) continue;
      const selected = point.paths.some((path) => app.state.selection.has(path));
      const marker = h(`button.map-marker${selected ? '.selected' : ''}`, { type: 'button', title: point.paths.map((p) => p.split(/[\\/]/).pop()).join('\n'), style: { left: `${x}px`, top: `${y}px` }, html: icon('mapPin') });
      if (point.paths.length > 1) marker.append(h('span.map-count', String(point.paths.length)));
      marker.addEventListener('click', (event) => { event.stopPropagation(); setSelection(point.paths); });
      markers.append(marker);
    }
    note.textContent = points.length ? t('map.count', { n: points.reduce((s, p) => s + p.paths.length, 0) }) : t('map.none');
  }

  function zoomBy(step, at = null) {
    const next = Math.max(1, Math.min(18, zoom + step));
    if (next === zoom) return;
    if (at) {
      const w = map.clientWidth;
      const hgt = map.clientHeight;
      const px = lon2x(center.lon, zoom) - w / 2 + at.x;
      const py = lat2y(center.lat, zoom) - hgt / 2 + at.y;
      const lon = x2lon(px, zoom);
      const lat = y2lat(py, zoom);
      zoom = next;
      center = { lon: x2lon(lon2x(lon, zoom) - at.x + w / 2, zoom), lat: y2lat(lat2y(lat, zoom) - at.y + hgt / 2, zoom) };
    } else zoom = next;
    userMoved = true;
    draw();
  }

  map.addEventListener('wheel', (event) => {
    event.preventDefault();
    const rect = map.getBoundingClientRect();
    zoomBy(event.deltaY < 0 ? 1 : -1, { x: event.clientX - rect.left, y: event.clientY - rect.top });
  }, { passive: false });

  map.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.target.closest('button')) return;
    const start = { x: event.clientX, y: event.clientY, cx: lon2x(center.lon, zoom), cy: lat2y(center.lat, zoom) };
    map.setPointerCapture(event.pointerId);
    const move = (e) => {
      center = { lon: x2lon(start.cx - (e.clientX - start.x), zoom), lat: y2lat(start.cy - (e.clientY - start.y), zoom) };
      userMoved = true;
      draw();
    };
    const up = () => { map.removeEventListener('pointermove', move); map.removeEventListener('pointerup', up); };
    map.addEventListener('pointermove', move);
    map.addEventListener('pointerup', up);
  });

  map.addEventListener('contextmenu', (event) => {
    const rect = map.getBoundingClientRect();
    const px = lon2x(center.lon, zoom) - map.clientWidth / 2 + (event.clientX - rect.left);
    const py = lat2y(center.lat, zoom) - map.clientHeight / 2 + (event.clientY - rect.top);
    const spot = { lat: Math.round(y2lat(py, zoom) * 1e6) / 1e6, lon: Math.round(x2lon(px, zoom) * 1e6) / 1e6 };
    const paths = targetPaths({ filesOnly: true });
    contextMenu(event, [
      { label: t('map.placeHere', { n: paths.length }), icon: 'mapPin', disabled: !paths.length, action: () => geotag(paths, spot) },
      { label: t('map.removeLocation'), icon: 'close', disabled: !paths.length, action: () => geotag(paths, null) },
    ]);
  });

  function geotag(paths, spot) {
    app.catalog.update(paths, (record) => {
      record.meta = { ...(record.meta ?? {}) };
      if (spot) { record.meta.lat = spot.lat; record.meta.lon = spot.lon; record.geotagged = true; } else { delete record.meta.lat; delete record.meta.lon; delete record.geotagged; }
    }, 'location');
    saveCatalogSoon();
  }

  function render() {
    collect();
    fit();
    draw();
  }

  const later = debounce(() => { if (el.isConnected) render(); }, 200);
  app.on('items', () => { userMoved = false; later(); });
  app.on('selection', later);
  app.on('catalog', later);
  app.on('info', later);
  new ResizeObserver(() => { if (el.isConnected) draw(); }).observe(map);
  /** Photos dragged from the file list onto the map get that location. */
  function placeAt(clientX, clientY, paths) {
    const rect = map.getBoundingClientRect();
    const px = lon2x(center.lon, zoom) - map.clientWidth / 2 + (clientX - rect.left);
    const py = lat2y(center.lat, zoom) - map.clientHeight / 2 + (clientY - rect.top);
    geotag(paths.filter((p) => !/[\/]$/.test(p)), { lat: Math.round(y2lat(py, zoom) * 1e6) / 1e6, lon: Math.round(x2lon(px, zoom) * 1e6) / 1e6 });
  }

  return { el, render, placeAt, geotag };
}
