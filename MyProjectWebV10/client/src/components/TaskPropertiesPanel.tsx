import type { DependencyItem, TaskItem } from '../types/project';
import { useTranslation } from '../i18n';
import { parseDateInputValue } from '../utils/taskDateInput';
import {
  taskToPropertiesDraft,
  type TaskPropertiesDraft,
} from '../utils/taskPropertiesDraft';
import { TaskPropertiesFields } from './TaskPropertiesFields';

interface TaskPropertiesPanelProps {
  task: TaskItem | null;
  tasks: TaskItem[];
  predecessors: DependencyItem[];
  canModify: boolean;
  onUpdateTask: (taskId: number, patch: Partial<TaskItem>) => void;
  onRemoveDependency: (predecessorId: number, successorId: number) => void;
}

function applyFieldChange(
  field: keyof TaskPropertiesDraft,
  value: TaskPropertiesDraft[keyof TaskPropertiesDraft],
): Partial<TaskItem> {
  switch (field) {
    case 'name':
      return { name: value as string };
    case 'notes':
      return { notes: value as string };
    case 'progress':
      return { progress: value as number };
    case 'taskType':
      return { taskType: value as string };
    case 'startDate':
      return { startDate: parseDateInputValue(value as string).toISOString() };
    case 'endDate':
      return { endDate: parseDateInputValue(value as string).toISOString() };
    case 'durationDays':
      return { durationDays: Math.max(1, value as number) };
    default:
      return {};
  }
}

export function TaskPropertiesPanel({
  task,
  tasks,
  predecessors,
  canModify,
  onUpdateTask,
  onRemoveDependency,
}: TaskPropertiesPanelProps) {
  const t = useTranslation();

  if (!task) {
    return <span>{t('taskProps.selectTask')}</span>;
  }

  const values = taskToPropertiesDraft(task);

  return (
    <div className="task-properties-form">
      <TaskPropertiesFields
        task={task}
        tasks={tasks}
        predecessors={predecessors}
        canModify={canModify}
        values={values}
        onChange={(next) => {
          for (const field of Object.keys(next) as (keyof TaskPropertiesDraft)[]) {
            if (next[field] !== values[field]) {
              onUpdateTask(task.taskId, applyFieldChange(field, next[field]));
              break;
            }
          }
        }}
        onRemoveDependency={onRemoveDependency}
      />
    </div>
  );
}
