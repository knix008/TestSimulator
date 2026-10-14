// Calendar pane: photos by the date they were taken (file date when there is
// no EXIF date). Days with photos are marked with their count.
import { photoDate } from '../catalog/catalog.js';
import { t } from '../i18n.js';
import { app, openSource } from '../store.js';
import { formatDate, formatMonth, weekdayNames } from '../util/format.js';
import { clear, debounce, h } from './dom.js';
import { icon } from './icons.js';

export function createCalendarPane() {
  const el = h('div.pane-body.calendar-pane');
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();
  let selected = null;

  function counts() {
    const days = new Map();
    const years = new Map();
    for (const record of app.catalog.files.values()) {
      if (!record.indexed) continue;
      const when = photoDate(record);
      if (!when) continue;
      const d = new Date(when);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      days.set(key, (days.get(key) ?? 0) + 1);
      years.set(d.getFullYear(), (years.get(d.getFullYear()) ?? 0) + 1);
    }
    return { days, years };
  }

  function open(from, to, title, key) {
    selected = key;
    openSource({ type: 'calendar', filters: [{ type: 'date', from: from.getTime(), to: to.getTime() }], title });
    render();
  }

  function render() {
    const { days, years } = counts();
    clear(el);
    const head = h('div.cal-head',
      h('button.tool.small', { type: 'button', title: t('calendar.prev'), html: icon('prev'), onclick: () => { month -= 1; if (month < 0) { month = 11; year -= 1; } render(); } }),
      h('button.cal-title', { type: 'button', onclick: () => open(new Date(year, month, 1), new Date(year, month + 1, 1), formatMonth(year, month), `m${year}-${month}`) }, formatMonth(year, month)),
      h('button.tool.small', { type: 'button', title: t('calendar.next'), html: icon('next'), onclick: () => { month += 1; if (month > 11) { month = 0; year += 1; } render(); } }));
    const grid = h('div.cal-grid');
    for (const name of weekdayNames()) grid.append(h('div.cal-weekday', name));
    const first = new Date(year, month, 1).getDay();
    const total = new Date(year, month + 1, 0).getDate();
    for (let i = 0; i < first; i++) grid.append(h('div.cal-day.blank'));
    for (let d = 1; d <= total; d++) {
      const count = days.get(`${year}-${month}-${d}`) ?? 0;
      const key = `d${year}-${month}-${d}`;
      const isToday = year === now.getFullYear() && month === now.getMonth() && d === now.getDate();
      const cell = h(`button.cal-day${count ? '.has' : ''}${selected === key ? '.active' : ''}${isToday ? '.today' : ''}`, { type: 'button', title: count ? t('calendar.photos', { n: count }) : '', disabled: !count },
        h('span.cal-num', String(d)), count ? h('span.cal-count', String(count)) : null);
      cell.addEventListener('click', () => open(new Date(year, month, d), new Date(year, month, d + 1), formatDate(new Date(year, month, d).getTime(), { year: 'numeric', month: 'long', day: 'numeric' }), key));
      grid.append(cell);
    }
    const yearList = h('div.cal-years', h('div.cat-section-head', t('calendar.years')));
    for (const [y, n] of [...years].sort((a, b) => b[0] - a[0])) {
      const row = h(`div.cat-row${selected === `y${y}` ? '.active' : ''}`, { role: 'button', tabIndex: 0 }, h('span.cat-icon', { html: icon('calendar') }), h('span.cat-label', String(y)), h('span.cat-count', String(n)));
      row.addEventListener('click', () => { year = y; open(new Date(y, 0, 1), new Date(y + 1, 0, 1), String(y), `y${y}`); });
      yearList.append(row);
    }
    // Months of the shown year.
    const monthRow = h('div.cal-months');
    for (let m = 0; m < 12; m++) {
      let n = 0;
      for (let d = 1; d <= 31; d++) n += days.get(`${year}-${m}-${d}`) ?? 0;
      const b = h(`button.cal-month${m === month ? '.current' : ''}${n ? '.has' : ''}`, { type: 'button', title: n ? t('calendar.photos', { n }) : '' }, new Date(year, m, 1).toLocaleDateString(undefined, { month: 'short' }));
      b.addEventListener('click', () => { month = m; render(); });
      monthRow.append(b);
    }
    el.append(head, grid, monthRow, years.size ? yearList : h('div.cat-empty', t('calendar.empty')));
  }

  const later = debounce(() => { if (el.isConnected) render(); }, 400);
  app.on('catalog', later);
  return { el, render };
}
