// The tabs of the settings window. Each tab is a function of the shared
// draft (d / set) and fits the fixed-size window without scrolling.
import React, { useEffect, useState } from 'react';
import { t, getLanguage } from '../../lib/i18n';
import { allThemes, THEMES, CUSTOM_COLOR_KEYS, baseColorsOf, themeById } from '../../themes';
import { call, isDesktop, pickFolder } from '../../lib/backend';
import { Icon } from '../../components/Chrome';
import { languageOptions } from '../../components/Flags';
import { ThemePicker } from '../../components/ThemePicker';
import { Btn, BtnGroup, IconSelect, Stepper, RangeStepper, Toggle, FilePickButton, saveText, emitAction, errorText } from '../common';
import { AnimatedBackground } from '../../lib/startBackground';
import { BgKindGrid } from '../StartPage';
import { metricLabel } from '../Panels';
import { DEFAULT_GATE_CONDITIONS, GATE_METRICS } from '../../lib/gateDefaults';

export const MASK = '••••••••';
const CLAUDE_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];
const DB_PORT = { postgres: 5432, mysql: 3306, mssql: 1433 };

export function Row({ icon, label, title, children, wide }) {
  return (
    <div className={`st-row ${wide ? 'wide' : ''}`} title={title}>
      <span className="st-label"><Icon name={icon} size={14} /><span>{label}</span></span>
      <div className="st-field">{children}</div>
    </div>
  );
}

const themeName = (th) => (getLanguage() === 'ko' ? th.label : th.labelEn || th.label);

// ── 일반 ──────────────────────────────────────────────────
export function GeneralTab({ d, set, previewLanguage }) {
  const p = d.panels;
  const setPanel = (side, patch) => set({ panels: { ...p, [side]: { ...p[side], ...patch } } });
  return (
    <>
      <Row icon="globe" label={t('language')} title={t('st_live_hint')}>
        <IconSelect value={d.language} width={220} ariaLabel={t('language')} onChange={previewLanguage} options={languageOptions()} />
      </Row>
      <Row icon="home" label={t('start_nav')}><Toggle icon="home" label={t('show_start_on_launch')} checked={d.showStartOnLaunch} onChange={(v) => set({ showStartOnLaunch: v })} /></Row>
      <Row icon="user" label={t('assignee')} title={t('st_assignee_hint')}><input value={d.assignee} placeholder={t('st_assignee_ph')} onChange={(e) => set({ assignee: e.target.value })} /></Row>
      <div className="st-sep">{t('st_panels')}</div>
      <div className="st-grid3">
        <span title={t('pn_left')}><Toggle icon="panelLeft" label={t('pn_nav')} checked={p.left.on} onChange={(v) => setPanel('left', { on: v })} /></span>
        <span title={t('pn_right')}><Toggle icon="panelRight" label={t('pn_inspector')} checked={p.right.on} onChange={(v) => setPanel('right', { on: v })} /></span>
        <span title={t('pn_bottom')}><Toggle icon="panelBottom" label={t('pn_bottom_short')} checked={p.bottom.on} onChange={(v) => setPanel('bottom', { on: v })} /></span>
      </div>
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
          <Btn icon="download" label={t('ct_export')} disabled={!list.length} onClick={() => saveText('mycodechecker-themes.json', JSON.stringify(list.map(({ id, ...rest }) => rest), null, 2), 'application/json')} />
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
              <div className="ctp-bar" style={{ background: c.raised, borderColor: c.border }}><b>MyCodeChecker</b><span style={{ color: c.textDim }}>{t('menu_file')} · {t('menu_analyze')}</span></div>
              <div className="ctp-body">
                <div className="ctp-side" style={{ background: c.panel, borderColor: c.border }}>
                  <span className="ctp-nav on" style={{ background: c.active, color: c.accent }}>{t('nav_overview')}</span>
                  <span className="ctp-nav">{t('nav_issues')}</span>
                </div>
                <div className="ctp-main">
                  <span className="ctp-card" style={{ background: c.raised, borderColor: c.border }}><span style={{ color: c.textDim }}>{t('bugs')}</span> <b>11</b> <i style={{ color: c.danger }}>●</i></span>
                  <span className="ctp-btn" style={{ background: c.accent, color: c.accentText }}>{t('run_analysis')}</span>
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

// ── 시작 화면 ─────────────────────────────────────────────
// A live preview of the start background with the draft kind / speed / transparency.
function BgPreview({ bg }) {
  const canvas = React.useRef(null);
  const anim = React.useRef(null);
  const speed = React.useRef(bg.speed);
  speed.current = bg.speed;
  React.useEffect(() => {
    const a = new AnimatedBackground(canvas.current, { kind: bg.kind, speed: () => (speed.current || 0) / 100 });
    anim.current = a;
    a.start();
    return () => a.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  React.useEffect(() => { if (anim.current) anim.current.setKind(bg.kind); }, [bg.kind]);
  return (
    <div className="bg-preview" title={t('ct_preview')}>
      <canvas ref={canvas} style={{ opacity: 1 - (bg.transparency || 0) / 100 }} />
      <span className="bg-preview-card">{t('ct_preview')}</span>
    </div>
  );
}

export function StartTab({ d, set, setBg }) {
  const bg = d.startBackground;
  return (
    <>
      <Row icon="home" label={t('start_nav')}><Toggle icon="home" label={t('sp_show')} checked={d.showStartOnLaunch} onChange={(v) => set({ showStartOnLaunch: v })} /></Row>
      <div className="st-sep">{t('sp_background')} <span className="small">· {t('st_bg_hint')}</span></div>
      <BgPreview bg={bg} />
      <BgKindGrid bg={bg} columns={6} onChange={setBg} />
      <div className="st-grid2">
        <Row icon="gauge" label={t('sp_speed')}><RangeStepper value={bg.speed} min={0} max={300} step={10} unit="%" ariaLabel={t('sp_speed')} onChange={(v) => setBg({ speed: v })} /></Row>
        <Row icon="eye" label={t('sp_transparency')} title={t('st_transparency_hint')}><RangeStepper value={bg.transparency} min={0} max={100} step={5} unit="%" ariaLabel={t('sp_transparency')} onChange={(v) => setBg({ transparency: v })} /></Row>
      </div>
      <div className="st-grid2">
        <Row icon="dice" label={t('sp_shuffle_every')} title={t('sp_shuffle_off')}><span className="hrow0"><Stepper value={bg.shuffleSec || 0} min={0} max={600} step={5} width={56} ariaLabel={t('sp_shuffle_every')} onChange={(v) => setBg({ shuffleSec: v })} /><span className="small">{t('ai_seconds')}</span></span></Row>
        <Row icon="dice" label={t('sp_random_short')}><span title={t('sp_random')}><Toggle icon="dice" label={t('sp_random_toggle')} checked={!!bg.random} onChange={(v) => setBg({ random: v })} /></span></Row>
        <Row icon="grid" label={t('st_start_layout')}><BtnGroup><Btn icon="refresh" label={t('st_layout_reset_short')} title={t('sp_layout_reset')} onClick={() => setBg({ layout: null })} /><Btn icon="grid" label={t('sp_auto_arrange')} title={t('sp_auto_arrange_tip')} onClick={() => setBg({ layout: null })} /></BtnGroup></Row>
      </div>
    </>
  );
}

// ── 분석 ──────────────────────────────────────────────────
export function AnalysisTab({ d, set, close }) {
  return (
    <>
      <Row icon="filter" label={t('exclusions')} title={t('st_exclusions_hint')} wide>
        <textarea className="mono st-textarea" rows={7} value={d.exclusionsText} onChange={(e) => set({ exclusionsText: e.target.value })} />
      </Row>
      <div className="st-grid2">
        <Row icon="flow" label={t('limit_cognitive')}><Stepper value={d.limits.cognitive} min={1} max={1000} ariaLabel={t('limit_cognitive')} onChange={(v) => set({ limits: { ...d.limits, cognitive: v } })} /></Row>
        <Row icon="list" label={t('limit_params')}><Stepper value={d.limits.parameters} min={1} max={100} ariaLabel={t('limit_params')} onChange={(v) => set({ limits: { ...d.limits, parameters: v } })} /></Row>
      </div>
      <Row icon="file" label={t('st_max_files')} title={t('st_max_files_hint')}><Stepper value={d.maxFiles} min={100} max={200000} step={500} width={90} ariaLabel={t('st_max_files')} onChange={(v) => set({ maxFiles: v })} /></Row>
      <Row icon="settings" label={t('st_more_analysis')}><Btn icon="users" label={t('st_open_admin_settings')} onClick={() => close('adminSettings')} /></Row>
      <ChecksBox checks={d.checks} onChange={(checks) => set({ checks })} />
    </>
  );
}

// Check groups (core/checks.js): a group that is off is not run / not reported.
function ChecksBox({ checks, onChange }) {
  const [list, setList] = useState(null);
  const lang = getLanguage();
  useEffect(() => { call('checks.list').then(setList).catch(() => setList([])); }, []);
  const on = (id) => checks[id] !== false;
  const setAll = (value) => onChange(Object.fromEntries((list || []).map((g) => [g.id, value])));
  return (
    <div className="st-checks" data-tour="check-groups">
      <div className="st-checks-head">
        <strong><Icon name="list" size={14} /> {t('ck_title')}</strong>
        <span className="small">{t('ck_count', { on: (list || []).filter((g) => on(g.id)).length, total: (list || []).length })}</span>
        <span className="spacer" />
        <Btn icon="check" label={t('ck_all_on')} onClick={() => setAll(true)} />
        <Btn icon="close" label={t('ck_all_off')} onClick={() => setAll(false)} />
      </div>
      <p className="small">{t('ck_hint')}</p>
      <div className="st-checks-grid">
        {(list || []).map((g) => (
          <label key={g.id} className={`st-check ${on(g.id) ? 'on' : ''}`} data-check={g.id} title={g.hint ? g.hint[lang] || g.hint.en : undefined}>
            <input type="checkbox" checked={on(g.id)} onChange={(e) => onChange({ ...checks, [g.id]: e.target.checked })} />
            <span><b>{g.label[lang] || g.label.en}</b>{g.hint && <span className="small">{g.hint[lang] || g.hint.en}</span>}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ── 보고서 ─────────────────────────────────────────────────
const REPORT_KINDS = ['executive', 'security', 'misra', 'integrity', 'defect-security', 'weakness', 'sbom'];
const REPORT_FORMATS = [['pdf', 'PDF'], ['docx', 'Word'], ['xlsx', 'Excel'], ['pptx', 'PowerPoint'], ['html', 'HTML'], ['md', 'Markdown'], ['csv', 'CSV']];

export function ReportsTab({ d, set }) {
  const r = d.reports;
  const auto = r.auto;
  const setAuto = (patch) => set({ reports: { ...r, auto: { ...auto, ...patch } } });
  const toggleIn = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const pick = async () => { const dir = await pickFolder(); if (dir) setAuto({ folder: dir }); };
  return (
    <div data-tour="report-settings">
      <Row icon="code" label={t('rs_md_images')} title={t('rs_md_images_hint')}>
        <Toggle icon="chart" label={t('rs_md_embed')} checked={r.mdEmbedImages !== false} onChange={(v) => set({ reports: { ...r, mdEmbedImages: v } })} />
      </Row>
      <p className="small st-note">{r.mdEmbedImages !== false ? t('rs_md_embed_on') : t('rs_md_embed_off')}</p>
      <Row icon="play" label={t('rs_auto')} title={t('rs_auto_hint')}>
        <Toggle icon="report" label={t('rs_auto_on')} checked={!!auto.enabled} onChange={(v) => setAuto({ enabled: v })} />
      </Row>
      <Row icon="report" label={t('rs_kinds')} wide>
        <div className="st-pills">{REPORT_KINDS.map((k) => (
          <label key={k} className={`st-pill ${auto.kinds.includes(k) ? 'on' : ''}`}><input type="checkbox" disabled={!auto.enabled} checked={auto.kinds.includes(k)} onChange={() => setAuto({ kinds: toggleIn(auto.kinds, k) })} />{t(`rp_kind_${k.replace(/-/g, '_')}`)}</label>
        ))}</div>
      </Row>
      <Row icon="download" label={t('rs_formats')} wide>
        <div className="st-pills">{REPORT_FORMATS.map(([f, label]) => (
          <label key={f} className={`st-pill ${auto.formats.includes(f) ? 'on' : ''}`}><input type="checkbox" disabled={!auto.enabled} checked={auto.formats.includes(f)} onChange={() => setAuto({ formats: toggleIn(auto.formats, f) })} />{label}</label>
        ))}</div>
      </Row>
      <Row icon="folder" label={t('rs_folder')} title={t('rs_folder_hint')} wide>
        <span className="input-row">
          <input className="mono" value={auto.folder || ''} placeholder={t('rs_folder_ph')} disabled={!auto.enabled} onChange={(e) => setAuto({ folder: e.target.value })} />
          {isDesktop && <Btn icon="folder" label={t('pj_browse')} disabled={!auto.enabled} onClick={pick} />}
        </span>
      </Row>
    </div>
  );
}

// ── 품질 게이트 ─────────────────────────────────────────────
const GATE_OPS = [['GT', '>'], ['LT', '<'], ['GTE', '≥'], ['LTE', '≤'], ['EQ', '=']];
const RATINGS = ['A', 'B', 'C', 'D', 'E'];

export function GateTab({ gate, setGate }) {
  const lang = getLanguage();
  const conds = gate.conditions || [];
  const setCond = (id, patch) => setGate({ ...gate, conditions: conds.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const used = new Set(conds.map((c) => c.metric));
  const free = GATE_METRICS.filter((m) => !used.has(m));
  const add = () => {
    const metric = free[0];
    if (!metric) return;
    const rating = /_rating$/.test(metric);
    setGate({ ...gate, conditions: [...conds, { id: `c-${Date.now().toString(36)}`, metric, op: rating ? 'GT' : 'GT', threshold: rating ? 1 : 0, on: metric.startsWith('new_') ? 'new' : 'overall', enabled: true }] });
  };
  const metricOptions = (cur) => GATE_METRICS.filter((m) => m === cur || !used.has(m)).map((m) => ({ value: m, label: metricLabel(m, lang), icon: m.startsWith('new_') ? 'sparkle' : 'chart' }));
  return (
    <div data-tour="gate-settings">
      <p className="small st-note"><Icon name="gate" size={13} /> {t('gs_hint', { name: gate.name })}</p>
      <div className="st-gate">
        <div className="st-gate-row head"><span>{t('gs_use')}</span><span>{t('gate_metric')}</span><span>{t('gate_op')}</span><span>{t('gate_threshold')}</span><span /></div>
        {conds.map((c) => {
          const rating = /_rating$/.test(c.metric);
          return (
            <div key={c.id} className={`st-gate-row ${c.enabled === false ? 'off' : ''}`} data-metric={c.metric}>
              <span><input type="checkbox" aria-label={t('gs_use')} checked={c.enabled !== false} onChange={(e) => setCond(c.id, { enabled: e.target.checked })} /></span>
              <IconSelect value={c.metric} width={250} ariaLabel={t('gate_metric')} options={metricOptions(c.metric)}
                onChange={(v) => setCond(c.id, { metric: v, on: v.startsWith('new_') ? 'new' : 'overall', ...(/_rating$/.test(v) !== rating ? { threshold: /_rating$/.test(v) ? 1 : 0 } : {}) })} />
              <IconSelect value={c.op} width={88} ariaLabel={t('gate_op')} options={GATE_OPS.map(([v, s]) => ({ value: v, label: s, icon: 'filter' }))} onChange={(v) => setCond(c.id, { op: v })} />
              {rating
                ? <IconSelect value={String(Math.max(1, Math.min(5, Number(c.threshold) || 1)))} width={80} ariaLabel={t('gate_threshold')} options={RATINGS.map((l, i) => ({ value: String(i + 1), label: l, icon: 'star' }))} onChange={(v) => setCond(c.id, { threshold: Number(v) })} />
                : <Stepper value={Number(c.threshold) || 0} min={0} max={1000000} width={80} ariaLabel={t('gate_threshold')} onChange={(v) => setCond(c.id, { threshold: v })} />}
              <Btn icon="trash" label={t('remove')} onClick={() => setGate({ ...gate, conditions: conds.filter((x) => x.id !== c.id) })} />
            </div>
          );
        })}
      </div>
      <BtnGroup>
        <Btn icon="plus" label={t('gs_add')} disabled={!free.length} onClick={add} />
        <Btn icon="refresh" label={t('gs_reset')} onClick={() => setGate({ ...gate, conditions: DEFAULT_GATE_CONDITIONS.map((c) => ({ ...c })) })} />
      </BtnGroup>
    </div>
  );
}

// ── 새 코드 ───────────────────────────────────────────────
export function NewCodeTab({ d, set }) {
  return (
    <>
      <Row icon="sparkle" label={t('new_code_mode')}>
        <IconSelect value={d.newCode} width={280} ariaLabel={t('new_code_mode')} onChange={(v) => set({ newCode: v })} options={[
          { value: 'previous', label: t('previous_analysis'), icon: 'history' },
          { value: 'days', label: t('number_of_days'), icon: 'calendar' },
          { value: 'scm', label: t('ad_nc_scm'), icon: 'branch' },
          { value: 'version', label: t('ad_nc_version'), icon: 'package' },
          { value: 'analysis', label: t('ad_nc_analysis'), icon: 'calendar' },
        ]} />
      </Row>
      {d.newCode === 'days' && <Row icon="calendar" label={t('number_of_days')}><span className="hrow0"><Stepper value={d.newCodeDays} min={1} max={3650} ariaLabel={t('number_of_days')} onChange={(v) => set({ newCodeDays: v })} /><span className="small">{t('days')}</span></span></Row>}
      {d.newCode === 'scm' && <Row icon="branch" label={t('ad_nc_ref')}><input value={d.newCodeRef || ''} placeholder="main / v1.2.0 / a1b2c3d" aria-label={t('ad_nc_ref')} onChange={(e) => set({ newCodeRef: e.target.value })} /></Row>}
      {d.newCode === 'version' && <Row icon="package" label={t('ad_nc_version_tag')}><input value={d.newCodeVersion || ''} placeholder="v1.2.0" aria-label={t('ad_nc_version_tag')} onChange={(e) => set({ newCodeVersion: e.target.value })} /></Row>}
      {d.newCode === 'version' && !String(d.newCodeVersion || '').trim() && <p className="small bad" data-warn="nc-version"><Icon name="alert" size={12} /> {t('nc_version_missing')}</p>}
      {d.newCode === 'analysis' && <p className="small st-note"><Icon name="info" size={12} /> {t('nc_analysis_in_admin')}</p>}
      <p className="small st-note"><Icon name="info" size={12} /> {t('st_newcode_hint')}</p>
      <p className="small st-note"><Icon name="link" size={12} /> {t('nc_same_as_admin')}</p>
    </>
  );
}

// ── AI 코드 수정 ──────────────────────────────────────────
export function AiTab({ ai, setA, aiErr, ui, setUi }) {
  const [test, setTest] = useState(null);
  if (!ai) return <div className="st-empty"><Icon name="hourglass" size={22} /><span>{t('loading')}</span></div>;
  const run = async () => {
    setTest({ busy: true });
    try {
      const r = await call('ai.test', { ai });
      setTest({ ok: r.ok !== false, text: `${r.model || ''}${r.usage ? ` · in ${r.usage.input ?? '—'} / out ${r.usage.output ?? '—'}` : ''}${r.reply ? ` · "${String(r.reply).slice(0, 60)}"` : ''}` });
    } catch (err) { setTest({ ok: false, text: errorText(err) }); }
  };
  const anthropic = ai.provider === 'anthropic';
  return (
    <>
      {aiErr && <p className="small bad st-note"><Icon name="alert" size={12} /> {aiErr}</p>}
      <div className="st-grid2">
        <Row icon="check" label={t('in_enabled')}><Toggle icon="ai" label={t('ai_enable')} checked={!!ai.enabled} onChange={(v) => setA({ enabled: v })} /></Row>
        <Row icon="ai" label={t('ai_provider')}>
          <IconSelect value={ai.provider} width={200} ariaLabel={t('ai_provider')} onChange={(v) => { setA({ provider: v, model: '' }); setUi({ customModel: false }); }} options={[
            { value: 'anthropic', label: 'Anthropic Claude', icon: 'ai' },
            { value: 'openai-compatible', label: t('ai_openai'), icon: 'globe' },
            { value: 'ollama', label: t('ai_ollama'), icon: 'cpu' },
          ]} />
        </Row>
        <Row icon="cpu" label={t('ai_model')} title={anthropic ? '' : t('ai_model_hint')}>
          {anthropic && !ui.customModel ? (
            <IconSelect value={ai.model || CLAUDE_MODELS[0]} width={228} ariaLabel={t('ai_model')}
              onChange={(v) => { if (v === '__custom') setUi({ customModel: true }); else setA({ model: v === CLAUDE_MODELS[0] ? '' : v }); }}
              options={[...CLAUDE_MODELS.map((m, i) => ({ value: m, label: i === 0 ? `${m} (${t('ai_default')})` : m, icon: 'ai' })), { value: '__custom', label: t('ai_custom_model'), icon: 'edit' }]} />
          ) : (
            <span className="input-row"><input value={ai.model || ''} placeholder={ai.defaultModel || t('ai_model_ph')} onChange={(e) => setA({ model: e.target.value })} />
              {anthropic && <button type="button" className="icon-btn" title={t('ai_model_list')} onClick={() => setUi({ customModel: false })}><Icon name="list" size={14} /></button>}</span>
          )}
        </Row>
        {anthropic ? (
          <Row icon="globe" label={t('ai_server')}><Toggle icon="globe" label={t('ai_custom_server')} checked={ui.customUrl} onChange={(v) => { setUi({ customUrl: v }); if (!v) setA({ baseUrl: '' }); }} /></Row>
        ) : <span />}
        {(!anthropic || ui.customUrl) && (
          <Row icon="link" label={t('ai_base_url')}><input value={ai.baseUrl || ''} placeholder={ai.provider === 'ollama' ? 'http://localhost:11434' : anthropic ? 'https://api.anthropic.com' : 'https://api.example.com/v1'} onChange={(e) => setA({ baseUrl: e.target.value })} /></Row>
        )}
        <Row icon="key" label={t('ai_api_key')} title={anthropic ? t('ai_key_anthropic_hint') : ''}>
          <input type="password" autoComplete="new-password" value={ai.apiKey || ''} placeholder={anthropic ? t('ai_key_env_ph') : t('in_secret_ph')} title={ai.apiKey === MASK ? t('in_secret_kept') : undefined} onChange={(e) => setA({ apiKey: e.target.value })} />
        </Row>
        <Row icon="gauge" label={t('ai_effort')}>
          <IconSelect value={ai.effort} width={200} ariaLabel={t('ai_effort')} onChange={(v) => setA({ effort: v })}
            options={['low', 'medium', 'high', 'xhigh', 'max'].map((e) => ({ value: e, label: t(`ai_effort_${e}`), icon: e === 'low' ? 'chevronDown' : e === 'medium' ? 'minus' : 'chevronUp' }))} />
        </Row>
        <Row icon="globe" label={t('ai_language')}><IconSelect value={ai.language || 'ko'} width={200} ariaLabel={t('ai_language')} onChange={(v) => setA({ language: v })} options={languageOptions()} /></Row>
        <Row icon="hash" label={t('ai_max_tokens')}><Stepper value={ai.maxTokens} min={1024} max={128000} step={1024} width={80} ariaLabel={t('ai_max_tokens')} onChange={(v) => setA({ maxTokens: v })} /></Row>
        <Row icon="list" label={t('ai_context_lines')} title={t('ai_context_hint')}><Stepper value={ai.contextLines} min={5} max={400} step={5} width={60} ariaLabel={t('ai_context_lines')} onChange={(v) => setA({ contextLines: v })} /></Row>
        <Row icon="clock" label={t('ai_timeout')}><span className="hrow0"><Stepper value={Math.round((ai.timeoutMs || 120000) / 1000)} min={10} max={900} step={10} width={60} ariaLabel={t('ai_timeout')} onChange={(v) => setA({ timeoutMs: v * 1000 })} /><span className="small">{t('ai_seconds')}</span></span></Row>
        <Row icon="refresh" label={t('ai_test')}>
          <span className="hrow0">
            <Btn icon={test && test.busy ? 'hourglass' : 'refresh'} label={t('in_test_connection')} disabled={test && test.busy} onClick={run} />
            {test && !test.busy && <span className={`status-pill tone-${test.ok ? 'ok' : 'bad'}`} title={test.text}><Icon name={test.ok ? 'checkCircle' : 'xCircle'} size={12} />{test.ok ? t('in_test_ok') : t('in_test_failed')}</span>}
          </span>
        </Row>
      </div>
      {test && test.text && !test.busy && <p className="small st-note st-clip" title={test.text}>{test.text}</p>}
      <div className={`note-box ${ai.provider === 'ollama' ? 'ok' : 'warn'} st-privacy`}><Icon name="lock" size={14} /><div><strong>{t('ai_privacy_title')}</strong><span className="small">{ai.provider === 'ollama' ? t('ai_privacy_local') : t('ai_privacy_remote')}</span></div></div>
    </>
  );
}

// ── 데이터베이스 ──────────────────────────────────────────
export function DbTab({ db, setB, dbErr }) {
  const [test, setTest] = useState(null);
  if (!db) return <div className="st-empty"><Icon name="hourglass" size={22} /><span>{t('loading')}</span></div>;
  const run = async () => {
    setTest({ busy: true });
    try {
      const r = await call('db.test', { db });
      setTest({ ok: r.ok !== false, text: `${r.kind || ''} ${r.version || ''}${r.tables ? ` · ${t('db_tables')}: ${(r.tables || []).join(', ') || '—'}` : ''}` });
    } catch (err) { setTest({ ok: false, text: errorText(err) }); }
  };
  const sqlite = db.kind === 'sqlite';
  return (
    <>
      {dbErr && <p className="small bad st-note"><Icon name="alert" size={12} /> {dbErr}</p>}
      <div className="st-grid2">
        <p className="small st-note"><Icon name="info" size={12} /> {t('db_what')}</p>
        <Row icon="check" label={t('in_enabled')}><Toggle icon="database" label={t('db_enable')} checked={!!db.enabled} onChange={(v) => setB({ enabled: v })} /></Row>
        <Row icon="database" label={t('db_kind')}>
          <IconSelect value={db.kind} width={200} ariaLabel={t('db_kind')} onChange={(v) => setB({ kind: v, port: DB_PORT[v] || db.port })} options={[
            { value: 'sqlite', label: t('db_sqlite'), icon: 'file' },
            { value: 'postgres', label: 'PostgreSQL', icon: 'database' },
            { value: 'mysql', label: 'MySQL · MariaDB', icon: 'database' },
            { value: 'mssql', label: 'SQL Server', icon: 'database' },
          ]} />
        </Row>
      </div>
      {sqlite && (
        <Row icon="file" label={t('db_file')} title={t('db_file_hint')} wide>
          <span className="input-row">
            <input className="mono" value={db.file || ''} placeholder={t('db_file_ph')} onChange={(e) => setB({ file: e.target.value })} />
            {isDesktop && <Btn icon="folder" label={t('db_pick')} onClick={async () => { const dir = await pickFolder(); if (dir) setB({ file: `${dir}${dir.includes('\\') ? '\\' : '/'}mycodechecker.db` }); }} />}
          </span>
        </Row>
      )}
      <div className="st-grid2">
        {!sqlite && <Row icon="globe" label={t('in_host')}><input value={db.host || ''} placeholder="localhost" onChange={(e) => setB({ host: e.target.value })} /></Row>}
        {!sqlite && <Row icon="hash" label={t('in_port')}><Stepper value={Number(db.port) || DB_PORT[db.kind]} min={1} max={65535} width={70} ariaLabel={t('in_port')} onChange={(v) => setB({ port: v })} /></Row>}
        {!sqlite && <Row icon="database" label={t('db_database')}><input value={db.database || ''} onChange={(e) => setB({ database: e.target.value })} /></Row>}
        {!sqlite && <Row icon="user" label={t('in_user')}><input value={db.user || ''} autoComplete="off" onChange={(e) => setB({ user: e.target.value })} /></Row>}
        {!sqlite && <Row icon="key" label={t('in_password')}><input type="password" autoComplete="new-password" value={db.password || ''} placeholder={t('in_secret_ph')} title={db.password === MASK ? t('in_secret_kept') : undefined} onChange={(e) => setB({ password: e.target.value })} /></Row>}
        {!sqlite && <Row icon="lock" label="SSL / TLS"><Toggle icon="lock" label={t('db_ssl')} checked={!!db.ssl} onChange={(v) => setB({ ssl: v })} /></Row>}
        <Row icon="layers" label={t('db_schema')} title={t('db_schema_hint')}><input value={db.schema || ''} placeholder="mcc" onChange={(e) => setB({ schema: e.target.value })} /></Row>
        <Row icon="clock" label={t('db_timeout')} title={t('db_timeout_hint')}><Stepper value={Number(db.timeoutSec) || 60} min={5} max={3600} step={5} width={70} ariaLabel={t('db_timeout')} onChange={(v) => setB({ timeoutSec: v })} /></Row>
        <Row icon="upload" label={t('db_auto')}><Toggle icon="upload" label={t('db_auto_label')} checked={!!db.autoExport} onChange={(v) => setB({ autoExport: v })} /></Row>
        <Row icon="bug" label={t('db_issues')}><Toggle icon="list" label={t('db_issues_label')} checked={!!db.includeIssues} onChange={(v) => setB({ includeIssues: v })} /></Row>
        <Row icon="refresh" label={t('ai_test')}>
          <span className="hrow0">
            <Btn icon={test && test.busy ? 'hourglass' : 'refresh'} label={t('in_test_connection')} disabled={test && test.busy} onClick={run} />
            {test && !test.busy && <span className={`status-pill tone-${test.ok ? 'ok' : 'bad'}`} title={test.text}><Icon name={test.ok ? 'checkCircle' : 'xCircle'} size={12} />{test.ok ? t('in_test_ok') : t('in_test_failed')}</span>}
          </span>
        </Row>
      </div>
      {test && test.text && !test.busy && <p className="small st-note st-clip" title={test.text}>{test.text}</p>}
      <p className="small st-note"><Icon name="info" size={12} /> {t('db_hint')}</p>
    </>
  );
}

// ── 알림·연동 ─────────────────────────────────────────────
export function IntegrationsTab({ d, set, close }) {
  return (
    <>
      <Row icon="webhook" label={t('webhook')} title={t('st_webhook_hint')} wide><input value={d.webhookUrl} placeholder="https://hooks.example.com/…" onChange={(e) => set({ webhookUrl: e.target.value })} /></Row>
      <div className="st-sep">{t('st_more_integrations')}</div>
      <div className="st-links">
        {[['integrations', 'link', 'in_tab', 'st_l_integrations'], ['schedules', 'calendar', 'sc_tab', 'st_l_schedules'], ['webhooks', 'webhook', 'ad_webhooks', 'st_l_webhooks'], ['audit', 'list', 'au_tab', 'st_l_audit'], ['security', 'users', 'ad_security', 'st_l_security'], ['tools', 'installBox', 'tl_tab', 'st_l_tools']].map(([id, icon, label, desc]) => (
          <button key={id} type="button" className="st-link" onClick={() => close(`adminTab:${id}`)}>
            <span className="icon"><Icon name={icon} size={18} /></span><b>{t(label)}</b><small>{t(desc)}</small><Icon name="chevronRight" size={14} />
          </button>
        ))}
      </div>
    </>
  );
}

// ── 고급 ──────────────────────────────────────────────────
export function AdvancedTab({ set, close, resetPanels }) {
  return (
    <>
      <Row icon="panelLeft" label={t('st_panel_sizes')}><Btn icon="refresh" label={t('st_panel_reset')} onClick={resetPanels} /></Row>
      <Row icon="installBox" label={t('tl_title')}><Btn icon="installBox" label={t('tl_menu')} onClick={() => close('tools')} /></Row>
      <p className="small st-note"><Icon name="info" size={12} /> {t('st_advanced_hint')}</p>
    </>
  );
}
