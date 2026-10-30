// The tabs of the settings window. Each tab is a function of the shared
// draft (d / set) and fits the fixed-size window without scrolling.
import React, { useEffect, useState } from 'react';
import { t, getLanguage } from '../../lib/i18n';
import { THEMES, CUSTOM_COLOR_KEYS, baseColorsOf, themeById } from '../../themes';
import { isDesktop, mAssociation } from '../../lib/backend';
import { Icon } from '../../components/Chrome';
import { languageOptions } from '../../components/Flags';
import { ThemePicker } from '../../components/ThemePicker';
import { Btn, BtnGroup, IconSelect, Stepper, Toggle, FilePickButton, saveText } from '../common';
import { MONO_FONTS } from '../../lib/settings';
import { ShortcutGroups } from '../Shortcuts';
import { chooseFile } from '../../lib/prompt';
import { ANIMATION_KINDS, ANIMATION_ICONS, DEFAULT_START_BACKGROUND } from '../../lib/startBackground';

export function Row({ icon, label, title, children, wide }) {
  return (
    <div className={`st-row ${wide ? 'wide' : ''}`} title={title}>
      <span className="st-label"><Icon name={icon} size={14} /><span>{label}</span></span>
      <div className="st-field">{children}</div>
    </div>
  );
}

const themeName = (th) => (getLanguage() === 'ko' ? th.label : th.labelEn || th.label);
const fontOptions = () => MONO_FONTS.map((f) => ({ value: f, label: f, icon: 'code' }));

// ── 일반 ──────────────────────────────────────────────────
export function GeneralTab({ d, set, previewLanguage, previewTheme }) {
  const [assoc, setAssoc] = useState(null);
  useEffect(() => { mAssociation().then(setAssoc); }, []);
  return (
    <>
      <Row icon="globe" label={t('language')} title={t('st_live_hint')}>
        <IconSelect value={d.language} width={220} ariaLabel={t('language')} onChange={previewLanguage} options={languageOptions()} />
      </Row>
      <Row icon="palette" label={t('st_theme')} title={t('st_live_hint')}>
        <IconSelect value={d.theme} width={220} ariaLabel={t('st_theme')} onChange={previewTheme}
          options={[...THEMES, ...d.customThemes.map((c) => ({ ...c, labelEn: c.label }))].map((th) => ({ value: th.id, label: themeName(th), icon: th.mode === 'light' ? 'sun' : 'palette' }))} />
      </Row>
      <Row icon="folder" label={t('st_start_folder')} title={t('st_start_folder_hint')}>
        <span className="st-inline">
          <input className="mono" value={d.startFolder} placeholder={t('st_start_folder_ph')} onChange={(e) => set({ startFolder: e.target.value })} />
          <Btn icon="folder" label={t('st_browse')} onClick={async () => { const p = await chooseFile({ mode: 'folder', start: d.startFolder || undefined }); if (p) set({ startFolder: p }); }} />
        </span>
      </Row>
      <Row icon="file" label={t('st_restore_files')}><Toggle icon="file" label={t('st_restore_files_toggle')} checked={d.restoreFiles} onChange={(v) => set({ restoreFiles: v })} /></Row>
      <Row icon="save" label={t('st_confirm_exit')}><Toggle icon="save" label={t('st_confirm_exit_toggle')} checked={d.confirmExit} onChange={(v) => set({ confirmExit: v })} /></Row>
      {isDesktop && assoc !== null && (
        <Row icon="link" label={t('st_m_assoc')} title={t('st_m_assoc_hint')}>
          <Toggle icon="script" label={t('st_m_assoc_toggle')} checked={d.mAssociation == null ? assoc : d.mAssociation} onChange={(v) => set({ mAssociation: v })} />
        </Row>
      )}
    </>
  );
}

// ── 테마 ──────────────────────────────────────────────────
export function ThemeTab({ d, previewTheme, goCustom }) {
  return (
    <>
      <div className="st-current"><Icon name="palette" size={14} /><span>{t('st_current_theme')}: <strong>{themeName(themeById(d.theme))}</strong></span><span className="small">{t('st_live_hint')}</span></div>
      <ThemePicker value={d.theme} onPick={previewTheme} onNewCustom={() => goCustom(true)} onEditCustom={() => goCustom(false)} />
    </>
  );
}

// ── 명령 창 ───────────────────────────────────────────────
export function CommandTab({ d, set }) {
  const c = d.cmd;
  const setC = (p) => set({ cmd: { ...c, ...p } });
  return (
    <>
      <Row icon="code" label={t('st_font')}><IconSelect value={c.fontFamily} width={220} ariaLabel={t('st_font')} onChange={(v) => setC({ fontFamily: v })} options={fontOptions()} /></Row>
      <Row icon="hash" label={t('st_font_size')}><Stepper value={c.fontSize} min={8} max={32} ariaLabel={t('st_font_size')} unit="px" onChange={(v) => setC({ fontSize: v })} /></Row>
      <Row icon="hash" label={t('st_numeric_format')} title={t('st_numeric_format_hint')}>
        <IconSelect value={c.numericFormat} width={220} ariaLabel={t('st_numeric_format')} onChange={(v) => setC({ numericFormat: v })}
          options={[['short', 'st_fmt_short'], ['long', 'st_fmt_long'], ['shortE', 'st_fmt_shorte'], ['longE', 'st_fmt_longe'], ['shortG', 'st_fmt_shortg'], ['longG', 'st_fmt_longg'], ['rat', 'st_fmt_rat'], ['hex', 'st_fmt_hex']].map(([v, k]) => ({ value: v, label: t(k), icon: 'hash' }))} />
      </Row>
      <Row icon="list" label={t('st_spacing')}><Toggle icon="list" label={t('st_compact')} checked={c.compact} onChange={(v) => setC({ compact: v })} /></Row>
      <Row icon="history" label={t('st_scrollback')}><Stepper value={c.scrollback} min={500} max={50000} step={500} width={80} ariaLabel={t('st_scrollback')} onChange={(v) => setC({ scrollback: v })} /></Row>
      <div className="st-preview mono" style={{ fontFamily: `"${c.fontFamily}", monospace`, fontSize: c.fontSize }}>
        <div>{'>> x = pi'}</div>{!c.compact && <div>&nbsp;</div>}
        <div>x =</div>{!c.compact && <div>&nbsp;</div>}
        <div>{c.numericFormat.startsWith('long') ? '   3.141592653589793' : '    3.1416'}</div>
      </div>
    </>
  );
}

// ── 편집기 ────────────────────────────────────────────────
export function EditorTab({ d, set }) {
  const e = d.editor;
  const setE = (p) => set({ editor: { ...e, ...p } });
  return (
    <>
      <Row icon="code" label={t('st_font')}><IconSelect value={e.fontFamily} width={220} ariaLabel={t('st_font')} onChange={(v) => setE({ fontFamily: v })} options={fontOptions()} /></Row>
      <Row icon="hash" label={t('st_font_size')}><Stepper value={e.fontSize} min={8} max={32} ariaLabel={t('st_font_size')} unit="px" onChange={(v) => setE({ fontSize: v })} /></Row>
      <Row icon="indent" label={t('st_tab_size')}><Stepper value={e.tabSize} min={1} max={8} ariaLabel={t('st_tab_size')} onChange={(v) => setE({ tabSize: v })} /></Row>
      <Row icon="list" label={t('st_line_numbers')}><Toggle icon="list" label={t('st_line_numbers_toggle')} checked={e.lineNumbers !== false} onChange={(v) => setE({ lineNumbers: v })} /></Row>
      <Row icon="unfold" label={t('st_wrap')}><Toggle icon="unfold" label={t('st_wrap_toggle')} checked={!!e.wrap} onChange={(v) => setE({ wrap: v })} /></Row>
      <Row icon="save" label={t('st_autosave')}>
        <span className="st-inline">
          <Toggle icon="save" label={t('st_autosave_toggle')} checked={!!e.autosave} onChange={(v) => setE({ autosave: v })} />
          <Stepper value={e.autosaveSec} min={5} max={600} step={5} width={60} disabled={!e.autosave} ariaLabel={t('st_autosave_sec')} unit={t('st_seconds')} onChange={(v) => setE({ autosaveSec: v })} />
        </span>
      </Row>
    </>
  );
}

// ── 그림 ──────────────────────────────────────────────────
export function FiguresTab({ d, set }) {
  const f = d.figures;
  const setF = (p) => set({ figures: { ...f, ...p } });
  return (
    <>
      <Row icon="figure" label={t('st_renderer')} title={t('st_renderer_hint')}>
        <IconSelect value={f.renderer} width={220} ariaLabel={t('st_renderer')} onChange={(v) => setF({ renderer: v })}
          options={[{ value: 'canvas', label: t('st_renderer_canvas'), icon: 'image' }, { value: 'svg', label: t('st_renderer_svg'), icon: 'edit' }, { value: 'webgl', label: t('st_renderer_webgl'), icon: 'layers' }]} />
      </Row>
      <Row icon="grid" label={t('st_grid')}><Toggle icon="grid" label={t('st_grid_toggle')} checked={!!f.grid} onChange={(v) => setF({ grid: v })} /></Row>
      <Row icon="scale" label={t('st_rulers')}><Toggle icon="scale" label={t('st_rulers_toggle')} checked={!!f.rulers} onChange={(v) => setF({ rulers: v })} /></Row>
      <p className="small muted">{t('st_figures_note')}</p>
    </>
  );
}

// ── 시뮬레이션 ────────────────────────────────────────────
export const SOLVERS = ['ode45', 'ode23', 'ode113', 'ode15s', 'ode23s', 'ode23t', 'ode23tb', 'ode4', 'ode1', 'discrete'];
export function SimulationTab({ d, set }) {
  const s = d.sim;
  const setS = (p) => set({ sim: { ...s, ...p } });
  return (
    <>
      <Row icon="cpu" label={t('st_solver')}>
        <IconSelect value={s.solver} width={220} ariaLabel={t('st_solver')} onChange={(v) => setS({ solver: v })}
          options={SOLVERS.map((v) => ({ value: v, label: `${v}${t(`solver_${v}`) !== `solver_${v}` ? ` — ${t(`solver_${v}`)}` : ''}`, icon: v === 'discrete' ? 'plotStairs' : 'waves' }))} />
      </Row>
      <Row icon="clock" label={t('st_stop_time')}><Stepper value={s.stopTime} min={0} max={1e9} step={1} width={90} ariaLabel={t('st_stop_time')} unit={t('st_seconds')} onChange={(v) => setS({ stopTime: v })} /></Row>
      <p className="small muted">{t('st_sim_note')}</p>
    </>
  );
}

// ── 키보드 ────────────────────────────────────────────────
export function KeyboardTab({ d, set }) {
  const k = d.keyboard;
  const setK = (p) => set({ keyboard: { ...k, ...p } });
  return (
    <>
      <div className="st-grid3">
        <Toggle icon="runSection" label={t('st_ctrl_enter')} checked={k.ctrlEnterSection !== false} onChange={(v) => setK({ ctrlEnterSection: v })} />
        <Toggle icon="list" label={t('st_tab_complete')} checked={k.tabCompletion !== false} onChange={(v) => setK({ tabCompletion: v })} />
        <Toggle icon="copy" label={t('st_ctrl_c_copies')} checked={k.ctrlCCopies !== false} onChange={(v) => setK({ ctrlCCopies: v })} />
      </div>
      <div className="st-sep">{t('st_shortcuts')}</div>
      <div className="st-keys-scroll"><ShortcutGroups /></div>
    </>
  );
}

// ── 사용자 정의 테마 ──────────────────────────────────────
const COLOR_LABEL = { bg: 'ct_bg', panel: 'ct_panel', raised: 'ct_raised', hover: 'ct_hover', active: 'ct_active', border: 'ct_border', borderStrong: 'ct_border_strong', text: 'ct_text', textDim: 'ct_text_dim', accent: 'ct_accent', accentStrong: 'ct_accent_strong', accentText: 'ct_accent_text', folder: 'ct_folder', file: 'ct_file', danger: 'ct_danger' };
const hex = (v) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? v : '#808080');

export function CustomThemeTab({ d, set, previewTheme, applyCustom, initialSel }) {
  const list = d.customThemes;
  const [sel, setSel] = useState(initialSel || (list[0] ? list[0].id : ''));
  const [base, setBase] = useState('midnight');
  const [error, setError] = useState('');
  const cur = list.find((c) => c.id === sel) || null;
  const update = (next) => { set({ customThemes: next }); applyCustom(next); };
  const patch = (p) => update(list.map((c) => (c.id === cur.id ? { ...c, ...p } : c)));
  const create = (from, label) => {
    const th = themeById(from);
    const item = { id: `custom-${Date.now().toString(36)}`, label: label || `${themeName(th)} ${t('ct_copy')}`, mode: th.mode, colors: { ...baseColorsOf(th) } };
    update([...list, item]);
    setSel(item.id);
  };
  const remove = () => {
    const next = list.filter((c) => c.id !== cur.id);
    update(next);
    setSel(next[0] ? next[0].id : '');
    if (d.theme === cur.id) previewTheme('midnight');
  };
  const importJson = (text) => {
    setError('');
    try {
      const data = JSON.parse(text);
      const items = (Array.isArray(data) ? data : [data]).filter((c) => c && c.colors).map((c, i) => ({ id: `custom-${Date.now().toString(36)}${i}`, label: String(c.label || c.name || 'Custom'), mode: c.mode === 'light' ? 'light' : 'dark', colors: { ...c.colors } }));
      if (!items.length) throw new Error(t('ct_import_none'));
      update([...list, ...items]);
      setSel(items[0].id);
    } catch (err) { setError(`${t('ct_import_failed')}: ${err.message}`); }
  };
  const c = cur && cur.colors;
  return (
    <div className="ct-wrap">
      <div className="ct-list">
        <div className="ct-items">
          {list.length === 0 && <span className="small">{t('ct_none')}</span>}
          {list.map((x) => (
            <button key={x.id} type="button" className={`ct-item ${x.id === sel ? 'on' : ''}`} onClick={() => setSel(x.id)}>
              <span className="ct-chip" style={{ background: x.colors.bg, borderColor: x.colors.accent }}><i style={{ background: x.colors.accent }} /></span>
              <span className="ct-item-name">{x.label}</span>
              {d.theme === x.id && <Icon name="check" size={12} />}
            </button>
          ))}
        </div>
        <IconSelect value={base} width={196} ariaLabel={t('ct_base')} onChange={setBase} options={THEMES.map((th) => ({ value: th.id, label: themeName(th), icon: th.mode === 'dark' ? 'palette' : 'sun' }))} />
        <div className="ct-actions">
          <Btn icon="plus" label={t('ct_new')} onClick={() => create(base)} title={t('ct_new_tip')} />
          <Btn icon="copy" label={t('ct_duplicate')} disabled={!cur} onClick={() => update([...list, { ...cur, id: `custom-${Date.now().toString(36)}`, label: `${cur.label} ${t('ct_copy')}`, colors: { ...cur.colors } }])} />
          <Btn icon="trash" label={t('remove')} danger disabled={!cur} onClick={remove} />
          <FilePickButton label={t('ct_import')} accept=".json,application/json" onText={importJson} />
          <Btn icon="download" label={t('ct_export')} disabled={!list.length} onClick={() => saveText('mysimulationmath-themes.json', JSON.stringify(list.map(({ id, ...rest }) => rest), null, 2), 'application/json')} />
          <Btn icon="eye" label={t('ct_use')} primary disabled={!cur} onClick={() => previewTheme(cur.id)} />
        </div>
        {error && <span className="small bad">{error}</span>}
      </div>
      <div className="ct-editor">
        {!cur && <div className="st-empty"><Icon name="palette" size={26} /><span>{t('ct_pick_or_new')}</span></div>}
        {cur && (
          <>
            <div className="ct-row">
              <label className="ct-field">{t('ct_name')}<input value={cur.label} onChange={(e) => patch({ label: e.target.value })} /></label>
              <label className="ct-field">{t('ct_mode')}<IconSelect value={cur.mode} width={150} ariaLabel={t('ct_mode')} onChange={(v) => patch({ mode: v })} options={[{ value: 'dark', label: t('st_dark'), icon: 'palette' }, { value: 'light', label: t('st_light'), icon: 'sun' }]} /></label>
              <Btn icon="refresh" label={t('ct_from_base')} title={t('ct_from_base_tip')} onClick={() => patch({ colors: { ...baseColorsOf(themeById(base)) }, mode: themeById(base).mode })} />
            </div>
            <div className="ct-colors">
              {CUSTOM_COLOR_KEYS.map((k) => (
                <label key={k} className="ct-color" title={k}>
                  <input type="color" value={hex(c[k])} onChange={(e) => patch({ colors: { ...c, [k]: e.target.value } })} />
                  <span>{t(COLOR_LABEL[k])}</span>
                </label>
              ))}
            </div>
            <div className="ct-preview" style={{ background: c.bg, color: c.text, borderColor: c.border }} aria-label={t('ct_preview')}>
              <div className="ctp-bar" style={{ background: c.raised, borderColor: c.border }}><b>MySimulationMath</b><span style={{ color: c.textDim }}>{t('rb_home')} · {t('rb_plots')}</span></div>
              <div className="ctp-body">
                <div className="ctp-side" style={{ background: c.panel, borderColor: c.border }}>
                  <span className="ctp-nav on" style={{ background: c.active, color: c.accent }}>{t('cf_title')}</span>
                  <span className="ctp-nav">{t('ws_title')}</span>
                </div>
                <div className="ctp-main">
                  <span className="ctp-card" style={{ background: c.raised, borderColor: c.border }}><span style={{ color: c.textDim }}>{t('ws_value')}</span> <b>11</b> <i style={{ color: c.danger }}>●</i></span>
                  <span className="ctp-btn" style={{ background: c.accent, color: c.accentText }}>{t('rb_run')}</span>
                  <span className="ctp-btn ghost" style={{ borderColor: c.borderStrong, background: c.hover }}>{t('cancel')}</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


// ── 시작 화면 ──────────────────────────────────────────────
export function StartTab({ d, set }) {
  const bg = { ...DEFAULT_START_BACKGROUND, ...(d.startBackground || {}) };
  const setBg = (p) => set({ startBackground: { ...bg, ...p } });
  const tut = { askOnLaunch: true, ...(d.tutorial || {}) };
  return (
    <>
      <Row icon="start" label={t('st_start_show')} title={t('sp_show')}>
        <Toggle icon="start" label={t('sp_show')} checked={d.showStartOnLaunch !== false} onChange={(v) => set({ showStartOnLaunch: v })} />
      </Row>
      <Row icon="graduation" label={t('st_tutorial_ask')} title={t('st_tutorial_ask_hint')}>
        <Toggle icon="graduation" label={t('st_tutorial_ask_toggle')} checked={tut.askOnLaunch !== false} onChange={(v) => set({ tutorial: { ...tut, askOnLaunch: v } })} />
      </Row>
      <Row icon="sparkle" label={t('sp_background')}>
        <IconSelect value={bg.kind} width={220} ariaLabel={t('sp_background')} onChange={(v) => setBg({ kind: v })}
          options={ANIMATION_KINDS.map((k) => ({ value: k, label: t(`anim_${k}`), icon: ANIMATION_ICONS[k] }))} />
      </Row>
      <Row icon="gauge" label={t('sp_speed')}><Stepper value={bg.speed} min={0} max={300} step={10} unit="%" ariaLabel={t('sp_speed')} onChange={(v) => setBg({ speed: v })} /></Row>
      <Row icon="eye" label={t('sp_transparency')}><Stepper value={bg.transparency} min={0} max={100} step={5} unit="%" ariaLabel={t('sp_transparency')} onChange={(v) => setBg({ transparency: v })} /></Row>
      <Row icon="dice" label={t('sp_shuffle_every')}><Stepper value={bg.shuffleSec || 0} min={0} max={600} step={5} unit={t('sp_seconds')} ariaLabel={t('sp_shuffle_every')} onChange={(v) => setBg({ shuffleSec: v })} /></Row>
      <Row icon="dice" label={t('sp_random')}><Toggle icon="dice" label={t('sp_random')} checked={!!bg.random} onChange={(v) => setBg({ random: v })} /></Row>
      <p className="small muted">{t('st_start_note')}</p>
    </>
  );
}
