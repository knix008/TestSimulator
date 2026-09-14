import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DialogFrame } from './DialogFrame.jsx';
import { Icon } from '../components/Icons.jsx';
import { Field, Check } from '../components/common.jsx';
import { THEMES } from '../themes.js';
import { IMAGE_FORMATS, VIDEO_FPS, DEFAULT_SETTINGS, normalizeSettings, removeRecent } from '../lib/settings.js';
import { listFonts } from '../lib/fonts.js';
import { platform } from '../lib/platform.js';
import { formatDateTime } from '../lib/format.js';

const PAGES = [
  { id: 'general', icon: 'general' },
  { id: 'appearance', icon: 'palette' },
  { id: 'capture', icon: 'camera' },
  { id: 'video', icon: 'video' },
  { id: 'annotation', icon: 'pen' },
  { id: 'files', icon: 'files' },
];

/**
 * Every change is applied live: the dialog submits the whole settings object
 * (keepOpen) and the main window persists it and re-themes itself.
 */
export function SettingsDialog({ payload, onSubmit, onClose, standalone }) {
  const { t, i18n } = useTranslation();
  const [s, setS] = useState(() => normalizeSettings(payload && payload.settings));
  const [page, setPage] = useState('general');
  const [fonts, setFonts] = useState(null);
  const videoFormats = (payload && payload.videoFormats) || [];

  useEffect(() => { setS(normalizeSettings(payload && payload.settings)); }, [payload]);
  useEffect(() => { listFonts().then(setFonts); }, []);

  const update = (patch) => {
    const next = normalizeSettings({ ...s, ...patch });
    setS(next);
    onSubmit({ type: 'change', settings: next }, true);
    if (next.language !== i18n.language) i18n.changeLanguage(next.language);
  };
  const sub = (key, patch) => update({ [key]: { ...s[key], ...patch } });

  const fontOptions = useMemo(() => (fonts ? fonts.families : []), [fonts]);
  const themeLabel = (th) => (i18n.language === 'ko' ? th.label : th.labelEn);

  const FontPicker = ({ value, onChange }) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ maxWidth: 320 }}>
      <option value="">{t('settings.systemDefault')}</option>
      {value && !fontOptions.includes(value) ? <option value={value}>{value}</option> : null}
      {fontOptions.map((f) => <option key={f} value={f}>{f}</option>)}
    </select>
  );

  return (
    <DialogFrame title={t('settings.title')} standalone={standalone} onClose={onClose} className="settings-dlg"
      footer={<>
        <div className="left"><button className="btn" onClick={() => onSubmit({ type: 'reset' }, true)}><Icon name="refresh" />{t('settings.resetAll')}</button></div>
        <button className="btn primary" onClick={onClose}>{t('common.close')}</button>
      </>}
    >
      <div className="settings" style={{ margin: '-16px -18px', height: 'calc(100% + 32px)' }}>
        <div className="settings-nav">
          {PAGES.map((p) => (
            <button key={p.id} className={page === p.id ? 'active' : ''} onClick={() => setPage(p.id)}><Icon name={p.icon} />{t(`settings.${p.id}`)}</button>
          ))}
        </div>
        <div className="settings-page">
          {page === 'general' ? (
            <>
              <div className="section-title">{t('settings.general')}</div>
              <Field label={t('settings.language')}>
                <select value={s.language} onChange={(e) => update({ language: e.target.value })}>
                  <option value="ko">{t('settings.languageKo')}</option>
                  <option value="en">{t('settings.languageEn')}</option>
                </select>
              </Field>
              <Field label={t('settings.opacity')}>
                <div className="inline">
                  <input type="range" min={0} max={100} value={s.opacity} onChange={(e) => update({ opacity: Number(e.target.value) })} style={{ width: 200 }} />
                  <span>{s.opacity}%</span>
                </div>
              </Field>
              <Check label={t('settings.checkerboard')} checked={s.editor.checkerboard} onChange={(v) => sub('editor', { checkerboard: v })} />
            </>
          ) : null}

          {page === 'appearance' ? (
            <>
              <div className="section-title">{t('settings.theme')}</div>
              <div className="theme-grid">
                {THEMES.map((th) => (
                  <div key={th.id} className={`theme-card${s.theme === th.id ? ' active' : ''}`} onClick={() => update({ theme: th.id })}>
                    <div className="theme-swatch">
                      <span style={{ background: th.tokens['--bg'] }} />
                      <span style={{ background: th.tokens['--bg-panel'] }} />
                      <span style={{ background: th.tokens['--accent'] }} />
                      <span style={{ background: th.tokens['--text'] }} />
                    </div>
                    <div className="n">{themeLabel(th)}</div>
                  </div>
                ))}
              </div>
              <div className="section-title" style={{ marginTop: 18 }}>{t('settings.uiFont')}</div>
              <Field label={t('settings.fontFamily')} hint={fonts ? (fonts.source === 'system' ? t('settings.fontsCount', { n: fonts.families.length }) : t('settings.fontsDenied')) : t('settings.fontsLoading')}>
                <FontPicker value={s.font.family} onChange={(v) => sub('font', { family: v })} />
              </Field>
              <Field label={t('settings.fontSize')}>
                <div className="inline">
                  <input type="number" min={9} max={24} value={s.font.size} onChange={(e) => sub('font', { size: Number(e.target.value) })} style={{ width: 80 }} />
                  <span>px</span>
                  <Check label={t('settings.fontBold')} checked={s.font.bold} onChange={(v) => sub('font', { bold: v })} />
                  <Check label={t('settings.fontItalic')} checked={s.font.italic} onChange={(v) => sub('font', { italic: v })} />
                </div>
              </Field>
              <div className="font-preview" style={{ fontFamily: s.font.family ? `"${s.font.family}", sans-serif` : undefined, fontSize: s.font.size, fontWeight: s.font.bold ? 700 : 400, fontStyle: s.font.italic ? 'italic' : 'normal' }}>
                {t('settings.fontPreview')}
              </div>
            </>
          ) : null}

          {page === 'capture' ? (
            <>
              <div className="section-title">{t('settings.capture')}</div>
              <Field label={t('settings.delay')} hint={t('settings.delayHint')}>
                <div className="inline">
                  <input type="range" min={0} max={30} value={s.capture.delay} onChange={(e) => sub('capture', { delay: Number(e.target.value) })} style={{ width: 200 }} />
                  <span>{s.capture.delay} s</span>
                </div>
              </Field>
              <Check label={t('settings.hideWindow')} checked={s.capture.hideWindow} onChange={(v) => sub('capture', { hideWindow: v })} /><br />
              <Check label={t('settings.showCountdown')} checked={s.capture.showCountdown} onChange={(v) => sub('capture', { showCountdown: v })} /><br />
              <Check label={t('settings.copyToClipboard')} checked={s.capture.copyToClipboard} onChange={(v) => sub('capture', { copyToClipboard: v })} />
              <div className="section-title" style={{ marginTop: 18 }}>{t('toolbar.export')}</div>
              <Field label={t('settings.imageFormat')}>
                <select value={s.image.format} onChange={(e) => sub('image', { format: e.target.value })}>
                  {IMAGE_FORMATS.map((f) => <option key={f.id} value={f.id}>{t(`format.${f.id}`)}</option>)}
                </select>
              </Field>
              <Field label={t('settings.imageQuality')}>
                <div className="inline">
                  <input type="range" min={10} max={100} value={s.image.quality} onChange={(e) => sub('image', { quality: Number(e.target.value) })} style={{ width: 200 }} />
                  <span>{s.image.quality}%</span>
                </div>
              </Field>
            </>
          ) : null}

          {page === 'video' ? (
            <>
              <div className="section-title">{t('settings.video')}</div>
              <Field label={t('settings.videoFormat')}>
                <select value={s.video.format} onChange={(e) => sub('video', { format: e.target.value })}>
                  <option value="auto">{t('common.auto')}</option>
                  {videoFormats.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </Field>
              <Field label={t('settings.videoFps')}>
                <select value={s.video.fps} onChange={(e) => sub('video', { fps: Number(e.target.value) })}>
                  {VIDEO_FPS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </Field>
              <Field label={t('settings.videoBitrate')}>
                <div className="inline">
                  <input type="range" min={1} max={50} value={s.video.bitrateMbps} onChange={(e) => sub('video', { bitrateMbps: Number(e.target.value) })} style={{ width: 200 }} />
                  <span>{s.video.bitrateMbps} Mbps</span>
                </div>
              </Field>
              <Check label={t('settings.systemAudio')} checked={s.video.systemAudio} onChange={(v) => sub('video', { systemAudio: v })} /><br />
              <Check label={t('settings.microphone')} checked={s.video.microphone} onChange={(v) => sub('video', { microphone: v })} /><br />
              <Check label={t('settings.minimizeWhileRecording')} checked={s.video.minimizeWhileRecording} onChange={(v) => sub('video', { minimizeWhileRecording: v })} /><br />
              <Check label={t('settings.askPath')} checked={s.video.askPath} onChange={(v) => sub('video', { askPath: v })} />
              <Field label={t('settings.videoDir')} hint={t('settings.videoDirHint')}>
                <div className="inline">
                  <input type="text" value={s.paths.videoDir} onChange={(e) => sub('paths', { videoDir: e.target.value })} />
                  <button className="btn small" onClick={async () => { const d = await platform.pickDirectory({ defaultDir: s.paths.videoDir }); if (d) sub('paths', { videoDir: d }); }}>{t('common.browse')}</button>
                </div>
              </Field>
            </>
          ) : null}

          {page === 'annotation' ? (
            <>
              <div className="section-title">{t('settings.annotation')}</div>
              <Field label={t('settings.annColor')}>
                <input type="color" value={s.annotation.color} onChange={(e) => sub('annotation', { color: e.target.value })} className="tb-color" />
              </Field>
              <Field label={t('settings.annStroke')}>
                <div className="inline">
                  <input type="range" min={1} max={40} value={s.annotation.strokeWidth} onChange={(e) => sub('annotation', { strokeWidth: Number(e.target.value) })} style={{ width: 200 }} />
                  <span>{s.annotation.strokeWidth} px</span>
                </div>
              </Field>
              <Check label={t('settings.annFill')} checked={s.annotation.fill} onChange={(v) => sub('annotation', { fill: v })} />
              <Field label={t('settings.annFont')}>
                <FontPicker value={s.annotation.fontFamily} onChange={(v) => sub('annotation', { fontFamily: v })} />
              </Field>
              <Field label={t('settings.annFontSize')}>
                <div className="inline">
                  <input type="number" min={8} max={200} value={s.annotation.fontSize} onChange={(e) => sub('annotation', { fontSize: Number(e.target.value) })} style={{ width: 80 }} />
                  <span>px</span>
                  <Check label={t('settings.fontBold')} checked={s.annotation.bold} onChange={(v) => sub('annotation', { bold: v })} />
                  <Check label={t('settings.fontItalic')} checked={s.annotation.italic} onChange={(v) => sub('annotation', { italic: v })} />
                </div>
              </Field>
              <div className="font-preview" style={{ fontFamily: s.annotation.fontFamily ? `"${s.annotation.fontFamily}", sans-serif` : undefined, fontSize: Math.min(40, s.annotation.fontSize), fontWeight: s.annotation.bold ? 700 : 400, fontStyle: s.annotation.italic ? 'italic' : 'normal', color: s.annotation.color }}>
                {t('settings.fontPreview')}
              </div>
            </>
          ) : null}

          {page === 'files' ? (
            <>
              <div className="section-title">{t('settings.recent')}</div>
              {s.recent.length ? (
                <div className="recent-list">
                  {s.recent.map((r) => (
                    <div key={r.path} className="recent-row">
                      <Icon name={r.kind === 'video' ? 'video' : r.kind === 'image' ? 'image' : 'file'} size={16} />
                      <span className="name">{r.name}</span>
                      <span className="path" title={r.path}>{r.path}</span>
                      <span style={{ color: 'var(--text-faint)', fontSize: '0.82em' }}>{formatDateTime(r.openedAt, i18n.language)}</span>
                      <button className="btn small" onClick={() => update({ recent: removeRecent(s.recent, r.path) })}>{t('settings.recentRemove')}</button>
                    </div>
                  ))}
                </div>
              ) : <div style={{ color: 'var(--text-faint)' }}>{t('settings.recentEmpty')}</div>}
              <div style={{ marginTop: 8 }}>
                <button className="btn small" disabled={!s.recent.length} onClick={() => update({ recent: [] })}><Icon name="trash" />{t('settings.recentClear')}</button>
              </div>
              <div className="section-title" style={{ marginTop: 18 }}>{t('settings.paths')}</div>
              {[['lastOpenDir', t('settings.lastOpenDir')], ['lastSaveDir', t('settings.lastSaveDir')], ['lastExportDir', t('settings.lastExportDir')]].map(([k, label]) => (
                <Field key={k} label={label}>
                  <div className="inline">
                    <input type="text" value={s.paths[k]} readOnly placeholder={t('common.none')} />
                    <button className="btn small" disabled={!s.paths[k]} onClick={() => sub('paths', { [k]: '' })}>{t('settings.forget')}</button>
                  </div>
                </Field>
              ))}
            </>
          ) : null}
        </div>
      </div>
    </DialogFrame>
  );
}

export { DEFAULT_SETTINGS };
