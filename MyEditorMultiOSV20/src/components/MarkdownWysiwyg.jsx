// Markdown WYSIWYG column. The source editor keeps the raw text; this pane
// renders the same document with the live marks (see lib/mdlive.js). Edits
// are applied to the source view, which owns the undo history, and the
// source's changes are copied back here. Two views cannot share one state.
// Moving the cursor in the source keeps this pane on that same spot: the
// cursor stays at the same height in both panes. Scrolling the source without
// moving the cursor keeps the line at the source's top at this pane's top.
// Heights differ (headings are larger here), so the scroll offset itself is
// not copied.
import React, { useEffect, useRef } from 'react';
import { EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap, drawSelection, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, indentWithTab, undo, redo } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
import { editorTheme, editorHighlight } from '../lib/editor';
import { markdownLive, imageBase, wysiwygFollow } from '../lib/mdlive';
import { languageByName, loadLanguage } from '../lib/languages';

export function MarkdownWysiwyg({ sourceView, base, syncs, views, fontFamily, fontSize, lineHeight = 1.55 }) {
  const hostRef = useRef(null);
  const sourceRef = useRef(sourceView);
  sourceRef.current = sourceView;

  const style = {
    '--editor-fs': `${fontSize}px`,
    '--editor-lh': String(lineHeight),
    '--editor-font': fontFamily ? `'${fontFamily.replace(/'/g, '')}', var(--mono)` : 'var(--mono)',
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !sourceView) return undefined;
    let view = null;
    let suppress = false;
    let cancelled = false;
    let pendingFollow = null;
    const followPos = (u) => {
      let pos = null;
      for (const tr of u.transactions) for (const e of tr.effects) if (e.is(wysiwygFollow)) pos = e.value;
      return pos;
    };
    const scrollFollow = (pos) => {
      if (!view || pos == null) return;
      const at = Math.max(0, Math.min(pos, view.state.doc.length));
      view.dispatch({ effects: EditorView.scrollIntoView(at, { y: 'start', yMargin: 24 }) });
    };
    // Puts the source cursor at the same height in this pane. Done on the next
    // frame so this view can measure that line; a direct scrollTop change while
    // the source view is updating leaves the old lines on screen.
    let cursorHold = 0;
    let placeFrame = 0;
    const placeCursor = (pos) => {
      cursorHold = Date.now() + 350;
      if (placeFrame) cancelAnimationFrame(placeFrame);
      placeFrame = requestAnimationFrame(() => {
        placeFrame = 0;
        const src = sourceRef.current;
        if (!view || !src || pos == null) return;
        const head = Math.max(0, Math.min(pos, src.state.doc.length));
        const at = Math.max(0, Math.min(pos, view.state.doc.length));
        const c = src.coordsAtPos(head);
        const box = src.scrollDOM.getBoundingClientRect();
        const ratio = c ? Math.max(0, Math.min(1, (c.top - box.top) / Math.max(1, box.height))) : 0;
        cursorHold = Date.now() + 350;
        view.dispatch({ effects: EditorView.scrollIntoView(at, { y: 'start', yMargin: Math.round(ratio * view.scrollDOM.clientHeight) }) });
      });
    };
    const applyFromSource = (u) => {
      if (suppress || u.view !== sourceRef.current) return;
      const follow = followPos(u);
      if (follow != null) pendingFollow = follow;
      if (!view) return;
      if (u.docChanged && view.state.doc.toString() !== u.state.doc.toString()) {
        suppress = true;
        try {
          view.dispatch({ changes: u.changes, selection: u.state.selection });
        } catch {
          const text = u.state.doc.toString();
          if (view.state.doc.toString() !== text) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
        } finally { suppress = false; }
      }
      if (pendingFollow != null) { const p = pendingFollow; pendingFollow = null; scrollFollow(p); return; }
      if (u.selectionSet) placeCursor(u.state.selection.main.head);
    };
    syncs.current.add(applyFromSource);
    // The line at the source editor's top goes to the top of this pane.
    let scrollFrame = 0;
    const syncScroll = () => {
      const src = sourceRef.current;
      if (!view || !src) return;
      const docY = src.scrollDOM.getBoundingClientRect().top - src.documentTop;
      if (docY <= 1) {
        if (view.scrollDOM.scrollTop !== 0) view.scrollDOM.scrollTop = 0;
        return;
      }
      const block = src.lineBlockAtHeight(docY);
      const frac = block.height > 0 ? Math.max(0, Math.min(1, (docY - block.top) / block.height)) : 0;
      const at = Math.max(0, Math.min(block.from, view.state.doc.length));
      const here = view.lineBlockAt(at);
      const target = here.top + frac * here.height;
      const current = view.scrollDOM.getBoundingClientRect().top - view.documentTop;
      const next = view.scrollDOM.scrollTop + target - current;
      if (Math.abs(view.scrollDOM.scrollTop - next) >= 1) view.scrollDOM.scrollTop = next;
    };
    const onEditorScroll = () => {
      if (Date.now() < cursorHold) return;
      syncScroll();
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(() => { scrollFrame = 0; if (Date.now() < cursorHold) return; syncScroll(); });
    };
    sourceView.scrollDOM.addEventListener('scroll', onEditorScroll);
    (async () => {
      const support = await loadLanguage(languageByName('Markdown'));
      if (cancelled || !host.isConnected) return;
      const src = sourceRef.current;
      if (!src) return;
      const state = EditorState.create({
        doc: src.state.doc.toString(),
        selection: src.state.selection,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          drawSelection(),
          bracketMatching(),
          syntaxHighlighting(editorHighlight),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          editorTheme,
          EditorView.lineWrapping,
          keymap.of([...defaultKeymap, indentWithTab]),
          Prec.high(keymap.of([
            { key: 'Mod-z', run: () => undo(sourceRef.current) },
            { key: 'Mod-y', mac: 'Mod-Shift-z', run: () => redo(sourceRef.current) },
            { key: 'Mod-Shift-z', run: () => redo(sourceRef.current) },
          ])),
          support || [],
          markdownLive,
          imageBase.of(base || ''),
          EditorView.updateListener.of((u) => {
            if (suppress || !u.docChanged) return;
            const target = sourceRef.current;
            if (!target) return;
            suppress = true;
            try { target.dispatch({ changes: u.changes, selection: u.state.selection }); }
            finally { suppress = false; }
          }),
        ],
      });
      if (cancelled || !host.isConnected) return;
      view = new EditorView({ state, parent: host });
      views.current.add(view);
      const now = sourceRef.current;
      if (now && view.state.doc.toString() !== now.state.doc.toString()) {
        suppress = true;
        try { view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: now.state.doc.toString() }, selection: now.state.selection }); }
        finally { suppress = false; }
      }
      if (pendingFollow != null) { const p = pendingFollow; pendingFollow = null; scrollFollow(p); }
      syncScroll();
    })();
    return () => {
      cancelled = true;
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
      if (placeFrame) cancelAnimationFrame(placeFrame);
      sourceView.scrollDOM.removeEventListener('scroll', onEditorScroll);
      syncs.current.delete(applyFromSource);
      if (view) { views.current.delete(view); view.destroy(); }
      view = null;
    };
    // The pane is rebuilt when the source view or the image folder changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceView, base]);

  return (
    <div className="md-wysiwyg" style={style}>
      <div className="cm-host" ref={hostRef} />
    </div>
  );
}

export default MarkdownWysiwyg;
