import { useState } from 'react'
import { Moon, Plus, Save, Sun, Trash } from 'lucide-react'
import { t } from './i18n'
import { customThemeDefinition, draftFrom, registerCustomThemes, saveCustomTheme, type CustomTheme } from './themes'
import { createId } from './lib/canvas'
import type { AppSettings, Language } from './lib/types'

/**
 * Settings > Custom: the themes the user has made, and an editor for one. Four colours
 * and whether it is dark or light are all it asks; every other token follows.
 */
export function CustomThemeEditor({ language, settings, patchSettings }: { language: Language; settings: AppSettings; patchSettings: (patch: Partial<AppSettings>) => void }) {
  const tr = (key: string) => t(language, key)
  const [draft, setDraft] = useState<CustomTheme>(() => draftFrom(settings.theme, tr('customDefaultName')))
  const set = (patch: Partial<CustomTheme>) => setDraft((current) => ({ ...current, ...patch }))
  const preview = customThemeDefinition({ ...draft, id: 'custom-preview' })

  const save = () => {
    const { list, theme } = saveCustomTheme(settings.customThemes, draft, () => createId("theme"))
    // Before the settings travel: this window applies the theme by id straight away.
    registerCustomThemes(list)
    setDraft(theme)
    patchSettings({ customThemes: list, theme: theme.id })
  }
  const remove = (id: string) => {
    const list = settings.customThemes.filter((item) => item.id !== id)
    registerCustomThemes(list)
    if (draft.id === id) set({ id: '' })
    patchSettings({ customThemes: list, ...(settings.theme === id ? { theme: 'dark' } : {}) })
  }

  return (
    <>
      <section className="settings-section">
        <h3>{tr('customYours')} ({settings.customThemes.length})</h3>
        {settings.customThemes.length === 0 && <p className="settings-field-hint">{tr('customEmpty')}</p>}
        <div className="custom-theme-list">
          {settings.customThemes.map((theme) => (
            <div key={theme.id} className="custom-theme-row">
              <button className={`custom-theme-name${settings.theme === theme.id ? ' active' : ''}`} data-custom-theme={theme.id} onClick={() => { setDraft(theme); patchSettings({ theme: theme.id }) }}>
                <span className="theme-swatch" style={{ background: `linear-gradient(135deg, ${theme.background}, ${theme.accent})` }} />
                <span>{theme.name}</span>
              </button>
              <button data-tooltip={tr('customDelete')} aria-label={tr('customDelete')} onClick={() => remove(theme.id)}><Trash size={13} aria-hidden="true" /></button>
            </div>
          ))}
        </div>
      </section>
      <section className="settings-section">
        <h3>{tr('customEdit')}</h3>
        <div className="custom-theme-editor">
          <label>{tr('customName')}
            <input type="text" value={draft.name} maxLength={32} onChange={(event) => set({ name: event.target.value })} />
          </label>
          <div className="settings-buttons" role="radiogroup" aria-label={tr('customKind')}>
            <button role="radio" aria-checked={draft.kind === 'dark'} className={draft.kind === 'dark' ? 'active' : ''} onClick={() => set({ kind: 'dark' })}><Moon size={13} aria-hidden="true" /><span>{tr('themeDark')}</span></button>
            <button role="radio" aria-checked={draft.kind === 'light'} className={draft.kind === 'light' ? 'active' : ''} onClick={() => set({ kind: 'light' })}><Sun size={13} aria-hidden="true" /><span>{tr('themeLight')}</span></button>
          </div>
          {(['accent', 'background', 'panel', 'text'] as const).map((key) => (
            <label key={key}>{tr(`custom${key.charAt(0).toUpperCase()}${key.slice(1)}`)}
              <input type="color" data-color={key} value={draft[key]} onChange={(event) => set({ [key]: event.target.value })} />
            </label>
          ))}
          <div className="custom-theme-preview" aria-label={tr('customPreview')} style={{ background: draft.background, color: draft.text }}>
            <div className="preview-side" style={{ background: draft.panel }}>{tr('customPreview')}</div>
            <div className="preview-main">
              <span className="preview-button" style={{ background: draft.accent, color: draft.background }}>{tr('customPreviewButton')}</span>
              <span className="preview-button" style={{ background: preview.vars['--control-bg'], color: draft.text }}>{tr('customPreviewButton')}</span>
              <span style={{ color: preview.vars['--text-muted'] }}>{draft.name}</span>
            </div>
          </div>
        </div>
        <div className="settings-buttons">
          <button onClick={() => setDraft(draftFrom(settings.theme, tr('customDefaultName')))}><Plus size={13} aria-hidden="true" /><span>{tr('customNew')}</span></button>
          <button className="primary" data-action="save-custom-theme" onClick={save}><Save size={13} aria-hidden="true" /><span>{tr('customSave')}</span></button>
        </div>
      </section>
    </>
  )
}
