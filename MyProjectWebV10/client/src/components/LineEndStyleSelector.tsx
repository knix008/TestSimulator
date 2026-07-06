import { useEffect, useRef, useState } from 'react';
import type { GanttViewSettings } from '../types/project';
import { LINE_END_OPTIONS } from '../config/ganttViewSettings';
import { useTranslation } from '../i18n';
import type { KoTranslationKey } from '../i18n/locales/ko';
import { LineEndPreview } from './LineEndPreview';
import './LineEndStyleSelector.css';

export type LineEndStyleValue = GanttViewSettings['startLineEnd'];

interface LineEndStyleSelectorProps {
  value: LineEndStyleValue;
  onChange: (style: LineEndStyleValue) => void;
  atStart: boolean;
  className?: string;
  label?: string;
  disabled?: boolean;
}

export function LineEndStyleSelector({
  value,
  onChange,
  atStart,
  className,
  label,
  disabled = false,
}: LineEndStyleSelectorProps) {
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

  const selectStyle = (style: LineEndStyleValue) => {
    onChange(style);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={['line-end-selector', className].filter(Boolean).join(' ')}>
      {label ? <span className="line-end-selector__heading">{label}</span> : null}
      <button
        type="button"
        className={`line-end-selector__trigger${open ? ' line-end-selector__trigger--open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        title={t(`lineEnd.${value}` as KoTranslationKey)}
        onClick={() => setOpen((current) => !current)}
      >
        <LineEndPreview style={value} atStart={atStart} className="line-end-selector__preview" />
        <span className="line-end-selector__value">{t(`lineEnd.${value}` as KoTranslationKey)}</span>
        <span className="line-end-selector__caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open ? (
        <ul
          className="line-end-selector__menu"
          role="listbox"
          aria-label={label ?? t(`lineEnd.${value}` as KoTranslationKey)}
        >
          {LINE_END_OPTIONS.map((option) => {
            const selected = option.value === value;
            return (
              <li key={option.value} role="option" aria-selected={selected}>
                <button
                  type="button"
                  className={`line-end-selector__option${selected ? ' line-end-selector__option--selected' : ''}`}
                  onClick={() => selectStyle(option.value)}
                >
                  <span className="line-end-selector__option-label">
                    {t(`lineEnd.${option.value}` as KoTranslationKey)}
                  </span>
                  <LineEndPreview
                    style={option.value}
                    atStart={atStart}
                    className="line-end-selector__option-preview"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
