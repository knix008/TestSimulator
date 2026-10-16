// Calendar view: a month with the tasks as bars across the days they run.
// Each week is a row; bars stack in lanes ("+N more" when a week is full).
import { escapeHtml } from '../ui/dom.js';
import { icon } from '../icons.js';
import { t, getLanguage } from '../i18n.js';
import { addMonths, dayOf, dayStart, fromParts, parts, todayDay, weekdayOfDay } from '../domain/time.js';

const WEEKDAYS = { ko: ['일', '월', '화', '수', '목', '금', '토'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };

export class CalendarView {
  constructor(app, host) {
    this.app = app;
    this.host = host;
    host.classList.add('calendar-view');
    const start = parts(app.sched().start);
    this.month = fromParts(start.year, start.month, 1);
    host.addEventListener('click', (event) => {
      const nav = event.target.closest('[data-cal-nav]');
      if (nav) {
        const step = nav.dataset.calNav;
        if (step === 'today') { const p = parts(dayStart(todayDay())); this.month = fromParts(p.year, p.month, 1); }
        else if (step === 'start') { const p = parts(app.sched().start); this.month = fromParts(p.year, p.month, 1); }
        else this.month = addMonths(this.month, Number(step));
        this.render();
        return;
      }
      const bar = event.target.closest('[data-task]');
      if (bar) app.selectTask(bar.dataset.task, event);
    });
    host.addEventListener('dblclick', (event) => {
      const bar = event.target.closest('[data-task]');
      if (bar) app.openTaskInfo(bar.dataset.task);
    });
    host.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const bar = event.target.closest('[data-task]');
      if (bar) { app.selectTask(bar.dataset.task, {}); app.contextMenu(event, 'bar', { id: bar.dataset.task }); } else app.contextMenu(event, 'chart', {});
    });
    host.addEventListener('wheel', (event) => {
      if (event.ctrlKey || event.metaKey) return;
      if (!event.target.closest('.cal-grid')) return;
      event.preventDefault();
      this.month = addMonths(this.month, event.deltaY > 0 ? 1 : -1);
      this.render();
    }, { passive: false });
  }

  render() {
    const app = this.app;
    const L = getLanguage();
    const settings = app.settings();
    const weekStart = app.project().options.weekStart ?? 1;
    const p = parts(this.month);
    const firstDay = dayOf(this.month);
    const gridStart = firstDay - ((weekdayOfDay(firstDay) - weekStart + 7) % 7);
    const today = todayDay();
    const rows = app.taskRows().filter((row) => row.task && row.info && !row.info.summary && row.info.start != null);
    const lanesPerWeek = 5;
    const weeks = [];
    for (let w = 0; w < 6; w++) {
      const from = gridStart + w * 7;
      const to = from + 6;
      const items = rows.filter((row) => dayOf(row.info.start) <= to && dayOf(Math.max(row.info.start, row.info.finish - 1)) >= from)
        .sort((a, b) => a.info.start - b.info.start || b.info.finish - a.info.finish);
      const lanes = [];
      const placed = [];
      let hidden = new Array(7).fill(0);
      for (const row of items) {
        const s = Math.max(from, dayOf(row.info.start));
        const e = Math.min(to, dayOf(Math.max(row.info.start, row.info.finish - 1)));
        let lane = lanes.findIndex((end) => end < s);
        if (lane < 0) { lane = lanes.length; lanes.push(-Infinity); }
        if (lane >= lanesPerWeek) { for (let d = s; d <= e; d++) hidden[d - from] += 1; continue; }
        lanes[lane] = e;
        placed.push({ row, s, e, lane, contLeft: dayOf(row.info.start) < from, contRight: dayOf(row.info.finish - 1) > to });
      }
      weeks.push({ from, placed, hidden });
      hidden = null;
    }
    const days = WEEKDAYS[L];
    const order = Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7);
    const monthLabel = L === 'ko' ? `${p.year}년 ${p.month + 1}월` : `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][p.month]} ${p.year}`;
    this.host.innerHTML = `
      <div class="cal-bar">
        <button class="small-button" data-cal-nav="-1" title="${escapeHtml(t('calendar.prevMonth'))}">${icon('chevronLeft')}</button>
        <h2>${escapeHtml(monthLabel)}</h2>
        <button class="small-button" data-cal-nav="1" title="${escapeHtml(t('calendar.nextMonth'))}">${icon('chevronRight')}</button>
        <button class="small-button" data-cal-nav="today" title="${escapeHtml(t('calendar.thisMonth'))}">${icon('today')}<span>${escapeHtml(t('calendar.thisMonth'))}</span></button>
        <button class="small-button" data-cal-nav="start" title="${escapeHtml(t('calendar.projectStart'))}">${icon('flag')}<span>${escapeHtml(t('calendar.projectStart'))}</span></button>
        <span class="grow"></span><span class="muted">${escapeHtml(t('calendar.hint'))}</span>
      </div>
      <div class="cal-grid">
        <div class="cal-head">${order.map((wd) => `<div class="${wd === 0 || wd === 6 ? 'weekend' : ''}">${escapeHtml(days[wd])}</div>`).join('')}</div>
        ${weeks.map((week) => `<div class="cal-week">
          ${Array.from({ length: 7 }, (_, i) => {
            const day = week.from + i;
            const q = parts(dayStart(day));
            const working = app.sched().projectCal.isWorkingDay(day);
            return `<div class="cal-day ${q.month !== p.month ? 'outside' : ''} ${working ? '' : 'nonworking'} ${day === today ? 'today' : ''}" style="left:${(i / 7) * 100}%"><span class="cal-num">${q.day}</span>${week.hidden[i] ? `<span class="cal-more">+${week.hidden[i]}</span>` : ''}</div>`;
          }).join('')}
          ${week.placed.map(({ row, s, e, lane, contLeft, contRight }) => {
            const left = ((s - week.from) / 7) * 100;
            const width = ((e - s + 1) / 7) * 100;
            const cls = ['cal-bar-item', row.info.critical && settings.showCritical ? 'critical' : '', row.info.milestone ? 'milestone' : '', app.isSelected(row.id) ? 'selected' : '', contLeft ? 'cont-left' : '', contRight ? 'cont-right' : '', (row.info.percentComplete ?? 0) >= 100 ? 'done' : ''].join(' ');
            return `<div class="${cls}" data-task="${escapeHtml(row.id)}" style="left:calc(${left}% + 2px);width:calc(${width}% - 4px);top:${24 + lane * 21}px" title="${escapeHtml(`${row.info.row}. ${row.task.name}`)}">${row.info.milestone ? icon('milestone', 'icon tiny') : ''}<span>${escapeHtml(row.task.name)}</span></div>`;
          }).join('')}
        </div>`).join('')}
      </div>`;
  }

  update() { this.render(); }
  selectionChanged() { for (const el of this.host.querySelectorAll('[data-task]')) el.classList.toggle('selected', this.app.isSelected(el.dataset.task)); }
  scrollToTask(id) {
    const info = this.app.sched().info(id);
    if (!info) return;
    const p = parts(info.start);
    this.month = fromParts(p.year, p.month, 1);
    this.render();
  }
  destroy() { this.host.innerHTML = ''; this.host.className = 'view-host'; }
}
