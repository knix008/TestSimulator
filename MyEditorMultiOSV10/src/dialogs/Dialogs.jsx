// Modal dialogs: the shell, confirm / error / about, go-to-line, a text
// prompt (new file / folder, rename), the language and encoding pickers and
// the shortcut list. Every dialog closes with Escape; Enter triggers the
// primary button.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { hostName, writeClipboardText } from '../lib/backend';
import { Icon, LangIcon } from '../components/Icons';
import { ALL_LANGUAGES, FEATURED_LANGUAGES, PLAIN } from '../lib/languages';

export function Dialog({ title, icon, kind = '', width, onClose, children, footer, onEnter, className = '' }) {
  useLanguage();
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    const focusable = el && el.querySelector('input:not([type=checkbox]), select, textarea, [data-autofocus], button.primary, button');
    if (focusable) focusable.focus();
  }, []);
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    else if (e.key === 'Enter' && onEnter && !(e.target.tagName === 'TEXTAREA') && !(e.target.tagName === 'BUTTON' && e.target !== document.activeElement)) {
      if (e.target.tagName === 'BUTTON') return;   // let the focused button act
      e.preventDefault(); onEnter();
    }
  };
  return (
    <div className="dlg-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`dlg ${kind} ${className}`} style={width ? { width } : undefined} ref={ref} role="dialog" aria-modal="true" onKeyDown={onKey}>
        <div className="dlg-title">
          {icon && <Icon name={icon} />}
          <span>{title}</span>
          <button className="dlg-x" onClick={onClose} title={t('close_btn')} aria-label={t('close_btn')}><Icon name="close" size={14} /></button>
        </div>
        <div className="dlg-body">{children}</div>
        {footer && <div className="dlg-footer">{footer}</div>}
      </div>
    </div>
  );
}

// buttons: [{ id, label, kind: 'primary' | 'danger' | '' }] → resolve(id); close = 'cancel'
export function ConfirmDialog({ title, message, icon = 'warning', kind = 'danger', buttons, detail, onResult }) {
  useLanguage();
  const primary = buttons.find((b) => b.kind === 'primary') || buttons[0];
  return (
    <Dialog title={title} icon={icon} kind={kind} width={460} onClose={() => onResult('cancel')} onEnter={() => onResult(primary.id)}>
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

export function AboutDialog({ info, onClose }) {
  useLanguage();
  const bi = info && info.buildInfo;
  return (
    <Dialog title={t('about_title')} icon="info" kind="info" width={520} onClose={onClose} onEnter={onClose}
      footer={<button className="btn primary" onClick={onClose}>{t('ok')}</button>}>
      <div className="about">
        <img src="./icon.svg" alt="" width={84} height={84} />
        <div className="about-text selectable">
          <div className="about-name">{t('appName')}</div>
          <div>{t('about_desc')}</div>
          <div className="muted small">{t('about_libs')}</div>
          <div className="form-grid small" style={{ marginTop: 6 }}>
            <label>{t('version')}</label><span>{info ? info.version : '…'}</span>
            <label>{t('author')}</label><span>{t('author_name')}</span>
            <label>{t('about_host')}</label><span>{hostName === 'electron' ? t('host_electron') : t('host_web')}{info ? ` · ${info.platform}` : ''}</span>
            {bi && <><label>{t('about_build')}</label><span>{bi.buildTime ? bi.buildTime.replace('T', ' ').slice(0, 19) : ''}{bi.gitCommit ? ` · ${bi.gitCommit}` : ''}{bi.node ? ` · node ${bi.node}` : ''}</span></>}
          </div>
          <div className="about-copy muted small">{t('copyright')}</div>
        </div>
      </div>
    </Dialog>
  );
}

export function GotoLineDialog({ lines, current, onGo, onClose }) {
  useLanguage();
  const [v, setV] = useState(String(current || 1));
  const go = () => {
    const m = v.trim().match(/^(\d+)(?:\s*[:,]\s*(\d+))?$/);
    if (!m) return;
    onGo(Number(m[1]), m[2] ? Number(m[2]) : 1);
  };
  return (
    <Dialog title={t('goto_line_title')} icon="hash" kind="info" width={360} onClose={onClose} onEnter={go}
      footer={<><button className="btn" onClick={onClose}>{t('cancel')}</button><button className="btn primary" onClick={go}>{t('go')}</button></>}>
      <div className="form-row">
        <span className="muted small">{t('goto_line_hint', { n: lines })}</span>
        <input value={v} onChange={(e) => setV(e.target.value)} onFocus={(e) => e.target.select()} spellCheck={false} />
      </div>
    </Dialog>
  );
}

export function PromptDialog({ title, label, initial = '', okLabel, icon = 'rename', onResult, validate }) {
  useLanguage();
  const [v, setV] = useState(initial);
  const err = validate ? validate(v) : null;
  const ok = () => { if (!err && v.trim()) onResult(v.trim()); };
  return (
    <Dialog title={title} icon={icon} kind="info" width={420} onClose={() => onResult(null)} onEnter={ok}
      footer={<><button className="btn" onClick={() => onResult(null)}>{t('cancel')}</button><button className="btn primary" disabled={!!err || !v.trim()} onClick={ok}>{okLabel || t('ok')}</button></>}>
      <div className="form-row">
        <span className="muted small">{label}</span>
        <input value={v} onChange={(e) => setV(e.target.value)} onFocus={(e) => { const i = e.target.value.lastIndexOf('.'); e.target.setSelectionRange(0, i > 0 ? i : e.target.value.length); }} spellCheck={false} />
        {err && <span className="danger small">{err}</span>}
      </div>
    </Dialog>
  );
}

// Searchable list of all language modes (also opened from the status bar).
export function LanguagePicker({ current, onPick, onClose }) {
  useLanguage();
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const base = [{ name: PLAIN, label: t('lang_plain') }, { name: 'auto', label: t('lang_auto') }, ...(ql ? ALL_LANGUAGES : [...FEATURED_LANGUAGES, ...ALL_LANGUAGES.filter((d) => !FEATURED_LANGUAGES.includes(d))]).map((d) => ({ name: d.name, label: d.name, ext: d.extensions.slice(0, 6).join(' ') }))];
    return ql ? base.filter((x) => x.label.toLowerCase().includes(ql) || (x.ext || '').includes(ql)) : base;
  }, [q, getLanguage()]);   // eslint-disable-line react-hooks/exhaustive-deps
  const listRef = useRef(null);
  useEffect(() => { setIdx(0); }, [q]);
  useEffect(() => { const el = listRef.current && listRef.current.children[idx]; if (el) el.scrollIntoView({ block: 'nearest' }); }, [idx]);
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(list.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
  };
  return (
    <Dialog title={t('m_lang')} icon="code" kind="info" width={420} onClose={onClose} onEnter={() => list[idx] && onPick(list[idx].name)}>
      <div className="form-row">
        <input value={q} placeholder={t('sb_filter')} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} spellCheck={false} />
        <div className="listbox tall" ref={listRef}>
          {list.map((x, i) => (
            <div key={x.name} className={`listbox-item ${i === idx ? 'selected' : ''} ${x.name === current ? 'current' : ''}`} onMouseEnter={() => setIdx(i)} onClick={() => onPick(x.name)}>
              <span className="ctx-icon"><LangIcon name={x.name} /></span>
              <span className="ellipsis">{x.label}</span>
              {x.name === current && <Icon name="check" size={14} className="ctx-check" />}
              {x.ext && <span className="muted small mono">{x.ext}</span>}
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  );
}

export function EncodingPicker({ title, encodings, current, onPick, onClose }) {
  useLanguage();
  return (
    <Dialog title={title} icon="text" kind="info" width={380} onClose={onClose}>
      <div className="listbox tall">
        {encodings.map((e) => (
          <div key={e.id} className={`listbox-item ${e.id === current ? 'selected' : ''}`} onClick={() => onPick(e.id)}>
            <span className="ctx-icon">{e.id === current ? <Icon name="check" size={14} /> : null}</span>
            <span className="ellipsis">{e.label}</span>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

const SHORTCUTS = [
  ['Ctrl+N', 'new_file'], ['Ctrl+O', 'open_file'], ['Ctrl+Shift+O', 'open_folder'], ['Ctrl+S', 'save'], ['Ctrl+Alt+S', 'save_as'], ['Ctrl+Shift+S', 'save_all'],
  ['Ctrl+W', 'close'], ['Ctrl+Shift+W', 'close_all'], ['Ctrl+Tab / Ctrl+PgDn', 'tab_next'], ['Ctrl+Shift+Tab / Ctrl+PgUp', 'tab_prev'], ['Ctrl+1 … Ctrl+9', 'tab_n'],
  ['Ctrl+Z / Ctrl+Y', 'undo_redo'], ['Ctrl+D', 'dup_line'], ['Ctrl+L', 'del_line'], ['Alt+↑ / Alt+↓', 'move_line'], ['Ctrl+/', 'toggle_comment'], ['Tab / Shift+Tab', 'indent_outdent'],
  ['Ctrl+U / Ctrl+Shift+U', 'case'], ['Alt+Click', 'multi_cursor'], ['Alt+Drag', 'rect_sel'],
  ['Ctrl+F', 'find'], ['Ctrl+H', 'replace'], ['F3 / Shift+F3', 'find_next_prev'], ['Ctrl+G', 'goto_line'], ['Esc', 'close_find'],
  ['Ctrl+B', 'sidebar'], ['Ctrl+Shift+B', 'sidebar_md'], ['Ctrl+= / Ctrl+-', 'zoom'], ['Ctrl+0', 'zoom_reset'], ['Ctrl+Wheel', 'zoom'], ['F11', 'fullscreen'], ['Ctrl+,', 'settings'],
  ['Ctrl+1 … Ctrl+6', 'md_h'], ['Ctrl+B / Ctrl+I', 'md_bi'], ['Ctrl+Shift+X', 'md_strike'], ['Ctrl+`', 'md_code'], ['Ctrl+Shift+C', 'md_code_block'], ['Ctrl+Shift+Q', 'md_quote'],
  ['Ctrl+Shift+8 / 7 / 9', 'md_lists'], ['Ctrl+K', 'md_link'], ['Ctrl+Shift+I', 'md_image'], ['Ctrl+Shift+W', 'md_wysiwyg_menu'], ['Ctrl+Shift+M', 'md_preview_menu'],
];
const SHORTCUT_LABELS = {
  ko: { sidebar_md: '폴더 트리 (Markdown 문서에서)', md_h: 'Markdown: 제목 H1~H6', md_bi: 'Markdown: 굵게 / 기울임', md_lists: 'Markdown: 글머리 / 번호 / 체크리스트', tab_next: '다음 탭', tab_prev: '이전 탭', tab_n: 'n번째 탭', undo_redo: '실행 취소 / 다시 실행', move_line: '줄 위/아래로 이동', indent_outdent: '들여쓰기 / 내어쓰기', case: '소문자 / 대문자', multi_cursor: '커서 추가 (다중 커서)', rect_sel: '사각형 선택', find_next_prev: '다음 / 이전 찾기', zoom: '확대 / 축소' },
  en: { sidebar_md: 'Folder tree (in Markdown documents)', md_h: 'Markdown: heading H1–H6', md_bi: 'Markdown: bold / italic', md_lists: 'Markdown: bullet / numbered / task list', tab_next: 'Next tab', tab_prev: 'Previous tab', tab_n: 'n-th tab', undo_redo: 'Undo / Redo', move_line: 'Move line up / down', indent_outdent: 'Indent / Outdent', case: 'lowercase / UPPERCASE', multi_cursor: 'Add cursor (multi-cursor)', rect_sel: 'Rectangular selection', find_next_prev: 'Find next / previous', zoom: 'Zoom in / out' },
};

export function ShortcutsDialog({ onClose }) {
  useLanguage();
  const lang = getLanguage();
  const label = (k) => SHORTCUT_LABELS[lang][k] || t(k);
  return (
    <Dialog title={t('shortcuts_title')} icon="keyboard" kind="info" width={560} onClose={onClose} onEnter={onClose}
      footer={<button className="btn primary" onClick={onClose}>{t('ok')}</button>}>
      <div className="shortcut-grid selectable">
        {SHORTCUTS.map(([k, v]) => <React.Fragment key={k}><kbd>{k.replace(/Ctrl/g, navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl')}</kbd><span>{label(v)}</span></React.Fragment>)}
      </div>
    </Dialog>
  );
}
