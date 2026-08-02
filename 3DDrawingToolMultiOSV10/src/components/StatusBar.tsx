import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';

export default function StatusBar() {
  const { t } = useTranslation();
  const objects = useAppStore((s) => s.objects);
  const selectedId = useAppStore((s) => s.selectedId);
  const selected = objects.find((o) => o.id === selectedId);

  return (
    <footer className="status-bar">
      <span>
        {t('status.objects')}: {objects.length}
      </span>
      <span>
        {t('status.selected')}: {selected ? selected.name : '—'}
      </span>
      <span className="right">{t('status.ready')} · SHKWON</span>
    </footer>
  );
}
