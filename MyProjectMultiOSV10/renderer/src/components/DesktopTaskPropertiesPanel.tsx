import { TaskPropertiesPanel } from '@web/components/TaskPropertiesPanel';
import type { DependencyItem, NoteItem, TaskItem } from '@web/types/project';
import { useTranslation } from '@web/i18n';
import './DesktopTaskPropertiesPanel.css';

interface DesktopTaskPropertiesPanelProps {
  task: TaskItem | null;
  note: NoteItem | null;
  tasks: TaskItem[];
  predecessors: DependencyItem[];
  canModify: boolean;
  onClose: () => void;
  onUpdateTask: (taskId: number, patch: Partial<TaskItem>) => void;
  onUpdateNote: (noteId: number, patch: Partial<Pick<NoteItem, 'title' | 'body'>>) => void;
  onRemoveDependency: (predecessorId: number, successorId: number) => void;
  onUpdateDependencyType?: (
    predecessorId: number,
    successorId: number,
    type: import('@web/types/project').GanttViewSettings['defaultDependencyType'],
  ) => void;
}

export function DesktopTaskPropertiesPanel({
  task,
  note,
  tasks,
  predecessors,
  canModify,
  onClose,
  onUpdateTask,
  onUpdateNote,
  onRemoveDependency,
  onUpdateDependencyType,
}: DesktopTaskPropertiesPanelProps) {
  const t = useTranslation();
  const linkedTask =
    note && note.taskId >= 0 ? tasks.find((entry) => entry.taskId === note.taskId) ?? null : null;
  const linkedTaskLabel = linkedTask
    ? t('noteProps.forTask', { id: linkedTask.taskId, name: linkedTask.name })
    : t('noteProps.noLinkedTask');
  const panelTitle = note ? t('noteProps.title') : t('taskProps.title');

  return (
    <div className="desktop-task-properties">
      <header className="desktop-task-properties__header">
        <div className="desktop-task-properties__heading">
          <h3 className="desktop-task-properties__title">{panelTitle}</h3>
          {note && <p className="desktop-task-properties__subtitle">{linkedTaskLabel}</p>}
        </div>
        <button
          type="button"
          className="panel-close-button desktop-task-properties__close"
          onClick={onClose}
          title={t('common.close')}
          aria-label={t('common.close')}
        >
          {t('common.close')}
        </button>
      </header>
      <div className="desktop-task-properties__body">
        {note ? (
          <div className="task-properties-form desktop-note-properties-form">
            <label className="task-prop-field">
              <span>{t('noteProps.linkedTask')}</span>
              <input type="text" value={linkedTaskLabel} readOnly disabled />
            </label>
            <label className="task-prop-field">
              <span>{t('noteProps.noteTitle')}</span>
              <input
                type="text"
                value={note.title}
                disabled={!canModify}
                onChange={(event) => onUpdateNote(note.noteId, { title: event.target.value })}
              />
            </label>
            <label className="task-prop-field">
              <span>{t('noteProps.body')}</span>
              <textarea
                rows={8}
                value={note.body}
                disabled={!canModify}
                onChange={(event) => onUpdateNote(note.noteId, { body: event.target.value })}
              />
            </label>
          </div>
        ) : (
          <TaskPropertiesPanel
            task={task}
            tasks={tasks}
            predecessors={predecessors}
            canModify={canModify}
            onUpdateTask={onUpdateTask}
            onRemoveDependency={onRemoveDependency}
            onUpdateDependencyType={onUpdateDependencyType}
          />
        )}
      </div>
    </div>
  );
}
