import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal.jsx';
import { IconSettings, IconFlag, IconAlert, IconKey, IconRefresh, IconFolder, IconTrash, IconSparkles } from './Icons.jsx';
import { LANGUAGES } from '../i18n.js';
import { CustomThemeEditor, ThemeChipGroups } from './ThemePicker.jsx';
import { getSystemFonts } from '../lib/fonts.js';
import { DEFAULT_ENGINE_URL, FONT_SIZE_MAX, FONT_SIZE_MIN, stepFontSize } from '../lib/settings.js';
import { EXPORT_FORMATS } from '../lib/formats.js';
import { isDesktop, appInfo } from '../lib/platform.js';
import { NumberStepper } from './Stepper.jsx';
import BackgroundPicker from './BackgroundPicker.jsx';
import { STEPS } from '../lib/tutorialSteps.js';

const TABS = ['appearance', 'engine', 'view', 'files'];

// Every application setting lives here. Changes apply immediately (and are
// persisted by App), so there is no OK/Apply dance.
export default function SettingsDialog({
  open, settings, onChange, onClose, onReset, health, tab: askedTab, onTutorial, onToken, onClearToken, onReinstall, onOpenEngineFolder, onRestartEngine,
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState('appearance');
  const [fonts, setFonts] = useState([]);
  const [storagePath, setStoragePath] = useState('');
  const [token, setToken] = useState('');
  const [key, setKey] = useState(settings.stabilityKey || '');

  useEffect(() => { if (open && askedTab) setTab(askedTab); }, [open, askedTab]);

  useEffect(() => {
    if (!open) return;
    getSystemFonts().then(setFonts).catch(() => setFonts([]));
    if (isDesktop) appInfo().then((i) => setStoragePath(i.userData || '')).catch(() => {});
    setKey(settings.stabilityKey || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const panel = (id, children) => (
    <div className={`settings-panel${tab === id ? ' on' : ''}`} aria-hidden={tab !== id} {...(tab !== id ? { inert: '' } : {})}>
      {children}
    </div>
  );

  const chooseBackend = (id) => {
    if (id === 'stability' && !settings.stabilityConfirmed) {
      if (!window.confirm(t('settings.stabilityConfirm'))) return;
      set({ backend: id, stabilityConfirmed: true });
      return;
    }
    set({ backend: id });
  };

  return (
    <Modal
      open
      title={t('settings.title')}
      icon={IconSettings}
      onClose={onClose}
      width={800}
      className="settings-modal"
      windowName="settings"
      closeLabel={t('settings.close')}
      footer={(
        <>
          <button className="btn danger-ghost" onClick={() => { if (window.confirm(t('settings.resetConfirm'))) onReset(); }}>
            {t('settings.resetAll')}
          </button>
          <div className="spacer" />
          <button className="btn primary" onClick={onClose} data-autofocus>{t('settings.close')}</button>
        </>
      )}
    >
      <div className="tabs">
        {TABS.map((id) => (
          <button key={id} className={`tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)} title={t(`settings.tabs.${id}`)}>
            {t(`settings.tabs.${id}`)}
          </button>
        ))}
      </div>

      {/* All tabs stay in the layout (stacked) so the dialog never changes size. */}
      <div className="settings-pane">
        {panel('appearance', (
          <div className="settings-split">
            <section className="sgroup">
              <h4>{t('settings.theme')}</h4>
              <ThemeChipGroups current={settings.theme} onPick={(id) => set({ theme: id })} />
            </section>
            <div className="settings-side">
              <section className="sgroup">
                <h4>{t('settings.language')}</h4>
                <div className="row seg-row seg-fill">
                  {LANGUAGES.map((lng) => (
                    <button key={lng.id} className={`btn seg${settings.lang === lng.id ? ' active' : ''}`} onClick={() => set({ lang: lng.id })} title={lng.native}>
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
                  <select className="input" value={settings.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })}>
                    <option value="">{t('settings.defaultFont')}</option>
                    {fonts.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </label>
                <div className="field">
                  <span className="field-label">{t('settings.fontSize')}</span>
                  <NumberStepper
                    min={FONT_SIZE_MIN}
                    max={FONT_SIZE_MAX}
                    value={settings.fontSize}
                    format={(v) => `${v}px`}
                    onChange={(v) => set({ fontSize: stepFontSize(v, 0, 0) })}
                    label={t('settings.fontSize')}
                  />
                </div>
                <div className="row seg-row">
                  <span className="field-label">{t('settings.fontStyle')}</span>
                  <button className={`btn seg${settings.fontWeight === 'bold' ? ' active' : ''}`} style={{ fontWeight: 700 }} onClick={() => set({ fontWeight: settings.fontWeight === 'bold' ? 'normal' : 'bold' })} title={t('settings.bold')}>B</button>
                  <button className={`btn seg${settings.fontStyle === 'italic' ? ' active' : ''}`} style={{ fontStyle: 'italic' }} onClick={() => set({ fontStyle: settings.fontStyle === 'italic' ? 'normal' : 'italic' })} title={t('settings.italic')}>I</button>
                  <button className={`btn seg${settings.fontUnderline ? ' active' : ''}`} style={{ textDecoration: 'underline' }} onClick={() => set({ fontUnderline: !settings.fontUnderline })} title={t('settings.underline')}>U</button>
                </div>
                <div className="font-preview" style={previewStyle}>{t('settings.previewText')}</div>
              </section>
              <CustomThemeEditor themes={settings.customThemes} current={settings.theme} onCommit={(patch) => set(patch)} />
            </div>
          </div>
        ))}

        {panel('engine', (
          <div className="settings-split">
            <div className="settings-side">
              <section className="sgroup">
                <h4>{t('settings.backend')}</h4>
                {['local', 'remote', 'stability'].map((id) => (
                  <label key={id} className="radio-row" title={t(`settings.backendTip.${id}`)}>
                    <input type="radio" name="backend" checked={settings.backend === id} onChange={() => chooseBackend(id)} />
                    <span>
                      <strong>{t(`settings.backendName.${id}`)}</strong>
                      <small>{t(`settings.backendTip.${id}`)}</small>
                    </span>
                  </label>
                ))}
                {!isDesktop ? (
                  <label className="field">
                    <span className="field-label">{t('settings.engineUrl')}</span>
                    <input className="input" value={settings.engineUrl} placeholder={DEFAULT_ENGINE_URL} onChange={(e) => set({ engineUrl: e.target.value.trim() || DEFAULT_ENGINE_URL })} />
                  </label>
                ) : null}
                {settings.backend === 'remote' ? (
                  <label className="field">
                    <span className="field-label">{t('settings.remoteUrl')}</span>
                    <input className="input" value={settings.remoteUrl} placeholder="http://192.168.0.10:57660" onChange={(e) => set({ remoteUrl: e.target.value.trim() })} />
                  </label>
                ) : null}
                {settings.backend === 'stability' ? (
                  <div className="stability-box">
                    <p className="panel-note warn"><IconAlert size={14} /> {t('settings.stabilityWarn')}</p>
                    <label className="field">
                      <span className="field-label">{t('settings.stabilityKey')}</span>
                      <input className="input" type="password" value={key} autoComplete="off" placeholder="sk-…" onChange={(e) => setKey(e.target.value)} onBlur={() => set({ stabilityKey: key.trim() })} />
                    </label>
                  </div>
                ) : null}
              </section>
              <section className="sgroup">
                <h4>{t('settings.device')}</h4>
                <div className="row seg-row seg-fill">
                  {['auto', 'gpu', 'cpu'].map((id) => (
                    <button key={id} className={`btn seg${settings.device === id ? ' active' : ''}`} onClick={() => set({ device: id })} title={t(`deviceTip.${id}`)}>
                      {t(`device.${id}`)}
                    </button>
                  ))}
                </div>
                <p className="panel-note">{t('settings.deviceNote')}</p>
              </section>
            </div>
            <div className="settings-side">
              <section className="sgroup">
                <h4>{t('settings.hfToken')}</h4>
                <p className="panel-note">{t('settings.hfTokenNote')}</p>
                <p className="panel-note">{health?.hasToken ? t('settings.tokenSaved') : t('settings.tokenNone')}</p>
                <div className="row">
                  <input className="input" type="password" value={token} placeholder="hf_…" autoComplete="off" onChange={(e) => setToken(e.target.value)} />
                  <button className="btn" disabled={!token.trim()} onClick={() => { onToken(token.trim()); setToken(''); }}><IconKey size={14} /> {t('engine.tokenSave')}</button>
                </div>
                {health?.hasToken ? <button className="btn small danger-ghost" onClick={onClearToken}><IconTrash size={13} /> {t('settings.tokenClear')}</button> : null}
              </section>
              <section className="sgroup">
                <h4>{t('settings.engineMaint')}</h4>
                <dl className="info-dl">
                  <div className="info-row"><dt>{t('settings.engineState')}</dt><dd>{health?.state || '—'}</dd></div>
                  <div className="info-row"><dt>PyTorch</dt><dd>{health?.torch ? `${health.torch} (${health.build})` : '—'}</dd></div>
                  <div className="info-row"><dt>Python</dt><dd>{health?.python || '—'}</dd></div>
                  <div className="info-row"><dt>{t('settings.engineHome')}</dt><dd className="mono-path">{health?.home || '—'}</dd></div>
                </dl>
                <div className="row wrap">
                  {isDesktop ? <button className="btn small" onClick={onRestartEngine}><IconRefresh size={14} /> {t('settings.restartEngine')}</button> : null}
                  {isDesktop ? <button className="btn small" onClick={onOpenEngineFolder}><IconFolder size={14} /> {t('settings.openEngineFolder')}</button> : null}
                  <button className="btn small danger-ghost" onClick={() => { if (window.confirm(t('settings.reinstallConfirm'))) onReinstall(); }}>
                    <IconRefresh size={14} /> {t('settings.reinstall')}
                  </button>
                </div>
              </section>
            </div>
          </div>
        ))}

        {panel('view', (
          <div className="settings-split">
            <div className="settings-side">
              <section className="sgroup">
                <h4>{t('settings.layout')}</h4>
                <label className="check"><input type="checkbox" checked={settings.showStartPage} onChange={(e) => set({ showStartPage: e.target.checked })} /><span>{t('start.showAtStart')}</span></label>
                <label className="check"><input type="checkbox" checked={settings.showToolbarLabels} onChange={(e) => set({ showToolbarLabels: e.target.checked })} /><span>{t('settings.toolbarLabels')}</span></label>
                <label className="check"><input type="checkbox" checked={settings.showStatusBar} onChange={(e) => set({ showStatusBar: e.target.checked })} /><span>{t('settings.statusBar')}</span></label>
                <label className="check"><input type="checkbox" checked={settings.logPanel} onChange={(e) => set({ logPanel: e.target.checked })} /><span>{t('settings.logPanel')}</span></label>
              </section>
            </div>
            <div className="settings-side">
              <section className="sgroup" data-settings-tutorial>
                <h4>{t('tutorial.settingsTitle')}</h4>
                <label className="check"><input type="checkbox" checked={settings.tutorialAsk} onChange={(e) => set({ tutorialAsk: e.target.checked })} /><span>{t('tutorial.settingsAsk')}</span></label>
                <p className="panel-note">{settings.tutorialDone ? t('tutorial.settingsDone') : t('tutorial.settingsProgress', { n: settings.tutorialIndex + 1, total: STEPS.length })}</p>
                <div className="row">
                  <button className="btn small primary" onClick={onTutorial}><IconSparkles size={14} /> {t('tutorial.start')}</button>
                </div>
              </section>
              <section className="sgroup">
                <h4>{t('start.background')}</h4>
                <BackgroundPicker settings={settings} onChange={(patch) => set(patch)} />
              </section>
              <section className="sgroup">
                <h4>{t('settings.viewerDefaults')}</h4>
                <p className="panel-note">{t('settings.viewerNote')}</p>
              </section>
            </div>
          </div>
        ))}

        {panel('files', (
          <div className="settings-split">
            <div className="settings-side">
              <section className="sgroup">
                <h4>{t('settings.export')}</h4>
                <label className="field">
                  <span className="field-label">{t('settings.exportFormat')}</span>
                  <select className="input" value={settings.exportFormat} onChange={(e) => set({ exportFormat: e.target.value })}>
                    {EXPORT_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </label>
                {isDesktop ? (
                  <>
                    <label className="check"><input type="checkbox" checked={settings.autoSave} onChange={(e) => set({ autoSave: e.target.checked })} /><span>{t('settings.autoSave')}</span></label>
                    <label className="field">
                      <span className="field-label">{t('settings.autoSaveFormat')}</span>
                      <select className="input" value={settings.autoSaveFormat} disabled={!settings.autoSave} onChange={(e) => set({ autoSaveFormat: e.target.value })}>
                        {EXPORT_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                    </label>
                  </>
                ) : null}
              </section>
            </div>
            <div className="settings-side">
              <section className="sgroup">
                <h4>{t('settings.storage')}</h4>
                <p className="panel-note">{isDesktop ? storagePath : t('settings.storageWeb')}</p>
                <button className="btn small" onClick={() => set({ recentFiles: [] })}><IconTrash size={13} /> {t('recent.clear')}</button>
              </section>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
