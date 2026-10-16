// Resource Graph: one resource's work per day (or week) as columns against its
// availability; the part over the limit is red. Pick the resource on the left.
import { escapeHtml } from '../ui/dom.js';
import { icon } from '../icons.js';
import { getLanguage, t } from '../i18n.js';
import { resourceLoad } from '../domain/schedule.js';
import { dayOf, dayStart, formatDay, parts, weekStartDay } from '../domain/time.js';
import { labelIndexes, plainNumber, valueAxis } from '../ui/axes.js';

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
      // Axes: hours on the left (round ticks, gridlines, numbers on the ruler), dates below.
      const language = getLanguage();
      const peak = Math.max(60, ...buckets.map((b) => Math.max(b.work, b.capacity)));
      const axis = valueAxis(peak, 'hours', { language });
      const M = { left: 64, right: 12, top: 14, bottom: 44 };
      const H = Math.max(240, Math.min(480, this.host.clientHeight - 150));
      const plotW = width - M.left - M.right;
      const bw = plotW / buckets.length;
      const y = (minutes) => M.top + H - (minutes / axis.top) * H;
      const grid = axis.ticks.map((tick) => `<line class="g-grid" x1="${M.left}" x2="${M.left + plotW}" y1="${y(tick.value)}" y2="${y(tick.value)}"/>
          <line class="g-tick" x1="${M.left - 5}" x2="${M.left}" y1="${y(tick.value)}" y2="${y(tick.value)}"/>
          <text class="g-ylabel" x="${M.left - 8}" y="${y(tick.value) + 4}">${escapeHtml(tick.text)}</text>`).join('');
      const labelled = new Set(labelIndexes(buckets.length, plotW, 58));
      const xticks = buckets.map((b, i) => {
        const x = M.left + i * bw;
        const p = parts(dayStart(b.day));
        return labelled.has(i) ? `<line class="g-vgrid" x1="${x}" x2="${x}" y1="${M.top}" y2="${M.top + H}"/><line class="g-tick" x1="${x}" x2="${x}" y1="${M.top + H}" y2="${M.top + H + 5}"/><text class="g-xlabel" x="${x}" y="${M.top + H + 18}">${p.month + 1}/${p.day}</text>` : `<line class="g-tick minor" x1="${x}" x2="${x}" y1="${M.top + H}" y2="${M.top + H + 3}"/>`;
      }).join('');
      const showValues = bw >= 30;
      const bars = buckets.map((b, i) => {
        const x = M.left + i * bw + 1;
        const ok = Math.min(b.work, b.capacity);
        const over = Math.max(0, b.work - b.capacity);
        const tip = `${formatDay(dayStart(b.day), settings.dateFormat)}: ${t('graph.tipWork', { work: plainNumber(b.work / 60, language), capacity: plainNumber(b.capacity / 60, language) })}`;
        return `<g><title>${escapeHtml(tip)}</title>
          <rect class="g-ok" x="${x}" y="${y(ok)}" width="${Math.max(1, bw - 2)}" height="${y(0) - y(ok)}"/>
          ${over ? `<rect class="g-over" x="${x}" y="${y(b.work)}" width="${Math.max(1, bw - 2)}" height="${y(ok) - y(b.work)}"/>` : ''}
          ${showValues && b.work ? `<text class="g-value ${over ? 'over' : ''}" x="${x + (bw - 2) / 2}" y="${y(b.work) - 4}">${escapeHtml(plainNumber(b.work / 60, language))}</text>` : ''}</g>`;
      }).join('');
      // Availability: one stepped line across the buckets.
      const cap = buckets.map((b, i) => `${i ? 'L' : 'M'}${M.left + i * bw} ${y(b.capacity)} L${M.left + (i + 1) * bw} ${y(b.capacity)}`).join(' ');
      const svgH = M.top + H + M.bottom;
      const svg = `<svg class="graph-svg" width="${width}" height="${svgH}" viewBox="0 0 ${width} ${svgH}" role="img" aria-label="${escapeHtml(t('graph.axisWork'))}">
          ${grid}${xticks}${bars}<path class="g-cap" d="${cap}"/>
          <line class="g-axis" x1="${M.left}" x2="${M.left}" y1="${M.top}" y2="${M.top + H}"/>
          <line class="g-axis" x1="${M.left}" x2="${M.left + plotW}" y1="${M.top + H}" y2="${M.top + H}"/>
          <text class="g-title" transform="translate(14 ${M.top + H / 2}) rotate(-90)">${escapeHtml(t('graph.axisWork'))}</text>
          <text class="g-title" x="${M.left + plotW / 2}" y="${svgH - 6}">${escapeHtml(t(weekly ? 'graph.axisWeek' : 'graph.axisDay'))}</text>
        </svg>`;
      const info = sched.resources.get(resource.id);
      chart = `<div class="graph-title">${icon('viewResourceGraph')}<b>${escapeHtml(resource.name)}</b>
          <span class="muted">${escapeHtml(t('graph.summary', { max: Math.round((resource.maxUnits ?? 1) * 100), peak: Math.round((info?.peak ?? 0) * 100), work: Math.round((info?.work ?? 0) / 60) }))}</span>
          ${info?.overallocated ? `<span class="badge danger">${escapeHtml(t('graph.over'))}</span>` : ''}</div>
        ${svg}
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
