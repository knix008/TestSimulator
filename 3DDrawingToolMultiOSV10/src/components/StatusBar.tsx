import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';

export default function StatusBar() {
  const { t } = useTranslation();
  const objects = useAppStore((s) => s.objects);
  const selectedId = useAppStore((s) => s.selectedId);
  const tool = useAppStore((s) => s.tool);
  const viewScale = useAppStore((s) => s.viewScale);
  const projectName = useAppStore((s) => s.projectName);
  const selected = objects.find((o) => o.id === selectedId);

  const toolLabel = t(`tools.${tool}`, { defaultValue: tool });

  return (
    <footer className="status-bar">
      <span className="status-item">
        {t('status.project')}: {projectName}
      </span>
      <span className="status-sep" aria-hidden />
      <span className="status-item">
        {t('status.objects')}: {objects.length}
      </span>
      <span className="status-sep" aria-hidden />
      <span className="status-item">
        {t('status.selected')}: {selected ? selected.name : '—'}
      </span>
      <span className="status-sep" aria-hidden />
      <span className="status-item">
        {t('status.tool')}: {toolLabel}
      </span>
      <span className="status-sep" aria-hidden />
      <span className="status-item">
        {t('status.viewScale')}: {viewScale}%
      </span>
      <span className="status-item right">
        {t('status.ready')} · SHKWON
      </span>
    </footer>
  );
}
