// Terminal panel (보기 › 터미널, Ctrl+`): several shell sessions as tabs, each
// a line-oriented console — the output of the shell (core/terminal.js,
// polled through term.read) above an input line with history (↑ / ↓).
// When the shell's current directory is inside a git repository, a status
// line shows the branch, ahead / behind and the number of changed files,
// with buttons for `git status` and a refresh.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { call } from '../lib/backend';
import { Icon } from './Icons';
import { ContextMenu } from './ContextMenu';

const POLL_MS = 150;

function GitLine({ git, onCommand, onRefresh }) {
  useLanguage();
  if (!git) return null;
  if (!git.repo) return <div className="term-git none">{t('term_no_git')}</div>;
  const dirty = git.staged + git.changed + git.untracked + git.conflicts;
  return (
    <div className="term-git">
      <Icon name="gitBranch" size={14} />
      <b>{git.branch || '(detached)'}</b>
      {git.upstream && <span className="muted">→ {git.upstream}</span>}
      {git.ahead > 0 && <span className="term-git-ab" title={t('term_git_ahead')}>↑{git.ahead}</span>}
      {git.behind > 0 && <span className="term-git-ab" title={t('term_git_behind')}>↓{git.behind}</span>}
      <span className={dirty ? 'term-git-dirty' : 'term-git-clean'}>
        {dirty ? t('term_git_changes', { staged: git.staged, changed: git.changed, untracked: git.untracked }) : t('term_git_clean')}
        {git.conflicts > 0 && ` · ${t('term_git_conflicts', { n: git.conflicts })}`}
      </span>
      <span className="spacer" />
      <button className="term-btn" onClick={() => onCommand('git status')}>git status</button>
      <button className="term-btn" onClick={() => onCommand('git log --oneline -n 10')}>git log</button>
      <button className="term-btn" onClick={() => onCommand('git diff --stat')}>git diff</button>
      <button className="icon-btn" title={t('sb_refresh')} onClick={onRefresh}><Icon name="refresh" size={13} /></button>
    </div>
  );
}

function TerminalView({ term, active, onExit }) {
  useLanguage();
  const [lines, setLines] = useState(() => term.buffer || []);
  const [git, setGit] = useState(null);
  const [input, setInput] = useState('');
  const [hist, setHist] = useState({ list: [], idx: -1 });
  const outRef = useRef(null);
  const inputRef = useRef(null);
  const seqRef = useRef(term.seq || 0);
  const cwdRef = useRef(term.cwd);
  const [cwd, setCwd] = useState(term.cwd);
  const [exited, setExited] = useState(false);
  const busyRef = useRef(false);

  const refreshGit = useCallback(() => { call('git.status', { cwd: cwdRef.current }).then(setGit).catch(() => setGit(null)); }, []);

  // Poll the shell output while the tab is visible.
  useEffect(() => {
    if (!active) return undefined;
    let stop = false;
    const tick = async () => {
      if (stop || busyRef.current) return;
      busyRef.current = true;
      try {
        const r = await call('term.read', { id: term.id, since: seqRef.current });
        if (stop || !r) return;
        if (r.chunks.length) {
          seqRef.current = r.seq;
          const text = r.chunks.map((c) => c.text).join('');
          setLines((prev) => { const next = (prev.join('') + text).split('\n'); return next.length > 3000 ? next.slice(-3000) : next; });
          term.buffer = null;   // kept fresh below
        }
        if (r.cwd !== cwdRef.current) { cwdRef.current = r.cwd; setCwd(r.cwd); refreshGit(); }
        if (r.exited && !exited) { setExited(true); onExit(term.id); }
      } catch { /* transient */ } finally { busyRef.current = false; }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { stop = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, term.id]);

  useEffect(() => { refreshGit(); }, [refreshGit]);
  useEffect(() => { term.buffer = lines; term.seq = seqRef.current; }, [lines, term]);
  useEffect(() => { const el = outRef.current; if (el) el.scrollTop = el.scrollHeight; }, [lines]);
  useEffect(() => { if (active && inputRef.current) inputRef.current.focus(); }, [active]);

  const run = async (line) => {
    const cmd = line.trim();
    if (!cmd) { await call('term.run', { id: term.id, line: '' }); return; }
    setHist((h) => ({ list: [...h.list.filter((x) => x !== cmd), cmd].slice(-100), idx: -1 }));
    if (cmd === 'clear' || cmd === 'cls') { setLines([]); await call('term.run', { id: term.id, line: '' }); return; }
    await call('term.run', { id: term.id, line: cmd });
    setTimeout(refreshGit, 600);
  };

  const onKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); const v = input; setInput(''); run(v); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHist((h) => { const i = h.idx < 0 ? h.list.length - 1 : Math.max(0, h.idx - 1); if (h.list[i] !== undefined) setInput(h.list[i]); return { ...h, idx: i }; }); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setHist((h) => { if (h.idx < 0) return h; const i = h.idx + 1; if (i >= h.list.length) { setInput(''); return { ...h, idx: -1 }; } setInput(h.list[i]); return { ...h, idx: i }; }); }
    else if (e.key === 'c' && e.ctrlKey && !input) { e.preventDefault(); call('term.write', { id: term.id, data: '\x03' }).catch(() => {}); }
    else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); setLines([]); }
  };

  return (
    <div className={`term-view ${active ? '' : 'hidden'}`}>
      <GitLine git={git} onCommand={(c) => run(c)} onRefresh={refreshGit} />
      <pre className="term-out selectable" ref={outRef} onClick={() => { if (!window.getSelection().toString() && inputRef.current) inputRef.current.focus(); }}>{lines.join('\n')}</pre>
      <div className="term-in">
        <span className="term-prompt mono" title={cwd}>{cwd.replace(/^.*[\\/](?=[^\\/]+$)/, '')}{exited ? ' [exited]' : ''}&gt;</span>
        <input ref={inputRef} className="mono" value={input} disabled={exited} placeholder={t('term_placeholder')} spellCheck={false} autoComplete="off"
          onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} />
      </div>
    </div>
  );
}

export function TerminalPanel({ terms, activeId, shells, onActivate, onNew, onClose, onHide, onExit, height, onResizeStart }) {
  useLanguage();
  const [menu, setMenu] = useState(null);
  const shellItems = shells.map((s) => ({ id: `shell:${s.id}`, label: s.label, icon: 'terminal' }));
  return (
    <div className="term-panel" style={{ height }}>
      <div className="h-splitter" onMouseDown={onResizeStart} />
      <div className="term-head">
        <span className="panel-title"><Icon name="terminal" size={14} /> {t('terminal')}</span>
        <div className="term-tabs">
          {terms.map((tm) => (
            <div key={tm.id} className={`term-tab ${tm.id === activeId ? 'active' : ''}`} title={tm.cwd} onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); onClose(tm.id); } else onActivate(tm.id); }}>
              <span className="ellipsis">{tm.title}</span>
              <button className="tab-close" title={t('close')} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onClose(tm.id); }}><Icon name="close" size={12} /></button>
            </div>
          ))}
        </div>
        <button className="icon-btn" title={t('term_new')} onClick={() => onNew()}><Icon name="plus" size={15} /></button>
        {shells.length > 1 && <button className="icon-btn" title={t('term_new_shell')} onClick={(e) => setMenu(e.currentTarget)}><Icon name="chevronDown" size={14} /></button>}
        <span className="spacer" />
        <button className="icon-btn" title={t('term_hide')} onClick={onHide}><Icon name="close" size={15} /></button>
      </div>
      <div className="term-body">
        {terms.length === 0 && <div className="sb-empty"><Icon name="terminal" size={26} /><p>{t('term_empty')}</p><button className="btn" onClick={() => onNew()}>{t('term_new')}</button></div>}
        {terms.map((tm) => <TerminalView key={tm.id} term={tm} active={tm.id === activeId} onExit={onExit} />)}
      </div>
      {menu && <ContextMenu anchorEl={menu} above x={0} y={0} items={shellItems} onClose={() => setMenu(null)} onPick={(id) => { setMenu(null); onNew(id.slice(6)); }} />}
    </div>
  );
}

export default TerminalPanel;
