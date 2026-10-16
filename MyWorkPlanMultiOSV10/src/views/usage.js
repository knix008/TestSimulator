// Task Usage and Resource Usage: a sheet of tasks (or resources) with their
// assignments under them, and next to it the work of each row per day, week
// or month (following the timescale zoom). Overallocated periods are red.
import { Grid } from '../ui/grid.js';
import { escapeHtml, frameThrottle, pointerDrag } from '../ui/dom.js';
import { t, getLanguage } from '../i18n.js';
import { assignmentLoad, resourceLoad } from '../domain/schedule.js';
import { TASK_FIELD_MAP, RESOURCE_FIELD_MAP } from '../domain/fields.js';
import { addMonths, dayOf, dayStart, fromParts, parts, weekStartDay } from '../domain/time.js';
import { formatDuration } from '../domain/duration.js';

const CELL = 58;

export class UsageView {
  constructor(app, host, kind) {
    this.app = app;
    this.host = host;
    this.kind = kind; // 'task' | 'resource'
    this.expanded = new Set();
    this.collapsed = new Set();
    host.classList.add('usage-view');
    host.innerHTML = `
      <div class="usage-table"></div>
      <div class="splitter vertical" data-usage-split title="${escapeHtml(t('tip.splitter'))}" role="separator"></div>
      <div class="usage-time">
        <div class="usage-head"><div class="usage-head-inner"></div></div>
        <div class="usage-body" tabindex="-1"><div class="usage-canvas"></div></div>
      </div>`;
    this.tableHost = host.querySelector('.usage-table');
    this.head = host.querySelector('.usage-head-inner');
    this.body = host.querySelector('.usage-body');
    this.canvas = host.querySelector('.usage-canvas');
    const fieldIds = kind === 'task' ? ['name', 'work', 'duration', 'start', 'finish'] : ['name', 'work', 'maxUnits', 'peak'];
    const map = kind === 'task' ? TASK_FIELD_MAP : RESOURCE_FIELD_MAP;
    const fields = fieldIds.map((id) => map.get(id));
    this.grid = new Grid(this.tableHost, {
      kind,
      rows: () => this.rows(),
      fields: () => fields,
      ctx: () => app.fieldCtx(),
      rowHeight: () => app.rowHeight(),
      widths: app.columnWidths(`usage-${kind}`),
      onWidth: () => app.saveColumnWidths(),
      selected: (row) => (row.assignment ? false : kind === 'task' ? app.isSelected(row.id) : app.isResourceSelected(row.id)),
      onSelect: (row, event) => {
        if (!row || row.assignment) return;
        if (kind === 'task') app.selectTask(row.id, event); else app.selectResource(row.id, event);
      },
      onEdit: (row, field, value) => (kind === 'task' ? app.editTaskField(row, field, value) : app.editResourceField(row, field, value)),
      onActivate: (row) => (row.assignment ? null : kind === 'task' ? app.openTaskInfo(row.id) : app.openResourceInfo(row.id)),
      onContext: (event, row) => app.contextMenu(event, kind === 'task' ? 'taskRow' : 'resourceRow', { id: row?.id ?? null }),
      onToggle: (row) => { if (this.collapsed.has(row.id)) this.collapsed.delete(row.id); else this.collapsed.add(row.id); this.update(); },
      nameCell: (row, text) => {
        if (row.assignment) return `<span class="assignment-name" style="padding-left:${(row.level ?? 1) * 16 + 10}px">${escapeHtml(row.label)}</span>`;
        const hasChildren = row.hasAssignments;
        const toggle = hasChildren ? `<button class="outline-toggle" data-toggle title="${escapeHtml(t(this.collapsed.has(row.id) ? 'grid.expand' : 'grid.collapse'))}">${this.collapsed.has(row.id) ? '▸' : '▾'}</button>` : '<span class="outline-space"></span>';
        const pad = kind === 'task' ? ((row.item.outlineLevel ?? 1) - 1) * 16 : 0;
        return `<span class="outline" style="padding-left:${pad}px">${toggle}<span class="${row.info?.summary ? 'summary-name' : ''} ${row.over ? 'over-name' : ''}">${escapeHtml(text)}</span></span>`;
      },
      rowClass: (row) => [row.assignment ? 'assignment-row' : '', row.info?.summary ? 'summary-row' : '', row.over ? 'overallocated-row' : ''].join(' '),
      indicators: () => '',
      newRow: false,
      onScroll: (top) => { if (!this.syncing) { this.syncing = true; this.body.scrollTop = top; requestAnimationFrame(() => { this.syncing = false; }); } },
    });
    this.draw = frameThrottle(() => this.drawCells());
    this.body.addEventListener('scroll', () => {
      if (!this.syncing) { this.syncing = true; this.grid.body.scrollTop = this.body.scrollTop; requestAnimationFrame(() => { this.syncing = false; }); }
      this.head.style.transform = `translateX(${-this.body.scrollLeft}px)`;
      this.draw();
    }, { passive: true });
    this.body.addEventListener('wheel', (event) => {
      if (event.ctrlKey || event.metaKey) { event.preventDefault(); app.stepTimescale(event.deltaY < 0 ? 1 : -1); }
    }, { passive: false });
    host.querySelector('[data-usage-split]').addEventListener('pointerdown', (event) => {
      const start = this.tableHost.offsetWidth;
      pointerDrag(event, { cursor: 'col-resize', move: (dx) => { this.tableHost.style.width = `${Math.max(200, start + dx)}px`; }, end: (e, moved) => { if (moved) app.setTableWidth(this.tableHost.offsetWidth); } });
    });
  }

  rows() {
    const app = this.app;
    const project = app.project();
    const sched = app.sched();
    const out = [];
    if (this.kind === 'task') {
      for (const item of app.taskRows()) {
        if (item.group) { out.push(item); continue; }
        const assignments = project.assignments.filter((a) => a.taskId === item.task.id);
        out.push({ ...item, hasAssignments: assignments.length > 0 });
        if (this.collapsed.has(item.id)) continue;
        for (const a of assignments) {
          const resource = project.resources.find((r) => r.id === a.resourceId);
          const result = sched.assignments.get(a.id);
          out.push({ id: `${item.id}:${a.id}`, assignment: a, label: resource?.name ?? '?', level: item.task.outlineLevel, number: '', cells: { name: resource?.name ?? '', work: formatDuration(result?.work ?? 0, 'h', project.options, getLanguage()) } });
        }
      }
    } else {
      project.resources.forEach((resource, index) => {
        const info = sched.resources.get(resource.id);
        const assignments = project.assignments.filter((a) => a.resourceId === resource.id);
        out.push({ id: resource.id, item: resource, info: null, number: index + 1, hasAssignments: assignments.length > 0, over: info?.overallocated });
        if (this.collapsed.has(resource.id)) return;
        for (const a of assignments) {
          const task = project.tasks.find((x) => x.id === a.taskId);
          const result = sched.assignments.get(a.id);
          out.push({ id: `${resource.id}:${a.id}`, assignment: a, label: task?.name ?? '?', level: 1, number: '', cells: { name: task?.name ?? '', work: formatDuration(result?.work ?? 0, 'h', project.options, getLanguage()) } });
        }
      });
    }
    return out;
  }

  /** Periods (columns): days, weeks or months by the timescale zoom. */
  periods() {
    const sched = this.app.sched();
    const px = this.app.settings().timescale;
    const unit = px >= 16 ? 'day' : px >= 3 ? 'week' : 'month';
    const weekStart = this.app.project().options.weekStart ?? 1;
    const from = weekStartDay(dayOf(sched.start) - 7, weekStart);
    const to = dayOf(sched.finish) + 21;
    const out = [];
    const L = getLanguage();
    if (unit === 'day') for (let d = from; d <= to; d++) { const p = parts(dayStart(d)); out.push({ from: d, to: d, label: `${p.month + 1}/${p.day}`, top: L === 'ko' ? `${p.year}.${p.month + 1}` : `${p.month + 1}/${p.year}`, weekend: [0, 6].includes(p.weekday) }); }
    else if (unit === 'week') for (let d = from; d <= to; d += 7) { const p = parts(dayStart(d)); out.push({ from: d, to: d + 6, label: `${p.month + 1}/${p.day}`, top: String(p.year) }); }
    else {
      const p = parts(dayStart(from));
      for (let m = fromParts(p.year, p.month, 1); dayOf(m) <= to; m = addMonths(m, 1)) {
        const q = parts(m);
        out.push({ from: dayOf(m), to: dayOf(addMonths(m, 1)) - 1, label: L === 'ko' ? `${q.month + 1}월` : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][q.month], top: String(q.year) });
      }
    }
    return { unit, list: out, fromDay: from, toDay: to };
  }

  render() {
    this.tableHost.style.width = `${Math.min(this.app.settings().tableWidth, 700)}px`;
    this.grid.render();
    this.update(true);
  }

  update(full = false) {
    if (!full) this.grid.update();
    this.cache = new Map();
    this.span = this.periods();
    const h = this.app.rowHeight();
    this.canvas.style.width = `${this.span.list.length * CELL}px`;
    this.canvas.style.height = `${(this.grid.list.length + 1) * h}px`;
    this.head.style.width = `${this.span.list.length * CELL}px`;
    this.head.innerHTML = this.span.list.map((p, i) => `<div class="usage-hcell ${p.weekend ? 'weekend' : ''}" style="left:${i * CELL}px;width:${CELL}px" title="${escapeHtml(`${p.top} ${p.label}`)}"><small>${escapeHtml(i === 0 || this.span.list[i - 1].top !== p.top ? p.top : '')}</small><span>${escapeHtml(p.label)}</span></div>`).join('');
    if (full) {
      const today = this.span.list.findIndex((p) => p.to >= dayOf(this.app.sched().start));
      this.body.scrollLeft = Math.max(0, today * CELL - 40);
    }
    this.drawCells();
  }

  /** Daily minutes of a row, from the schedule. */
  daily(row) {
    if (this.cache.has(row.id)) return this.cache.get(row.id);
    const sched = this.app.sched();
    const project = this.app.project();
    const { fromDay, toDay } = this.span;
    let values;
    if (row.assignment) values = assignmentLoad(sched, row.assignment.id, fromDay, toDay);
    else if (this.kind === 'resource') values = resourceLoad(sched, row.id, fromDay, toDay);
    else {
      const ids = new Set([row.id, ...(row.info?.summary ? this.leaves(row.id) : [])]);
      values = new Array(toDay - fromDay + 1).fill(0);
      for (const a of project.assignments) {
        if (!ids.has(a.taskId)) continue;
        assignmentLoad(sched, a.id, fromDay, toDay).forEach((m, i) => { values[i] += m; });
      }
    }
    this.cache.set(row.id, values);
    return values;
  }

  leaves(id) {
    const s = this.app.sched();
    const out = [];
    const walk = (x) => { const info = s.info(x); if (info?.summary) info.children.forEach(walk); else out.push(x); };
    walk(id);
    return out;
  }

  drawCells() {
    if (!this.span) return;
    const h = this.app.rowHeight();
    const rows = this.grid.list;
    const first = Math.max(0, Math.floor(this.body.scrollTop / h) - 2);
    const last = Math.min(rows.length, first + Math.ceil((this.body.clientHeight || 600) / h) + 4);
    const c0 = Math.max(0, Math.floor(this.body.scrollLeft / CELL) - 2);
    const c1 = Math.min(this.span.list.length, c0 + Math.ceil((this.body.clientWidth || 800) / CELL) + 4);
    const sched = this.app.sched();
    const project = this.app.project();
    const html = [];
    for (let r = first; r < last; r++) {
      const row = rows[r];
      if (!row || row.group) continue;
      const values = this.daily(row);
      const resource = this.kind === 'resource' && !row.assignment ? project.resources.find((x) => x.id === row.id) : null;
      const rcal = resource ? (resource.calendarId ? sched.calendars.get(resource.calendarId) : sched.projectCal) : null;
      for (let c = c0; c < c1; c++) {
        const p = this.span.list[c];
        let minutes = 0;
        let capacity = 0;
        for (let d = p.from; d <= p.to; d++) {
          minutes += values[d - this.span.fromDay] ?? 0;
          if (rcal) capacity += rcal.dayMinutes(d) * (resource.maxUnits ?? 1);
        }
        const over = resource && minutes > capacity + 0.5;
        const text = minutes ? `${Math.round((minutes / 60) * 10) / 10}${getLanguage() === 'ko' ? 'h' : 'h'}` : '';
        html.push(`<div class="usage-cell ${row.assignment ? 'assignment' : ''} ${over ? 'over' : ''} ${p.weekend ? 'weekend' : ''} ${minutes ? 'has-work' : ''}" style="left:${c * CELL}px;top:${r * h}px;width:${CELL}px;height:${h}px">${text}</div>`);
      }
    }
    this.canvas.innerHTML = html.join('');
  }

  selectionChanged() { this.grid.drawRows(); }
  scrollToTask(id) { const i = this.grid.list.findIndex((row) => row.id === id); if (i >= 0) this.grid.scrollToIndex(i); }
  destroy() { this.host.innerHTML = ''; this.host.className = 'view-host'; }
}

