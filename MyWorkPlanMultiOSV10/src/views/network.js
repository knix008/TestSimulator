// Network Diagram: one box per task (ID, name, dates, duration, resources),
// placed in columns by dependency depth, with the links between them.
// Critical tasks are red, milestones have a diamond, finished tasks are crossed
// out and tasks in progress half crossed. Drag the background (or Ctrl+drag) to
// pan, Ctrl+wheel to zoom, double-click a box for task information.
import { escapeHtml, pointerDrag } from '../ui/dom.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { formatDay } from '../domain/time.js';

const W = 190;
const H = 92;
const GAP_X = 70;
const GAP_Y = 26;

export function layoutNetwork(project, sched, { summaries = false, filter = () => true } = {}) {
  const tasks = project.tasks.filter((task) => {
    const info = sched.info(task.id);
    return info && (summaries || !info.summary) && filter(task, info);
  });
  const ids = new Set(tasks.map((task) => task.id));
  const level = new Map();
  // Depth: longest chain of predecessors (rows in schedule order are already topological).
  const order = [...sched.order.filter((id) => ids.has(id)), ...tasks.map((task) => task.id).filter((id) => !sched.order.includes(id))];
  const preds = (task) => (task.predecessors ?? []).map((link) => link.taskId).filter((id) => ids.has(id));
  for (const id of order) {
    const task = project.tasks.find((item) => item.id === id);
    level.set(id, Math.max(0, ...preds(task).map((p) => (level.get(p) ?? 0) + 1)));
  }
  const columns = [];
  for (const id of order) {
    const column = level.get(id) ?? 0;
    (columns[column] ??= []).push(id);
  }
  const boxes = new Map();
  columns.forEach((list, x) => {
    list.sort((a, b) => (sched.info(a)?.start ?? 0) - (sched.info(b)?.start ?? 0) || (sched.info(a)?.row ?? 0) - (sched.info(b)?.row ?? 0));
    list.forEach((id, y) => boxes.set(id, { id, x: 30 + x * (W + GAP_X), y: 30 + y * (H + GAP_Y) }));
  });
  const width = 60 + columns.length * (W + GAP_X);
  const height = 60 + Math.max(1, ...columns.map((list) => list.length)) * (H + GAP_Y);
  const links = [];
  for (const task of tasks) for (const link of task.predecessors ?? []) if (boxes.has(link.taskId)) links.push({ from: link.taskId, to: task.id, type: link.type });
  return { boxes, links, width, height };
}

export class NetworkView {
  constructor(app, host) {
    this.app = app;
    this.host = host;
    this.zoom = 1;
    host.classList.add('network-view');
    host.innerHTML = `<div class="network-body" tabindex="-1"><div class="network-canvas"><svg class="network-links" xmlns="http://www.w3.org/2000/svg"></svg><div class="network-boxes"></div></div></div>
      <div class="view-legend">${icon('viewNetwork')}<span>${escapeHtml(t('network.legend'))}</span></div>`;
    this.body = host.querySelector('.network-body');
    this.canvas = host.querySelector('.network-canvas');
    this.svg = host.querySelector('.network-links');
    this.boxesEl = host.querySelector('.network-boxes');
    this.bind();
  }

  render() {
    const app = this.app;
    const project = app.project();
    const sched = app.sched();
    const settings = app.settings();
    const visible = new Set(app.taskRows().filter((row) => row.task).map((row) => row.id));
    this.layout = layoutNetwork(project, sched, { filter: (task) => visible.has(task.id) || visible.size === 0 });
    const { boxes, links, width, height } = this.layout;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.canvas.style.transform = `scale(${this.zoom})`;
    this.svg.setAttribute('width', width);
    this.svg.setAttribute('height', height);
    const html = [];
    for (const box of boxes.values()) {
      const task = project.tasks.find((item) => item.id === box.id);
      const info = sched.info(box.id);
      const pct = info.percentComplete ?? 0;
      const classes = ['net-box', info.critical && settings.showCritical ? 'critical' : '', info.milestone ? 'milestone' : '', info.summary ? 'summary' : '', pct >= 100 ? 'done' : pct > 0 ? 'started' : '', app.isSelected(box.id) ? 'selected' : '', task.manual ? 'manual' : ''].join(' ');
      html.push(`<div class="${classes}" data-task="${escapeHtml(box.id)}" style="left:${box.x}px;top:${box.y}px;width:${W}px;height:${H}px" title="${escapeHtml(task.name)}">
        <div class="net-title">${info.milestone ? icon('milestone', 'icon tiny') : ''}<b>${escapeHtml(task.name || '—')}</b></div>
        <div class="net-grid">
          <span>${escapeHtml(t('field.start'))}</span><span>${escapeHtml(formatDay(info.start, settings.dateFormat))}</span>
          <span>${escapeHtml(t('field.id'))}</span><span>${info.row}</span>
          <span>${escapeHtml(t('field.finish'))}</span><span>${escapeHtml(formatDay(info.finish, settings.dateFormat))}</span>
          <span>${escapeHtml(t('field.duration'))}</span><span>${escapeHtml(app.durationText(info, task))}</span>
        </div>
        <div class="net-res">${escapeHtml((info.resourceNames ?? []).join(', ') || ' ')}</div>
        ${pct >= 100 ? '<svg class="net-cross" viewBox="0 0 10 10" preserveAspectRatio="none"><path d="M0 0L10 10M10 0L0 10"/></svg>' : pct > 0 ? '<svg class="net-cross" viewBox="0 0 10 10" preserveAspectRatio="none"><path d="M0 0L10 10"/></svg>' : ''}
      </div>`);
    }
    this.boxesEl.innerHTML = html.join('');
    const paths = links.map((link) => {
      const a = boxes.get(link.from);
      const b = boxes.get(link.to);
      const x1 = link.type === 'SS' || link.type === 'SF' ? a.x : a.x + W;
      const y1 = a.y + H / 2;
      const x2 = link.type === 'FF' || link.type === 'SF' ? b.x + W : b.x;
      const y2 = b.y + H / 2;
      const mid = x2 > x1 ? x1 + Math.max(14, (x2 - x1) / 2) : x1 + 14;
      const crit = settings.showCritical && sched.info(link.from)?.critical && sched.info(link.to)?.critical;
      return `<path class="net-link ${crit ? 'critical' : ''}" d="M${x1} ${y1} H${mid} V${y2} H${x2 - (x2 > x1 ? 2 : -2)}" marker-end="url(#net-arrow${crit ? '-c' : ''})"/>`;
    });
    this.svg.innerHTML = `<defs><marker id="net-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto"><path class="arrowhead" d="M0 0L8 4L0 8z"/></marker><marker id="net-arrow-c" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto"><path class="arrowhead critical" d="M0 0L8 4L0 8z"/></marker></defs>${paths.join('')}`;
  }

  update() { this.render(); }
  selectionChanged() { for (const el of this.boxesEl.querySelectorAll('.net-box')) el.classList.toggle('selected', this.app.isSelected(el.dataset.task)); }

  scrollToTask(id) {
    const box = this.layout?.boxes.get(id);
    if (box) { this.body.scrollLeft = box.x * this.zoom - 60; this.body.scrollTop = box.y * this.zoom - 60; }
  }

  setZoom(zoom) {
    this.zoom = Math.max(0.3, Math.min(2, zoom));
    this.canvas.style.transform = `scale(${this.zoom})`;
  }

  bind() {
    const app = this.app;
    this.body.addEventListener('wheel', (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      this.setZoom(this.zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12));
    }, { passive: false });
    this.body.addEventListener('pointerdown', (event) => {
      const box = event.target.closest('[data-task]');
      if (box && !event.ctrlKey && event.button === 0) { app.selectTask(box.dataset.task, event); return; }
      if (event.button !== 0 && event.button !== 1) return;
      event.preventDefault();
      const left = this.body.scrollLeft;
      const top = this.body.scrollTop;
      this.body.classList.add('panning');
      pointerDrag(event, {
        move: (dx, dy) => { this.body.scrollLeft = left - dx; this.body.scrollTop = top - dy; },
        end: (e, moved) => { this.body.classList.remove('panning'); if (!moved && !box) app.clearSelection(); },
      });
    });
    this.body.addEventListener('dblclick', (event) => {
      const box = event.target.closest('[data-task]');
      if (box) app.openTaskInfo(box.dataset.task);
    });
    this.body.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const box = event.target.closest('[data-task]');
      if (box) { if (!app.isSelected(box.dataset.task)) app.selectTask(box.dataset.task, {}); app.contextMenu(event, 'bar', { id: box.dataset.task }); } else app.contextMenu(event, 'chart', {});
    });
  }

  destroy() { this.host.innerHTML = ''; this.host.className = 'view-host'; }
}
