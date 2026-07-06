import { useEffect, useRef, useState } from 'react';
import type { GanttViewSettings } from '../types/project';
import { useTranslation } from '../i18n';
import type { KoTranslationKey } from '../i18n/locales/ko';
import { DependencyTypePreview } from './DependencyTypePreview';
import './DependencyTypeSelector.css';

const DEP_TYPES: GanttViewSettings['defaultDependencyType'][] = ['FS', 'FF', 'SS', 'SF'];

interface DependencyTypeSelectorProps {
  value: GanttViewSettings['defaultDependencyType'];
  onChange: (type: GanttViewSettings['defaultDependencyType']) => void;
  className?: string;
  label?: string;
  disabled?: boolean;
}

export function DependencyTypeSelector({
  value,
  onChange,
  className,
  label,
  disabled = false,
}: DependencyTypeSelectorProps) {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const selectType = (type: GanttViewSettings['defaultDependencyType']) => {
    onChange(type);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={['dep-type-selector', className].filter(Boolean).join(' ')}>
      {label ? <span className="dep-type-selector__heading">{label}</span> : null}
      <button
        type="button"
        className={`dep-type-selector__trigger${open ? ' dep-type-selector__trigger--open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        title={t(`depType.${value}` as KoTranslationKey)}
        onClick={() => setOpen((current) => !current)}
      >
        <DependencyTypePreview type={value} className="dep-type-selector__preview" />
        <span className="dep-type-selector__value">{value}</span>
        <span className="dep-type-selector__caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open ? (
        <ul className="dep-type-selector__menu" role="listbox" aria-label={label ?? t(`depType.${value}`)}>
          {DEP_TYPES.map((type) => {
            const selected = type === value;
            return (
              <li key={type} role="option" aria-selected={selected}>
                <button
                  type="button"
                  className={`dep-type-selector__option${selected ? ' dep-type-selector__option--selected' : ''}`}
                  onClick={() => selectType(type)}
                >
                  <span className="dep-type-selector__option-label">
                    {t(`depType.${type}` as KoTranslationKey)}
                  </span>
                  <DependencyTypePreview type={type} className="dep-type-selector__option-preview" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
