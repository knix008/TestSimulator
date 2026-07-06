import type { GanttViewSettings } from '@web/types/project';
import { DependencyTypeSelector } from '@web/components/DependencyTypeSelector';
import { useLanguage } from '@web/i18n';
import './DesktopDependencyTypeSelector.css';

interface DesktopDependencyTypeSelectorProps {
  value: GanttViewSettings['defaultDependencyType'];
  onChange: (type: GanttViewSettings['defaultDependencyType']) => void;
}

export function DesktopDependencyTypeSelector({ value, onChange }: DesktopDependencyTypeSelectorProps) {
  const { locale } = useLanguage();
  const label = locale === 'en' ? 'Dep type' : '의존 유형';

  return (
    <DependencyTypeSelector
      className="desktop-dep-selector"
      label={label}
      value={value}
      onChange={onChange}
    />
  );
}
