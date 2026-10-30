// 코드 보기 of the model editor: the model as M code (core/sim/codegen.js) in
// an editable M editor beside the diagram. While the text is not edited it
// follows the diagram; once edited, 적용 (Ctrl+Enter / F5) runs it in the
// engine on the same model, which empties and rebuilds the diagram (the editor
// gets the engine's sim.model update, so Ctrl+Z on the diagram undoes it).
// 되돌리기 throws the edits away and shows the code of the diagram again.
import React, { useEffect, useRef, useState } from 'react';
import { createMEditor } from '../lib/editor';
import { modelToCode } from '../../core/sim/codegen.js';
import { SimIcon } from './icons';
import { tr } from './i18n';

export function ModelCodePane({ engine, model, rev, name, running, lang, onOpenScript, onClose }) {
  const L = (k, v) => tr(lang, k, v);
  const host = useRef(null);
  const ed = useRef(null);
  const generated = useRef('');
  const [edited, setEdited] = useState(false);
  const [stale, setStale] = useState(false);   // the diagram changed while the text was edited
  const [msg, setMsg] = useState(null);        // { kind: 'ok' | 'bad', text }
  const [busy, setBusy] = useState(false);
  const applyRef = useRef(() => {});
  const quiet = useRef(false);                 // the text is being replaced by the diagram's code, not typed
  const show = (code) => { quiet.current = true; ed.current.setText(code); quiet.current = false; };

  // the editor (once)
  useEffect(() => {
    const code = modelToCode(model, name);
    generated.current = code;
    ed.current = createMEditor({
      parent: host.current, doc: code, settings: { fontFamily: 'Consolas', fontSize: 12.5, tabSize: 4, wrap: false },
      actions: {
        onChange: (text) => { if (quiet.current) return; setEdited(text !== generated.current); setMsg(null); },
        run: () => applyRef.current(), runSection: () => applyRef.current(),
        complete: (text, cur) => engine.complete(text, cur), help: (n) => engine.help(n),
      },
    });
    host.current.__msmEditor = ed.current; // smoke / GUI tests read and edit the code through this
    return () => { ed.current.destroy(); ed.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // the diagram changed: new code when the text is not edited
  useEffect(() => {
    if (!ed.current) return;
    const code = modelToCode(model, name);
    if (code === generated.current) return;
    generated.current = code;
    if (!edited) show(code);
    else setStale(true);
  }, [rev, name]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => {
    const code = modelToCode(model, name);
    generated.current = code;
    show(code);
    setEdited(false); setStale(false); setMsg(null);
  };
  const apply = async () => {
    if (!ed.current || busy || running) return;
    setBusy(true); setMsg(null);
    try {
      const r = await engine.eval(ed.current.getText(), { echo: false, history: false });
      if (r && r.ok === false) setMsg({ kind: 'bad', text: L('code_failed', { error: (r.error && r.error.message) || '' }) });
      else {
        setEdited(false); setStale(false);
        setMsg({ kind: 'ok', text: L('code_applied') });
      }
    } catch (e) { setMsg({ kind: 'bad', text: L('code_failed', { error: e.message || e }) }); }
    setBusy(false);
  };
  applyRef.current = apply;

  return (
    <div className="sim-code" data-pane="model-code">
      <div className="sim-code-head">
        <SimIcon name="function" size={14} /><strong>{L('code_title')}</strong>
        {edited && <span className="sim-code-edited" title={L('code_edited_tip')}>● {L('code_edited')}</span>}
        <span className="spacer" />
        <button type="button" className="sim-mini" title={L('close')} aria-label={L('close')} onClick={onClose}><SimIcon name="close" size={12} /></button>
      </div>
      <div className="sim-code-tools">
        <button type="button" className="sim-tb primary" disabled={busy || running} title={running ? L('code_running') : L('code_apply_tip')} onClick={apply}>
          <SimIcon name="run" size={14} /><span className="sim-tb-label">{L('code_apply')}</span>
        </button>
        <button type="button" className="sim-tb" disabled={!edited} title={L('code_reset_tip')} onClick={reset}>
          <SimIcon name="update" size={14} /><span className="sim-tb-label">{L('code_reset')}</span>
        </button>
        <button type="button" className="sim-tb" title={L('code_copy_tip')} onClick={() => navigator.clipboard && navigator.clipboard.writeText(ed.current ? ed.current.getText() : '')}>
          <SimIcon name="copy" size={14} /><span className="sim-tb-label">{L('copy')}</span>
        </button>
        {onOpenScript && (
          <button type="button" className="sim-tb" title={L('code_script_tip')} onClick={() => onOpenScript(ed.current ? ed.current.getText() : '')}>
            <SimIcon name="duplicate" size={14} /><span className="sim-tb-label">{L('code_script')}</span>
          </button>
        )}
      </div>
      {stale && (
        <div className="sim-code-note">
          <SimIcon name="info" size={13} /><span>{L('code_stale')}</span>
          <button type="button" className="sim-mini" onClick={reset}>{L('code_reset')}</button>
        </div>
      )}
      {msg && <div className={`sim-code-note ${msg.kind}`}><SimIcon name={msg.kind === 'ok' ? 'info' : 'alert'} size={13} /><span>{msg.text}</span></div>}
      <div ref={host} className="editor-host sim-code-editor" />
    </div>
  );
}
