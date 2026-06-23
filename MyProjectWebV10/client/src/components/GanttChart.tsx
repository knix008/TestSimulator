import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import Gantt from 'frappe-gantt';
import {
  GANTT_CHART_OPTIONS,
  GANTT_DEFAULT_COLUMN_WIDTH,
  getGanttContentHeight,
} from '../config/ganttLayout';
import type { DependencyItem, GanttViewSettings, TaskItem } from '../types/project';
import { argbToCss } from '../utils/colorUtils';
import { getVisibleTasks } from '../utils/taskModel';
import { decorateGanttBars } from '../utils/ganttBarDecorations';
import { renderDependencyLines, type FrappeGanttLayers } from '../utils/dependencyLineRenderer';
import { applyGanttZoomAtPointer, type GanttZoomTarget } from '../utils/ganttZoom';
import { ensureGanttTimelineRange } from '../utils/ganttTimeline';
import { getGanttWorkingWeekOptions } from '../utils/ganttWorkingWeek';
import { decorateTodayMarker, scrollGanttToToday } from '../utils/ganttToday';
import '../../../node_modules/frappe-gantt/dist/frappe-gantt.css';
import './GanttChart.css';

interface FrappeTask {
  id: string;
  name: string;
  start: string;
  end: string;
  progress: number;
  dependencies?: string;
  custom_class?: string;
  color?: string;
  color_progress?: string;
}

interface GanttChartProps {
  tasks: TaskItem[];
  dependencies: DependencyItem[];
  workingDaysJson: string;
  ganttViewSettings: GanttViewSettings;
  selectedTaskId: number | null;
  canModify: boolean;
  linkMode: boolean;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
  scrollToTodayRef?: RefObject<(() => boolean) | null>;
  onSelectTask: (taskId: number) => void;
  onTaskDateChange: (taskId: number, start: Date, end: Date) => void;
  onTaskProgressChange: (taskId: number, progress: number) => void;
  onAddDependency: (predecessorId: number, successorId: number) => void;
}

function getGanttContainerHeight(taskCount: number): number {
  return getGanttContentHeight(taskCount);
}

type FrappeGanttInstance = InstanceType<typeof Gantt> & {
  options: { container_height: number | 'auto' };
};

function applyGanttContainerHeight(
  gantt: FrappeGanttInstance | null,
  taskCount: number,
): void {
  if (!gantt) return;
  gantt.options.container_height = getGanttContainerHeight(taskCount);
}

function scrollSelectedTaskIntoView(
  scrollArea: HTMLElement,
  container: HTMLElement,
  taskId: number,
): void {
  const wrapper = container.querySelector(`.bar-wrapper[data-id="${taskId}"]`);
  if (!wrapper) return;

  const scrollRect = scrollArea.getBoundingClientRect();
  const rowRect = wrapper.getBoundingClientRect();
  const rowTop = rowRect.top - scrollRect.top + scrollArea.scrollTop;
  const rowBottom = rowTop + rowRect.height;
  const viewTop = scrollArea.scrollTop;
  const viewBottom = viewTop + scrollArea.clientHeight;

  if (rowTop < viewTop) {
    scrollArea.scrollTop = rowTop;
  } else if (rowBottom > viewBottom) {
    scrollArea.scrollTop = rowBottom - scrollArea.clientHeight;
  }
}

function toGanttTasks(tasks: TaskItem[]): FrappeTask[] {
  return tasks.map((task) => {
    const start = task.startDate.slice(0, 10);
    const end = task.endDate.slice(0, 10);
    const barColor = argbToCss(task.barColorArgb);
    const progressColor = argbToCss(task.progressColorArgb);

    return {
      id: String(task.taskId),
      name: task.name,
      start,
      end: task.taskType === 'Milestone' ? start : end,
      progress: Math.max(0, Math.min(100, task.progress)),
      custom_class:
        task.taskType === 'Milestone'
          ? 'gantt-milestone'
          : task.taskType === 'Summary'
            ? 'gantt-summary'
            : undefined,
      color: barColor,
      color_progress: progressColor ?? (barColor ? undefined : '#7ebdee'),
    };
  });
}

function getScrollArea(container: HTMLElement): HTMLElement {
  return container.closest('.gantt-scroll') ?? container;
}

function toOverlayPoint(
  scrollArea: HTMLElement,
  container: HTMLElement,
  clientX: number,
  clientY: number,
) {
  const rect = scrollArea.getBoundingClientRect();
  const frappeScroll = getFrappeScrollContainer(container);
  return {
    x: clientX - rect.left + (frappeScroll?.scrollLeft ?? 0),
    y: clientY - rect.top + scrollArea.scrollTop,
  };
}

function getBarEndPoint(container: HTMLElement, taskId: number): { x: number; y: number } | null {
  const wrapper = container.querySelector(`.bar-wrapper[data-id="${taskId}"]`);
  const bar = wrapper?.querySelector('.bar');
  if (!bar || !(bar instanceof SVGGraphicsElement)) return null;

  const scrollArea = getScrollArea(container);
  const frappeScroll = getFrappeScrollContainer(container);
  const scrollRect = scrollArea.getBoundingClientRect();
  const barRect = bar.getBoundingClientRect();
  return {
    x: barRect.right - scrollRect.left + (frappeScroll?.scrollLeft ?? 0),
    y: barRect.top - scrollRect.top + barRect.height / 2 + scrollArea.scrollTop,
  };
}

function findTaskIdFromTarget(container: HTMLElement, target: EventTarget | null): number | null {
  if (!(target instanceof Element)) return null;
  const wrapper = target.closest('.bar-wrapper');
  if (!wrapper || !container.contains(wrapper)) return null;
  const id = wrapper.getAttribute('data-id');
  return id ? Number(id) : null;
}

function getFrappeScrollContainer(container: HTMLElement): HTMLElement | null {
  return container.querySelector(':scope > .gantt-container');
}

export function GanttChart({
  tasks,
  dependencies,
  workingDaysJson,
  ganttViewSettings,
  selectedTaskId,
  canModify,
  linkMode,
  scrollContainerRef,
  scrollToTodayRef,
  onSelectTask,
  onTaskDateChange,
  onTaskProgressChange,
  onAddDependency,
}: GanttChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingHScrollRef = useRef(false);
  const overlayRef = useRef<SVGSVGElement>(null);
  const ganttRef = useRef<InstanceType<typeof Gantt> | null>(null);
  const columnWidthRef = useRef(GANTT_DEFAULT_COLUMN_WIDTH);
  const skipRefreshRef = useRef(false);
  const tasksRef = useRef(tasks);
  const visibleTasks = useMemo(() => getVisibleTasks(tasks), [tasks]);
  const visibleTasksRef = useRef(visibleTasks);
  const dependenciesRef = useRef(dependencies);
  const workingDaysJsonRef = useRef(workingDaysJson);
  const viewSettingsRef = useRef(ganttViewSettings);
  const canModifyRef = useRef(canModify);
  const linkModeRef = useRef(linkMode);
  const linkSourceRef = useRef<number | null>(null);
  const linkDragRef = useRef<{ fromId: number } | null>(null);

  const onSelectTaskRef = useRef(onSelectTask);
  const onTaskDateChangeRef = useRef(onTaskDateChange);
  const onTaskProgressChangeRef = useRef(onTaskProgressChange);
  const onAddDependencyRef = useRef(onAddDependency);

  tasksRef.current = tasks;
  visibleTasksRef.current = visibleTasks;
  dependenciesRef.current = dependencies;
  workingDaysJsonRef.current = workingDaysJson;
  viewSettingsRef.current = ganttViewSettings;
  onSelectTaskRef.current = onSelectTask;
  onTaskDateChangeRef.current = onTaskDateChange;
  onTaskProgressChangeRef.current = onTaskProgressChange;
  onAddDependencyRef.current = onAddDependency;
  canModifyRef.current = canModify;
  linkModeRef.current = linkMode;

  const renderDependencyOverlay = useCallback(() => {
    const container = containerRef.current;
    const gantt = ganttRef.current as FrappeGanttLayers | null;
    if (!container || !gantt) return;
    renderDependencyLines(
      gantt,
      container,
      dependenciesRef.current,
      tasksRef.current,
      viewSettingsRef.current,
    );
  }, []);

  const decorateBars = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    decorateGanttBars(container, tasksRef.current, {
      showCriticalPath: viewSettingsRef.current.showCriticalPath,
    });
    decorateTodayMarker(container);
  }, []);

  const syncOverlaySize = useCallback(() => {
    const container = containerRef.current;
    const overlay = overlayRef.current;
    if (!container || !overlay) return;
    overlay.setAttribute('width', String(container.scrollWidth));
    overlay.setAttribute('height', String(container.scrollHeight));
  }, []);

  const syncHorizontalScrollWidth = useCallback(() => {
    const mount = containerRef.current;
    const hScroll = hScrollRef.current;
    const frappeScroll = mount ? getFrappeScrollContainer(mount) : null;
    const spacer = hScroll?.querySelector('.gantt-hscroll-spacer');
    if (!frappeScroll || !hScroll || !(spacer instanceof HTMLElement)) return;
    spacer.style.width = `${frappeScroll.scrollWidth}px`;
  }, []);

  const syncFrappeFromHScroll = useCallback(() => {
    if (isSyncingHScrollRef.current) return;
    const mount = containerRef.current;
    const hScroll = hScrollRef.current;
    const frappeScroll = mount ? getFrappeScrollContainer(mount) : null;
    if (!frappeScroll || !hScroll) return;
    isSyncingHScrollRef.current = true;
    frappeScroll.scrollLeft = hScroll.scrollLeft;
    isSyncingHScrollRef.current = false;
    renderDependencyOverlay();
    decorateBars();
    syncOverlaySize();
  }, [decorateBars, renderDependencyOverlay, syncOverlaySize]);

  const syncHScrollFromFrappe = useCallback(() => {
    if (isSyncingHScrollRef.current) return;
    const mount = containerRef.current;
    const hScroll = hScrollRef.current;
    const frappeScroll = mount ? getFrappeScrollContainer(mount) : null;
    if (!frappeScroll || !hScroll) return;
    isSyncingHScrollRef.current = true;
    hScroll.scrollLeft = frappeScroll.scrollLeft;
    isSyncingHScrollRef.current = false;
  }, []);

  const scrollToToday = useCallback(() => {
    const scrolled = scrollGanttToToday(ganttRef.current);
    if (scrolled) {
      window.setTimeout(() => {
        syncHScrollFromFrappe();
        renderDependencyOverlay();
        decorateBars();
      }, 350);
    }
    return scrolled;
  }, [decorateBars, renderDependencyOverlay, syncHScrollFromFrappe]);

  useEffect(() => {
    if (!scrollToTodayRef) return;
    scrollToTodayRef.current = scrollToToday;
    return () => {
      scrollToTodayRef.current = null;
    };
  }, [scrollToToday, scrollToTodayRef]);

  const applyTimelineRange = useCallback(() => {
    const gantt = ganttRef.current;
    const mount = containerRef.current;
    const frappeScroll = mount ? getFrappeScrollContainer(mount) : null;
    const hScroll = hScrollRef.current;
    if (!gantt || !frappeScroll) return false;

    const viewportWidth = frappeScroll.clientWidth || hScroll?.clientWidth || 0;
    const previousStart = new Date(gantt.gantt_start);
    const scrollLeft = frappeScroll.scrollLeft;
    const changed = ensureGanttTimelineRange(gantt, tasksRef.current, viewportWidth);
    if (changed) {
      const startShiftMs = previousStart.getTime() - gantt.gantt_start.getTime();
      if (startShiftMs > 0) {
        const addedDays = Math.round(startShiftMs / 86_400_000);
        frappeScroll.scrollLeft = scrollLeft + addedDays * gantt.config.column_width;
      } else {
        frappeScroll.scrollLeft = scrollLeft;
      }
    }
    return changed;
  }, []);

  const clearLinkLine = useCallback(() => {
    overlayRef.current?.querySelectorAll('.gantt-link-line').forEach((line) => line.remove());
  }, []);

  const drawLinkLine = useCallback(
    (fromId: number, toX: number, toY: number) => {
      const container = containerRef.current;
      const overlay = overlayRef.current;
      if (!container || !overlay) return;

      syncOverlaySize();
      const from = getBarEndPoint(container, fromId);
      if (!from) return;

      clearLinkLine();
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('class', 'gantt-link-line');
      line.setAttribute('x1', String(from.x));
      line.setAttribute('y1', String(from.y));
      line.setAttribute('x2', String(toX));
      line.setAttribute('y2', String(toY));
      overlay.appendChild(line);
    },
    [clearLinkLine, syncOverlaySize],
  );

  const updateLinkPendingStyles = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    container.querySelectorAll('.bar-wrapper').forEach((el) => {
      el.classList.remove('gantt-link-pending');
    });
    if (linkSourceRef.current != null) {
      container
        .querySelector(`.bar-wrapper[data-id="${linkSourceRef.current}"]`)
        ?.classList.add('gantt-link-pending');
    }
  }, []);

  const completeLink = useCallback(
    (predecessorId: number, successorId: number) => {
      if (predecessorId === successorId) return;
      onAddDependencyRef.current(predecessorId, successorId);
      linkSourceRef.current = null;
      clearLinkLine();
      updateLinkPendingStyles();
    },
    [clearLinkLine, updateLinkPendingStyles],
  );

  const handleLinkClick = useCallback((taskId: number) => {
    if (!canModifyRef.current) return;

    if (linkSourceRef.current == null) {
      linkSourceRef.current = taskId;
      onSelectTaskRef.current(taskId);
      updateLinkPendingStyles();
      return;
    }

    if (linkSourceRef.current === taskId) {
      linkSourceRef.current = null;
      clearLinkLine();
      updateLinkPendingStyles();
      return;
    }

    completeLink(linkSourceRef.current, taskId);
    onSelectTaskRef.current(taskId);
  }, [clearLinkLine, completeLink, updateLinkPendingStyles]);

  const mountGantt = useCallback(() => {
    const container = containerRef.current;
    if (!container || visibleTasksRef.current.length === 0) return;

    container.innerHTML = '';
    ganttRef.current = new Gantt(container, toGanttTasks(visibleTasksRef.current), {
      view_mode: 'Day',
      ...GANTT_CHART_OPTIONS,
      ...getGanttWorkingWeekOptions(workingDaysJsonRef.current),
      column_width: columnWidthRef.current,
      container_height: getGanttContainerHeight(visibleTasksRef.current.length),
      readonly: !canModifyRef.current,
      readonly_dates: !canModifyRef.current,
      readonly_progress: !canModifyRef.current,
      move_dependencies: false,
      on_click: (task: { id: string }) => {
        const taskId = Number(task.id);
        if (linkModeRef.current && canModifyRef.current) {
          handleLinkClick(taskId);
          return;
        }
        onSelectTaskRef.current(taskId);
      },
      on_date_change: (task: { id: string }, start: Date, end: Date) => {
        skipRefreshRef.current = true;
        onTaskDateChangeRef.current(Number(task.id), start, end);
      },
      on_progress_change: (task: { id: string }, progress: number) => {
        skipRefreshRef.current = true;
        onTaskProgressChangeRef.current(Number(task.id), progress);
      },
    });
    syncOverlaySize();
    updateLinkPendingStyles();
    renderDependencyOverlay();
    requestAnimationFrame(() => {
      applyTimelineRange();
      decorateBars();
      syncHorizontalScrollWidth();
      syncHScrollFromFrappe();
    });
  }, [applyTimelineRange, decorateBars, handleLinkClick, renderDependencyOverlay, syncHorizontalScrollWidth, syncHScrollFromFrappe, syncOverlaySize, updateLinkPendingStyles]);

  useEffect(() => {
    linkSourceRef.current = null;
    clearLinkLine();
    updateLinkPendingStyles();
  }, [linkMode, clearLinkLine, updateLinkPendingStyles]);

  useEffect(() => {
    mountGantt();
    return () => {
      containerRef.current?.replaceChildren();
      ganttRef.current = null;
    };
  }, [canModify, mountGantt]);

  useEffect(() => {
    const gantt = ganttRef.current as (InstanceType<typeof Gantt> & {
      update_options?: (options: object) => void;
    }) | null;
    if (!gantt?.update_options || visibleTasks.length === 0) return;

    gantt.update_options({
      ...GANTT_CHART_OPTIONS,
      ...getGanttWorkingWeekOptions(workingDaysJson),
    });
    requestAnimationFrame(() => {
      applyTimelineRange();
      decorateBars();
      renderDependencyOverlay();
      syncHorizontalScrollWidth();
      syncHScrollFromFrappe();
      const container = containerRef.current;
      if (container) decorateTodayMarker(container);
    });
  }, [
    workingDaysJson,
    visibleTasks.length,
    applyTimelineRange,
    decorateBars,
    renderDependencyOverlay,
    syncHorizontalScrollWidth,
    syncHScrollFromFrappe,
  ]);

  useEffect(() => {
    if (visibleTasks.length === 0) return;

    if (!ganttRef.current) {
      mountGantt();
      return;
    }

    if (skipRefreshRef.current) {
      skipRefreshRef.current = false;
      applyTimelineRange();
      renderDependencyOverlay();
      decorateBars();
      syncHorizontalScrollWidth();
      syncHScrollFromFrappe();
      return;
    }

    applyGanttContainerHeight(
      ganttRef.current as FrappeGanttInstance | null,
      visibleTasksRef.current.length,
    );
    ganttRef.current.refresh(toGanttTasks(visibleTasks));
    syncOverlaySize();
    updateLinkPendingStyles();
    renderDependencyOverlay();
    requestAnimationFrame(() => {
      applyTimelineRange();
      decorateBars();
      syncHorizontalScrollWidth();
      syncHScrollFromFrappe();
    });
  }, [visibleTasks, dependencies, ganttViewSettings, mountGantt, applyTimelineRange, decorateBars, renderDependencyOverlay, syncHorizontalScrollWidth, syncHScrollFromFrappe, syncOverlaySize, updateLinkPendingStyles]);

  useEffect(() => {
    const scrollArea = scrollRef.current;
    if (!scrollArea) return;

    let frame = 0;
    const onResize = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        const gantt = ganttRef.current as FrappeGanttInstance | null;
        if (!gantt || visibleTasksRef.current.length === 0) return;
        applyGanttContainerHeight(gantt, visibleTasksRef.current.length);
        gantt.refresh(toGanttTasks(visibleTasksRef.current));
        syncOverlaySize();
        decorateBars();
        renderDependencyOverlay();
        syncHorizontalScrollWidth();
        syncHScrollFromFrappe();
      });
    };

    const observer = new ResizeObserver(onResize);
    observer.observe(scrollArea);
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [
    decorateBars,
    renderDependencyOverlay,
    syncHorizontalScrollWidth,
    syncHScrollFromFrappe,
    syncOverlaySize,
  ]);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.querySelectorAll('.bar-wrapper').forEach((el) => {
      el.classList.remove('gantt-selected');
    });
    if (selectedTaskId != null) {
      containerRef.current
        .querySelector(`.bar-wrapper[data-id="${selectedTaskId}"]`)
        ?.classList.add('gantt-selected');

      const scrollArea = scrollRef.current;
      const container = containerRef.current;
      if (scrollArea && container) {
        requestAnimationFrame(() => {
          scrollSelectedTaskIntoView(scrollArea, container, selectedTaskId);
        });
      }
    }
  }, [selectedTaskId, visibleTasks]);

  useEffect(() => {
    const outerScroll = scrollRef.current;
    const mount = containerRef.current;
    if (!outerScroll || !mount || tasks.length === 0) return;

    let frame = 0;
    const syncChartOverlays = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        renderDependencyOverlay();
        decorateBars();
        syncOverlaySize();
        syncHorizontalScrollWidth();
        syncHScrollFromFrappe();
      });
    };

    outerScroll.addEventListener('scroll', syncChartOverlays, { passive: true });
    const frappeScroll = getFrappeScrollContainer(mount);
    if (frappeScroll) {
      frappeScroll.addEventListener('scroll', syncChartOverlays, { passive: true });
    }

    return () => {
      outerScroll.removeEventListener('scroll', syncChartOverlays);
      frappeScroll?.removeEventListener('scroll', syncChartOverlays);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [
    tasks.length,
    dependencies,
    renderDependencyOverlay,
    decorateBars,
    syncHorizontalScrollWidth,
    syncHScrollFromFrappe,
    syncOverlaySize,
  ]);

  useEffect(() => {
    const hScroll = hScrollRef.current;
    if (!hScroll) return;
    const onHScroll = () => syncFrappeFromHScroll();
    hScroll.addEventListener('scroll', onHScroll, { passive: true });
    return () => hScroll.removeEventListener('scroll', onHScroll);
  }, [syncFrappeFromHScroll]);

  useEffect(() => {
    const chartRoot = scrollRef.current;
    if (!chartRoot) return;

    const onWheel = (event: Event) => {
      if (!(event instanceof WheelEvent) || !event.ctrlKey) return;

      const mount = containerRef.current;
      const gantt = ganttRef.current as (GanttZoomTarget & FrappeGanttLayers) | null;
      const frappeScroll = mount ? getFrappeScrollContainer(mount) : null;
      if (!gantt || !frappeScroll) return;

      event.preventDefault();
      event.stopPropagation();

      const zoomIn = event.deltaY < 0;
      const newWidth = applyGanttZoomAtPointer(gantt, frappeScroll, event.clientX, zoomIn);
      if (newWidth == null) return;

      columnWidthRef.current = newWidth;
      applyTimelineRange();
      syncHScrollFromFrappe();
      requestAnimationFrame(() => {
        renderDependencyOverlay();
        decorateBars();
        syncHorizontalScrollWidth();
        syncHScrollFromFrappe();
        syncOverlaySize();
      });
    };

    chartRoot.addEventListener('wheel', onWheel, { passive: false });
    return () => chartRoot.removeEventListener('wheel', onWheel);
  }, [
    tasks.length,
    applyTimelineRange,
    renderDependencyOverlay,
    decorateBars,
    syncHorizontalScrollWidth,
    syncHScrollFromFrappe,
    syncOverlaySize,
  ]);

  useEffect(() => {
    const container = containerRef.current;
    const scrollArea = scrollRef.current;
    if (!container || !scrollArea || !canModify) return;

    const onMouseDown = (event: MouseEvent) => {
      if (!event.altKey && !linkModeRef.current) return;
      const taskId = findTaskIdFromTarget(container, event.target);
      if (taskId == null) return;

      event.preventDefault();
      linkDragRef.current = { fromId: taskId };
      linkSourceRef.current = taskId;
      updateLinkPendingStyles();

      const point = toOverlayPoint(scrollArea, container, event.clientX, event.clientY);
      drawLinkLine(taskId, point.x, point.y);
    };

    const onMouseMove = (event: MouseEvent) => {
      if (!linkDragRef.current) return;
      const point = toOverlayPoint(scrollArea, container, event.clientX, event.clientY);
      drawLinkLine(linkDragRef.current.fromId, point.x, point.y);
    };

    const onMouseUp = (event: MouseEvent) => {
      if (!linkDragRef.current) return;
      const fromId = linkDragRef.current.fromId;
      linkDragRef.current = null;

      const toId = findTaskIdFromTarget(container, event.target);
      if (toId != null && toId !== fromId) {
        completeLink(fromId, toId);
      } else {
        linkSourceRef.current = null;
        clearLinkLine();
        updateLinkPendingStyles();
      }
    };

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [canModify, clearLinkLine, completeLink, drawLinkLine, updateLinkPendingStyles]);

  return (
    <div className={`gantt-chart ${linkMode ? 'gantt-link-mode' : ''} ${canModify ? '' : 'gantt-readonly'}`}>
      <div
        ref={(node) => {
          scrollRef.current = node;
          if (scrollContainerRef) {
            scrollContainerRef.current = node;
          }
        }}
        className="gantt-scroll"
      >
        <svg ref={overlayRef} className="gantt-link-overlay" aria-hidden="true" />
        <div ref={containerRef} className="gantt-container" />
      </div>
      <div ref={hScrollRef} className="gantt-hscroll" aria-label="간트 가로 스크롤">
        <div className="gantt-hscroll-spacer" aria-hidden="true" />
      </div>
    </div>
  );
}
