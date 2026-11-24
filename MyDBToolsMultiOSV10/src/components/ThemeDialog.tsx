// Theme settings: the 20 light and 20 dark themes, the user's own themes and an
// editor for them, and the canvas backdrop. Every choice applies at once, so the
// main window behind shows the result while the window is still open.
import { useMemo, useState } from 'react';
import { useT } from '../i18n';
import type { UserPreferences } from '../core/settings';
import {
  CANVAS_BACKDROPS,
  customThemeDefinition,
  draftFromTheme,
  getThemeName,
  saveCustomTheme,
  THEMES,
  type CanvasBackdrop,
  type CustomTheme,
  type ThemeDefinition,
} from '../render/theme';
import { Dialog } from './Dialog';
import { Icons } from './Icons';

interface Props {
  prefs: UserPreferences;
  onChange: (patch: Partial<UserPreferences>) => void;
  onClose: () => void;
}

const COLOR_KEYS = ['background', 'panel', 'canvas', 'accent', 'text'] as const;

function Swatch({
  theme,
  label,
  active,
  onPick,
}: {
  theme: ThemeDefinition;
  label: string;
  active: boolean;
  onPick: () => void;
}) {
  const p = theme.palette;
  return (
    <button
      type="button"
      className={`theme-swatch ${active ? 'active' : ''}`}
      data-theme-id={theme.id}
      title={label}
      aria-pressed={active}
      onClick={onPick}
    >
      <span className="theme-swatch-preview" style={{ background: p.canvasBackground, borderColor: p.border }}>
        <span className="theme-swatch-bar" style={{ background: p.accent }} />
        <span className="theme-swatch-row" style={{ background: p.panelBackground }} />
        <span className="theme-swatch-row" style={{ background: p.canvasRowEven }} />
      </span>
      <span className="theme-swatch-name">{label}</span>
    </button>
  );
}

/** A small picture of the canvas with a table on it, in the draft's colours. */
function CanvasPreview({ theme, backdrop }: { theme: ThemeDefinition; backdrop: CanvasBackdrop }) {
  const p = theme.palette;
  const pattern =
    backdrop === 'dots'
      ? `radial-gradient(${p.canvasGridMajor} 1.2px, transparent 1.4px) 0 0 / 14px 14px, ${p.canvasBackground}`
      : backdrop === 'grid'
        ? `linear-gradient(${p.canvasGridMinor} 1px, transparent 1px) 0 0 / 14px 14px, linear-gradient(90deg, ${p.canvasGridMinor} 1px, transparent 1px) 0 0 / 14px 14px, ${p.canvasBackground}`
        : backdrop === 'gradient'
          ? `linear-gradient(135deg, ${p.canvasBackground}, ${p.canvasRowEven})`
          : backdrop === 'blueprint'
            ? `linear-gradient(${p.accentMuted} 1px, transparent 1px) 0 0 / 14px 14px, linear-gradient(90deg, ${p.accentMuted} 1px, transparent 1px) 0 0 / 14px 14px, linear-gradient(135deg, ${p.canvasBackground}, ${p.accentMuted})`
            : p.canvasBackground;
  return (
    <div className="theme-preview" style={{ background: p.appBackground, color: p.textPrimary, borderColor: p.border }}>
      <div className="theme-preview-bar" style={{ background: p.panelBackground, borderColor: p.border }}>
        <span className="theme-preview-dot" style={{ background: p.accent }} />
        <span style={{ color: p.textSecondary }}>MyDBTools</span>
      </div>
      <div className="theme-preview-canvas" style={{ background: pattern }}>
        <div className="theme-preview-table" style={{ borderColor: p.canvasBorder, background: p.canvasRowOdd }}>
          <div className="theme-preview-head" style={{ background: p.accent, color: p.accentContrast }}>users</div>
          <div style={{ background: p.canvasRowEven, color: p.canvasPkText }}>🔑 id</div>
          <div style={{ color: p.canvasTextPrimary }}>email</div>
          <div style={{ background: p.canvasRowEven, color: p.canvasFkText }}>team_id</div>
        </div>
        <span className="theme-preview-line" style={{ background: p.canvasRelLine }} />
      </div>
    </div>
  );
}

export function ThemeDialog({ prefs, onChange, onClose }: Props) {
  const t = useT();
  const lang = prefs.Language;
  const [draft, setDraft] = useState<CustomTheme>(() => {
    const current = prefs.CustomThemes.find((c) => c.id === prefs.Theme);
    return current ?? draftFromTheme(prefs.Theme, t('CustomThemeDefaultName'));
  });
  const preview = useMemo(() => customThemeDefinition({ ...draft, id: 'custom-preview' }), [draft]);
  const set = (patch: Partial<CustomTheme>) => setDraft((d) => ({ ...d, ...patch }));

  const save = () => {
    const { list, theme } = saveCustomTheme(prefs.CustomThemes, draft);
    setDraft(theme);
    onChange({ CustomThemes: list, Theme: theme.id });
  };
  const remove = (id: string) => {
    const list = prefs.CustomThemes.filter((c) => c.id !== id);
    if (draft.id === id) set({ id: '' });
    onChange({ CustomThemes: list, ...(prefs.Theme === id ? { Theme: 'light' } : {}) });
  };

  const grid = (kind: 'light' | 'dark') => (
    <div className="theme-group">
      <div className="theme-group-title">
        {kind === 'light' ? t('SettingsThemeLight') : t('SettingsThemeDark')} ({THEMES.filter((x) => x.kind === kind).length})
      </div>
      <div className="theme-grid theme-grid-5">
        {THEMES.filter((x) => x.kind === kind).map((theme) => (
          <Swatch
            key={theme.id}
            theme={theme}
            label={getThemeName(theme.id, lang)}
            active={prefs.Theme === theme.id}
            onPick={() => onChange({ Theme: theme.id })}
          />
        ))}
      </div>
    </div>
  );

  return (
    <Dialog
      title={t('ThemeSettingsTitle')}
      icon={<Icons.Palette />}
      onClose={onClose}
      cancelLabel={t('BtnClose')}
      width={1180}
      height={760}
    >
      <div className="theme-dialog">
        <div className="theme-dialog-catalogue">
          {grid('light')}
          {grid('dark')}
        </div>

        <div className="theme-dialog-side">
          <fieldset className="form-fieldset">
            <legend>{t('CanvasBackdropLabel')}</legend>
            <div className="backdrop-options" role="radiogroup">
              {CANVAS_BACKDROPS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={prefs.CanvasBackdrop === kind}
                  data-backdrop={kind}
                  className={`btn backdrop-option ${prefs.CanvasBackdrop === kind ? 'active' : ''}`}
                  onClick={() => onChange({ CanvasBackdrop: kind })}
                >
                  <Icons.Grid />
                  <span>{t(`CanvasBackdrop_${kind}`)}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="form-fieldset">
            <legend>
              {t('ThemeCustomGroup')} ({prefs.CustomThemes.length})
            </legend>
            {prefs.CustomThemes.length === 0 && <p className="hint">{t('CustomThemeEmpty')}</p>}
            <div className="custom-theme-list">
              {prefs.CustomThemes.map((theme) => (
                <div key={theme.id} className="custom-theme-row">
                  <button
                    type="button"
                    className={`btn custom-theme-name ${prefs.Theme === theme.id ? 'active' : ''}`}
                    data-custom-theme={theme.id}
                    onClick={() => {
                      setDraft(theme);
                      onChange({ Theme: theme.id });
                    }}
                  >
                    <span
                      className="custom-theme-chip"
                      style={{ background: `linear-gradient(135deg, ${theme.background}, ${theme.accent})` }}
                    />
                    <span>{theme.name}</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-icon btn-danger"
                    title={t('CustomThemeDelete')}
                    aria-label={t('CustomThemeDelete')}
                    onClick={() => remove(theme.id)}
                  >
                    <Icons.Delete />
                  </button>
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset className="form-fieldset">
            <legend>{draft.id ? t('CustomThemeEdit') : t('CustomThemeNew')}</legend>
            <div className="form-grid">
              <label>{t('CustomThemeName')}</label>
              <input type="text" value={draft.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} />
              <label>{t('CustomThemeKind')}</label>
              <div className="segmented" role="radiogroup">
                {(['light', 'dark'] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    role="radio"
                    aria-checked={draft.kind === kind}
                    className={`btn ${draft.kind === kind ? 'active' : ''}`}
                    onClick={() => set({ kind })}
                  >
                    {kind === 'light' ? <Icons.Sun /> : <Icons.Moon />}
                    <span>{kind === 'light' ? t('ThemeKindLight') : t('ThemeKindDark')}</span>
                  </button>
                ))}
              </div>
              {COLOR_KEYS.map((key) => (
                <ColorRow key={key} label={t(`CustomThemeColor_${key}`)} value={draft[key]} onChange={(v) => set({ [key]: v })} />
              ))}
            </div>
            <CanvasPreview theme={preview} backdrop={prefs.CanvasBackdrop} />
            <div className="dialog-inline-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setDraft(draftFromTheme(prefs.Theme, t('CustomThemeDefaultName')))}
              >
                <Icons.New />
                <span>{t('CustomThemeFromCurrent')}</span>
              </button>
              <button type="button" className="btn btn-primary" data-action="save-custom-theme" onClick={save}>
                <Icons.Save />
                <span>{draft.id ? t('CustomThemeUpdate') : t('CustomThemeSave')}</span>
              </button>
            </div>
          </fieldset>
        </div>
      </div>
    </Dialog>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <>
      <label>{label}</label>
      <div className="color-row">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
        <input
          key={value}
          type="text"
          className="mono"
          defaultValue={value}
          maxLength={7}
          onChange={(e) => /^#[0-9a-f]{6}$/i.test(e.target.value) && onChange(e.target.value)}
        />
      </div>
    </>
  );
}
