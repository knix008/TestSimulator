import { useEffect, useState } from 'react';
import type { DependencyItem, TaskItem } from '../types/project';
import { useTranslation } from '../i18n';
import {
  buildTaskPropertiesPatch,
  taskToPropertiesDraft,
  type TaskPropertiesDraft,
} from '../utils/taskPropertiesDraft';
import { TaskPropertiesFields } from './TaskPropertiesFields';
import './TaskPropertiesDialog.css';

interface TaskPropertiesDialogProps {
  open: boolean;
  task: TaskItem | null;
  tasks: TaskItem[];
  predecessors: DependencyItem[];
  canModify: boolean;
  onClose: () => void;
  onSave: (taskId: number, patch: Partial<TaskItem>) => void;
  onRemoveDependency: (predecessorId: number, successorId: number) => void;
  onUpdateDependencyType?: (
    predecessorId: number,
    successorId: number,
    type: import('../types/project').GanttViewSettings['defaultDependencyType'],
  ) => void;
}

export function TaskPropertiesDialog({
  open,
  task,
  tasks,
  predecessors,
  canModify,
  onClose,
  onSave,
  onRemoveDependency,
  onUpdateDependencyType,
}: TaskPropertiesDialogProps) {
  const t = useTranslation();
  const [draft, setDraft] = useState<TaskPropertiesDraft | null>(null);

  useEffect(() => {
    if (!open || !task) {
      setDraft(null);
      return;
    }
    setDraft(taskToPropertiesDraft(task));
  }, [open, task?.taskId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open || !task || !draft) return null;

  const handleSave = () => {
    const patch = buildTaskPropertiesPatch(task, draft);
    if (Object.keys(patch).length > 0) {
      onSave(task.taskId, patch);
    }
    onClose();
  };

  return (
    <div
      className="task-properties-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="task-properties-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-properties-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="task-properties-title">{t('taskProps.title')}</h2>
          <button type="button" className="panel-close-button" onClick={onClose}>
            {t('common.close')}
          </button>
        </header>

        <div className="task-properties-dialog-form">
          <TaskPropertiesFields
            task={task}
            tasks={tasks}
            predecessors={predecessors}
            canModify={canModify}
            values={draft}
            onChange={setDraft}
            onRemoveDependency={onRemoveDependency}
            onUpdateDependencyType={onUpdateDependencyType}
          />
        </div>

        <footer className="task-properties-dialog-actions">
          <button type="button" className="panel-footer-button" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="panel-footer-button primary"
            onClick={handleSave}
            disabled={!canModify}
          >
            {t('common.save')}
          </button>
        </footer>
      </div>
    </div>
  );
}
