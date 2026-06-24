export type WorkingWeek = boolean[];

const DEFAULT_WORKING_WEEK: WorkingWeek = [false, true, true, true, true, true, false];

export function defaultWorkingWeek(): WorkingWeek {
  return [...DEFAULT_WORKING_WEEK];
}

export function parseWorkingWeek(workingDaysJson: string): WorkingWeek {
  try {
    const parsed: unknown = JSON.parse(workingDaysJson);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return defaultWorkingWeek();
    }
    if (parsed.length === 7 && typeof parsed[0] === 'boolean') {
      return [...(parsed as WorkingWeek)];
    }
    if (parsed.every((value) => typeof value === 'number')) {
      const days: WorkingWeek = [false, false, false, false, false, false, false];
      for (const value of parsed) {
        const index = value as number;
        if (index >= 0 && index <= 6) days[index] = true;
      }
      return days;
    }
  } catch {
    /* use default */
  }
  return defaultWorkingWeek();
}

export function isWorkingDay(date: Date, schedule: WorkingWeek): boolean {
  return schedule[date.getDay()] ?? false;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
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

export function computeTaskEndDate(
  startDate: Date,
  durationDays: number,
  taskType: string,
  workingDaysJson: string,
): Date {
  if (taskType === 'Milestone') return startOfDay(startDate);
  const week = parseWorkingWeek(workingDaysJson);
  return getTaskEndDate(startOfDay(startDate), Math.max(1, durationDays), week);
}
