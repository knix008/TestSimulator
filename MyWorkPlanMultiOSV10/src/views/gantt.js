// Gantt Chart and Tracking Gantt: the task sheet on the left, the chart on the
// right (shared vertical scroll), a splitter between them.
//
// Chart: two-tier timescale, non-working time shaded, task bars with progress,
// summary brackets, milestones, manual and inactive tasks, critical tasks in
// red, baselines (Tracking Gantt or when enabled), slack lines, deadlines,
// dependency arrows (FS / SS / FF / SF), today and status-date lines.
// Mouse: drag a bar to move it (sets a "start no earlier than" date), drag its
// right end to change the duration, drag the progress handle for % complete,
// drag up/down onto another bar to link the two, double-click for task
// information; drag the background (or Ctrl+drag anywhere) to pan;
// Ctrl+wheel zooms the timescale.
import { Grid } from '../ui/grid.js';
import { escapeHtml, frameThrottle, pointerDrag } from '../ui/dom.js';
import { icon } from '../icons.js';
import { t, getLanguage } from '../i18n.js';
import { Timescale } from './timescale.js';
import { formatDay, nowMin } from '../domain/time.js';
import { spanOf } from '../domain/filters.js';

export class GanttView {
  constructor(app, host, { tracking = false } = {}) {
    this.app = app;
    this.host = host;
    this.tracking = tracking;
    host.classList.add('gantt-view');
    host.innerHTML = `
      <div class="gantt-table"></div>
      <div class="splitter vertical" data-gantt-split title="${escapeHtml(t('tip.splitter'))}" role="separator" aria-orientation="vertical"></div>
      <div class="gantt-chart">
        <div class="chart-head"><div class="tier top"></div><div class="tier bottom"></div></div>
        <div class="chart-body" tabindex="-1">
          <div class="chart-canvas">
            <div class="chart-rows"></div>
            <div class="chart-bg"></div>
            <svg class="chart-links" xmlns="http://www.w3.org/2000/svg"></svg>
            <div class="chart-bars"></div>
            <div class="chart-lines"></div>
          </div>
        </div>
        <div class="drag-tip" hidden></div>
      </div>`;
    this.tableHost = host.querySelector('.gantt-table');
    this.chart = host.querySelector('.gantt-chart');
    this.chartBody = host.querySelector('.chart-body');
    this.canvas = host.querySelector('.chart-canvas');
    this.rowBands = host.querySelector('.chart-rows');
    this.bg = host.querySelector('.chart-bg');
    this.links = host.querySelector('.chart-links');
    this.bars = host.querySelector('.chart-bars');
    this.lines = host.querySelector('.chart-lines');
    this.tip = host.querySelector('.drag-tip');
    this.headTop = host.querySelector('.tier.top');
    this.headBottom = host.querySelector('.tier.bottom');
    this.grid = new Grid(this.tableHost, app.taskGridOptions({ onScroll: (top) => this.syncFromGrid(top) }));
    this.drawWindow = frameThrottle(() => this.drawChart());
    this.drawHeadThrottled = frameThrottle(() => this.drawHeadAndBg());
    this.syncing = false;
    this.chartBody.addEventListener('scroll', () => {
      if (!this.syncing && this.grid.body.scrollTop !== this.chartBody.scrollTop) {
        this.syncing = true;
        this.grid.body.scrollTop = this.chartBody.scrollTop;
        requestAnimationFrame(() => { this.syncing = false; });
      }
      this.app.doc().view.scrollLeft = this.chartBody.scrollLeft;
      this.drawWindow();
      this.drawHeadThrottled();
    }, { passive: true });
    this.bind();
  }

  syncFromGrid(top) {
    if (this.syncing) return;
    this.syncing = true;
    this.chartBody.scrollTop = top;
    requestAnimationFrame(() => { this.syncing = false; });
    this.app.doc().view.scrollTop = top;
  }

  get rowHeight() {
    return this.app.rowHeight();
  }

  setTableWidth(width) {
    this.tableHost.style.width = `${width}px`;
  }

  render() {
    this.setTableWidth(this.app.settings().tableWidth);
    this.host.classList.toggle('tracking', this.tracking);
    this.grid.render();
    this.layout();
    const doc = this.app.doc();
    this.chartBody.scrollTop = doc.view.scrollTop ?? 0;
    this.grid.body.scrollTop = this.chartBody.scrollTop;
    if (doc.view.scrollLeft == null || doc.view.timescale !== this.scale.px) {
      // First view of a plan (or new zoom): the project start near the left edge.
      const anchor = doc.view.anchorMin ?? this.app.sched().start;
      this.chartBody.scrollLeft = Math.max(0, this.scale.x(anchor) - (doc.view.anchorX ?? 40));
      doc.view.anchorMin = null;
      doc.view.anchorX = null;
    } else this.chartBody.scrollLeft = doc.view.scrollLeft;
    doc.view.timescale = this.scale.px;
    this.drawChart();
    this.drawHeadAndBg();
  }

  update() {
    this.grid.update();
    this.layout();
    this.drawChart();
    this.drawHeadAndBg();
  }

  selectionChanged() {
    this.grid.drawRows();
    this.drawChart();
  }

  layout() {
    const sched = this.app.sched();
    const rows = this.grid.list;
    const span = spanOf(rows, sched);
    const settings = this.app.settings();
    this.scale = new Timescale({ fromDay: span.fromDay, toDay: span.toDay, pxPerDay: settings.timescale, weekStart: this.app.project().options.weekStart ?? 1, language: getLanguage() });
    const h = this.rowHeight;
    this.canvas.style.width = `${this.scale.width}px`;
    this.canvas.style.height = `${(rows.length + 1) * h + 4}px`;
    this.links.setAttribute('width', this.scale.width);
    this.links.setAttribute('height', (rows.length + 1) * h + 4);
  }

  /** Timescale header and the shading of non-working days for the visible part. */
  drawHeadAndBg() {
    if (!this.scale) return;
    const left = this.chartBody.scrollLeft;
    const width = this.chartBody.clientWidth || 800;
    const x0 = left - 200;
    const x1 = left + width + 200;
    const tier = (unit, element) => {
      element.innerHTML = this.scale.cells(unit, x0, x1).map((cell) => `<div class="tier-cell ${cell.weekend ? 'weekend' : ''}" style="left:${cell.x - left}px;width:${cell.width}px" title="${escapeHtml(cell.title)}"><span>${escapeHtml(cell.label)}</span></div>`).join('');
    };
    tier(this.scale.topUnit, this.headTop);
    tier(this.scale.bottomUnit, this.headBottom);
    const settings = this.app.settings();
    const sched = this.app.sched();
    const shade = settings.shadeNonWorking ? this.scale.nonWorking(sched.projectCal, x0, x1) : [];
    const gridLines = this.scale.cells(this.scale.bottomUnit, x0, x1);
    this.bg.innerHTML = shade.map((cell) => `<i class="nonworking" style="left:${cell.x}px;width:${cell.width}px"></i>`).join('')
      + gridLines.map((cell) => `<i class="gridline" style="left:${cell.x}px"></i>`).join('');
  }

  rowIndexOf(id) {
    return this.grid.list.findIndex((row) => row.id === id);
  }

  /** Bars of the visible rows and the links touching them. */
  drawChart() {
    if (!this.scale) return;
    const app = this.app;
    const settings = app.settings();
    const project = app.project();
    const sched = app.sched();
    const h = this.rowHeight;
    const rows = this.grid.list;
    const first = Math.max(0, Math.floor(this.chartBody.scrollTop / h) - 6);
    const last = Math.min(rows.length, first + Math.ceil((this.chartBody.clientHeight || 600) / h) + 12);
    const html = [];
    // Row bands behind the bars, striped and highlighted like the rows of the table beside the chart.
    const bands = [];
    const showBaseline = this.tracking || settings.showBaseline;
    const critical = settings.showCritical || this.tracking;
    const language = getLanguage();
    for (let index = first; index < last; index++) {
      const row = rows[index];
      if (row) {
        const band = ['chart-row', index % 2 ? 'odd' : '', row.group ? 'group-row' : '', row.task && app.isSelected(row.task.id) ? 'selected' : '', row.match ? 'match' : '', row.info?.critical && settings.showCritical ? 'critical-row' : ''].join(' ');
        bands.push(`<div class="${band}" style="top:${index * h}px;height:${h}px"></div>`);
      }
      if (!row || row.group) {
        if (row?.group && row.group.start != null && Number.isFinite(row.group.start)) {
          const x = this.scale.x(row.group.start);
          const w = Math.max(2, this.scale.x(row.group.finish) - x);
          html.push(`<div class="bar-group" style="left:${x}px;top:${index * h + h * 0.3}px;width:${w}px;height:${h * 0.4}px"></div>`);
        }
        continue;
      }
      const { task, info } = row;
      if (!info || info.start == null || task.hideBar) continue;
      const selected = app.isSelected(task.id);
      const y = index * h;
      const x = this.scale.x(info.start);
      const w = Math.max(info.milestone ? 0 : 3, this.scale.x(info.finish) - x);
      const color = task.barColor ? `--bar-color:${task.barColor};` : '';
      const isCritical = critical && info.critical && !info.summary;
      const classes = ['bar', info.summary ? 'summary' : info.milestone ? 'milestone' : 'task', isCritical ? 'critical' : '', task.manual ? 'manual' : '', info.active ? '' : 'inactive', selected ? 'selected' : '', this.tracking ? 'tracking' : '', row.match ? 'match' : '', info.late ? 'late' : ''].join(' ');
      const top = showBaseline && info.baseline ? y + h * 0.16 : y + h * 0.24;
      const height = showBaseline && info.baseline ? h * 0.4 : h * 0.52;
      if (showBaseline && info.baseline && info.baseline.start != null) {
        const bx = this.scale.x(info.baseline.start);
        const bw = Math.max(task.milestone ? 0 : 2, this.scale.x(info.baseline.finish) - bx);
        html.push(task.milestone || info.baseline.duration === 0
          ? `<div class="baseline milestone" style="left:${bx - h * 0.16}px;top:${y + h * 0.6}px;width:${h * 0.32}px;height:${h * 0.32}px" title="${escapeHtml(t('chart.baseline'))}"></div>`
          : `<div class="baseline" style="left:${bx}px;top:${y + h * 0.62}px;width:${bw}px;height:${h * 0.2}px" title="${escapeHtml(t('chart.baseline'))}: ${escapeHtml(formatDay(info.baseline.start, settings.dateFormat))} – ${escapeHtml(formatDay(info.baseline.finish, settings.dateFormat))}"></div>`);
      }
      if (settings.showSlack && !info.summary && info.freeSlack > 0) {
        const end = sched.calendarFor(task).add(info.finish, info.freeSlack);
        html.push(`<div class="slack" style="left:${x + w}px;top:${y + h * 0.48}px;width:${Math.max(0, this.scale.x(end) - x - w)}px" title="${escapeHtml(t('field.freeSlack'))}"></div>`);
      }
      const tipText = `${info.wbs} ${task.name}\n${formatDay(info.start, settings.dateFormat, true)} → ${formatDay(info.finish, settings.dateFormat, true)}\n${app.durationText(info, task)} · ${info.percentComplete ?? 0}%${info.critical ? ` · ${t('chart.critical')}` : ''}`;
      if (info.milestone) {
        const size = h * 0.56;
        html.push(`<div class="${classes}" data-task="${escapeHtml(task.id)}" data-index="${index}" style="${color}left:${x - size / 2}px;top:${y + (h - size) / 2}px;width:${size}px;height:${size}px" title="${escapeHtml(tipText)}"></div>`);
      } else if (info.summary) {
        html.push(`<div class="${classes}" data-task="${escapeHtml(task.id)}" data-index="${index}" style="left:${x}px;top:${y + h * 0.3}px;width:${w}px;height:${h * 0.3}px" title="${escapeHtml(tipText)}"><i class="progress" style="width:${info.percentComplete ?? 0}%"></i></div>`);
      } else {
        const pct = Math.max(0, Math.min(100, info.percentComplete ?? 0));
        html.push(`<div class="${classes}" data-task="${escapeHtml(task.id)}" data-index="${index}" style="${color}left:${x}px;top:${top}px;width:${w}px;height:${height}px" title="${escapeHtml(tipText)}">
          <i class="progress" style="width:${pct}%"></i>
          ${task.manual ? '' : `<i class="progress-handle" data-handle="progress" style="left:calc(${pct}% - 4px)" title="${escapeHtml(t('chart.dragProgress'))}"></i>`}
          <i class="resize-handle" data-handle="resize" title="${escapeHtml(t('chart.dragDuration'))}"></i>
        </div>`);
      }
      if (task.deadline) {
        const dx = this.scale.x(app.toMin(task.deadline));
        html.push(`<div class="deadline ${info.missedDeadline ? 'missed' : ''}" style="left:${dx - 5}px;top:${y + 2}px" title="${escapeHtml(t('field.deadline'))}: ${escapeHtml(formatDay(app.toMin(task.deadline), settings.dateFormat))}">${icon('chevronDown', 'icon')}</div>`);
      }
      const label = settings.barText === 'none' ? '' : settings.barText === 'percent' ? `${info.percentComplete ?? 0}%` : settings.barText === 'resources' ? (info.resourceNames ?? []).join(', ') : task.name;
      const labelText = settings.barText === 'name' && info.resourceNames?.length && !info.summary ? `${label} · ${info.resourceNames.join(', ')}` : label;
      if (labelText) html.push(`<div class="bar-label" style="left:${(info.milestone ? x + h * 0.4 : x + w) + 6}px;top:${y}px;height:${h}px">${escapeHtml(info.milestone ? `${labelText}  ${formatDay(info.start, settings.dateFormat)}` : labelText)}</div>`);
    }
    this.rowBands.innerHTML = bands.join('');
    this.bars.innerHTML = html.join('');
    this.drawLinks(first, last);
    this.drawLines();
  }

  /** Dependency arrows whose ends are in or near the visible rows. */
  drawLinks(first, last) {
    const settings = this.app.settings();
    if (!settings.showLinks) { this.links.innerHTML = ''; return; }
    const rows = this.grid.list;
    const h = this.rowHeight;
    const index = new Map(rows.map((row, i) => [row.id, i]));
    const sched = this.app.sched();
    const paths = [];
    const critical = settings.showCritical || this.tracking;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row?.task) continue;
      for (const link of row.task.predecessors ?? []) {
        const j = index.get(link.taskId);
        if (j == null) continue;
        if ((i < first && j < first) || (i > last && j > last)) continue;
        const pred = sched.info(link.taskId);
        const succ = row.info;
        if (!pred || !succ || pred.start == null || succ.start == null) continue;
        const py = j * h + h / 2;
        const sy = i * h + h / 2;
        const fromStart = link.type === 'SS' || link.type === 'SF';
        const toFinish = link.type === 'FF' || link.type === 'SF';
        const px = this.scale.x(fromStart ? pred.start : pred.finish) + (pred.milestone ? (fromStart ? -h * 0.28 : h * 0.28) : 0);
        const sx = this.scale.x(toFinish ? succ.finish : succ.start) + (succ.milestone ? (toFinish ? h * 0.28 : -h * 0.28) : 0);
        const down = sy > py ? 1 : -1;
        let d;
        if (!toFinish) {
          // Room to the right: across, then down onto the top (or up onto the bottom) of the next bar.
          // Otherwise around: out, down between the rows, back left, into the bar's start.
          d = !fromStart && sx - px >= 10
            ? `M${px} ${py} H${sx + 4} V${sy - down * h * 0.27}`
            : `M${px} ${py} h${fromStart ? -8 : 8} V${sy - down * h * 0.5} H${sx - 10} V${sy} H${sx - 2}`;
        } else {
          const outX = Math.max(px, sx) + 10;
          d = `M${px} ${py} ${fromStart ? `h-8 V${sy} ` : `H${outX} V${sy} `}H${sx + 2}`;
        }
        const isCritical = critical && pred.critical && succ.critical && !pred.summary && !succ.summary;
        const selected = this.app.isLinkSelected(link.taskId, row.task.id);
        const vertical = !toFinish && !fromStart && sx - px >= 10;
        paths.push(`<path class="link ${isCritical ? 'critical' : ''} ${selected ? 'selected' : ''} ${row.task.active === false ? 'inactive' : ''}" d="${d}" marker-end="url(#${vertical ? 'arrow-down' : 'arrow'}${isCritical ? '-critical' : ''})"/>
          <path class="link-hit" data-link-from="${escapeHtml(link.taskId)}" data-link-to="${escapeHtml(row.task.id)}" d="${d}"><title>${escapeHtml(`${pred.row} → ${succ.row} ${link.type}${link.lag ? ` ${this.app.lagText(link)}` : ''}`)}</title></path>`);
      }
    }
    const marker = (id, cls, orient) => `<marker id="${id}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="${orient}"><path class="${cls}" d="M0 0L8 4L0 8z"/></marker>`;
    this.links.innerHTML = `<defs>${marker('arrow', 'arrowhead', 'auto')}${marker('arrow-critical', 'arrowhead critical', 'auto')}${marker('arrow-down', 'arrowhead', 'auto')}${marker('arrow-down-critical', 'arrowhead critical', 'auto')}</defs>${paths.join('')}`;
  }

  drawLines() {
    const settings = this.app.settings();
    const sched = this.app.sched();
    const project = this.app.project();
    const out = [];
    const height = this.canvas.offsetHeight;
    if (settings.showToday) {
      const x = this.scale.x(nowMin());
      out.push(`<i class="line today" style="left:${x}px;height:${height}px" title="${escapeHtml(t('chart.today'))}"></i>`);
    }
    if (project.statusDate) {
      const x = this.scale.x(this.app.toMin(project.statusDate));
      out.push(`<i class="line status" style="left:${x}px;height:${height}px" title="${escapeHtml(t('field.statusDate'))}"></i>`);
    }
    out.push(`<i class="line project-start" style="left:${this.scale.x(sched.start)}px;height:${height}px" title="${escapeHtml(t('chart.projectStart'))}"></i>`);
    out.push(`<i class="line project-finish" style="left:${this.scale.x(sched.finish)}px;height:${height}px" title="${escapeHtml(t('chart.projectFinish'))}"></i>`);
    if (settings.showProgressLine || this.tracking) out.push(this.progressLine());
    this.lines.innerHTML = out.join('');
  }

  /** Progress line: from the status date to how far each task got. */
  progressLine() {
    const sched = this.app.sched();
    const h = this.rowHeight;
    const status = sched.statusDate ?? nowMin();
    const sx = this.scale.x(status);
    const points = [];
    this.grid.list.forEach((row, index) => {
      if (!row?.info || row.info.summary || row.info.start == null || row.info.milestone) return;
      const info = row.info;
      const y = index * h + h / 2;
      if (info.start > status || info.percentComplete >= 100 && info.finish <= status) { points.push([sx, y]); return; }
      const done = info.start + ((info.finish - info.start) * (info.percentComplete ?? 0)) / 100;
      points.push([this.scale.x(done), y]);
    });
    if (!points.length) return '';
    const d = `M${sx} 0 ${points.map(([x, y]) => `L${x} ${y}`).join(' ')} L${sx} ${points[points.length - 1][1] + h}`;
    return `<svg class="progress-line" width="${this.scale.width}" height="${this.canvas.offsetHeight}"><path d="${d}"/></svg>`;
  }

  scrollToTask(id) {
    const index = this.rowIndexOf(id);
    if (index < 0) return;
    this.grid.scrollToIndex(index);
    const info = this.app.sched().info(id);
    if (info?.start != null) this.chartBody.scrollLeft = Math.max(0, this.scale.x(info.start) - 60);
    this.drawWindow();
    this.drawHeadThrottled();
  }

  scrollToDate(minutes) {
    this.chartBody.scrollLeft = Math.max(0, this.scale.x(minutes) - 40);
  }

  /** Keeps the moment under the pointer in place while the zoom changes. */
  zoomAround(clientX, nextPx) {
    const rect = this.chartBody.getBoundingClientRect();
    const offset = clientX != null ? clientX - rect.left : this.chartBody.clientWidth / 2;
    const doc = this.app.doc();
    doc.view.anchorMin = this.scale.minutesAt(this.chartBody.scrollLeft + offset);
    doc.view.anchorX = offset;
    doc.view.scrollLeft = null;
    this.app.setTimescale(nextPx);
  }

  visibleMiddle() {
    return this.scale ? this.scale.minutesAt(this.chartBody.scrollLeft + this.chartBody.clientWidth / 2) : null;
  }

  // ───────────────────────── mouse

  bind() {
    const app = this.app;
    this.host.querySelector('[data-gantt-split]').addEventListener('pointerdown', (event) => {
      event.preventDefault();
      const start = this.tableHost.offsetWidth;
      pointerDrag(event, {
        cursor: 'col-resize',
        move: (dx) => this.setTableWidth(Math.max(160, Math.min(this.host.clientWidth - 160, start + dx))),
        end: (e, moved) => { if (moved) app.setTableWidth(this.tableHost.offsetWidth); },
      });
    });

    this.chartBody.addEventListener('wheel', (event) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        app.stepTimescale(event.deltaY < 0 ? 1 : -1, event.clientX, this);
      } else if (event.shiftKey) {
        event.preventDefault();
        this.chartBody.scrollLeft += event.deltaY || event.deltaX;
      }
    }, { passive: false });

    this.bars.addEventListener('dblclick', (event) => {
      const bar = event.target.closest('[data-task]');
      if (bar) app.openTaskInfo(bar.dataset.task);
    });

    this.links.addEventListener('pointerdown', (event) => {
      const hit = event.target.closest('[data-link-from]');
      if (!hit || event.button !== 0) return;
      event.stopPropagation();
      app.selectLink(hit.dataset.linkFrom, hit.dataset.linkTo);
    });
    this.links.addEventListener('dblclick', (event) => {
      const hit = event.target.closest('[data-link-from]');
      if (hit) app.openLinkInfo(hit.dataset.linkFrom, hit.dataset.linkTo);
    });
    this.links.addEventListener('contextmenu', (event) => {
      const hit = event.target.closest('[data-link-from]');
      if (!hit) return;
      event.preventDefault();
      event.stopPropagation();
      app.selectLink(hit.dataset.linkFrom, hit.dataset.linkTo);
      app.contextMenu(event, 'link', { from: hit.dataset.linkFrom, to: hit.dataset.linkTo });
    });

    this.chartBody.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const bar = event.target.closest('[data-task]');
      if (bar) {
        if (!app.isSelected(bar.dataset.task)) app.selectTask(bar.dataset.task, {});
        app.contextMenu(event, 'bar', { id: bar.dataset.task });
      } else {
        app.contextMenu(event, 'chart', { minutes: this.scale.minutesAt(event.clientX - this.chartBody.getBoundingClientRect().left + this.chartBody.scrollLeft) });
      }
    });

    this.chartBody.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 && event.button !== 1) return;
      const bar = event.target.closest('[data-task]');
      if (bar && !event.ctrlKey && !event.metaKey && event.button === 0) return this.barPointer(event, bar);
      if (event.target.closest('.link-hit')) return undefined;
      // Pan: drag the background, Ctrl+drag anywhere, or the middle button.
      event.preventDefault();
      const left = this.chartBody.scrollLeft;
      const top = this.chartBody.scrollTop;
      this.chartBody.classList.add('panning');
      pointerDrag(event, {
        threshold: 2,
        move: (dx, dy) => {
          this.chartBody.scrollLeft = left - dx;
          this.chartBody.scrollTop = top - dy;
        },
        end: (e, moved) => {
          this.chartBody.classList.remove('panning');
          if (!moved && !bar) app.clearSelection();
        },
      });
      return undefined;
    });
  }

  showTip(text, event) {
    this.tip.hidden = false;
    this.tip.textContent = text;
    const rect = this.chart.getBoundingClientRect();
    this.tip.style.left = `${Math.min(rect.width - 220, event.clientX - rect.left + 14)}px`;
    this.tip.style.top = `${event.clientY - rect.top + 18}px`;
  }

  hideTip() {
    this.tip.hidden = true;
  }

  /** Drag on a bar: move, resize, progress or link. */
  barPointer(event, bar) {
    const app = this.app;
    const id = bar.dataset.task;
    const sched = app.sched();
    const info = sched.info(id);
    const task = app.project().tasks.find((item) => item.id === id);
    if (!info || !task) return;
    app.selectTask(id, event);
    const handle = event.target.closest('[data-handle]')?.dataset.handle;
    const mode0 = handle === 'resize' && !info.summary && !info.milestone ? 'resize' : handle === 'progress' && !info.summary ? 'progress' : 'move';
    event.preventDefault();
    const settings = app.settings();
    const startLeft = parseFloat(bar.style.left);
    const startWidth = parseFloat(bar.style.width);
    const h = this.rowHeight;
    let mode = mode0;
    let line = null;
    let targetId = null;
    const minutesPer = 1440 / this.scale.px;
    const snap = (minutes) => {
      // Snap to whole days (or hours when zoomed in far).
      const step = this.scale.px >= 120 ? 60 : 1440;
      return Math.round(minutes / step) * step;
    };
    pointerDrag(event, {
      threshold: 4,
      move: (dx, dy, e) => {
        if (mode === 'move' && Math.abs(dy) > h * 0.8 && Math.abs(dy) > Math.abs(dx)) {
          mode = 'link';
          bar.style.left = `${startLeft}px`;
        }
        if (mode === 'move') {
          if (info.summary) return;
          bar.style.left = `${startLeft + dx}px`;
          const start = info.start + snap(dx * minutesPer);
          this.showTip(`${t('chart.moveTo')} ${formatDay(start, settings.dateFormat, settings.showTime)}`, e);
        } else if (mode === 'resize') {
          bar.style.width = `${Math.max(3, startWidth + dx)}px`;
          const finish = info.finish + snap(dx * minutesPer);
          this.showTip(`${t('field.finish')}: ${formatDay(finish, settings.dateFormat, settings.showTime)}`, e);
        } else if (mode === 'progress') {
          const pct = Math.max(0, Math.min(100, Math.round(((e.clientX - bar.getBoundingClientRect().left) / Math.max(1, bar.offsetWidth)) * 100)));
          bar.querySelector('.progress').style.width = `${pct}%`;
          this.showTip(`${t('field.percentComplete')}: ${pct}%`, e);
        } else if (mode === 'link') {
          const rect = this.canvas.getBoundingClientRect();
          const x1 = startLeft + startWidth;
          const y1 = Number(bar.dataset.index) * h + h / 2;
          const x2 = e.clientX - rect.left;
          const y2 = e.clientY - rect.top;
          if (!line) {
            line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            line.setAttribute('class', 'link-draft');
            this.links.append(line);
          }
          line.setAttribute('d', `M${x1} ${y1} L${x2} ${y2}`);
          const over = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-task]');
          targetId = over && over.dataset.task !== id ? over.dataset.task : null;
          for (const el of this.bars.querySelectorAll('.link-target')) el.classList.remove('link-target');
          over?.classList.toggle('link-target', Boolean(targetId));
          const target = targetId ? sched.info(targetId) : null;
          this.showTip(target ? t('chart.linkTo', { from: info.row, to: target.row }) : t('chart.linkDrag'), e);
        }
      },
      end: (e, moved) => {
        this.hideTip();
        line?.remove();
        if (!moved) return;
        const dx = e.clientX - event.clientX;
        if (mode === 'move' && !info.summary) app.moveTaskBar(id, info.start + snap(dx * minutesPer));
        else if (mode === 'resize') app.resizeTaskBar(id, info.finish + snap(dx * minutesPer));
        else if (mode === 'progress') {
          const pct = Math.max(0, Math.min(100, Math.round(((e.clientX - bar.getBoundingClientRect().left) / Math.max(1, bar.offsetWidth)) * 100)));
          app.setProgress([id], pct);
        } else if (mode === 'link') {
          if (targetId) app.linkFromTo(id, targetId);
          else this.drawChart();
        }
      },
    });
  }

  destroy() {
    this.host.innerHTML = '';
    this.host.className = 'view-host';
  }
}

