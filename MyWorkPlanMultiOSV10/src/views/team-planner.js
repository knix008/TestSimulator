// Team Planner: one lane per work resource with its tasks on a timeline, and a
// lane of unassigned tasks. Drag a task block onto another lane to give it to
// that person (the assignment moves); overallocated lanes are marked red.
import { escapeHtml, pointerDrag } from '../ui/dom.js';
import { icon } from '../icons.js';
import { t, getLanguage } from '../i18n.js';
import { Timescale } from './timescale.js';
import { dayOf, formatDay } from '../domain/time.js';

const LANE = 54;

export class TeamPlannerView {
  constructor(app, host) {
    this.app = app;
    this.host = host;
    host.classList.add('team-view');
    host.innerHTML = `<div class="team-names"></div><div class="team-chart"><div class="chart-head"><div class="tier top"></div><div class="tier bottom"></div></div><div class="team-body"><div class="team-canvas"></div></div></div>`;
    this.names = host.querySelector('.team-names');
    this.body = host.querySelector('.team-body');
    this.canvas = host.querySelector('.team-canvas');
    this.headTop = host.querySelector('.tier.top');
    this.headBottom = host.querySelector('.tier.bottom');
    this.body.addEventListener('scroll', () => { this.names.scrollTop = this.body.scrollTop; this.drawHead(); }, { passive: true });
    this.body.addEventListener('wheel', (event) => {
      if (event.ctrlKey || event.metaKey) { event.preventDefault(); app.stepTimescale(event.deltaY < 0 ? 1 : -1); }
    }, { passive: false });
    this.bind();
  }

  lanes() {
    const project = this.app.project();
    const out = project.resources.filter((r) => r.type === 'work').map((r) => ({ id: r.id, name: r.name, resource: r }));
    out.push({ id: '', name: t('team.unassigned') });
    return out;
  }

  render() {
    const app = this.app;
    const project = app.project();
    const sched = app.sched();
    const settings = app.settings();
    this.scale = new Timescale({ fromDay: dayOf(sched.start), toDay: dayOf(sched.finish), pxPerDay: settings.timescale, weekStart: project.options.weekStart ?? 1, language: getLanguage() });
    const lanes = this.lanes();
    this.canvas.style.width = `${this.scale.width}px`;
    this.canvas.style.height = `${lanes.length * LANE}px`;
    const leaves = project.tasks.filter((task) => !sched.info(task.id)?.summary && task.active !== false);
    const leafById = new Map(leaves.map((task) => [task.id, task]));
    const workIds = new Set(project.resources.filter((r) => r.type === 'work').map((r) => r.id));
    const withWork = new Set(project.assignments.filter((a) => workIds.has(a.resourceId)).map((a) => a.taskId));
    const blocks = [];
    lanes.forEach((lane, index) => {
      const tasks = lane.id
        ? project.assignments.filter((a) => a.resourceId === lane.id).map((a) => leafById.get(a.taskId)).filter(Boolean)
        : leaves.filter((task) => !withWork.has(task.id));
      // Stack overlapping tasks in two rows of the lane.
      const ends = [-Infinity, -Infinity];
      for (const task of tasks.sort((a, b) => sched.info(a.id).start - sched.info(b.id).start)) {
        const info = sched.info(task.id);
        const sub = ends[0] <= info.start ? 0 : ends[1] <= info.start ? 1 : 0;
        ends[sub] = Math.max(ends[sub], info.finish);
        const x = this.scale.x(info.start);
        const w = Math.max(info.milestone ? 10 : 6, this.scale.x(info.finish) - x);
        blocks.push(`<div class="team-block ${info.critical && settings.showCritical ? 'critical' : ''} ${info.overallocated && lane.id ? 'over' : ''} ${app.isSelected(task.id) ? 'selected' : ''}" data-task="${escapeHtml(task.id)}" data-lane="${escapeHtml(lane.id)}" style="left:${x}px;width:${w}px;top:${index * LANE + 5 + sub * 23}px" title="${escapeHtml(`${task.name}\n${formatDay(info.start, settings.dateFormat)} – ${formatDay(info.finish, settings.dateFormat)}`)}"><span>${escapeHtml(task.name)}</span></div>`);
      }
    });
    this.canvas.innerHTML = lanes.map((lane, index) => `<div class="team-lane ${lane.id && sched.resources.get(lane.id)?.overallocated ? 'over' : ''}" style="top:${index * LANE}px;height:${LANE}px"></div>`).join('') + blocks.join('');
    this.names.innerHTML = lanes.map((lane) => {
      const over = lane.id && sched.resources.get(lane.id)?.overallocated;
      return `<div class="team-name ${over ? 'over' : ''}" data-resource="${escapeHtml(lane.id)}" style="height:${LANE}px" title="${escapeHtml(lane.name)}">${icon(lane.id ? (over ? 'overallocation' : 'user') : 'question')}<span>${escapeHtml(lane.name)}</span></div>`;
    }).join('');
    if (this.body.scrollLeft === 0) this.body.scrollLeft = Math.max(0, this.scale.x(sched.start) - 40);
    this.drawHead();
  }

  drawHead() {
    if (!this.scale) return;
    const left = this.body.scrollLeft;
    const width = this.body.clientWidth || 800;
    const tier = (unit, element) => {
      element.innerHTML = this.scale.cells(unit, left - 200, left + width + 200).map((cell) => `<div class="tier-cell ${cell.weekend ? 'weekend' : ''}" style="left:${cell.x - left}px;width:${cell.width}px" title="${escapeHtml(cell.title)}"><span>${escapeHtml(cell.label)}</span></div>`).join('');
    };
    tier(this.scale.topUnit, this.headTop);
    tier(this.scale.bottomUnit, this.headBottom);
  }

  bind() {
    const app = this.app;
    this.body.addEventListener('dblclick', (event) => {
      const block = event.target.closest('[data-task]');
      if (block) app.openTaskInfo(block.dataset.task);
    });
    this.body.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const block = event.target.closest('[data-task]');
      if (block) { app.selectTask(block.dataset.task, {}); app.contextMenu(event, 'bar', { id: block.dataset.task }); } else app.contextMenu(event, 'chart', {});
    });
    this.names.addEventListener('dblclick', (event) => {
      const lane = event.target.closest('[data-resource]');
      if (lane?.dataset.resource) app.openResourceInfo(lane.dataset.resource);
    });
    this.body.addEventListener('pointerdown', (event) => {
      const block = event.target.closest('[data-task]');
      if (event.button !== 0) return;
      if (!block || event.ctrlKey) {
        const left = this.body.scrollLeft;
        const top = this.body.scrollTop;
        event.preventDefault();
        pointerDrag(event, { move: (dx, dy) => { this.body.scrollLeft = left - dx; this.body.scrollTop = top - dy; } });
        return;
      }
      app.selectTask(block.dataset.task, event);
      const startTop = parseFloat(block.style.top);
      pointerDrag(event, {
        threshold: 6,
        move: (dx, dy) => { block.style.transform = `translate(${dx}px, ${dy}px)`; block.classList.add('dragging'); },
        end: (e, moved) => {
          block.style.transform = '';
          block.classList.remove('dragging');
          if (!moved) return;
          const lanes = this.lanes();
          const index = Math.max(0, Math.min(lanes.length - 1, Math.floor((startTop + (e.clientY - event.clientY)) / LANE)));
          const target = lanes[index];
          if (target.id !== block.dataset.lane) app.reassignTask(block.dataset.task, block.dataset.lane || null, target.id || null);
        },
      });
    });
  }

  update() { this.render(); }
  selectionChanged() { for (const el of this.canvas.querySelectorAll('[data-task]')) el.classList.toggle('selected', this.app.isSelected(el.dataset.task)); }
  scrollToTask(id) { const info = this.app.sched().info(id); if (info && this.scale) this.body.scrollLeft = Math.max(0, this.scale.x(info.start) - 60); }
  destroy() { this.host.innerHTML = ''; this.host.className = 'view-host'; }
}
