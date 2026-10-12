import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DialogFrame } from './DialogFrame.jsx';
import { Icon } from '../components/Icons.jsx';
import { Field, Check, NumberInput } from '../components/common.jsx';
import { THEMES, themeFromCustom } from '../themes.js';
import { IMAGE_FORMATS, VIDEO_FPS, DEFAULT_SETTINGS, normalizeSettings, removeRecent } from '../lib/settings.js';
import { listFonts } from '../lib/fonts.js';
import { platform } from '../lib/platform.js';
import { formatDateTime } from '../lib/format.js';

const PAGES = [
  { id: 'general', icon: 'general' },
  { id: 'theme', icon: 'palette' },
  { id: 'appearance', icon: 'font' },
  { id: 'capture', icon: 'camera' },
  { id: 'video', icon: 'video' },
  { id: 'annotation', icon: 'pen' },
  { id: 'files', icon: 'files' },
];

const MAX_PAGE_W = 1100;

/**
 * Every change is applied live: the dialog submits the whole settings object
 * (keepOpen) and the main window persists it and re-themes itself.
 */
export function SettingsDialog({ payload, onSubmit, onClose, standalone }) {
  const { t, i18n } = useTranslation();
  const [s, setS] = useState(() => normalizeSettings(payload && payload.settings));
  const [page, setPage] = useState((payload && payload.page) || 'general');
  const [themeMode, setThemeMode] = useState('builtin');
  const [fonts, setFonts] = useState(null);
  const rootRef = useRef(null);
  const pageRef = useRef(null);
  const measureRef = useRef(null);
  const videoFormats = (payload && payload.videoFormats) || [];

  useEffect(() => {
    setS(normalizeSettings(payload && payload.settings));
    if (payload && payload.page) setPage(payload.page);
  }, [payload]);
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

  // Fixed-size window: measure every page at its natural width (the tab row
  // never wraps), then at the common width find the tallest page, and size
  // the window/modal to exactly that.
  const fit = useCallback(() => {
    const root = rootRef.current;
    const measure = measureRef.current;
    const pageEl = pageRef.current;
    if (!root || !measure || !pageEl) return;
    const dlg = root.closest('.dlg');
    const tabs = root.querySelector('.settings-tabs');
    const pages = Array.from(measure.children);
    const last = tabs.lastElementChild;
    const tabsW = last.offsetLeft + last.offsetWidth + (parseFloat(getComputedStyle(tabs).paddingRight) || 0);

    pages.forEach((p) => { p.style.width = 'max-content'; });
    const w = Math.ceil(Math.min(MAX_PAGE_W, Math.max(tabsW, ...pages.map((p) => p.offsetWidth))));
    pages.forEach((p) => { p.style.width = `${w}px`; });
    const h = Math.ceil(Math.max(...pages.map((p) => p.offsetHeight)));

    const width = w + (dlg.offsetWidth - pageEl.clientWidth);
    const height = h + (dlg.offsetHeight - pageEl.clientHeight);
    if (standalone) {
      platform.dialogs.setSize(width, height);
    } else {
      const modal = dlg.closest('.modal');
      if (modal) { modal.style.setProperty('--modal-w', `${width}px`); modal.style.setProperty('--modal-h', `${height}px`); }
    }
  }, [standalone]);

  useLayoutEffect(fit, [fit, i18n.language, s.font, s.customThemes, s.recent, s.paths, fonts]);
  useEffect(() => {
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  }, [fit, s.font]);

  const pageContent = {
    general: (
      <>
        <div className="section-title">{t('settings.general')}</div>
        <Field label={t('settings.language')}>
          <select value={s.language} onChange={(e) => update({ language: e.target.value })}>
            <option value="ko">{t('settings.languageKo')}</option>
            <option value="en">{t('settings.languageEn')}</option>
          </select>
        </Field>
        <Check label={t('settings.checkerboard')} checked={s.editor.checkerboard} onChange={(v) => sub('editor', { checkerboard: v })} />
      </>
    ),
    theme: (
      <ThemePage s={s} themeMode={themeMode} setThemeMode={setThemeMode} update={update} themeLabel={themeLabel} t={t} />
    ),
    appearance: (
      <>
        <div className="section-title">{t('settings.uiFont')}</div>
        <Field label={t('settings.fontFamily')} hint={fonts ? (fonts.source === 'system' ? t('settings.fontsCount', { n: fonts.families.length }) : t('settings.fontsDenied')) : t('settings.fontsLoading')}>
          <FontPicker value={s.font.family} onChange={(v) => sub('font', { family: v })} />
        </Field>
        <Field label={t('settings.fontSize')}>
          <div className="inline">
            <NumberInput min={9} max={24} value={s.font.size} onChange={(v) => sub('font', { size: v })} ariaLabel={t('settings.fontSize')} unit="px" />
            <Check label={t('settings.fontBold')} checked={s.font.bold} onChange={(v) => sub('font', { bold: v })} />
            <Check label={t('settings.fontItalic')} checked={s.font.italic} onChange={(v) => sub('font', { italic: v })} />
          </div>
        </Field>
        <div className="font-preview" style={{ fontFamily: s.font.family ? `"${s.font.family}", sans-serif` : undefined, fontSize: s.font.size, fontWeight: s.font.bold ? 700 : 400, fontStyle: s.font.italic ? 'italic' : 'normal' }}>
          {t('settings.fontPreview')}
        </div>
      </>
    ),
    capture: (
      <>
        <div className="section-title">{t('settings.capture')}</div>
        <Field label={t('settings.delay')} hint={t('settings.delayHint')}>
          <div className="inline">
            <input type="range" min={0} max={30} value={s.capture.delay} onChange={(e) => sub('capture', { delay: Number(e.target.value) })} style={{ width: 200 }} />
            <NumberInput min={0} max={30} value={s.capture.delay} onChange={(v) => sub('capture', { delay: v })} ariaLabel={t('settings.delay')} unit="s" />
          </div>
        </Field>
        <Check label={t('settings.hideWindow')} checked={s.capture.hideWindow} onChange={(v) => sub('capture', { hideWindow: v })} />
        <div className="hint" style={{ margin: '2px 0 8px 24px' }}>{t('settings.hideWindowHint')}</div>
        <Check label={t('settings.allowSelf')} checked={s.capture.allowSelf} onChange={(v) => sub('capture', { allowSelf: v })} /><br />
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
            <NumberInput min={10} max={100} value={s.image.quality} onChange={(v) => sub('image', { quality: v })} ariaLabel={t('settings.imageQuality')} unit="%" />
          </div>
        </Field>
      </>
    ),
    video: (
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
            <NumberInput min={1} max={50} value={s.video.bitrateMbps} onChange={(v) => sub('video', { bitrateMbps: v })} ariaLabel={t('settings.videoBitrate')} unit="Mbps" />
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
    ),
    annotation: (
      <>
        <div className="section-title">{t('settings.annotation')}</div>
        <Field label={t('settings.annColor')}>
          <input type="color" value={s.annotation.color} onChange={(e) => sub('annotation', { color: e.target.value })} className="tb-color" />
        </Field>
        <Field label={t('settings.annStroke')}>
          <div className="inline">
            <input type="range" min={1} max={40} value={s.annotation.strokeWidth} onChange={(e) => sub('annotation', { strokeWidth: Number(e.target.value) })} style={{ width: 200 }} />
            <NumberInput min={1} max={40} value={s.annotation.strokeWidth} onChange={(v) => sub('annotation', { strokeWidth: v })} ariaLabel={t('settings.annStroke')} unit="px" />
          </div>
        </Field>
        <Check label={t('settings.annFill')} checked={s.annotation.fill} onChange={(v) => sub('annotation', { fill: v })} />
        <Field label={t('settings.annFont')}>
          <FontPicker value={s.annotation.fontFamily} onChange={(v) => sub('annotation', { fontFamily: v })} />
        </Field>
        <Field label={t('settings.annFontSize')}>
          <div className="inline">
            <NumberInput min={8} max={200} value={s.annotation.fontSize} onChange={(v) => sub('annotation', { fontSize: v })} ariaLabel={t('settings.annFontSize')} unit="px" />
            <Check label={t('settings.fontBold')} checked={s.annotation.bold} onChange={(v) => sub('annotation', { bold: v })} />
            <Check label={t('settings.fontItalic')} checked={s.annotation.italic} onChange={(v) => sub('annotation', { italic: v })} />
          </div>
        </Field>
        <div className="font-preview" style={{ fontFamily: s.annotation.fontFamily ? `"${s.annotation.fontFamily}", sans-serif` : undefined, fontSize: Math.min(40, s.annotation.fontSize), fontWeight: s.annotation.bold ? 700 : 400, fontStyle: s.annotation.italic ? 'italic' : 'normal', color: s.annotation.color }}>
          {t('settings.fontPreview')}
        </div>
      </>
    ),
    files: (
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
    ),
  };

  return (
    <DialogFrame title={t('settings.title')} standalone={standalone} onClose={onClose} className="settings-dlg"
      footer={<>
        <div className="left"><button className="btn" onClick={() => onSubmit({ type: 'reset' }, true)}><Icon name="refresh" />{t('settings.resetAll')}</button></div>
        <button className="btn primary" onClick={onClose}>{t('common.close')}</button>
      </>}
    >
      <div className="settings" ref={rootRef}>
        <div className="settings-tabs" role="tablist">
          {PAGES.map((p) => (
            <button key={p.id} role="tab" aria-selected={page === p.id} className={page === p.id ? 'active' : ''} onClick={() => setPage(p.id)}><Icon name={p.icon} />{t(`settings.${p.id}`)}</button>
          ))}
        </div>
        <div className="settings-page" role="tabpanel" ref={pageRef}>
          {pageContent[page]}
        </div>
        {/* Off-screen copy of every page: the window is sized to the largest. */}
        <div className="settings-measure" ref={measureRef} aria-hidden="true" inert="">
          {PAGES.map((p) => (p.id === 'theme'
            ? ['builtin', 'custom'].map((mode) => (
              <div key={mode} className="settings-page">
                <ThemePage s={s} themeMode={mode} setThemeMode={() => {}} update={() => {}} themeLabel={themeLabel} t={t} />
              </div>
            ))
            : <div key={p.id} className="settings-page">{pageContent[p.id]}</div>))}
        </div>
      </div>
    </DialogFrame>
  );
}

const COLOR_FIELDS = [
  ['bg', 'colorBg'],
  ['panel', 'colorPanel'],
  ['text', 'colorText'],
  ['accent', 'colorAccent'],
  ['titlebar', 'colorTitlebar'],
];

function ThemePage({ s, themeMode, setThemeMode, update, themeLabel, t }) {
  const customs = s.customThemes || [];
  const editing = customs.find((item) => item.id === s.theme && String(item.id).startsWith('custom-')) || customs[0] || null;
  const patch = (id, fields) => update({ customThemes: customs.map((item) => (item.id === id ? { ...item, ...fields } : item)) });
  const create = () => {
    const id = `custom-${Date.now().toString(36)}`;
    const item = {
      id,
      label: t('settings.customThemeDefault'),
      mode: 'dark',
      bg: '#1a1d27',
      panel: '#242836',
      text: '#e8eaf2',
      accent: '#7aa2f7',
      titlebar: '#13151c',
    };
    update({ customThemes: [...customs, item], theme: id });
    setThemeMode('custom');
  };
  const remove = (id) => {
    const next = customs.filter((item) => item.id !== id);
    update({ customThemes: next, theme: s.theme === id ? 'midnight' : s.theme });
  };
  const tabs = [
    { id: 'builtin', label: `${t('settings.themeDark')} · ${t('settings.themeLight')}` },
    { id: 'custom', label: t('settings.themeCustom') },
  ];
  const groups = [
    { mode: 'dark', icon: 'moon', label: t('settings.themeDark') },
    { mode: 'light', icon: 'sun', label: t('settings.themeLight') },
  ];

  return (
    <>
      <div className="subtabs" role="tablist">
        {tabs.map(({ id, label }) => (
          <button key={id} type="button" role="tab" aria-selected={themeMode === id} className={themeMode === id ? 'active' : ''} onClick={() => setThemeMode(id)}>
            {label}
          </button>
        ))}
      </div>
      {themeMode !== 'custom' ? groups.map((g) => (
        <div key={g.mode} className="theme-group">
          <div className="theme-group-head"><Icon name={g.icon} />{g.label}</div>
          <div className="theme-grid dense">
            {THEMES.filter((th) => th.mode === g.mode).map((th) => (
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
        </div>
      )) : (
        <div className="custom-theme">
          {!customs.length ? <div style={{ color: 'var(--text-faint)', marginBottom: 8 }}>{t('settings.customEmpty')}</div> : null}
          <div className="inline" style={{ marginBottom: 8 }}>
            <button className="btn small" type="button" onClick={create}>{t('settings.customNew')}</button>
            {editing ? <button className="btn small danger" type="button" onClick={() => remove(editing.id)}><Icon name="trash" />{t('settings.customDelete')}</button> : null}
          </div>
          {customs.length > 1 ? (
            <Field label={t('settings.theme')}>
              <select value={editing ? editing.id : ''} onChange={(e) => update({ theme: e.target.value })}>
                {customs.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </Field>
          ) : null}
          {editing ? (
            <>
              <Field label={t('settings.customName')}>
                <input type="text" maxLength={40} value={editing.label} onChange={(e) => patch(editing.id, { label: e.target.value })} />
              </Field>
              <Field label={t('settings.customMode')}>
                <select value={editing.mode} onChange={(e) => patch(editing.id, { mode: e.target.value })}>
                  <option value="dark">{t('settings.themeDark')}</option>
                  <option value="light">{t('settings.themeLight')}</option>
                </select>
              </Field>
              <div className="custom-colors">
                {COLOR_FIELDS.map(([key, label]) => (
                  <label key={key} className="custom-color">
                    <span>{t(`settings.${label}`)}</span>
                    <input type="color" value={editing[key]} onChange={(e) => patch(editing.id, { [key]: e.target.value })} />
                  </label>
                ))}
              </div>
              <div className="theme-swatch" style={{ marginTop: 10, height: 28 }}>
                {['--bg', '--bg-panel', '--accent', '--text'].map((token) => (
                  <span key={token} style={{ background: themeFromCustom({ ...editing, label: editing.label }).tokens[token] }} />
                ))}
              </div>
              <button className="btn small" type="button" style={{ marginTop: 8 }} onClick={() => update({ theme: editing.id })}>{t('common.apply')}</button>
            </>
          ) : null}
        </div>
      )}
    </>
  );
}

export { DEFAULT_SETTINGS };
