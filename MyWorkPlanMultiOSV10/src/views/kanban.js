// Kanban board: the plan's tasks as cards in three columns by progress —
// Not started (0%), In progress (1–99%) and Done (100%). Cards show the phase
// (the summary above the task), the dates, the people, the progress and the
// critical / late / milestone marks. Drag a card to another column to change
// its progress (0%, 50% when it starts, 100%); click selects, double-click
// opens the task, right-click gives the task menu. Every leaf task is on the
// board (collapsed outline levels do not hide cards); inactive tasks are left out.
import { escapeHtml } from '../ui/dom.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { formatDay } from '../domain/time.js';

export const KANBAN_COLUMNS = [
  { id: 'todo', glyph: 'kanbanTodo', percent: 0 },
  { id: 'doing', glyph: 'kanbanDoing', percent: 50 },
  { id: 'done', glyph: 'kanbanDone', percent: 100 },
];

/** Which column a task belongs to, from its % complete. */
export const kanbanColumnOf = (percent) => ((percent ?? 0) >= 100 ? 'done' : (percent ?? 0) > 0 ? 'doing' : 'todo');

/** The percent a card gets when it is dropped on a column (a task already in progress keeps its value). */
export function kanbanDropPercent(column, current) {
  if (column === 'done') return 100;
  if (column === 'todo') return 0;
  return current > 0 && current < 100 ? current : 50;
}

/** Cards of each column: leaf, active tasks in the visible rows, in schedule order. */
export function kanbanCards(project, sched, rows) {
  const out = { todo: [], doing: [], done: [] };
  const parentOf = new Map();
  const stack = [];
  for (const task of project.tasks) {
    const level = task.outlineLevel ?? 1;
    stack.length = level - 1;
    parentOf.set(task.id, stack[level - 2] ?? null);
    stack[level - 1] = task;
  }
  const ids = rows ? rows.filter((row) => row.task).map((row) => row.task.id) : project.tasks.map((task) => task.id);
  for (const id of ids) {
    const info = sched.info(id);
    const task = project.tasks.find((x) => x.id === id);
    if (!task || !info || info.summary || task.active === false) continue;
    out[kanbanColumnOf(info.percentComplete)].push({ task, info, phase: parentOf.get(id)?.name ?? '' });
  }
  for (const list of Object.values(out)) list.sort((a, b) => a.info.start - b.info.start || a.info.row - b.info.row);
  return out;
}

export class KanbanView {
  constructor(app, host) {
    this.app = app;
    this.host = host;
    host.classList.add('kanban-view');
    this.bind();
  }

  render() {
    const app = this.app;
    const project = app.project();
    const sched = app.sched();
    const settings = app.settings();
    const cards = kanbanCards(project, sched, null);
    const date = (v) => formatDay(v, settings.dateFormat);
    const card = ({ task, info, phase }) => {
      const pct = Math.round(info.percentComplete ?? 0);
      const people = info.resourceNames ?? [];
      const marks = [
        info.critical && settings.showCritical ? `<span class="kb-mark critical" title="${escapeHtml(t('chart.critical'))}">${icon('critical', 'icon tiny')}</span>` : '',
        info.late ? `<span class="kb-mark late" title="${escapeHtml(t('ind.late'))}">${icon('reportLate', 'icon tiny')}</span>` : '',
        info.missedDeadline ? `<span class="kb-mark late" title="${escapeHtml(t('ind.deadline'))}">${icon('deadline', 'icon tiny')}</span>` : '',
      ].join('');
      return `<article class="kb-card ${app.isSelected(task.id) ? 'selected' : ''} ${task.milestone ? 'milestone' : ''}" data-task="${escapeHtml(task.id)}" tabindex="-1"
          style="${task.barColor ? `--kb-color:${escapeHtml(task.barColor)}` : ''}" title="${escapeHtml(`${info.row}. ${task.name}\n${date(info.start)} – ${date(info.finish)}${people.length ? `\n${people.join(', ')}` : ''}`)}">
        <div class="kb-top">${phase ? `<span class="kb-phase">${icon('summaryBar', 'icon tiny')}<span>${escapeHtml(phase)}</span></span>` : '<span></span>'}<span class="kb-id">#${info.row}</span></div>
        <div class="kb-name">${task.milestone ? icon('milestone', 'icon tiny') : ''}<span>${escapeHtml(task.name || '—')}</span>${marks}</div>
        <div class="kb-dates">${icon('calendar', 'icon tiny')}<span>${escapeHtml(date(info.start))} – ${escapeHtml(date(info.finish))}</span><span class="kb-duration">${escapeHtml(app.durationText(info, task))}</span></div>
        <div class="kb-progress" title="${escapeHtml(`${t('field.percentComplete')} ${pct}%`)}"><span class="mini-progress"><i style="width:${pct}%"></i></span><b>${pct}%</b></div>
        ${people.length ? `<div class="kb-people">${people.slice(0, 5).map((name) => `<span class="kb-person" title="${escapeHtml(name)}">${escapeHtml(initials(name))}</span>`).join('')}${people.length > 5 ? `<span class="kb-person more">+${people.length - 5}</span>` : ''}</div>` : ''}
      </article>`;
    };
    this.host.innerHTML = `<div class="kb-board">${KANBAN_COLUMNS.map((column) => {
      const list = cards[column.id];
      return `<section class="kb-column kb-${column.id}" data-column="${column.id}" aria-label="${escapeHtml(t(`kanban.${column.id}`))}">
        <header class="kb-head">${icon(column.glyph)}<span>${escapeHtml(t(`kanban.${column.id}`))}</span><b class="kb-count">${list.length}</b></header>
        <div class="kb-list" data-column="${column.id}">${list.length ? list.map(card).join('') : `<div class="kb-empty">${escapeHtml(t('kanban.empty'))}</div>`}</div>
      </section>`;
    }).join('')}</div>`;
  }

  bind() {
    const app = this.app;
    const host = this.host;
    host.addEventListener('dblclick', (event) => {
      const el = event.target.closest('[data-task]');
      if (el) app.openTaskInfo(el.dataset.task);
    });
    host.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const el = event.target.closest('[data-task]');
      if (el) { if (!app.isSelected(el.dataset.task)) app.selectTask(el.dataset.task, {}); app.contextMenu(event, 'bar', { id: el.dataset.task }); } else app.contextMenu(event, 'chart', {});
    });
    // Click selects; dragging a card moves it to another column (its progress changes).
    host.addEventListener('pointerdown', (event) => {
      const el = event.target.closest('.kb-card');
      if (!el || event.button !== 0) return;
      const id = el.dataset.task;
      const start = { x: event.clientX, y: event.clientY };
      let ghost = null;
      let over = null;
      const move = (e) => {
        if (!ghost) {
          if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return;
          const box = el.getBoundingClientRect();
          ghost = el.cloneNode(true);
          ghost.classList.add('kb-ghost');
          ghost.style.width = `${box.width}px`;
          ghost.dataset.dx = String(start.x - box.left);
          ghost.dataset.dy = String(start.y - box.top);
          document.body.append(ghost);
          el.classList.add('kb-dragging');
        }
        ghost.style.left = `${e.clientX - Number(ghost.dataset.dx)}px`;
        ghost.style.top = `${e.clientY - Number(ghost.dataset.dy)}px`;
        const column = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.kb-column');
        if (over !== column) { over?.classList.remove('kb-over'); over = column; over?.classList.add('kb-over'); }
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        over?.classList.remove('kb-over');
        el.classList.remove('kb-dragging');
        if (!ghost) return;
        ghost.remove();
        const target = over?.dataset.column;
        const info = app.sched().info(id);
        if (!target || !info || kanbanColumnOf(info.percentComplete) === target) return;
        // Every selected card moves together when the dragged one is part of the selection.
        const ids = app.isSelected(id) ? app.selection().ids.filter((x) => !app.sched().info(x)?.summary) : [id];
        app.setProgress(ids, kanbanDropPercent(target, info.percentComplete ?? 0));
      };
      app.selectTask(id, event);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    });
  }

  update() { this.render(); }
  selectionChanged() { for (const el of this.host.querySelectorAll('[data-task]')) el.classList.toggle('selected', this.app.isSelected(el.dataset.task)); }
  scrollToTask(id) { this.host.querySelector(`[data-task="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  destroy() { this.host.innerHTML = ''; this.host.className = 'view-host'; }
}

/** Two letters for a person's badge: initials of a two-word name, else its first two characters. */
export function initials(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return String(words[0] ?? '?').slice(0, 2).toUpperCase();
}
