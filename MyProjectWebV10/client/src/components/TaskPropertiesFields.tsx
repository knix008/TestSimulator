import type { DependencyItem, GanttViewSettings, TaskItem } from '../types/project';
import { useTranslation } from '../i18n';
import { getTaskName } from '../utils/scheduleUtils';
import { getParentTask } from '../utils/taskModel';
import type { TaskPropertiesDraft } from '../utils/taskPropertiesDraft';
import {
  NORMAL_BAR_FILL,
  NORMAL_BAR_PROGRESS,
  SUMMARY_BAR_FILL,
  SUMMARY_BAR_PROGRESS,
} from '../utils/ganttBarDecorations';
import { DateInput } from './DateInput';
import { PercentInput } from './PercentInput';
import { TaskColorField } from './TaskColorField';
import { DependencyTypeSelector } from './DependencyTypeSelector';
import { SUMMARY_BAR_STYLES } from '../utils/summaryBarStyle';
import { buildTaskTypePatch } from '../utils/taskTypeOptions';
import { formatTaskTypeLabel, TaskTypeSelect } from './TaskTypeSelect';

function normalizeDependencyType(type: string): GanttViewSettings['defaultDependencyType'] {
  if (type === 'FS' || type === 'FF' || type === 'SS' || type === 'SF') return type;
  return 'FS';
}

interface TaskPropertiesFieldsProps {
  task: TaskItem;
  tasks: TaskItem[];
  predecessors: DependencyItem[];
  canModify: boolean;
  values: TaskPropertiesDraft;
  onChange: (values: TaskPropertiesDraft) => void;
  onRemoveDependency: (predecessorId: number, successorId: number) => void;
  onUpdateDependencyType?: (
    predecessorId: number,
    successorId: number,
    type: GanttViewSettings['defaultDependencyType'],
  ) => void;
}
export function TaskPropertiesFields({
  task,
  tasks,
  predecessors,
  canModify,
  values,
  onChange,
  onRemoveDependency,
  onUpdateDependencyType,
}: TaskPropertiesFieldsProps) {
  const t = useTranslation();
  const isSummary = task.taskType === 'Summary';
  const isMilestone = values.taskType === 'Milestone';
  const readOnly = !canModify || isSummary;
  const parentTask = getParentTask(tasks, task.taskId);
  const defaultBarHex = isSummary ? SUMMARY_BAR_FILL : NORMAL_BAR_FILL;
  const defaultProgressHex = isSummary ? SUMMARY_BAR_PROGRESS : NORMAL_BAR_PROGRESS;

  const setField = <K extends keyof TaskPropertiesDraft>(
    field: K,
    value: TaskPropertiesDraft[K],
  ) => {
    if (field === 'taskType') {
      const patch = buildTaskTypePatch(
        { taskType: values.taskType, durationDays: values.durationDays },
        value as 'Normal' | 'Summary' | 'Milestone',
      );
      onChange({ ...values, ...patch });
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
        {readOnly ? (
          <input type="text" readOnly value={formatTaskTypeLabel(t, values.taskType)} />
        ) : (
          <TaskTypeSelect
            value={values.taskType}
            onChange={(nextType) => setField('taskType', nextType)}
          />
        )}
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

      <TaskColorField
        label={t('taskProps.barColor')}
        value={values.barColorArgb}
        defaultHex={defaultBarHex}
        disabled={!canModify}
        onChange={(barColorArgb) => setField('barColorArgb', barColorArgb)}
      />

      <TaskColorField
        label={t('taskProps.progressColor')}
        value={values.progressColorArgb}
        defaultHex={defaultProgressHex}
        disabled={!canModify}
        onChange={(progressColorArgb) => setField('progressColorArgb', progressColorArgb)}
      />

      {isSummary && (
        <label className="task-prop-field">
          <span>{t('taskProps.barShape')}</span>
          <select
            value={values.summaryBarStyle}
            disabled={!canModify}
            onChange={(event) =>
              setField('summaryBarStyle', event.target.value as TaskPropertiesDraft['summaryBarStyle'])
            }
          >
            {SUMMARY_BAR_STYLES.map((style) => (
              <option key={style} value={style}>
                {t(`taskProps.barShape.${style}`)}
              </option>
            ))}
          </select>
        </label>
      )}

      {predecessors.length > 0 && (
        <div className="task-prop-predecessors">
          <span className="task-prop-predecessors__heading">{t('taskProps.predecessors')}</span>
          <div className="task-prop-predecessor-columns" aria-hidden="true">
            <span className="task-prop-predecessor-columns__name">{t('taskProps.predecessorTask')}</span>
            <span className="task-prop-predecessor-columns__type">{t('taskProps.depLinkType')}</span>
          </div>
          <ul className="task-prop-predecessor-list">
            {predecessors.map((dep) => (
              <li
                key={`${dep.predecessorId}-${dep.successorId}`}
                className="task-prop-predecessor-row"
              >
                <span className="task-prop-predecessor-name" title={getTaskName(tasks, dep.predecessorId)}>
                  {getTaskName(tasks, dep.predecessorId)}
                </span>
                <DependencyTypeSelector
                  className="task-prop-predecessor-type"
                  value={normalizeDependencyType(dep.type)}
                  disabled={!canModify || !onUpdateDependencyType}
                  onChange={(type) =>
                    onUpdateDependencyType?.(dep.predecessorId, dep.successorId, type)
                  }
                />
                {canModify && (
                  <button
                    type="button"
                    className="project-predecessor-remove task-prop-predecessor-remove"
                    title={t('taskProps.removeDependency')}
                    onClick={() => onRemoveDependency(dep.predecessorId, dep.successorId)}
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
