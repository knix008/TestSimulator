/** Gantt timescale header: year+month upper row, day+weekday lower row, non-working day colors. */

import { getStoredLocale } from '../i18n/storage';
import { getWeekdayShortLabels } from '../i18n/translate';
import { isWorkingDay, parseWorkingWeek } from './workingWeek';

export interface FrappeGanttHeaderApi {
  gantt_start: Date;
  config: { column_width: number };
}

const UPPER_LEFT_DATA_KEY = 'ganttUpperLeft';
const DEFAULT_UPPER_WIDTH = 96;

function getFrappeScrollContainer(container: HTMLElement): HTMLElement | null {
  return container.querySelector(':scope > .gantt-container');
}

function getHeaderRoot(container: HTMLElement): HTMLElement {
  return getFrappeScrollContainer(container) ?? container;
}

function visibleScrollMetrics(container: HTMLElement) {
  const scrollHost = getFrappeScrollContainer(container) ?? container;
  const scrollLeft = scrollHost.scrollLeft;
  const viewportWidth = scrollHost.clientWidth;
  return { scrollLeft, viewportWidth };
}

function parseLowerTextDate(node: HTMLElement): Date | null {
  for (const cls of node.classList) {
    const match = /^date_(\d{4})-(\d{2})-(\d{2})$/.exec(cls);
    if (!match) continue;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) continue;
    return new Date(year, month - 1, day);
  }

  const fromClassName = /date_(\d{4})-(\d{2})-(\d{2})/.exec(node.className);
  if (!fromClassName) return null;
  const year = Number(fromClassName[1]);
  const month = Number(fromClassName[2]);
  const day = Number(fromClassName[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return new Date(year, month - 1, day);
}

function getUpperTextOriginalLeft(node: HTMLElement): number | null {
  const parsed = Number.parseFloat(node.style.left);
  if (Number.isFinite(parsed)) {
    node.dataset[UPPER_LEFT_DATA_KEY] = String(parsed);
    return parsed;
  }

  const stored = Number.parseFloat(node.dataset[UPPER_LEFT_DATA_KEY] ?? '');
  return Number.isFinite(stored) ? stored : null;
}

function measureUpperTextWidth(node: HTMLElement): number {
  const measured = Math.max(node.offsetWidth, node.scrollWidth);
  if (measured > 0) return measured;
  const textLen = node.textContent?.trim().length ?? 0;
  return Math.max(DEFAULT_UPPER_WIDTH, textLen * 9);
}

function decorateLowerTextWeekdays(container: HTMLElement, workingDaysJson?: string): void {
  const weekdayLabels = getWeekdayShortLabels(getStoredLocale());
  const workingWeek = parseWorkingWeek(workingDaysJson ?? '[]');

  container.querySelectorAll('.lower-text').forEach((node) => {
    if (!(node instanceof HTMLElement)) return;

    const date = parseLowerTextDate(node);
    if (!date) return;

    const dayNum = String(date.getDate());
    const weekday = weekdayLabels[date.getDay()] ?? '';
    const isNonWorking = !isWorkingDay(date, workingWeek);

    node.classList.add('gantt-lower-decorated');
    node.classList.toggle('gantt-weekend-day', isNonWorking);
    node.innerHTML =
      `<span class="gantt-day-num">${dayNum}</span>` +
      `<span class="gantt-weekday">${weekday}</span>`;
  });
}

function pickStickyUpperLabel(
  labels: Array<{ node: HTMLElement; left: number }>,
  viewStart: number,
  viewEnd: number,
): HTMLElement | null {
  let sticky: HTMLElement | null = null;
  let stickyLeft = -Infinity;

  for (const label of labels) {
    if (label.left <= viewStart && label.left > stickyLeft) {
      stickyLeft = label.left;
      sticky = label.node;
    }
  }

  if (sticky) return sticky;

  for (const label of labels) {
    if (label.left >= viewStart && label.left < viewEnd) {
      return label.node;
    }
  }

  return labels[0]?.node ?? null;
}

function decorateUpperTextVisibility(container: HTMLElement, viewStart: number, viewEnd: number): void {
  const labels: Array<{ node: HTMLElement; left: number }> = [];

  container.querySelectorAll('.upper-text').forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    const left = getUpperTextOriginalLeft(node);
    if (left == null) return;
    labels.push({ node, left });
  });

  labels.sort((a, b) => a.left - b.left);

  const stickyLabel = pickStickyUpperLabel(labels, viewStart, viewEnd);
  const stickyWidth = stickyLabel ? measureUpperTextWidth(stickyLabel) + 8 : 0;
  const stickyZoneEnd = viewStart + stickyWidth;

  for (const { node, left } of labels) {
    node.classList.remove('current-upper');

    const width = measureUpperTextWidth(node);
    const overlapsViewport = left + width > viewStart && left < viewEnd;

    if (node === stickyLabel) {
      node.classList.add('current-upper');
      node.style.left = `${viewStart}px`;
      node.style.visibility = 'visible';
      node.style.display = '';
      continue;
    }

    node.style.left = `${left}px`;

    const overlapsStickyZone = left < stickyZoneEnd && left + width > viewStart;
    const show = overlapsViewport && !overlapsStickyZone;
    node.style.visibility = show ? 'visible' : 'hidden';
    node.style.display = show ? '' : 'none';
  }
}

export function decorateGanttHeader(
  container: HTMLElement,
  gantt: FrappeGanttHeaderApi,
  workingDaysJson?: string,
): void {
  const columnWidth = gantt.config.column_width;
  if (columnWidth <= 0) return;

  const headerRoot = getHeaderRoot(container);
  decorateLowerTextWeekdays(headerRoot, workingDaysJson);

  const { scrollLeft, viewportWidth } = visibleScrollMetrics(container);
  if (viewportWidth <= 0) return;

  decorateUpperTextVisibility(headerRoot, scrollLeft, scrollLeft + viewportWidth);
}

export function bindGanttHeaderScroll(
  container: HTMLElement,
  gantt: FrappeGanttHeaderApi,
  workingDaysJson?: string,
): () => void {
  const scrollHost = getFrappeScrollContainer(container) ?? container;
  const onScroll = () => decorateGanttHeader(container, gantt, workingDaysJson);

  scrollHost.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  return () => scrollHost.removeEventListener('scroll', onScroll);
}
