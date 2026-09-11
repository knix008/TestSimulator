// Port of Dialogs/PreferencesDialog.cs
import { useEffect, useState } from 'react';
import type { DbTargetType, RelationshipLineStyle } from '../types';
import { DB_TARGET_TYPES, getDbDisplayName } from '../types';
import { ALL_LEVELS, getLevelLabel, type NormalizationLevel } from '../core/analysis/normalization';
import type { UserPreferences } from '../core/settings';
import type {
  HeadingNumberStyle,
  PageNumberPlacement,
  ReportAlign,
  ReportPrefs,
} from '../core/export/reportOptions';
import { MAX_FONT_SIZE, MIN_FONT_SIZE, clampFontSize } from '../core/export/reportFonts';
import { listSystemFonts } from '../core/systemFonts';
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
const ALIGNS: ReportAlign[] = ['left', 'center', 'right'];
const NUMBER_STYLES: HeadingNumberStyle[] = ['none', 'decimal', 'paren', 'roman'];
const PLACEMENTS: PageNumberPlacement[] = ['none', 'header', 'footer'];

export function PreferencesDialog({ prefs, onSave, onClose }: Props) {
  const t = useT();
  const [draft, setDraft] = useState<UserPreferences>({
    ...prefs,
    NormalizationLevels: [...prefs.NormalizationLevels],
  });

  const set = <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  /** Report settings live in their own nested block. */
  const setReport = <K extends keyof ReportPrefs>(key: K, value: ReportPrefs[K]) =>
    setDraft((d) => ({ ...d, Report: { ...d.Report, [key]: value } }));

  const report = draft.Report;

  // The installed fonts, read once when the dialog opens. Until they arrive —
  // and if the permission is refused — the picker still offers the built-in
  // list, so it is never empty.
  const [fonts, setFonts] = useState<{ families: string[]; fromSystem: boolean }>({
    families: [],
    fromSystem: false,
  });
  useEffect(() => {
    let cancelled = false;
    void listSystemFonts().then((list) => {
      if (!cancelled) setFonts(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleLevel = (level: NormalizationLevel) => {
    setDraft((d) => {
      const next = d.NormalizationLevels.includes(level)
        ? d.NormalizationLevels.filter((l) => l !== level)
        : [...d.NormalizationLevels, level];
      // At least one level must stay selected, matching the desktop behaviour.
      return { ...d, NormalizationLevels: next.length ? next : ['NF1'] };
    });
  };

  const alignLabel = (align: ReportAlign) =>
    align === 'left' ? t('AlignLeft') : align === 'right' ? t('AlignRight') : t('AlignCenter');

  const numberStyleLabel = (style: HeadingNumberStyle) => {
    switch (style) {
      case 'decimal':
        return t('NumberStyleDecimal');
      case 'paren':
        return t('NumberStyleParen');
      case 'roman':
        return t('NumberStyleRoman');
      default:
        return t('NumberStyleNone');
    }
  };

  const placementLabel = (placement: PageNumberPlacement) =>
    placement === 'header'
      ? t('PageNumberInHeader')
      : placement === 'footer'
        ? t('PageNumberInFooter')
        : t('PageNumberNone');

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
      width={1360}
      // Tall enough for the longest column as it stands, so the body never
      // scrolls even before the window auto-fits to its content.
      height={810}
    >
      <div className="prefs-columns">
        <div className="prefs-column">
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
        </div>

        <div className="prefs-column">
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
            <legend>{t('SettingsGroupImageExport')}</legend>
            <div className="form-checks">
              <label>
                <input
                  type="checkbox"
                  checked={draft.ImageExportTransparent}
                  onChange={(e) => set('ImageExportTransparent', e.target.checked)}
                />
                {t('SettingsImageTransparent')}
              </label>
            </div>
            <div className="form-hint">{t('SettingsImageTransparentHint')}</div>
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
            <legend>{t('SettingsGroupReportCover')}</legend>
            <div className="form-checks">
              <label>
                <input
                  type="checkbox"
                  checked={report.CoverEnabled}
                  onChange={(e) => setReport('CoverEnabled', e.target.checked)}
                />
                {t('SettingsCoverEnabled')}
              </label>
            </div>
            <div className="form-grid">
              <label>{t('SettingsCoverTitle')}</label>
              <input
                type="text"
                value={report.CoverTitle}
                disabled={!report.CoverEnabled}
                placeholder={t('SettingsCoverTitlePlaceholder')}
                onChange={(e) => setReport('CoverTitle', e.target.value)}
              />
              <label>{t('SettingsCoverSubject')}</label>
              <input
                type="text"
                value={report.CoverSubject}
                disabled={!report.CoverEnabled}
                placeholder={t('SettingsCoverSubjectPlaceholder')}
                onChange={(e) => setReport('CoverSubject', e.target.value)}
              />
              <label>{t('SettingsCoverOrganization')}</label>
              <input
                type="text"
                value={report.CoverOrganization}
                disabled={!report.CoverEnabled}
                onChange={(e) => setReport('CoverOrganization', e.target.value)}
              />
              <label>{t('SettingsCoverAuthor')}</label>
              <input
                type="text"
                value={report.CoverAuthor}
                disabled={!report.CoverEnabled}
                onChange={(e) => setReport('CoverAuthor', e.target.value)}
              />
              <label>{t('SettingsCoverProducer')}</label>
              <input
                type="text"
                value={report.CoverProducer}
                disabled={!report.CoverEnabled}
                onChange={(e) => setReport('CoverProducer', e.target.value)}
              />
            </div>
            <div className="form-checks">
              <label>
                <input
                  type="checkbox"
                  checked={report.CoverShowDetails}
                  disabled={!report.CoverEnabled}
                  onChange={(e) => setReport('CoverShowDetails', e.target.checked)}
                />
                {t('SettingsCoverShowDetails')}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={report.CoverShowProjectPath}
                  disabled={!report.CoverEnabled}
                  onChange={(e) => setReport('CoverShowProjectPath', e.target.checked)}
                />
                {t('SettingsCoverShowPath')}
              </label>
            </div>
          </fieldset>
        </div>

        <div className="prefs-column">
          <fieldset className="form-fieldset">
            <legend>{t('SettingsGroupReportFont')}</legend>
            <div className="form-grid">
              <label>{t('SettingsFontFamily')}</label>
              <select
                value={report.FontFamily}
                onChange={(e) => setReport('FontFamily', e.target.value)}
              >
                <option value="">{t('SettingsFontDefault')}</option>
                {fonts.families.map((family) => (
                  <option key={family} value={family} style={{ fontFamily: `"${family}"` }}>
                    {family}
                  </option>
                ))}
              </select>
              <label>{t('SettingsFontSize')}</label>
              <input
                type="number"
                min={MIN_FONT_SIZE}
                max={MAX_FONT_SIZE}
                value={report.FontSize}
                onChange={(e) => setReport('FontSize', clampFontSize(+e.target.value))}
              />
            </div>
            <div
              className="font-preview"
              style={{
                fontFamily: report.FontFamily ? `"${report.FontFamily}"` : undefined,
                fontSize: `${report.FontSize}pt`,
              }}
            >
              {t('SettingsFontPreview')}
            </div>
            <div className="form-hint">
              {fonts.fromSystem ? t('SettingsFontHintSystem') : t('SettingsFontHintFallback')}
            </div>
          </fieldset>

          <fieldset className="form-fieldset">
            <legend>{t('SettingsGroupReportLayout')}</legend>
            <div className="form-grid">
              <label>{t('SettingsHeadingNumbering')}</label>
              <select
                value={report.HeadingNumberStyle}
                onChange={(e) => setReport('HeadingNumberStyle', e.target.value as HeadingNumberStyle)}
              >
                {NUMBER_STYLES.map((style) => (
                  <option key={style} value={style}>
                    {numberStyleLabel(style)}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-checks">
              <label>
                <input
                  type="checkbox"
                  checked={report.HeaderEnabled}
                  onChange={(e) => setReport('HeaderEnabled', e.target.checked)}
                />
                {t('SettingsHeaderEnabled')}
              </label>
            </div>
            <div className="form-grid">
              <label>{t('SettingsHeaderText')}</label>
              <input
                type="text"
                value={report.HeaderText}
                disabled={!report.HeaderEnabled}
                onChange={(e) => setReport('HeaderText', e.target.value)}
              />
              <label>{t('SettingsHeaderAlign')}</label>
              <select
                value={report.HeaderAlign}
                disabled={!report.HeaderEnabled}
                onChange={(e) => setReport('HeaderAlign', e.target.value as ReportAlign)}
              >
                {ALIGNS.map((align) => (
                  <option key={align} value={align}>
                    {alignLabel(align)}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-checks">
              <label>
                <input
                  type="checkbox"
                  checked={report.FooterEnabled}
                  onChange={(e) => setReport('FooterEnabled', e.target.checked)}
                />
                {t('SettingsFooterEnabled')}
              </label>
            </div>
            <div className="form-grid">
              <label>{t('SettingsFooterText')}</label>
              <input
                type="text"
                value={report.FooterText}
                disabled={!report.FooterEnabled}
                onChange={(e) => setReport('FooterText', e.target.value)}
              />
              <label>{t('SettingsFooterAlign')}</label>
              <select
                value={report.FooterAlign}
                disabled={!report.FooterEnabled}
                onChange={(e) => setReport('FooterAlign', e.target.value as ReportAlign)}
              >
                {ALIGNS.map((align) => (
                  <option key={align} value={align}>
                    {alignLabel(align)}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-hint">{t('SettingsRunningHint')}</div>

            <div className="form-grid">
              <label>{t('SettingsPageNumber')}</label>
              <select
                value={report.PageNumberPlacement}
                onChange={(e) =>
                  setReport('PageNumberPlacement', e.target.value as PageNumberPlacement)
                }
              >
                {PLACEMENTS.map((placement) => (
                  <option key={placement} value={placement}>
                    {placementLabel(placement)}
                  </option>
                ))}
              </select>
              <label>{t('SettingsPageNumberAlign')}</label>
              <select
                value={report.PageNumberAlign}
                disabled={report.PageNumberPlacement === 'none'}
                onChange={(e) => setReport('PageNumberAlign', e.target.value as ReportAlign)}
              >
                {ALIGNS.map((align) => (
                  <option key={align} value={align}>
                    {alignLabel(align)}
                  </option>
                ))}
              </select>
              <label>{t('SettingsPageNumberFormat')}</label>
              <input
                type="text"
                value={report.PageNumberFormat}
                disabled={report.PageNumberPlacement === 'none'}
                onChange={(e) => setReport('PageNumberFormat', e.target.value)}
              />
            </div>
            <div className="form-hint">{t('SettingsPageNumberHint')}</div>
          </fieldset>
        </div>
      </div>
    </Dialog>
  );
}
