import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import type { AssignmentItem, NoteItem, TaskItem } from '../types/project';
import {
  GANTT_HEADER_HEIGHT,
  GANTT_ROW_HEIGHT,
  TASK_GRID_COLUMN_HEADER_HEIGHT,
  TASK_GRID_PROJECT_BANNER_HEIGHT,
} from '../config/ganttLayout';
import { useTranslation, useLanguage } from '../i18n';
import { getDateLocaleTag } from '../i18n/translate';
import type { ProjectContextMenuTarget } from '../utils/projectContextMenu';
import { DateInput } from './DateInput';
import { PercentInput } from './PercentInput';
import { formatTaskTypeLabel, TaskTypeSelect } from './TaskTypeSelect';
import { parseDateInputValue, toDateInputValue } from '../utils/taskDateInput';
import { getVisibleTasks, taskHasChildren } from '../utils/taskModel';
import {
  getTaskResourceAllocText,
  getTaskResourceNamesText,
  normalizeAllocationText,
} from '../utils/taskResources';
import {
  getTreeGuideSegments,
  getTreeIndentPx,
} from '../utils/taskTreeLayout';
import { buildTaskTypePatch } from '../utils/taskTypeOptions';
import { getTaskGridNoteSpacerHeight } from '../utils/ganttNoteLayout';
import {
  columnWidthStyle,
  loadTaskGridColumnWidths,
  MIN_TASK_GRID_COLUMN_WIDTHS,
  saveTaskGridColumnWidths,
  sumTaskGridColumnWidths,
  type TaskGridColumnId,
} from '../utils/taskGridColumnWidths';
import './TaskGrid.css';

interface TaskGridProps {
  projectName: string;
  tasks: TaskItem[];
  assignments: AssignmentItem[];
  selectedTaskId: number | null;
  canModify: boolean;
  showCriticalPath?: boolean;
  ganttNotes?: NoteItem[];
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
  onSelectTask: (taskId: number) => void;
  onUpdateTask: (taskId: number, patch: Partial<TaskItem>) => void;
  onUpdateTaskResources: (taskId: number, namesText: string, allocsText: string) => void;
  onToggleExpand: (taskId: number) => void;
  onContextMenuRequest?: (target: ProjectContextMenuTarget, clientX: number, clientY: number) => void;
}

function commitDateChange(
  onUpdateTask: TaskGridProps['onUpdateTask'],
  task: TaskItem,
  field: 'startDate' | 'endDate',
  value: string,
) {
  if (!value) return;
  const current = toDateInputValue(field === 'startDate' ? task.startDate : task.endDate);
  if (value === current) return;
  onUpdateTask(task.taskId, {
    [field]: parseDateInputValue(value).toISOString(),
  });
}

function countTextLines(text: string): number {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean).length;
}

function formatDate(iso: string, localeTag: string): string {
  return new Date(iso).toLocaleDateString(localeTag);
}

interface ResizableHeaderCellProps {
  columnId: TaskGridColumnId;
  className: string;
  label: string;
  width: number;
  onResize: (columnId: TaskGridColumnId, nextWidth: number) => void;
  onResizeStart: () => void;
  onResizeEnd: () => void;
}

function ResizableHeaderCell({
  columnId,
  className,
  label,
  width,
  onResize,
  onResizeStart,
  onResizeEnd,
}: ResizableHeaderCellProps) {
  const startResize = (event: React.MouseEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = width;
    onResizeStart();

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const nextWidth = Math.max(
        MIN_TASK_GRID_COLUMN_WIDTHS[columnId],
        Math.round(startWidth + delta),
      );
      onResize(columnId, nextWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      onResizeEnd();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <th className={className} style={columnWidthStyle(width)}>
      {label}
      <span
        className="task-grid-col-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label={label}
        onMouseDown={startResize}
      />
    </th>
  );
}

export function TaskGrid({
  projectName,
  tasks,
  assignments,
  selectedTaskId,
  canModify,
  showCriticalPath = false,
  ganttNotes = [],
  scrollContainerRef,
  onSelectTask,
  onUpdateTask,
  onUpdateTaskResources,
  onToggleExpand,
  onContextMenuRequest,
}: TaskGridProps) {
  const t = useTranslation();
  const { locale } = useLanguage();
  const dateLocale = getDateLocaleTag(locale);
  const [editingNameId, setEditingNameId] = useState<number | null>(null);
  const [columnWidths, setColumnWidths] = useState(loadTaskGridColumnWidths);
  const [isResizingColumns, setIsResizingColumns] = useState(false);
  const columnWidthsRef = useRef(columnWidths);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const visibleTasks = getVisibleTasks(tasks);
  const noteSpacerHeight = getTaskGridNoteSpacerHeight(visibleTasks.length, ganttNotes);

  useEffect(() => {
    columnWidthsRef.current = columnWidths;
  }, [columnWidths]);

  const handleColumnResize = (columnId: TaskGridColumnId, nextWidth: number) => {
    setColumnWidths((current) => ({
      ...current,
      [columnId]: nextWidth,
    }));
  };

  const handleColumnResizeEnd = () => {
    setIsResizingColumns(false);
    saveTaskGridColumnWidths(columnWidthsRef.current);
  };

  const gridHeaders: Array<{ columnId: TaskGridColumnId; className: string; labelKey: Parameters<typeof t>[0] }> = [
    { columnId: 'id', className: 'col-id', labelKey: 'grid.col.id' },
    { columnId: 'name', className: 'col-name', labelKey: 'grid.col.name' },
    { columnId: 'duration', className: 'col-duration', labelKey: 'grid.col.duration' },
    { columnId: 'start', className: 'col-start', labelKey: 'grid.col.start' },
    { columnId: 'end', className: 'col-end', labelKey: 'grid.col.end' },
    { columnId: 'progress', className: 'col-progress', labelKey: 'grid.col.progress' },
    { columnId: 'type', className: 'col-type', labelKey: 'grid.col.type' },
    { columnId: 'resource', className: 'col-resource', labelKey: 'grid.col.resource' },
    { columnId: 'alloc', className: 'col-alloc', labelKey: 'grid.col.allocation' },
    { columnId: 'deliverable', className: 'col-deliverable', labelKey: 'grid.col.deliverable' },
    { columnId: 'notes', className: 'col-notes', labelKey: 'grid.col.notes' },
  ];

  useEffect(() => {
    if (editingNameId != null) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [editingNameId]);

  const layoutStyle = {
    '--task-grid-row-height': `${GANTT_ROW_HEIGHT}px`,
    '--task-grid-header-height': `${TASK_GRID_COLUMN_HEADER_HEIGHT}px`,
    '--task-grid-project-banner-height': `${TASK_GRID_PROJECT_BANNER_HEIGHT}px`,
    '--split-header-height': `${GANTT_HEADER_HEIGHT}px`,
  } as CSSProperties;

  const commitNameEdit = (task: TaskItem, value: string) => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== task.name) {
      onUpdateTask(task.taskId, { name: trimmed });
    }
    setEditingNameId(null);
  };

  const handleContextMenu = (event: React.MouseEvent) => {
    if (!onContextMenuRequest) return;
    event.preventDefault();

    const row = (event.target as HTMLElement).closest('tr[data-task-id]');
    if (row instanceof HTMLTableRowElement) {
      const taskId = Number(row.dataset.taskId);
      if (!Number.isFinite(taskId)) return;
      onSelectTask(taskId);
      onContextMenuRequest({ kind: 'task-grid-task', taskId }, event.clientX, event.clientY);
      return;
    }

    const inHeader = (event.target as HTMLElement).closest('thead');
    if (inHeader) {
      onContextMenuRequest({ kind: 'task-grid-header' }, event.clientX, event.clientY);
      return;
    }

    onContextMenuRequest({ kind: 'task-grid-empty' }, event.clientX, event.clientY);
  };

  return (
    <div
      className={`task-grid${isResizingColumns ? ' is-resizing-columns' : ''}`}
      ref={scrollContainerRef}
      style={layoutStyle}
      onContextMenu={handleContextMenu}
    >
      <div className="task-grid-project-banner" title={projectName}>
        {projectName}
      </div>
      <table style={{ minWidth: sumTaskGridColumnWidths(columnWidths) }}>
        <thead>
          <tr>
            {gridHeaders.map(({ columnId, className, labelKey }) => (
              <ResizableHeaderCell
                key={columnId}
                columnId={columnId}
                className={className}
                label={t(labelKey)}
                width={columnWidths[columnId]}
                onResize={handleColumnResize}
                onResizeStart={() => setIsResizingColumns(true)}
                onResizeEnd={handleColumnResizeEnd}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleTasks.map((task) => {
            const taskIndex = tasks.findIndex((t) => t.taskId === task.taskId);
            const hasChildRows = taskHasChildren(tasks, task.taskId);
            const isSelected = selectedTaskId === task.taskId;
            const isSummary = task.taskType === 'Summary';
            const isMilestone = task.taskType === 'Milestone';
            const canEditSchedule = canModify && !isSummary;
            const canEditDetails = canModify;
            const isEditingName = editingNameId === task.taskId;
            const rowClass = [
              isSelected ? 'selected' : '',
              isSummary ? 'summary-task' : '',
              showCriticalPath && task.isCritical ? 'critical-task' : '',
              task.progress >= 100 ? 'completed-task' : '',
            ]
              .filter(Boolean)
              .join(' ');
            const resourceNamesText = getTaskResourceNamesText(
              task.taskId,
              assignments,
              task.assignedTo,
            );
            const resourceAllocText = getTaskResourceAllocText(
              task.taskId,
              assignments,
              task.assignedTo,
            );
            const notesText = task.notes ?? '';
            const deliverableText = task.deliverable ?? '';

            const resourceAllocDisplay = normalizeAllocationText(resourceAllocText);
            const useMultilineAlloc =
              countTextLines(resourceNamesText) > 1 || countTextLines(resourceAllocDisplay) > 1;

            return (
              <tr
                key={task.taskId}
                className={rowClass || undefined}
                onClick={() => onSelectTask(task.taskId)}
                data-task-id={task.taskId}
              >
                <td className="col-id">{task.taskId}</td>
                <td className="col-name-cell">
                  <div className="task-tree-row">
                    {getTreeGuideSegments(tasks, taskIndex).map((segment, index) => (
                      <span
                        key={`${task.taskId}-guide-${index}`}
                        className={`task-tree-line task-tree-line-${segment.top}`}
                        style={{ left: `${segment.left}px` }}
                      />
                    ))}
                    <div
                      className="task-tree-content"
                      style={{ paddingLeft: `${getTreeIndentPx(task.indentLevel)}px` }}
                    >
                      {hasChildRows ? (
                        <button
                          type="button"
                          className="task-tree-toggle"
                          aria-label={task.isExpanded ? t('grid.collapse') : t('grid.expand')}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleExpand(task.taskId);
                          }}
                        >
                          {task.isExpanded ? '▼' : '▶'}
                        </button>
                      ) : (
                        <span className="task-tree-toggle-spacer" aria-hidden />
                      )}
                      {isEditingName ? (
                        <input
                          ref={nameInputRef}
                          className="task-grid-inline-input task-grid-name-input"
                          defaultValue={task.name}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={(e) => commitNameEdit(task, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              commitNameEdit(task, e.currentTarget.value);
                            } else if (e.key === 'Escape') {
                              setEditingNameId(null);
                            }
                          }}
                        />
                      ) : (
                        <span
                          className={[
                            canEditSchedule ? 'task-grid-name-editable' : '',
                            isSummary ? 'task-summary-name' : '',
                          ]
                            .filter(Boolean)
                            .join(' ') || undefined}
                          onDoubleClick={(e) => {
                            if (!canEditSchedule) return;
                            e.stopPropagation();
                            setEditingNameId(task.taskId);
                          }}
                          title={canEditSchedule ? t('grid.editNameHint') : undefined}
                        >
                          {task.name}
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="col-duration">
                  {canEditSchedule && !isMilestone ? (
                    <div className="col-duration-edit">
                      <input
                        type="number"
                        className="task-grid-inline-input task-grid-duration-input"
                        min={1}
                        max={999}
                        value={task.durationDays}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          onUpdateTask(task.taskId, {
                            durationDays: Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                      />
                      <span className="col-duration-unit">{t('grid.durationUnit')}</span>
                    </div>
                  ) : (
                    <span>
                      {t('grid.durationDays', {
                        count: isMilestone ? 0 : task.durationDays,
                      })}
                    </span>
                  )}
                </td>
                <td className="col-start">
                  {canEditSchedule ? (
                    <DateInput
                      className="task-grid-inline-input task-grid-date-input"
                      value={toDateInputValue(task.startDate)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(value) => commitDateChange(onUpdateTask, task, 'startDate', value)}
                    />
                  ) : (
                    formatDate(task.startDate, dateLocale)
                  )}
                </td>
                <td className="col-end">
                  {canEditSchedule && !isMilestone ? (
                    <DateInput
                      className="task-grid-inline-input task-grid-date-input"
                      value={toDateInputValue(task.endDate)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(value) => commitDateChange(onUpdateTask, task, 'endDate', value)}
                    />
                  ) : (
                    formatDate(task.endDate, dateLocale)
                  )}
                </td>
                <td className="col-progress">
                  {canEditSchedule ? (
                    <div className="col-progress-edit">
                      <PercentInput
                        inputKey={task.taskId}
                        className="task-grid-inline-input task-grid-progress-input"
                        min={0}
                        max={100}
                        value={task.progress}
                        onClick={(e) => e.stopPropagation()}
                        onCommit={(progress) => onUpdateTask(task.taskId, { progress })}
                      />
                      <span className="col-progress-unit">%</span>
                    </div>
                  ) : (
                    <span>{Math.round(task.progress)}%</span>
                  )}
                </td>
                <td className="col-type">
                  {canEditSchedule ? (
                    <TaskTypeSelect
                      className="task-grid-inline-input task-grid-type-select"
                      value={task.taskType}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(nextType) => {
                        const patch = buildTaskTypePatch(task, nextType);
                        if (Object.keys(patch).length > 0) {
                          onUpdateTask(task.taskId, patch);
                        }
                      }}
                    />
                  ) : (
                    formatTaskTypeLabel(t, task.taskType)
                  )}
                </td>
                <td className="col-multiline">
                  <div className="col-multiline-inner">
                  {canEditDetails ? (
                    <textarea
                      key={`${task.taskId}-resource-${resourceNamesText}`}
                      className="task-grid-textarea"
                      defaultValue={resourceNamesText}
                      rows={1}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => {
                        const next = e.target.value;
                        if (next !== resourceNamesText) {
                          onUpdateTaskResources(task.taskId, next, resourceAllocText);
                        }
                      }}
                    />
                  ) : (
                    <span className="task-grid-multiline">{resourceNamesText}</span>
                  )}
                  </div>
                </td>
                <td className="col-multiline col-alloc">
                  <div className="col-multiline-inner">
                  {canEditDetails ? (
                    useMultilineAlloc ? (
                      <textarea
                        key={`${task.taskId}-alloc-${resourceAllocDisplay}`}
                        className="task-grid-textarea task-grid-alloc-textarea"
                        defaultValue={resourceAllocDisplay}
                        rows={Math.max(1, countTextLines(resourceAllocDisplay))}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={(e) => {
                          const normalized = normalizeAllocationText(e.target.value);
                          if (normalized !== resourceAllocDisplay) {
                            onUpdateTaskResources(task.taskId, resourceNamesText, normalized);
                          }
                        }}
                      />
                    ) : (
                      <div className="col-alloc-edit">
                        <input
                          type="number"
                          className="task-grid-inline-input task-grid-alloc-input"
                          min={0}
                          max={100}
                          defaultValue={resourceAllocDisplay.replace(/%/g, '').trim()}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={(e) => {
                            const normalized = normalizeAllocationText(e.target.value);
                            if (normalized !== resourceAllocDisplay) {
                              onUpdateTaskResources(task.taskId, resourceNamesText, normalized);
                            }
                          }}
                        />
                        <span className="col-alloc-unit">%</span>
                      </div>
                    )
                  ) : (
                    <span className="task-grid-multiline task-grid-alloc-text">{resourceAllocDisplay}</span>
                  )}
                  </div>
                </td>
                <td className="col-multiline">
                  <div className="col-multiline-inner">
                  {canEditDetails ? (
                    <textarea
                      key={`${task.taskId}-deliverable-${deliverableText}`}
                      className="task-grid-textarea"
                      defaultValue={deliverableText}
                      rows={1}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => {
                        const next = e.target.value;
                        if (next !== deliverableText) {
                          onUpdateTask(task.taskId, { deliverable: next });
                        }
                      }}
                    />
                  ) : (
                    <span className="task-grid-multiline">{deliverableText}</span>
                  )}
                  </div>
                </td>
                <td className="col-multiline">
                  <div className="col-multiline-inner">
                  {canEditDetails ? (
                    <textarea
                      key={`${task.taskId}-notes-${notesText}`}
                      className="task-grid-textarea"
                      defaultValue={notesText}
                      rows={1}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => {
                        const next = e.target.value;
                        if (next !== notesText) {
                          onUpdateTask(task.taskId, { notes: next });
                        }
                      }}
                    />
                  ) : (
                    <span className="task-grid-multiline">{notesText}</span>
                  )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        {noteSpacerHeight > 0 && (
          <tfoot>
            <tr className="task-grid-note-spacer" aria-hidden="true">
              <td colSpan={gridHeaders.length} style={{ height: noteSpacerHeight }} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
