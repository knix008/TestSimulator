import { isWorkingDay, type WorkingWeek } from './workingWeek';
import { startOfDay } from './scheduleUtils';

export function snapToNextWorkingDay(date: Date, schedule: WorkingWeek): Date {
  const d = startOfDay(date);
  while (!isWorkingDay(d, schedule)) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

export function countWorkingDaysInclusive(from: Date, to: Date, schedule: WorkingWeek): number {
  let start = startOfDay(from);
  let end = startOfDay(to);
  if (end < start) {
    [start, end] = [end, start];
  }

  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    if (isWorkingDay(cursor, schedule)) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

export function getWorkingDayIndex(origin: Date, date: Date, schedule: WorkingWeek): number {
  const originDay = startOfDay(origin);
  const target = startOfDay(date);
  if (target < originDay) return 0;
  return countWorkingDaysInclusive(originDay, target, schedule) - 1;
}

export function addWorkingDays(start: Date, workingDays: number, schedule: WorkingWeek): Date {
  if (workingDays === 0) return startOfDay(start);

  const step = workingDays > 0 ? 1 : -1;
  let remaining = Math.abs(workingDays);
  const d = startOfDay(start);

  while (remaining > 0) {
    d.setDate(d.getDate() + step);
    if (isWorkingDay(d, schedule)) remaining--;
  }

  return d;
}

export function getTaskEndDate(startDate: Date, durationDays: number, schedule: WorkingWeek): Date {
  if (durationDays <= 0) return startOfDay(startDate);
  return addWorkingDays(startDate, durationDays - 1, schedule);
}
