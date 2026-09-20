// One xterm.js view bound to a core terminal session. Stays mounted while
// the tab exists so scrollback survives switching away from it.
import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { call, onTerminalData, onTerminalExit, terminalsStream, writeClipboardText, readClipboardText } from '../lib/backend';

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function readTheme() {
  return {
    background: cssVar('--bg', '#12161c'),
    foreground: cssVar('--fg', '#e4e9f0'),
    cursor: cssVar('--accent', '#4cc9f0'),
    cursorAccent: cssVar('--bg', '#12161c'),
    selectionBackground: cssVar('--bg-sel', '#24485c'),
    selectionForeground: cssVar('--fg', '#e4e9f0'),
    black: '#1c1c1c',
    red: '#ff6b6b',
    green: '#4ade80',
    yellow: '#f5c451',
    blue: '#58a6ff',
    magenta: '#c084fc',
    cyan: '#4cc9f0',
    white: '#e4e9f0',
    brightBlack: '#6b7280',
    brightRed: '#ff8a8a',
    brightGreen: '#86efac',
    brightYellow: '#fde68a',
    brightBlue: '#93c5fd',
    brightMagenta: '#d8b4fe',
    brightCyan: '#67e8f9',
    brightWhite: '#ffffff',
  };
}

export function TerminalView({ sessionId, active, theme, fontSize }) {
  const hostRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const fs = Math.max(11, Number(fontSize) || parseInt(cssVar('--fs', '13'), 10) || 13);
    const mono = cssVar('--mono', "'Cascadia Mono', Consolas, monospace");
    const term = new Terminal({
      cursorBlink: true,
      convertEol: true,
      // Monospace first. Proportional CJK fonts (Malgun Gothic) make every
      // cell as wide as a Hangul character, so the prompt looks stretched.
      fontFamily: `${mono}, 'D2Coding ligature', D2Coding, 'Noto Sans Mono CJK KR', monospace`,
      fontSize: fs,
      theme: readTheme(),
      scrollback: 4000,
      allowTransparency: false,
      rescaleOverlappingGlyphs: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    termRef.current = term;
    fitRef.current = fit;
    try { fit.fit(); } catch { /* not visible yet */ }
    if (term.cols && term.rows) call('terminal.resize', { id: sessionId, cols: term.cols, rows: term.rows }).catch(() => {});

    term.onData((data) => { call('terminal.write', { id: sessionId, data }).catch(() => {}); });
    term.onResize(({ cols, rows }) => { call('terminal.resize', { id: sessionId, cols, rows }).catch(() => {}); });
    term.attachCustomKeyEventHandler((ev) => {
      if (ev.type !== 'keydown') return true;
      if (ev.isComposing || ev.key === 'Process' || ev.keyCode === 229) return true;
      const mod = ev.ctrlKey || ev.metaKey;
      if (mod && (ev.key === 'v' || ev.key === 'V')) {
        ev.preventDefault();
        readClipboardText().then((text) => { if (text) call('terminal.write', { id: sessionId, data: text }).catch(() => {}); });
        return false;
      }
      if (mod && (ev.key === 'c' || ev.key === 'C') && term.hasSelection()) {
        writeClipboardText(term.getSelection());
        return false;
      }
      return true;
    });

    let cursor = 0;
    let stopped = false;
    const apply = (chunks) => {
      for (const c of chunks || []) {
        if (!c || c.seq <= cursor) continue;
        cursor = c.seq;
        if (c.data) term.write(c.data);
      }
    };

    const offData = onTerminalData((msg) => {
      if (!msg || msg.id !== sessionId || msg.data == null) return;
      if (msg.seq && msg.seq <= cursor) return;
      if (msg.seq) cursor = msg.seq;
      term.write(msg.data);
    });

    call('terminal.read', { id: sessionId, after: 0 }).then((r) => {
      if (stopped || !r) return;
      apply(r.chunks);
    }).catch(() => {});
    const offExit = onTerminalExit((msg) => {
      if (!msg || msg.id !== sessionId) return;
      // The process ended; keep the view so the last lines stay readable.
    });

    let poll = null;
    if (!terminalsStream) {
      poll = setInterval(async () => {
        if (stopped) return;
        try {
          const r = await call('terminal.read', { id: sessionId, after: cursor });
          if (stopped || !r) return;
          apply(r.chunks);
        } catch { /* closed */ }
      }, 80);
    }

    return () => {
      stopped = true;
      if (poll) clearInterval(poll);
      offData();
      offExit();
      try { term.dispose(); } catch { /* ignore */ }
      termRef.current = null;
      fitRef.current = null;
    };
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.theme = readTheme();
    const fs = Math.max(11, Number(fontSize) || 13);
    if (term.options.fontSize !== fs) term.options.fontSize = fs;
  }, [theme, fontSize]);

  useEffect(() => {
    if (!active) return undefined;
    const fit = () => {
      try { if (fitRef.current) fitRef.current.fit(); } catch { /* ignore */ }
      try { if (termRef.current) termRef.current.focus(); } catch { /* ignore */ }
    };
    const id = requestAnimationFrame(fit);
    const host = hostRef.current;
    const ro = host && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    if (ro && host) ro.observe(host);
    return () => {
      cancelAnimationFrame(id);
      if (ro) ro.disconnect();
    };
  }, [active]);

  return <div className="term-host" ref={hostRef} lang="ko" />;
}

export default TerminalView;
