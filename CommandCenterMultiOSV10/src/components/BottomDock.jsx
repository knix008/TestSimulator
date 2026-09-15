// Bottom dock (보기 › 하단 패널, Ctrl+`): a tab strip with the operation log
// first and one tab per terminal after it. Any number of terminals can be
// opened with "+" (or "+ ▾" to pick the shell); each starts in the active
// panel's folder.
//
// A terminal is the same line-oriented console as MyEditor's terminal panel:
// the shell's output (core/terminal.js, fetched through term.read while the
// tab is visible) ending with an oh-my-posh style prompt where the command
// is typed.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { call, writeClipboardText, onTerminalUpdate } from '../lib/backend';
import { Icon } from './Icons';
import { ContextMenu } from './ContextMenu';

// Polling: fast while a command runs or the prompt waits for git, slow when
// idle. On the desktop the host also pushes updates, so the poll is only a
// safety net there.
const POLL_BUSY_MS = 50;
const POLL_IDLE_MS = 250;
const MAX_LINES = 10000;  // lines kept per terminal transcript (a long `git log` stays complete)
const GIT_WAIT_MS = 2000; // the prompt waits this long for git status before showing without it

function timeOf(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ── Log tab ──
function LogView({ entries, onClear, onCopy }) {
  useLanguage();
  const ref = useRef(null);
  const stick = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [entries]);
  const onScroll = () => {
    const el = ref.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
  };
  return (
    <div className="dock-view">
      <div className="log-out selectable" ref={ref} onScroll={onScroll}>
        {entries.length === 0 && <div className="dock-empty"><Icon name="log" size={26} /><p>{t('log_empty')}</p></div>}
        {entries.map((e) => (
          <div key={e.id} className={`log-line ${e.level}`}>
            <span className="log-time">{timeOf(e.ts)}</span>
            <span className="log-text">{e.text}</span>
          </div>
        ))}
      </div>
      <div className="dock-foot">
        <span className="muted small">{entries.length}</span>
        <span className="spacer" />
        <button className="dock-btn" onClick={onCopy} disabled={!entries.length}><Icon name="clipboard" size={13} /> {t('log_copy')}</button>
        <button className="dock-btn" onClick={onClear} disabled={!entries.length}><Icon name="eraser" size={13} /> {t('log_clear')}</button>
      </div>
    </div>
  );
}

// ── Terminal tab (the same console as MyEditor's TerminalPanel) ──
//
// The shell's output ends with a prompt drawn here, oh-my-posh style:
// coloured powerline segments for the directory and, inside a git
// repository, the branch with ahead / behind and the number of staged /
// changed / untracked files. The command is typed in an <input> placed inline
// right after the prompt (history with ↑ / ↓, Tab completion through
// term.complete). Typed lines stay in the output with their prompt as it
// was. While a command runs the prompt is absent and typed lines go to that
// command's stdin.

// One prompt: [ 📁 dir ]▶[ ⎇ main ↑ + ~ ? ]▶ — the command is typed right after the last arrow.
// The git block is drawn exactly as in MyEditor's TerminalPanel: the state of
// the repository colours the whole block, from the branch name on (the first
// that applies):
//   conflicts — red · staged (added) — yellow · modified files — red ·
//   committed but not pushed — yellow · behind the remote — blue · clean and pushed — bright green.
// Untracked files do not colour the block (they are new files git does not
// know yet, shown by the ? symbol only); otherwise a committed-but-not-pushed
// or pushed repository would stay red because of them. After the branch one
// bold symbol per kind of status that applies — no counts:
//   ↑ ahead · ↓ behind · + staged · ~ changed · ? untracked · ! conflicts
function gitClass(git) {
  if (!git || !git.repo) return '';
  return git.conflicts ? 'conflict' : git.staged ? 'staged' : git.changed ? 'modified' : git.ahead ? 'ahead' : git.behind ? 'behind' : 'uptodate';
}

function Prompt({ cwd, git }) {
  const repo = git && git.repo;
  const dirty = repo ? git.staged + git.changed + git.untracked + git.conflicts > 0 : false;
  const cls = gitClass(git);
  const tip = repo ? t('term_git_tip', {
    branch: git.branch || '(detached)', upstream: git.upstream ? ` → ${git.upstream}` : '', state: t(`term_git_${cls}`),
    ahead: git.ahead, behind: git.behind, staged: git.staged, changed: git.changed, untracked: git.untracked, conflicts: git.conflicts,
  }) : cwd;
  return (
    <span className="term-prompt" title={cwd}>
      <span className="seg seg-path"><Icon name="folder" size={12} /> {cwd}</span>
      {repo && (
        <span className={`seg seg-git ${cls}`} title={tip}>
          <span className="g-branch"><Icon name="gitBranch" size={12} /> {git.branch || '(detached)'}</span>
          {(git.ahead > 0 || git.behind > 0 || dirty) && ' '}
          {git.ahead > 0 && <span className="g-ahead">↑</span>}{git.behind > 0 && <span className="g-behind">↓</span>}
          {git.staged > 0 && <span className="g-staged">+</span>}{git.changed > 0 && <span className="g-changed">~</span>}
          {git.untracked > 0 && <span className="g-untracked">?</span>}{git.conflicts > 0 && <span className="g-conflict">!</span>}
        </span>
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
  const [git, setGit] = useState(term.git || null);
  // The folder `git` was computed for. The prompt is drawn only once the git
  // state of the current folder is known, so it appears complete — not the
  // path first and the git segment a moment later.
  const [gitDir, setGitDir] = useState(term.gitDir || null);
  const [input, setInput] = useState('');
  const [hist, setHist] = useState({ list: [], idx: -1, draft: '' });
  const outRef = useRef(null);
  const inputRef = useRef(null);
  const seqRef = useRef(term.seq || 0);
  const cwdRef = useRef(term.cwd);
  const gitRef = useRef(term.git || null);
  const gitDirRef = useRef(term.gitDir || null);   // gitDir as a ref (kept in sync by takeGit/waitGit) for the poll scheduler
  const [cwd, setCwd] = useState(term.cwd);
  const [idle, setIdle] = useState(term.idle !== false);
  const idleRef = useRef(term.idle !== false);
  const [exited, setExited] = useState(!!term.exited);
  const busyRef = useRef(false);
  const pollRef = useRef({ tick: () => {}, schedule: () => {} });   // the poll loop, so `run` can read right away

  // Results for a folder the shell has already left are dropped (a refresh
  // for "command finished" can race with the one for "cwd changed").
  // The git state normally arrives with `term.read` (the host reads it as
  // soon as a command finishes). `waitGit` hides the prompt until the state
  // of the current folder is in — at most GIT_WAIT_MS, then it shows without.
  const gitTimer = useRef(null);
  const takeGit = useCallback((g) => { gitRef.current = g; setGit(g); gitDirRef.current = g ? g.dir : cwdRef.current; setGitDir(gitDirRef.current); clearTimeout(gitTimer.current); }, []);
  const waitGit = useCallback(() => {
    const dir = cwdRef.current;
    gitDirRef.current = null; setGitDir(null);
    clearTimeout(gitTimer.current);
    gitTimer.current = setTimeout(() => { if (cwdRef.current === dir && !gitDirRef.current) { gitDirRef.current = dir; setGitDir(dir); } }, GIT_WAIT_MS);
  }, []);
  // Re-read quietly (tab activation): the prompt stays while the answer comes.
  const refreshGit = useCallback(() => {
    const dir = cwdRef.current;
    call('git.status', { cwd: dir }).then((g) => { if (cwdRef.current === dir) takeGit({ ...g, dir }); }).catch(() => {});
  }, [takeGit]);
  useEffect(() => () => clearTimeout(gitTimer.current), []);
  const append = useCallback((text) => setEntries((prev) => appendText(prev, text)), []);
  // A line typed at the prompt (or, while a command runs, fed to it).
  const echo = useCallback((line) => {
    if (idleRef.current) setEntries((prev) => trimEntries([...prev, { k: 'cmd', cwd: cwdRef.current, git: gitRef.current, line }]));
    else append(line + '\n');
  }, [append]);

  // Read the shell while the tab is visible: at once when the host pushes an
  // update (desktop), and on a timer — fast while busy, slow when idle.
  useEffect(() => {
    if (!active) return undefined;
    let stop = false, again = false, timer = null;
    const tick = async () => {
      if (stop) return;
      if (busyRef.current) { again = true; return; }
      busyRef.current = true;
      try {
        const r = await call('term.read', { id: term.id, since: seqRef.current });
        if (stop || !r) return;
        if (r.chunks.length) { seqRef.current = r.seq; append(r.chunks.map((c) => c.text).join('')); }
        if (r.cwd !== cwdRef.current) { cwdRef.current = r.cwd; setCwd(r.cwd); term.cwd = r.cwd; waitGit(); }
        const idleNow = r.idle !== false;
        if (idleNow !== idleRef.current) {
          idleRef.current = idleNow; setIdle(idleNow); term.idle = idleNow;
          if (idleNow) {
            waitGit();
            // The prompt is back: if nothing else took the focus meanwhile, typing continues here.
            const el = inputRef.current, ae = document.activeElement;
            if (el && (!ae || ae === document.body || (outRef.current && outRef.current.contains(ae)))) el.focus({ preventScroll: true });
          }
        }
        // The git state the host read for the current folder (null while it is still reading).
        if (r.git && r.git.dir === r.cwd && (!gitRef.current || gitRef.current.seq !== r.git.seq)) takeGit(r.git);
        if (r.exited && !exited) { setExited(true); term.exited = true; onExit(term.id); }
      } catch { /* transient */ } finally {
        busyRef.current = false;
        if (again && !stop) { again = false; tick(); }
      }
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { tick().finally(schedule); }, idleRef.current && gitDirRef.current === cwdRef.current ? POLL_IDLE_MS : POLL_BUSY_MS); };
    pollRef.current = { tick, schedule };
    tick().finally(schedule);
    const unsub = onTerminalUpdate(term.id, () => { tick(); });
    return () => { stop = true; clearTimeout(timer); if (unsub) unsub(); pollRef.current = { tick: () => {}, schedule: () => {} }; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, term.id]);
  useEffect(() => { if (active && gitDirRef.current) refreshGit(); }, [active, refreshGit]);
  // Keep the transcript on the tab object so it survives switching tabs.
  useEffect(() => { term.buffer = entries; term.seq = seqRef.current; term.git = git; term.gitDir = gitDir; }, [entries, git, gitDir, term]);
  useEffect(() => { const el = outRef.current; if (el) el.scrollTop = el.scrollHeight; }, [entries, input, idle]);
  useEffect(() => { if (active && inputRef.current) inputRef.current.focus(); }, [active]);

  const run = async (line) => {
    const cmd = idleRef.current ? line.trim() : line;
    echo(line);
    if (idleRef.current) {
      if (!cmd) return;
      setHist((h) => ({ list: [...h.list.filter((x) => x !== cmd), cmd].slice(-200), idx: -1, draft: '' }));
      if (cmd === 'clear' || cmd === 'cls') { setEntries([]); return; }
      idleRef.current = false; setIdle(false); term.idle = false;   // the poll confirms it when the marker comes back
    }
    try { await call('term.run', { id: term.id, line: cmd }); } catch (err) { append(`\n[${err.message}]\n`); }
    // Read at once and keep reading fast: the idle timer may still be a long way off.
    pollRef.current.tick(); pollRef.current.schedule();
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
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') { e.preventDefault(); const v = input; setInput(''); run(v); }
    else if (e.key === 'Tab') { e.preventDefault(); complete(); }
    else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHist((h) => { if (!h.list.length) return h; const i = h.idx < 0 ? h.list.length - 1 : Math.max(0, h.idx - 1); setInput(h.list[i]); return { ...h, idx: i, draft: h.idx < 0 ? input : h.draft }; });
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHist((h) => { if (h.idx < 0) return h; const i = h.idx + 1; if (i >= h.list.length) { setInput(h.draft); return { ...h, idx: -1, draft: '' }; } setInput(h.list[i]); return { ...h, idx: i }; });
    } else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); setEntries([]); }
    else if (e.key === 'c' && e.ctrlKey) {
      // Copy the transcript selection (the input has nothing selected).
      const sel = String(window.getSelection() || '');
      if (sel && !input) { e.preventDefault(); writeClipboardText(sel); }
    } else if (e.key === 'Escape') { setInput(''); }
  };

  // Multi-line paste: every complete line is run, the rest stays typed.
  const onPaste = (e) => {
    const text = (e.clipboardData && e.clipboardData.getData('text')) || '';
    if (!text.includes('\n')) return;
    e.preventDefault();
    const el = inputRef.current;
    const before = input.slice(0, el ? el.selectionStart : input.length), after = input.slice(el ? el.selectionEnd : input.length);
    const parts = (before + text.replace(/\r/g, '') + after).split('\n');
    const rest = parts.pop();
    (async () => { for (const p of parts) await run(p); setInput(rest); })();
  };

  // The transcript only re-renders when it changes — not on every keystroke.
  const transcript = useMemo(() => entries.map((e, i) => (e.k === 'cmd'
    ? <React.Fragment key={i}><Prompt cwd={e.cwd} git={e.git} />{e.line}{'\n'}</React.Fragment>
    : <React.Fragment key={i}>{e.text}</React.Fragment>)), [entries]);

  return (
    <div className={`dock-view term-view ${active ? '' : 'hidden'}`}>
      <pre className="term-out selectable" ref={outRef} onClick={() => { if (!window.getSelection().toString() && inputRef.current) inputRef.current.focus(); }}>
        {transcript}
        {!exited && (
          // While the git state of the folder is still being read the prompt line is kept invisible
          // (opacity, not unmounted or visibility:hidden: the input keeps the focus and what is typed meanwhile).
          <span className={`term-live ${idle && gitDir !== cwd ? 'pending' : ''}`}>
            {idle && <Prompt cwd={cwd} git={gitDir === cwd ? git : null} />}
            <span className="term-inline" data-value={input}>
              <input ref={inputRef} value={input} title={t('term_placeholder')} spellCheck={false} autoComplete="off" autoCapitalize="off" autoCorrect="off"
                onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} onPaste={onPaste} />
            </span>
          </span>
        )}
      </pre>
    </div>
  );
}

// ── The dock ──
export function BottomDock({ tab, onTab, log, onClearLog, onCopyLog, terms, shells, onNewTerm, onCloseTerm, onTermExit, onHide, height, onResizeStart }) {
  useLanguage();
  const [menu, setMenu] = useState(null);
  const shellItems = shells.map((s) => ({ id: `shell:${s.id}`, label: s.label, icon: 'terminal' }));
  const tabDown = (e, id) => {
    if (e.button === 1 && id !== 'log') { e.preventDefault(); onCloseTerm(id); } else onTab(id);
  };
  return (
    <div className="dock" style={{ height }}>
      <div className="h-splitter" onMouseDown={onResizeStart} />
      <div className="dock-head">
        <div className="dock-tabs">
          <div className={`dock-tab ${tab === 'log' ? 'active' : ''}`} onMouseDown={(e) => tabDown(e, 'log')}>
            <Icon name="log" size={13} /><span>{t('log')}</span>
            {log.some((e) => e.level === 'error') && tab !== 'log' && <span className="dock-dot" />}
          </div>
          {terms.map((tm) => (
            <div key={tm.id} className={`dock-tab ${tab === tm.id ? 'active' : ''} ${tm.exited ? 'exited' : ''}`} title={tm.cwd} onMouseDown={(e) => tabDown(e, tm.id)}>
              <Icon name="terminal" size={13} /><span className="ellipsis">{tm.title}</span>
              <button className="tab-close" title={t('term_close')} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onCloseTerm(tm.id); }}><Icon name="close" size={11} /></button>
            </div>
          ))}
        </div>
        <button className="icon-btn" title={t('term_new')} onClick={() => onNewTerm()}><Icon name="plus" size={15} /></button>
        {shells.length > 1 && <button className="icon-btn" title={t('term_new_shell')} onClick={(e) => setMenu(e.currentTarget)}><Icon name="chevronDown" size={14} /></button>}
        <span className="spacer" />
        <button className="icon-btn" title={t('dock_hide')} onClick={onHide}><Icon name="close" size={15} /></button>
      </div>
      <div className="dock-body">
        {tab === 'log' && <LogView entries={log} onClear={onClearLog} onCopy={onCopyLog} />}
        {terms.length === 0 && tab !== 'log' && (
          <div className="dock-empty"><Icon name="terminal" size={26} /><p>{t('term_empty')}</p><button className="btn" onClick={() => onNewTerm()}>{t('term_new')}</button></div>
        )}
        {terms.map((tm) => <TerminalView key={tm.id} term={tm} active={tab === tm.id} onExit={onTermExit} />)}
      </div>
      {menu && <ContextMenu anchorEl={menu} x={0} y={0} items={shellItems} onClose={() => setMenu(null)} onPick={(id) => { setMenu(null); onNewTerm(id.slice(6)); }} />}
    </div>
  );
}

export default BottomDock;
