import type { DependencyItem, TaskItem } from '../types/project';
import { useTranslation } from '../i18n';
import { getTaskName } from '../utils/scheduleUtils';
import { getParentTask } from '../utils/taskModel';
import type { TaskPropertiesDraft } from '../utils/taskPropertiesDraft';
import { DateInput } from './DateInput';
import { PercentInput } from './PercentInput';

interface TaskPropertiesFieldsProps {
  task: TaskItem;
  tasks: TaskItem[];
  predecessors: DependencyItem[];
  canModify: boolean;
  values: TaskPropertiesDraft;
  onChange: (values: TaskPropertiesDraft) => void;
  onRemoveDependency: (predecessorId: number, successorId: number) => void;
}

export function TaskPropertiesFields({
  task,
  tasks,
  predecessors,
  canModify,
  values,
  onChange,
  onRemoveDependency,
}: TaskPropertiesFieldsProps) {
  const t = useTranslation();
  const isSummary = task.taskType === 'Summary';
  const isMilestone = values.taskType === 'Milestone';
  const readOnly = !canModify || isSummary;
  const parentTask = getParentTask(tasks, task.taskId);

  const setField = <K extends keyof TaskPropertiesDraft>(
    field: K,
    value: TaskPropertiesDraft[K],
  ) => {
    if (field === 'taskType' && value === 'Milestone') {
      onChange({ ...values, taskType: 'Milestone', durationDays: 0 });
      return;
    }
    if (field === 'taskType' && value !== 'Milestone' && values.taskType === 'Milestone') {
      onChange({
        ...values,
        taskType: value as string,
        durationDays: Math.max(1, values.durationDays || 1),
      });
      return;
    }
    onChange({ ...values, [field]: value });
  };

  return (
    <>
      {parentTask && (
        <label className="task-prop-field">
          <span>{t('taskProps.parent')}</span>
          <input type="text" value={parentTask.name} readOnly />
        </label>
      )}

      <label className="task-prop-field task-prop-name">
        <span>{t('taskProps.name')}</span>
        <input
          type="text"
          value={values.name}
          readOnly={readOnly}
          onChange={(e) => setField('name', e.target.value)}
        />
      </label>

      <label className="task-prop-field">
        <span>{t('taskProps.start')}</span>
        <DateInput
          value={values.startDate}
          disabled={readOnly}
          onChange={(value) => setField('startDate', value)}
        />
      </label>

      <label className="task-prop-field">
        <span>{t('taskProps.end')}</span>
        <DateInput
          value={values.endDate}
          disabled={readOnly || isMilestone}
          onChange={(value) => setField('endDate', value)}
        />
      </label>

      <label className="task-prop-field">
        <span>{t('taskProps.duration')}</span>
        <input
          type="number"
          min={0}
          value={isMilestone ? 0 : values.durationDays}
          readOnly={readOnly || isMilestone}
          onChange={(e) =>
            setField('durationDays', Math.max(1, Number(e.target.value) || 1))
          }
        />
      </label>

      <label className="task-prop-field">
        <span>{t('taskProps.progress')}</span>
        <PercentInput
          inputKey={task.taskId}
          min={0}
          max={100}
          value={values.progress}
          readOnly={readOnly}
          onCommit={(progress) => setField('progress', progress)}
        />
      </label>

      <label className="task-prop-field">
        <span>{t('taskProps.type')}</span>
        <select
          value={values.taskType}
          disabled={readOnly || isSummary}
          onChange={(e) => setField('taskType', e.target.value)}
        >
          <option value="Normal">Normal</option>
          <option value="Milestone">Milestone</option>
          {isSummary && <option value="Summary">Summary</option>}
        </select>
      </label>

      <label className="task-prop-field task-prop-notes">
        <span>{t('taskProps.notes')}</span>
        <input
          type="text"
          value={values.notes}
          readOnly={!canModify}
          placeholder={t('taskProps.notesPlaceholder')}
          onChange={(e) => setField('notes', e.target.value)}
        />
      </label>

      {predecessors.length > 0 && (
        <span className="project-predecessors">
          {t('taskProps.predecessors')}
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
                  title={t('taskProps.removeDependency')}
                  onClick={() => onRemoveDependency(dep.predecessorId, dep.successorId)}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </span>
      )}
    </>
  );
}
