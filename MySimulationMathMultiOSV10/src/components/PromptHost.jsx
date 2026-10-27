// Renders lib/prompt.js: a one-line text question, or the in-page file
// chooser (folder list from the host API, a name field for "save").
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { subscribePrompt } from '../lib/prompt';
import { fsApi, joinPath, dirName, extOf } from '../lib/backend';
import { Dialog, Icon } from './Chrome';
import { Btn, BtnGroup } from '../views/common';
import { fileIcon } from '../lib/files';

function TextPrompt({ req }) {
  const [value, setValue] = useState(req.value || '');
  const input = useRef(null);
  useEffect(() => { if (input.current) { input.current.focus(); input.current.select(); } }, []);
  const ok = () => req.resolve(value);
  return (
    <Dialog title={req.title} icon={req.icon || 'edit'} onClose={() => req.resolve(null)} className="prompt-dialog">
      <label className="form-row">{req.label}
        <input ref={input} value={value} className={req.mono ? 'mono' : ''} placeholder={req.placeholder || ''} onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ok(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); req.resolve(null); } }} />
      </label>
      {req.hint && <p className="small">{req.hint}</p>}
      <div className="dialog-actions">
        <BtnGroup>
          <Btn icon="check" label={req.okLabel || t('ok')} primary onClick={ok} />
          <Btn icon="close" label={t('cancel')} onClick={() => req.resolve(null)} />
        </BtnGroup>
      </div>
    </Dialog>
  );
}

function PathPrompt({ req }) {
  const [dir, setDir] = useState(req.start || '/');
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [name, setName] = useState(req.name || '');
  const [sel, setSel] = useState('');
  const exts = (req.exts || []).map((e) => e.toLowerCase());
  useEffect(() => {
    let alive = true;
    setError('');
    fsApi.list(dir).then((list) => { if (alive) setItems(list); }).catch((e) => { if (alive) { setItems([]); setError(e.message); } });
    return () => { alive = false; };
  }, [dir]);
  const shown = items
    .filter((it) => it.isDir || (req.mode !== 'folder' && (!exts.length || exts.includes(extOf(it.name)))))
    .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
  const ok = () => {
    if (req.mode === 'folder') { req.resolve(sel ? joinPath(dir, sel) : dir); return; }
    const n = (req.mode === 'save' ? name : sel || name).trim();
    if (!n) return;
    req.resolve(/^([A-Za-z]:)?\//.test(n) ? n : joinPath(dir, n));
  };
  const title = req.title || (req.mode === 'save' ? t('dlg_save_title') : req.mode === 'folder' ? t('dlg_folder_title') : t('dlg_open_title'));
  return (
    <Dialog title={title} icon={req.mode === 'save' ? 'save' : 'folder'} onClose={() => req.resolve(null)} className="path-dialog" wide>
      <div className="pd-bar">
        <button type="button" className="icon-btn" title={t('cf_up')} aria-label={t('cf_up')} disabled={dir === dirName(dir)} onClick={() => setDir(dirName(dir))}><Icon name="arrowUp" size={15} /></button>
        <input className="mono pd-path" value={dir} onChange={(e) => setDir(e.target.value)} aria-label={t('cf_path')} />
      </div>
      <div className="pd-list" role="listbox" aria-label={t('cf_title')}>
        {error && <div className="small bad">{error}</div>}
        {shown.map((it) => (
          <button key={it.name} type="button" role="option" aria-selected={sel === it.name} className={`pd-item ${sel === it.name ? 'on' : ''}`}
            onClick={() => { setSel(it.name); if (!it.isDir && req.mode === 'save') setName(it.name); }}
            onDoubleClick={() => { if (it.isDir) { setDir(joinPath(dir, it.name)); setSel(''); } else { setSel(it.name); setTimeout(() => req.resolve(joinPath(dir, it.name)), 0); } }}>
            <Icon name={it.isDir ? 'folder' : fileIcon(it.name)} size={15} /><span className="ellipsis">{it.name}</span>
          </button>
        ))}
        {!error && !shown.length && <div className="small muted">{t('cf_empty')}</div>}
      </div>
      {req.mode !== 'folder' && (
        <label className="form-row inline pd-name"><span className="form-label">{t('dlg_file_name')}</span>
          <input value={req.mode === 'save' ? name : (sel || name)} onChange={(e) => { setName(e.target.value); setSel(''); }} onKeyDown={(e) => { if (e.key === 'Enter') ok(); }} autoFocus={req.mode === 'save'} />
        </label>
      )}
      <div className="dialog-actions">
        <BtnGroup>
          <Btn icon="check" label={req.mode === 'save' ? t('save') : req.mode === 'folder' ? t('dlg_choose') : t('open')} primary onClick={ok} />
          <Btn icon="close" label={t('cancel')} onClick={() => req.resolve(null)} />
        </BtnGroup>
      </div>
    </Dialog>
  );
}

export function PromptHost() {
  useLanguage();
  const [req, setReq] = useState(null);
  useEffect(() => subscribePrompt(setReq), []);
  if (!req) return null;
  if (req.kind === 'path') return <PathPrompt key={req.title || 'p'} req={req} />;
  return <TextPrompt req={req} />;
}
