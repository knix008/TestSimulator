// Terminal panel (보기 › 터미널, Ctrl+`): several shell sessions as tabs, each
// a line-oriented console — the output of the shell (core/terminal.js,
// polled through term.read) ending with a prompt drawn by the panel, where
// the command is typed (history with ↑ / ↓, Tab completion through
// term.complete). The prompt is drawn from the prompt theme in the settings
// (settings › terminal › prompt — src/lib/prompt.js;
// components/Prompt.jsx draws it): by default coloured segments for the
// directory and, inside a git repository, the branch coloured by the state
// of the repository with one symbol per kind of change. Typed lines stay in
// the output with their prompt as it was. While a command runs the prompt is
// absent and typed lines go to that command's stdin.
//
// Line endings (settings › terminal): a lone CR in the output — a progress
// bar redrawing its line — either overwrites the line (as a terminal does),
// breaks it, or is dropped (termCr); the line ending Enter sends to a running
// program is the shell's own, LF or CRLF (termEol).
//
// Terminal / Log / Problems tabs follow the toolbar buttons (showTerminal /
// showLog / showLint). Each button is independent; only the on tabs appear.
// The ⚙ at the right end belongs to the tab shown: the terminal settings on
// the terminal tab, the checker settings on the Problems one.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { call } from '../lib/backend';
import { Icon } from './Icons';
import { ContextMenu } from './ContextMenu';
import { AnsiText } from '../lib/ansi.jsx';
import { Prompt } from './Prompt';
import { mergeOutput } from '../lib/termtext';
import { LintPanel } from './LintPanel';
import { LogPanel } from './LogPanel';

const WAIT_MS = 1500;   // long poll: the backend answers as soon as something happens, or after this
const STATUS_WAIT_MS = 700;   // the prompt waits this long for a fresh git status before showing the last known one
const MAX_LINES = 3000;

// The git summary for the prompt's tooltip; the prompt itself comes from the theme.
function gitClass(git) {
  if (!git || !git.repo) return '';
  return git.conflicts ? 'conflict' : git.staged ? 'staged' : git.changed ? 'modified' : git.ahead ? 'ahead' : git.behind ? 'behind' : 'uptodate';
}
function TermPrompt({ config, env, shell, cwd, git, rc, ms, at, stale = false }) {
  const repo = git && git.repo;
  const cls = gitClass(git);
  const tip = repo
    ? `${git.branch || '(detached)'}${git.upstream ? ` → ${git.upstream}` : ''} — ${t(`term_gs_${cls}`)}\n${git.ahead} ${t('term_git_ahead')} · ${git.behind} ${t('term_git_behind')} · ${git.conflicts ? `${t('term_git_conflicts', { n: git.conflicts })} · ` : ''}${t('term_git_changes', { staged: git.staged, changed: git.changed, untracked: git.untracked })}`
    : `${cwd}\n${t('term_no_git')}`;
  const state = useMemo(() => ({ cwd, git, rc: rc || 0, ms: ms || 0, now: at ? new Date(at) : new Date(), home: env.home, user: env.user, host: env.host, platform: env.platform, shell, root: false }),
    [cwd, git, rc, ms, at, env, shell]);
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
function appendText(entries, text, mode) {
  if (!text) return entries;
  const last = entries[entries.length - 1];
  const next = last && last.k === 'out' ? [...entries.slice(0, -1), { k: 'out', text: mergeOutput(last.text, text, mode) }] : [...entries, { k: 'out', text: mergeOutput('', text, mode) }];
  return trimEntries(next);
}
// A CR left pending at the end of the output when a prompt follows: nothing comes after it, so it is dropped.
function settle(entries) {
  const last = entries[entries.length - 1];
  return last && last.k === 'out' && last.text.endsWith('\r') ? [...entries.slice(0, -1), { k: 'out', text: last.text.slice(0, -1) }] : entries;
}

// Candidates listed like a shell does: in columns as wide as the panel allows.
function columns(names, width) {
  const w = Math.max(...names.map((n) => n.length)) + 2;
  const cols = Math.max(1, Math.floor(width / w));
  const rows = [];
  for (let i = 0; i < names.length; i += cols) rows.push(names.slice(i, i + cols).map((n, j) => (j === cols - 1 ? n : n.padEnd(w))).join('').trimEnd());
  return rows.join('\n');
}

function TerminalView({ term, active, onExit, prompt, env, termEol, termCr, termColor = true }) {
  useLanguage();
  const [entries, setEntries] = useState(() => (Array.isArray(term.buffer) ? term.buffer : []));
  const [git, setGit] = useState(null);
  const [input, setInput] = useState('');
  const [hist, setHist] = useState({ list: [], idx: -1, draft: '' });
  const outRef = useRef(null);
  const inputRef = useRef(null);
  const seqRef = useRef(term.seq || 0);
  const cwdRef = useRef(term.cwd);
  const gitRef = useRef(null);
  const [cwd, setCwd] = useState(term.cwd);
  const [idle, setIdle] = useState(true);
  const idleRef = useRef(true);
  const [exited, setExited] = useState(false);
  const cmdSentRef = useRef(false);   // a command went to the shell since the last git status
  const lastCmdRef = useRef(undefined);   // that command (undefined: none — a fresh status is read)
  const crRef = useRef(termCr); crRef.current = termCr;
  const eolRef = useRef(termEol); eolRef.current = termEol;
  // Status of the last command (from the shell marker) and how long it ran — the prompt's status / executiontime segments.
  const [rc, setRc] = useState(0);
  const [ms, setMs] = useState(0);
  const rcRef = useRef(0);
  const msRef = useRef(0);
  const startedRef = useRef(0);

  // The git status of the current directory: the prompt is drawn once, with
  // the fresh state — while the status is being read (after every command and
  // on a directory change) the prompt line stays invisible, so it never
  // appears in one colour and then jumps to another. A status of a big
  // repository can take a while: after STATUS_WAIT_MS the prompt is shown with
  // the last known state and recoloured when the answer comes. A stale
  // answer (an older request) is ignored.
  const [gitReady, setGitReady] = useState(false);
  const [gitStale, setGitStale] = useState(false);
  const gitSeq = useRef(0);
  const gitCwdRef = useRef(null);   // directory the current git state belongs to
  const gitTimer = useRef(null);
  const refreshGit = useCallback(() => {
    const my = ++gitSeq.current;
    const dir = cwdRef.current;
    setGitReady(false); setGitStale(false);
    clearTimeout(gitTimer.current);
    if (gitCwdRef.current === dir && gitRef.current !== undefined) gitTimer.current = setTimeout(() => { if (my === gitSeq.current) { setGitStale(true); setGitReady(true); } }, STATUS_WAIT_MS);
    const done = (g) => { if (my !== gitSeq.current) return; clearTimeout(gitTimer.current); gitRef.current = g; gitCwdRef.current = dir; setGit(g); setGitReady(true); setGitStale(false); };
    // The command that just ran goes along: after a read-only one the backend answers from its cache at once.
    call('git.status', { cwd: dir, cmd: lastCmdRef.current }).then(done).catch(() => done(null));
    lastCmdRef.current = undefined;
  }, []);
  const append = useCallback((text) => setEntries((prev) => appendText(prev, text, crRef.current)), []);
  // A line typed at the prompt (or, while a command runs, fed to it).
  const echo = useCallback((line) => {
    if (idleRef.current) setEntries((prev) => trimEntries([...settle(prev), { k: 'cmd', shell: term.shell, cwd: cwdRef.current, git: gitRef.current, rc: rcRef.current, ms: msRef.current, at: Date.now(), line }]));
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
          if (!r) { onExit(term.id); await new Promise((res) => setTimeout(res, 400)); continue; }
          if (r.chunks.length) { seqRef.current = r.seq; append(r.chunks.map((c) => c.text).join('')); }
          const idleNow = r.idle !== false;
          const cwdChanged = r.cwd !== cwdRef.current;
          if (cwdChanged) { cwdRef.current = r.cwd; setCwd(r.cwd); }
          if (idleNow !== idleRef.current) {
            idleRef.current = idleNow; setIdle(idleNow);
            if (idleNow && startedRef.current) { const took = Date.now() - startedRef.current; startedRef.current = 0; msRef.current = took; setMs(took); }
          }
          if (typeof r.rc === 'number' && r.rc !== rcRef.current) { rcRef.current = r.rc; setRc(r.rc); }
          // The git status is re-read when a command has finished — the shell is idle again after a command was
          // sent (a fast command without output never shows as busy, so the sent flag is what counts) — or the
          // directory changed.
          const idleChanged = idleChangedTo(r);   // tracked on every answer, busy ones included
          if (cwdChanged || (idleNow && (idleChanged || cmdSentRef.current))) { cmdSentRef.current = false; refreshGit(); }
          if (r.exited) { setExited(false); idleRef.current = true; setIdle(true); }
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
  useEffect(() => { const el = outRef.current; if (el) el.scrollTop = el.scrollHeight; }, [entries, input, idle, gitReady]);
  useEffect(() => { if (active && inputRef.current) inputRef.current.focus(); }, [active]);

  const run = async (line) => {
    const wasIdle = idleRef.current;
    const cmd = wasIdle ? line.trim() : line;
    echo(line);
    if (wasIdle) {
      startedRef.current = Date.now();
      if (!cmd) { await call('term.run', { id: term.id, line: '' }); return; }
      setHist((h) => ({ list: [...h.list.filter((x) => x !== cmd), cmd].slice(-200), idx: -1, draft: '' }));
      if (cmd === 'clear' || cmd === 'cls') { setEntries([]); await call('term.run', { id: term.id, line: '' }); return; }
      cmdSentRef.current = true; lastCmdRef.current = cmd;
    }
    try { await call('term.run', { id: term.id, line: cmd, eol: eolRef.current }); } catch (err) { append(`\n[${err.message}]\n`); }
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
    } else if (e.key === 'c' && e.ctrlKey && !input) { e.preventDefault(); call('term.write', { id: term.id, data: '\x03' }).catch(() => {}); }
    else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); setEntries([]); }
    else if (e.key === 'Escape') { setInput(''); }
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
    ? <React.Fragment key={i}><TermPrompt config={prompt} env={env} shell={term.shell} cwd={e.cwd} git={e.git} rc={e.rc} ms={e.ms} at={e.at} />{e.line}{'\n'}</React.Fragment>
    : <React.Fragment key={i}><AnsiText text={e.text.endsWith('\r') ? e.text.slice(0, -1) : e.text} color={termColor} /></React.Fragment>)), [entries, prompt, env, term.shell, termColor]);   // a CR still pending is not drawn

  return (
    <div className={`term-view ${active ? '' : 'hidden'}`}>
      <pre className="term-out selectable" ref={outRef} onClick={() => { if (!window.getSelection().toString() && inputRef.current) inputRef.current.focus(); }}>
        {transcript}
        <span className={`term-live ${idle && !gitReady ? 'pending' : ''}`}>
          {idle && gitReady && <TermPrompt config={prompt} env={env} shell={term.shell} cwd={cwd} git={git} rc={rc} ms={ms} stale={gitStale} />}
          <span className="term-inline" data-value={input}>
            <input ref={inputRef} value={input} title={t('term_placeholder')} spellCheck={false} autoComplete="off" autoCapitalize="off" autoCorrect="off"
              onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} onPaste={onPaste} />
          </span>
        </span>
      </pre>
    </div>
  );
}

export function TerminalPanel({
  terms, activeId, shells, onActivate, onNew, onClose, onHide, onExit, onSettings, height, onResizeStart,
  prompt, env, termEol, termCr, termColor = true,
  panel = 'terminal', panels, onPanel,
  lintDoc, lint, lintEnabled, onLintGoto, onLintRefresh, onLintSettings,
  logEntries, onLogClear,
}) {
  useLanguage();
  const [menu, setMenu] = useState(null);
  const [shellList, setShellList] = useState(shells);
  useEffect(() => { setShellList(shells); }, [shells]);
  const openShellMenu = (e) => {
    setMenu(e.currentTarget);
    call('term.shells', { refresh: true }).then((x) => { if (Array.isArray(x)) setShellList(x); }).catch(() => {});
  };
  const shellItems = shellList.map((s) => ({ id: `shell:${s.id}`, label: s.label, icon: 'terminal' }));
  const open = {
    terminal: !!(panels && panels.terminal),
    log: !!(panels && panels.log),
    lint: !!(panels && panels.lint),
  };
  const openTabs = ['terminal', 'log', 'lint'].filter((id) => open[id]);
  const tab = openTabs.includes(panel) ? panel : (openTabs[0] || 'terminal');
  const lintCount = lint && lint.total ? lint.total : 0;
  const mode = (id) => `panel-mode ${tab === id ? 'active' : ''}`;
  return (
    <div className="term-panel" style={{ height }}>
      <div className="h-splitter" onMouseDown={onResizeStart} />
      <div className="term-head">
        <div className="panel-modes" role="tablist" data-tab={tab}>
          {open.terminal && <button type="button" className={mode('terminal')} onClick={() => onPanel && onPanel('terminal')}><Icon name="terminal" size={14} /> {t('terminal')}</button>}
          {open.log && <button type="button" className={mode('log')} onClick={() => onPanel && onPanel('log')}><Icon name="log" size={14} /> {t('log_tab')}</button>}
          {open.lint && (
            <button type="button" className={mode('lint')} onClick={() => onPanel && onPanel('lint')}>
              <Icon name="lint" size={14} /> {t('lint_tab')}
              {lintCount > 0 ? <span className={`panel-badge ${lint.error ? 'err' : lint.warning ? 'warn' : ''}`}>{lintCount}</span> : null}
            </button>
          )}
        </div>
        {tab === 'terminal' && (
          <>
            <div className="term-tabs">
              {terms.map((tm) => (
                <div key={tm.id} className={`term-tab ${tm.id === activeId ? 'active' : ''}`} title={tm.cwd} onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); onClose(tm.id); } else onActivate(tm.id); }}>
                  <span className="ellipsis">{tm.title}</span>
                  <button className="tab-close" title={t('close')} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onClose(tm.id); }}><Icon name="close" size={12} /></button>
                </div>
              ))}
            </div>
            <button className="icon-btn" title={t('term_new')} onClick={() => onNew()}><Icon name="plus" size={15} /></button>
            {shellList.length > 0 && <button className="icon-btn" title={t('term_new_shell')} onClick={openShellMenu}><Icon name="chevronDown" size={14} /></button>}
          </>
        )}
        <span className="spacer" />
        {tab === 'terminal' && onSettings && <button className="icon-btn" title={t('term_settings')} onClick={onSettings}><Icon name="settings" size={14} /></button>}
        {tab === 'lint' && onLintSettings && <button className="icon-btn" title={t('lint_settings')} onClick={onLintSettings}><Icon name="settings" size={14} /></button>}
        <button className="icon-btn" title={t('term_hide')} onClick={onHide}><Icon name="close" size={15} /></button>
      </div>
      <div className="term-body">
        {tab === 'terminal' && terms.length === 0 && <div className="sb-empty"><Icon name="terminal" size={26} /><p>{t('term_empty')}</p><button className="btn" onClick={() => onNew()}>{t('term_new')}</button></div>}
        {tab === 'terminal' && terms.map((tm) => <TerminalView key={tm.id} term={tm} active={tm.id === activeId} onExit={onExit} prompt={prompt} env={env} termEol={termEol} termCr={termCr} termColor={termColor} />)}
        {tab === 'log' && <LogPanel entries={logEntries || []} onClear={onLogClear} />}
        {tab === 'lint' && <LintPanel doc={lintDoc} lint={lint} enabled={lintEnabled} onGoto={onLintGoto} onRefresh={onLintRefresh} />}
      </div>
      {menu && <ContextMenu anchorEl={menu} above x={0} y={0} items={shellItems} onClose={() => setMenu(null)} onPick={(id) => { setMenu(null); onNew(id.slice(6)); }} />}
    </div>
  );
}

export default TerminalPanel;
