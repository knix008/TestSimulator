import { isWorkingDay, parseWorkingWeek, usesCompressedTimeline } from './workingWeek';

export function getGanttWorkingWeekOptions(workingDaysJson: string): {
  ignore?: (date: Date) => boolean;
} {
  const week = parseWorkingWeek(workingDaysJson);
  if (!usesCompressedTimeline(week)) {
    return {};
  }

  return {
    ignore: (date: Date) => !isWorkingDay(date, week),
  };
}
