// Geotagging from a GPX track (ACDSee "Geotag with GPS track"): photos get the
// position the track had when they were taken. A clock offset fixes cameras
// set to the wrong time or zone; the preview shows each photo's match.
import { locate, parseGpx } from '../catalog/gpx.js';
import { t } from '../i18n.js';
import { fs } from '../platform/fs.js';
import { chooseFiles, errorText, isDesktop } from '../platform/native.js';
import { app, saveCatalogSoon } from '../store.js';
import { formatDateTime } from '../util/format.js';
import { field, openDialog, toast } from './dialog.js';
import { h } from './dom.js';
import { icon } from './icons.js';

async function readGpx() {
  if (isDesktop()) {
    const [path] = await chooseFiles([{ name: 'GPX', extensions: ['gpx'] }]);
    return path ? { name: path.split(/[\\/]/).pop(), text: new TextDecoder().decode(await fs.read(path)) } : null;
  }
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: '.gpx', style: { display: 'none' } });
    input.addEventListener('change', async () => { const f = input.files?.[0]; input.remove(); resolve(f ? { name: f.name, text: await f.text() } : null); });
    document.body.append(input);
    input.click();
  });
}

/** Opens the GPX dialog for these photos (paths). */
export async function gpxGeotagDialog(paths) {
  if (!paths.length) { toast(t('gpx.noPhotos'), 'info'); return; }
  let file;
  try { file = await readGpx(); } catch (error) { toast(errorText(error), 'error'); return; }
  if (!file) return;
  let points;
  try { points = parseGpx(file.text); } catch (error) { toast(`${file.name}: ${errorText(error)}`, 'error', 6000); return; }
  if (!points.length) { toast(t('gpx.empty', { name: file.name }), 'error', 6000); return; }

  const hours = h('input.input', { type: 'number', min: -14, max: 14, step: 1, value: 0, dataset: { key: 'gpx-hours' } });
  const minutes = h('input.input', { type: 'number', min: -59, max: 59, step: 1, value: 0, dataset: { key: 'gpx-minutes' } });
  const gap = h('input.input', { type: 'number', min: 1, max: 720, step: 1, value: 5, dataset: { key: 'gpx-gap' } });
  const overwrite = h('input', { type: 'checkbox', checked: false, dataset: { key: 'gpx-overwrite' } });
  const table = h('table.prop-table.gpx-table');
  const summary = h('div.gpx-summary');
  let matches = [];
  const compute = () => {
    const offset = (Number(hours.value) || 0) * 3_600_000 + (Number(minutes.value) || 0) * 60_000;
    const maxGap = Math.max(1, Number(gap.value) || 5) * 60_000;
    matches = paths.map((path) => {
      const record = app.catalog.get(path) ?? {};
      const when = record.meta?.taken ?? null;
      const has = record.meta?.lat != null;
      const spot = when ? locate(points, when, { offset, maxGap }) : null;
      return { path, when, spot, skip: has && !overwrite.checked };
    });
    const found = matches.filter((m) => m.spot && !m.skip).length;
    summary.textContent = t('gpx.summary', { n: found, total: paths.length, points: points.length });
    table.replaceChildren(h('tr', h('th', t('prop.name')), h('th', t('exif.taken')), h('th', t('exif.gps'))),
      ...matches.slice(0, 200).map((m) => h(`tr${m.spot && !m.skip ? '' : '.diff'}`, { dataset: { gpxRow: m.path } },
        h('td', m.path.split(/[\\/]/).pop()), h('td', m.when ? formatDateTime(m.when) : t('gpx.noTime')),
        h('td', m.skip ? t('gpx.hasLocation') : m.spot ? `${m.spot.lat.toFixed(5)}, ${m.spot.lon.toFixed(5)}` : t('gpx.noMatch')))));
  };
  for (const input of [hours, minutes, gap]) input.addEventListener('input', compute);
  overwrite.addEventListener('change', compute);
  compute();
  const first = new Date(points[0].time);
  const last = new Date(points[points.length - 1].time);
  const ok = await openDialog({
    title: t('gpx.title'), width: 640, id: 'gpx-dialog',
    body: h('div.gpx-dialog',
      h('div.hint', h('span', { html: icon('map') }), ` ${file.name} · ${t('gpx.range', { from: formatDateTime(first.getTime()), to: formatDateTime(last.getTime()), n: points.length })}`),
      h('div.field-row', field(t('gpx.offsetHours'), hours), field(t('gpx.offsetMinutes'), minutes), field(t('gpx.maxGap'), gap)),
      h('label.check', overwrite, t('gpx.overwrite')),
      summary, h('div.gpx-scroll', table)),
    buttons: [{ label: t('common.cancel'), value: false }, { label: t('gpx.apply'), value: true, primary: true }],
  });
  if (!ok) return;
  const chosen = matches.filter((m) => m.spot && !m.skip);
  for (const m of chosen) {
    app.catalog.update([m.path], (record) => {
      record.meta = { ...(record.meta ?? {}), lat: m.spot.lat, lon: m.spot.lon };
      if (m.spot.ele != null) record.meta.alt = m.spot.ele;
      record.geotagged = true;
    }, 'location');
  }
  saveCatalogSoon();
  toast(t('gpx.done', { n: chosen.length }), chosen.length ? 'success' : 'info');
}
