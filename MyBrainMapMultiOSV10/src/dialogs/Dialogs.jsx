// Modal dialogs: the shell, confirm / error / about, a text prompt, the
// shortcut list, quick entry (many topics at once), the template gallery and
// the export choices. Every dialog closes with Escape; Enter triggers the
// primary button.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { hostName, writeClipboardText, isMac } from '../lib/backend';
import { Icon } from '../components/Icons';
import { IconSelect, scaleOptions, paddingOptions, paperOptions, orientOptions, tilesOptions, modeIcon } from '../components/IconSelect';
import { TEMPLATES, mapFromTemplate } from '../lib/templates';
import { SAMPLES, mapFromSample } from '../lib/samples';
import { mapPicture } from '../lib/exportimg';
import { topicsFromText } from '../lib/model';
import { EXPORTS } from '../lib/formats/index';

// Every dialog can be dragged by its title bar (kept inside the window). A
// non-modal one (modal={false}: settings, info, shortcuts) leaves the map
// usable underneath, while the others keep their dimmed, click-to-close backdrop.
export function Dialog({ title, icon, kind = '', width, onClose, children, footer, onEnter, className = '', modal = true, embedded = false, closable = true }) {
  useLanguage();
  const ref = useRef(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const onTitleDown = (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    e.preventDefault();
    const el = ref.current;
    const start = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    const r0 = el ? el.getBoundingClientRect() : null;
    const move = (ev) => {
      let dx = start.ox + ev.clientX - start.x, dy = start.oy + ev.clientY - start.y;
      if (r0) {
        const minX = -r0.left + 8 + start.ox, maxX = window.innerWidth - r0.right - 8 + start.ox;
        const minY = -r0.top + 8 + start.oy, maxY = window.innerHeight - r0.top - 40 + start.oy;
        dx = Math.max(minX, Math.min(maxX, dx)); dy = Math.max(minY, Math.min(maxY, dy));
      }
      setOffset({ x: dx, y: dy });
    };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  useEffect(() => {
    const el = ref.current;
    const focusable = el && el.querySelector('[data-autofocus], input:not([type=checkbox]):not([type=radio]), select, textarea, button.primary, button');
    if (focusable) focusable.focus();
  }, []);
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); if (closable) onClose(); }
    else if (e.key === 'Enter' && onEnter && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON' && !e.nativeEvent.isComposing) {
      e.preventDefault(); onEnter();
    }
    e.stopPropagation();   // the map's shortcuts stay off while a dialog is open
  };
  if (embedded) {
    return (
      <div className={`dlg embedded ${kind} ${className}`} ref={ref} role="dialog" onKeyDown={onKey}>
        <div className="dlg-title drag-region">
          {icon && <span className="dlg-title-icon" data-tauri-drag-region><Icon name={icon} /></span>}
          <span className="dlg-title-text" data-tauri-drag-region>{title}</span>
          {closable && <button className="dlg-x" onClick={onClose} title={t('close_btn')} aria-label={t('close_btn')}><Icon name="close" size={14} /></button>}
        </div>
        <div className="dlg-body">{children}</div>
        {footer && <div className="dlg-footer">{footer}</div>}
      </div>
    );
  }
  return (
    <div className={`dlg-backdrop ${modal ? '' : 'nomodal'}`} onMouseDown={(e) => { if (modal && closable && e.target === e.currentTarget) onClose(); }}>
      <div className={`dlg ${kind} ${className}`} style={{ ...(width ? { width } : {}), transform: offset.x || offset.y ? `translate(${offset.x}px, ${offset.y}px)` : undefined }} ref={ref} role="dialog" aria-modal={modal ? 'true' : 'false'} onKeyDown={onKey}>
        <div className="dlg-title" onMouseDown={onTitleDown}>
          {icon && <Icon name={icon} />}
          <span className="dlg-title-text">{title}</span>
          {closable && <button className="dlg-x" onClick={onClose} title={t('close_btn')} aria-label={t('close_btn')}><Icon name="close" size={14} /></button>}
        </div>
        <div className="dlg-body">{children}</div>
        {footer && <div className="dlg-footer">{footer}</div>}
      </div>
    </div>
  );
}

// buttons: [{ id, label, kind: 'primary' | 'danger' | '' }] → onResult(id); close = 'cancel'
export function ConfirmDialog({ title, message, icon = 'warning', kind = 'danger', buttons, detail, width = 460, onResult }) {
  useLanguage();
  const primary = buttons.find((b) => b.kind === 'primary') || buttons[0];
  return (
    <Dialog title={title} icon={icon} kind={kind} width={width} onClose={() => onResult('cancel')} onEnter={() => onResult(primary.id)}>
      <p className="pre">{message}</p>
      {detail && <pre className="detail">{detail}</pre>}
      <div className="dlg-footer inner">
        {buttons.map((b) => <button key={b.id} className={`btn ${b.kind || ''}`} onClick={() => onResult(b.id)}>{b.label}</button>)}
      </div>
    </Dialog>
  );
}

export function ErrorDialog({ title, message, error, onClose }) {
  useLanguage();
  const [copied, setCopied] = useState(false);
  const detail = error ? [
    error.code ? `${t('error_code')}: ${error.code}` : null,
    error.path ? `${t('error_path')}: ${error.path}` : null,
    error.message,
    error.stack ? `\n${error.stack}` : null,
  ].filter(Boolean).join('\n') : '';
  const copy = async () => { await writeClipboardText(`${title}\n${message}\n\n${detail}`); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <Dialog title={title || t('error_title')} icon="warning" kind="error" width={520} onClose={onClose} onEnter={onClose}
      footer={<><button className="btn" onClick={copy}>{copied ? t('copied_details') : t('copy_details')}</button><span className="spacer" /><button className="btn primary" onClick={onClose}>{t('ok')}</button></>}>
      <p className="pre">{message || t('error_unexpected')}</p>
      {detail && <><div className="muted small">{t('error_details')}</div><pre className="detail">{detail}</pre></>}
    </Dialog>
  );
}

export function AboutDialog({ info, onClose, embedded = false }) {
  useLanguage();
  const bi = info && info.buildInfo;
  return (
    <Dialog modal={false} embedded={embedded} title={t('about_title')} icon="info" kind="info" width={520} onClose={onClose} onEnter={onClose}
      footer={<button className="btn primary" onClick={onClose}>{t('ok')}</button>}>
      <div className="about">
        <img src="./icon.svg" alt="" width={72} height={72} />
        <div className="about-text selectable">
          <div className="about-name">{t('appName')}</div>
          <div>{t('about_desc')}</div>
          <div className="muted small">{t('about_libs')}</div>
          <div className="form-grid small" style={{ marginTop: 6 }}>
            <label>{t('version')}</label><span>{info ? info.version : '…'}</span>
            <label>{t('author')}</label><span>{t('author_name')}</span>
            <label>{t('about_host')}</label><span>{hostName === 'tauri' ? t('host_tauri') : t('host_web')}{info ? ` · ${info.platform}` : ''}</span>
            {bi && <><label>{t('about_build')}</label><span>{bi.buildTime ? bi.buildTime.replace('T', ' ').slice(0, 19) : ''}{bi.gitCommit ? ` · ${bi.gitCommit}` : ''}{bi.node ? ` · node ${bi.node}` : ''}</span></>}
          </div>
          <div className="about-copy muted small">{t('copyright')}</div>
        </div>
      </div>
    </Dialog>
  );
}

export function PromptDialog({ title, label, initial = '', okLabel, icon = 'rename', onResult, validate, allowEmpty = false, multiline = false, extra }) {
  useLanguage();
  const [v, setV] = useState(initial);
  const err = validate ? validate(v) : null;
  const ok = () => { if (!err && (allowEmpty || v.trim())) onResult(v.trim()); };
  return (
    <Dialog title={title} icon={icon} kind="info" width={460} onClose={() => onResult(null)} onEnter={ok}
      footer={<><button className="btn" onClick={() => onResult(null)}>{t('cancel')}</button><button className="btn primary" disabled={!!err || (!allowEmpty && !v.trim())} onClick={ok}>{okLabel || t('ok')}</button></>}>
      <div className="form-row">
        <span className="muted small">{label}</span>
        {multiline
          ? <textarea rows={4} value={v} onChange={(e) => setV(e.target.value)} spellCheck={false} />
          : <input value={v} onChange={(e) => setV(e.target.value)} onFocus={(e) => e.target.select()} spellCheck={false} />}
        {extra && extra(setV)}
        {err && <span className="danger small">{err}</span>}
      </div>
    </Dialog>
  );
}

// Many topics at once: one per line, indentation for levels (pasted lists work too).
export function QuickEntryDialog({ parentText, onResult }) {
  useLanguage();
  const [v, setV] = useState('');
  const tops = useMemo(() => topicsFromText(v), [v]);
  const count = (list) => list.reduce((s, x) => s + 1 + count(x.children), 0);
  return (
    <Dialog title={t('quick_title')} icon="quickEntry" kind="info" width={560} onClose={() => onResult(null)}
      footer={<><span className="muted small">{t('quick_count', { n: count(tops) })}</span><span className="spacer" /><button className="btn" onClick={() => onResult(null)}>{t('cancel')}</button><button className="btn primary" disabled={!tops.length} onClick={() => onResult(tops)}>{t('add')}</button></>}>
      <div className="form-row">
        <span className="muted small">{t('quick_hint', { topic: String(parentText || '').split('\n')[0] })}</span>
        <textarea className="quick-input" rows={12} value={v} placeholder={t('quick_ph')} onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              e.preventDefault();
              const el = e.currentTarget;
              const s = el.selectionStart, end = el.selectionEnd;
              const lineStart = v.lastIndexOf('\n', s - 1) + 1;
              if (e.shiftKey) {
                if (v[lineStart] === '\t') { setV(v.slice(0, lineStart) + v.slice(lineStart + 1)); requestAnimationFrame(() => el.setSelectionRange(Math.max(lineStart, s - 1), Math.max(lineStart, end - 1))); }
              } else { setV(`${v.slice(0, lineStart)}\t${v.slice(lineStart)}`); requestAnimationFrame(() => el.setSelectionRange(s + 1, end + 1)); }
            } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && tops.length) { e.preventDefault(); onResult(tops); }
          }} />
      </div>
    </Dialog>
  );
}

// The template gallery (and, with samples, the sample maps): a picture of each drawn by the map renderer.
export function TemplateDialog({ settings, onResult, samples = false }) {
  useLanguage();
  const lang = getLanguage();
  const list = samples ? SAMPLES : TEMPLATES;
  const [pick, setPick] = useState(samples ? SAMPLES[0].id : 'blank');
  const pics = useMemo(() => {
    const out = {};
    for (const tpl of list) {
      try {
        const map = samples ? mapFromSample(tpl.id, lang) : mapFromTemplate(tpl.id, lang, { style: settings.defaultMapStyle, layout: settings.defaultLayout });
        const pic = mapPicture(map, { lang, settings, padding: 24 });
        out[tpl.id] = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pic.svg)}`;
      } catch { out[tpl.id] = ''; }
    }
    return out;
  }, [lang]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Dialog title={t(samples ? 'samples_title' : 'tpl_title')} icon={samples ? 'sample' : 'template'} kind="info" className="template-dialog" width={1180} onClose={() => onResult(null)} onEnter={() => onResult(pick)}
      footer={<><button className="btn" onClick={() => onResult(null)}>{t('cancel')}</button><button className="btn primary" onClick={() => onResult(pick)}>{t(samples ? 'samples_open' : 'tpl_create')}</button></>}>
      <div className="tpl-grid">
        {list.map((tpl) => (
          <button key={tpl.id} type="button" className={`tpl-card ${pick === tpl.id ? 'on' : ''}`} data-template={tpl.id} onClick={() => setPick(tpl.id)} onDoubleClick={() => onResult(tpl.id)}>
            <span className="tpl-pic">{pics[tpl.id] && <img src={pics[tpl.id]} alt="" draggable={false} />}</span>
            <span className="tpl-text"><b><Icon name={tpl.icon} size={14} /> {tpl.label[lang === 'ko' ? 0 : 1]}</b><small>{tpl.desc[lang === 'ko' ? 0 : 1]}</small></span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

// File › Export: the format and its options, then the save dialog.
export function ExportDialog({ settings, initial = 'png', onResult }) {
  useLanguage();
  const lang = getLanguage();
  const [id, setId] = useState(initial);
  const [scale, setScale] = useState(settings.exportScale || 2);
  const [transparent, setTransparent] = useState(!!settings.exportTransparent);
  const [padding, setPadding] = useState(settings.exportPadding ?? 40);
  const [paper, setPaper] = useState(settings.printPaper || 'a4');
  const [orient, setOrient] = useState('auto');
  const fmt = EXPORTS.find((e) => e.id === id) || EXPORTS[0];
  const go = () => onResult({ id, scale, transparent, padding, paper, landscape: orient === 'auto' ? undefined : orient === 'landscape', margin: settings.printMargin ?? 10 });
  return (
    <Dialog title={t('export_title')} icon="export" kind="info" className="export-dialog" width={940} onClose={() => onResult(null)} onEnter={go}
      footer={<><button className="btn" onClick={() => onResult(null)}>{t('cancel')}</button><button className="btn primary" onClick={go}>{t('export_go')}</button></>}>
      <div className="export-layout">
        <div className="export-list" role="listbox">
          {EXPORTS.map((e) => (
            <button key={e.id} type="button" role="option" aria-selected={id === e.id} className={`export-item ${id === e.id ? 'on' : ''}`} data-export={e.id} onClick={() => setId(e.id)} onDoubleClick={() => { setId(e.id); onResult({ id: e.id, scale, transparent, padding, paper, margin: settings.printMargin ?? 10 }); }}>
              <Icon name={e.icon} size={16} />
              <span className="export-text"><b>{e.label[lang === 'ko' ? 0 : 1]}</b><small>{e.desc[lang === 'ko' ? 0 : 1]}</small></span>
              <span className="export-ext mono">.{e.ext}</span>
            </button>
          ))}
        </div>
        <div className="export-opts">
          <h4 className="pane-h">{t('export_options')}</h4>
          {(fmt.id === 'png' || fmt.id === 'jpeg' || fmt.id === 'pdf') && (
            <label className="form-row"><span className="muted small">{t('export_scale')}</span>
              <IconSelect name="scale" value={scale} options={scaleOptions()} onChange={(v) => setScale(Number(v))} />
            </label>
          )}
          {(fmt.id === 'png' || fmt.id === 'svg') && (
            <label className="check"><input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} /><span>{t('export_transparent')}</span></label>
          )}
          {fmt.picture && (
            <label className="form-row"><span className="muted small">{t('export_padding')}</span>
              <IconSelect name="padding" value={padding} options={paddingOptions()} onChange={(v) => setPadding(Number(v))} />
            </label>
          )}
          {fmt.id === 'pdf' && (
            <>
              <label className="form-row"><span className="muted small">{t('print_paper')}</span>
                <IconSelect name="paper" value={paper} options={paperOptions(['a4', 'a3', 'a5', 'letter', 'legal'], t('export_paper_fit'))} onChange={setPaper} />
              </label>
              {paper !== 'fit' && (
                <label className="form-row"><span className="muted small">{t('print_orientation')}</span>
                  <IconSelect name="orientation" value={orient} options={orientOptions({ auto: t('auto'), portrait: t('print_portrait'), landscape: t('print_landscape') })} onChange={setOrient} />
                </label>
              )}
            </>
          )}
          {!fmt.picture && <p className="muted small">{t(`export_note_${fmt.id}`)}</p>}
        </div>
      </div>
    </Dialog>
  );
}

// [keys, what] — keys is a string or a translation key (key_*) for words.
const SHORTCUTS = [
  ['Ctrl+N', 'new_map'], ['Ctrl+O', 'open_file'], ['Ctrl+S', 'save'], ['Ctrl+Shift+S', 'save_as'], ['Ctrl+E', 'export'], ['Ctrl+P', 'print'], ['Ctrl+W', 'close'],
  ['Ctrl+Tab / Ctrl+Shift+Tab', 'sc_tabs'], ['Ctrl+Z / Ctrl+Y', 'sc_undo_redo'], ['Ctrl+X / C / V', 'sc_clipboard'], ['Ctrl+Shift+C', 'copy_image'], ['Ctrl+A', 'select_all'],
  ['Enter', 'add_sibling'], ['Shift+Enter', 'add_sibling_before'], ['Tab / Insert', 'add_child'], ['Ctrl+Shift+Insert', 'add_parent'], ['Ctrl+Shift+Enter', 'add_callout'],
  ['F2', 'sc_edit'], ['key_shift_enter_editing', 'sc_newline'], ['Esc', 'sc_cancel'], ['Delete', 'delete'], ['Ctrl+Delete', 'delete_keep_children'],
  ['← ↑ → ↓', 'sc_navigate'], ['Alt+↑ / Alt+↓', 'sc_move'], ['Space', 'sc_fold'], ['Home', 'sc_root'],
  ['Ctrl+Shift+1 … 9 / 0', 'sc_priority'], ['Ctrl+B / I / U', 'sc_font'], ['Ctrl+T', 'notes'], ['Ctrl+K', 'hyperlink'], ['Ctrl+Shift+R', 'relationship'], ['Ctrl+Shift+B', 'boundary'], ['Ctrl+Shift+Q', 'quick_entry'],
  ['Ctrl+F / Ctrl+H', 'sc_find'], ['F3', 'find_next'], ['F4', 'focus_branch'], ['F5', 'presentation'], ['F11', 'fullscreen'],
  ['Ctrl+= / Ctrl+-', 'sc_zoom'], ['Ctrl+0', 'fit_map'], ['Ctrl+1', 'zoom_100'], ['key_ctrl_wheel', 'sc_zoom'], ['Ctrl+,', 'settings'], ['F1', 'help_menu'],
  ['Ctrl+Alt+↓ / → / ← / M', 'sc_redraw'], ['Ctrl+Shift+L', 'sc_arrange'], ['Ctrl+Alt+C', 'center_map'], ['Ctrl+]', 'summary'], ['Ctrl+Alt+G / R / O', 'sc_view_toggles'], ['Ctrl+Alt+S / P', 'sc_panels'],
  ['key_drag', 'sc_drag'], ['key_marquee', 'sc_marquee'], ['key_dblclick', 'sc_dblclick'], ['key_alt_drop', 'sc_detach'],
];

export function ShortcutsDialog({ onClose, embedded = false }) {
  useLanguage();
  const ncol = 2;
  const per = Math.ceil(SHORTCUTS.length / ncol);
  const parts = Array.from({ length: ncol }, (_, i) => SHORTCUTS.slice(i * per, (i + 1) * per));
  const keyLabel = (k) => (k.startsWith('key_') ? t(k) : k).replace(/Ctrl/g, isMac ? '⌘' : 'Ctrl');
  return (
    <Dialog modal={false} embedded={embedded} title={t('shortcuts_title')} icon="keyboard" kind="info" className="shortcuts" width={960} onClose={onClose} onEnter={onClose}
      footer={<button className="btn primary" onClick={onClose}>{t('ok')}</button>}>
      <div className="shortcut-cols selectable" style={{ gridTemplateColumns: `repeat(${ncol}, 1fr)` }}>
        {parts.map((part, i) => <div key={i} className="shortcut-grid">{part.map(([k, v]) => <React.Fragment key={k + v}><kbd>{keyLabel(k)}</kbd><span>{t(v)}</span></React.Fragment>)}</div>)}
      </div>
    </Dialog>
  );
}
