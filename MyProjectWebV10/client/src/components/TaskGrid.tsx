import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import type { TaskItem } from '../types/project';
import { GANTT_HEADER_HEIGHT, GANTT_ROW_HEIGHT } from '../config/ganttLayout';
import { getVisibleTasks, taskHasChildren } from '../utils/taskModel';
import {
  getTreeGuideSegments,
  getTreeIndentPx,
} from '../utils/taskTreeLayout';
import './TaskGrid.css';

interface TaskGridProps {
  tasks: TaskItem[];
  selectedTaskId: number | null;
  canModify: boolean;
  showCriticalPath?: boolean;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
  onSelectTask: (taskId: number) => void;
  onUpdateTask: (taskId: number, patch: Partial<TaskItem>) => void;
  onToggleExpand: (taskId: number) => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR');
}

export function TaskGrid({
  tasks,
  selectedTaskId,
  canModify,
  showCriticalPath = false,
  scrollContainerRef,
  onSelectTask,
  onUpdateTask,
  onToggleExpand,
}: TaskGridProps) {
  const [editingNameId, setEditingNameId] = useState<number | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const visibleTasks = getVisibleTasks(tasks);

  useEffect(() => {
    if (editingNameId != null) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [editingNameId]);

  const layoutStyle = {
    '--task-grid-row-height': `${GANTT_ROW_HEIGHT}px`,
    '--task-grid-header-height': `${GANTT_HEADER_HEIGHT}px`,
  } as CSSProperties;

  const commitNameEdit = (task: TaskItem, value: string) => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== task.name) {
      onUpdateTask(task.taskId, { name: trimmed });
    }
    setEditingNameId(null);
  };

  return (
    <div className="task-grid" ref={scrollContainerRef} style={layoutStyle}>
      <table>
        <thead>
          <tr>
            <th className="col-id">ID</th>
            <th className="col-name">작업 이름</th>
            <th className="col-duration">기간</th>
            <th className="col-start">시작</th>
            <th className="col-end">종료</th>
            <th className="col-progress">진행률</th>
            <th className="col-type">유형</th>
          </tr>
        </thead>
        <tbody>
          {visibleTasks.map((task) => {
            const taskIndex = tasks.findIndex((t) => t.taskId === task.taskId);
            const hasChildRows = taskHasChildren(tasks, task.taskId);
            const isSelected = selectedTaskId === task.taskId;
            const isSummary = task.taskType === 'Summary';
            const isMilestone = task.taskType === 'Milestone';
            const canEditRow = canModify && !isSummary;
            const isEditingName = editingNameId === task.taskId;
            const rowClass = [
              isSelected ? 'selected' : '',
              isSummary ? 'summary-task' : '',
              showCriticalPath && task.isCritical ? 'critical-task' : '',
            ]
              .filter(Boolean)
              .join(' ');


            return (
              <tr
                key={task.taskId}
                className={rowClass || undefined}
                onClick={() => onSelectTask(task.taskId)}
              >
                <td>{task.taskId}</td>
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
                          aria-label={task.isExpanded ? '하위 작업 접기' : '하위 작업 펼치기'}
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
                            canEditRow ? 'task-grid-name-editable' : '',
                            isSummary ? 'task-summary-name' : '',
                          ]
                            .filter(Boolean)
                            .join(' ') || undefined}
                          onDoubleClick={(e) => {
                            if (!canEditRow) return;
                            e.stopPropagation();
                            setEditingNameId(task.taskId);
                          }}
                          title={canEditRow ? '더블클릭하여 이름 편집' : undefined}
                        >
                          {task.name}
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td>
                  {canEditRow && !isMilestone ? (
                    <input
                      type="number"
                      className="task-grid-inline-input task-grid-num-input"
                      min={1}
                      value={task.durationDays}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        onUpdateTask(task.taskId, {
                          durationDays: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                    />
                  ) : (
                    <span>{isMilestone ? '0일' : `${task.durationDays}일`}</span>
                  )}
                </td>
                <td>{formatDate(task.startDate)}</td>
                <td>{formatDate(task.endDate)}</td>
                <td>
                  {canEditRow ? (
                    <input
                      type="number"
                      className="task-grid-inline-input task-grid-num-input"
                      min={0}
                      max={100}
                      value={Math.round(task.progress)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        onUpdateTask(task.taskId, {
                          progress: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                        })
                      }
                    />
                  ) : (
                    <span>{Math.round(task.progress)}%</span>
                  )}
                </td>
                <td>{task.taskType}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
