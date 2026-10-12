// Date field with a calendar: the date can be typed (YYYY-MM-DD) or picked
// from a month calendar that opens under the field. Used for card due dates
// in the properties panel and in the card window.
import { icon } from './icons.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** "2026-02-30" → null; "2026-2-3" → "2026-02-03". */
export function parseDate(text) {
  const match = /^\s*(\d{4})[-./](\d{1,2})[-./](\d{1,2})\s*$/.exec(String(text ?? ''));
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? isoDate(date) : null;
}

/** The 6×7 days shown for a month (Monday first), with neighbouring days filled in. */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(year, month, 1 - offset + i);
    return { iso: isoDate(date), day: date.getDate(), outside: date.getMonth() !== month, weekend: date.getDay() === 0 || date.getDay() === 6 };
  });
}

/** text: { placeholder, open, today, clear, prev, next, weekdays[7], month(year, month) } */
export function dateFieldHtml({ key, value = '', label, text }) {
  return `<span class="date-field" data-date-field="${escapeHtml(key)}">
    <input type="text" class="date-input" value="${escapeHtml(value)}" placeholder="${escapeHtml(text.placeholder)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" maxlength="10" />
    <button type="button" class="icon-button" data-calendar-toggle title="${escapeHtml(text.open)}" aria-label="${escapeHtml(text.open)}" aria-haspopup="dialog">${icon('calendar')}</button>
  </span>`;
}

function calendarHtml(selected, year, month, text) {
  const today = isoDate(new Date());
  return `<div class="calendar-pop" role="dialog" aria-label="${escapeHtml(text.open)}">
    <div class="calendar-head">
      <button type="button" class="icon-button" data-cal-nav="-1" title="${escapeHtml(text.prev)}" aria-label="${escapeHtml(text.prev)}">${icon('chevronLeft')}</button>
      <b class="calendar-month">${escapeHtml(text.month(year, month))}</b>
      <button type="button" class="icon-button" data-cal-nav="1" title="${escapeHtml(text.next)}" aria-label="${escapeHtml(text.next)}">${icon('chevronRight')}</button>
    </div>
    <div class="calendar-grid">
      ${text.weekdays.map((day, i) => `<span class="calendar-weekday ${i >= 5 ? 'weekend' : ''}">${escapeHtml(day)}</span>`).join('')}
      ${monthGrid(year, month).map((cell) => `<button type="button" class="calendar-day ${cell.outside ? 'outside' : ''} ${cell.weekend ? 'weekend' : ''} ${cell.iso === today ? 'today' : ''} ${cell.iso === selected ? 'selected' : ''}" data-cal-day="${cell.iso}" title="${cell.iso}">${cell.day}</button>`).join('')}
    </div>
    <div class="calendar-foot">
      <button type="button" class="small-button" data-cal-pick="${today}" title="${escapeHtml(text.today)}">${icon('calendar')}<span>${escapeHtml(text.today)}</span></button>
      <button type="button" class="small-button" data-cal-pick="" title="${escapeHtml(text.clear)}">${icon('clear')}<span>${escapeHtml(text.clear)}</span></button>
    </div>
  </div>`;
}

/**
 * Wires the date fields inside `root`. `onPick(key, isoOrEmpty)` runs when a
 * day is chosen, the field is cleared, or a valid typed date is confirmed.
 * Invalid typed dates are put back to the previous value.
 */
export function bindDateFields(root, getText, onPick) {
  let open = null; // { field, year, month }
  const close = () => {
    root.querySelector('.calendar-pop')?.remove();
    open = null;
  };
  const draw = () => {
    root.querySelector('.calendar-pop')?.remove();
    if (!open?.field.isConnected) { open = null; return; }
    const value = open.field.querySelector('.date-input').value;
    open.field.insertAdjacentHTML('beforeend', calendarHtml(parseDate(value), open.year, open.month, getText()));
  };
  const pick = (field, value) => {
    const input = field.querySelector('.date-input');
    input.value = value;
    input.dataset.last = value;
    close();
    onPick(field.dataset.dateField, value);
  };
  root.addEventListener('click', (event) => {
    const field = event.target.closest('.date-field');
    if (event.target.closest('[data-calendar-toggle]')) {
      if (open?.field === field) return close();
      const current = parseDate(field.querySelector('.date-input').value) ?? isoDate(new Date());
      const [year, month] = current.split('-').map(Number);
      open = { field, year, month: month - 1 };
      return draw();
    }
    const nav = event.target.closest('[data-cal-nav]');
    if (nav && open) {
      const date = new Date(open.year, open.month + Number(nav.dataset.calNav), 1);
      open.year = date.getFullYear();
      open.month = date.getMonth();
      return draw();
    }
    const day = event.target.closest('[data-cal-day], [data-cal-pick]');
    if (day && open) return pick(open.field, day.dataset.calDay ?? day.dataset.calPick);
    if (open && !event.target.closest('.calendar-pop')) close();
    return undefined;
  });
  root.addEventListener('focusin', (event) => {
    if (event.target.classList?.contains('date-input') && event.target.dataset.last === undefined) event.target.dataset.last = event.target.value;
  });
  root.addEventListener('change', (event) => {
    if (!event.target.classList?.contains('date-input')) return;
    event.stopPropagation();
    const field = event.target.closest('.date-field');
    const text = event.target.value.trim();
    const value = text ? parseDate(text) : '';
    if (value === null) {
      event.target.value = event.target.dataset.last ?? '';
      event.target.classList.add('invalid');
      setTimeout(() => event.target.classList.remove('invalid'), 1200);
      return;
    }
    event.target.value = value;
    event.target.dataset.last = value;
    onPick(field.dataset.dateField, value);
  }, true);
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open) {
      event.stopPropagation();
      close();
    }
  }, true);
}

export function calendarText(t, language) {
  const weekdays = language === 'en' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['월', '화', '수', '목', '금', '토', '일'];
  return {
    placeholder: 'YYYY-MM-DD', open: t('calendar.open'), today: t('calendar.today'), clear: t('calendar.clear'), prev: t('calendar.prev'), next: t('calendar.next'), weekdays,
    month: (year, month) => (language === 'en' ? new Date(year, month, 1).toLocaleDateString('en-US', { year: 'numeric', month: 'long' }) : `${year}년 ${month + 1}월`),
  };
}
