import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  IconSettings, IconInfo, IconAlert, IconDownload, IconSave, IconPrint, IconUrl,
  IconNote, IconKeyboard, IconCheck, IconCopy, IconTrash, IconImage, IconUndo,
  IconClose, IconFlag, IconPrev, IconNext, IconBook,
} from './Icons.jsx';
import { THEMES, themeGroups } from '../lib/themes.js';
import { LANGUAGES, translate } from '../i18n.js';
import { getSystemFonts } from '../lib/fonts.js';
import { FONT_SIZE_MAX, FONT_SIZE_MIN, stepFontSize } from '../lib/settings.js';
import {
  READING_WIDTHS, errorReport, pagesForScope, clampPreviewIndex,
  viewLayoutOf, viewLayoutSettings, textColumnsOf, columnChoice,
  fontPixels, fontScaleOf, FONT_SCALE_MIN, FONT_SCALE_MAX, READ_FONT_PX,
} from '../lib/view.js';
import {
  PAPER_SIZES, paperSizeMm, MARGIN_SIDES, MARGIN_MIN, MARGIN_MAX, MARGIN_DEFAULT,
  marginsOf, marginsAreEven,
} from '../lib/print.js';
import { shortcutRows } from '../lib/menus.js';
import { formatBytes } from '../lib/platform.js';

// Every dialog body, in one module.
//
// The same components are used twice: in the desktop app each dialog renders
// inside its own window (DialogHost), and on the web the same body renders in an
// in-page modal. A body never closes itself or writes settings directly — it
// reports what happened through `onResult({ action, ... })` and the application
// decides, which is what makes the two hosts interchangeable.

const ICONS = {
  settings: IconSettings,
  about: IconInfo,
  error: IconAlert,
  progress: IconDownload,
  unsaved: IconSave,
  confirm: IconAlert,
  print: IconPrint,
  prompt: IconUrl,
  note: IconNote,
  properties: IconBook,
  shortcuts: IconKeyboard,
};

/** Dialogs whose window keeps one size however their content changes. */
export const FIXED_SIZE_DIALOGS = new Set(['settings', 'print', 'properties', 'shortcuts']);

/** Results that are a live edit rather than a final answer, so the popup stays. */
const KEEP_OPEN = new Set([
  'settings', 'reset', 'clearRecent', 'removeRecent', 'clearDirs',
  'pickBackground', 'clearBackground', 'preview', 'progress', 'shortcuts',
]);

export function dialogIcon(name) {
  return ICONS[name] || IconInfo;
}

export function dialogTitle(name, t, payload) {
  if (name === 'confirm') return payload?.title || t('common.confirm');
  if (name === 'progress' && payload?.progress?.kind) return t(`progress.${payload.progress.kind}`, payload.progress.kind);
  if (name === 'prompt') return payload?.prompt?.kind === 'password' ? t('password.title') : t('url.title');
  return t(`${name}.title`, name);
}

export function keepsWindowOpen(action) {
  return KEEP_OPEN.has(action);
}

function Check({ label, value, onChange, title }) {
  return (
    <label className="check" title={title || label}>
      <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/**
 * A number, set the way the toolbar sets the reading size: less, the number
 * itself — which puts it back to what it was to begin with — and more, on one
 * row. A slider cannot say what it is set to without a label, cannot be nudged
 * by one step without a steady hand, and has no way back to the default.
 */
function Stepper({ label, value, onChange, min, max, step = 1, standard, format, title, inline = false }) {
  const clamp = (n) => Math.min(max, Math.max(min, Math.round(n * 1000) / 1000));
  const show = format ? format(value) : String(value);
  return (
    <div className={`field stepper-field${inline ? ' inline' : ''}`}>
      <span className="field-label">{label}</span>
      <div className="stepper" role="group" aria-label={label}>
        <button
          type="button"
          className="btn stepper-btn"
          disabled={value <= min}
          onClick={() => onChange(clamp(value - step))}
          title={`${label} −`}
          aria-label={`${label} −`}
        >−</button>
        <button
          type="button"
          className="btn stepper-value"
          onClick={() => onChange(clamp(standard))}
          title={title || `${label}: ${show}`}
          aria-label={`${label}: ${show}`}
        >{show}</button>
        <button
          type="button"
          className="btn stepper-btn"
          disabled={value >= max}
          onClick={() => onChange(clamp(value + step))}
          title={`${label} +`}
          aria-label={`${label} +`}
        >+</button>
      </div>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="field" title={label}>
      <span className="field-label">{label}{hint ? <em className="hint"> · {hint}</em> : null}</span>
      {children}
    </label>
  );
}

// ── Settings ──────────────────────────────────────────────
// Three tabs, not four. 'window' held the status bar and the toolbar labels
// — both of which the View tab already offered, so the same two tick boxes
// appeared twice and could disagree about which tab you had last used.
// What was only there, the storage path and the shortcut list, moved across.
const SETTINGS_TABS = ['appearance', 'reading', 'view'];

function SettingsBody({ t, payload, onResult }) {
  const [tab, setTab] = useState('appearance');
  const [fonts, setFonts] = useState([]);
  const settings = payload.settings;

  useEffect(() => { getSystemFonts().then(setFonts).catch(() => setFonts([])); }, []);

  const set = (patch) => onResult({ action: 'settings', settings: { ...settings, ...patch } });

  const previewStyle = useMemo(() => ({
    fontFamily: settings.fontFamily ? `'${settings.fontFamily}'` : undefined,
    fontSize: `${settings.fontSize}px`,
    fontWeight: settings.fontWeight,
    fontStyle: settings.fontStyle,
    textDecoration: settings.fontUnderline ? 'underline' : 'none',
  }), [settings]);

  return (
    <>
      <div className="tabs" role="tablist">
        {SETTINGS_TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`tab${tab === id ? ' active' : ''}`}
            onClick={() => setTab(id)}
            title={t(`settings.tabs.${id}`)}
          >
            {t(`settings.tabs.${id}`)}
          </button>
        ))}
      </div>

      {/* Every tab stays in the layout so the window never changes size. */}
      <div className="settings-pane">
        <div className={`settings-panel${tab === 'appearance' ? ' on' : ''}`} aria-hidden={tab !== 'appearance'}>
          <div className="settings-split">
            <section className="sgroup">
              <h4>{t('settings.theme')}</h4>
              {themeGroups(THEMES).map((group) => (
                <div className="theme-family" key={group.kind}>
                  <h5 className="theme-family-name">
                    {t(`settings.themeFamily.${group.kind}`)}
                    <span className="theme-family-count">{group.themes.length}</span>
                  </h5>
                  <div className="theme-grid">
                    {group.themes.map((theme) => (
                      <button
                        key={theme.id}
                        type="button"
                        className={`theme-chip${settings.theme === theme.id ? ' active' : ''}`}
                        onClick={() => set({ theme: theme.id })}
                        title={theme.id}
                      >
                        <span className="theme-swatch">
                          {theme.bars.map((color, i) => <i key={i} style={{ background: color }} />)}
                        </span>
                        <span className="theme-name">{theme.id}</span>
                        {settings.theme === theme.id ? <IconCheck size={13} /> : null}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            <div className="settings-side">
              <section className="sgroup">
                <h4>{t('settings.language')}</h4>
                <div className="row seg-row seg-fill">
                  {LANGUAGES.map((lng) => (
                    <button
                      key={lng.id}
                      type="button"
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
                <Field label={t('settings.fontFamily')} hint={fonts.length ? t('settings.systemFonts', { n: fonts.length }) : ''}>
                  <select className="input" value={settings.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })}>
                    <option value="">{t('settings.defaultFont')}</option>
                    {fonts.map((font) => <option key={font} value={font}>{font}</option>)}
                  </select>
                </Field>

                <div className="field inline">
                  <span className="field-label">{t('settings.fontSize')}</span>
                  <div className="stepper" role="group" aria-label={t('settings.fontSize')}>
                    <button
                      type="button"
                      className="btn stepper-btn"
                      disabled={settings.fontSize <= FONT_SIZE_MIN}
                      onClick={() => set({ fontSize: stepFontSize(settings.fontSize, -1) })}
                      title={t('settings.fontSmaller')}
                    >−</button>
                    <span className="stepper-value">{settings.fontSize}px</span>
                    <button
                      type="button"
                      className="btn stepper-btn"
                      disabled={settings.fontSize >= FONT_SIZE_MAX}
                      onClick={() => set({ fontSize: stepFontSize(settings.fontSize, 1) })}
                      title={t('settings.fontLarger')}
                    >+</button>
                  </div>
                </div>

                <div className="row seg-row">
                  <span className="field-label">{t('settings.fontStyle')}</span>
                  <button
                    type="button"
                    className={`btn seg${settings.fontWeight === 'bold' ? ' active' : ''}`}
                    style={{ fontWeight: 700 }}
                    onClick={() => set({ fontWeight: settings.fontWeight === 'bold' ? 'normal' : 'bold' })}
                    title={t('settings.bold')}
                  >B</button>
                  <button
                    type="button"
                    className={`btn seg${settings.fontStyle === 'italic' ? ' active' : ''}`}
                    style={{ fontStyle: 'italic' }}
                    onClick={() => set({ fontStyle: settings.fontStyle === 'italic' ? 'normal' : 'italic' })}
                    title={t('settings.italic')}
                  >I</button>
                  <button
                    type="button"
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

        <div className={`settings-panel${tab === 'reading' ? ' on' : ''}`} aria-hidden={tab !== 'reading'}>
          <div className="settings-split">
            <section className="sgroup">
              <h4>{t('panel.reading')}</h4>
              <Field label={t('reading.font')}>
                <select className="input" value={settings.readerFont} onChange={(e) => set({ readerFont: e.target.value })}>
                  <option value="">{t('reading.defaultFont')}</option>
                  {fonts.map((font) => <option key={font} value={font}>{font}</option>)}
                </select>
              </Field>
              <Stepper
                inline
                label={t('reading.size')}
                value={fontPixels(settings.fontScale)}
                onChange={(n) => set({ fontScale: fontScaleOf(n) })}
                min={fontPixels(FONT_SCALE_MIN)}
                max={fontPixels(FONT_SCALE_MAX)}
                step={1}
                standard={READ_FONT_PX}
                format={(n) => `${n}px`}
              />
              <Stepper
                label={t('reading.lineHeight')}
                value={Math.round(settings.lineHeight * 100)}
                onChange={(n) => set({ lineHeight: n / 100 })}
                min={110}
                max={260}
                step={5}
                standard={170}
                format={(n) => (n / 100).toFixed(2)}
              />
              <Field label={t('reading.width')}>
                <select className="input" value={String(settings.readingWidth)} onChange={(e) => set({ readingWidth: Number(e.target.value) })}>
                  {READING_WIDTHS.map((w) => (
                    <option key={w} value={String(w)}>{w === 0 ? t('reading.widthFull') : `${w}px`}</option>
                  ))}
                </select>
              </Field>
            </section>

            <section className="sgroup">
              <h4>{t('reading.mode')}</h4>
              {/* One choice for every format. The three cannot be combined. */}
              <Field label={t('reading.layout')}>
                <div className="row seg-row seg-fill">
                  {['single', 'double', 'continuous'].map((layout) => (
                    <button
                      key={layout}
                      type="button"
                      className={`btn seg${viewLayoutOf(settings) === layout ? ' active' : ''}`}
                      aria-pressed={viewLayoutOf(settings) === layout}
                      onClick={() => set(viewLayoutSettings(layout))}
                      title={t(`cmd.view${layout[0].toUpperCase()}${layout.slice(1)}`)}
                    >{t(`cmd.view${layout[0].toUpperCase()}${layout.slice(1)}`)}</button>
                  ))}
                </div>
              </Field>
              {/* Columns of text on one page. Two facing pages are not a 다단 split. */}
              <Field label={t('reading.columns')}>
                <div className="row seg-row seg-fill">
                  {[1, 2].map((count) => {
                    const layout = viewLayoutOf(settings);
                    const onePage = layout === 'single';
                    return (
                      <button
                        key={count}
                        type="button"
                        className={`btn seg${onePage && textColumnsOf(settings) === count ? ' active' : ''}`}
                        aria-pressed={onePage && textColumnsOf(settings) === count}
                        disabled={!onePage}
                        onClick={() => set(columnChoice(settings, null, count))}
                        title={layout === 'double' ? t('tip.columnsFacing') : onePage ? t(`cmd.columns${count}`) : t('tip.columnsFlow')}
                      >{t(`cmd.columns${count}`)}</button>
                    );
                  })}
                </div>
              </Field>
              {/* A turn effect needs a page that goes away. A continuous run
                  scrolls, so there is nothing to turn. */}
              <Field label={t('reading.turn')} hint={viewLayoutOf(settings) === 'continuous'
                ? t('reading.turnNeedsPages')
                : ''}
              >
                <div className="row seg-row seg-fill">
                  {['none', 'slide', 'flip'].map((effect) => (
                    <button
                      key={effect}
                      type="button"
                      className={`btn seg${settings.pageTurn === effect ? ' active' : ''}`}
                      onClick={() => set({ pageTurn: effect })}
                      disabled={viewLayoutOf(settings) === 'continuous'}
                      title={t(`reading.turn${effect[0].toUpperCase()}${effect.slice(1)}`)}
                    >
                      {t(`reading.turn${effect[0].toUpperCase()}${effect.slice(1)}`)}
                    </button>
                  ))}
                </div>
              </Field>
              <Check label={t('reading.justify')} value={settings.justify} onChange={(v) => set({ justify: v })} />
              <Check label={t('reading.indent')} value={settings.paragraphIndent} onChange={(v) => set({ paragraphIndent: v })} />
              <Check label={t('settings.rememberPosition')} value={settings.rememberPosition} onChange={(v) => set({ rememberPosition: v })} />
              <Check label={t('settings.autoSaveLibrary')} value={settings.autoSaveLibrary} onChange={(v) => set({ autoSaveLibrary: v })} />
            </section>
          </div>
        </div>

        <div className={`settings-panel${tab === 'view' ? ' on' : ''}`} aria-hidden={tab !== 'view'}>
          <div className="settings-split">
            <section className="sgroup">
              <h4>{t('settings.tabs.view')}</h4>
              <Check label={t('settings.showStatusBar')} value={settings.showStatusBar} onChange={(v) => set({ showStatusBar: v })} />
              <Check label={t('settings.toolbarLabels')} value={settings.showToolbarLabels} onChange={(v) => set({ showToolbarLabels: v })} />
              <Check label={t('settings.invertPages')} value={settings.invertPages} onChange={(v) => set({ invertPages: v })} />
              <Check label={t('settings.confirmOnExit')} value={settings.confirmOnExit} onChange={(v) => set({ confirmOnExit: v })} />

              <h4>{t('settings.pageMargin')}</h4>
              <Stepper
                label={t('settings.pageMarginX')}
                value={settings.pageMarginX}
                onChange={(n) => set({ pageMarginX: n })}
                min={0}
                max={80}
                step={2}
                standard={18}
                format={(n) => `${n}px`}
              />
              <Stepper
                label={t('settings.pageMarginY')}
                value={settings.pageMarginY}
                onChange={(n) => set({ pageMarginY: n })}
                min={0}
                max={80}
                step={2}
                standard={28}
                format={(n) => `${n}px`}
              />

              {payload.storagePath ? (
                <>
                  <h4>{t('settings.storage')}</h4>
                  <p className="mono-path" title={payload.storagePath}>{payload.storagePath}</p>
                </>
              ) : null}
              <div className="row">
                <button
                  type="button"
                  className="btn"
                  onClick={() => onResult({ action: 'shortcuts' })}
                  title={t('cmd.shortcuts')}
                >
                  <IconKeyboard size={15} />{t('cmd.shortcuts')}
                </button>
              </div>
            </section>

            <section className="sgroup">
              <h4>{t('settings.background')}</h4>
              <div className="row">
                <button type="button" className="btn" onClick={() => onResult({ action: 'pickBackground' })} title={t('settings.backgroundPick')}>
                  <IconImage size={15} />{t('settings.backgroundPick')}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={!settings.backgroundImage}
                  onClick={() => onResult({ action: 'clearBackground' })}
                  title={t('settings.backgroundClear')}
                >
                  <IconTrash size={15} />{t('settings.backgroundClear')}
                </button>
              </div>
              <Stepper
                label={t('settings.backgroundOpacity')}
                value={settings.backgroundOpacity}
                onChange={(n) => set({ backgroundOpacity: n })}
                min={0}
                max={100}
                step={5}
                standard={25}
                format={(n) => `${n}%`}
              />
              <Field label={t('settings.backgroundFit')}>
                <div className="row seg-row seg-fill">
                  {['cover', 'contain', 'tile', 'center'].map((fit) => (
                    <button
                      key={fit}
                      type="button"
                      className={`btn seg${settings.backgroundFit === fit ? ' active' : ''}`}
                      onClick={() => set({ backgroundFit: fit })}
                      title={t(`settings.fit${fit[0].toUpperCase()}${fit.slice(1)}`)}
                    >
                      {t(`settings.fit${fit[0].toUpperCase()}${fit.slice(1)}`)}
                    </button>
                  ))}
                </div>
              </Field>
              {settings.backgroundImage ? (
                <div className="bg-preview" style={{ backgroundImage: `url("${settings.backgroundImage}")`, opacity: settings.backgroundOpacity / 100 }} />
              ) : null}
            </section>
          </div>
        </div>

      </div>

      {/* The window's own buttons, not any one tab's: putting everything back
          the way it came applies to the whole of the settings, and there has to
          be a plain way to say "done" besides closing the window. */}
      <div className="dialog-foot">
        <button
          type="button"
          className="btn danger-ghost"
          onClick={() => onResult({ action: 'reset' })}
          title={t('settings.resetAllTip')}
        >
          <IconUndo size={15} />{t('settings.resetAll')}
        </button>
        <span className="spacer" />
        <button
          type="button"
          className="btn primary"
          onClick={() => onResult({ action: 'close' })}
          title={t('common.ok')}
          data-autofocus
        >
          {t('common.ok')}
        </button>
      </div>
    </>
  );
}

// ── About ─────────────────────────────────────────────────
function AboutBody({ t, payload, onResult }) {
  const [copied, setCopied] = useState(false);
  const info = payload.info || {};
  const build = payload.build || {};

  const rows = [
    [t('about.version'), build.version || info.version || '1.0.0'],
    [t('about.built'), build.buildTime ? new Date(build.buildTime).toLocaleString() : '—'],
    [t('about.commit'), build.gitCommit || '—'],
    [t('about.branch'), build.gitBranch || '—'],
    [t('about.platform'), info.platform ? `${info.platform} ${info.arch || ''}`.trim() : t('about.web')],
    [t('about.runtime'), info.electron
      ? `Electron ${info.electron} · Chromium ${info.chrome} · Node ${info.node}`
      : `Chromium ${info.chrome || '—'}`],
    [t('about.docType'), '.ebkr — MyEBookReader Reading File'],
    [t('about.formats'), 'EPUB · PDF · MOBI/AZW · FB2 · CBZ · Markdown · HTML · TXT'],
    [t('about.license'), build.license || 'MIT'],
    [t('about.author'), 'SHKWON(knix008@naver.com)'],
  ];

  const copy = () => {
    onResult({ action: 'copyText', text: ['MyEBookReader', ...rows.map(([k, v]) => `${k}: ${v}`)].join('\n') });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div className="about-hero">
        <img className="about-logo" src="./icon.svg" alt="" width="72" height="72" />
        <div>
          <h3 className="about-name">MyEBookReader</h3>
          <p className="about-desc">{t('about.desc')}</p>
        </div>
      </div>

      <table className="kv about-kv">
        <tbody>
          {rows.map(([key, value]) => (
            <tr key={key}>
              <th>{key}</th>
              <td>
                {key === t('about.author') ? (
                  <button
                    type="button"
                    className="linkish"
                    onClick={() => onResult({ action: 'openExternal', url: 'mailto:knix008@naver.com' })}
                    title="SHKWON(knix008@naver.com)"
                  >
                    SHKWON(knix008@naver.com)
                  </button>
                ) : String(value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="dialog-foot">
        <button type="button" className="btn" onClick={copy} title={t('about.copy')}>
          {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
          {t('about.copy')}
        </button>
        <div className="spacer" />
        <button type="button" className="btn primary" onClick={() => onResult({ action: 'close' })} data-autofocus>
          {t('about.close')}
        </button>
      </div>
    </>
  );
}

// ── Error ─────────────────────────────────────────────────
function ErrorBody({ t, payload, onResult }) {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const error = payload.error || {};
  const contextLabel = error.context ? t(`error.ctx.${error.context}`, error.context) : '';

  const report = errorReport({ ...error, context: contextLabel }, {
    title: t('error.title'),
    what: t('error.what'),
    message: t('error.message'),
    details: t('error.details'),
  });

  const copy = () => {
    onResult({ action: 'copyText', text: report });
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <>
      <div className="err-body">
        {contextLabel ? <p className="err-context">{t('error.what')} <strong>{contextLabel}</strong></p> : null}
        <p className="err-message">{error.message}</p>
        {error.file ? <p className="err-file" title={error.file}>{error.file}</p> : null}
        {error.details ? (
          <>
            <button type="button" className="linkish" onClick={() => setShowDetails((v) => !v)}>
              {showDetails ? t('error.hideDetails') : t('error.showDetails')}
            </button>
            {showDetails ? <pre className="err-details">{error.details}</pre> : null}
          </>
        ) : null}
        {/* Always selectable, so the text can be copied by hand where the
            clipboard API is unavailable. */}
        <textarea className="err-fallback" readOnly value={report} aria-label={t('error.details')} />
      </div>

      <div className="dialog-foot">
        <button type="button" className="btn" onClick={copy} title={t('error.copy')}>
          {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
          {copied ? t('error.copied') : t('error.copy')}
        </button>
        <div className="spacer" />
        <button type="button" className="btn primary" onClick={() => onResult({ action: 'close' })} data-autofocus>
          {t('error.close')}
        </button>
      </div>
    </>
  );
}

// ── Progress ──────────────────────────────────────────────
function ProgressBody({ t, payload }) {
  const task = payload.progress || {};
  const { name, done = 0, total = 0, indeterminate } = task;
  const unknown = indeterminate || total <= 0;
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  return (
    <div className="progress-body">
      {name ? <p className="prog-name" title={name}>{name}</p> : null}
      <div className={`progbar${unknown ? ' indeterminate' : ''}`}>
        <div className="progbar-fill" style={unknown ? undefined : { width: `${percent}%` }} />
      </div>
      <div className="prog-meta">
        <span>{unknown ? '' : `${percent}%`}</span>
        <span>{total > 0 ? t('progress.ofBytes', { done: formatBytes(done), total: formatBytes(total) }) : formatBytes(done)}</span>
      </div>
    </div>
  );
}

// ── Unsaved changes ───────────────────────────────────────
function UnsavedBody({ t, onResult }) {
  return (
    <>
      <p className="unsaved-message">{t('unsaved.message')}</p>
      <div className="dialog-foot">
        <button type="button" className="btn" onClick={() => onResult({ action: 'discard' })}>{t('unsaved.discard')}</button>
        <div className="spacer" />
        <button type="button" className="btn" onClick={() => onResult({ action: 'cancel' })}>{t('common.cancel')}</button>
        <button type="button" className="btn primary" onClick={() => onResult({ action: 'save' })} data-autofocus>
          {t('common.save')}
        </button>
      </div>
    </>
  );
}

// ── Confirm (a plain yes or no) ───────────────────────────
// The message is passed in already translated, because what is being confirmed
// belongs to the caller, not to this dialog.
function ConfirmBody({ t, payload, onResult }) {
  return (
    <>
      <p className="unsaved-message">{payload.message || ''}</p>
      <div className="dialog-foot">
        <div className="spacer" />
        <button type="button" className="btn" onClick={() => onResult({ action: 'cancel' })}>{t('common.cancel')}</button>
        <button
          type="button"
          className={`btn ${payload.danger ? 'danger-ghost' : 'primary'}`}
          onClick={() => onResult({ action: 'confirm' })}
          data-autofocus
        >
          {payload.confirmLabel || t('common.ok')}
        </button>
      </div>
    </>
  );
}

// ── Prompt (URL / password) ───────────────────────────────
function PromptBody({ t, payload, onResult }) {
  const prompt = payload.prompt || {};
  const isUrl = prompt.kind !== 'password';
  const [value, setValue] = useState('');
  const [localError, setLocalError] = useState('');

  const submit = () => {
    const clean = value.trim();
    if (isUrl && !/^https?:\/\//i.test(clean)) { setLocalError(t('url.invalid')); return; }
    if (!clean) return;
    onResult({ action: 'submit', value: clean, kind: prompt.kind || 'url' });
  };

  return (
    <>
      <Field label={isUrl ? t('url.label') : t('password.label')}>
        <input
          data-autofocus
          className="input"
          type={isUrl ? 'url' : 'password'}
          value={value}
          placeholder={isUrl ? t('url.placeholder') : ''}
          onChange={(e) => { setValue(e.target.value); setLocalError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        />
      </Field>
      {(localError || prompt.error) ? <p className="field-error">{localError || prompt.error}</p> : null}
      <div className="dialog-foot">
        <div className="spacer" />
        <button type="button" className="btn" onClick={() => onResult({ action: 'close' })}>{t('common.cancel')}</button>
        <button type="button" className="btn primary" onClick={submit}>{isUrl ? t('url.open') : t('password.ok')}</button>
      </div>
    </>
  );
}

// ── Note ──────────────────────────────────────────────────
function NoteBody({ t, payload, onResult }) {
  const note = payload.note || {};
  const [value, setValue] = useState(note.text || '');

  return (
    <>
      {note.selection ? <p className="note-quote">“{String(note.selection).slice(0, 220)}”</p> : null}
      <Field label={t('note.label')}>
        <textarea
          data-autofocus
          className="input"
          rows={4}
          value={value}
          placeholder={t('note.placeholder')}
          onChange={(e) => setValue(e.target.value)}
        />
      </Field>
      <div className="dialog-foot">
        <div className="spacer" />
        <button type="button" className="btn" onClick={() => onResult({ action: 'close' })}>{t('common.cancel')}</button>
        <button
          type="button"
          className="btn primary"
          onClick={() => onResult({ action: 'submit', value: value.trim() })}
          disabled={!value.trim()}
        >
          {t('note.ok')}
        </button>
      </div>
    </>
  );
}

// ── Properties ────────────────────────────────────────────
function PropertiesBody({ t, payload, onResult }) {
  const book = payload.bookInfo || {};
  const meta = book.meta || {};
  const rows = [
    [t('props.title'), meta.title],
    [t('props.author'), meta.author],
    [t('props.publisher'), meta.publisher],
    [t('props.date'), meta.date],
    [t('props.language'), meta.language],
    [t('props.subject'), meta.subject],
    [t('props.identifier'), meta.identifier],
    [t('props.creator'), meta.creator],
    [t('props.version'), meta.version],
    [t('props.format'), book.formatLabel],
    [book.reflowable ? t('props.sections') : t('props.pages'), book.sectionCount],
    [t('props.file'), book.fileName],
    [t('props.path'), book.filePath],
    [t('props.fileSize'), book.fileSize ? formatBytes(book.fileSize) : ''],
    [t('props.library'), book.libraryPath || t('props.notSaved')],
  ].filter(([, value]) => value !== undefined && value !== null && value !== '');

  return (
    <>
      <table className="kv">
        <tbody>
          {rows.map(([key, value]) => (
            <tr key={key}><th>{key}</th><td title={String(value)}>{String(value)}</td></tr>
          ))}
        </tbody>
      </table>
      {meta.description ? <p className="prop-text">{String(meta.description).slice(0, 800)}</p> : null}
      <div className="dialog-foot">
        <div className="spacer" />
        <button type="button" className="btn primary" onClick={() => onResult({ action: 'close' })} data-autofocus>
          {t('common.ok')}
        </button>
      </div>
    </>
  );
}

// ── Shortcuts ─────────────────────────────────────────────
function ShortcutsBody({ t, onResult }) {
  return (
    <>
      <table className="kv shortcuts">
        <thead><tr><th>{t('shortcuts.action')}</th><th>{t('shortcuts.key')}</th></tr></thead>
        <tbody>
          {shortcutRows().map((row) => (
            <tr key={row.id}><td>{t(row.label)}</td><td><code>{row.key}</code></td></tr>
          ))}
        </tbody>
      </table>
      <div className="dialog-foot">
        <div className="spacer" />
        <button type="button" className="btn primary" onClick={() => onResult({ action: 'close' })} data-autofocus>
          {t('shortcuts.close')}
        </button>
      </div>
    </>
  );
}

// ── Print ─────────────────────────────────────────────────
function PrintBody({ t, payload, onResult }) {
  const print = payload.print || {};
  const count = print.count || 1;
  const current = print.current || 1;
  const [scope, setScope] = useState(print.scope || 'all');
  const [custom, setCustom] = useState(String(current));
  const [paper, setPaper] = useState(print.paper || 'A4');
  const [landscape, setLandscape] = useState(!!print.landscape);
  // One margin per side. A reader binding a printout wants a wider left edge
  // than right, and a narrower head than foot — one number for all four could
  // not say that. `even` keeps them locked together, which is what most
  // printing wants and what the dialog opens on.
  const [margins, setMargins] = useState(() => marginsOf(print));
  const [even, setEven] = useState(() => marginsAreEven(marginsOf(print)));
  const setSide = (side, mm) => setMargins((m) => (even
    ? { top: mm, right: mm, bottom: mm, left: mm }
    : { ...m, [side]: mm }));
  const [titles, setTitles] = useState(print.showTitles !== false);
  const [index, setIndex] = useState(0);

  const selection = useMemo(
    () => pagesForScope({ scope, custom, current, count }),
    [scope, custom, current, count]
  );
  const pages = selection.pages;
  const invalid = scope === 'custom' && !!selection.error;
  const safeIndex = clampPreviewIndex(index, pages.length);

  // The contents of the page are rendered by the application, not here, and
  // only the page number changes what comes back. Paper, orientation, margins
  // and titles change the sheet the page is laid on, and that is drawn here —
  // so they show at once instead of waiting on a round trip that would hand
  // back the very same picture.
  useEffect(() => {
    if (invalid || !pages.length) return;
    onResult({ action: 'preview', page: pages[safeIndex], paper, landscape, margins, showTitles: titles });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages[safeIndex], invalid]);

  // The sheet, to scale: the paper's own proportions, turned for landscape,
  // with the margins as a share of it.
  const [paperW, paperH] = paperSizeMm(paper, landscape);
  // Each side as its own share of the paper, so the preview shows a wider
  // binding edge as a wider binding edge rather than averaging the four.
  const share = (mm, of) => `${Math.min(45, (mm / of) * 100)}%`;
  const sheetStyle = {
    aspectRatio: `${paperW} / ${paperH}`,
    '--print-margin-top': share(margins.top, paperH),
    '--print-margin-right': share(margins.right, paperW),
    '--print-margin-bottom': share(margins.bottom, paperH),
    '--print-margin-left': share(margins.left, paperW),
  };

  const setup = { paper, landscape, margins, showTitles: titles };

  return (
    <div className="print-layout">
      <div className="print-options">
        <div className="print-scopes" role="radiogroup" aria-label={t('print.range')}>
          {[
            { id: 'all', label: t('print.all'), hint: t('print.allHint', { n: count }) },
            { id: 'current', label: t('print.current'), hint: t('print.currentHint', { n: current }) },
            { id: 'custom', label: t('print.custom'), hint: t('print.customHint') },
          ].map((option) => (
            <label key={option.id} className={`print-scope${scope === option.id ? ' active' : ''}`}>
              <input type="radio" name="print-scope" checked={scope === option.id} onChange={() => setScope(option.id)} />
              <span className="print-scope-text">
                <span className="print-scope-label">{option.label}</span>
                <span className="print-scope-hint">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>

        {scope === 'custom' ? (
          <Field label={t('print.rangeLabel')}>
            <input
              className="input"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder={t('print.rangePlaceholder')}
            />
          </Field>
        ) : null}
        {invalid ? <p className="field-error">{t(selection.error, { max: count })}</p> : null}

        <h4>{t('print.setup')}</h4>
        <Field label={t('print.paper')}>
          <select className="input" value={paper} onChange={(e) => setPaper(e.target.value)}>
            {PAPER_SIZES.map((size) => <option key={size.id} value={size.id}>{size.label}</option>)}
          </select>
        </Field>
        <Field label={t('print.orientation')}>
          <div className="row seg-row seg-fill">
            <button type="button" className={`btn seg${!landscape ? ' active' : ''}`} onClick={() => setLandscape(false)}>
              {t('print.portrait')}
            </button>
            <button type="button" className={`btn seg${landscape ? ' active' : ''}`} onClick={() => setLandscape(true)}>
              {t('print.landscape')}
            </button>
          </div>
        </Field>
        <Check
          label={t('print.marginEven')}
          value={even}
          onChange={(on) => {
            setEven(on);
            if (on) setMargins((m) => ({ top: m.top, right: m.top, bottom: m.top, left: m.top }));
          }}
        />
        {even ? (
          <Stepper
            label={t('print.margin')}
            value={margins.top}
            onChange={(mm) => setSide('top', mm)}
            min={MARGIN_MIN}
            max={MARGIN_MAX}
            step={1}
            standard={MARGIN_DEFAULT}
            format={(n) => `${n}mm`}
          />
        ) : (
          <div className="print-margins" data-testid="print-margins">
            {MARGIN_SIDES.map((side) => (
              <Stepper
                key={side}
                inline
                label={t(`print.margin_${side}`)}
                value={margins[side]}
                onChange={(mm) => setSide(side, mm)}
                min={MARGIN_MIN}
                max={MARGIN_MAX}
                step={1}
                standard={MARGIN_DEFAULT}
                format={(n) => `${n}mm`}
              />
            ))}
          </div>
)}
        <Check label={t('print.titles')} value={titles} onChange={setTitles} />
        <p className="capture-note">{t('print.note')}</p>
      </div>

      <aside className="print-preview" aria-label={t('print.preview')}>
        <div className="print-preview-label">
          {t('print.preview')}
          <span className="print-preview-setup" data-testid="print-setup">
            {`${paper} · ${landscape ? t('print.landscape') : t('print.portrait')} · `
              + (even ? `${margins.top}mm` : MARGIN_SIDES.map((side) => `${margins[side]}`).join('/') + 'mm')}
          </span>
        </div>
        <div className={`print-preview-sheet${landscape ? ' landscape' : ''}`}>
          <div className="print-preview-paper" style={sheetStyle} data-paper={paper}>
            <div className="print-preview-margins">
              {titles && print.previewTitle ? (
                <div className="print-preview-title">{print.previewTitle}</div>
              ) : null}
              {print.previewImage ? (
                <img className="print-preview-image" src={print.previewImage} alt="" />
              ) : print.previewHtml ? (
                <div
                  className="print-preview-page"
                  // Preview of already-sanitized chapter HTML.
                  dangerouslySetInnerHTML={{ __html: print.previewHtml }}
                />
              ) : (
                <p className="print-preview-empty">{t('print.previewEmpty')}</p>
              )}
            </div>
          </div>
        </div>
        <div className="print-preview-nav">
          <button
            type="button"
            className="icon-btn"
            disabled={!pages.length || safeIndex <= 0}
            onClick={() => setIndex(clampPreviewIndex(safeIndex - 1, pages.length))}
            title={t('cmd.prevSection')}
          ><IconPrev size={16} /></button>
          <span className="print-preview-page-label">
            {pages.length ? t('print.previewOf', { index: safeIndex + 1, total: pages.length, n: pages[safeIndex] }) : '—'}
          </span>
          <button
            type="button"
            className="icon-btn"
            disabled={!pages.length || safeIndex >= pages.length - 1}
            onClick={() => setIndex(clampPreviewIndex(safeIndex + 1, pages.length))}
            title={t('cmd.nextSection')}
          ><IconNext size={16} /></button>
        </div>
      </aside>

      <div className="dialog-foot print-foot">
        <span className="print-count">{invalid ? '' : t('print.willPrint', { n: pages.length })}</span>
        <div className="spacer" />
        <button type="button" className="btn" onClick={() => onResult({ action: 'close' })}>{t('common.cancel')}</button>
        <button
          type="button"
          className="btn primary"
          disabled={invalid || !pages.length || print.busy}
          onClick={() => onResult({ action: 'print', pages, scope, ...setup })}
        >
          {print.busy ? t('print.working') : t('print.print')}
        </button>
      </div>
    </div>
  );
}

const BODIES = {
  settings: SettingsBody,
  about: AboutBody,
  error: ErrorBody,
  progress: ProgressBody,
  unsaved: UnsavedBody,
  confirm: ConfirmBody,
  prompt: PromptBody,
  note: NoteBody,
  properties: PropertiesBody,
  shortcuts: ShortcutsBody,
  print: PrintBody,
};

/**
 * One dialog's contents.
 * `payload.language` decides the language, so a popup window needs nothing from
 * the React context of the window that opened it.
 */
export function DialogBody({ name, payload, onResult }) {
  const Body = BODIES[name];
  const t = (key, args) => translate(payload?.language || 'ko', key, args);
  if (!Body) return null;
  return <Body t={t} payload={payload || {}} onResult={onResult} />;
}

/** The frame a dialog gets inside its own window: draggable bar, title, close. */
export function DialogFrame({ name, payload, onClose, children }) {
  const t = (key, args) => translate(payload?.language || 'ko', key, args);
  const Icon = dialogIcon(name);
  const ref = useRef(null);

  useEffect(() => {
    const target = ref.current?.querySelector('[data-autofocus]');
    const timer = setTimeout(() => target?.focus?.(), 40);
    return () => clearTimeout(timer);
  }, [name, payload]);

  return (
    <div className={`dialog dialog-${name}`} ref={ref}>
      <div className="dialog-head">
        <span className="dialog-head-icon"><Icon size={17} /></span>
        <h2 className="dialog-title">{dialogTitle(name, t, payload)}</h2>
        <button type="button" className="icon-btn dialog-x" onClick={onClose} title={t('common.close')} aria-label={t('common.close')}>
          <IconClose size={16} />
        </button>
      </div>
      <div className="dialog-content">{children}</div>
    </div>
  );
}

export { SETTINGS_TABS };
