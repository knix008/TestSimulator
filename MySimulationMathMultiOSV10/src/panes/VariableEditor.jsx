// 변수 편집기 / Variable Editor: a grid of one workspace variable. Real
// numeric and logical matrices can be edited (double-click or Enter, type,
// Enter); typing in the empty row / column after the data grows the matrix.
// Cells, structs and text are shown read-only. Edits go back with
// variable.set and can be undone.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from '../components/Chrome';
import { cellText, gridShape, isNumericValue, parseCell, withCell, dimsText, valueSummary } from '../lib/valueFormat';
import { record } from '../lib/history';
import { showError } from '../lib/ui';

const MAX_ROWS = 500;
const MAX_COLS = 100;

export function VariableEditor({ engine, name, active, refreshKey, format }) {
  useLanguage();
  const [value, setValue] = useState(null);
  const [error, setError] = useState('');
  const [sel, setSel] = useState({ r: 0, c: 0 });
  const [edit, setEdit] = useState(null); // { r, c, text }
  const box = useRef(null);

  const load = useCallback(() => {
    engine.getVariable(name).then((v) => { setValue(v); setError(v ? '' : t('ve_gone', { name })); }).catch((e) => setError(e.message));
  }, [engine, name]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const editable = value && isNumericValue(value) && value.dims.length === 2;
  const { rows, cols } = gridShape(value);
  const shownRows = Math.min(rows, MAX_ROWS);
  const shownCols = Math.min(cols, MAX_COLS);
  const extra = editable ? 1 : 0;

  const commit = async () => {
    if (!edit) return;
    const parsed = parseCell(edit.text);
    const { r, c } = edit;
    setEdit(null);
    if (!parsed) { showError(new Error(t('ve_bad_number', { text: edit.text }))); return; }
    const before = value;
    const next = withCell(value, r, c, parsed);
    try {
      await engine.setVariable(name, next);
      setValue(next);
      record({ label: t('hist_var_edit', { name }), undo: () => engine.setVariable(name, before).then(load), redo: () => engine.setVariable(name, next).then(load) });
    } catch (e) { showError(e); }
    if (box.current) box.current.focus();
  };

  const onKey = (e) => {
    if (edit) return;
    const move = (dr, dc) => { e.preventDefault(); setSel((s) => ({ r: Math.max(0, Math.min(shownRows - 1 + extra, s.r + dr)), c: Math.max(0, Math.min(shownCols - 1 + extra, s.c + dc)) })); };
    if (e.key === 'ArrowDown') move(1, 0);
    else if (e.key === 'ArrowUp') move(-1, 0);
    else if (e.key === 'ArrowRight' || e.key === 'Tab') move(0, 1);
    else if (e.key === 'ArrowLeft') move(0, -1);
    else if ((e.key === 'Enter' || e.key === 'F2') && editable) { e.preventDefault(); setEdit({ ...sel, text: sel.r < rows && sel.c < cols ? cellText(value, sel.r, sel.c, 'long') : '' }); }
    else if (editable && e.key.length === 1 && /[-+.\d]/.test(e.key) && !e.ctrlKey) { e.preventDefault(); setEdit({ ...sel, text: e.key }); }
  };

  if (error) return <div className="pane-empty small bad"><Icon name="alert" size={14} /> {error}</div>;
  if (!value) return <div className="pane-empty small muted">{t('loading')}</div>;

  let body;
  if (value.cls === 'struct' && value.dims.reduce((a, b) => a * b, 1) === 1) {
    const rec = value.data[0] || {};
    body = (
      <table className="ve-grid">
        <thead><tr><th>{t('ve_field')}</th><th>{t('ws_value')}</th><th>{t('ws_size')}</th><th>{t('ws_class')}</th></tr></thead>
        <tbody>{value.fields.map((f) => { const x = rec[f]; return <tr key={f}><td className="ve-head">{f}</td><td className="mono">{x ? valueSummary(x, format) : ''}</td><td className="mono">{x ? dimsText(x.dims) : ''}</td><td>{x ? x.cls : ''}</td></tr>; })}</tbody>
      </table>
    );
  } else if (value.cls === 'char' && rows <= 1) {
    body = <pre className="ve-text selectable">{Array.from(value.re, (code) => String.fromCharCode(code)).join('')}</pre>;
  } else if (rows * cols === 0 && !editable) {
    body = <div className="pane-empty small muted">{t('ve_empty')}</div>;
  } else {
    body = (
      <table className="ve-grid">
        <thead>
          <tr><th className="ve-corner" />{Array.from({ length: shownCols + extra }, (_, c) => <th key={c} className={sel.c === c ? 'on' : ''}>{c + 1}</th>)}</tr>
        </thead>
        <tbody>
          {Array.from({ length: shownRows + extra }, (_, r) => (
            <tr key={r}>
              <th className={`ve-head ${sel.r === r ? 'on' : ''}`}>{r + 1}</th>
              {Array.from({ length: shownCols + extra }, (_, c) => {
                const inside = r < rows && c < cols;
                const isSel = sel.r === r && sel.c === c;
                if (edit && edit.r === r && edit.c === c) {
                  return (
                    <td key={c} className="ve-cell editing">
                      <input autoFocus className="mono" value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); setSel((s) => ({ ...s, r: s.r + 1 })); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEdit(null); } }}
                        onBlur={commit} />
                    </td>
                  );
                }
                return (
                  <td key={c} className={`ve-cell mono ${isSel ? 'sel' : ''} ${inside ? '' : 've-new'}`}
                    onClick={() => setSel({ r, c })}
                    onDoubleClick={() => { if (editable) setEdit({ r, c, text: inside ? cellText(value, r, c, 'long') : '' }); }}>
                    {inside ? cellText(value, r, c, format) : ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return (
    <div className="ve" data-active={active ? '1' : undefined}>
      <div className="pane-tools ve-bar">
        <Icon name="variable" size={14} /><strong>{name}</strong>
        <span className="small muted">{dimsText(value.dims)} {value.cls}{value.im ? ` (${t('ve_complex')})` : ''}</span>
        {(rows > MAX_ROWS || cols > MAX_COLS) && <span className="small warn-text">{t('ve_partial', { rows: shownRows, cols: shownCols })}</span>}
        <span className="spacer" />
        {!editable && <span className="small muted"><Icon name="lock" size={12} /> {t('ve_readonly')}</span>}
        <button type="button" className="icon-btn" title={t('refresh')} aria-label={t('refresh')} onClick={load}><Icon name="refresh" size={14} /></button>
      </div>
      <div ref={box} className="ve-scroll" tabIndex={0} onKeyDown={onKey}>{body}</div>
    </div>
  );
}
