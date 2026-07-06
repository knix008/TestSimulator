import type { GanttViewSettings } from '@web/types/project';
import { ToolbarIcon } from '@web/components/ToolbarIcons';
import { useLanguage } from '@web/i18n';
import './DesktopDependencyTypeSelector.css';

const DEP_TYPES: GanttViewSettings['defaultDependencyType'][] = ['FS', 'FF', 'SS', 'SF'];

interface DesktopDependencyTypeSelectorProps {
  value: GanttViewSettings['defaultDependencyType'];
  onChange: (type: GanttViewSettings['defaultDependencyType']) => void;
}

const ICON_BY_TYPE: Record<GanttViewSettings['defaultDependencyType'], 'depFs' | 'depFf' | 'depSs' | 'depSf'> = {
  FS: 'depFs',
  FF: 'depFf',
  SS: 'depSs',
  SF: 'depSf',
};

export function DesktopDependencyTypeSelector({ value, onChange }: DesktopDependencyTypeSelectorProps) {
  const { locale } = useLanguage();
  const label = locale === 'en' ? 'Dep type' : '의존 유형';

  return (
    <label className="desktop-dep-selector">
      <span className="desktop-dep-selector__label">{label}</span>
      <ToolbarIcon name={ICON_BY_TYPE[value]} />
      <select
        className="desktop-dep-selector__select"
        value={value}
        onChange={(event) => onChange(event.target.value as GanttViewSettings['defaultDependencyType'])}
        title={label}
      >
        {DEP_TYPES.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
    </label>
  );
}
