import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DialogFrame, applyDialogSize } from './DialogFrame.jsx';
import { Icon } from '../components/Icons.jsx';
import { Field, Check, NumberInput } from '../components/common.jsx';
import { THEMES, themeFromCustom } from '../themes.js';
import { imageFormatsFor, VIDEO_FPS, DEFAULT_SETTINGS, AUDIO_GAIN, normalizeSettings, removeRecent } from '../lib/settings.js';
import { listMicrophones, openMicrophone, systemAudioStream } from '../lib/capture.js';
import { listFonts } from '../lib/fonts.js';
import { platform } from '../lib/platform.js';
import { formatDateTime } from '../lib/format.js';

const PAGES = [
  { id: 'general', icon: 'general' },
  { id: 'theme', icon: 'palette' },
  { id: 'capture', icon: 'camera' },
  { id: 'video', icon: 'video' },
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
  const imageFormats = imageFormatsFor(!!platform.image);
  const imageFormat = imageFormats.find((f) => f.id === s.image.format) || imageFormats[0];
  const labelFor = (lang) => (th) => (lang === 'ko' ? th.label : th.labelEn);

  // Fixed width: the font list arrives after the window has been sized.
  const fontPicker = (tt, value, onChange) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 320 }}>
      <option value="">{tt('settings.systemDefault')}</option>
      {value && !fontOptions.includes(value) ? <option value={value}>{value}</option> : null}
      {fontOptions.map((f) => <option key={f} value={f}>{f}</option>)}
    </select>
  );

  // Fixed-size window, sized once when it opens: every page in both languages
  // is measured at its natural width (the tab row never wraps), then at the
  // common width the tallest page sets the height. Later choices (language,
  // font, recent list, ...) never resize it; a page scrolls if it must.
  const [measuring, setMeasuring] = useState(true);
  const fit = useCallback(() => {
    const root = rootRef.current;
    const measure = measureRef.current;
    const pageEl = pageRef.current;
    if (!root || !measure || !pageEl) return;
    const dlg = root.closest('.dlg');
    const pages = Array.from(measure.querySelectorAll(':scope > .settings-page'));
    const tabsW = Math.max(...Array.from(measure.querySelectorAll(':scope > .settings-tabs')).map((tabs) => {
      const last = tabs.lastElementChild;
      return last.offsetLeft + last.offsetWidth + (parseFloat(getComputedStyle(tabs).paddingRight) || 0);
    }));

    pages.forEach((p) => { p.style.width = 'max-content'; });
    const w = Math.ceil(Math.min(MAX_PAGE_W, Math.max(tabsW, ...pages.map((p) => p.offsetWidth))));
    pages.forEach((p) => { p.style.width = `${w}px`; });
    const h = Math.ceil(Math.max(...pages.map((p) => p.offsetHeight)));

    applyDialogSize(dlg, w + (dlg.offsetWidth - pageEl.clientWidth), h + (dlg.offsetHeight - pageEl.clientHeight), standalone);
  }, [standalone]);

  useLayoutEffect(fit, [fit]);
  useEffect(() => {
    let alive = true;
    const done = () => { if (alive) { fit(); setMeasuring(false); } };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(done); else done();
    return () => { alive = false; };
  }, [fit]);

  const renderPages = (t, lang, live = false) => ({
    general: (
      <>
        <div className="section-title">{t('settings.general')}</div>
        <Field label={t('settings.language')}>
          <select value={s.language} onChange={(e) => update({ language: e.target.value })}>
            <option value="ko">{t('settings.languageKo')}</option>
            <option value="en">{t('settings.languageEn')}</option>
          </select>
        </Field>
        <Field label={t('settings.captureDir')} hint={t('settings.captureDirHint')}>
          <div className="inline">
            <input type="text" value={s.paths.captureDir} placeholder={t('common.none')} onChange={(e) => sub('paths', { captureDir: e.target.value })} />
            <button className="btn small" onClick={async () => { const d = await platform.pickDirectory({ defaultDir: s.paths.captureDir }); if (d) sub('paths', { captureDir: d }); }}>{t('common.browse')}</button>
            <button className="btn small" disabled={!s.paths.captureDir} onClick={() => sub('paths', { captureDir: '' })}>{t('settings.forget')}</button>
          </div>
        </Field>
        <Field label={t('settings.imageFormat')} hint={t('settings.imageFormatHint')}>
          <select value={imageFormat.id} onChange={(e) => sub('image', { format: e.target.value })}>
            {imageFormats.map((f) => <option key={f.id} value={f.id}>{t(`format.${f.id}`)} (.{f.ext})</option>)}
          </select>
        </Field>
        <Field label={t('settings.imageQuality')}>
          <div className="inline">
            <input type="range" min={10} max={100} value={s.image.quality} disabled={!imageFormat.quality} onChange={(e) => sub('image', { quality: Number(e.target.value) })} style={{ width: 200 }} />
            <NumberInput min={10} max={100} value={s.image.quality} disabled={!imageFormat.quality} onChange={(v) => sub('image', { quality: v })} ariaLabel={t('settings.imageQuality')} unit="%" />
          </div>
        </Field>
        <div className="section-title" style={{ marginTop: 18 }}>{t('settings.uiFont')}</div>
        <Field label={t('settings.fontFamily')} hint={fonts ? (fonts.source === 'system' ? t('settings.fontsCount', { n: fonts.families.length }) : t('settings.fontsDenied')) : t('settings.fontsLoading')}>
          {fontPicker(t, s.font.family, (v) => sub('font', { family: v }))}
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
        <div className="section-title" style={{ marginTop: 18 }}>{t('settings.annotation')}</div>
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
          {fontPicker(t, s.annotation.fontFamily, (v) => sub('annotation', { fontFamily: v }))}
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
    theme: (
      <ThemePage s={s} themeMode={themeMode} setThemeMode={setThemeMode} update={update} themeLabel={labelFor(lang)} t={t} />
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
      </>
    ),
    video: (
      <>
        <div className="section-title">{t('settings.video')}</div>
        <Field label={t('settings.videoFormat')} hint={videoFormats.some((f) => f.gif) ? t('settings.videoGifHint') : undefined}>
          <select value={s.video.format} onChange={(e) => sub('video', { format: e.target.value })}>
            <option value="auto">{t('common.auto')}</option>
            {videoFormats.map((f) => <option key={f.id} value={f.id}>{f.labelKey ? t(f.labelKey) : f.label}</option>)}
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
        <Check label={t('settings.minimizeWhileRecording')} checked={s.video.minimizeWhileRecording} onChange={(v) => sub('video', { minimizeWhileRecording: v })} /><br />
        <Check label={t('settings.askPath')} checked={s.video.askPath} onChange={(v) => sub('video', { askPath: v })} />
        <Field label={t('settings.videoDir')} hint={t('settings.videoDirHint')}>
          <div className="inline">
            <input type="text" value={s.paths.videoDir} onChange={(e) => sub('paths', { videoDir: e.target.value })} />
            <button className="btn small" onClick={async () => { const d = await platform.pickDirectory({ defaultDir: s.paths.videoDir }); if (d) sub('paths', { videoDir: d }); }}>{t('common.browse')}</button>
          </div>
        </Field>
        <div className="section-title" style={{ marginTop: 18 }}>{t('settings.systemAudioSection')}</div>
        <SystemAudioSettings s={s} sub={sub} t={t} />
        <div className="section-title" style={{ marginTop: 18 }}>{t('settings.micSection')}</div>
        <MicSettings s={s} sub={sub} t={t} live={live} />
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
                <span style={{ color: 'var(--text-faint)', fontSize: '0.82em' }}>{formatDateTime(r.openedAt, lang)}</span>
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
  });
  const pageContent = renderPages(t, i18n.language, true);

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
        {/* Off-screen copy of every page in both languages, only until sized. */}
        {measuring ? (
          <div className="settings-measure" ref={measureRef} aria-hidden="true" inert="">
            {['ko', 'en'].map((lang) => {
              const tt = i18n.getFixedT(lang);
              const pages = renderPages(tt, lang);
              return (
                <React.Fragment key={lang}>
                  <div className="settings-tabs">
                    {PAGES.map((p) => <button key={p.id} type="button"><Icon name={p.icon} />{tt(`settings.${p.id}`)}</button>)}
                  </div>
                  {PAGES.map((p) => (p.id === 'theme'
                    ? ['builtin', 'custom'].map((mode) => (
                      <div key={mode} className="settings-page">
                        <ThemePage s={s} themeMode={mode} setThemeMode={() => {}} update={() => {}} themeLabel={labelFor(lang)} t={tt} />
                      </div>
                    ))
                    : <div key={p.id} className="settings-page">{pages[p.id]}</div>))}
                </React.Fragment>
              );
            })}
          </div>
        ) : null}
      </div>
    </DialogFrame>
  );
}

/**
 * Microphone choice, level and processing, with a live meter. Devices are
 * only opened in the visible page (`live`), never in the off-screen copy.
 */
function MicSettings({ s, sub, t, live }) {
  const m = s.mic;
  const [mics, setMics] = useState({ devices: [], defaultLabel: '' });
  const supported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  const meter = useLevelMeter(() => openMicrophone(m), m.gain, [m.deviceId, m.echoCancellation, m.noiseSuppression, m.autoGainControl]);

  const refresh = useCallback(() => { listMicrophones().then(setMics).catch(() => {}); }, []);
  useEffect(() => {
    if (!live || !supported) return undefined;
    refresh();
    navigator.mediaDevices.addEventListener('devicechange', refresh);
    return () => navigator.mediaDevices.removeEventListener('devicechange', refresh);
  }, [live, supported, refresh]);

  const known = !m.deviceId || mics.devices.some((d) => d.deviceId === m.deviceId);
  const mic = (patch) => sub('mic', patch);

  return (
    <>
      <Check label={t('settings.microphone')} checked={s.video.microphone} onChange={(v) => sub('video', { microphone: v })} />
      <Field label={t('settings.micDevice')}>
        <div className="inline">
          <select
            value={m.deviceId}
            style={{ width: 320 }}
            disabled={!supported}
            onChange={(e) => {
              const d = mics.devices.find((x) => x.deviceId === e.target.value);
              mic({ deviceId: e.target.value, label: d ? d.label : '' });
            }}
          >
            <option value="">{mics.defaultLabel ? t('settings.micDefaultNamed', { name: mics.defaultLabel }) : t('settings.micDefault')}</option>
            {!known ? <option value={m.deviceId}>{t('settings.micMissing', { name: m.label || m.deviceId.slice(0, 8) })}</option> : null}
            {mics.devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || t('settings.micUnnamed', { n: i + 1 })}</option>)}
          </select>
          <button className="btn small" type="button" title={t('settings.micRefresh')} aria-label={t('settings.micRefresh')} disabled={!supported} onClick={refresh}><Icon name="refresh" /></button>
        </div>
      </Field>
      <GainField label={t('settings.micGain')} hint={t('settings.micGainHint')} value={m.gain} onChange={(v) => mic({ gain: v })} t={t} />
      <Check label={t('settings.micEcho')} checked={m.echoCancellation} onChange={(v) => mic({ echoCancellation: v })} /><br />
      <Check label={t('settings.micNoise')} checked={m.noiseSuppression} onChange={(v) => mic({ noiseSuppression: v })} /><br />
      <Check label={t('settings.micAgc')} checked={m.autoGainControl} onChange={(v) => mic({ autoGainControl: v })} />
      <LevelTest label={t('settings.micTest')} hint={t('settings.micTestHint')} icon="mic" meter={meter} disabled={!supported} t={t} />
    </>
  );
}

/** System sound: whether it is recorded, its volume, and a meter of what would be recorded. */
function SystemAudioSettings({ s, sub, t }) {
  const v = s.video;
  const supported = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
  const meter = useLevelMeter(systemAudioStream, v.systemAudioGain, []);
  return (
    <>
      <Check label={t('settings.systemAudio')} checked={v.systemAudio} onChange={(x) => sub('video', { systemAudio: x })} />
      <GainField label={t('settings.systemAudioGain')} hint={t('settings.systemAudioGainHint')} value={v.systemAudioGain} onChange={(x) => sub('video', { systemAudioGain: x })} t={t} />
      <LevelTest label={t('settings.systemAudioTest')} hint={t('settings.systemAudioTestHint')} icon="volume" meter={meter} disabled={!supported} t={t} />
    </>
  );
}

function GainField({ label, hint, value, onChange, t }) {
  return (
    <Field label={label} hint={hint}>
      <div className="inline">
        <input type="range" min={AUDIO_GAIN.min} max={AUDIO_GAIN.max} step={5} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: 200 }} aria-label={label} />
        <NumberInput min={AUDIO_GAIN.min} max={AUDIO_GAIN.max} value={value} onChange={onChange} ariaLabel={label} unit="%" />
        <button className="btn small" type="button" disabled={value === 100} onClick={() => onChange(100)}>{t('settings.gainReset')}</button>
      </div>
    </Field>
  );
}

function LevelTest({ label, hint, icon, meter, disabled, t }) {
  return (
    <Field label={label} hint={meter.error ? t('settings.audioTestFailed', { msg: meter.error }) : hint}>
      <div className="inline">
        <button className={`btn small${meter.testing ? ' primary' : ''}`} type="button" disabled={disabled} onClick={meter.toggle} style={{ minWidth: 96 }}>
          <Icon name={meter.testing ? 'stop' : icon} />{meter.testing ? t('settings.audioTestStop') : t('settings.audioTestStart')}
        </button>
        <div className={`mic-meter${meter.testing ? ' on' : ''}`} aria-hidden="true">
          <div className="mic-meter-fill" ref={meter.fillRef} />
          <div className="mic-meter-peak" ref={meter.peakRef} />
        </div>
      </div>
    </Field>
  );
}

/**
 * A level meter over `open()`'s stream, with `gainPct` applied the way the
 * recording applies it. The stream is reopened when `reopenOn` changes; the
 * gain is a node of our own and follows without reopening.
 */
function useLevelMeter(open, gainPct, reopenOn) {
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const fillRef = useRef(null);
  const peakRef = useRef(null);
  const gainRef = useRef(null);
  const gainPctRef = useRef(gainPct);
  gainPctRef.current = gainPct;

  useEffect(() => {
    if (!testing) return undefined;
    let alive = true;
    let stream = null;
    let ctx = null;
    let raf = 0;
    setError('');
    (async () => {
      try {
        stream = await open();
        if (!alive) { stream.getTracks().forEach((x) => x.stop()); return; }
        ctx = new AudioContext();
        if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
        const gain = ctx.createGain();
        gain.gain.value = gainPctRef.current / 100;
        gainRef.current = gain;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(gain).connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        let hold = 0;
        let holdAt = 0;
        const tick = () => {
          analyser.getFloatTimeDomainData(buf);
          let peak = 0;
          let sum = 0;
          for (const v of buf) { const a = Math.abs(v); if (a > peak) peak = a; sum += v * v; }
          const rms = Math.sqrt(sum / buf.length);
          // -60 dB … 0 dB across the bar.
          const pos = (x) => Math.max(0, Math.min(1, (20 * Math.log10(Math.max(x, 1e-6)) + 60) / 60));
          const now = performance.now();
          if (pos(peak) >= hold || now - holdAt > 1200) { hold = pos(peak); holdAt = now; }
          if (fillRef.current) {
            fillRef.current.style.width = `${pos(rms) * 100}%`;
            fillRef.current.classList.toggle('clip', peak >= 0.99);
          }
          if (peakRef.current) peakRef.current.style.left = `${hold * 100}%`;
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch (err) {
        if (alive) { setError(String((err && err.message) || err)); setTesting(false); }
      }
    })();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      gainRef.current = null;
      if (stream) stream.getTracks().forEach((x) => x.stop());
      if (ctx) ctx.close().catch(() => {});
      if (fillRef.current) fillRef.current.style.width = '0%';
      if (peakRef.current) peakRef.current.style.left = '0%';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testing, ...reopenOn]);
  useEffect(() => { if (gainRef.current) gainRef.current.gain.value = gainPct / 100; }, [gainPct]);

  return { testing, error, fillRef, peakRef, toggle: () => setTesting((x) => !x) };
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
