// Hosts the single CodeMirror view. App.jsx swaps EditorStates in and out of
// it when the active tab changes (every tab keeps its own state: text, undo
// history, selection, folds). The pane also takes dropped files and shows
// the editor context menu (with spelling suggestions for the word under the pointer).
import React, { useEffect, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { ContextMenu } from './ContextMenu';

export function EditorPane({ initialState, onView, onDropFiles, contextItems, onAction, fontFamily, fontSize, empty }) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const [ctx, setCtx] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const view = new EditorView({ state: initialState, parent: hostRef.current });
    viewRef.current = view;
    onView(view);
    return () => { view.destroy(); viewRef.current = null; onView(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = { '--editor-fs': `${fontSize}px`, '--editor-font': fontFamily ? `'${fontFamily.replace(/'/g, '')}', var(--mono)` : 'var(--mono)' };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) onDropFiles(files);
  };

  return (
    <div className={`editor-pane ${dragOver ? 'drag-over' : ''} ${empty ? 'empty' : ''}`} style={style}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; if (!dragOver) setDragOver(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }}
      onDrop={onDrop}
      onContextMenu={(e) => { if (e.target.closest('.cm-editor')) { e.preventDefault(); const v = viewRef.current; setCtx({ x: e.clientX, y: e.clientY, pos: v ? v.posAtCoords({ x: e.clientX, y: e.clientY }) : null }); } }}>
      <div className="cm-host" ref={hostRef} />
      {ctx && (
        <ContextMenu x={ctx.x} y={ctx.y} items={contextItems(ctx.pos)} onClose={() => setCtx(null)}
          onPick={(id) => { setCtx(null); onAction(id, ctx.pos); }} />
      )}
    </div>
  );
}

export default EditorPane;
