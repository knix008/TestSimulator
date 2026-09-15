// Terminal panel (보기 › 터미널, Ctrl+`): several shell sessions as tabs, each
// a line-oriented console — the output of the shell (core/terminal.js,
// polled through term.read) ending with a prompt drawn by the panel, where
// the command is typed (history with ↑ / ↓, Tab completion through
// term.complete). The prompt is drawn oh-my-posh style: coloured segments
// for the directory and, inside a git repository, the branch with ahead /
// behind and the number of staged / changed / untracked files. Typed lines
// stay in the output with their prompt as it was. While a command runs the
// prompt is absent and typed lines go to that command's stdin.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { call } from '../lib/backend';
import { Icon } from './Icons';
import { ContextMenu } from './ContextMenu';
import { AnsiText } from '../lib/ansi.jsx';

const WAIT_MS = 1500;   // long poll: the backend answers as soon as something happens, or after this
const MAX_LINES = 3000;

// One prompt: [ 📁 dir ]▶[ ⎇ branch ↑1 ↓2 +3 ~4 ?5 !6 ]▶ — the command is typed right after the last arrow.
function Prompt({ cwd, git, stale = false }) {
  const repo = git && git.repo;
  const dirty = repo ? git.staged + git.changed + git.untracked + git.conflicts > 0 : false;
  // The state of the repository colours the whole block, from the branch name on (the first that applies):
  // conflicts — red · staged (added) — yellow · modified files — red ·
  // committed but not pushed — yellow · behind the remote — blue · clean and pushed — bright green.
  // Untracked files do not colour the block (they are new files git does not know yet, shown by the ? symbol
  // only); otherwise a committed-but-not-pushed or pushed repository would stay red because of them.
  const cls = !repo ? '' : git.conflicts ? 'conflict' : git.staged ? 'staged' : git.changed ? 'modified' : git.ahead ? 'ahead' : git.behind ? 'behind' : 'uptodate';
  return (
    <span className="term-prompt" title={cwd}>
      <span className="seg seg-path"><Icon name="folder" size={12} /> {cwd}</span>
      {repo && (
        <>
          <span className={`seg seg-git ${cls} ${stale ? 'stale' : ''}`}>
            {/* the branch coloured by the overall state (green clean · yellow changes · red conflicts), then one coloured
                symbol per kind of status that applies — no counts: ↑ ahead · ↓ behind · + staged · ~ changed · ? untracked · ! conflicts */}
            <span className="g-branch"><Icon name="gitBranch" size={12} /> {git.branch || '(detached)'}</span>
            {(git.ahead > 0 || git.behind > 0 || dirty) && ' '}
            {git.ahead > 0 && <span className="g-ahead" title={`ahead ${git.ahead}`}>↑</span>}{git.behind > 0 && <span className="g-behind" title={`behind ${git.behind}`}>↓</span>}
            {git.staged > 0 && <span className="g-staged" title={`staged ${git.staged}`}>+</span>}{git.changed > 0 && <span className="g-changed" title={`changed ${git.changed}`}>~</span>}
            {git.untracked > 0 && <span className="g-untracked" title={`untracked ${git.untracked}`}>?</span>}{git.conflicts > 0 && <span className="g-conflict" title={`conflicts ${git.conflicts}`}>!</span>}
          </span>
        </>
      )}
      {' '}
    </span>
  );
}

// The output is a list of entries: shell output text, or a line typed at a
// prompt (kept with the prompt of that moment so it is redrawn the same way).
function lineCount(entries) { let n = 0; for (const e of entries) n += e.k === 'cmd' ? 1 : (e.text.match(/\n/g) || []).length; return n; }
function trimEntries(entries) {
  let n = lineCount(entries);
  let list = entries;
  while (n > MAX_LINES && list.length) {
    const e = list[0];
    if (e.k === 'cmd') { list = list.slice(1); n--; continue; }
    const drop = Math.min(n - MAX_LINES, (e.text.match(/\n/g) || []).length);
    if (drop === 0) { list = list.slice(1); continue; }
    let i = 0, p = -1;
    while (i < drop) { p = e.text.indexOf('\n', p + 1); i++; }
    const rest = e.text.slice(p + 1);
    list = rest ? [{ k: 'out', text: rest }, ...list.slice(1)] : list.slice(1);
    n -= drop;
  }
  return list;
}
function appendText(entries, text) {
  if (!text) return entries;
  const last = entries[entries.length - 1];
  const next = last && last.k === 'out' ? [...entries.slice(0, -1), { k: 'out', text: last.text + text }] : [...entries, { k: 'out', text }];
  return trimEntries(next);
}

// Candidates listed like a shell does: in columns as wide as the panel allows.
function columns(names, width) {
  const w = Math.max(...names.map((n) => n.length)) + 2;
  const cols = Math.max(1, Math.floor(width / w));
  const rows = [];
  for (let i = 0; i < names.length; i += cols) rows.push(names.slice(i, i + cols).map((n, j) => (j === cols - 1 ? n : n.padEnd(w))).join('').trimEnd());
  return rows.join('\n');
}

function TerminalView({ term, active, onExit }) {
  useLanguage();
  const [entries, setEntries] = useState(() => (Array.isArray(term.buffer) ? term.buffer : []));
  const [git, setGit] = useState(null);
  const [input, setInput] = useState('');
  const [hist, setHist] = useState({ list: [], idx: -1 });
  const outRef = useRef(null);
  const inputRef = useRef(null);
  const seqRef = useRef(term.seq || 0);
  const cwdRef = useRef(term.cwd);
  const gitRef = useRef(null);
  const [cwd, setCwd] = useState(term.cwd);
  const [idle, setIdle] = useState(true);
  const idleRef = useRef(true);
  const [exited, setExited] = useState(false);
  const busyRef = useRef(false);
  const cmdSentRef = useRef(false);   // a command went to the shell since the last git status

  // The git status of the current directory: the prompt never appears bare
  // and then grows a git block — while the first status of a directory is
  // being read the prompt waits; after that (a command finished in the same
  // directory) the prompt is drawn at once with the last known state and
  // recoloured only if the fresh status differs (a
  // status of a big repository takes a few hundred ms). A stale answer is ignored.
  const [gitReady, setGitReady] = useState(false);
  const [gitStale, setGitStale] = useState(false);
  const gitSeq = useRef(0);
  const gitCwdRef = useRef(null);   // directory the current git state belongs to
  const refreshGit = useCallback(() => {
    const my = ++gitSeq.current;
    const dir = cwdRef.current;
    if (gitCwdRef.current === dir && gitRef.current !== undefined) setGitStale(true); else { setGitReady(false); setGitStale(false); }
    call('git.status', { cwd: dir }).then((g) => { if (my !== gitSeq.current) return; gitRef.current = g; gitCwdRef.current = dir; setGit(g); setGitReady(true); setGitStale(false); })
      .catch(() => { if (my !== gitSeq.current) return; gitRef.current = null; gitCwdRef.current = dir; setGit(null); setGitReady(true); setGitStale(false); });
  }, []);
  const append = useCallback((text) => setEntries((prev) => appendText(prev, text)), []);
  // A line typed at the prompt (or, while a command runs, fed to it).
  const echo = useCallback((line) => {
    if (idleRef.current) setEntries((prev) => trimEntries([...prev, { k: 'cmd', shell: term.shell, cwd: cwdRef.current, git: gitRef.current, line }]));
    else append(line + '\n');
  }, [append, term.shell]);

  // Read the shell output while the tab is visible: a long poll, answered
  // the moment there is output, the prompt comes back or the shell exits.
  useEffect(() => {
    if (!active) return undefined;
    let stop = false;
    const loop = async () => {
      while (!stop) {
        try {
          const r = await call('term.read', { id: term.id, since: seqRef.current, idle: idleRef.current, wait: WAIT_MS });
          if (stop) return;
          if (!r) { setExited(true); return; }
          if (r.chunks.length) { seqRef.current = r.seq; append(r.chunks.map((c) => c.text).join('')); }
          const idleNow = r.idle !== false;
          const cwdChanged = r.cwd !== cwdRef.current;
          if (cwdChanged) { cwdRef.current = r.cwd; setCwd(r.cwd); }
          if (idleNow !== idleRef.current) { idleRef.current = idleNow; setIdle(idleNow); }
          // The git status is re-read when a command has finished — the shell is idle again after a command was
          // sent (a fast command without output never shows as busy, so the sent flag is what counts) — or the
          // directory changed.
          const idleChanged = idleChangedTo(r);   // tracked on every answer, busy ones included
          if (cwdChanged || (idleNow && (idleChanged || cmdSentRef.current))) { cmdSentRef.current = false; refreshGit(); }
          if (r.exited) { if (!exited) { setExited(true); onExit(term.id); } return; }
        } catch { await new Promise((res) => setTimeout(res, 300)); }
      }
    };
    let lastIdle = idleRef.current;
    const idleChangedTo = (r) => { const now = r.idle !== false; const changed = now !== lastIdle; lastIdle = now; return changed; };
    loop();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, term.id]);

  useEffect(() => { refreshGit(); }, [refreshGit]);
  useEffect(() => { term.buffer = entries; term.seq = seqRef.current; }, [entries, term]);
  useEffect(() => { const el = outRef.current; if (el) el.scrollTop = el.scrollHeight; }, [entries, input, idle]);
  useEffect(() => { if (active && inputRef.current) inputRef.current.focus(); }, [active]);

  const run = async (line) => {
    const cmd = line.trim();
    echo(line);
    if (!cmd) { await call('term.run', { id: term.id, line: '' }); return; }
    setHist((h) => ({ list: [...h.list.filter((x) => x !== cmd), cmd].slice(-100), idx: -1 }));
    if (idleRef.current && (cmd === 'clear' || cmd === 'cls')) { setEntries([]); await call('term.run', { id: term.id, line: '' }); return; }
    cmdSentRef.current = true;
    await call('term.run', { id: term.id, line: cmd });
  };

  // Tab: complete the word at the cursor — a single candidate is inserted (a
  // space after a file / command, nothing after a directory so the next Tab
  // goes on inside it), several share their common prefix, and when that
  // adds nothing the candidates are listed under the prompt.
  const complete = async () => {
    const el = inputRef.current;
    const line = input;
    const cursor = el ? el.selectionStart : line.length;
    let r;
    try { r = await call('term.complete', { id: term.id, line, cursor }); } catch { return; }
    if (!r || !r.items.length) return;
    const tail = line.slice(cursor);
    const put = (text, done) => {
      const q = r.quoted || /\s/.test(text);
      const rep = (q ? '"' : '') + text + (done && q ? '"' : '') + (done ? ' ' : '');
      const next = line.slice(0, r.start) + rep + tail;
      setInput(next);
      const pos = next.length - tail.length;
      requestAnimationFrame(() => { if (inputRef.current) inputRef.current.setSelectionRange(pos, pos); });
    };
    if (r.items.length === 1) { put(r.items[0].text, !r.items[0].dir); return; }
    if (r.lcp.length > r.word.length) { put(r.lcp, false); return; }
    const out = outRef.current;
    let width = 80;
    if (out) {
      const c = document.createElement('canvas').getContext('2d');
      c.font = getComputedStyle(out).font;
      const cw = c.measureText('MMMMMMMMMM').width / 10 || 8;
      width = Math.max(20, Math.floor((out.clientWidth - 24) / cw));
    }
    echo(line);
    append(columns(r.items.map((i) => i.text), width) + '\n');
  };

  const onKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); const v = input; setInput(''); run(v); }
    else if (e.key === 'Tab') { e.preventDefault(); complete(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHist((h) => { const i = h.idx < 0 ? h.list.length - 1 : Math.max(0, h.idx - 1); if (h.list[i] !== undefined) setInput(h.list[i]); return { ...h, idx: i }; }); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setHist((h) => { if (h.idx < 0) return h; const i = h.idx + 1; if (i >= h.list.length) { setInput(''); return { ...h, idx: -1 }; } setInput(h.list[i]); return { ...h, idx: i }; }); }
    else if (e.key === 'c' && e.ctrlKey && !input) { e.preventDefault(); call('term.write', { id: term.id, data: '\x03' }).catch(() => {}); }
    else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); setEntries([]); }
  };

  return (
    <div className={`term-view ${active ? '' : 'hidden'}`}>
      <pre className="term-out selectable" ref={outRef} onClick={() => { if (!window.getSelection().toString() && inputRef.current) inputRef.current.focus(); }}>
        {entries.map((e, i) => (e.k === 'cmd'
          ? <React.Fragment key={i}><Prompt cwd={e.cwd} git={e.git} />{e.line}{'\n'}</React.Fragment>
          : <React.Fragment key={i}><AnsiText text={e.text} /></React.Fragment>))}
        {!exited && idle && gitReady && <Prompt cwd={cwd} git={git} stale={gitStale} />}
        {!exited && (
          <span className="term-inline" data-value={input}>
            <input ref={inputRef} value={input} title={t('term_placeholder')} spellCheck={false} autoComplete="off" autoCapitalize="off"
              onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} />
          </span>
        )}
      </pre>
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
