// Dialogs of the block-diagram editor: block parameters, model settings and
// the mask editor. Floating panels inside the editor (draggable title bar).
import React, { useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Stepper, IconSelect, Toggle, Tabs } from '../views/common';
import { blockDef } from '../../core/sim/blocks/index.js';
import { DTYPES } from '../../core/sim/blocks/util.js';
import { SimIcon } from './icons';
import { enumIcon } from './logic.js';
import { tr, lbl } from './i18n';

const isPlainNumber = (s) => /^\s*[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?\s*$/i.test(String(s));
const decimals = (s) => { const m = /\.(\d+)/.exec(String(s)); return m ? Math.min(6, m[1].length) : 0; };

/** False while the owning editor tab is hidden: its dialogs (portalled to <body>) hide too. */
export const DialogVisible = React.createContext(true);

/**
 * A floating dialog frame with a draggable title. It is portalled to <body>
 * (fixed position, centred on the window) so a short editor pane never clips
 * it; the body scrolls only when the window itself is too small.
 */
export function SimDialog({ title, icon = 'settings', onClose, children, footer, width = 460, height, className = '' }) {
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const visible = useContext(DialogVisible);
  useEffect(() => {
    const el = ref.current; if (!el || pos) return;
    setPos({ x: Math.max(8, (window.innerWidth - el.offsetWidth) / 2), y: Math.max(8, Math.min(110, (window.innerHeight - el.offsetHeight) / 2)) });
    el.focus({ preventScroll: true });
  }, [pos]);
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    const el = ref.current;
    el && el.addEventListener('keydown', key);
    return () => el && el.removeEventListener('keydown', key);
  }, [onClose]);
  const down = (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    const sx = e.clientX, sy = e.clientY, p = pos || { x: 0, y: 0 };
    const el = ref.current;
    const maxX = window.innerWidth - (el ? el.offsetWidth : 100), maxY = window.innerHeight - 40;
    const move = (ev) => setPos({ x: Math.max(0, Math.min(maxX, p.x + ev.clientX - sx)), y: Math.max(0, Math.min(maxY, p.y + ev.clientY - sy)) });
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  return createPortal(
    <div ref={ref} tabIndex={-1} className={`sim-dialog ${className}`} role="dialog" aria-label={title} style={{ width, height, left: pos ? pos.x : -9999, top: pos ? pos.y : 0, display: visible ? undefined : 'none' }}
      onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      <div className="sim-dialog-title" onPointerDown={down}>
        <SimIcon name={icon} size={15} /><span className="ellipsis">{title}</span><span className="spacer" />
        <button type="button" className="sim-mini sim-x" onClick={onClose} aria-label="close"><SimIcon name="close" size={13} /></button>
      </div>
      <div className="sim-dialog-body">{children}</div>
      {footer && <div className="sim-dialog-foot">{footer}</div>}
    </div>,
    document.body,
  );
}

/** One parameter editor (expr / text / enum / bool / code / dtype). */
export function ParamField({ p, value, onChange, lang }) {
  const [fx, setFx] = useState(false);
  const v = value == null ? p.def : value;
  if (p.type === 'enum' || p.type === 'popup') {
    const options = (p.options || []).map((o) => ({ value: o.value, label: lbl(lang, o.label) || o.value, icon: o.icon || enumIcon(o.value) }));
    if (!options.some((o) => o.value === v)) options.push({ value: v, label: v, icon: enumIcon(v) });
    return <IconSelect value={v} options={options} onChange={onChange} width="100%" ariaLabel={lbl(lang, p.label)} />;
  }
  if (p.type === 'dtype') {
    const options = [...DTYPES, 'Inherit: auto'].map((d) => ({ value: d, label: d, icon: 'hash' }));
    if (!options.some((o) => o.value === v)) options.push({ value: v, label: v, icon: 'hash' });
    return <IconSelect value={v} options={options} onChange={onChange} width="100%" ariaLabel={lbl(lang, p.label)} />;
  }
  if (p.type === 'bool' || p.type === 'checkbox') {
    const on = v === 'on' || v === 'true' || v === '1';
    return <Toggle checked={on} onChange={(c) => onChange(c ? 'on' : 'off')} label={on ? tr(lang, 'on') : tr(lang, 'off')} />;
  }
  if (p.type === 'code') {
    return <textarea className="sim-code" spellCheck={false} value={v} onChange={(e) => onChange(e.target.value)} rows={Math.min(16, Math.max(5, String(v).split('\n').length + 1))} />;
  }
  if (p.num && isPlainNumber(v) && !fx) {
    const d = decimals(v);
    const step = p.step ? Math.min(Number(p.step), d ? 10 ** -d : 1) : (d ? 10 ** -d : 1);
    return (
      <span className="sim-numfield">
        <Stepper value={Number(v)} min={p.min ?? -1e9} max={p.max ?? 1e9} step={step} width={110} ariaLabel={lbl(lang, p.label)} onChange={(n) => onChange(String(n))} />
        <button type="button" className="sim-mini" title="expression" onClick={() => setFx(true)}>fx</button>
      </span>
    );
  }
  return <input type="text" className="sim-text" spellCheck={false} value={v} onChange={(e) => onChange(e.target.value)} aria-label={lbl(lang, p.label)} />;
}

/** Parameters of a masked block, as ParamField descriptors. */
function maskParamDefs(mask) {
  return (mask.params || []).map((mp) => ({
    name: mp.name, type: mp.type === 'checkbox' ? 'bool' : mp.type === 'popup' ? 'enum' : 'expr', def: mp.value ?? '',
    label: { en: mp.prompt || mp.name, ko: mp.prompt || mp.name },
    options: mp.type === 'popup' ? String(mp.options || '').split('|').filter(Boolean).map((o) => ({ value: o, label: { en: o, ko: o } })) : undefined,
    num: mp.type !== 'popup' && mp.type !== 'checkbox',
  }));
}

export function BlockDialog({ block, lang, onApply, onClose, running, onTune }) {
  const def = blockDef(block.type);
  const masked = !!(block.mask && (block.mask.params || []).length);
  const params = masked ? maskParamDefs(block.mask) : (def ? def.params : []);
  const [vals, setVals] = useState({ ...block.params });
  const [name, setName] = useState(block.name);
  const tabs = Array.from(new Set(params.map((p) => p.tab || 'main')));
  const [tab, setTab] = useState(tabs[0] || 'main');
  const set = (k, v) => {
    setVals((o) => ({ ...o, [k]: v }));
    if (running && onTune) onTune({ [k]: v });
  };
  const apply = () => onApply({ params: vals, name: name.trim() || block.name });
  const slider = block.type === 'SliderGain';
  const low = Number(vals.Low ?? 0), high = Number(vals.High ?? 2);
  const desc = masked ? block.mask.description : def ? lbl(lang, def.desc) : '';
  return (
    <SimDialog title={`${tr(lang, 'params')}: ${block.name}`} icon="settings" onClose={onClose} width={480}
      footer={<>
        <button type="button" className="vbtn" onClick={onClose}><SimIcon name="close" size={14} /><span>{tr(lang, 'cancel')}</span></button>
        <button type="button" className="vbtn" onClick={apply}><SimIcon name="update" size={14} /><span>{tr(lang, 'apply')}</span></button>
        <button type="button" className="vbtn vbtn-primary" onClick={() => { apply(); onClose(); }}><SimIcon name="run" size={14} /><span>{tr(lang, 'ok')}</span></button>
      </>}>
      <div className="sim-blockhead">
        <span className="sim-blocktype">{masked ? (block.mask.type || block.type) : (def ? lbl(lang, def.label) : block.type)}</span>
        {desc && <p className="muted sim-desc">{desc}</p>}
      </div>
      <label className="sim-field"><span>{tr(lang, 'name')}</span><input type="text" className="sim-text" value={name} onChange={(e) => setName(e.target.value)} /></label>
      {tabs.length > 1 && <Tabs tabs={tabs.map((id) => ({ id, label: tr(lang, id) }))} value={tab} onChange={setTab} />}
      {!params.length && <p className="muted">{tr(lang, 'noParams')}</p>}
      {/* every tab is laid out in the same cell, so the dialog keeps one size whichever tab is shown */}
      {params.length > 0 && <div className="sim-tabstack">{tabs.map((tb) => (
        <div key={tb} className={tb === tab ? 'on' : 'off'} aria-hidden={tb === tab ? undefined : true}>
          {params.filter((p) => (p.tab || 'main') === tb).map((p) => (
            <label key={p.name} className="sim-field">
              <span title={p.name}>{lbl(lang, p.label) || p.name}</span>
              <ParamField p={p} value={vals[p.name]} lang={lang} onChange={(v) => set(p.name, v)} />
            </label>
          ))}
        </div>
      ))}</div>}
      {slider && Number.isFinite(low) && Number.isFinite(high) && high > low && (
        <label className="sim-field"><span>{tr(lang, 'slider')}</span>
          <input type="range" className="sim-slider" min={low} max={high} step={(high - low) / 200} value={Number(vals.Gain) || 0}
            onChange={(e) => set('Gain', String(Number(Number(e.target.value).toPrecision(6))))} />
        </label>
      )}
    </SimDialog>
  );
}

const SOLVERS = ['auto', 'ode45', 'ode23', 'ode113', 'ode15s', 'ode23s', 'ode23t', 'ode23tb', 'ode1', 'ode2', 'ode3', 'ode4', 'ode5', 'ode8', 'ode14x', 'discrete'];

export function SettingsDialog({ model, lang, onApply, onClose }) {
  const [s, setS] = useState({ ...model.settings });
  const [ws, setWs] = useState((model.workspace || []).map((v) => ({ ...v })));
  const [tab, setTab] = useState('solver');
  const set = (k) => (v) => setS((o) => ({ ...o, [k]: v }));
  const F = (key, p) => (
    <label key={key} className="sim-field"><span>{tr(lang, key)}</span>
      <ParamField p={{ name: key, def: '', type: 'expr', num: true, ...p }} value={s[key]} lang={lang} onChange={set(key)} /></label>
  );
  const B = (key) => <label key={key} className="sim-field"><span>{tr(lang, key)}</span><ParamField p={{ name: key, type: 'bool', def: 'off' }} value={s[key]} lang={lang} onChange={set(key)} /></label>;
  const T = (key, labelKey) => <label key={key} className="sim-field"><span>{tr(lang, labelKey)} — {tr(lang, 'varName')}</span><input type="text" className="sim-text" value={s[key] || ''} onChange={(e) => set(key)(e.target.value)} /></label>;
  return (
    <SimDialog title={`${tr(lang, 'modelSettings')}: ${model.name}`} icon="settings" onClose={onClose} width={560} height={640} className="sim-dialog-fixed"
      footer={<>
        <button type="button" className="vbtn" onClick={onClose}><SimIcon name="close" size={14} /><span>{tr(lang, 'cancel')}</span></button>
        <button type="button" className="vbtn vbtn-primary" onClick={() => { onApply(s, ws.filter((v) => v.name.trim())); onClose(); }}><SimIcon name="run" size={14} /><span>{tr(lang, 'ok')}</span></button>
      </>}>
      <Tabs tabs={[{ id: 'solver', label: tr(lang, 'solverTab') }, { id: 'data', label: tr(lang, 'dataTab') }, { id: 'diag', label: tr(lang, 'diagTab') }, { id: 'ws', label: tr(lang, 'wsTab') }]} value={tab} onChange={setTab} />
      {tab === 'solver' && <>
        {F('startTime', { step: 0.1 })}
        {F('stopTime', { step: 1 })}
        <label className="sim-field"><span>{tr(lang, 'solverType')}</span>
          <IconSelect value={s.solverType} width="100%" onChange={set('solverType')} options={[{ value: 'variable', label: tr(lang, 'variable'), icon: 'waves' }, { value: 'fixed', label: tr(lang, 'fixed'), icon: 'grid' }]} /></label>
        <label className="sim-field"><span>{tr(lang, 'solver')}</span>
          <IconSelect value={s.solver} width="100%" onChange={set('solver')} options={SOLVERS.map((v) => ({ value: v, label: v, icon: v === 'discrete' ? 'hash' : 'flow' }))} /></label>
        {s.solverType === 'fixed' ? F('fixedStep', { step: 0.01 }) : <>
          {F('maxStep', { step: 0.01 })}{F('minStep', { step: 0.001 })}{F('initialStep', { step: 0.001 })}
          {F('relTol', { step: 0.0001 })}{F('absTol', { step: 0.000001 })}
        </>}
        {B('zeroCross')}
        {B('pacing')}
        {s.pacing === 'on' && F('pacingRate', { step: 0.1 })}
      </>}
      {tab === 'data' && <>
        {B('saveTime')}{s.saveTime === 'on' && T('timeName', 'saveTime')}
        {B('saveOutput')}{s.saveOutput === 'on' && T('outputName', 'saveOutput')}
        {B('saveState')}{s.saveState === 'on' && T('stateName', 'saveState')}
        {B('signalLogging')}{s.signalLogging === 'on' && T('logName', 'signalLogging')}
        {B('singleOutput')}{s.singleOutput === 'on' && T('singleOutputName', 'singleOutput')}
        {B('limitPoints')}{s.limitPoints === 'on' && F('maxPoints', { step: 100, min: 1 })}
        {F('decimation', { step: 1, min: 1 })}
      </>}
      {tab === 'diag' && <label className="sim-field"><span>{tr(lang, 'algebraicLoop')}</span>
        <IconSelect value={s.algebraicLoop} width="100%" onChange={set('algebraicLoop')} options={['none', 'warning', 'error'].map((v) => ({ value: v, label: tr(lang, v), icon: v === 'error' ? 'alert' : 'info' }))} /></label>}
      {tab === 'ws' && <div className="sim-wslist">
        {ws.map((v, i) => (
          <div key={i} className="sim-wsrow">
            <input type="text" className="sim-text" placeholder={tr(lang, 'varName')} value={v.name} onChange={(e) => setWs(ws.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
            <input type="text" className="sim-text" placeholder={tr(lang, 'value')} value={v.value} onChange={(e) => setWs(ws.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)))} />
            <button type="button" className="sim-mini" title={tr(lang, 'remove')} onClick={() => setWs(ws.filter((_, k) => k !== i))}><SimIcon name="trash" size={13} /></button>
          </div>
        ))}
        <button type="button" className="vbtn" onClick={() => setWs([...ws, { name: '', value: '0' }])}><SimIcon name="plus" size={14} /><span>{tr(lang, 'addVar')}</span></button>
      </div>}
    </SimDialog>
  );
}

export function MaskEditor({ block, lang, onApply, onClose }) {
  const m0 = block.mask || {};
  const [mask, setMask] = useState({ type: m0.type || '', description: m0.description || '', params: (m0.params || []).map((p) => ({ ...p })), init: m0.init || '', display: m0.display || '' });
  const setP = (i, k, v) => setMask((m) => ({ ...m, params: m.params.map((p, j) => (j === i ? { ...p, [k]: v } : p)) }));
  const types = [{ value: 'edit', label: tr(lang, 'pt_edit'), icon: 'edit' }, { value: 'checkbox', label: tr(lang, 'pt_checkbox'), icon: 'check' }, { value: 'popup', label: tr(lang, 'pt_popup'), icon: 'list' }];
  return (
    <SimDialog title={`${tr(lang, 'mask')}: ${block.name}`} icon="mask" onClose={onClose} width={620}
      footer={<>
        {block.mask && <button type="button" className="vbtn vbtn-danger" onClick={() => { onApply(null); onClose(); }}><SimIcon name="trash" size={14} /><span>{tr(lang, 'removeMask')}</span></button>}
        <span className="spacer" />
        <button type="button" className="vbtn" onClick={onClose}><SimIcon name="close" size={14} /><span>{tr(lang, 'cancel')}</span></button>
        <button type="button" className="vbtn vbtn-primary" onClick={() => { onApply({ ...mask, params: mask.params.filter((p) => p.name.trim()) }); onClose(); }}><SimIcon name="run" size={14} /><span>{tr(lang, 'ok')}</span></button>
      </>}>
      <label className="sim-field"><span>{tr(lang, 'maskType')}</span><input type="text" className="sim-text" value={mask.type} onChange={(e) => setMask({ ...mask, type: e.target.value })} /></label>
      <label className="sim-field"><span>{tr(lang, 'maskDesc')}</span><input type="text" className="sim-text" value={mask.description} onChange={(e) => setMask({ ...mask, description: e.target.value })} /></label>
      <label className="sim-field"><span>{tr(lang, 'maskIcon')}</span><input type="text" className="sim-text" value={mask.display} onChange={(e) => setMask({ ...mask, display: e.target.value })} /></label>
      <div className="sim-subhead">{tr(lang, 'maskParams')}</div>
      <div className="sim-maskgrid">
        <span className="muted">{tr(lang, 'name')}</span><span className="muted">{tr(lang, 'prompt')}</span><span className="muted">{tr(lang, 'type')}</span><span className="muted">{tr(lang, 'value')}</span><span />
        {mask.params.map((p, i) => (
          <React.Fragment key={i}>
            <input type="text" className="sim-text" value={p.name} onChange={(e) => setP(i, 'name', e.target.value.replace(/[^\w]/g, ''))} />
            <input type="text" className="sim-text" value={p.prompt || ''} onChange={(e) => setP(i, 'prompt', e.target.value)} />
            <IconSelect value={p.type || 'edit'} options={types} onChange={(v) => setP(i, 'type', v)} width="100%" />
            <input type="text" className="sim-text" value={p.type === 'popup' ? (p.options || '') : (p.value || '')} placeholder={p.type === 'popup' ? tr(lang, 'options') : ''}
              onChange={(e) => setP(i, p.type === 'popup' ? 'options' : 'value', e.target.value)} />
            <button type="button" className="sim-mini" onClick={() => setMask({ ...mask, params: mask.params.filter((_, j) => j !== i) })}><SimIcon name="trash" size={13} /></button>
          </React.Fragment>
        ))}
      </div>
      <button type="button" className="vbtn" onClick={() => setMask({ ...mask, params: [...mask.params, { name: `p${mask.params.length + 1}`, prompt: '', type: 'edit', value: '1' }] })}><SimIcon name="plus" size={14} /><span>{tr(lang, 'addParam')}</span></button>
      <div className="sim-subhead">{tr(lang, 'maskInit')}</div>
      <textarea className="sim-code" spellCheck={false} rows={5} value={mask.init} onChange={(e) => setMask({ ...mask, init: e.target.value })} />
    </SimDialog>
  );
}
