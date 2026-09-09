import React, { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder as cmPlaceholder, drawSelection } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import { search, searchKeymap } from '@codemirror/search';

// A textarea-shaped handle around a CodeMirror 6 view. App.jsx already talks to
// the editor as `el.value` / `selectionStart` / `setSelectionRange` / `scrollTop`,
// and rewriting every call site would be a larger change than the editor swap.
// The view itself only paints the visible lines, which is why typing stays
// responsive in a long merged document — a native <textarea> re-lays-out the
// whole text on every keystroke (and every Hangul jamo).
// Full-document replaces rebuild the viewport; a synchronous scrollTop write is
// then overwritten once CodeMirror measures the new lines. Pinning after
// measure (and on the next frames) keeps the writer looking at the same place
// when the app rewrites the document in the background.
let viewGen = 0;
function pinScroll(view, top, left) {
  const token = ++viewGen;
  const apply = () => {
    if (token !== viewGen) return;
    view.scrollDOM.scrollTop = top;
    view.scrollDOM.scrollLeft = left;
  };
  apply();
  view.requestMeasure({
    key: pinScroll,
    read: () => {},
    write: apply,
  });
  requestAnimationFrame(() => {
    apply();
    requestAnimationFrame(apply);
  });
}

const silentViews = new WeakSet();
function dispatchSilent(view, spec) {
  silentViews.add(view);
  try {
    view.dispatch(spec);
  } finally {
    silentViews.delete(view);
  }
}

function createHandle(getView) {
  return {
    get isConnected() {
      const v = getView();
      return !!(v && v.dom.isConnected);
    },
    get isReady() {
      const v = getView();
      return !!(v && v.dom.isConnected);
    },
    get isFilled() {
      const v = getView();
      return !!(v && v.mmmFilled);
    },
    get hasFocus() {
      return !!getView()?.hasFocus;
    },
    get composing() {
      return !!getView()?.composing;
    },
    get value() {
      const v = getView();
      return v ? v.state.doc.toString() : '';
    },
    set value(text) {
      const v = getView();
      if (!v) return;
      const cur = v.state.doc.toString();
      if (cur === text) return;
      const top = v.scrollDOM.scrollTop;
      const left = v.scrollDOM.scrollLeft;
      dispatchSilent(v, {
        changes: { from: 0, to: v.state.doc.length, insert: text ?? '' },
        scrollIntoView: false,
      });
      v.mmmFilled = true;
      pinScroll(v, top, left);
    },
    get selectionStart() {
      const v = getView();
      return v ? v.state.selection.main.from : 0;
    },
    get selectionEnd() {
      const v = getView();
      return v ? v.state.selection.main.to : 0;
    },
    setSelectionRange(start, end) {
      const v = getView();
      if (!v) return;
      const len = v.state.doc.length;
      const from = Math.max(0, Math.min(start ?? 0, len));
      const to = Math.max(0, Math.min(end ?? from, len));
      v.dispatch({
        selection: { anchor: from, head: to },
        scrollIntoView: false,
      });
    },
    // TOC / cover rewrites change the height above the caret. Pinning the old
    // scrollTop would then show a different paragraph. Keep the same document
    // position at the same place on screen instead.
    replaceKeepingAnchor(text, { caret, mapPos } = {}) {
      const v = getView();
      if (!v) return;
      const token = ++viewGen;
      const wrap = v.scrollDOM.getBoundingClientRect();
      const head = v.state.selection.main.head;
      const caretCoords = v.coordsAtPos(head);
      const inView = !!(caretCoords
        && caretCoords.top >= wrap.top - 4
        && caretCoords.top <= wrap.bottom + 4);
      const oldAnchor = inView
        ? head
        : (v.posAtCoords({ x: wrap.left + 24, y: wrap.top + 8 }) ?? head);
      const before = v.coordsAtPos(oldAnchor);
      const yInView = before ? before.top - wrap.top : 0;
      const left = v.scrollDOM.scrollLeft;
      const next = text ?? '';
      const len = next.length;
      const map = typeof mapPos === 'function' ? mapPos : (p) => p;
      const newAnchor = Math.max(0, Math.min(map(oldAnchor), len));
      const newCaret = Math.max(0, Math.min(caret ?? map(head), len));
      dispatchSilent(v, {
        changes: { from: 0, to: v.state.doc.length, insert: next },
        selection: { anchor: newCaret, head: newCaret },
        scrollIntoView: false,
      });
      v.mmmFilled = true;
      const place = () => {
        if (token !== viewGen) return;
        const after = v.coordsAtPos(newAnchor);
        if (!after) return;
        const wrap2 = v.scrollDOM.getBoundingClientRect();
        v.scrollDOM.scrollTop += after.top - wrap2.top - yInView;
        v.scrollDOM.scrollLeft = left;
      };
      place();
      v.requestMeasure({ key: 'keep-anchor', read: () => {}, write: place });
      requestAnimationFrame(() => { place(); requestAnimationFrame(place); });
    },
    // One transaction for text + caret, with the viewport held where it is.
    replaceKeepingView(text, start, end) {
      const v = getView();
      if (!v) return;
      const top = v.scrollDOM.scrollTop;
      const left = v.scrollDOM.scrollLeft;
      const next = text ?? '';
      const len = next.length;
      const spec = { scrollIntoView: false };
      if (v.state.doc.toString() !== next) {
        spec.changes = { from: 0, to: v.state.doc.length, insert: next };
      }
      if (start != null) {
        const from = Math.max(0, Math.min(start, len));
        const to = Math.max(0, Math.min(end ?? from, len));
        spec.selection = { anchor: from, head: to };
      }
      if (spec.changes || spec.selection) dispatchSilent(v, spec);
      v.mmmFilled = true;
      pinScroll(v, top, left);
    },
    // Undo/redo: put the caret on the restored change and bring that line
    // into view. Cancels any leftover pin so a later rAF cannot yank the
    // viewport back to where it was before the step.
    replaceAndReveal(text, start, end) {
      const v = getView();
      if (!v) return;
      const token = ++viewGen;
      const next = text ?? '';
      const len = next.length;
      const from = Math.max(0, Math.min(start ?? 0, len));
      const to = Math.max(0, Math.min(end ?? from, len));
      const spec = {
        selection: { anchor: from, head: to },
        scrollIntoView: false,
      };
      if (v.state.doc.toString() !== next) {
        spec.changes = { from: 0, to: v.state.doc.length, insert: next };
      }
      dispatchSilent(v, spec);
      v.mmmFilled = true;
      const reveal = () => {
        if (token !== viewGen) return;
        v.dispatch({
          effects: EditorView.scrollIntoView(v.state.selection.main, { y: 'center' }),
        });
      };
      reveal();
      v.requestMeasure({ key: 'reveal-sel', read: () => {}, write: reveal });
      requestAnimationFrame(() => {
        reveal();
        requestAnimationFrame(reveal);
      });
    },
    get scrollTop() {
      return getView()?.scrollDOM.scrollTop ?? 0;
    },
    set scrollTop(n) {
      const v = getView();
      if (!v) return;
      pinScroll(v, n, v.scrollDOM.scrollLeft);
    },
    get scrollLeft() {
      return getView()?.scrollDOM.scrollLeft ?? 0;
    },
    set scrollLeft(n) {
      const v = getView();
      if (!v) return;
      pinScroll(v, v.scrollDOM.scrollTop, n);
    },
    get clientWidth() {
      return getView()?.scrollDOM.clientWidth ?? 0;
    },
    get clientHeight() {
      return getView()?.scrollDOM.clientHeight ?? 0;
    },
    focus() {
      getView()?.focus();
    },
    blur() {
      getView()?.contentDOM.blur();
    },
    requestMeasure() {
      getView()?.requestMeasure();
    },
    select() {
      const v = getView();
      if (!v) return;
      v.dispatch({
        selection: { anchor: 0, head: v.state.doc.length },
        scrollIntoView: false,
      });
    },
    scrollSelectionIntoView() {
      const v = getView();
      if (!v) return;
      viewGen += 1;
      v.dispatch({
        effects: EditorView.scrollIntoView(v.state.selection.main, { y: 'center' }),
      });
    },
  };
}

function cb(ref, name, event) {
  return ref.current?.[name]?.(event);
}

function MarkdownEditor({ zoom, placeholder, callbacksRef }, ref) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const placeholderSlot = useRef(new Compartment());

  useImperativeHandle(ref, () => createHandle(() => viewRef.current), []);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: '',
        extensions: [
          // App-level undo already records document rewrites (renumber / contents).
          // CodeMirror's own history would fight that stack, so it stays off.
          keymap.of([...defaultKeymap, ...searchKeymap]),
          search({ top: true }),
          drawSelection(),
          EditorView.lineWrapping,
          EditorState.allowMultipleSelections.of(false),
          EditorView.theme({
            '&': { height: '100%', fontSize: 'inherit', backgroundColor: 'transparent' },
            '&.cm-focused': { outline: 'none' },
            '.cm-scroller': { fontFamily: 'inherit', lineHeight: 'inherit' },
            '.cm-content': { fontFamily: 'inherit', caretColor: 'var(--text)' },
            '.cm-cursor': { borderLeftColor: 'var(--text)' },
          }),
          EditorView.contentAttributes.of({
            spellcheck: 'false',
            autocorrect: 'off',
            autocapitalize: 'off',
          }),
          placeholderSlot.current.of(placeholder ? cmPlaceholder(placeholder) : []),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) update.view.mmmFilled = true;
            if (silentViews.has(update.view)) return;
            if (update.view.composing) cb(callbacksRef, 'onCompositionStart');
            if (update.docChanged) cb(callbacksRef, 'onInput');
          }),
          EditorView.domEventHandlers({
            compositionstart: () => { cb(callbacksRef, 'onCompositionStart'); return false; },
            compositionend: () => { cb(callbacksRef, 'onCompositionEnd'); return false; },
            click: () => { cb(callbacksRef, 'onClick'); return false; },
            blur: () => { cb(callbacksRef, 'onBlur'); return false; },
            keydown: (event) => {
              cb(callbacksRef, 'onKeyDown', event);
              return event.defaultPrevented;
            },
            contextmenu: (event) => {
              cb(callbacksRef, 'onContextMenu', event);
              return event.defaultPrevented;
            },
          }),
        ],
      }),
    });
    viewRef.current = view;
    cb(callbacksRef, 'onReady');
    return () => {
      view.destroy();
      if (viewRef.current === view) viewRef.current = null;
    };
    // Created once. Placeholder / zoom are patched in the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: placeholderSlot.current.reconfigure(
        placeholder ? cmPlaceholder(placeholder) : [],
      ),
    });
  }, [placeholder]);

  useEffect(() => {
    viewRef.current?.requestMeasure();
  }, [zoom]);

  return (
    <div
      ref={hostRef}
      className="editor"
      style={{ fontSize: `${(13.5 * zoom) / 100}px` }}
    />
  );
}

// Parent re-renders (status, outline, first-keystroke "edited" flag) must not
// reconcile the editor DOM — that is how IME composition used to hitch.
// Callbacks arrive through a stable ref so skipping the render still sees the
// latest handlers.
export default React.memo(forwardRef(MarkdownEditor), (prev, next) => (
  prev.zoom === next.zoom
  && prev.placeholder === next.placeholder
  && prev.callbacksRef === next.callbacksRef
));
