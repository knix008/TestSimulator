// Timeline: the whole project on one line — phases (top-level summary tasks)
// as bars, milestones as diamonds, and the tasks added to the timeline as
// call-outs. Today and the status date are marked.
import { escapeHtml } from '../ui/dom.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { formatDay, nowMin } from '../domain/time.js';

export class TimelineView {
  constructor(app, host) {
    this.app = app;
    this.host = host;
    host.classList.add('timeline-view');
    host.addEventListener('click', (event) => {
      const item = event.target.closest('[data-task]');
      if (item) app.selectTask(item.dataset.task, event);
    });
    host.addEventListener('dblclick', (event) => {
      const item = event.target.closest('[data-task]');
      if (item) app.openTaskInfo(item.dataset.task);
    });
    host.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const item = event.target.closest('[data-task]');
      if (item) { app.selectTask(item.dataset.task, {}); app.contextMenu(event, 'bar', { id: item.dataset.task }); } else app.contextMenu(event, 'chart', {});
    });
    this.resize = new ResizeObserver(() => this.render());
    this.resize.observe(host);
  }

  render() {
    const app = this.app;
    const project = app.project();
    const sched = app.sched();
    const settings = app.settings();
    const width = Math.max(400, this.host.clientWidth - 200);
    const start = sched.start;
    const finish = Math.max(sched.finish, start + 1440);
    const x = (m) => 40 + ((m - start) / (finish - start)) * width;
    const phases = project.tasks.filter((task) => task.outlineLevel === 1 && sched.info(task.id)?.summary);
    const milestones = project.tasks.filter((task) => task.milestone && task.active !== false);
    const marked = project.tasks.filter((task) => task.timeline && !task.milestone);
    const ticks = [];
    const span = finish - start;
    for (let i = 0; i <= 8; i++) ticks.push(start + (span * i) / 8);
    // Items that overlap in time go to the next row of their band.
    const lane = (list, top, cls, rowHeight) => {
      const ends = [];
      return list.map((task, i) => {
        const info = sched.info(task.id);
        const l = x(info.start);
        const w = Math.max(4, x(info.finish) - l);
        let row = ends.findIndex((end) => end <= l + 1);
        if (row < 0) { row = ends.length; ends.push(0); }
        ends[row] = l + w;
        return `<div class="tl-item ${cls} ${info.critical && settings.showCritical ? 'critical' : ''} ${app.isSelected(task.id) ? 'selected' : ''}" data-task="${escapeHtml(task.id)}" style="left:${l}px;width:${w}px;top:${top + Math.min(row, 2) * rowHeight}px;--hue:${(i * 47) % 360}" title="${escapeHtml(`${task.name}\n${formatDay(info.start, settings.dateFormat)} – ${formatDay(info.finish, settings.dateFormat)}`)}">
        <span>${escapeHtml(task.name)}</span><small>${escapeHtml(formatDay(info.start, settings.dateFormat))} – ${escapeHtml(formatDay(info.finish, settings.dateFormat))}</small>
      </div>`;
      }).join('');
    };
    const now = nowMin();
    this.host.innerHTML = `
      <div class="tl-head">${icon('viewTimeline')}<b>${escapeHtml(project.title)}</b><span class="muted">${escapeHtml(formatDay(start, settings.dateFormat))} – ${escapeHtml(formatDay(finish, settings.dateFormat))}</span><span class="grow"></span><span class="muted">${escapeHtml(t('timeline.hint'))}</span></div>
      <div class="tl-stage" style="height:${330 + Math.min(3, marked.length) * 30}px">
        ${lane(phases, 0, 'phase', 42)}
        <div class="tl-axis" style="left:40px;width:${width}px;top:132px"></div>
        ${ticks.map((m) => `<div class="tl-tick" style="left:${x(m)}px;top:124px"><span>${escapeHtml(formatDay(m, settings.dateFormat))}</span></div>`).join('')}
        ${now >= start && now <= finish ? `<div class="tl-today" style="left:${x(now)}px" title="${escapeHtml(t('chart.today'))}"><span>${escapeHtml(t('chart.today'))}</span></div>` : ''}
        ${milestones.map((task, i) => {
          const info = sched.info(task.id);
          return `<div class="tl-milestone ${app.isSelected(task.id) ? 'selected' : ''}" data-task="${escapeHtml(task.id)}" style="left:${x(info.start)}px;top:${i % 2 ? 162 : 92}px" title="${escapeHtml(task.name)}"><i></i><span>${escapeHtml(task.name)}<small>${escapeHtml(formatDay(info.start, settings.dateFormat))}</small></span></div>`;
        }).join('')}
        ${lane(marked, 210, 'callout', 30)}
        ${!phases.length && !milestones.length && !marked.length ? `<div class="tl-empty">${icon('info')}<span>${escapeHtml(t('timeline.empty'))}</span></div>` : ''}
      </div>`;
  }

  update() { this.render(); }
  selectionChanged() { this.render(); }
  scrollToTask() {}
  destroy() { this.resize.disconnect(); this.host.innerHTML = ''; this.host.className = 'view-host'; }
}
