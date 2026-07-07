import type { TaskItem } from '../types/project';
import { applyGanttBarResizeHandles } from './ganttBarResizeHandles';
import { argbToCss } from './colorUtils';
import { normalizeSummaryBarStyle } from './summaryBarStyle';

interface DecorateGanttBarsOptions {
  showCriticalPath?: boolean;
}

/** Matches MyProjectWinV10 AppTheme.TaskBarSummary */
export const SUMMARY_BAR_FILL = '#c4c8d6';
export const SUMMARY_BAR_PROGRESS = '#9ea4b2';
export const SUMMARY_BAR_OUTLINE = '#30343c';

/** Matches MyProjectWinV10 AppTheme.TaskBarNormal / TaskBarProgress */
export const NORMAL_BAR_FILL = '#a8d0f5';
export const NORMAL_BAR_PROGRESS = '#7ebdee';
export const NORMAL_BAR_OUTLINE = '#626874';

function finalizeOpaqueBarRect(rect: SVGRectElement): void {
  const animate = rect.querySelector('animate');
  if (animate) {
    const finalWidth = animate.getAttribute('to');
    if (finalWidth) rect.setAttribute('width', finalWidth);
    animate.remove();
  }

  rect.setAttribute('opacity', '1');
  rect.setAttribute('fill-opacity', '1');
  rect.style.opacity = '';
}

function getTaskProgressPercent(task: TaskItem): number {
  return Math.round(Math.max(0, Math.min(100, task.progress)));
}

/** At 0% only the base bar color should show — hide frappe's progress overlay. */
function applyProgressOverlayVisibility(
  wrapper: Element,
  barGroup: Element,
  progress: number,
): void {
  const barProgress = barGroup.querySelector('.bar-progress');
  wrapper.classList.toggle('gantt-zero-progress', progress <= 0);

  if (!(barProgress instanceof SVGRectElement)) return;

  if (progress <= 0) {
    barProgress.querySelector('animate')?.remove();
    barProgress.setAttribute('width', '0');
    barProgress.setAttribute('fill', 'none');
    barProgress.style.display = 'none';
    return;
  }

  barProgress.style.display = '';
}

function removeSummaryEndCaps(barGroup: Element): void {
  barGroup.querySelector('.gantt-summary-caps')?.remove();
}

function removeSummaryShapeDecorations(barGroup: Element): void {
  removeSummaryEndCaps(barGroup);
  barGroup.querySelector('.gantt-summary-brackets')?.remove();
  barGroup.querySelector('.gantt-summary-arrow')?.remove();
}

function getSummaryBarFill(task: TaskItem): string {
  if (task.barColorArgb == null) {
    return SUMMARY_BAR_FILL;
  }
  return argbToCss(task.barColorArgb) ?? SUMMARY_BAR_FILL;
}

function getSummaryProgressFill(task: TaskItem): string {
  if (task.progressColorArgb == null) {
    return SUMMARY_BAR_PROGRESS;
  }
  return argbToCss(task.progressColorArgb) ?? SUMMARY_BAR_PROGRESS;
}

function getTaskBarCornerRadius(barHeight: number): number {
  return Math.max(2, Math.min(Math.floor(barHeight / 2), 8));
}

function applySummaryBarColors(barGroup: Element, task: TaskItem): string {
  const bar = barGroup.querySelector('.bar');
  if (!(bar instanceof SVGGraphicsElement)) return SUMMARY_BAR_FILL;

  const fill = getSummaryBarFill(task);
  bar.setAttribute('fill', fill);
  bar.removeAttribute('stroke');

  const barProgress = barGroup.querySelector('.bar-progress');
  if (barProgress instanceof SVGRectElement) {
    const progress = getTaskProgressPercent(task);
    if (progress > 0) {
      barProgress.setAttribute('fill', getSummaryProgressFill(task));
    }
  }

  return fill;
}

function drawSummaryEndCaps(barGroup: Element, bar: SVGGraphicsElement, fill: string): void {
  const bbox = bar.getBBox();
  const { x, y, width, height } = bbox;

  removeSummaryEndCaps(barGroup);

  if (width < 8 || height < 6) return;

  let capWidth = Math.min(Math.max(4, Math.floor(height / 2)), 7);
  const capHeight = Math.min(Math.max(3, Math.floor(height / 3)), 5);
  capWidth = Math.min(capWidth, Math.floor(width / 2));

  // Sit flush under the bar body — do not overlap the rectangle fill.
  const capTop = y + height;
  const left = x;
  const right = x + width;

  const capsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  capsGroup.setAttribute('class', 'gantt-summary-caps');
  capsGroup.setAttribute('pointer-events', 'none');

  const leftCap = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  leftCap.setAttribute(
    'points',
    `${left},${capTop} ${left + capWidth},${capTop} ${left},${capTop + capHeight}`,
  );
  leftCap.setAttribute('fill', fill);
  leftCap.setAttribute('stroke', SUMMARY_BAR_OUTLINE);
  leftCap.setAttribute('stroke-width', '1');
  leftCap.setAttribute('stroke-linejoin', 'miter');
  capsGroup.appendChild(leftCap);

  const rightCap = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  rightCap.setAttribute(
    'points',
    `${right - capWidth},${capTop} ${right},${capTop} ${right},${capTop + capHeight}`,
  );
  rightCap.setAttribute('fill', fill);
  rightCap.setAttribute('stroke', SUMMARY_BAR_OUTLINE);
  rightCap.setAttribute('stroke-width', '1');
  rightCap.setAttribute('stroke-linejoin', 'miter');
  capsGroup.appendChild(rightCap);

  barGroup.appendChild(capsGroup);
}

function drawSummaryBracketCaps(barGroup: Element, bar: SVGGraphicsElement, fill: string): void {
  const bbox = bar.getBBox();
  const { x, y, width, height } = bbox;

  if (width < 8 || height < 6) return;

  const capHeight = Math.min(Math.max(3, Math.floor(height / 2)), 6);
  const capWidth = Math.min(Math.max(2, Math.floor(height / 3)), 4);
  const capTop = y + height - 1;

  const capsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  capsGroup.setAttribute('class', 'gantt-summary-brackets');
  capsGroup.setAttribute('pointer-events', 'none');

  const leftCap = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  leftCap.setAttribute('x', String(x));
  leftCap.setAttribute('y', String(capTop));
  leftCap.setAttribute('width', String(capWidth));
  leftCap.setAttribute('height', String(capHeight));
  leftCap.setAttribute('fill', fill);
  leftCap.setAttribute('stroke', SUMMARY_BAR_OUTLINE);
  leftCap.setAttribute('stroke-width', '1');
  capsGroup.appendChild(leftCap);

  const rightCap = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rightCap.setAttribute('x', String(x + width - capWidth - 1));
  rightCap.setAttribute('y', String(capTop));
  rightCap.setAttribute('width', String(capWidth));
  rightCap.setAttribute('height', String(capHeight));
  rightCap.setAttribute('fill', fill);
  rightCap.setAttribute('stroke', SUMMARY_BAR_OUTLINE);
  rightCap.setAttribute('stroke-width', '1');
  capsGroup.appendChild(rightCap);

  barGroup.appendChild(capsGroup);
}

function drawSummaryArrowShape(barGroup: Element, bar: SVGRectElement, fill: string): void {
  const x = Number(bar.getAttribute('x') ?? 0);
  const y = Number(bar.getAttribute('y') ?? 0);
  const width = Number(bar.getAttribute('width') ?? 0);
  const height = Number(bar.getAttribute('height') ?? 0);

  if (width < 8 || height < 6) return;

  let arrowWidth = Math.min(Math.max(4, Math.floor(height / 2)), 10);
  arrowWidth = Math.min(arrowWidth, Math.floor(width / 3));
  const midY = y + height / 2;

  const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  polygon.setAttribute('class', 'gantt-summary-arrow');
  polygon.setAttribute(
    'points',
    `${x},${y} ${x + width - arrowWidth},${y} ${x + width},${midY} ${x + width - arrowWidth},${y + height} ${x},${y + height}`,
  );
  polygon.setAttribute('fill', fill);
  polygon.setAttribute('stroke', SUMMARY_BAR_OUTLINE);
  polygon.setAttribute('stroke-width', '1');
  polygon.setAttribute('pointer-events', 'none');

  bar.setAttribute('fill', 'none');
  bar.setAttribute('stroke', 'none');
  barGroup.appendChild(polygon);
}

function decorateSummaryBarRounded(barGroup: Element, bar: SVGRectElement): void {
  const radius = getTaskBarCornerRadius(Number(bar.getAttribute('height') ?? 0));
  bar.setAttribute('rx', String(radius));
  bar.setAttribute('ry', String(radius));

  const barProgress = barGroup.querySelector('.bar-progress');
  if (barProgress instanceof SVGRectElement) {
    barProgress.setAttribute('rx', String(radius));
    barProgress.setAttribute('ry', String(radius));
  }
}

function applySummaryBarShape(barGroup: Element, task: TaskItem, fill: string): void {
  const bar = barGroup.querySelector('.bar');
  if (!(bar instanceof SVGGraphicsElement)) return;

  const style = normalizeSummaryBarStyle(task.summaryBarStyle);

  switch (style) {
    case 'Rounded':
      if (bar instanceof SVGRectElement) {
        decorateSummaryBarRounded(barGroup, bar);
      }
      break;
    case 'Bracket':
      drawSummaryBracketCaps(barGroup, bar, fill);
      break;
    case 'Arrow':
      if (bar instanceof SVGRectElement) {
        drawSummaryArrowShape(barGroup, bar, fill);
      }
      break;
    default:
      drawSummaryEndCaps(barGroup, bar, fill);
      break;
  }
}

function flattenSummaryBarCorners(barGroup: Element): void {
  barGroup.querySelectorAll('.bar, .bar-progress').forEach((element) => {
    if (element instanceof SVGRectElement) {
      element.setAttribute('rx', '0');
      element.setAttribute('ry', '0');
    }
  });
}

function decorateNormalBar(barGroup: Element, task: TaskItem): void {
  const bar = barGroup.querySelector('.bar');
  if (!(bar instanceof SVGRectElement)) return;

  if (task.barColorArgb == null) {
    bar.setAttribute('fill', NORMAL_BAR_FILL);
  } else {
    const custom = argbToCss(task.barColorArgb);
    if (custom) bar.setAttribute('fill', custom);
  }

  const barProgress = barGroup.querySelector('.bar-progress');
  if (barProgress instanceof SVGRectElement) {
    const progress = getTaskProgressPercent(task);
    if (progress > 0) {
      if (task.progressColorArgb == null) {
        barProgress.setAttribute('fill', NORMAL_BAR_PROGRESS);
      } else {
        const custom = argbToCss(task.progressColorArgb);
        if (custom) barProgress.setAttribute('fill', custom);
      }
    }
  }

  barGroup.querySelectorAll('.bar, .bar-progress').forEach((element) => {
    if (element instanceof SVGRectElement) finalizeOpaqueBarRect(element);
  });
}

function decorateSummaryBar(barGroup: Element, task: TaskItem): void {
  removeSummaryShapeDecorations(barGroup);
  flattenSummaryBarCorners(barGroup);

  const fill = applySummaryBarColors(barGroup, task);
  applySummaryBarShape(barGroup, task, fill);

  barGroup.querySelectorAll('.bar, .bar-progress').forEach((element) => {
    if (element instanceof SVGRectElement) finalizeOpaqueBarRect(element);
  });
}

function decorateProgressLabel(barGroup: Element, task: TaskItem, isSummary: boolean): void {
  const progress = getTaskProgressPercent(task);
  let label = barGroup.querySelector('.gantt-progress-label');

  if (progress <= 0) {
    label?.remove();
    return;
  }

  const bar = barGroup.querySelector('.bar');
  if (!(bar instanceof SVGGraphicsElement)) return;

  const x = Number(bar.getAttribute('x') ?? 0);
  const y = Number(bar.getAttribute('y') ?? 0);
  const width = Number(bar.getAttribute('width') ?? 0);
  const height = Number(bar.getAttribute('height') ?? 0);
  if (width < 28) {
    label?.remove();
    return;
  }

  if (!label) {
    label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('class', 'gantt-progress-label');
    barGroup.appendChild(label);
  }

  label.setAttribute('x', String(x + width / 2));
  label.setAttribute('y', String(y + height / 2));
  label.classList.toggle('gantt-progress-label-summary', isSummary);
  label.textContent = `${progress}%`;
}

export function decorateGanttBars(
  container: HTMLElement,
  tasks: TaskItem[],
  options: DecorateGanttBarsOptions = {},
): void {
  container.querySelectorAll('.ignored-bar, .holiday-highlight').forEach((element) => {
    if (element instanceof SVGElement) {
      element.style.pointerEvents = 'none';
    }
  });

  const taskById = new Map(tasks.map((task) => [task.taskId, task]));
  const showCriticalPath = options.showCriticalPath ?? false;

  container.querySelectorAll('.bar-wrapper').forEach((wrapper) => {
    const taskId = Number(wrapper.getAttribute('data-id'));
    const task = taskById.get(taskId);
    if (!task) return;

    const isSummary = task.taskType === 'Summary';

    const highlightCritical =
      !isSummary &&
      showCriticalPath &&
      task.isCritical &&
      task.taskType !== 'Milestone' &&
      task.barColorArgb == null;
    wrapper.classList.toggle('gantt-critical', highlightCritical);

    const barGroup = wrapper.querySelector('.bar-group');
    if (!barGroup) return;

    if (isSummary) {
      decorateSummaryBar(barGroup, task);
    } else if (task.taskType !== 'Milestone') {
      removeSummaryEndCaps(barGroup);
      decorateNormalBar(barGroup, task);
    } else {
      removeSummaryEndCaps(barGroup);
      barGroup.querySelectorAll('.bar, .bar-progress').forEach((element) => {
        if (element instanceof SVGRectElement) finalizeOpaqueBarRect(element);
      });
    }

    applyProgressOverlayVisibility(wrapper, barGroup, getTaskProgressPercent(task));
    decorateProgressLabel(barGroup, task, isSummary);
  });

  applyGanttBarResizeHandles(container);
}
