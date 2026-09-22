import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal.jsx';
import { IconSettings, IconTrash, IconFolder, IconCheck, IconFlag } from './Icons.jsx';
import { LANGUAGES } from '../i18n.js';
import { THEMES } from '../lib/themes.js';
import { getSystemFonts } from '../lib/fonts.js';
import { DEFAULT_SETTINGS, FONT_SIZE_MAX, FONT_SIZE_MIN, MAX_RECENT_FILES, stepFontSize } from '../lib/settings.js';
import { IMAGE_FORMATS } from '../lib/image.js';
import { isElectron, appInfo } from '../lib/platform.js';

const TABS = ['appearance', 'viewer', 'copy', 'files'];

// Every application setting lives here. Changes apply immediately (and are
// persisted by App), so there is no OK/Apply dance.
export default function SettingsDialog({ open, settings, onChange, onClose, onClearRecent, onRemoveRecent, onClearDirs, onReset }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState('appearance');
  const [fonts, setFonts] = useState([]);
  const [storagePath, setStoragePath] = useState('');

  useEffect(() => {
    if (!open) return;
    getSystemFonts().then(setFonts).catch(() => setFonts([]));
    if (isElectron) appInfo().then((i) => setStoragePath(i.userData || '')).catch(() => {});
  }, [open]);

  const set = (patch) => onChange({ ...settings, ...patch });

  const previewStyle = useMemo(() => ({
    fontFamily: settings.fontFamily ? `'${settings.fontFamily}'` : undefined,
    fontSize: `${settings.fontSize}px`,
    fontWeight: settings.fontWeight,
    fontStyle: settings.fontStyle,
    textDecoration: settings.fontUnderline ? 'underline' : 'none',
  }), [settings]);

  if (!open) return null;

  return (
    <Modal
      open
      title={t('settings.title')}
      icon={IconSettings}
      onClose={onClose}
      width={780}
      className="settings-modal"
      closeLabel={t('settings.close')}
      footer={(
        <>
          <button className="btn danger-ghost" onClick={() => {
            if (window.confirm(t('settings.resetConfirm'))) onReset();
          }}>
            {t('settings.resetAll')}
          </button>
          <div className="spacer" />
          <button className="btn primary" onClick={onClose} data-autofocus>{t('settings.close')}</button>
        </>
      )}
    >
      <div className="tabs">
        {TABS.map((id) => (
          <button
            key={id}
            className={`tab${tab === id ? ' active' : ''}`}
            onClick={() => setTab(id)}
            title={t(`settings.tabs.${id}`)}
          >
            {t(`settings.tabs.${id}`)}
          </button>
        ))}
      </div>

      {/* All tabs stay in the layout (stacked) so the dialog never changes size. */}
      <div className="settings-pane">
        <div className={`settings-panel${tab === 'appearance' ? ' on' : ''}`} aria-hidden={tab !== 'appearance'} {...(tab !== 'appearance' ? { inert: '' } : {})}>
          <div className="settings-split">
            <section className="sgroup">
              <h4>{t('settings.theme')}</h4>
              <div className="theme-grid">
                {THEMES.map((th) => (
                  <button
                    key={th.id}
                    className={`theme-chip${settings.theme === th.id ? ' active' : ''}`}
                    onClick={() => set({ theme: th.id })}
                    title={th.id}
                  >
                    <span className="theme-swatch">
                      {th.bars.map((c, i) => <i key={i} style={{ background: c }} />)}
                    </span>
                    <span className="theme-name">{th.id}</span>
                    {settings.theme === th.id ? <IconCheck size={13} /> : null}
                  </button>
                ))}
              </div>
            </section>

            <div className="settings-side">
              <section className="sgroup">
                <h4>{t('settings.language')}</h4>
                <div className="row seg-row seg-fill">
                  {LANGUAGES.map((lng) => (
                    <button
                      key={lng.id}
                      className={`btn seg${settings.lang === lng.id ? ' active' : ''}`}
                      onClick={() => set({ lang: lng.id })}
                      title={lng.native}
                    >
                      <IconFlag lang={lng.id} size={16} />
                      {lng.native}
                    </button>
                  ))}
                </div>
              </section>

              <section className="sgroup">
                <h4>{t('settings.font')}</h4>
                <label className="field">
                  <span className="field-label">
                    {t('settings.fontFamily')}
                    {fonts.length ? <em className="hint"> · {t('settings.systemFonts', { n: fonts.length })}</em> : null}
                  </span>
                  <select
                    className="input"
                    value={settings.fontFamily}
                    onChange={(e) => set({ fontFamily: e.target.value })}
                    title={t('settings.fontFamily')}
                  >
                    <option value="">{t('settings.defaultFont')}</option>
                    {fonts.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </label>

                <div className="field">
                  <span className="field-label">{t('settings.fontSize')}</span>
                  <div className="stepper" role="group" aria-label={t('settings.fontSize')}>
                    <button
                      type="button"
                      className="btn stepper-btn"
                      disabled={settings.fontSize <= FONT_SIZE_MIN}
                      onClick={() => set({ fontSize: stepFontSize(settings.fontSize, -1) })}
                      title={t('settings.fontSmaller')}
                      aria-label={t('settings.fontSmaller')}
                    >−</button>
                    <span className="stepper-value">{settings.fontSize}px</span>
                    <button
                      type="button"
                      className="btn stepper-btn"
                      disabled={settings.fontSize >= FONT_SIZE_MAX}
                      onClick={() => set({ fontSize: stepFontSize(settings.fontSize, 1) })}
                      title={t('settings.fontLarger')}
                      aria-label={t('settings.fontLarger')}
                    >+</button>
                  </div>
                </div>

                <div className="row seg-row">
                  <span className="field-label">{t('settings.fontStyle')}</span>
                  <button
                    className={`btn seg${settings.fontWeight === 'bold' ? ' active' : ''}`}
                    style={{ fontWeight: 700 }}
                    onClick={() => set({ fontWeight: settings.fontWeight === 'bold' ? 'normal' : 'bold' })}
                    title={t('settings.bold')}
                  >B</button>
                  <button
                    className={`btn seg${settings.fontStyle === 'italic' ? ' active' : ''}`}
                    style={{ fontStyle: 'italic' }}
                    onClick={() => set({ fontStyle: settings.fontStyle === 'italic' ? 'normal' : 'italic' })}
                    title={t('settings.italic')}
                  >I</button>
                  <button
                    className={`btn seg${settings.fontUnderline ? ' active' : ''}`}
                    style={{ textDecoration: 'underline' }}
                    onClick={() => set({ fontUnderline: !settings.fontUnderline })}
                    title={t('settings.underline')}
                  >U</button>
                </div>

                <div className="font-preview" style={previewStyle}>{t('settings.previewText')}</div>
              </section>
            </div>
          </div>
        </div>

        <div className={`settings-panel${tab === 'viewer' ? ' on' : ''}`} aria-hidden={tab !== 'viewer'} {...(tab !== 'viewer' ? { inert: '' } : {})}>
          <div className="settings-split">
            <div className="settings-side">
              <section className="sgroup">
                <h4>{t('settings.zoomMode')}</h4>
                <div className="row seg-row seg-fill">
                  {['fit-width', 'fit-page', 'actual'].map((m) => (
                    <button
                      key={m}
                      className={`btn seg${settings.zoomMode === m ? ' active' : ''}`}
                      onClick={() => set({ zoomMode: m })}
                      title={t(`toolbar.${m === 'fit-width' ? 'fitWidth' : m === 'fit-page' ? 'fitPage' : 'actual'}`)}
                    >
                      {t(`toolbar.${m === 'fit-width' ? 'fitWidth' : m === 'fit-page' ? 'fitPage' : 'actual'}`)}
                    </button>
                  ))}
                </div>
              </section>

              <section className="sgroup">
                <h4>{t('settings.pageLayout')}</h4>
                <div className="row seg-row seg-fill">
                  <button
                    className={`btn seg${settings.pageLayout === 'single' ? ' active' : ''}`}
                    onClick={() => set({ pageLayout: 'single' })}
                    title={t('settings.single')}
                  >{t('settings.single')}</button>
                  <button
                    className={`btn seg${settings.pageLayout === 'continuous' ? ' active' : ''}`}
                    onClick={() => set({ pageLayout: 'continuous' })}
                    title={t('settings.continuous')}
                  >{t('settings.continuous')}</button>
                </div>
              </section>
            </div>

            <section className="sgroup">
              <h4>{t('settings.tabs.viewer')}</h4>
              <Check label={t('settings.showStatusBar')} value={settings.showStatusBar} onChange={(v) => set({ showStatusBar: v })} />
              <Check label={t('settings.toolbarLabels')} value={settings.showToolbarLabels} onChange={(v) => set({ showToolbarLabels: v })} />
              <Check label={t('settings.invertPages')} value={settings.invertPages} onChange={(v) => set({ invertPages: v })} />
              <Check label={t('settings.rememberLastPage')} value={settings.rememberLastPage} onChange={(v) => set({ rememberLastPage: v })} />
            </section>
          </div>
        </div>

        <div className={`settings-panel${tab === 'copy' ? ' on' : ''}`} aria-hidden={tab !== 'copy'} {...(tab !== 'copy' ? { inert: '' } : {})}>
          <div className="settings-split">
            <section className="sgroup">
              <label className="field">
                <span className="field-label">{t('settings.minImageSize')} — {settings.minImageSize}px</span>
                <input
                  className="range"
                  type="range"
                  min="1"
                  max="256"
                  step="1"
                  value={settings.minImageSize}
                  onChange={(e) => set({ minImageSize: Number(e.target.value) })}
                  title={t('settings.minImageSize')}
                />
              </label>
              <label className="field">
                <span className="field-label">{t('settings.captureFormat')}</span>
                <div className="row seg-row seg-fill">
                  {IMAGE_FORMATS.map((f) => (
                    <button
                      key={f.id}
                      className={`btn seg${settings.captureFormat === f.id ? ' active' : ''}`}
                      onClick={() => set({ captureFormat: f.id })}
                      title={t(`capture.fmt.${f.id}`)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </label>
              <label className="field">
                <span className="field-label">
                  {t('settings.captureQuality')} — {Math.round(settings.captureQuality * 100)}%
                </span>
                <input
                  className="range"
                  type="range"
                  min="10"
                  max="100"
                  step="1"
                  value={Math.round(settings.captureQuality * 100)}
                  onChange={(e) => set({ captureQuality: Number(e.target.value) / 100 })}
                  title={t('settings.captureQuality')}
                />
              </label>
            </section>

            <section className="sgroup">
              <h4>{t('settings.autoCopy')}</h4>
              <Check
                label={t('settings.autoCopyText')}
                value={settings.autoCopyText}
                onChange={(v) => set({ autoCopyText: v })}
              />
              <Check
                label={t('settings.autoCopyImage')}
                value={settings.autoCopyImage}
                onChange={(v) => set({ autoCopyImage: v })}
              />
              <Check
                label={t('settings.autoCopyRegion')}
                value={settings.autoCopyRegion}
                onChange={(v) => set({ autoCopyRegion: v, captureAction: v ? 'copy' : 'ask' })}
              />
              <p className="hint">{t('settings.autoCopyHint')}</p>
            </section>
          </div>
        </div>

        <div className={`settings-panel${tab === 'files' ? ' on' : ''}`} aria-hidden={tab !== 'files'} {...(tab !== 'files' ? { inert: '' } : {})}>
            <div className="settings-files">
              <section className="sgroup">
                <h4>{t('recent.title')} ({settings.recentFiles.length}/{MAX_RECENT_FILES})</h4>
                {settings.recentFiles.length === 0 ? (
                  <p className="empty">{t('recent.empty')}</p>
                ) : (
                  <ul className="recent-list">
                    {settings.recentFiles.map((f) => (
                      <li key={f.path || f.name}>
                        <span className="recent-name" title={f.path || f.name}>{f.name}</span>
                        <span className="recent-dir" title={f.dir || ''}>{f.dir || ''}</span>
                        <button
                          className="icon-btn"
                          onClick={() => onRemoveRecent(f.path || f.name)}
                          title={t('recent.remove')}
                        ><IconTrash size={15} /></button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="row">
                  <button className="btn" onClick={onClearRecent} disabled={!settings.recentFiles.length} title={t('settings.clearRecent')}>
                    <IconTrash size={15} />{t('settings.clearRecent')}
                  </button>
                </div>
              </section>

              <section className="sgroup">
                <h4>{t('recent.dirs')}</h4>
                {settings.recentDirs.length === 0 ? (
                  <p className="empty">{t('recent.empty')}</p>
                ) : (
                  <ul className="recent-list">
                    {settings.recentDirs.map((d) => (
                      <li key={d}><IconFolder size={15} /><span className="recent-name" title={d}>{d}</span></li>
                    ))}
                  </ul>
                )}
                <div className="row">
                  <button className="btn" onClick={onClearDirs} disabled={!settings.recentDirs.length} title={t('settings.clearDirs')}>
                    <IconTrash size={15} />{t('settings.clearDirs')}
                  </button>
                </div>
              </section>
            </div>

            {storagePath ? (
              <section className="sgroup">
                <h4>{t('settings.storage')}</h4>
                <p className="mono-path" title={storagePath}>{storagePath}</p>
              </section>
            ) : null}
        </div>
      </div>
    </Modal>
  );
}

function Check({ label, value, onChange }) {
  return (
    <label className="check" title={label}>
      <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export { DEFAULT_SETTINGS };
