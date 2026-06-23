import { startOfDay } from './scheduleUtils';

export function toDateInputValue(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDateInputValue(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return startOfDay(new Date(y, m - 1, d));
}
