// The simulation screen's side panes in the app (src/panes/PanelHost.jsx):
//   SimLibraryPane  블록 라이브러리 (left, a tool): the LibraryPanel; drag a
//                   block onto the canvas (DND_TYPE) or double-click to add it.
//   SimTreePane     모델 구조 (right): the systems and subsystems as a tree;
//                   a click opens that level (like the breadcrumbs).
//   BlockPropsPane  블록 속성 (right): the selected block's name, type and
//                   parameters with the block dialog's editors (ParamField);
//                   nothing selected → model settings (solver, start / stop
//                   time, step). Applied through the editor's change() (Undo).
// They talk to the editor of `docId` through editorApi.js only.
import React, { useEffect, useState } from 'react';
import { systemAt } from '../../core/sim/model.js';
import { blockDef } from '../../core/sim/blocks/index.js';
import { LibraryPanel } from './LibraryPanel';
import { ParamField, maskParamDefs, SOLVERS } from './dialogs';
import { IconSelect } from '../views/common';
import { Icon } from '../components/Chrome';
import { tr, lbl } from './i18n';
import { simEditor, subscribeSimEditors } from './editorApi';

/** The editor API of a model document, re-read whenever any editor publishes. */
export function useSimEditor(docId) {
  const [, setTick] = useState(0);
  useEffect(() => subscribeSimEditors(() => setTick((n) => n + 1)), []);
  return docId ? simEditor(docId) : null;
}

function NoModel({ lang, text }) {
  return <div className="pane-empty small muted"><Icon name="model" size={14} />{text || tr(lang, 'px_no_model')}</div>;
}

const MemoLibrary = React.memo(LibraryPanel, (a, b) => a.lang === b.lang && a.onAdd === b.onAdd);

export function SimLibraryPane({ docId, lang }) {
  const api = useSimEditor(docId);
  const apiRef = React.useRef(api);
  apiRef.current = api;
  // one stable handler: the memoised library does not redraw its previews on every edit
  const [onAdd] = useState(() => (item) => { if (apiRef.current) apiRef.current.addItem(item); });
  return <div className="pane sim-side-lib" data-has-model={api ? 'yes' : 'no'}><MemoLibrary lang={lang} onAdd={onAdd} /></div>;
}

function subsystemsOf(sys) {
  return (sys.blocks || []).filter((b) => b.system).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export function SimTreePane({ docId, lang, noModelText }) {
  const api = useSimEditor(docId);
  const [closed, setClosed] = useState({});
  if (!api) return <div className="pane"><NoModel lang={lang} text={noModelText} /></div>;
  const cur = (api.crumbs || []).join('/');
  const node = (sys, path, depth, label, icon, count) => {
    const key = path.join('/');
    const kids = subsystemsOf(sys);
    const open = !closed[key];
    return (
      <React.Fragment key={key || '/'}>
        <div className={`sim-tree-row ${key === cur ? 'on' : ''}`} style={{ paddingLeft: 4 + depth * 14 }}>
          {kids.length ? (
            <button type="button" className={`cf-twisty ${open ? 'open' : ''}`} aria-label={open ? 'collapse' : 'expand'} onClick={() => setClosed((c) => ({ ...c, [key]: open }))}><Icon name="chevronRight" size={12} /></button>
          ) : <span className="cf-twisty-sp" />}
          <button type="button" className="sim-tree-link" title={label} onClick={() => api.openPath(path)}>
            <Icon name={icon} size={14} /><span className="ellipsis">{label}</span><span className="small muted">{count}</span>
          </button>
        </div>
        {open && kids.map((b) => node(b.system, [...path, b.id], depth + 1, b.name, b.mask ? 'mask' : 'subsystem', (b.system.blocks || []).length))}
      </React.Fragment>
    );
  };
  return (
    <div className="pane sim-tree" data-model={api.name}>
      <div className="pane-scroll">{node(api.model.root, [], 0, api.name, 'model', (api.model.root.blocks || []).length)}</div>
    </div>
  );
}

/** Draft values with 적용 / 되돌리기 (and Enter); a running model is tuned live like the dialog. */
function useDraft(source, key) {
  const [draft, setDraft] = useState(source);
  useEffect(() => { setDraft(source); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return [draft, setDraft];
}

export function BlockPropsPane({ docId, lang, noModelText }) {
  const api = useSimEditor(docId);
  if (!api) return <div className="pane"><NoModel lang={lang} text={noModelText} /></div>;
  const sys = systemAt(api.model, api.crumbs) || api.model.root;
  const picked = (api.selected || []).map((id) => sys.blocks.find((b) => b.id === id)).filter(Boolean);
  if (picked.length > 1) return <div className="pane"><div className="pane-empty small muted"><Icon name="cube" size={14} />{tr(lang, 'px_n_selected', { n: picked.length })}</div></div>;
  if (picked.length === 1) return <BlockProps key={`${api.docId}:${picked[0].id}`} api={api} block={picked[0]} lang={lang} />;
  return <ModelSettings key={api.docId} api={api} lang={lang} />;
}

function BlockProps({ api, block, lang }) {
  const def = blockDef(block.type);
  const masked = !!(block.mask && (block.mask.params || []).length);
  const params = masked ? maskParamDefs(block.mask) : (def ? def.params : []);
  const srcKey = JSON.stringify([block.name, block.params]);
  const [vals, setVals] = useDraft({ ...block.params }, srcKey);
  const [name, setName] = useDraft(block.name, srcKey);
  const changed = name !== block.name || JSON.stringify(vals) !== JSON.stringify(block.params);
  const set = (k, v) => { setVals((o) => ({ ...o, [k]: v })); if (api.running) api.tune(block.id, { [k]: v }); };
  const apply = () => api.setBlock(block.id, { params: vals, name });
  const desc = masked ? block.mask.description : def ? lbl(lang, def.desc) : '';
  return (
    <div className="pane sim-props" data-block={block.id} onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); apply(); } }}>
      <div className="pane-tools">
        <Icon name={block.system ? 'subsystem' : 'cube'} size={14} />
        <span className="small ellipsis sim-props-type" title={desc}>{masked ? (block.mask.type || block.type) : (def ? lbl(lang, def.label) : block.type)}</span>
        <span className="spacer" />
        <button type="button" className="icon-btn" title={tr(lang, 'params')} aria-label={tr(lang, 'params')} onClick={() => api.openBlock(block.id)}><Icon name="settings" size={13} /></button>
      </div>
      <div className="pane-scroll">
        {desc && <p className="muted small sim-props-desc">{desc}</p>}
        <label className="sim-field"><span>{tr(lang, 'name')}</span><input type="text" className="sim-text" value={name} spellCheck={false} onChange={(e) => setName(e.target.value)} /></label>
        {!params.length && <p className="muted small sim-props-desc">{tr(lang, 'noParams')}</p>}
        {params.map((p) => (
          <label key={p.name} className="sim-field">
            <span title={p.name}>{lbl(lang, p.label) || p.name}</span>
            <ParamField p={p} value={vals[p.name]} lang={lang} onChange={(v) => set(p.name, v)} />
          </label>
        ))}
      </div>
      <Footer lang={lang} changed={changed} onApply={apply} onRevert={() => { setVals({ ...block.params }); setName(block.name); }} />
    </div>
  );
}

function Footer({ lang, changed, onApply, onRevert, extra }) {
  return (
    <div className="pane-tools sim-props-foot">
      {extra}
      <span className="spacer" />
      <button type="button" className="vbtn vbtn-sm" disabled={!changed} onClick={onRevert}><Icon name="undo" size={13} /><span>{tr(lang, 'px_revert')}</span></button>
      <button type="button" className="vbtn vbtn-sm vbtn-primary" disabled={!changed} onClick={onApply}><Icon name="refresh" size={13} /><span>{tr(lang, 'apply')}</span></button>
    </div>
  );
}

function ModelSettings({ api, lang }) {
  const st = api.model.settings || {};
  const srcKey = JSON.stringify(st);
  const [s, setS] = useDraft({ ...st }, srcKey);
  const fixed = s.solverType === 'fixed';
  const keys = ['startTime', 'stopTime', 'solverType', 'solver', fixed ? 'fixedStep' : 'maxStep'];
  const changed = keys.some((k) => String(s[k] ?? '') !== String(st[k] ?? ''));
  const set = (k) => (v) => setS((o) => ({ ...o, [k]: v }));
  const F = (key, step) => (
    <label key={key} className="sim-field"><span>{tr(lang, key)}</span>
      <ParamField p={{ name: key, def: '', type: 'expr', num: true, step }} value={s[key]} lang={lang} onChange={set(key)} /></label>
  );
  const apply = () => api.setSettings(Object.fromEntries(keys.map((k) => [k, s[k]])));
  return (
    <div className="pane sim-props" data-settings={api.name} onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); apply(); } }}>
      <div className="pane-tools"><Icon name="settings" size={14} /><span className="small ellipsis">{tr(lang, 'modelSettings')}: {api.name}</span></div>
      <div className="pane-scroll">
        <p className="muted small sim-props-desc">{tr(lang, 'px_no_block')}</p>
        {F('startTime', 0.1)}
        {F('stopTime', 1)}
        <label className="sim-field"><span>{tr(lang, 'solverType')}</span>
          <IconSelect value={s.solverType || 'variable'} width="100%" onChange={set('solverType')} options={[{ value: 'variable', label: tr(lang, 'variable'), icon: 'waves' }, { value: 'fixed', label: tr(lang, 'fixed'), icon: 'grid' }]} /></label>
        <label className="sim-field"><span>{tr(lang, 'solver')}</span>
          <IconSelect value={s.solver || 'auto'} width="100%" onChange={set('solver')} options={SOLVERS.map((v) => ({ value: v, label: v, icon: v === 'discrete' ? 'hash' : 'flow' }))} /></label>
        {fixed ? F('fixedStep', 0.01) : F('maxStep', 0.01)}
      </div>
      <Footer lang={lang} changed={changed} onApply={apply} onRevert={() => setS({ ...st })}
        extra={<button type="button" className="vbtn vbtn-sm" onClick={() => api.openSettings()}><Icon name="settings" size={13} /><span>{tr(lang, 'px_all_settings')}</span></button>} />
    </div>
  );
}
