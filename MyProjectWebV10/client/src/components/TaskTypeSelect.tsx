import { useTranslation } from '../i18n';
import type { TranslateFn } from '../i18n/types';
import {
  getTaskTypeOptions,
  isTaskTypeValue,
  type TaskTypeValue,
} from '../utils/taskTypeOptions';

interface TaskTypeSelectProps {
  value: string;
  includeSummary?: boolean;
  disabled?: boolean;
  className?: string;
  onClick?: (event: React.MouseEvent<HTMLSelectElement>) => void;
  onChange: (taskType: TaskTypeValue) => void;
}

export function TaskTypeSelect({
  value,
  includeSummary = false,
  disabled = false,
  className,
  onClick,
  onChange,
}: TaskTypeSelectProps) {
  const t = useTranslation();
  const options = getTaskTypeOptions(includeSummary);
  const selectedValue = isTaskTypeValue(value) ? value : 'Normal';

  return (
    <select
      className={className}
      value={selectedValue}
      disabled={disabled}
      onClick={onClick}
      onChange={(event) => {
        const next = event.target.value;
        if (isTaskTypeValue(next)) {
          onChange(next);
        }
      }}
    >
      {options.map((taskType) => (
        <option key={taskType} value={taskType}>
          {t(`taskType.${taskType}`)}
        </option>
      ))}
    </select>
  );
}

export function formatTaskTypeLabel(t: TranslateFn, taskType: string): string {
  return isTaskTypeValue(taskType) ? t(`taskType.${taskType}`) : taskType;
}
