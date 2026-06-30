import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import Gantt from 'frappe-gantt';
import {
  GANTT_CHART_OPTIONS,
  GANTT_DEFAULT_COLUMN_WIDTH,
  GANTT_HEADER_HEIGHT,
  getGanttContentHeight,
} from '../config/ganttLayout';
import { createGanttViewModes } from '../config/ganttViewMode';
import { useLanguage, useTranslation } from '../i18n';
import type { DependencyItem, GanttViewSettings, NoteItem, TaskItem } from '../types/project';
import { argbToCss } from '../utils/colorUtils';
import type { ProjectContextMenuTarget } from '../utils/projectContextMenu';
import { getVisibleTasks } from '../utils/taskModel';
import { decorateGanttBars } from '../utils/ganttBarDecorations';
import { patchFrappeGanttResizeHandles } from '../utils/ganttBarResizeHandles';
import { renderDependencyLines, renderLinkPreview, clearLinkPreview, type FrappeGanttLayers } from '../utils/dependencyLineRenderer';
import { applyGanttZoomAtPointer, type GanttZoomTarget } from '../utils/ganttZoom';
import { ensureGanttTimelineRange } from '../utils/ganttTimeline';
import { getGanttWorkingWeekOptions } from '../utils/ganttWorkingWeek';
import { decorateTodayMarker, scrollGanttToToday } from '../utils/ganttToday';
import { bindGanttHeaderScroll, decorateGanttHeader, type FrappeGanttHeaderApi } from '../utils/ganttHeader';
import { GanttNotesOverlay } from './GanttNotesOverlay';
import { SPLIT_PANE_RESIZE_END_EVENT } from './ProjectSplitPane';
import { toFrappeGanttEndDate, toGanttDateString } from '../utils/ganttTaskDates';
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
  ganttNotes: NoteItem[];
  workingDaysJson: string;
  ganttViewSettings: GanttViewSettings;
  selectedTaskId: number | null;
  selectedNoteId: number | null;
  editingNoteId: number | null;
  selectedDependency?: { predecessorId: number; successorId: number } | null;
  canModify: boolean;
  linkSourceTaskId?: number | null;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
  scrollToTodayRef?: RefObject<(() => boolean) | null>;
  zoomRef?: RefObject<{ zoomIn: () => void; zoomOut: () => void } | null>;
  onSelectTask: (taskId: number) => void;
  onSelectNote: (noteId: number) => void;
  onSetEditingNoteId: (noteId: number | null) => void;
  onUpdateNoteBody: (noteId: number, body: string) => void;
  onUpdateNotePosition: (noteId: number, anchorDate: string, contentY: number) => void;
  onSelectDependency?: (dependency: { predecessorId: number; successorId: number }) => void;
  onTaskDateChange: (taskId: number, start: Date, end: Date) => void;
  onTaskProgressChange: (taskId: number, progress: number) => void;
  onAddDependency: (predecessorId: number, successorId: number) => void;
  onClearLinkSource?: () => void;
  onCancelLinkMode?: () => void;
  onContextMenuRequest?: (target: ProjectContextMenuTarget, clientX: number, clientY: number) => void;
}

function getGanttContainerHeight(taskCount: number): number {
  return getGanttContentHeight(taskCount);
}

function getVisibleTaskSignature(visibleTasks: TaskItem[]): string {
  return visibleTasks.map((task) => task.taskId).join(',');
}

type FrappeGanttPopupContext = {
  task: {
    name: string;
    description?: string;
    _start: Date;
    _end: Date;
    actual_duration?: number;
    progress: number;
  };
  set_title: (title: string) => void;
  set_subtitle: (subtitle: string) => void;
  set_details: (details: string) => void;
};

function isLinkingInteraction(
  linkSourceTaskId: number | null | undefined,
  linkSourceRef: RefObject<number | null>,
  linkDragRef: RefObject<{ fromId: number } | null>,
): boolean {
  return (
    linkSourceTaskId != null ||
    linkSourceRef.current != null ||
    linkDragRef.current != null
  );
}

function renderGanttTaskPopup(ctx: FrappeGanttPopupContext): void {
  ctx.set_title(ctx.task.name);
  ctx.set_subtitle(ctx.task.description ?? '');
  const start = ctx.task._start.toLocaleDateString();
  const end = ctx.task._end.toLocaleDateString();
  const duration = ctx.task.actual_duration ?? 0;
  ctx.set_details(`${start} - ${end} (${duration}d)<br/>Progress: ${Math.round(ctx.task.progress)}%`);
}

function createGanttPopupHandler(
  linkSourceTaskIdRef: RefObject<number | null | undefined>,
  linkSourceRef: RefObject<number | null>,
  linkDragRef: RefObject<{ fromId: number } | null>,
): (ctx: FrappeGanttPopupContext) => false | undefined {
  return (ctx) => {
    if (
      isLinkingInteraction(
        linkSourceTaskIdRef.current,
        linkSourceRef,
        linkDragRef,
      )
    ) {
      return false;
    }
    renderGanttTaskPopup(ctx);
    return undefined;
  };
}

type FrappeGanttInstance = InstanceType<typeof Gantt> & {
  options: { container_height: number | 'auto' };
  $container?: HTMLElement;
};

const GANTT_RESIZE_REBUILD_DEBOUNCE_MS = 150;

function applyGanttContainerHeight(
  gantt: FrappeGanttInstance | null,
  taskCount: number,
): void {
  if (!gantt) return;
  const height = getGanttContainerHeight(taskCount);
  gantt.options.container_height = height;
  // frappe-gantt sets --gv-grid-height only in setup_options(); keep it in sync on row changes.
  gantt.$container?.style.setProperty('--gv-grid-height', `${height}px`);
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
    const start = toGanttDateString(task.startDate);
    const barColor = argbToCss(task.barColorArgb);
    const progressColor = argbToCss(task.progressColorArgb);

    return {
      id: String(task.taskId),
      name: task.name,
      start,
      end: toFrappeGanttEndDate(task),
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

function findDependencyFromTarget(
  container: HTMLElement,
  target: EventTarget | null,
): { predecessorId: number; successorId: number } | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest('[data-predecessor-id][data-successor-id]');
  if (!el || !container.contains(el)) return null;
  const predecessorId = Number(el.getAttribute('data-predecessor-id'));
  const successorId = Number(el.getAttribute('data-successor-id'));
  if (!Number.isFinite(predecessorId) || !Number.isFinite(successorId)) return null;
  return { predecessorId, successorId };
}

function getGanttContextTarget(
  container: HTMLElement,
  target: EventTarget | null,
): ProjectContextMenuTarget {
  if (!(target instanceof Element)) return { kind: 'gantt-empty' };

  const dependency = findDependencyFromTarget(container, target);
  if (dependency) {
    return { kind: 'gantt-dependency', ...dependency };
  }

  const taskId = findTaskIdFromTarget(container, target);
  if (taskId != null) return { kind: 'gantt-task', taskId };

  if (
    target.closest('.grid-header, .upper-text, .lower-text, .side-header, .gantt-today-line, .gantt-today-ball')
  ) {
    return { kind: 'gantt-header' };
  }

  return { kind: 'gantt-empty' };
}

export function GanttChart({
  tasks,
  dependencies,
  ganttNotes,
  workingDaysJson,
  ganttViewSettings,
  selectedTaskId,
  selectedNoteId,
  editingNoteId,
  selectedDependency = null,
  canModify,
  linkSourceTaskId = null,
  scrollContainerRef,
  scrollToTodayRef,
  zoomRef,
  onSelectTask,
  onSelectNote,
  onSetEditingNoteId,
  onUpdateNoteBody,
  onUpdateNotePosition,
  onSelectDependency,
  onTaskDateChange,
  onTaskProgressChange,
  onAddDependency,
  onClearLinkSource,
  onCancelLinkMode,
  onContextMenuRequest,
}: GanttChartProps) {
  const { locale } = useLanguage();
  const t = useTranslation();
  const viewModes = useMemo(() => createGanttViewModes(locale), [locale]);
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
  const visibleTaskSignature = useMemo(
    () => getVisibleTaskSignature(visibleTasks),
    [visibleTasks],
  );
  const visibleTasksRef = useRef(visibleTasks);
  const lastRenderedTaskSignatureRef = useRef('');
  const dependenciesRef = useRef(dependencies);
  const workingDaysJsonRef = useRef(workingDaysJson);
  const viewSettingsRef = useRef(ganttViewSettings);
  const canModifyRef = useRef(canModify);
  const linkSourceTaskIdRef = useRef(linkSourceTaskId);
  const linkSourceRef = useRef<number | null>(null);
  const linkDragRef = useRef<{ fromId: number } | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const resizeRebuildTimerRef = useRef<number | null>(null);
  const pendingFullResizeRef = useRef(false);

  const onSelectTaskRef = useRef(onSelectTask);
  const onTaskDateChangeRef = useRef(onTaskDateChange);
  const onTaskProgressChangeRef = useRef(onTaskProgressChange);
  const onAddDependencyRef = useRef(onAddDependency);
  const onClearLinkSourceRef = useRef(onClearLinkSource);
  const onCancelLinkModeRef = useRef(onCancelLinkMode);
  const onContextMenuRequestRef = useRef(onContextMenuRequest);

  const selectedDependencyRef = useRef(selectedDependency);
  const onSelectDependencyRef = useRef(onSelectDependency);

  tasksRef.current = tasks;
  visibleTasksRef.current = visibleTasks;
  dependenciesRef.current = dependencies;
  workingDaysJsonRef.current = workingDaysJson;
  viewSettingsRef.current = ganttViewSettings;
  onSelectTaskRef.current = onSelectTask;
  onTaskDateChangeRef.current = onTaskDateChange;
  onTaskProgressChangeRef.current = onTaskProgressChange;
  onAddDependencyRef.current = onAddDependency;
  onClearLinkSourceRef.current = onClearLinkSource;
  onCancelLinkModeRef.current = onCancelLinkMode;
  onContextMenuRequestRef.current = onContextMenuRequest;
  selectedDependencyRef.current = selectedDependency;
  onSelectDependencyRef.current = onSelectDependency;
  canModifyRef.current = canModify;
  linkSourceTaskIdRef.current = linkSourceTaskId;

  const ganttPopupHandler = useMemo(
    () => createGanttPopupHandler(linkSourceTaskIdRef, linkSourceRef, linkDragRef),
    [],
  );

  const hideGanttTaskPopup = useCallback(() => {
    const gantt = ganttRef.current as (FrappeGanttInstance & { hide_popup?: () => void }) | null;
    gantt?.hide_popup?.();
  }, []);

  const resolveLinkSourceId = useCallback((): number | null => {
    if (linkDragRef.current) return linkDragRef.current.fromId;
    return linkSourceRef.current ?? linkSourceTaskIdRef.current ?? null;
  }, []);

  const updateLinkTargetHighlight = useCallback((target: EventTarget | null, fromId: number | null) => {
    const container = containerRef.current;
    if (!container) return;
    container.querySelectorAll('.bar-wrapper.gantt-link-target').forEach((el) => {
      el.classList.remove('gantt-link-target');
    });
    if (fromId == null || linkSourceTaskIdRef.current == null) return;
    const toId = findTaskIdFromTarget(container, target);
    if (toId == null || toId === fromId) return;
    container
      .querySelector(`.bar-wrapper[data-id="${toId}"]`)
      ?.classList.add('gantt-link-target');
  }, []);

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
      selectedDependencyRef.current,
    );
  }, []);

  const decorateBars = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    decorateGanttBars(container, tasksRef.current, {
      showCriticalPath: viewSettingsRef.current.showCriticalPath,
    });
    decorateTodayMarker(container);
    const gantt = ganttRef.current as FrappeGanttHeaderApi | null;
    if (gantt) decorateGanttHeader(container, gantt, workingDaysJsonRef.current);
  }, []);

  const getGanttLayout = useCallback(() => {
    const gantt = ganttRef.current as FrappeGanttHeaderApi | null;
    if (!gantt) return null;
    return {
      ganttStart: gantt.gantt_start,
      columnWidth: columnWidthRef.current,
    };
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
      // ensureGanttTimelineRange calls gantt.render(), which rebuilds SVG layers.
      renderDependencyOverlay();
      decorateBars();
    }
    return changed;
  }, [decorateBars, renderDependencyOverlay]);

  const syncGanttLayoutAfterResize = useCallback(
    (fullRebuild: boolean) => {
      const gantt = ganttRef.current as FrappeGanttInstance | null;
      const container = containerRef.current;
      const scrollArea = scrollRef.current;
      if (!gantt || !container || visibleTasksRef.current.length === 0) return;

      const frappeScroll = getFrappeScrollContainer(container);
      const viewportWidth = frappeScroll?.clientWidth ?? 0;
      if (viewportWidth <= 0) {
        pendingFullResizeRef.current = true;
        return;
      }

      applyGanttContainerHeight(gantt, visibleTasksRef.current.length);

      if (fullRebuild || pendingFullResizeRef.current) {
        pendingFullResizeRef.current = false;
        const scrollLeft = frappeScroll?.scrollLeft ?? 0;
        const scrollTop = scrollArea?.scrollTop ?? 0;
        gantt.refresh(toGanttTasks(visibleTasksRef.current));
        if (frappeScroll) {
          frappeScroll.scrollLeft = scrollLeft;
        }
        if (scrollArea) {
          scrollArea.scrollTop = scrollTop;
        }
        applyTimelineRange();
      }

      syncOverlaySize();
      decorateBars();
      renderDependencyOverlay();
      syncHorizontalScrollWidth();
      syncHScrollFromFrappe();
    },
    [
      applyTimelineRange,
      decorateBars,
      renderDependencyOverlay,
      syncHorizontalScrollWidth,
      syncHScrollFromFrappe,
      syncOverlaySize,
    ],
  );

  const scheduleFullGanttResizeRebuild = useCallback(() => {
    if (resizeRebuildTimerRef.current != null) {
      window.clearTimeout(resizeRebuildTimerRef.current);
    }
    resizeRebuildTimerRef.current = window.setTimeout(() => {
      resizeRebuildTimerRef.current = null;
      syncGanttLayoutAfterResize(true);
    }, GANTT_RESIZE_REBUILD_DEBOUNCE_MS);
  }, [syncGanttLayoutAfterResize]);

  const applyGanttZoom = useCallback((zoomIn: boolean) => {
    const mount = containerRef.current;
    const gantt = ganttRef.current as (GanttZoomTarget & FrappeGanttLayers) | null;
    const frappeScroll = mount ? getFrappeScrollContainer(mount) : null;
    if (!gantt || !frappeScroll) return;

    const rect = frappeScroll.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const newWidth = applyGanttZoomAtPointer(gantt, frappeScroll, clientX, zoomIn);
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
  }, [
    applyTimelineRange,
    decorateBars,
    renderDependencyOverlay,
    syncHorizontalScrollWidth,
    syncHScrollFromFrappe,
    syncOverlaySize,
  ]);

  useEffect(() => {
    if (!zoomRef) return;
    zoomRef.current = {
      zoomIn: () => applyGanttZoom(true),
      zoomOut: () => applyGanttZoom(false),
    };
    return () => {
      zoomRef.current = null;
    };
  }, [applyGanttZoom, zoomRef]);

  const clearLinkLine = useCallback(() => {
    const gantt = ganttRef.current as FrappeGanttLayers | null;
    if (gantt) clearLinkPreview(gantt);
    overlayRef.current?.querySelectorAll('.gantt-link-line').forEach((line) => line.remove());
  }, []);

  const drawLinkLine = useCallback(
    (
      fromId: number,
      clientX: number,
      clientY: number,
      targetTaskId: number | null = null,
    ) => {
      const container = containerRef.current;
      const gantt = ganttRef.current as FrappeGanttLayers | null;
      if (!container || !gantt) return;

      renderLinkPreview(
        gantt,
        container,
        fromId,
        clientX,
        clientY,
        viewSettingsRef.current,
        targetTaskId,
      );
    },
    [],
  );

  const drawLinkPreviewAtClient = useCallback(
    (
      fromId: number,
      clientX: number,
      clientY: number,
      target: EventTarget | null = null,
    ) => {
      const container = containerRef.current;
      if (!container) return;
      const hoverId = findTaskIdFromTarget(container, target);
      const sourceId = resolveLinkSourceId();
      const targetTaskId =
        hoverId != null && hoverId !== fromId && hoverId !== sourceId ? hoverId : null;
      drawLinkLine(fromId, clientX, clientY, targetTaskId);
    },
    [drawLinkLine, resolveLinkSourceId],
  );

  const updateLinkPendingStyles = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    container.querySelectorAll('.bar-wrapper').forEach((el) => {
      el.classList.remove('gantt-link-pending');
    });
    const sourceId = resolveLinkSourceId();
    if (sourceId != null) {
      container
        .querySelector(`.bar-wrapper[data-id="${sourceId}"]`)
        ?.classList.add('gantt-link-pending');
    }
  }, [resolveLinkSourceId]);

  const clearLinkSession = useCallback(() => {
    linkSourceRef.current = null;
    linkDragRef.current = null;
    onClearLinkSourceRef.current?.();
    clearLinkLine();
    updateLinkTargetHighlight(null, null);
    updateLinkPendingStyles();
  }, [clearLinkLine, updateLinkPendingStyles, updateLinkTargetHighlight]);

  const cancelLinkMode = useCallback(() => {
    clearLinkSession();
    onCancelLinkModeRef.current?.();
  }, [clearLinkSession]);

  const isLinkSessionActive = useCallback((): boolean => {
    return linkSourceTaskIdRef.current != null || linkDragRef.current != null;
  }, []);

  useEffect(() => {
    if (!canModify) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }
      if (!isLinkSessionActive()) return;

      event.preventDefault();
      cancelLinkMode();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canModify, cancelLinkMode, isLinkSessionActive]);

  useEffect(() => {
    if (linkSourceTaskId == null) return;
    linkSourceRef.current = linkSourceTaskId;
    updateLinkPendingStyles();

    requestAnimationFrame(() => {
      const pointer = lastPointerRef.current;
      if (pointer) {
        drawLinkPreviewAtClient(linkSourceTaskId, pointer.x, pointer.y);
        return;
      }
      const container = containerRef.current;
      const scrollArea = scrollRef.current;
      if (!container || !scrollArea) return;
      const rect = scrollArea.getBoundingClientRect();
      drawLinkPreviewAtClient(
        linkSourceTaskId,
        rect.left + rect.width / 2,
        rect.top + GANTT_HEADER_HEIGHT + 40,
      );
    });
  }, [linkSourceTaskId, drawLinkPreviewAtClient, updateLinkPendingStyles]);

  const completeLink = useCallback(
    (predecessorId: number, successorId: number) => {
      if (predecessorId === successorId) return;
      onAddDependencyRef.current(predecessorId, successorId);
      clearLinkSession();
    },
    [clearLinkSession],
  );

  const handleLinkClick = useCallback((taskId: number) => {
    if (!canModifyRef.current) return;

    const sourceId = resolveLinkSourceId();
    if (sourceId == null) return;

    if (sourceId === taskId) {
      cancelLinkMode();
      hideGanttTaskPopup();
      return;
    }

    completeLink(sourceId, taskId);
    hideGanttTaskPopup();
  }, [cancelLinkMode, completeLink, hideGanttTaskPopup, resolveLinkSourceId]);

  const mountGantt = useCallback(() => {
    const container = containerRef.current;
    if (!container || visibleTasksRef.current.length === 0) return;

    container.innerHTML = '';
    ganttRef.current = new Gantt(container, toGanttTasks(visibleTasksRef.current), {
      view_mode: 'Day',
      view_modes: viewModes,
      ...GANTT_CHART_OPTIONS,
      ...getGanttWorkingWeekOptions(workingDaysJsonRef.current),
      column_width: columnWidthRef.current,
      container_height: getGanttContainerHeight(visibleTasksRef.current.length),
      readonly: !canModifyRef.current,
      readonly_dates: !canModifyRef.current,
      readonly_progress: !canModifyRef.current,
      move_dependencies: false,
      popup: ganttPopupHandler,
      on_click: (task: { id: string }) => {
        const taskId = Number(task.id);
        if (linkSourceTaskIdRef.current != null && canModifyRef.current) {
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
    patchFrappeGanttResizeHandles(ganttRef.current);
    syncOverlaySize();
    updateLinkPendingStyles();
    renderDependencyOverlay();
    requestAnimationFrame(() => {
      applyTimelineRange();
      renderDependencyOverlay();
      decorateBars();
      syncHorizontalScrollWidth();
      syncHScrollFromFrappe();
    });
  }, [applyTimelineRange, decorateBars, ganttPopupHandler, handleLinkClick, renderDependencyOverlay, syncHorizontalScrollWidth, syncHScrollFromFrappe, syncOverlaySize, updateLinkPendingStyles, viewModes]);

  useEffect(() => {
    const trackPointer = (event: MouseEvent) => {
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener('mousemove', trackPointer, { passive: true });
    return () => window.removeEventListener('mousemove', trackPointer);
  }, []);

  useEffect(() => {
    hideGanttTaskPopup();
  }, [hideGanttTaskPopup, linkSourceTaskId]);

  useEffect(() => {
    if (linkSourceTaskId != null) return;
    linkSourceRef.current = null;
    linkDragRef.current = null;
    clearLinkLine();
    updateLinkTargetHighlight(null, null);
    hideGanttTaskPopup();
    updateLinkPendingStyles();
  }, [linkSourceTaskId, clearLinkLine, hideGanttTaskPopup, updateLinkPendingStyles, updateLinkTargetHighlight]);

  useEffect(() => {
    mountGantt();
    return () => {
      containerRef.current?.replaceChildren();
      ganttRef.current = null;
    };
  }, [canModify, mountGantt]);

  useEffect(() => {
    const container = containerRef.current;
    const gantt = ganttRef.current as FrappeGanttHeaderApi | null;
    if (!container || !gantt) return;
    return bindGanttHeaderScroll(container, gantt, workingDaysJson);
  }, [canModify, visibleTasks.length, dependencies.length, locale, workingDaysJson]);

  useEffect(() => {
    const gantt = ganttRef.current as (InstanceType<typeof Gantt> & {
      update_options?: (options: object) => void;
    }) | null;
    if (!gantt?.update_options || visibleTasks.length === 0) return;

    gantt.update_options({
      view_modes: viewModes,
      ...GANTT_CHART_OPTIONS,
      ...getGanttWorkingWeekOptions(workingDaysJson),
    });
    requestAnimationFrame(() => {
      applyTimelineRange();
      renderDependencyOverlay();
      decorateBars();
      syncHorizontalScrollWidth();
      syncHScrollFromFrappe();
      const container = containerRef.current;
      if (container) {
        decorateTodayMarker(container);
        if (gantt) decorateGanttHeader(container, gantt as FrappeGanttHeaderApi, workingDaysJson);
      }
    });
  }, [
    workingDaysJson,
    visibleTasks.length,
    locale,
    viewModes,
    applyTimelineRange,
    decorateBars,
    renderDependencyOverlay,
    syncHorizontalScrollWidth,
    syncHScrollFromFrappe,
  ]);

  useEffect(() => {
    if (visibleTasks.length === 0) {
      lastRenderedTaskSignatureRef.current = '';
      return;
    }

    const taskListChanged =
      lastRenderedTaskSignatureRef.current !== visibleTaskSignature;

    if (!ganttRef.current) {
      mountGantt();
      lastRenderedTaskSignatureRef.current = visibleTaskSignature;
      return;
    }

    if (skipRefreshRef.current && !taskListChanged) {
      skipRefreshRef.current = false;
      applyTimelineRange();
      renderDependencyOverlay();
      decorateBars();
      syncHorizontalScrollWidth();
      syncHScrollFromFrappe();
      return;
    }
    skipRefreshRef.current = false;

    if (taskListChanged) {
      lastRenderedTaskSignatureRef.current = visibleTaskSignature;
      syncGanttLayoutAfterResize(true);
      return;
    }

    applyGanttContainerHeight(
      ganttRef.current as FrappeGanttInstance | null,
      visibleTasksRef.current.length,
    );
    ganttRef.current.refresh(toGanttTasks(visibleTasks));
    patchFrappeGanttResizeHandles(ganttRef.current);
    syncOverlaySize();
    updateLinkPendingStyles();
    renderDependencyOverlay();
    requestAnimationFrame(() => {
      applyTimelineRange();
      renderDependencyOverlay();
      decorateBars();
      syncHorizontalScrollWidth();
      syncHScrollFromFrappe();
    });
  }, [
    visibleTasks,
    visibleTaskSignature,
    dependencies,
    ganttViewSettings,
    mountGantt,
    syncGanttLayoutAfterResize,
    applyTimelineRange,
    decorateBars,
    renderDependencyOverlay,
    syncHorizontalScrollWidth,
    syncHScrollFromFrappe,
    syncOverlaySize,
    updateLinkPendingStyles,
  ]);

  useEffect(() => {
    const scrollArea = scrollRef.current;
    if (!scrollArea) return;

    let frame = 0;
    const onResize = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        syncGanttLayoutAfterResize(false);
        scheduleFullGanttResizeRebuild();
      });
    };

    const onSplitResizeEnd = () => {
      if (resizeRebuildTimerRef.current != null) {
        window.clearTimeout(resizeRebuildTimerRef.current);
        resizeRebuildTimerRef.current = null;
      }
      requestAnimationFrame(() => syncGanttLayoutAfterResize(true));
    };

    const observer = new ResizeObserver(onResize);
    observer.observe(scrollArea);
    window.addEventListener(SPLIT_PANE_RESIZE_END_EVENT, onSplitResizeEnd);
    return () => {
      observer.disconnect();
      window.removeEventListener(SPLIT_PANE_RESIZE_END_EVENT, onSplitResizeEnd);
      if (frame) cancelAnimationFrame(frame);
      if (resizeRebuildTimerRef.current != null) {
        window.clearTimeout(resizeRebuildTimerRef.current);
        resizeRebuildTimerRef.current = null;
      }
    };
  }, [scheduleFullGanttResizeRebuild, syncGanttLayoutAfterResize]);

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

    const onMouseMove = (event: MouseEvent) => {
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      const fromId = resolveLinkSourceId();
      if (fromId == null) return;
      drawLinkPreviewAtClient(fromId, event.clientX, event.clientY, event.target);
      updateLinkTargetHighlight(event.target, fromId);
    };

    window.addEventListener('mousemove', onMouseMove);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, [
    canModify,
    drawLinkPreviewAtClient,
    resolveLinkSourceId,
    updateLinkTargetHighlight,
  ]);

  useEffect(() => {
    renderDependencyOverlay();
  }, [renderDependencyOverlay, selectedDependency]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onClick = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const dependency = findDependencyFromTarget(container, event.target);
      if (!dependency) return;
      event.preventDefault();
      event.stopPropagation();
      onSelectDependencyRef.current?.(dependency);
    };

    container.addEventListener('click', onClick);
    return () => container.removeEventListener('click', onClick);
  }, [tasks.length, dependencies.length]);

  useEffect(() => {
    const scrollArea = scrollRef.current;
    const container = containerRef.current;
    if (!scrollArea || !container || !onContextMenuRequestRef.current) return;

    const onContextMenu = (event: MouseEvent) => {
      if (event.button !== 2) return;
      event.preventDefault();
      event.stopPropagation();

      const target = getGanttContextTarget(container, event.target);
      if (target.kind === 'gantt-task') {
        onSelectTaskRef.current(target.taskId);
      } else if (target.kind === 'gantt-dependency') {
        onSelectDependencyRef.current?.({
          predecessorId: target.predecessorId,
          successorId: target.successorId,
        });
        onSelectTaskRef.current(target.successorId);
      }
      onContextMenuRequestRef.current?.(target, event.clientX, event.clientY);
    };

    scrollArea.addEventListener('contextmenu', onContextMenu);
    return () => scrollArea.removeEventListener('contextmenu', onContextMenu);
  }, [tasks.length]);

  return (
    <div className={`gantt-chart ${linkSourceTaskId != null ? 'gantt-link-mode' : ''} ${canModify ? '' : 'gantt-readonly'}`}>
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
        <GanttNotesOverlay
          notes={ganttNotes}
          tasks={tasks}
          containerRef={containerRef}
          getGanttLayout={getGanttLayout}
          selectedNoteId={selectedNoteId}
          editingNoteId={editingNoteId}
          canModify={canModify}
          onSelectNote={onSelectNote}
          onSetEditingNoteId={onSetEditingNoteId}
          onUpdateNoteBody={onUpdateNoteBody}
          onUpdateNotePosition={onUpdateNotePosition}
          onContextMenuRequest={onContextMenuRequest}
        />
      </div>
      <div ref={hScrollRef} className="gantt-hscroll" aria-label={t('gantt.hScroll')}>
        <div className="gantt-hscroll-spacer" aria-hidden="true" />
      </div>
    </div>
  );
}
