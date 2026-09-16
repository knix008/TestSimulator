// Settings › Prompt — sized to fit the settings window without scrolling.
//
//   1. Preview of the current prompt (three sample states).
//   2. Presets: a card per preset, drawn with the real renderer; click = apply.
//   3. Simple options: which segments to show, shape, path style, two lines.
//      They edit the current theme in place (segments are switched off, not
//      removed, so a preset's colours and templates survive).
//   4. "고급 편집" (optional): a master–detail editor — segment list on the
//      left, the selected segment's fields on the right — plus oh-my-posh
//      JSON import / export.
// Every change goes to onChange; the settings dialog applies it right away.
import React, { useMemo, useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { PRESETS, SEGMENT_TYPES, SEGMENT_STYLES, SAMPLE_STATES, normalizePrompt, clonePrompt, importOmp, exportOmp, defaultTemplate } from '../lib/prompt';
import { Prompt } from '../components/Prompt';
import { Icon } from '../components/Icons';
import { call, isElectron, writeClipboardText } from '../lib/backend';

const PATH_STYLES = ['full', 'folder', 'agnoster', 'agnoster_full', 'agnoster_short', 'agnoster_left', 'letter', 'mixed', 'unique'];
// Order and default colours of the segments the simple switches can add.
const QUICK = [
  ['os', '#0077c2', '#ffffff'], ['session', '#c386f1', '#ffffff'], ['shell', '#5c6bc0', '#ffffff'], ['path', '#ff479c', '#ffffff'],
  ['git', 'auto', '#1b1e24'], ['executiontime', '#83769c', '#ffffff'], ['status', '#00897b', '#ffffff'], ['time', '#2e9599', '#ffffff'],
];
const QUICK_ORDER = QUICK.map((q) => q[0]);

function ColorField({ value, onChange }) {
  const hex = /^#[0-9a-fA-F]{6}$/.test(value || '') ? value : '#888888';
  return (
    <span className="pe-color">
      <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} title={t('pe_pick_color')} />
      <input className="mono" value={value || ''} onChange={(e) => onChange(e.target.value)} spellCheck={false} list="pe-color-names" />
    </span>
  );
}

// The right-hand side of the advanced editor: everything about one segment.
function SegmentFields({ seg, onChange }) {
  const set = (k, v) => onChange({ ...seg, [k]: v });
  const setProp = (k, v) => onChange({ ...seg, properties: { ...(seg.properties || {}), [k]: v } });
  const p = seg.properties || {};
  const lines = (arr) => (Array.isArray(arr) ? arr.join('\n') : '');
  const fromLines = (txt) => { const a = txt.split('\n').map((x) => x.trim()).filter(Boolean); return a.length ? a : undefined; };
  return (
    <div className="pe-fields form-grid">
      <label>{t('pe_type')}</label>
      <div className="row">
        <select value={seg.type} onChange={(e) => onChange({ ...seg, type: e.target.value, template: defaultTemplate(e.target.value), properties: {} })}>
          {SEGMENT_TYPES.map((x) => <option key={x} value={x}>{t(`pe_type_${x}`)}</option>)}
        </select>
        <select value={seg.style} onChange={(e) => set('style', e.target.value)}>
          {SEGMENT_STYLES.map((x) => <option key={x} value={x}>{t(`pe_style_${x}`)}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={seg.enabled !== false} onChange={(e) => set('enabled', e.target.checked)} /> {t('pe_enabled')}</label>
      </div>
      <label>{t('pe_colors')}</label>
      <div className="row"><ColorField value={seg.foreground} onChange={(v) => set('foreground', v)} /><ColorField value={seg.background} onChange={(v) => set('background', v)} /></div>
      <label>{t('pe_template')}</label>
      <textarea className="mono" rows={1} value={seg.template} onChange={(e) => set('template', e.target.value)} spellCheck={false} />
      <label>{t('pe_bg_templates')}</label>
      <textarea className="mono" rows={1} value={lines(seg.background_templates)} onChange={(e) => set('background_templates', fromLines(e.target.value))} spellCheck={false} placeholder='{{ if .Working.Changed }}#ff9248{{ end }}' />
      {seg.type === 'path' && <>
        <label>{t('pe_path_style')}</label>
        <div className="row">
          <select value={p.style || 'full'} onChange={(e) => setProp('style', e.target.value)}>{PATH_STYLES.map((x) => <option key={x} value={x}>{x}</option>)}</select>
          <span className="muted small">{t('pe_max_depth')}</span><input type="number" min="1" max="20" value={p.max_depth || 1} onChange={(e) => setProp('max_depth', Number(e.target.value))} style={{ width: 60 }} />
          <span className="muted small">{t('pe_folder_sep')}</span><input className="mono" value={p.folder_separator_icon === undefined ? '' : p.folder_separator_icon} placeholder={t('pe_folder_sep_hint')} onChange={(e) => setProp('folder_separator_icon', e.target.value)} style={{ width: 70 }} />
        </div>
      </>}
      {seg.type === 'git' && <><label>{t('pe_branch_icon')}</label><input className="mono" value={p.branch_icon === undefined ? '⎇ ' : p.branch_icon} onChange={(e) => setProp('branch_icon', e.target.value)} style={{ width: 120 }} /></>}
      {seg.type === 'status' && <><span /><label className="check"><input type="checkbox" checked={!!p.always_enabled} onChange={(e) => setProp('always_enabled', e.target.checked)} /> {t('pe_always_enabled')}</label></>}
      {seg.type === 'executiontime' && <><label>{t('pe_threshold')}</label><input type="number" min="0" value={p.threshold === undefined ? 500 : p.threshold} onChange={(e) => setProp('threshold', Number(e.target.value))} style={{ width: 100 }} /></>}
      {seg.type === 'os' && <><label>{t('pe_os_icons')}</label><div className="row"><input className="mono" placeholder="windows" value={p.windows || ''} onChange={(e) => setProp('windows', e.target.value)} style={{ width: 70 }} /><input className="mono" placeholder="macos" value={p.macos || ''} onChange={(e) => setProp('macos', e.target.value)} style={{ width: 70 }} /><input className="mono" placeholder="linux" value={p.linux || ''} onChange={(e) => setProp('linux', e.target.value)} style={{ width: 70 }} /></div></>}
      {seg.style === 'diamond' && <><label>{t('pe_diamonds')}</label><div className="row"><input className="mono" value={seg.leading_diamond} onChange={(e) => set('leading_diamond', e.target.value)} style={{ width: 60 }} /><input className="mono" value={seg.trailing_diamond} onChange={(e) => set('trailing_diamond', e.target.value)} style={{ width: 60 }} /></div></>}
      <span />
      <span className="muted small pe-vars ellipsis" title={t(`pe_vars_${seg.type}`)}>{t(`pe_vars_${seg.type}`)}</span>
    </div>
  );
}

export function PromptEditor({ value, onChange, pickFile }) {
  useLanguage();
  const lang = getLanguage();
  const cfg = useMemo(() => normalizePrompt(value), [value]);
  const advanced = true;   // the detail editor always fills the rest of the (fixed-size) window
  const [sel, setSel] = useState({ b: 0, s: 0 });
  const [json, setJson] = useState('');
  const [note, setNote] = useState('');
  const update = (fn) => { const c = clonePrompt(cfg); fn(c); onChange(normalizePrompt(c)); };
  const allSegs = cfg.blocks.flatMap((b) => b.segments);
  const styleOf = allSegs.find((s) => s.type !== 'text') ? allSegs.find((s) => s.type !== 'text').style : 'powerline';
  const pathSeg = allSegs.find((s) => s.type === 'path');
  const presetLabel = (id) => (PRESETS[id] ? (lang === 'ko' ? PRESETS[id].label : PRESETS[id].labelEn) : '');
  const modified = !!(cfg.preset && PRESETS[cfg.preset]) && JSON.stringify(cfg) !== JSON.stringify(normalizePrompt(PRESETS[cfg.preset].config));

  // ── Presets ──
  const applyPreset = (id) => { onChange(clonePrompt(PRESETS[id].config)); setSel({ b: 0, s: 0 }); setNote(''); };

  // ── Simple options ──
  const hasType = (ty) => allSegs.some((s) => s.type === ty && s.enabled !== false);
  const toggleType = (ty, on) => update((c) => {
    const segs = c.blocks.flatMap((b) => b.segments).filter((s) => s.type === ty);
    if (segs.length) { for (const s of segs) s.enabled = on; return; }
    if (!on) return;
    // Not in the theme yet: add one in the usual order, in the theme's shape and colours.
    const [, bg, fg] = QUICK.find((q) => q[0] === ty);
    const seg = { type: ty, enabled: true, style: styleOf, powerline_symbol: '', foreground: styleOf === 'plain' ? (ty === 'git' ? 'auto' : 'foreground') : fg, background: styleOf === 'plain' ? 'transparent' : bg, template: defaultTemplate(ty), properties: ty === 'status' ? { always_enabled: true } : {} };
    const block = c.blocks[0].segments;
    const rank = QUICK_ORDER.indexOf(ty);
    let at = block.findIndex((s) => QUICK_ORDER.indexOf(s.type) > rank && s.type !== 'text');
    if (at < 0) { const lastText = block.length && block[block.length - 1].type === 'text' ? block.length - 1 : block.length; at = lastText; }
    block.splice(at, 0, seg);
  });
  const setShape = (style) => update((c) => { for (const b of c.blocks) for (const s of b.segments) { if (s.type === 'text' && style !== 'plain') continue; s.style = style; if (style === 'plain') { s.background = 'transparent'; if (s.foreground === 'background') s.foreground = 'accent'; } else if (s.background === 'transparent') s.background = (QUICK.find((q) => q[0] === s.type) || [0, 'accent'])[1]; } });
  const setPathStyle = (st) => update((c) => { for (const b of c.blocks) for (const s of b.segments) if (s.type === 'path') s.properties = { ...(s.properties || {}), style: st, max_depth: st === 'agnoster_short' ? 3 : (s.properties && s.properties.max_depth) || 1 }; });
  const twoLines = cfg.blocks.length > 1;
  const setTwoLines = (on) => update((c) => {
    if (on && c.blocks.length === 1) c.blocks.push({ type: 'prompt', alignment: 'left', newline: true, segments: [{ type: 'status', enabled: true, style: 'plain', foreground: '#7CFC8B', background: 'transparent', foreground_templates: ['{{ if gt .Code 0 }}#ff5c5c{{ end }}'], template: '❯', properties: { always_enabled: true } }] });
    else if (!on && c.blocks.length > 1) { const first = c.blocks[0]; for (const b of c.blocks.slice(1)) for (const s of b.segments) if (s.type !== 'status' || s.template !== '❯') first.segments.push(s); c.blocks = [first]; }
  });

  // ── Advanced: import / export ──
  const doImport = (text) => {
    try { const { config, mapped, skipped } = importOmp(text); onChange(config); setSel({ b: 0, s: 0 }); setNote(t('pe_imported', { n: mapped, skipped: skipped.length ? skipped.join(', ') : '-' })); }
    catch (err) { setNote(t('pe_import_failed', { msg: err.message })); }
  };
  const importFile = async () => {
    try {
      const p = await pickFile(undefined, [{ name: 'oh-my-posh theme', extensions: ['json', 'omp.json'] }, { name: 'All files', extensions: ['*'] }]);
      if (!p) return;
      const r = await call('fs.readFile', { path: p });
      if (r.kind !== 'text') throw new Error('not a text file');
      doImport(r.text);
    } catch (err) { setNote(t('pe_import_failed', { msg: err.message })); }
  };
  const doExport = async () => { await writeClipboardText(exportOmp(cfg)); setNote(t('pe_exported')); };
  const selected = cfg.blocks[sel.b] && cfg.blocks[sel.b].segments[sel.s] ? cfg.blocks[sel.b].segments[sel.s] : null;
  const newSeg = (type) => ({ type, enabled: true, style: styleOf, powerline_symbol: '', foreground: '#ffffff', background: (QUICK.find((q) => q[0] === type) || [0, '#4cc9f0'])[1], template: defaultTemplate(type), properties: {} });
  const swatch = (s) => (s.background && s.background !== 'transparent' && /^#/.test(s.background) ? s.background : 'var(--bg-hover)');

  return (
    <div className="prompt-editor">
      <datalist id="pe-color-names">{['accent', 'foreground', 'background', 'auto', 'transparent', 'parentBackground'].map((x) => <option key={x} value={x} />)}</datalist>

      {/* 1. preview */}
      <pre className="term-out pe-preview-out">
        {['clean', 'dirty', 'plain'].map((k) => (
          <React.Fragment key={k}><Prompt config={cfg} state={SAMPLE_STATES[k]} title={t(`pe_sample_${k}`)} /><span className="muted">{t(`pe_sample_${k}`)}</span>{'\n'}</React.Fragment>
        ))}
      </pre>

      {/* 2. presets */}
      <div className="pe-section-title">{t('pe_presets')} <span className="muted small">{cfg.preset && PRESETS[cfg.preset] ? t(modified ? 'pe_current_modified' : 'pe_current', { name: presetLabel(cfg.preset) }) : t('pe_custom')}</span></div>
      <div className="pe-presets">
        {Object.entries(PRESETS).map(([id, p]) => (
          <button type="button" key={id} className={`pe-preset ${cfg.preset === id ? 'active' : ''}`} onClick={() => applyPreset(id)} title={lang === 'ko' ? p.label : p.labelEn}>
            <pre className="term-out pe-preset-out"><Prompt config={p.config} state={SAMPLE_STATES.mini} /></pre>
            <span className="pe-preset-name ellipsis">{lang === 'ko' ? p.label : p.labelEn}</span>
          </button>
        ))}
      </div>

      {/* 3. simple options */}
      <div className="pe-section-title">{t('pe_customize')}</div>
      <div className="pe-quick">
        <span className="muted small">{t('pe_show')}</span>
        {QUICK.map(([ty]) => <label key={ty} className="check"><input type="checkbox" checked={hasType(ty)} onChange={(e) => toggleType(ty, e.target.checked)} /> {t(`pe_type_${ty}`)}</label>)}
      </div>
      <div className="pe-quick">
        <span className="muted small">{t('pe_shape')}</span>
        <select value={styleOf} onChange={(e) => setShape(e.target.value)}>{SEGMENT_STYLES.map((x) => <option key={x} value={x}>{t(`pe_style_${x}`)}</option>)}</select>
        <span className="muted small">{t('pe_path_style')}</span>
        <select value={(pathSeg && pathSeg.properties && pathSeg.properties.style) || 'full'} onChange={(e) => setPathStyle(e.target.value)} disabled={!pathSeg}>
          {[['full', t('pe_path_full')], ['folder', t('pe_path_folder')], ['agnoster_short', t('pe_path_short')], ['agnoster', t('pe_path_agnoster')]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={twoLines} onChange={(e) => setTwoLines(e.target.checked)} /> {t('pe_two_lines')}</label>
      </div>
      <div className="pe-section-title">{t('pe_advanced')}</div>

      {/* 4. advanced: master–detail + import/export */}
      {advanced && (
        <div className="pe-advanced">
          <div className="pe-list">
            <div className="pe-list-rows">
            {cfg.blocks.map((b, bi) => (
              <React.Fragment key={bi}>
                <div className="pe-list-block">
                  <span>{t('pe_block', { n: bi + 1 })}</span>
                  {bi > 0 && <button type="button" className="icon-btn" title={t('pe_remove_block')} onClick={() => update((c) => { c.blocks.splice(bi, 1); })}><Icon name="close" size={11} /></button>}
                </div>
                {b.segments.map((sg, si) => (
                  <button type="button" key={si} className={`pe-list-row ${sel.b === bi && sel.s === si ? 'active' : ''} ${sg.enabled === false ? 'off' : ''}`} onClick={() => setSel({ b: bi, s: si })}>
                    <span className="pe-swatch" style={{ background: swatch(sg) }} /><span className="ellipsis">{t(`pe_type_${sg.type}`)}{sg.type === 'text' ? ` "${sg.template.trim().slice(0, 12)}"` : ''}</span>
                  </button>
                ))}
              </React.Fragment>
            ))}
            </div>
            <div className="pe-list-tools">
              <select value="" onChange={(e) => { const ty = e.target.value; if (ty) update((c) => { const b = c.blocks[Math.min(sel.b, c.blocks.length - 1)]; b.segments.push(newSeg(ty)); setSel({ b: Math.min(sel.b, c.blocks.length - 1), s: b.segments.length - 1 }); }); }}>
                <option value="">{t('pe_add_segment')}</option>
                {SEGMENT_TYPES.map((x) => <option key={x} value={x}>{t(`pe_type_${x}`)}</option>)}
              </select>
              <button type="button" className="icon-btn" title={t('pe_up')} disabled={!selected || sel.s === 0} onClick={() => update((c) => { const a = c.blocks[sel.b].segments; [a[sel.s - 1], a[sel.s]] = [a[sel.s], a[sel.s - 1]]; setSel({ b: sel.b, s: sel.s - 1 }); })}><Icon name="up" size={13} /></button>
              <button type="button" className="icon-btn" title={t('pe_down')} disabled={!selected || sel.s >= cfg.blocks[sel.b].segments.length - 1} onClick={() => update((c) => { const a = c.blocks[sel.b].segments; [a[sel.s + 1], a[sel.s]] = [a[sel.s], a[sel.s + 1]]; setSel({ b: sel.b, s: sel.s + 1 }); })}><Icon name="chevronDown" size={13} /></button>
              <button type="button" className="icon-btn" title={t('pe_remove')} disabled={!selected} onClick={() => update((c) => { c.blocks[sel.b].segments.splice(sel.s, 1); setSel({ b: sel.b, s: Math.max(0, sel.s - 1) }); })}><Icon name="close" size={13} /></button>
              <button type="button" className="icon-btn" title={t('pe_add_block')} onClick={() => update((c) => { c.blocks.push({ type: 'prompt', alignment: 'left', newline: true, segments: [newSeg('text')] }); setSel({ b: c.blocks.length - 1, s: 0 }); })}><Icon name="plus" size={13} /></button>
            </div>
          </div>
          <div className="pe-detail">
            {selected
              ? <SegmentFields seg={selected} onChange={(ns) => update((c) => { c.blocks[sel.b].segments[sel.s] = ns; })} />
              : <div className="muted small">{t('pe_select_hint')}</div>}
          </div>
        </div>
      )}
      {advanced && (
        <div className="pe-quick">
          <span className="muted small">oh-my-posh</span>
          {isElectron && pickFile && <button type="button" className="btn small" onClick={importFile}><Icon name="folderOpen" size={13} /> {t('pe_import_file')}</button>}
          <input className="mono" value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} placeholder={t('pe_paste_json')} style={{ flex: 1, minWidth: 120 }} />
          <button type="button" className="btn small" disabled={!json.trim()} onClick={() => { doImport(json); setJson(''); }}>{t('pe_import')}</button>
          <button type="button" className="btn small" onClick={doExport}><Icon name="clipboard" size={13} /> {t('pe_export')}</button>
          <label className="check"><input type="checkbox" checked={cfg.final_space !== false} onChange={(e) => update((c) => { c.final_space = e.target.checked; })} /> {t('pe_final_space')}</label>
        </div>
      )}
      {advanced && <div className="pe-note muted small ellipsis" title={note}>{note || ' '}</div>}
    </div>
  );
}

export default PromptEditor;
