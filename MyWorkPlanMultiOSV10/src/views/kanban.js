// Kanban board: the plan's tasks as cards in four columns — Backlog (0%,
// put aside: task.backlog), Not started (0%), In progress (1–99%) and Done (100%). Cards show the phase
// (the summary above the task), the dates, the people, the progress and the
// critical / late / milestone marks. Drag a card to another column to change
// its progress (0%, 50% when it starts, 100%; Backlog also marks it); click selects, double-click
// opens the task, right-click gives the task menu. Every leaf task is on the
// board (collapsed outline levels do not hide cards); inactive tasks are left out.
import { escapeHtml } from '../ui/dom.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { formatDay } from '../domain/time.js';

export const KANBAN_COLUMNS = [
  { id: 'backlog', glyph: 'kanbanBacklog', percent: 0 },
  { id: 'todo', glyph: 'kanbanTodo', percent: 0 },
  { id: 'doing', glyph: 'kanbanDoing', percent: 50 },
  { id: 'done', glyph: 'kanbanDone', percent: 100 },
];

/** Which column a task belongs to, from its % complete (a 0% task marked backlog waits in the Backlog). */
export const kanbanColumnOf = (percent, backlog = false) => ((percent ?? 0) >= 100 ? 'done' : (percent ?? 0) > 0 ? 'doing' : backlog ? 'backlog' : 'todo');

/** The percent a card gets when it is dropped on a column (a task already in progress keeps its value). */
export function kanbanDropPercent(column, current) {
  if (column === 'done') return 100;
  if (column === 'todo' || column === 'backlog') return 0;
  return current > 0 && current < 100 ? current : 50;
}

/** Cards of each column: leaf, active tasks in the visible rows, in schedule order. */
export function kanbanCards(project, sched, rows) {
  const out = { backlog: [], todo: [], doing: [], done: [] };
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
    out[kanbanColumnOf(info.percentComplete, task.backlog)].push({ task, info, phase: parentOf.get(id)?.name ?? '' });
  }
  // Cards placed by a drop keep their place (kanbanRank); the rest follow in schedule order.
  const rank = (card) => (Number.isFinite(card.task.kanbanRank) ? card.task.kanbanRank : null);
  const bySchedule = (a, b) => a.info.start - b.info.start || a.info.row - b.info.row;
  for (const list of Object.values(out)) {
    list.sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra != null && rb != null) return ra - rb || bySchedule(a, b);
      if (ra != null || rb != null) return ra != null ? -1 : 1;
      return bySchedule(a, b);
    });
  }
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
    // The view host is shared by every view: the listeners go away with this view (destroy).
    this.listening = new AbortController();
    const signal = this.listening.signal;
    host.addEventListener('dblclick', (event) => {
      const el = event.target.closest('[data-task]');
      if (el) app.openTaskInfo(el.dataset.task);
    }, { signal });
    host.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const el = event.target.closest('[data-task]');
      if (el) { if (!app.isSelected(el.dataset.task)) app.selectTask(el.dataset.task, {}); app.contextMenu(event, 'bar', { id: el.dataset.task }); } else app.contextMenu(event, 'chart', {});
    }, { signal });
    // Click selects. Dragging lifts the card out of its list: a silhouette of
    // it takes its place and follows the pointer through the columns, the cards
    // where it would go slide apart to make room, and the drop puts the card
    // exactly there (another column also changes its progress).
    host.addEventListener('pointerdown', (event) => {
      const el = event.target.closest('.kb-card');
      if (!el || event.button !== 0) return;
      const id = el.dataset.task;
      const start = { x: event.clientX, y: event.clientY };
      let drag = null;
      let pointer = start;
      const begin = () => {
        // Every selected card on the board moves together when the dragged one is part of the selection.
        const onBoard = new Set([...host.querySelectorAll('.kb-card')].map((card) => card.dataset.task));
        const ids = app.isSelected(id) ? [id, ...app.selection().ids.filter((x) => x !== id && onBoard.has(x))] : [id];
        const cards = ids.map((x) => host.querySelector(`.kb-card[data-task="${CSS.escape(x)}"]`)).filter(Boolean);
        const box = el.getBoundingClientRect();
        const ghost = el.cloneNode(true);
        ghost.classList.add('kb-ghost');
        ghost.classList.remove('selected');
        ghost.style.width = `${box.width}px`;
        if (cards.length > 1) ghost.insertAdjacentHTML('beforeend', `<span class="kb-ghost-count">${cards.length}</span>`);
        document.body.append(ghost);
        const placeholder = document.createElement('div');
        placeholder.className = 'kb-placeholder';
        placeholder.style.height = `${box.height}px`;
        flip(() => {
          el.before(placeholder);
          for (const card of cards) card.classList.add('kb-lifted');
        });
        drag = { ids, cards, ghost, placeholder, dx: start.x - box.left, dy: start.y - box.top, over: null, raf: 0 };
        document.body.classList.add('kb-grabbing');
      };
      // Where the silhouette goes: the list under the pointer, before the first card whose middle is below it.
      const place = () => {
        const { placeholder } = drag;
        const column = document.elementFromPoint(pointer.x, pointer.y)?.closest?.('.kb-column');
        if (drag.over !== column) { drag.over?.classList.remove('kb-over'); drag.over = column && host.contains(column) ? column : null; drag.over?.classList.add('kb-over'); }
        if (!drag.over) {
          // Off the board: the silhouette goes back where the card came from.
          if (placeholder.nextElementSibling !== el) flip(() => el.before(placeholder));
          return;
        }
        const list = drag.over.querySelector('.kb-list');
        const y = pointer.y - list.getBoundingClientRect().top - list.clientTop + list.scrollTop;
        const next = [...list.querySelectorAll('.kb-card:not(.kb-lifted)')].find((card) => card.offsetTop + card.offsetHeight / 2 > y) ?? null;
        if (placeholder.parentElement === list && nextCard(placeholder) === next) return;
        flip(() => (next ? next.before(placeholder) : list.append(placeholder)));
      };
      // Near the top or bottom of a list it scrolls, and the silhouette keeps following.
      const autoScroll = () => {
        drag.raf = requestAnimationFrame(autoScroll);
        const list = drag.over?.querySelector('.kb-list');
        if (!list) return;
        const r = list.getBoundingClientRect();
        const step = pointer.y < r.top + 36 ? -8 : pointer.y > r.bottom - 36 ? 8 : 0;
        if (!step) return;
        const before = list.scrollTop;
        list.scrollTop += step;
        if (list.scrollTop !== before) place();
      };
      const move = (e) => {
        pointer = { x: e.clientX, y: e.clientY };
        if (!drag) {
          if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return;
          begin();
          autoScroll();
        }
        drag.ghost.style.left = `${e.clientX - drag.dx}px`;
        drag.ghost.style.top = `${e.clientY - drag.dy}px`;
        place();
      };
      const stop = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        window.removeEventListener('keydown', key, true);
        if (!drag) return false;
        cancelAnimationFrame(drag.raf);
        drag.over?.classList.remove('kb-over');
        document.body.classList.remove('kb-grabbing');
        drag.ghost.remove();
        return true;
      };
      const restore = () => {
        drag.placeholder.remove();
        for (const card of drag.cards) card.classList.remove('kb-lifted');
      };
      const cancel = () => { if (stop()) restore(); };
      const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); } };
      const up = () => {
        if (!stop()) return;
        const { placeholder, ids } = drag;
        const list = placeholder.parentElement;
        const target = list?.dataset.column;
        if (!target) return restore();
        // The target column top to bottom, the moved cards where the silhouette is.
        const order = [];
        for (const child of list.children) {
          if (child === placeholder) order.push(...ids);
          else if (child.matches('.kb-card:not(.kb-lifted)')) order.push(child.dataset.task);
        }
        const sched = app.sched();
        const moves = ids.flatMap((x) => {
          const info = sched.info(x);
          const task = app.project().tasks.find((item) => item.id === x);
          return info && kanbanColumnOf(info.percentComplete, task?.backlog) !== target ? [{ id: x, percent: kanbanDropPercent(target, info.percentComplete ?? 0), backlog: target === 'backlog' }] : [];
        });
        const current = kanbanCards(app.project(), sched, null)[target].map((card) => card.task.id);
        if (!moves.length && order.join('\n') === current.join('\n')) return restore();
        app.kanbanMove(moves, order);
      };
      app.selectTask(id, event);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
      window.addEventListener('keydown', key, true);
    }, { signal });
  }

  update() { this.render(); }
  selectionChanged() { for (const el of this.host.querySelectorAll('[data-task]')) el.classList.toggle('selected', this.app.isSelected(el.dataset.task)); }
  scrollToTask(id) { this.host.querySelector(`[data-task="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  destroy() { this.listening.abort(); this.host.innerHTML = ''; this.host.className = 'view-host'; }
}

/** The next card after an element in its list (skipping lifted cards), or null at the end. */
function nextCard(node) {
  for (let el = node.nextElementSibling; el; el = el.nextElementSibling) if (el.matches('.kb-card:not(.kb-lifted)')) return el;
  return null;
}

/**
 * Runs a DOM change and slides the board's cards from where they were to where
 * they end up (FLIP), so cards make room for the silhouette instead of jumping.
 * Rects are read with the running slide included, so a slide that is cut short
 * continues smoothly from where it is.
 */
function flip(mutate) {
  const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const cards = reduce ? [] : [...document.querySelectorAll('.kb-board .kb-card:not(.kb-lifted)')];
  const before = new Map(cards.map((card) => [card, card.getBoundingClientRect()]));
  mutate();
  const moved = [];
  for (const card of cards) {
    const a = before.get(card);
    const b = card.getBoundingClientRect();
    const dx = a.left - b.left;
    const dy = a.top - b.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    card.style.transition = 'none';
    card.style.transform = `translate(${dx}px, ${dy}px)`;
    moved.push(card);
  }
  if (!moved.length) return;
  void document.body.offsetHeight;
  for (const card of moved) {
    card.style.transition = 'transform 180ms cubic-bezier(0.2, 0, 0, 1)';
    card.style.transform = '';
    card.addEventListener('transitionend', () => { card.style.transition = ''; }, { once: true });
  }
}

/** Two letters for a person's badge: initials of a two-word name, else its first two characters. */
export function initials(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return String(words[0] ?? '?').slice(0, 2).toUpperCase();
}
