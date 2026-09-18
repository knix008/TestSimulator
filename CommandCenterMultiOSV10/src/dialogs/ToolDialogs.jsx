// Total Commander style tools: the built-in viewer (F3, "Lister"), a small
// text editor (F4) and the multi-rename tool (Ctrl+M). All three are stacked
// dialogs opened by App through useDialogs().
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DialogFrame } from './Dialogs';
import { t } from '../lib/i18n';
import { formatSize, baseName } from '../lib/format';
import { Icon } from '../components/Icons';
import { buildPrintHtml, printDocument } from '../lib/print';
import { ImageView } from '../components/ImageView';

// ── Viewer (F3) ───────────────────────────────────────────
// spec.data is the fs.readFile result: text (with encoding), image (base64)
// or binary (base64 of the first part, shown as a hex dump).

function hexDump(bytes) {
  const lines = [];
  for (let off = 0; off < bytes.length; off += 16) {
    const chunk = bytes.subarray(off, off + 16);
    const hex = Array.from(chunk, (b) => b.toString(16).padStart(2, '0'));
    const ascii = Array.from(chunk, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
    lines.push(`${off.toString(16).padStart(8, '0')}  ${hex.slice(0, 8).join(' ').padEnd(23)}  ${hex.slice(8).join(' ').padEnd(23)}  ${ascii}`);
  }
  return lines.join('\n');
}

function bytesOf(data) {
  if (data.base64) { const bin = atob(data.base64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
  return new TextEncoder().encode(data.text || '');
}

export function ViewerDialog({ spec, done }) {
  const { data, path } = spec;
  const prefs = spec.prefs || {};
  const [wrap, setWrap] = useState(prefs.viewerWrap !== false);
  const [hex, setHex] = useState(data.kind === 'binary');
  const imageRef = useRef(null);
  const [imageInfo, setImageInfo] = useState('');
  const hexText = useMemo(() => (hex ? hexDump(bytesOf(data).subarray(0, 256 * 1024)) : ''), [hex, data]);
  const lines = useMemo(() => (data.kind === 'text' ? (data.text.match(/\n/g) || []).length + 1 : 0), [data]);
  const [printing, setPrinting] = useState(false);
  // Ctrl+P prints what is shown: the image, the text (wrapped as on screen) or the hex dump.
  const canPrint = data.kind === 'image' ? !data.truncated && !!data.base64 : true;
  const print = async () => {
    if (!canPrint || printing) return;
    // A picture is printed by its pane (decoded, rotated as shown).
    if (data.kind === 'image') { if (imageRef.current) imageRef.current.print(); return; }
    const name = baseName(path);
    const html = buildPrintHtml({ title: name, kind: 'text', text: hex ? hexText : data.text, wrap: wrap && !hex, fontSize: prefs.printFontSize, tabSize: prefs.editorTabSize, meta: hex ? t('viewer_hex') : `${data.encoding}${data.truncated ? ` · ${t('viewer_truncated')}` : ''}` });
    setPrinting(true);
    try { await printDocument({ html, title: name }); }
    catch (err) { if (spec.onPrintError) spec.onPrintError(err); }
    finally { setPrinting(false); }
  };
  const printRef = useRef(print); printRef.current = print;
  useEffect(() => {
    // F3 closes the viewer again (as in TC); Ctrl+W wraps, Ctrl+H hex, Ctrl+P prints.
    const onKey = (e) => {
      if (e.key === 'F3') { e.preventDefault(); done(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') { e.preventDefault(); setWrap((w) => !w); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') { e.preventDefault(); if (data.kind !== 'image') setHex((h) => !h); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') { e.preventDefault(); printRef.current(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [done, data.kind]);
  const info = data.kind === 'image'
    ? `${data.mime}  ·  ${formatSize(data.size)}${imageInfo ? `  ·  ${imageInfo}` : ''}`
    : data.kind === 'text'
      ? `${data.encoding}  ·  ${t('viewer_lines', { n: lines })}  ·  ${formatSize(data.size)}${data.truncated ? `  ·  ${t('viewer_truncated')}` : ''}`
      : `${t('viewer_binary')}  ·  ${formatSize(data.size)}${data.truncated ? `  ·  ${t('viewer_truncated')}` : ''}`;
  return (
    <DialogFrame title={`${spec.preview ? t('preview_title') : t('viewer_title')} — ${baseName(path)}`} onClose={() => done()} icon={spec.preview ? 'image' : 'view'} width={900} className={spec.preview ? 'viewer preview' : 'viewer'} windowed={spec.windowed}
      footer={<>
        <span className="muted small ellipsis" title={path}>{info}</span>
        <span className="spacer" />
        {data.kind !== 'image' && !hex && <label className="check"><input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} /> {t('viewer_wrap')}</label>}
        {data.kind !== 'image' && <label className="check"><input type="checkbox" checked={hex} onChange={(e) => setHex(e.target.checked)} /> {t('viewer_hex')}</label>}
        {spec.canOpen && <button className="btn" onClick={() => { spec.onOpen(); }}><Icon name="open" /> {t('viewer_open_app')}</button>}
        {data.kind !== 'image' && <button className="btn" onClick={print} disabled={!canPrint || printing} title={t('tip_print_view')}><Icon name="print" /> {t('print')} (Ctrl+P)</button>}
        {data.kind === 'text' && <button className="btn" onClick={() => done('edit')}><Icon name="edit" /> {t('edit_file')} (F4)</button>}
        <button className="btn primary" onClick={() => done()}>{t('close')}</button>
      </>}>
      {data.kind === 'image' && (
        data.truncated
          ? <p className="muted">{t('viewer_too_large')}</p>
          : <ImageView ref={imageRef} spec={{ data, path, canOpen: spec.canOpen, onOpen: spec.onOpen, onInfo: setImageInfo, onStatus: spec.onStatus, onError: spec.onPrintError, onSaved: spec.onSaved }} />
      )}
      {data.kind !== 'image' && (
        <pre className={`viewer-text ${wrap && !hex ? 'wrap' : ''}`} style={{ fontSize: prefs.viewerFontSize ? `${prefs.viewerFontSize}px` : undefined }}>{hex ? hexText : data.text}</pre>
      )}
    </DialogFrame>
  );
}

// ── Editor (F4) ───────────────────────────────────────────
// spec: { path, text, encoding, onSave(text) → Promise, confirmDiscard() → Promise<boolean> }

export function EditorDialog({ spec, done }) {
  const prefs = spec.prefs || {};
  const [text, setText] = useState(spec.text);
  const [saved, setSaved] = useState(spec.text);
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  const ref = useRef(null);
  const dirty = text !== saved;
  // Ctrl+P prints the text as it is in the editor — unsaved changes included.
  const print = async () => {
    if (printing) return;
    const name = baseName(spec.path);
    const html = buildPrintHtml({ title: dirty ? `${name} *` : name, kind: 'text', text, wrap: !!prefs.editorWrap, fontSize: prefs.printFontSize, tabSize: prefs.editorTabSize, meta: 'UTF-8' });
    setPrinting(true);
    try { await printDocument({ html, title: name }); }
    catch (err) { if (spec.onPrintError) spec.onPrintError(err); }
    finally { setPrinting(false); }
  };
  useEffect(() => { if (spec.onDirty) spec.onDirty(dirty); }, [dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    if (busy) return;
    setBusy(true);
    try { await spec.onSave(text); setSaved(text); } finally { setBusy(false); }
  };
  const close = async () => {
    if (dirty && !(await spec.confirmDiscard())) return;
    done();
  };
  useEffect(() => { const el = ref.current; if (el) { el.focus(); el.setSelectionRange(0, 0); } }, []);
  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); e.stopPropagation(); save(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') { e.preventDefault(); e.stopPropagation(); print(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') { // keep Tab inside the editor
      e.preventDefault();
      const el = e.target; const s = el.selectionStart, en = el.selectionEnd;
      const next = text.slice(0, s) + '\t' + text.slice(en);
      setText(next);
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 1; });
    }
  };
  const lines = (text.match(/\n/g) || []).length + 1;
  return (
    <DialogFrame title={`${t('editor_title')} — ${baseName(spec.path)}${dirty ? ' *' : ''}`} onClose={close} icon="edit" width={900} className="editor" windowed={spec.windowed}
      footer={<>
        <span className="muted small ellipsis">{spec.encoding && spec.encoding !== 'UTF-8' ? t('editor_saved_as_utf8', { enc: spec.encoding }) : 'UTF-8'}  ·  {t('viewer_lines', { n: lines })}  ·  {formatSize(new TextEncoder().encode(text).length)}</span>
        <span className="spacer" />
        <button className="btn primary" onClick={save} disabled={!dirty || busy}><Icon name="save" /> {t('save')} (Ctrl+S)</button>
        <button className="btn" onClick={print} disabled={printing} title={t('tip_print_edit')}><Icon name="print" /> {t('print')} (Ctrl+P)</button>
        <button className="btn" onClick={close}>{t('close')}</button>
      </>}>
      <textarea ref={ref} className="editor-text" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} spellCheck={false} wrap={prefs.editorWrap ? 'soft' : 'off'}
        style={{ fontSize: prefs.editorFontSize ? `${prefs.editorFontSize}px` : undefined, tabSize: prefs.editorTabSize || 4 }} />
    </DialogFrame>
  );
}

// ── Multi-rename tool (Ctrl+M) ────────────────────────────
// Name / extension masks with TC placeholders — [N] name, [N2-5] characters
// 2..5 of the name, [N3-] from the 3rd on, [E] extension, [C] counter, [P]
// parent folder — then search & replace, then a case rule. The preview
// shows every new name and flags duplicates.

function applyMask(mask, name, ext, counter, parent) {
  return mask.replace(/\[(N|E|P|C)(\d+)?(-)?(\d+)?\]/g, (m, kind, a, dash, b) => {
    if (kind === 'C') return counter;
    if (kind === 'P') return parent;
    const src = kind === 'N' ? name : ext;
    if (!a) return src;
    const from = Math.max(1, Number(a)) - 1;
    if (!dash) return src.slice(from, from + 1);
    const to = b ? Number(b) : src.length;
    return src.slice(from, to);
  });
}

function applyCase(s, mode) {
  switch (mode) {
    case 'upper': return s.toUpperCase();
    case 'lower': return s.toLowerCase();
    case 'first': return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    case 'words': return s.toLowerCase().replace(/(^|[\s._-])(\p{L})/gu, (m, p, c) => p + c.toUpperCase());
    default: return s;
  }
}

export function computeRenames(entries, opts) {
  const { nameMask, extMask, search, replace, regex, ignoreCase, caseMode, start, step, digits, parent } = opts;
  let re = null;
  if (search) {
    try { re = new RegExp(regex ? search : search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), ignoreCase ? 'gi' : 'g'); } catch { re = null; }
  }
  const out = [];
  const seen = new Map();
  let n = Number(start) || 0;
  for (const e of entries) {
    const dot = e.isDir ? -1 : e.name.lastIndexOf('.');
    const stem = dot > 0 ? e.name.slice(0, dot) : e.name;
    const ext = dot > 0 ? e.name.slice(dot + 1) : '';
    const counter = String(n).padStart(Number(digits) || 1, '0');
    let newStem = applyMask(nameMask, stem, ext, counter, parent);
    let newExt = e.isDir ? '' : applyMask(extMask, stem, ext, counter, parent);
    let full = newExt ? `${newStem}.${newExt}` : newStem;
    if (re) full = full.replace(re, replace);
    full = applyCase(full, caseMode);
    const bad = !full || full === '.' || full === '..' || /[/\\]/.test(full);
    const key = full.toLowerCase();
    const dup = seen.has(key);
    seen.set(key, true);
    out.push({ entry: e, newName: full, changed: full !== e.name, invalid: bad, dup });
    n += Number(step) || 1;
  }
  return out;
}

export function MultiRenameDialog({ spec, done }) {
  const [nameMask, setNameMask] = useState('[N]');
  const [extMask, setExtMask] = useState('[E]');
  const [search, setSearch] = useState('');
  const [replace, setReplace] = useState('');
  const [regex, setRegex] = useState(false);
  const [ignoreCase, setIgnoreCase] = useState(true);
  const [caseMode, setCaseMode] = useState('keep');
  const [start, setStart] = useState(1);
  const [step, setStep] = useState(1);
  const [digits, setDigits] = useState(1);
  const rows = useMemo(() => computeRenames(spec.entries, { nameMask, extMask, search, replace, regex, ignoreCase, caseMode, start, step, digits, parent: spec.parent || '' }),
    [spec, nameMask, extMask, search, replace, regex, ignoreCase, caseMode, start, step, digits]);
  const changed = rows.filter((r) => r.changed);
  const blocked = rows.some((r) => r.invalid || r.dup);
  const submit = () => { if (!blocked && changed.length) done(changed.map((r) => ({ path: r.entry.path, newName: r.newName }))); };
  const reset = () => { setNameMask('[N]'); setExtMask('[E]'); setSearch(''); setReplace(''); setRegex(false); setIgnoreCase(true); setCaseMode('keep'); setStart(1); setStep(1); setDigits(1); };
  return (
    <DialogFrame title={`${t('multi_rename')} — ${t('mrn_count', { n: spec.entries.length })}`} onClose={() => done(null)} icon="multiRename" width={880} className="mrn" windowed={spec.windowed}
      footer={<>
        <span className="muted small">{blocked ? t('mrn_conflict') : t('mrn_changed', { n: changed.length })}</span>
        <span className="spacer" />
        <button className="btn" onClick={reset}>{t('mrn_reset')}</button>
        <button className="btn" onClick={() => done(null)}>{t('cancel')}</button>
        <button className="btn primary" onClick={submit} disabled={blocked || !changed.length}>{t('mrn_start')}</button>
      </>}>
      <div className="mrn-grid">
        <fieldset>
          <legend>{t('mrn_mask')}</legend>
          <div className="form-grid">
            <label>{t('mrn_name_mask')}</label><input value={nameMask} onChange={(e) => setNameMask(e.target.value)} spellCheck={false} />
            <label>{t('mrn_ext_mask')}</label><input value={extMask} onChange={(e) => setExtMask(e.target.value)} spellCheck={false} />
          </div>
          <div className="mrn-tags">
            {[['[N]', t('mrn_tag_name')], ['[N2-5]', t('mrn_tag_range')], ['[E]', t('mrn_tag_ext')], ['[C]', t('mrn_tag_counter')], ['[P]', t('mrn_tag_parent')]].map(([tag, tip]) => (
              <button key={tag} type="button" className="mrn-tag" title={tip} onClick={() => setNameMask((m) => m + tag)}>{tag}</button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>{t('mrn_search_replace')}</legend>
          <div className="form-grid">
            <label>{t('mrn_search')}</label><input value={search} onChange={(e) => setSearch(e.target.value)} spellCheck={false} />
            <label>{t('mrn_replace')}</label><input value={replace} onChange={(e) => setReplace(e.target.value)} spellCheck={false} />
          </div>
          <div className="mrn-options">
            <label className="check"><input type="checkbox" checked={regex} onChange={(e) => setRegex(e.target.checked)} /> {t('mrn_regex')}</label>
            <label className="check"><input type="checkbox" checked={ignoreCase} onChange={(e) => setIgnoreCase(e.target.checked)} /> {t('mrn_ignore_case')}</label>
          </div>
        </fieldset>
        <fieldset>
          <legend>{t('mrn_counter')}</legend>
          <div className="form-grid">
            <label>{t('mrn_start_at')}</label><input type="number" value={start} onChange={(e) => setStart(e.target.value)} />
            <label>{t('mrn_step')}</label><input type="number" value={step} onChange={(e) => setStep(e.target.value)} />
            <label>{t('mrn_digits')}</label><input type="number" min="1" max="10" value={digits} onChange={(e) => setDigits(e.target.value)} />
          </div>
        </fieldset>
        <fieldset>
          <legend>{t('mrn_case')}</legend>
          <select value={caseMode} onChange={(e) => setCaseMode(e.target.value)}>
            <option value="keep">{t('mrn_case_keep')}</option>
            <option value="lower">{t('mrn_case_lower')}</option>
            <option value="upper">{t('mrn_case_upper')}</option>
            <option value="first">{t('mrn_case_first')}</option>
            <option value="words">{t('mrn_case_words')}</option>
          </select>
        </fieldset>
      </div>
      <div className="mrn-preview">
        <table className="file-table">
          <thead><tr><th className="c-name">{t('mrn_old_name')}</th><th className="c-name">{t('mrn_new_name')}</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.entry.path} className={r.invalid || r.dup ? 'mrn-bad' : r.changed ? 'mrn-changed' : ''}>
                <td className="c-name"><span className="mrn-cell"><Icon name={r.entry.isDir ? 'folder' : 'file'} size={14} className={r.entry.isDir ? 'ic-folder' : 'ic-file'} /><span className="ellipsis">{r.entry.name}</span></span></td>
                <td className="c-name"><span className="mrn-cell"><Icon name="move" size={14} className="mrn-arrow" /><span className="ellipsis">{r.newName}</span>{r.dup && <span className="mrn-flag">{t('mrn_dup')}</span>}{r.invalid && <span className="mrn-flag">{t('mrn_invalid')}</span>}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DialogFrame>
  );
}
