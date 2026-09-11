// Port of Dialogs/PreferencesDialog.cs
import { useState } from 'react';
import type { DbTargetType, RelationshipLineStyle } from '../types';
import { DB_TARGET_TYPES, getDbDisplayName } from '../types';
import { ALL_LEVELS, getLevelLabel, type NormalizationLevel } from '../core/analysis/normalization';
import type { UserPreferences } from '../core/settings';
import { useT, type Language } from '../i18n';
import { getThemeName, THEMES } from '../render/theme';
import { Dialog } from './Dialog';
import { Icons } from './Icons';

interface Props {
  prefs: UserPreferences;
  onSave: (prefs: UserPreferences) => void;
  onClose: () => void;
}

const LINE_STYLES: RelationshipLineStyle[] = ['Straight', 'Curved', 'Orthogonal'];

export function PreferencesDialog({ prefs, onSave, onClose }: Props) {
  const t = useT();
  const [draft, setDraft] = useState<UserPreferences>({
    ...prefs,
    NormalizationLevels: [...prefs.NormalizationLevels],
  });

  const set = <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const toggleLevel = (level: NormalizationLevel) => {
    setDraft((d) => {
      const next = d.NormalizationLevels.includes(level)
        ? d.NormalizationLevels.filter((l) => l !== level)
        : [...d.NormalizationLevels, level];
      // At least one level must stay selected, matching the desktop behaviour.
      return { ...d, NormalizationLevels: next.length ? next : ['NF1'] };
    });
  };

  const lineStyleLabel = (style: RelationshipLineStyle) =>
    style === 'Straight'
      ? t('LineStyleStraight')
      : style === 'Curved'
        ? t('LineStyleCurved')
        : t('LineStyleOrthogonal');

  return (
    <Dialog
      title={t('SettingsTitle')}
      icon={<Icons.Settings />}
      onClose={onClose}
      onOk={() => onSave(draft)}
      okLabel={t('SettingsBtnOk')}
      cancelLabel={t('SettingsBtnCancel')}
      width={600}
      height={900}
    >
      <fieldset className="form-fieldset">
        <legend>{t('SettingsGroupAppearance')}</legend>
        <div className="form-grid">
          <label>{t('SettingsLabelLanguage')}</label>
          <select value={draft.Language} onChange={(e) => set('Language', e.target.value as Language)}>
            <option value="ko">한국어</option>
            <option value="en">English</option>
          </select>
        </div>

        <div className="form-label">{t('SettingsLabelTheme')}</div>
        {(['light', 'dark'] as const).map((kind) => (
          <div key={kind} className="theme-group">
            <div className="theme-group-title">
              {kind === 'light' ? t('SettingsThemeLight') : t('SettingsThemeDark')}
            </div>
            <div className="theme-grid">
              {THEMES.filter((theme) => theme.kind === kind).map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  className={`theme-swatch ${draft.Theme === theme.id ? 'active' : ''}`}
                  title={getThemeName(theme.id, draft.Language)}
                  aria-pressed={draft.Theme === theme.id}
                  onClick={() => set('Theme', theme.id)}
                >
                  <span
                    className="theme-swatch-preview"
                    style={{
                      background: theme.palette.canvasBackground,
                      borderColor: theme.palette.border,
                    }}
                  >
                    <span
                      className="theme-swatch-bar"
                      style={{ background: theme.palette.accent }}
                    />
                    <span
                      className="theme-swatch-row"
                      style={{ background: theme.palette.canvasRowEven }}
                    />
                    <span
                      className="theme-swatch-row"
                      style={{ background: theme.palette.panelBackground }}
                    />
                  </span>
                  <span className="theme-swatch-name">
                    {getThemeName(theme.id, draft.Language)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </fieldset>

      <fieldset className="form-fieldset">
        <legend>{t('SettingsGroupDefaults')}</legend>
        <div className="form-grid">
          <label>{t('SettingsLabelDbType')}</label>
          <select
            value={draft.DefaultDbType}
            onChange={(e) => set('DefaultDbType', e.target.value as DbTargetType)}
          >
            {DB_TARGET_TYPES.map((db) => (
              <option key={db} value={db}>
                {getDbDisplayName(db)}
              </option>
            ))}
          </select>
          <label>{t('SettingsLabelLineStyle')}</label>
          <select
            value={draft.DefaultLineStyle}
            onChange={(e) => set('DefaultLineStyle', e.target.value as RelationshipLineStyle)}
          >
            {LINE_STYLES.map((style) => (
              <option key={style} value={style}>
                {lineStyleLabel(style)}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <fieldset className="form-fieldset">
        <legend>{t('SettingsGroupCanvas')}</legend>
        <div className="form-checks">
          <label>
            <input
              type="checkbox"
              checked={draft.ShowGrid}
              onChange={(e) => set('ShowGrid', e.target.checked)}
            />
            {t('SettingsShowGrid')}
          </label>
          <label>
            <input
              type="checkbox"
              checked={draft.SnapToGrid}
              onChange={(e) => set('SnapToGrid', e.target.checked)}
            />
            {t('SettingsSnapToGrid')}
          </label>
        </div>
        <div className="form-grid">
          <label>{t('SettingsLabelSnapInterval')}</label>
          <input
            type="number"
            min={5}
            max={100}
            value={draft.SnapInterval}
            onChange={(e) => set('SnapInterval', Math.min(100, Math.max(5, +e.target.value || 20)))}
          />
        </div>
      </fieldset>

      <fieldset className="form-fieldset">
        <legend>{t('SettingsGroupNormalization')}</legend>
        <div className="form-label">{t('SettingsLabelNormLevel')}</div>
        <div className="form-checks">
          {ALL_LEVELS.map((level) => (
            <label key={level}>
              <input
                type="checkbox"
                checked={draft.NormalizationLevels.includes(level)}
                onChange={() => toggleLevel(level)}
              />
              {getLevelLabel(level)}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="form-fieldset">
        <legend>{t('SettingsGroupFiles')}</legend>
        <div className="form-grid">
          <label>{t('SettingsLabelRecentMax')}</label>
          <input
            type="number"
            min={1}
            max={50}
            value={draft.RecentFilesMaxCount}
            onChange={(e) =>
              set('RecentFilesMaxCount', Math.min(50, Math.max(1, +e.target.value || 10)))
            }
          />
        </div>
      </fieldset>
    </Dialog>
  );
}
