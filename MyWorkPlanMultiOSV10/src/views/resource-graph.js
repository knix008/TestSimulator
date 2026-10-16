// Resource Graph: one resource's work per day (or week) as columns against its
// availability; the part over the limit is red. Pick the resource on the left.
import { escapeHtml } from '../ui/dom.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { resourceLoad } from '../domain/schedule.js';
import { dayOf, dayStart, formatDay, parts, weekStartDay } from '../domain/time.js';

export class ResourceGraphView {
  constructor(app, host) {
    this.app = app;
    this.host = host;
    host.classList.add('graph-view');
    host.addEventListener('click', (event) => {
      const item = event.target.closest('[data-resource]');
      if (item) app.selectResource(item.dataset.resource, event);
    });
    host.addEventListener('dblclick', (event) => {
      const item = event.target.closest('[data-resource]');
      if (item) app.openResourceInfo(item.dataset.resource);
    });
    host.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const item = event.target.closest('[data-resource]');
      app.contextMenu(event, 'resourceRow', { id: item?.dataset.resource ?? null });
    });
    this.resize = new ResizeObserver(() => this.render());
    this.resize.observe(host);
  }

  current() {
    const project = this.app.project();
    const selected = this.app.selection();
    const id = selected.kind === 'resource' ? selected.ids[0] : project.resources.find((r) => r.type === 'work')?.id;
    return project.resources.find((r) => r.id === id) ?? null;
  }

  render() {
    const app = this.app;
    const project = app.project();
    const sched = app.sched();
    const settings = app.settings();
    const resource = this.current();
    const list = project.resources.map((r) => {
      const info = sched.resources.get(r.id);
      return `<button class="graph-pick ${resource?.id === r.id ? 'active' : ''} ${info?.overallocated ? 'over' : ''}" data-resource="${escapeHtml(r.id)}" title="${escapeHtml(r.name)}">${icon(info?.overallocated ? 'overallocation' : 'user')}<span>${escapeHtml(r.name)}</span></button>`;
    }).join('') || `<div class="muted">${escapeHtml(t('graph.noResources'))}</div>`;
    let chart = `<div class="tl-empty">${icon('info')}<span>${escapeHtml(t('graph.pick'))}</span></div>`;
    if (resource && resource.type === 'work') {
      const from = weekStartDay(dayOf(sched.start), project.options.weekStart ?? 1);
      const to = dayOf(sched.finish) + 1;
      const load = resourceLoad(sched, resource.id, from, to);
      const cal = resource.calendarId ? sched.calendars.get(resource.calendarId) : sched.projectCal;
      const width = Math.max(300, this.host.clientWidth - 320);
      const weekly = (to - from) * 14 > width;
      const buckets = [];
      for (let d = from; d <= to; d += weekly ? 7 : 1) {
        let work = 0;
        let capacity = 0;
        for (let i = d; i < d + (weekly ? 7 : 1) && i <= to; i++) { work += load[i - from] ?? 0; capacity += cal.dayMinutes(i) * (resource.maxUnits ?? 1); }
        buckets.push({ day: d, work, capacity });
      }
      const peak = Math.max(1, ...buckets.map((b) => Math.max(b.work, b.capacity)));
      const bw = width / buckets.length;
      const H = 300;
      const bars = buckets.map((b, i) => {
        const okH = (Math.min(b.work, b.capacity) / peak) * H;
        const overH = (Math.max(0, b.work - b.capacity) / peak) * H;
        const capY = H - (b.capacity / peak) * H;
        const p = parts(dayStart(b.day));
        return `<g><rect class="g-ok" x="${i * bw + 1}" y="${H - okH}" width="${Math.max(1, bw - 2)}" height="${okH}"><title>${escapeHtml(`${formatDay(dayStart(b.day), settings.dateFormat)}: ${(b.work / 60).toFixed(1)}h / ${(b.capacity / 60).toFixed(1)}h`)}</title></rect>
          ${overH ? `<rect class="g-over" x="${i * bw + 1}" y="${H - okH - overH}" width="${Math.max(1, bw - 2)}" height="${overH}"/>` : ''}
          <line class="g-cap" x1="${i * bw}" x2="${(i + 1) * bw}" y1="${capY}" y2="${capY}"/>
          ${i % Math.max(1, Math.round(60 / bw)) === 0 ? `<text x="${i * bw + 2}" y="${H + 16}">${p.month + 1}/${p.day}</text>` : ''}</g>`;
      }).join('');
      const info = sched.resources.get(resource.id);
      chart = `<div class="graph-title">${icon('viewResourceGraph')}<b>${escapeHtml(resource.name)}</b>
          <span class="muted">${escapeHtml(t('graph.summary', { max: Math.round((resource.maxUnits ?? 1) * 100), peak: Math.round((info?.peak ?? 0) * 100), work: Math.round((info?.work ?? 0) / 60) }))}</span>
          ${info?.overallocated ? `<span class="badge danger">${escapeHtml(t('graph.over'))}</span>` : ''}</div>
        <svg class="graph-svg" width="${width}" height="${H + 24}" viewBox="0 0 ${width} ${H + 24}"><line class="g-axis" x1="0" x2="${width}" y1="${H}" y2="${H}"/>${bars}</svg>
        <div class="graph-legend"><i class="g-ok"></i>${escapeHtml(t('graph.allocated'))}<i class="g-over"></i>${escapeHtml(t('graph.overallocated'))}<i class="g-cap"></i>${escapeHtml(t('graph.available'))}<span class="muted">${escapeHtml(t(weekly ? 'graph.weekly' : 'graph.daily'))}</span></div>`;
    } else if (resource) {
      chart = `<div class="tl-empty">${icon('info')}<span>${escapeHtml(t('graph.workOnly'))}</span></div>`;
    }
    this.host.innerHTML = `<div class="graph-list">${list}</div><div class="graph-chart">${chart}</div>`;
  }

  update() { this.render(); }
  selectionChanged() { this.render(); }
  scrollToTask() {}
  destroy() { this.resize.disconnect(); this.host.innerHTML = ''; this.host.className = 'view-host'; }
}
