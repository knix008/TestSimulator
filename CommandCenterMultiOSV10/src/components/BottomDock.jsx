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
import { call, writeClipboardText } from '../lib/backend';
import { AnsiText } from '../lib/ansi.jsx';
import { Icon } from './Icons';
import { Prompt } from './Prompt';
import { ContextMenu } from './ContextMenu';

const WAIT_MS = 1500;     // long poll: the backend answers as soon as something happens, or after this
const MAX_LINES = 10000;  // lines kept per terminal transcript (a long `git log` stays complete)

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

// The prompt is drawn by components/Prompt.jsx from the prompt theme in the
// settings (session.prompt — oh-my-posh compatible, see lib/prompt.js); the
// tooltip keeps the git summary of the classic prompt.
function TermPrompt({ config, env, term, cwd, git, rc, ms, at, stale = false }) {
  const repo = git && git.repo;
  const cls = gitClass(git);
  const tip = repo ? t('term_git_tip', {
    branch: git.branch || '(detached)', upstream: git.upstream ? ` → ${git.upstream}` : '', state: t(`term_git_${cls}`),
    ahead: git.ahead, behind: git.behind, staged: git.staged, changed: git.changed, untracked: git.untracked, conflicts: git.conflicts,
  }) : cwd;
  const state = useMemo(() => ({ cwd, git, rc: rc || 0, ms: ms || 0, now: at ? new Date(at) : new Date(), home: env.home, user: env.user, host: env.host, platform: env.platform, shell: term.shell, root: false }),
    [cwd, git, rc, ms, at, env, term.shell]);
  return <Prompt config={config} state={state} stale={stale} title={tip} />;
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

function TerminalView({ term, active, onExit, prompt, env, themeId }) {
  useLanguage();
  const [entries, setEntries] = useState(() => (Array.isArray(term.buffer) ? term.buffer : []));
  const [git, setGit] = useState(term.git === undefined ? null : term.git);
  const [input, setInput] = useState('');
  const [hist, setHist] = useState({ list: [], idx: -1, draft: '' });
  const outRef = useRef(null);
  const inputRef = useRef(null);
  const seqRef = useRef(term.seq || 0);
  const cwdRef = useRef(term.cwd);
  const gitRef = useRef(term.git);
  const [cwd, setCwd] = useState(term.cwd);
  const [idle, setIdle] = useState(term.idle !== false);
  const idleRef = useRef(term.idle !== false);
  const [exited, setExited] = useState(!!term.exited);
  const cmdSentRef = useRef(false);   // a command went to the shell since the last git status
  // Status of the last command (from the shell marker) and how long it ran — the prompt's status / executiontime segments.
  const [rc, setRc] = useState(term.rc || 0);
  const [ms, setMs] = useState(term.ms || 0);
  const rcRef = useRef(term.rc || 0);
  const msRef = useRef(term.ms || 0);
  const startedRef = useRef(0);

  // The git status of the current directory (as in MyEditor): the prompt
  // never appears bare and then grows a git block — while the first status
  // of a directory is being read the prompt waits; after that (a command
  // finished in the same directory) the prompt is drawn at once with the last
  // known state and recoloured only if the fresh status differs (a status of
  // a big repository takes a few hundred ms). A stale answer is ignored.
  const [gitReady, setGitReady] = useState(term.gitCwd === term.cwd);
  const [gitStale, setGitStale] = useState(false);
  const gitSeq = useRef(0);
  const gitCwdRef = useRef(term.gitCwd || null);   // directory the current git state belongs to
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
    if (idleRef.current) setEntries((prev) => trimEntries([...prev, { k: 'cmd', cwd: cwdRef.current, git: gitRef.current, rc: rcRef.current, ms: msRef.current, at: Date.now(), line }]));
    else append(line + '\n');
  }, [append]);

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
          if (cwdChanged) { cwdRef.current = r.cwd; setCwd(r.cwd); term.cwd = r.cwd; }
          if (idleNow !== idleRef.current) {
            idleRef.current = idleNow; setIdle(idleNow); term.idle = idleNow;
            if (idleNow && startedRef.current) { const took = Date.now() - startedRef.current; startedRef.current = 0; msRef.current = took; setMs(took); term.ms = took; }
          }
          if (typeof r.rc === 'number' && r.rc !== rcRef.current) { rcRef.current = r.rc; setRc(r.rc); term.rc = r.rc; }
          // The git status is re-read when a command has finished — the shell is idle again after a command was
          // sent (a fast command without output never shows as busy, so the sent flag is what counts) — or the
          // directory changed.
          const idleChanged = idleChangedTo(r);   // tracked on every answer, busy ones included
          if (cwdChanged || (idleNow && (idleChanged || cmdSentRef.current))) {
            cmdSentRef.current = false;
            refreshGit();
            // The prompt is back: if nothing else took the focus meanwhile, typing continues here.
            const el = inputRef.current, ae = document.activeElement;
            if (el && (!ae || ae === document.body || (outRef.current && outRef.current.contains(ae)))) el.focus({ preventScroll: true });
          }
          if (r.exited) { if (!exited) { setExited(true); term.exited = true; onExit(term.id); } return; }
        } catch { await new Promise((res) => setTimeout(res, 300)); }
      }
    };
    let lastIdle = idleRef.current;
    const idleChangedTo = (r) => { const now = r.idle !== false; const changed = now !== lastIdle; lastIdle = now; return changed; };
    loop();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, term.id]);

  useEffect(() => { if (!gitReady) refreshGit(); }, [refreshGit]);   // eslint-disable-line react-hooks/exhaustive-deps
  // Keep the transcript and the git state on the tab object so they survive switching tabs.
  useEffect(() => { term.buffer = entries; term.seq = seqRef.current; term.git = git; term.gitCwd = gitReady ? gitCwdRef.current : null; }, [entries, git, gitReady, term]);
  useEffect(() => { const el = outRef.current; if (el) el.scrollTop = el.scrollHeight; }, [entries, input, idle, gitReady]);
  useEffect(() => { if (active && inputRef.current) inputRef.current.focus(); }, [active]);

  const run = async (line) => {
    const cmd = idleRef.current ? line.trim() : line;
    echo(line);
    if (idleRef.current) {
      startedRef.current = Date.now();
      if (!cmd) return;
      setHist((h) => ({ list: [...h.list.filter((x) => x !== cmd), cmd].slice(-200), idx: -1, draft: '' }));
      if (cmd === 'clear' || cmd === 'cls') { setEntries([]); return; }
      cmdSentRef.current = true;
    }
    try { await call('term.run', { id: term.id, line: cmd }); } catch (err) { append(`\n[${err.message}]\n`); }
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
    ? <React.Fragment key={i}><TermPrompt config={prompt} env={env} term={term} cwd={e.cwd} git={e.git} rc={e.rc} ms={e.ms} at={e.at} />{e.line}{'\n'}</React.Fragment>
    : <React.Fragment key={i}><AnsiText text={e.text} /></React.Fragment>)), [entries, prompt, env, themeId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`dock-view term-view ${active ? '' : 'hidden'}`}>
      <pre className="term-out selectable" ref={outRef} onClick={() => { if (!window.getSelection().toString() && inputRef.current) inputRef.current.focus(); }}>
        {transcript}
        {!exited && (
          // While the first git status of a directory is being read the prompt line is kept invisible
          // (opacity, not unmounted or visibility:hidden: the input keeps the focus and what is typed meanwhile).
          <span className={`term-live ${idle && !gitReady ? 'pending' : ''}`}>
            {idle && gitReady && <TermPrompt config={prompt} env={env} term={term} cwd={cwd} git={git} rc={rc} ms={ms} stale={gitStale} />}
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
export function BottomDock({ tab, onTab, log, onClearLog, onCopyLog, terms, shells, onNewTerm, onCloseTerm, onTermExit, onHide, height, onResizeStart, prompt, env, themeId }) {
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
        {terms.map((tm) => <TerminalView key={tm.id} term={tm} active={tab === tm.id} onExit={onTermExit} prompt={prompt} env={env} themeId={themeId} />)}
      </div>
      {menu && <ContextMenu anchorEl={menu} x={0} y={0} items={shellItems} onClose={() => setMenu(null)} onPick={(id) => { setMenu(null); onNewTerm(id.slice(6)); }} />}
    </div>
  );
}

export default BottomDock;
