// Minimap at the right edge of an editor pane: the whole document drawn
// small on a canvas — one 1×2 px block per character, in the syntax colours
// of the theme — with the lines currently on screen marked. Dragging on it
// scrolls the editor along with the pointer (the band follows the mouse,
// also outside the canvas); a plain click scrolls there and puts the cursor
// on that line. A document taller than the pane scrolls inside the minimap
// in step with the editor, like VS Code.
// Redrawn on every render of the pane (edits, tab switch, theme, resize) and
// on editor scroll, one frame at a time.
import React, { useEffect, useRef } from 'react';
import { EditorView } from '@codemirror/view';
import { ensureSyntaxTree } from '@codemirror/language';
import { highlightTree } from '@lezer/highlight';
import { minimapHighlighter } from '../lib/editor';

export const MINIMAP_WIDTH = 96;
const LINE_H = 2;          // px per line
const CHAR_W = 1;          // px per character
const TAB = 4;

export function Minimap({ view, version }) {
  const canvasRef = useRef(null);
  const raf = useRef(0);
  const drag = useRef(null);      // { offset } while dragging: the minimap's scroll is frozen so the map does not slide under the pointer
  const geom = useRef({ offset: 0, lines: 1 });   // of the last draw: for pointer → line

  const draw = () => {
    raf.current = 0;
    const canvas = canvasRef.current;
    if (!canvas || !view || !view.dom.isConnected) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const state = view.state, doc = state.doc;
    const lines = doc.lines;
    const mapH = lines * LINE_H;
    // The minimap's own scroll: the editor's scroll fraction applied to what does not fit.
    const sd = view.scrollDOM;
    const travel = Math.max(0, sd.scrollHeight - sd.clientHeight);
    const frac = travel ? sd.scrollTop / travel : 0;
    const offset = drag.current ? Math.min(drag.current.offset, Math.max(0, mapH - H)) : mapH > H ? Math.round(frac * (mapH - H)) : 0;
    geom.current = { offset, lines };

    // Theme colours (CSS variables on the root) and the syntax tree of the part in view.
    const css = getComputedStyle(view.dom);
    const colorOf = (name) => css.getPropertyValue(name).trim() || css.getPropertyValue('--fg').trim() || '#888';
    const base = colorOf('--fg');
    const firstLine = Math.max(1, Math.floor(offset / LINE_H) + 1);
    const lastLine = Math.min(lines, Math.ceil((offset + H) / LINE_H) + 1);
    const from = doc.line(firstLine).from, to = doc.line(lastLine).to;
    const tree = ensureSyntaxTree(state, to, 20);
    const runs = [];   // [from, to, colour] in order
    if (tree) highlightTree(tree, minimapHighlighter, (a, b, cls) => { runs.push(a, b, colorOf(cls.split(' ')[0])); }, from, to);

    // Each line: consecutive non-blank characters of one colour become one rectangle.
    const maxCols = Math.floor(W / CHAR_W);
    let ri = 0;
    ctx.globalAlpha = 0.85;
    for (let n = firstLine; n <= lastLine; n++) {
      const line = doc.line(n);
      const y = (n - 1) * LINE_H - offset;
      const text = line.text;
      let col = 0, runStart = -1, runColor = null;
      const flush = (endCol) => { if (runStart >= 0) { ctx.fillStyle = runColor; ctx.fillRect(runStart * CHAR_W, y, (endCol - runStart) * CHAR_W, LINE_H); runStart = -1; } };
      for (let i = 0; i < text.length && col < maxCols; i++) {
        const ch = text.charCodeAt(i);
        if (ch === 9) { flush(col); col = (Math.floor(col / TAB) + 1) * TAB; continue; }
        if (ch === 32) { flush(col); col++; continue; }
        const pos = line.from + i;
        while (ri < runs.length && runs[ri + 1] <= pos) ri += 3;
        const color = ri < runs.length && runs[ri] <= pos && pos < runs[ri + 1] ? runs[ri + 2] : base;
        if (runStart < 0) { runStart = col; runColor = color; } else if (color !== runColor) { flush(col); runStart = col; runColor = color; }
        col += ch > 0x2e7f ? 2 : 1;   // CJK characters are twice as wide
      }
      flush(col);
    }
    ctx.globalAlpha = 1;

    // The lines on screen.
    const topBlock = view.lineBlockAtHeight(sd.scrollTop), bottomBlock = view.lineBlockAtHeight(sd.scrollTop + sd.clientHeight);
    const vTop = (doc.lineAt(topBlock.from).number - 1) * LINE_H - offset;
    const vBottom = doc.lineAt(bottomBlock.from).number * LINE_H - offset;
    ctx.fillStyle = colorOf('--fg');
    ctx.globalAlpha = 0.1;
    ctx.fillRect(0, vTop, W, Math.max(LINE_H, vBottom - vTop));
    ctx.globalAlpha = 1;
  };
  const schedule = () => { if (!raf.current) raf.current = requestAnimationFrame(draw); };

  useEffect(() => { schedule(); });   // every render of the pane: edits, another document, theme, settings
  useEffect(() => {
    if (!view) return;
    const sd = view.scrollDOM;
    sd.addEventListener('scroll', schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(sd);
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => { sd.removeEventListener('scroll', schedule); ro.disconnect(); if (raf.current) cancelAnimationFrame(raf.current); raf.current = 0; };
  }, [view]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Pointer → document line; the editor scrolls so that line is centred.
  const lineAt = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const { lines } = geom.current;
    const offset = drag.current ? drag.current.offset : geom.current.offset;
    return Math.max(1, Math.min(lines, Math.floor((e.clientY - r.top + offset) / LINE_H) + 1));
  };
  const goTo = (e, { cursor = false } = {}) => {
    if (!view) return;
    const line = view.state.doc.line(lineAt(e));
    view.dispatch({
      ...(cursor ? { selection: { anchor: line.from } } : {}),
      effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
    });
  };
  // Drag: the editor follows the pointer until the button is released (listeners on the window, so leaving the canvas does not end it);
  // a press without movement is a click: the cursor goes to that line.
  const onDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startY = e.clientY;
    let moved = false;
    drag.current = { offset: geom.current.offset };
    goTo(e);
    const move = (ev) => { if (!moved && Math.abs(ev.clientY - startY) < 3) return; moved = true; goTo(ev); };
    const up = () => {
      window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
      drag.current = null;
      if (!moved) goTo(e, { cursor: true });   // where the press was
      if (view) view.focus();
      schedule();   // the map catches up with the editor's scroll
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  return <canvas className="minimap" ref={canvasRef} data-version={version} onMouseDown={onDown} />;
}

export default Minimap;
