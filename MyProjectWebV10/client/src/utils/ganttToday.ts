/** Today marker helpers for frappe-gantt (Win: TimescaleToday + GoToToday). */

import { GANTT_HEADER_HEIGHT } from '../config/ganttLayout';
import { getStoredLocale } from '../i18n/storage';
import { translate } from '../i18n/translate';

const TODAY_LINE_WIDTH_PX = 2;
const TODAY_BALL_SIZE_PX = 12;

export interface FrappeGanttTodayApi {
  gantt_start: Date;
  gantt_end: Date;
  get_closest_date?: () => unknown;
  scroll_current?: () => void;
}

export function isTodayInGanttRange(gantt: FrappeGanttTodayApi | null): boolean {
  if (!gantt?.get_closest_date) return false;
  return gantt.get_closest_date() != null;
}

export function scrollGanttToToday(gantt: FrappeGanttTodayApi | null): boolean {
  if (!gantt?.scroll_current || !isTodayInGanttRange(gantt)) return false;
  gantt.scroll_current();
  return true;
}

export function decorateTodayMarker(container: HTMLElement): void {
  container.querySelector('.today-button')?.remove();
  container.querySelector('.gantt-today-column-frame')?.remove();

  container.querySelectorAll('.lower-text').forEach((el) => {
    el.classList.remove('gantt-today-day');
  });

  const dateCell = container.querySelector('.lower-text.current-date-highlight');
  if (dateCell instanceof HTMLElement) {
    const todayLabel = translate(getStoredLocale(), 'gantt.today');
    dateCell.classList.add('gantt-today-day');
    dateCell.setAttribute('title', todayLabel);
    dateCell.setAttribute('aria-label', todayLabel);
  }

  const highlight = container.querySelector('.current-highlight');
  const ball = container.querySelector('.current-ball-highlight');
  if (highlight instanceof HTMLElement) {
    highlight.style.display = '';
    highlight.style.top = `${GANTT_HEADER_HEIGHT}px`;
    highlight.style.height = '';
    highlight.style.bottom = '0';
    highlight.classList.add('gantt-today-line');
    highlight.setAttribute('aria-hidden', 'true');
  }

  if (ball instanceof HTMLElement && highlight instanceof HTMLElement) {
    const lineLeft = Number.parseFloat(highlight.style.left);
    const lineTop = Number.parseFloat(highlight.style.top);
    ball.style.display = '';
    ball.classList.add('gantt-today-ball');
    if (Number.isFinite(lineLeft)) {
      ball.style.left = `${lineLeft + TODAY_LINE_WIDTH_PX / 2 - TODAY_BALL_SIZE_PX / 2}px`;
    }
    if (Number.isFinite(lineTop)) {
      ball.style.top = `${lineTop - TODAY_BALL_SIZE_PX / 2}px`;
    }
    ball.setAttribute('aria-hidden', 'true');
  }
}
