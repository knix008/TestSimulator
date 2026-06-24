import { parseWorkingWeek, type WorkingWeek } from './workingWeek.js';

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function countWorkingDaysInclusive(from: Date, to: Date, schedule: WorkingWeek): number {
  let start = startOfDay(from);
  let end = startOfDay(to);
  if (end < start) [start, end] = [end, start];
  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    if (schedule[cursor.getDay()]) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

export function workingDaysBetween(startDate: Date, endDate: Date, workingDaysJson: string): number {
  const week = parseWorkingWeek(workingDaysJson);
  return Math.max(1, countWorkingDaysInclusive(startDate, endDate, week));
}
