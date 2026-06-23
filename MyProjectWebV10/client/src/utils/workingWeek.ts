/** Seven flags: index 0 = Sunday … 6 = Saturday (matches MyProjectWinV10). */
export type WorkingWeek = boolean[];

export const WORKING_DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

const DEFAULT_WORKING_WEEK: WorkingWeek = [
  false,
  true,
  true,
  true,
  true,
  true,
  false,
];

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
        if (index >= 0 && index <= 6) {
          days[index] = true;
        }
      }
      return days;
    }
  } catch {
    /* use default */
  }

  return defaultWorkingWeek();
}

export function serializeWorkingWeek(week: WorkingWeek): string {
  return JSON.stringify(week);
}

export function workingWeeksEqual(a: WorkingWeek, b: WorkingWeek): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function hasAtLeastOneWorkingDay(week: WorkingWeek): boolean {
  return week.some(Boolean);
}

export function usesCompressedTimeline(week: WorkingWeek): boolean {
  return week.some((isWorking) => !isWorking);
}

export function isWorkingDay(date: Date, schedule: WorkingWeek): boolean {
  return schedule[date.getDay()] ?? false;
}