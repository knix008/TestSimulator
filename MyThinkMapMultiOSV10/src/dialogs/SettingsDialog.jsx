// Settings dialog (Ctrl+,) — tabs: general (UI and session, editing), map
// (what a new map looks like, how the canvas behaves), theme (40 themes and
// custom ones), start page, export / print defaults. Changes apply
// immediately and are persisted.
import React, { useEffect, useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { THEMES, themeById, baseColorsOf, setCustomThemes, CUSTOM_COLOR_KEYS } from '../themes';
import { Icon } from '../components/Icons';
import { StartScreenControls, screenOf } from '../components/StartScreenControls';
import { LAYOUT_ICONS } from '../components/Toolbar';
import { Dialog, ConfirmDialog } from './Dialogs';
import { resetPatch, FONT_SUGGESTIONS } from '../lib/settings';
import { LAYOUTS } from '../lib/model';
import { MAP_STYLES } from '../lib/mapstyles';

function Stepper({ value, onChange, step = 1, min = 0, max = 100, digits = 0, width = 70, unit }) {
  const clamp = (n) => Math.max(min, Math.min(max, Number(n.toFixed(digits))));
  const cur = Number(value) || min;
  return (
    <span className="row stepper">
      <button type="button" className="icon-btn" title="−" disabled={cur <= min} onClick={() => onChange(clamp(cur - step))}><Icon name="minus" size={14} /></button>
      <input type="number" min={min} max={max} step={step} value={value} onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(clamp(n)); }} style={{ width }} />
      <button type="button" className="icon-btn" title="+" disabled={cur >= max} onClick={() => onChange(clamp(cur + step))}><Icon name="plus" size={14} /></button>
      {unit && <span className="muted small">{unit}</span>}
    </span>
  );
}

function Check({ id, label, settings, onChange }) {
  return (
    <label className="check settings-check">
      <input type="checkbox" checked={!!settings[id]} onChange={(e) => onChange({ [id]: e.target.checked })} />
      <span>{label}</span>
    </label>
  );
}

const TOKEN_OF = { bg: '--bg', panel: '--bg-panel', raised: '--bg-elev', hover: '--bg-hover', active: '--bg-sel-inactive', border: '--border', borderStrong: '--border-strong', text: '--fg', textDim: '--fg-muted', accent: '--accent', accentStrong: '--accent-strong', accentText: '--accent-text', folder: '--folder', file: '--file', danger: '--danger' };

export function SettingsDialog({ settings, onChange, onClose, embedded = false, initialTab = '' }) {
  useLanguage();
  const [tab, setTab] = useState((initialTab || 'general').split(':')[0]);
  useEffect(() => { if (initialTab) setTab(initialTab.split(':')[0]); }, [initialTab]);
  const lang = getLanguage();
  const [askReset, setAskReset] = useState(false);
  const tabs = [['general', t('set_general')], ['map', t('set_map')], ['theme', t('set_theme')], ['start', t('set_start_tab')], ['output', t('set_output')]];
  const customList = (settings.customThemes || []).map((c) => ({ ...c, tokens: themeById(c.id).tokens, custom: true, labelEn: c.label }));
  const customCur = (settings.customThemes || []).find((c) => c.id === settings.theme) || null;
  const themeLabel = (id) => { const th = themeById(id); return lang === 'ko' ? th.label : th.labelEn; };
  const setCustom = (list, theme) => { setCustomThemes(list); onChange({ customThemes: list, ...(theme ? { theme } : {}) }); };
  const addCustom = () => {
    const base = themeById(settings.theme);
    const id = `custom-${Date.now().toString(36)}`;
    setCustom([...(settings.customThemes || []), { id, label: `${lang === 'ko' ? base.label : base.labelEn} ${t('set_custom_copy')}`, mode: base.mode, colors: baseColorsOf(base) }], id);
  };
  const editCustom = (patch) => setCustom((settings.customThemes || []).map((c) => (c.id === settings.theme ? { ...c, ...patch } : c)));
  const removeCustom = () => setCustom((settings.customThemes || []).filter((c) => c.id !== settings.theme), 'midnight');

  return (
    <Dialog modal={false} embedded={embedded} title={t('settings_title')} icon="settings" kind="info" className="settings" width={980} onClose={onClose} onEnter={onClose}
      footer={<><button className="btn" onClick={() => setAskReset(true)} title={t('set_reset_tip')}>{t('set_reset')}</button><span className="spacer" /><button className="btn primary" onClick={onClose}>{t('ok')}</button></>}>
      <div className="settings-tabs">
        {tabs.map(([id, label]) => <button key={id} className={`settings-tab ${tab === id ? 'active' : ''}`} data-tab={id} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {tab === 'general' && (
        <div className="settings-cols">
          <div className="settings-col">
            <fieldset className="settings-group">
              <legend>{t('set_grp_ui')}</legend>
              <div className="form-grid settings-grid">
                <label>{t('set_language')}</label>
                <select value={settings.language} onChange={(e) => onChange({ language: e.target.value })}>
                  <option value="ko">한국어</option>
                  <option value="en">English</option>
                </select>
                <label>{t('set_layout')}</label>
                <span className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
                  <Check id="toolbarVisible" label={t('toolbar')} settings={settings} onChange={onChange} />
                  <Check id="statusBarVisible" label={t('statusbar')} settings={settings} onChange={onChange} />
                  <Check id="sidebarVisible" label={t('sidebar')} settings={settings} onChange={onChange} />
                  <Check id="panelVisible" label={t('task_pane')} settings={settings} onChange={onChange} />
                </span>
                <label>{t('set_sidebar_width')}</label>
                <Stepper value={settings.sidebarWidth} onChange={(n) => onChange({ sidebarWidth: n })} min={180} max={560} step={10} unit="px" />
                <label>{t('set_panel_width')}</label>
                <Stepper value={settings.panelWidth} onChange={(n) => onChange({ panelWidth: n })} min={240} max={560} step={10} unit="px" />
              </div>
            </fieldset>
            <fieldset className="settings-group">
              <legend>{t('set_grp_editing')}</legend>
              <div className="form-grid settings-grid">
                <label />
                <Check id="spellCheck" label={t('set_spell')} settings={settings} onChange={onChange} />
                <label />
                <Check id="autoBalance" label={t('set_auto_balance')} settings={settings} onChange={onChange} />
              </div>
            </fieldset>
          </div>
          <div className="settings-col">
            <fieldset className="settings-group">
              <legend>{t('set_grp_session')}</legend>
              <div className="form-grid settings-grid">
                <label />
                <Check id="restoreSession" label={t('set_restore')} settings={settings} onChange={onChange} />
                <label />
                <Check id="confirmClose" label={t('set_confirm_close')} settings={settings} onChange={onChange} />
                <label />
                <Check id="reloadChangedFiles" label={t('set_reload')} settings={settings} onChange={onChange} />
                <label>{t('set_auto_save')}</label>
                <span className="row">
                  <select value={settings.autoSave || 'off'} onChange={(e) => onChange({ autoSave: e.target.value })}>
                    <option value="off">{t('set_auto_save_off')}</option>
                    <option value="blur">{t('set_auto_save_blur')}</option>
                    <option value="delay">{t('set_auto_save_delay')}</option>
                  </select>
                </span>
                {settings.autoSave === 'delay' && (<>
                  <label>{t('set_auto_save_after')}</label>
                  <Stepper value={settings.autoSaveDelay} onChange={(n) => onChange({ autoSaveDelay: n })} min={2} max={600} unit={t('seconds')} />
                </>)}
              </div>
              <p className="muted small settings-hint">{t('set_auto_save_hint')}</p>
            </fieldset>
          </div>
        </div>
      )}
      {tab === 'map' && (
        <div className="settings-cols">
          <div className="settings-col">
            <fieldset className="settings-group">
              <legend>{t('set_grp_new_map')}</legend>
              <div className="form-grid settings-grid">
                <label>{t('set_default_layout')}</label>
                <select value={settings.defaultLayout} onChange={(e) => onChange({ defaultLayout: e.target.value })}>
                  {LAYOUTS.map((l) => <option key={l} value={l}>{t(`layout_${l}`)}</option>)}
                </select>
                <label>{t('set_default_style')}</label>
                <select value={settings.defaultMapStyle} onChange={(e) => onChange({ defaultMapStyle: e.target.value })}>
                  {MAP_STYLES.map((s) => <option key={s.id} value={s.id}>{s.label[lang === 'ko' ? 0 : 1]}</option>)}
                </select>
                <label>{t('set_map_font')}</label>
                <span>
                  <input list="tm-set-fonts" value={settings.mapFont || ''} placeholder={t('auto')} onChange={(e) => onChange({ mapFont: e.target.value })} />
                  <datalist id="tm-set-fonts">{FONT_SUGGESTIONS.map((f) => <option key={f} value={f} />)}</datalist>
                </span>
                <label>{t('set_map_font_size')}</label>
                <Stepper value={settings.mapFontSize} onChange={(n) => onChange({ mapFontSize: n })} min={9} max={28} unit="px" />
              </div>
              <div className="layout-preview">
                <Icon name={LAYOUT_ICONS[settings.defaultLayout] || 'layoutMap'} size={28} />
                <span className="muted small">{t('set_default_hint')}</span>
              </div>
            </fieldset>
          </div>
          <div className="settings-col">
            <fieldset className="settings-group">
              <legend>{t('set_grp_canvas')}</legend>
              <div className="form-grid settings-grid">
                <label />
                <Check id="animate" label={t('set_animate')} settings={settings} onChange={onChange} />
                <label />
                <Check id="wheelZoom" label={t('set_wheel_zoom')} settings={settings} onChange={onChange} />
                <label />
                <Check id="showGrid" label={t('set_grid')} settings={settings} onChange={onChange} />
                <label />
                <Check id="overviewVisible" label={t('set_overview')} settings={settings} onChange={onChange} />
              </div>
            </fieldset>
          </div>
        </div>
      )}
      {tab === 'theme' && (<>
        {[['set_theme_dark', THEMES.filter((th) => th.mode === 'dark')], ['set_theme_light', THEMES.filter((th) => th.mode === 'light')], ['set_custom_themes', customList]].map(([title, list]) => (list.length > 0 && (
          <React.Fragment key={title}>
            <div className="settings-section theme-section">{t(title)} <span className="muted small">({list.length})</span></div>
            <div className="theme-grid">
              {list.map((th) => (
                <button type="button" key={th.id} className={`theme-card ${settings.theme === th.id ? 'active' : ''}`} onClick={() => onChange({ theme: th.id })}
                  style={{ background: th.tokens['--bg'], color: th.tokens['--fg'], borderColor: settings.theme === th.id ? th.tokens['--accent'] : th.tokens['--border'] || 'transparent' }}>
                  <span className="theme-sample" style={{ background: th.tokens['--bg-panel'] }}>
                    <span className="theme-bar" style={{ background: th.tokens['--bg-elev'] }}><span style={{ background: th.tokens['--accent'] }} /></span>
                    <span className="theme-line" style={{ background: th.tokens['--bg-sel'] }} />
                    <span className="theme-line" style={{ background: th.tokens['--syn-keyword'] || th.tokens['--fg-muted'] }} />
                    <span className="theme-line short" style={{ background: th.tokens['--syn-string'] || th.tokens['--fg-muted'] }} />
                  </span>
                  <span className="theme-name">{th.custom && <span className="theme-badge">★</span>}{lang === 'ko' ? th.label : th.labelEn}</span>
                </button>
              ))}
            </div>
          </React.Fragment>
        )))}
        <div className="settings-section">{t('set_custom_themes')}</div>
        <div className="custom-theme">
          <div className="pe-quick">
            <button type="button" className="btn small" onClick={addCustom}><Icon name="plus" size={13} /> {t('set_custom_add', { name: themeLabel(settings.theme) })}</button>
            <select value={customCur ? customCur.id : ''} disabled={!customList.length} onChange={(e) => { if (e.target.value) onChange({ theme: e.target.value }); }} style={{ minWidth: 200, width: 'auto' }}>
              {!customList.length && <option value="">{t('set_custom_none')}</option>}
              {(settings.customThemes || []).map((c) => <option key={c.id} value={c.id}>★ {c.label}</option>)}
            </select>
            <button type="button" className="btn small" disabled={!customCur} onClick={removeCustom}><Icon name="close" size={13} /> {t('set_custom_remove')}</button>
            {!customCur && <span className="muted small">{t('set_custom_hint')}</span>}
          </div>
          <div className={`custom-theme-fields ${customCur ? '' : 'disabled'}`}>
            <div className="form-grid settings-grid custom-theme-head">
              <label>{t('set_custom_name')}</label>
              <div className="row">
                <input value={customCur ? customCur.label : ''} disabled={!customCur} onChange={(e) => editCustom({ label: e.target.value })} style={{ flex: 1, minWidth: 0 }} />
                <select value={customCur ? customCur.mode : 'dark'} disabled={!customCur} onChange={(e) => editCustom({ mode: e.target.value })} style={{ flex: 'none', width: 160 }}>
                  <option value="dark">{t('set_custom_dark')}</option>
                  <option value="light">{t('set_custom_light')}</option>
                </select>
              </div>
            </div>
            <div className="custom-colors">
              {CUSTOM_COLOR_KEYS.map((k) => {
                const v = customCur ? customCur.colors[k] || '' : themeById(settings.theme).tokens[TOKEN_OF[k]] || '';
                return (
                  <label key={k} className="custom-color">
                    <span className="muted small">{t(`set_color_${k}`)}</span>
                    <span className="pe-color">
                      <input type="color" disabled={!customCur} value={/^#[0-9a-fA-F]{6}$/.test(v) ? v : '#888888'} onChange={(e) => editCustom({ colors: { ...customCur.colors, [k]: e.target.value } })} />
                      <input className="mono" disabled={!customCur} value={v} onChange={(e) => editCustom({ colors: { ...customCur.colors, [k]: e.target.value } })} spellCheck={false} />
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </>)}
      {tab === 'start' && (
        <div className="settings-start">
          <fieldset className="settings-group">
            <legend>{t('set_grp_start_launch')}</legend>
            <Check id="showStartOnLaunch" label={t('set_start_always')} settings={settings} onChange={onChange} />
            <p className="muted small settings-hint">{t('set_start_always_hint')}</p>
          </fieldset>
          <fieldset className="settings-group">
            <legend>{t('start_background')}</legend>
            <StartScreenControls settings={settings} onScreen={(patch) => onChange({ startScreen: { ...screenOf(settings), ...patch } })} />
          </fieldset>
        </div>
      )}
      {tab === 'output' && (
        <div className="settings-cols">
          <div className="settings-col">
            <fieldset className="settings-group">
              <legend>{t('set_grp_export')}</legend>
              <div className="form-grid settings-grid">
                <label>{t('export_scale')}</label>
                <select value={settings.exportScale} onChange={(e) => onChange({ exportScale: Number(e.target.value) })}>
                  {[1, 1.5, 2, 3, 4].map((s) => <option key={s} value={s}>{`${s}×`}</option>)}
                </select>
                <label>{t('export_padding')}</label>
                <Stepper value={settings.exportPadding} onChange={(n) => onChange({ exportPadding: n })} min={0} max={200} step={10} unit="px" />
                <label />
                <Check id="exportTransparent" label={t('export_transparent')} settings={settings} onChange={onChange} />
              </div>
            </fieldset>
          </div>
          <div className="settings-col">
            <fieldset className="settings-group">
              <legend>{t('set_grp_print')}</legend>
              <div className="form-grid settings-grid">
                <label>{t('print_paper')}</label>
                <select value={settings.printPaper} onChange={(e) => onChange({ printPaper: e.target.value })}>
                  {['a4', 'a3', 'a5', 'letter', 'legal'].map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                </select>
                <label>{t('print_orientation')}</label>
                <select value={settings.printLandscape ? 'landscape' : 'portrait'} onChange={(e) => onChange({ printLandscape: e.target.value === 'landscape' })}>
                  <option value="portrait">{t('print_portrait')}</option>
                  <option value="landscape">{t('print_landscape')}</option>
                </select>
                <label>{t('print_margin')}</label>
                <Stepper value={settings.printMargin} onChange={(n) => onChange({ printMargin: n })} min={0} max={40} unit="mm" />
                <label>{t('print_pages')}</label>
                <select value={settings.printPages} onChange={(e) => onChange({ printPages: Number(e.target.value) })}>
                  {[1, 2, 4, 6, 9].map((n) => <option key={n} value={n}>{n === 1 ? t('print_fit_one') : t('print_tiles', { n })}</option>)}
                </select>
                <label />
                <Check id="printHeader" label={t('print_header')} settings={settings} onChange={onChange} />
                <label />
                <Check id="printFooter" label={t('print_footer')} settings={settings} onChange={onChange} />
                <label />
                <Check id="printColor" label={t('print_color')} settings={settings} onChange={onChange} />
              </div>
            </fieldset>
          </div>
        </div>
      )}
      {askReset && (
        <ConfirmDialog title={t('set_reset')} message={t('set_reset_confirm')} icon="warning" kind="danger"
          buttons={[{ id: 'yes', label: t('set_reset'), kind: 'danger' }, { id: 'cancel', label: t('cancel') }]}
          onResult={(r) => { setAskReset(false); if (r === 'yes') onChange(resetPatch()); }} />
      )}
    </Dialog>
  );
}

export default SettingsDialog;
