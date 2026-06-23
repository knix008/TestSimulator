import type { DependencyItem, TaskItem } from '../types/project';
import { getTaskName } from '../utils/scheduleUtils';
import { getParentTask } from '../utils/taskModel';
import { parseDateInputValue, toDateInputValue } from '../utils/taskDateInput';

interface TaskPropertiesPanelProps {
  task: TaskItem | null;
  tasks: TaskItem[];
  predecessors: DependencyItem[];
  canModify: boolean;
  onUpdateTask: (taskId: number, patch: Partial<TaskItem>) => void;
  onRemoveDependency: (predecessorId: number, successorId: number) => void;
}

export function TaskPropertiesPanel({
  task,
  tasks,
  predecessors,
  canModify,
  onUpdateTask,
  onRemoveDependency,
}: TaskPropertiesPanelProps) {
  if (!task) {
    return <span>작업을 선택하세요.</span>;
  }

  const isSummary = task.taskType === 'Summary';
  const isMilestone = task.taskType === 'Milestone';
  const readOnly = !canModify || isSummary;
  const parentTask = getParentTask(tasks, task.taskId);

  return (
    <div className="task-properties-form">
      {parentTask && (
        <label className="task-prop-field">
          <span>상위 작업</span>
          <input type="text" value={parentTask.name} readOnly />
        </label>
      )}

      <label className="task-prop-field task-prop-name">
        <span>작업 이름</span>
        <input
          type="text"
          value={task.name}
          readOnly={readOnly}
          onChange={(e) => onUpdateTask(task.taskId, { name: e.target.value })}
        />
      </label>

      <label className="task-prop-field">
        <span>시작일</span>
        <input
          type="date"
          value={toDateInputValue(task.startDate)}
          disabled={readOnly}
          onChange={(e) => {
            if (!e.target.value) return;
            onUpdateTask(task.taskId, {
              startDate: parseDateInputValue(e.target.value).toISOString(),
            });
          }}
        />
      </label>

      <label className="task-prop-field">
        <span>종료일</span>
        <input
          type="date"
          value={toDateInputValue(task.endDate)}
          disabled={readOnly || isMilestone}
          onChange={(e) => {
            if (!e.target.value) return;
            onUpdateTask(task.taskId, {
              endDate: parseDateInputValue(e.target.value).toISOString(),
            });
          }}
        />
      </label>

      <label className="task-prop-field">
        <span>기간(일)</span>
        <input
          type="number"
          min={1}
          value={isMilestone ? 1 : task.durationDays}
          readOnly={readOnly || isMilestone}
          onChange={(e) =>
            onUpdateTask(task.taskId, { durationDays: Math.max(1, Number(e.target.value) || 1) })
          }
        />
      </label>

      <label className="task-prop-field">
        <span>진행률(%)</span>
        <input
          type="number"
          min={0}
          max={100}
          value={Math.round(task.progress)}
          readOnly={readOnly}
          onChange={(e) =>
            onUpdateTask(task.taskId, {
              progress: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
            })
          }
        />
      </label>

      <label className="task-prop-field">
        <span>유형</span>
        <select
          value={task.taskType}
          disabled={readOnly || isSummary}
          onChange={(e) => onUpdateTask(task.taskId, { taskType: e.target.value })}
        >
          <option value="Normal">Normal</option>
          <option value="Milestone">Milestone</option>
          {isSummary && <option value="Summary">Summary</option>}
        </select>
      </label>

      <label className="task-prop-field task-prop-notes">
        <span>메모</span>
        <input
          type="text"
          value={task.notes}
          readOnly={!canModify}
          placeholder="메모"
          onChange={(e) => onUpdateTask(task.taskId, { notes: e.target.value })}
        />
      </label>

      {predecessors.length > 0 && (
        <span className="project-predecessors">
          선행:
          {predecessors.map((dep) => (
            <span
              key={`${dep.predecessorId}-${dep.successorId}`}
              className="project-predecessor-chip"
            >
              {getTaskName(tasks, dep.predecessorId)} ({dep.type})
              {canModify && (
                <button
                  type="button"
                  className="project-predecessor-remove"
                  title="의존성 제거"
                  onClick={() => onRemoveDependency(dep.predecessorId, dep.successorId)}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
