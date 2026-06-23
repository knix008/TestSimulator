/** Layout aligned with MyProjectWinV10 AppTheme (RowHeight 32, TimescaleHeaderHeight 62). */
export const GANTT_BAR_HEIGHT = 22;
export const GANTT_ROW_PADDING = 10;
export const GANTT_ROW_HEIGHT = GANTT_BAR_HEIGHT + GANTT_ROW_PADDING;
export const GANTT_UPPER_HEADER_HEIGHT = 22;
export const GANTT_LOWER_HEADER_HEIGHT = 30;
export const GANTT_HEADER_HEIGHT =
  GANTT_UPPER_HEADER_HEIGHT + GANTT_LOWER_HEADER_HEIGHT + 10;

/** Height of the dedicated horizontal scrollbar under the gantt pane. */
export const GANTT_HSCROLL_HEIGHT = 14;

export function getGanttContentHeight(taskCount: number): number {
  if (taskCount <= 0) return GANTT_HEADER_HEIGHT;
  return GANTT_HEADER_HEIGHT + taskCount * GANTT_ROW_HEIGHT;
}

/** Matches MyProjectWinV10 AppTheme.DefaultDayWidth and GanttViewport limits. */
export const GANTT_DEFAULT_COLUMN_WIDTH = 22;
export const GANTT_MIN_COLUMN_WIDTH = 4;
export const GANTT_MAX_COLUMN_WIDTH = 120;
export const GANTT_ZOOM_FACTOR = 1.3;

export const GANTT_CHART_OPTIONS = {
  bar_height: GANTT_BAR_HEIGHT,
  padding: GANTT_ROW_PADDING,
  upper_header_height: GANTT_UPPER_HEADER_HEIGHT,
  lower_header_height: GANTT_LOWER_HEADER_HEIGHT,
  column_width: GANTT_DEFAULT_COLUMN_WIDTH,
  infinite_padding: false,
  /** Open on project timeline start; use toolbar "오늘로 이동" to jump to today. */
  scroll_to: 'start' as const,
  today_button: false,
} as const;
