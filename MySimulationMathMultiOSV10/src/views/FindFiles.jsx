// 파일 찾기 / Find Files: file names matching a pattern (* and ?), optionally
// containing a text, under the current folder (subfolders too). Double-click
// opens a result (at the first matching line).
import React, { useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Dialog, Icon } from '../components/Chrome';
import { Btn, BtnGroup, Toggle } from './common';
import { fsApi, joinPath } from '../lib/backend';
import { fileIcon, fileKind, globToRegExp } from '../lib/files';

const MAX_FILES = 5000;
const MAX_HITS = 500;

export function FindFilesDialog({ cwd, onOpen, onClose }) {
  useLanguage();
  const [pattern, setPattern] = useState('*.mym');
  const [text, setText] = useState('');
  const [sub, setSub] = useState(true);
  const [hits, setHits] = useState([]);
  const [state, setState] = useState('');
  const stop = useRef(false);

  const search = async () => {
    stop.current = false;
    setHits([]);
    setState('running');
    const re = globToRegExp(pattern);
    const needle = text.trim().toLowerCase();
    const out = [];
    let seen = 0;
    const walk = async (dir, rel) => {
      if (stop.current || seen > MAX_FILES || out.length >= MAX_HITS) return;
      let list = [];
      try { list = await fsApi.list(dir); } catch { return; }
      for (const ent of list) {
        if (stop.current || out.length >= MAX_HITS) return;
        if (ent.name.startsWith('.')) continue;
        const p = joinPath(dir, ent.name);
        if (ent.isDir) { if (sub && ent.name !== 'node_modules') await walk(p, rel ? `${rel}/${ent.name}` : ent.name); continue; }
        seen += 1;
        if (!re.test(ent.name)) continue;
        if (needle) {
          if (ent.size > 4 * 1024 * 1024 || !['script', 'text', 'table', 'other'].includes(fileKind(ent.name))) continue;
          let body = '';
          try { body = await fsApi.readText(p); } catch { continue; }
          const lines = body.split(/\r?\n/);
          const i = lines.findIndex((l) => l.toLowerCase().includes(needle));
          if (i < 0) continue;
          out.push({ path: p, rel: rel ? `${rel}/${ent.name}` : ent.name, line: i + 1, preview: lines[i].trim().slice(0, 160) });
        } else out.push({ path: p, rel: rel ? `${rel}/${ent.name}` : ent.name, line: 0, preview: '' });
        setHits([...out]);
      }
    };
    await walk(cwd, '');
    setHits([...out]);
    setState(stop.current ? 'stopped' : 'done');
  };

  return (
    <Dialog title={t('ff_title')} icon="search" onClose={() => { stop.current = true; onClose(); }} wide className="find-dialog">
      <div className="ff-form">
        <label className="form-row inline"><span className="form-label">{t('ff_name')}</span><input className="mono" value={pattern} onChange={(e) => setPattern(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') search(); }} autoFocus /></label>
        <label className="form-row inline"><span className="form-label">{t('ff_text')}</span><input value={text} placeholder={t('ff_text_ph')} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') search(); }} /></label>
        <div className="hrow"><Toggle icon="folder" label={t('ff_subfolders')} checked={sub} onChange={setSub} /><span className="small muted ellipsis" title={cwd}>{cwd}</span></div>
      </div>
      <div className="ff-results" role="listbox" aria-label={t('ff_results')}>
        {hits.map((h) => (
          <button key={`${h.path}:${h.line}`} type="button" className="ff-hit" onDoubleClick={() => { onOpen(h.path, h.line); onClose(); }} title={h.path}>
            <Icon name={fileIcon(h.path)} size={14} /><span className="mono ellipsis">{h.rel}{h.line ? `:${h.line}` : ''}</span>
            {h.preview && <span className="small muted ellipsis">{h.preview}</span>}
          </button>
        ))}
        {state === 'done' && !hits.length && <div className="small muted">{t('ff_none')}</div>}
      </div>
      <div className="dialog-actions">
        <span className="small muted">{state === 'running' ? t('ff_searching', { n: hits.length }) : state ? t('ff_found', { n: hits.length }) : t('ff_hint')}</span>
        <span className="spacer" />
        <BtnGroup>
          {state === 'running'
            ? <Btn icon="stop" label={t('stop')} onClick={() => { stop.current = true; }} />
            : <Btn icon="search" label={t('ff_find')} primary onClick={search} />}
          <Btn icon="close" label={t('close')} onClick={() => { stop.current = true; onClose(); }} />
        </BtnGroup>
      </div>
    </Dialog>
  );
}
