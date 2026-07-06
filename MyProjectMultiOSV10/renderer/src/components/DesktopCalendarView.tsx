import { useMemo } from 'react';
import type { TaskItem } from '@web/types/project';
import { useLanguage } from '@web/i18n';
import './DesktopCalendarView.css';

interface DesktopCalendarViewProps {
  tasks: TaskItem[];
  projectStart: string;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function DesktopCalendarView({ tasks, projectStart }: DesktopCalendarViewProps) {
  const { locale } = useLanguage();
  const monthStart = useMemo(() => startOfMonth(new Date(projectStart)), [projectStart]);
  const monthEnd = useMemo(() => addMonths(monthStart, 1), [monthStart]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, TaskItem[]>();
    for (const task of tasks) {
      const start = new Date(task.startDate);
      const end = new Date(task.endDate);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().slice(0, 10);
        const list = map.get(key) ?? [];
        list.push(task);
        map.set(key, list);
      }
    }
    return map;
  }, [tasks]);

  const weeks: Date[][] = [];
  const cursor = new Date(monthStart);
  cursor.setDate(cursor.getDate() - cursor.getDay());
  while (cursor < monthEnd || cursor.getDay() !== 0) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
    if (cursor >= monthEnd && cursor.getDay() === 0) break;
  }

  const weekdayLabels =
    locale === 'en'
      ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      : ['일', '월', '화', '수', '목', '금', '토'];

  return (
    <div className="desktop-calendar-view">
      <header className="desktop-calendar-view__header">
        {monthStart.toLocaleDateString(locale === 'en' ? 'en-US' : 'ko-KR', {
          year: 'numeric',
          month: 'long',
        })}
      </header>
      <div className="desktop-calendar-view__grid">
        {weekdayLabels.map((label) => (
          <div key={label} className="desktop-calendar-view__weekday">
            {label}
          </div>
        ))}
        {weeks.flatMap((week) =>
          week.map((day) => {
            const key = day.toISOString().slice(0, 10);
            const dayTasks = tasksByDay.get(key) ?? [];
            const inMonth = day.getMonth() === monthStart.getMonth();
            const today = sameDay(day, new Date());
            return (
              <div
                key={key}
                className={[
                  'desktop-calendar-view__day',
                  inMonth ? '' : 'is-outside',
                  today ? 'is-today' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className="desktop-calendar-view__day-number">{day.getDate()}</div>
                <ul className="desktop-calendar-view__tasks">
                  {dayTasks.slice(0, 3).map((task) => (
                    <li key={`${key}-${task.taskId}`} title={task.name}>
                      {task.name}
                    </li>
                  ))}
                  {dayTasks.length > 3 && (
                    <li className="desktop-calendar-view__more">+{dayTasks.length - 3}</li>
                  )}
                </ul>
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}
