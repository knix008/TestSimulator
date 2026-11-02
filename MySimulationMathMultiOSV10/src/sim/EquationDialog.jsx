// 수식으로 모델 만들기: equations on the left, the diagram they become on the
// right (core/sim/eqmodel.js builds it while typing), then either a new model
// (eq2model in the engine, which opens its own tab) or the blocks added to the
// diagram being edited (onInsert, one Undo step). From a script editor: initialText is the script
// (or its selection) and there is no diagram to add to (no onInsert).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { equationModel } from '../../core/sim/eqmodel.js';
import { eqHints, eqNotes } from '../../core/sim/eqhint.js';
import { SimDialog } from './dialogs';
import { SimIcon } from './icons';
import { IconSelect } from '../views/common';
import { diagramImageOf } from './printModel';
import { tr } from './i18n';
import { EQ_EXAMPLES, eqCommand } from './logic.js';

const KINDS = ['auto', 'ode', 'tf', 'ss'];
const KIND_ICON = { auto: 'equation', ode: 'continuous', tf: 'function', ss: 'block' };

/** The built diagram, scaled to fit its box (print colours: a paper card). */
function Preview({ model }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const box = c.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.max(1, Math.round(box.width * dpr)); c.height = Math.max(1, Math.round(box.height * dpr));
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    if (!model) return;
    const img = diagramImageOf(model);
    const s = Math.min(c.width / (img.width + 16), c.height / (img.height + 16), 2 * dpr);
    const pic = img.render({ scale: Math.max(1, s * 1.5), transparent: true });
    const w = img.width * s, h = img.height * s;
    ctx.drawImage(pic, (c.width - w) / 2, (c.height - h) / 2, w, h);
  }, [model]);
  return <canvas ref={ref} className="sim-eq-canvas" aria-hidden="true" />;
}

export function EquationDialog({ lang, engine, running, onClose, onInsert, initialText }) {
  const L = (k, v) => tr(lang, k, v);
  const [kind, setKind] = useState('auto');
  const [text, setText] = useState(initialText != null && String(initialText).trim() ? String(initialText) : EQ_EXAMPLES[0].text);
  const [input, setInput] = useState('step');
  const [stop, setStop] = useState('10');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState(null);
  // built on every edit: the preview and the error under the text
  const built = useMemo(() => {
    try { return { ...equationModel(text, { kind, input, stopTime: stop || '10' }) }; } catch (e) { return { error: e.message || String(e), err: e }; }
  }, [text, kind, input, stop]);
  const info = built.info;
  // what to change: hints for the error, notes (likely typos) for text that builds
  const hints = useMemo(() => {
    try { return built.err ? eqHints(text, built.err, { kind }) : eqNotes(text, { kind }); } catch { return []; }
  }, [built, text, kind]);
  const [undoFix, setUndoFix] = useState(null);
  const applyFix = (h) => { setUndoFix({ before: text, after: h.fix }); setText(h.fix); };
  const hintList = hints.length > 0 && (<>
    <div className="sim-eq-hints-title">{L(built.err ? 'eq_hints' : 'eq_notes')}</div>
    <ul className={`sim-eq-hints ${built.err ? '' : 'notes'}`} data-eq="hints" aria-label={L(built.err ? 'eq_hints' : 'eq_notes')}>
      {hints.map((h, i) => (
        <li key={i} className="sim-eq-hint">
          <SimIcon name="lightbulb" size={14} />
          <div className="sim-eq-hint-body">
            <span>{lang === 'en' ? h.en : h.ko}</span>
            {h.preview && <code className="sim-eq-hint-code">{h.preview}</code>}
          </div>
          {h.fix != null && (
            <button type="button" className="vbtn sim-eq-fix" data-act="fix" title={L('eq_fix_tip')} onClick={() => applyFix(h)}>
              <SimIcon name="wand" size={13} /><span>{L('eq_fix')}</span></button>
          )}
        </li>
      ))}
    </ul>
  </>);
  const badName = name.trim() !== '' && !/^[A-Za-z]\w*$/.test(name.trim());

  const makeNew = async () => {
    if (!info || badName || busy) return;
    setBusy(true); setFail(null);
    try {
      const r = await engine.eval(eqCommand({ name: name.trim(), text, kind, input, stopTime: stop || '10' }), { echo: false, history: false });
      if (r && r.ok === false) setFail((r.error && r.error.message) || 'error');
      else onClose();
    } catch (e) { setFail(e.message || String(e)); }
    setBusy(false);
  };
  const insert = () => { if (!info || running || !onInsert) return; onInsert(built.model); onClose(); };
  const kindLabel = (k) => L(`eq_kind_${k}`);
  const listOf = (a) => (a.length ? a.join(', ') : '—');

  return (
    <SimDialog title={L('eq_title')} icon="equation" onClose={onClose} width={860} height={600} className="sim-dialog-fixed sim-eq"
      footer={<>
        {fail && <span className="sim-eq-fail" role="alert"><SimIcon name="alert" size={13} />{fail}</span>}
        <span className="spacer" />
        <button type="button" className="vbtn" onClick={onClose}><SimIcon name="close" size={14} /><span>{L('cancel')}</span></button>
        {onInsert && (
          <button type="button" className="vbtn" disabled={!info || running} title={running ? L('code_running') : L('eq_insert_tip')} onClick={insert} data-act="insert">
            <SimIcon name="plus" size={14} /><span>{L('eq_insert')}</span></button>
        )}
        <button type="button" className="vbtn vbtn-primary" disabled={!info || badName || busy} title={L('eq_new_tip')} onClick={makeNew} data-act="new">
          <SimIcon name="new" size={14} /><span>{L('eq_new')}</span></button>
      </>}>
      <div className="sim-eq-top">
        <div className="sim-eq-kinds" role="radiogroup" aria-label={L('eq_kind')}>
          {KINDS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} data-kind={k} className={`sim-line-style ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)} title={L(`eq_kind_${k}_tip`)}>
              <SimIcon name={KIND_ICON[k]} size={15} /><span>{kindLabel(k)}</span>
            </button>
          ))}
        </div>
        <span className="spacer" />
        <IconSelect value="" placeholder={L('eq_examples')} ariaLabel={L('eq_examples')} width={220} icon="book"
          options={EQ_EXAMPLES.map((x, i) => ({ value: String(i), label: lang === 'en' ? x.en : x.ko, icon: x.icon }))}
          onChange={(v) => { const x = EQ_EXAMPLES[Number(v)]; if (x) { setText(x.text); setKind('auto'); } }} />
      </div>
      <div className="sim-eq-main">
        <div className="sim-eq-left">
          <textarea className="sim-eq-text" value={text} spellCheck={false} aria-label={L('eq_text')} data-eq="text"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); makeNew(); } }} />
          <div className="sim-eq-help small muted">
            <span>{L('eq_help')}</span>
            {undoFix && undoFix.after === text && (
              <button type="button" className="vbtn sim-eq-unfix" data-act="unfix" title={L('eq_unfix_tip')} onClick={() => { setText(undoFix.before); setUndoFix(null); }}>
                <SimIcon name="undo" size={13} /><span>{L('eq_unfix')}</span></button>
            )}
          </div>
        </div>
        <div className="sim-eq-right">
          <div className="sim-eq-preview">{info ? <Preview model={built.model} /> : (
            <div className="sim-eq-problem">
              <div className="sim-eq-error" role="alert" data-eq="error"><SimIcon name="alert" size={14} /><span>{built.error}</span></div>
              {hintList}
            </div>
          )}</div>
          {info && hintList}
          {info && (
            <dl className="sim-eq-info" data-eq="info">
              <dt>{L('eq_kind')}</dt><dd>{kindLabel(info.kind)}</dd>
              {info.kind !== 'tf' && <><dt>{L('eq_states')}</dt><dd>{listOf(info.states.map((s) => (s.order > 1 ? `${s.name} (${L('eq_order', { n: s.order })})` : s.name)))}</dd></>}
              {info.tfs && <><dt>{L('eq_tfs')}</dt><dd>{info.tfs.map((t) => `${t.name}: [${t.num.join(' ')}] / [${t.den.join(' ')}]`).join(' · ')}</dd></>}
              <dt>{L('eq_inputs')}</dt><dd>{listOf(info.inputs)}</dd>
              <dt>{L('eq_params')}</dt><dd>{listOf(info.params.map((p) => `${p.name} = ${p.value}`))}</dd>
              <dt>{L('eq_outputs')}</dt><dd>{listOf(info.outputs)}</dd>
              <dt>{L('eq_blocks')}</dt><dd>{L('eq_counts', { b: info.blocks, l: info.lines })}</dd>
            </dl>
          )}
        </div>
      </div>
      <div className="sim-eq-opts">
        <label className="sim-eq-opt"><span>{L('eq_input')}</span>
          <IconSelect value={input} width={150} ariaLabel={L('eq_input')} onChange={setInput}
            options={[{ value: 'step', label: L('eq_in_step'), icon: 'plotStairs' }, { value: 'sine', label: L('eq_in_sine'), icon: 'waves' }, { value: 'constant', label: L('eq_in_constant'), icon: 'hash' }, { value: 'inport', label: L('eq_in_inport'), icon: 'flow' }]} />
        </label>
        <label className="sim-eq-opt"><span>{L('stopTime')}</span>
          <input type="text" className="sim-text sim-eq-stop" value={stop} spellCheck={false} onChange={(e) => setStop(e.target.value)} /></label>
        <label className="sim-eq-opt"><span>{L('eq_name')}</span>
          <input type="text" className={`sim-text sim-eq-name ${badName ? 'bad' : ''}`} value={name} placeholder="eqmodel" spellCheck={false} aria-invalid={badName} onChange={(e) => setName(e.target.value)} /></label>
      </div>
    </SimDialog>
  );
}
