// 명령 창 / Command Window: the >> prompt, output (stdout, errors in red with
// clickable file:line links, warnings), history with ↑ / ↓ (filtered by what
// is typed), Tab completion from the engine, multi-line input (Shift+Enter, or
// automatic while a block is open), Ctrl+C to interrupt, input() prompts and
// the K>> prompt while the debugger is paused.
import React, { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, forwardRef } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { needsMoreInput, findFileLinks } from '../engine/protocol';
import { Icon } from '../components/Chrome';
import { copyText } from '../views/common';

let entrySeq = 0;

function Linked({ text, onLink }) {
  const links = findFileLinks(text);
  if (!links.length) return text;
  const out = [];
  let at = 0;
  links.forEach((l, i) => {
    if (l.start > at) out.push(text.slice(at, l.start));
    out.push(<a key={i} href="#" className="cw-link" onClick={(e) => { e.preventDefault(); onLink(l.file, l.line); }}>{text.slice(l.start, l.end)}</a>);
    at = l.end;
  });
  if (at < text.length) out.push(text.slice(at));
  return out;
}

export const CommandWindow = forwardRef(function CommandWindow({ engine, settings, busy, engineState, debug, onDebugReply, history, onHistoryAdd, onOpenLink }, ref) {
  useLanguage();
  const cmd = (settings && settings.cmd) || {};
  const entries = useRef([]);
  const [, setTick] = useState(0);
  const redraw = useCallback(() => setTick((n) => n + 1), []);
  const [text, setText] = useState('');
  const [inputReq, setInputReq] = useState(null); // { resolve, prompt }
  const [comp, setComp] = useState(null); // { items, index, from, to }
  const hist = useRef({ index: -1, prefix: '', draft: '' });
  const outRef = useRef(null);
  const inputRef = useRef(null);
  const queue = useRef([]);
  const stick = useRef(true);
  const maxEntries = Math.max(500, cmd.scrollback || 5000);

  const print = useCallback((str, stream = 'out') => {
    const s = String(str == null ? '' : str);
    if (!s) return;
    const list = entries.current;
    const last = list[list.length - 1];
    if (last && last.stream === stream && last.text.length < 4000 && !last.frames) last.text += s;
    else list.push({ id: ++entrySeq, stream, text: s });
    if (list.length > maxEntries) list.splice(0, list.length - maxEntries);
    redraw();
  }, [maxEntries, redraw]);

  const clear = useCallback(() => { entries.current = []; redraw(); }, [redraw]);

  const printError = useCallback((error) => {
    if (!error) return;
    const msg = error.message || error.identifier || t('cw_error_unknown');
    print(`${/^error/i.test(msg) ? '' : `${t('cw_error')}: `}${msg}\n`, 'err');
    const frames = Array.isArray(error.stack) ? error.stack : [];
    if (frames.length) {
      entries.current.push({ id: ++entrySeq, stream: 'err', text: '', frames });
      redraw();
    }
  }, [print, redraw]);

  // Engine output and session events.
  useEffect(() => {
    const offs = [
      engine.on('out', (m) => print(m.text, m.stream === 'err' ? 'err' : m.stream === 'warn' ? 'warn' : 'out')),
      engine.on('event:clc', () => clear()),
      engine.on('ready', (m) => { if (!m.ok) print(`${!m.error || /session\.js is missing/.test(m.error) ? t('cw_engine_not_installed') : m.error}\n`, 'warn'); }),
    ];
    return () => offs.forEach((f) => f());
  }, [engine, print, clear]);

  // input('prompt'): the next line typed answers it.
  useEffect(() => engine.onRequest('input', (msg) => new Promise((resolve) => {
    if (msg && msg.prompt) print(String(msg.prompt), 'out');
    setInputReq({ resolve, prompt: msg && msg.prompt });
    setTimeout(() => inputRef.current && inputRef.current.focus(), 0);
  })), [engine, print]);
  useEffect(() => engine.on('request.done', (m) => { if (m && m.interrupted) setInputReq(null); }), [engine]);

  const execute = useCallback(async (code, { echo = true, history: addHistory = true } = {}) => {
    if (echo) print(`${code.split('\n').map((l, i) => `${i ? '   ' : '>> '}${l}`).join('\n')}\n`, 'echo');
    if (addHistory && code.trim()) onHistoryAdd(code);
    if (engineState === 'error' || engineState === 'off') {
      if (/^\s*clc\s*;?\s*$/.test(code)) { clear(); return { ok: true }; }
      print(`${t('cw_engine_missing')}\n`, 'warn');
      return { ok: false };
    }
    const res = await engine.eval(code, { echo: true, history: addHistory });
    if (res && res.ok === false) printError(res.error);
    return res;
  }, [engine, engineState, print, printError, onHistoryAdd, clear]);

  // Commands typed while the engine is busy run one after the other.
  const runQueued = useCallback(async () => {
    while (queue.current.length) {
      const next = queue.current.shift();
      // eslint-disable-next-line no-await-in-loop
      await execute(next.code, next.opts);
    }
  }, [execute]);

  const run = useCallback((code, opts = {}) => {
    if (engine.busy && !opts.force) { queue.current.push({ code, opts }); if (opts.echo !== false) print(`${t('cw_queued')}: ${code}\n`, 'info'); return Promise.resolve({ ok: true, queued: true }); }
    return execute(code, opts);
  }, [engine, execute, print]);

  useEffect(() => { if (!busy && queue.current.length) runQueued(); }, [busy, runQueued]);

  useImperativeHandle(ref, () => ({ run, print, printError, clear, focus: () => inputRef.current && inputRef.current.focus() }), [run, print, printError, clear]);

  // Keep the view at the bottom unless the user scrolled up.
  useLayoutEffect(() => {
    const el = outRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  });

  const submit = () => {
    const code = text;
    setComp(null);
    hist.current = { index: -1, prefix: '', draft: '' };
    if (inputReq) {
      print(`${code}\n`, 'echo');
      setText('');
      const r = inputReq;
      setInputReq(null);
      r.resolve(code);
      return;
    }
    if (debug) {
      print(`K>> ${code}\n`, 'echo');
      setText('');
      if (code.trim()) onHistoryAdd(code);
      const word = code.trim();
      const map = { dbcont: 'continue', dbstep: 'step', 'dbstep in': 'stepIn', 'dbstep out': 'stepOut', dbquit: 'stop' };
      onDebugReply(map[word] || { eval: code });
      return;
    }
    setText('');
    if (!code.trim()) { print('>> \n', 'echo'); return; }
    run(code);
  };

  const historyMove = (dir) => {
    const h = hist.current;
    if (h.index === -1) { h.prefix = text; h.draft = text; }
    const list = history;
    let i = h.index === -1 ? list.length : h.index;
    for (;;) {
      i += dir;
      if (i < 0) return;
      if (i >= list.length) { h.index = -1; setText(h.draft); return; }
      if (!h.prefix || list[i].startsWith(h.prefix)) break;
    }
    h.index = i;
    setText(list[i]);
    setTimeout(() => { const el = inputRef.current; if (el) el.selectionStart = el.selectionEnd = el.value.length; }, 0);
  };

  const completeAt = async () => {
    const el = inputRef.current;
    const cursor = el ? el.selectionStart : text.length;
    const before = text.slice(0, cursor);
    const m = /[\w.]*$/.exec(before);
    const word = m ? m[0] : '';
    const dot = word.lastIndexOf('.');
    const from = cursor - word.length + (dot >= 0 ? dot + 1 : 0);
    const items = await engine.complete(text, cursor);
    if (!items || !items.length) return;
    if (items.length === 1) { apply(items[0], from, cursor); return; }
    setComp({ items: items.slice(0, 100), index: 0, from, to: cursor });
  };

  const apply = (item, from, to) => {
    const next = text.slice(0, from) + item.label + text.slice(to);
    setText(next);
    setComp(null);
    setTimeout(() => { const el = inputRef.current; if (el) { el.focus(); el.selectionStart = el.selectionEnd = from + item.label.length; } }, 0);
  };

  const onKey = (e) => {
    const el = e.currentTarget;
    if (comp) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setComp({ ...comp, index: Math.min(comp.items.length - 1, comp.index + 1) }); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setComp({ ...comp, index: Math.max(0, comp.index - 1) }); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); apply(comp.items[comp.index], comp.from, comp.to); return; }
      if (e.key === 'Escape') { e.preventDefault(); setComp(null); return; }
      setComp(null);
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      if (!inputReq && !debug && needsMoreInput(text) && !e.ctrlKey) return; // newline inside an open block
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === 'Tab' && !e.shiftKey && settings.keyboard.tabCompletion !== false) { e.preventDefault(); completeAt(); return; }
    if (e.key === 'ArrowUp' && !text.slice(0, el.selectionStart).includes('\n')) { e.preventDefault(); historyMove(-1); return; }
    if (e.key === 'ArrowDown' && !text.slice(el.selectionEnd).includes('\n')) { e.preventDefault(); historyMove(1); return; }
    if (e.key === 'Escape') { e.preventDefault(); setText(''); hist.current.index = -1; return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C') && !e.shiftKey) {
      const hasSel = el.selectionStart !== el.selectionEnd || String(window.getSelection() || '').length > 0;
      if (hasSel && settings.keyboard.ctrlCCopies !== false) return;
      e.preventDefault();
      if (busy || inputReq) { engine.interrupt(); print('^C\n', 'warn'); setInputReq(null); queue.current = []; }
      else { if (text) print(`>> ${text}^C\n`, 'echo'); setText(''); }
    }
  };

  // Ctrl+C anywhere in the pane (output selected or not).
  const onPaneKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C') && e.target === outRef.current) {
      const sel = String(window.getSelection() || '');
      if (sel) { copyText(sel); return; }
      if (busy) { e.preventDefault(); engine.interrupt(); print('^C\n', 'warn'); }
    }
  };

  const rows = Math.min(10, text.split('\n').length);
  const prompt = inputReq ? '' : debug ? 'K>>' : '>>';
  return (
    <div className="cw" style={{ '--cw-font': `"${cmd.fontFamily || 'Consolas'}", Consolas, "D2Coding", monospace`, '--cw-size': `${cmd.fontSize || 13}px` }} onKeyDown={onPaneKey}>
      <div ref={outRef} className={`cw-out selectable ${cmd.compact ? 'compact' : ''}`} tabIndex={0} aria-label={t('cw_title')} role="log"
        onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 8; }}
        onMouseUp={() => { if (!String(window.getSelection() || '') && inputRef.current) inputRef.current.focus(); }}>
        {entries.current.length === 0 && <div className="cw-hint small">{t('cw_hint')}</div>}
        {entries.current.map((en) => (en.frames ? (
          <div key={en.id} className="cw-frames">
            {en.frames.map((f, i) => (
              <div key={i} className="cw-err">{t('cw_error_in')} {f.file ? <a href="#" className="cw-link" onClick={(e) => { e.preventDefault(); onOpenLink(f.file, f.line); }}>{f.name || f.file}{f.line ? ` (${t('cw_line')} ${f.line})` : ''}</a> : `${f.name || ''}${f.line ? ` (${t('cw_line')} ${f.line})` : ''}`}</div>
            ))}
          </div>
        ) : (
          <span key={en.id} className={`cw-${en.stream}`}>{en.stream === 'err' || en.stream === 'warn' ? <Linked text={en.text} onLink={onOpenLink} /> : en.text}</span>
        )))}
      </div>
      <div className={`cw-input-row ${busy && !inputReq && !debug ? 'busy' : ''}`}>
        <span className="cw-prompt" aria-hidden="true">{busy && !inputReq && !debug ? <Icon name="spinner" size={13} className="spin" /> : prompt}</span>
        <textarea ref={inputRef} className="cw-input" rows={rows} value={text} spellCheck={false} aria-label={t('cw_input')}
          placeholder={inputReq ? t('cw_input_requested') : debug ? t('cw_debug_hint') : ''}
          onChange={(e) => { setText(e.target.value); hist.current.index = -1; }} onKeyDown={onKey} />
        {comp && (
          <div className="cw-comp" role="listbox" aria-label={t('cw_completions')}>
            {comp.items.map((it, i) => (
              <button key={`${it.label}-${i}`} type="button" role="option" aria-selected={i === comp.index} className={`cw-comp-item ${i === comp.index ? 'on' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); apply(it, comp.from, comp.to); }}>
                <Icon name={it.kind === 'variable' ? 'variable' : it.kind === 'file' ? 'file' : it.kind === 'field' ? 'list' : 'code'} size={13} />
                <span>{it.label}</span><span className="small">{it.kind || ''}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
