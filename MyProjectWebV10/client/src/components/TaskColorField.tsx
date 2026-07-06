import { useRef } from 'react';
import { useTranslation } from '../i18n';
import { argbToHex, hexToArgb } from '../utils/colorUtils';
import { isPresetColor } from '../utils/presetColors';
import { PresetColorSwatches } from './PresetColorSwatches';
import './PresetColorSwatches.css';
import './TaskColorField.css';

interface TaskColorFieldProps {
  label: string;
  value: number | null;
  defaultHex: string;
  disabled?: boolean;
  onChange: (value: number | null) => void;
}

export function TaskColorField({
  label,
  value,
  defaultHex,
  disabled = false,
  onChange,
}: TaskColorFieldProps) {
  const t = useTranslation();
  const colorInputRef = useRef<HTMLInputElement>(null);
  const isDefault = value == null;
  const currentHex = argbToHex(value, defaultHex);
  const usesCustomColor = !isDefault && !isPresetColor(currentHex);

  return (
    <div className="task-prop-field task-prop-color">
      <span className="task-prop-color-label">{label}</span>
      <div className="task-prop-color-picker">
        <div className="task-prop-color-section">
          <span className="task-prop-color-section-label">{t('taskProps.colorPresets')}</span>
          <PresetColorSwatches
            selectedHex={isDefault ? '' : currentHex}
            disabled={disabled}
            ariaLabel={t('taskProps.colorPresets')}
            onSelect={(hex) => onChange(hexToArgb(hex))}
          />
        </div>

        <div className="task-prop-color-section">
          <span className="task-prop-color-section-label">{t('taskProps.colorCustom')}</span>
          <div className="task-prop-color-row">
            <button
              type="button"
              className={`task-prop-color-custom-trigger${
                usesCustomColor ? ' task-prop-color-custom-trigger--selected' : ''
              }`}
              disabled={disabled}
              title={t('taskProps.colorChoose')}
              aria-label={t('taskProps.colorChoose')}
              onClick={() => colorInputRef.current?.click()}
            >
              <span
                className="task-prop-color-custom-preview"
                style={{ backgroundColor: currentHex }}
                aria-hidden="true"
              />
              <span className="task-prop-color-custom-text">{t('taskProps.colorChoose')}</span>
            </button>
            <input
              ref={colorInputRef}
              type="color"
              className="task-prop-color-native-input"
              value={currentHex}
              disabled={disabled}
              aria-label={t('taskProps.colorChoose')}
              onChange={(event) => onChange(hexToArgb(event.target.value))}
            />
            <span className="task-prop-color-hex" aria-hidden="true">
              {currentHex.toUpperCase()}
            </span>
            <button
              type="button"
              className="task-prop-color-default"
              disabled={disabled || isDefault}
              onClick={() => onChange(null)}
            >
              {t('taskProps.colorDefault')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
