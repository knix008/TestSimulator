import type { TaskItem } from '@web/types/project';
import { useLanguage } from '@web/i18n';
import './DesktopStatusBar.css';

interface DesktopStatusBarProps {
  filePath: string | null;
  projectName: string;
  selectedTask: TaskItem | null;
  taskCount: number;
  dependencyCount: number;
  isModified: boolean;
}

export function DesktopStatusBar({
  filePath,
  projectName,
  selectedTask,
  taskCount,
  dependencyCount,
  isModified,
}: DesktopStatusBarProps) {
  const { locale } = useLanguage();
  const ko = locale !== 'en';

  return (
    <footer className="desktop-status-bar">
      <span className="desktop-status-bar__item" title={filePath ?? projectName}>
        {filePath ?? projectName}
        {isModified ? ' *' : ''}
      </span>
      <span className="desktop-status-bar__sep" />
      <span className="desktop-status-bar__item">
        {ko ? `작업 ${taskCount}` : `${taskCount} tasks`}
      </span>
      <span className="desktop-status-bar__sep" />
      <span className="desktop-status-bar__item">
        {ko ? `의존 ${dependencyCount}` : `${dependencyCount} deps`}
      </span>
      {selectedTask && (
        <>
          <span className="desktop-status-bar__sep" />
          <span className="desktop-status-bar__item">
            {ko ? `선택: #${selectedTask.taskId} ${selectedTask.name}` : `Selected: #${selectedTask.taskId} ${selectedTask.name}`}
          </span>
        </>
      )}
    </footer>
  );
}
