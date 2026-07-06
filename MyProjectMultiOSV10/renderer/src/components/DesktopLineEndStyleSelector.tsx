import type { GanttViewSettings } from '@web/types/project';
import { LineEndStyleSelector } from '@web/components/LineEndStyleSelector';
import { useTranslation } from '@web/i18n';
import './DesktopLineEndStyleSelector.css';

interface DesktopLineEndStyleSelectorProps {
  startLineEnd: GanttViewSettings['startLineEnd'];
  endLineEnd: GanttViewSettings['endLineEnd'];
  onStartLineEndChange: (style: GanttViewSettings['startLineEnd']) => void;
  onEndLineEndChange: (style: GanttViewSettings['endLineEnd']) => void;
}

export function DesktopLineEndStyleSelector({
  startLineEnd,
  endLineEnd,
  onStartLineEndChange,
  onEndLineEndChange,
}: DesktopLineEndStyleSelectorProps) {
  const t = useTranslation();

  return (
    <div className="desktop-line-end-selectors">
      <LineEndStyleSelector
        className="desktop-line-end-selector"
        label={t('settings.gantt.startLineEnd')}
        value={startLineEnd}
        atStart
        onChange={onStartLineEndChange}
      />
      <LineEndStyleSelector
        className="desktop-line-end-selector"
        label={t('settings.gantt.endLineEnd')}
        value={endLineEnd}
        atStart={false}
        onChange={onEndLineEndChange}
      />
    </div>
  );
}
