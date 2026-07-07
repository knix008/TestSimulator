export type SummaryBarStyle = 'Standard' | 'Rounded' | 'Bracket' | 'Arrow';

export const SUMMARY_BAR_STYLES: SummaryBarStyle[] = [
  'Standard',
  'Rounded',
  'Bracket',
  'Arrow',
];

export function normalizeSummaryBarStyle(value: string | null | undefined): SummaryBarStyle {
  if (value === 'Rounded' || value === 'Bracket' || value === 'Arrow') {
    return value;
  }
  return 'Standard';
}

export function summaryBarStyleToFileValue(
  value: SummaryBarStyle | null | undefined,
): SummaryBarStyle | null {
  const normalized = normalizeSummaryBarStyle(value ?? undefined);
  return normalized === 'Standard' ? null : normalized;
}
