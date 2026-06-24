/** Custom Day view: month+year upper labels, date + weekday on lower row. */

import { getDateLocaleTag, getWeekdayShortLabels } from '../i18n/translate';
import type { AppLocale } from '../i18n/types';

function formatMonthYear(date: Date, locale: AppLocale): string {
  return date.toLocaleDateString(getDateLocaleTag(locale), { year: 'numeric', month: 'long' });
}

export function createGanttViewModes(locale: AppLocale) {
  const weekdayLabels = getWeekdayShortLabels(locale);

  function formatDayWeekday(date: Date): string {
    const day = String(date.getDate());
    const weekday = weekdayLabels[date.getDay()] ?? '';
    return `${day}\n${weekday}`;
  }

  const dayViewMode = {
    name: 'Day',
    padding: '7d',
    date_format: 'YYYY-MM-DD',
    step: '1d',
    lower_text: (date: Date) => formatDayWeekday(date),
    upper_text: (date: Date, lastDate: Date | null) => {
      if (
        lastDate &&
        date.getMonth() === lastDate.getMonth() &&
        date.getFullYear() === lastDate.getFullYear()
      ) {
        return '';
      }
      return formatMonthYear(date, locale);
    },
    thick_line: (date: Date) => date.getDay() === 1,
  } as const;

  return [dayViewMode];
}

/** @deprecated Use createGanttViewModes(locale) */
export const GANTT_DAY_VIEW_MODE = createGanttViewModes('ko')[0];
/** @deprecated Use createGanttViewModes(locale) */
export const GANTT_VIEW_MODES = createGanttViewModes('ko');
