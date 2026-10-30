// The title bar is the toolbar (no OS title bar): app icon and name, the
// 시작 화면 button, the ribbon tabs (홈 / 플롯 / 앱 / 편집기 / 시뮬레이션), a drag region, the busy
// indicator, the theme (click = next, ⌄ = picker), the language toggle,
// settings, about and the window buttons. When narrow, the tab and theme
// labels hide first; the icons, language, theme and window buttons stay.
import React, { useLayoutEffect, useRef, useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { nextThemeId, themeById } from '../themes';
import { isDesktop, windowControl } from '../lib/backend';
import { LANGUAGES, LangFlag } from './Flags';
import { Icon, WindowButtons } from './Chrome';
import { ThemePicker } from './ThemePicker';
import { usePopupWindows, openPopupWindow, closePopups } from '../lib/popups';
import { getCustomThemesRaw } from '../themes';
import { themeListSize } from './ThemePicker';

export const RIBBON_TABS = [
  ['home', 'home', 'rb_home'],
  ['plots', 'chart', 'rb_plots'],
  ['apps', 'apps', 'rb_apps'],
  ['editor', 'script', 'rb_editor'],
  ['simulation', 'model', 'rb_simulation'],
  ['help', 'book', 'rb_help'],
];

export function TitleBar({ tab, onTab, startOn, onStart, theme, onAction, dirty, busy, debug, onClose }) {
  useLanguage();
  const lang = getLanguage();
  const otherLang = LANGUAGES.find((l) => l.value !== lang) || LANGUAGES[0];
  const [pickerOpen, setPickerOpen] = useState(false);
  const [compact, setCompact] = useState(0); // 0 full, 1 no tab labels, 2 no theme label either
  const bar = useRef(null);
  const need = useRef({});
  // Labels change length with the language and theme name: measure again.
  useLayoutEffect(() => { need.current = {}; setCompact(0); }, [lang, theme]);
  const themeName = (id) => { const th = themeById(id); return lang === 'ko' ? th.label : th.labelEn || th.label; };

  // Hide labels when the bar is too narrow (measured with labels, remembered per language).
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el) return undefined;
    const check = () => {
      const over = el.scrollWidth > el.clientWidth + 1;
      const n = need.current;
      if (compact === 0) { if (over) { n.full = el.scrollWidth; setCompact(1); } return; }
      if (compact === 1) {
        if (over) { n.one = el.scrollWidth; setCompact(2); return; }
        if (el.clientWidth >= (n.full || 0)) setCompact(0);
        return;
      }
      if (el.clientWidth >= (n.one || n.full || 0)) setCompact(1);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  });

  const openThemes = async (e) => {
    e.stopPropagation();
    if (usePopupWindows()) {
      const r = e.currentTarget.getBoundingClientRect();
      await closePopups();
      const size = themeListSize();
      await openPopupWindow({ kind: 'themes', anchor: { left: r.right - size.width, right: r.right, top: r.top, bottom: r.bottom }, width: size.width, height: size.height,
        payload: { theme, language: lang, customThemes: getCustomThemesRaw(), value: theme }, onResult: (res) => res && res.id && onAction(res.id) });
      return;
    }
    setPickerOpen((v) => !v);
  };

  return (
    <div ref={bar} className={`toolbar menubar titlebar compact-${compact}`} data-tauri-drag-region onDoubleClick={(e) => { if (isDesktop && e.target === e.currentTarget) windowControl('maximize'); }}>
      <span className="tb-brand" data-tauri-drag-region>
        <img src="./icon.svg" alt="" width={16} height={16} className="tb-logo" draggable={false} />
        <span className="tb-title" data-tauri-drag-region>{dirty && <span className="tb-dirty" title={t('dirty_tip')} aria-label={t('dirty_tip')}>● </span>}{t('appName')}</span>
      </span>
      <span className="rb-tabs" role="tablist" aria-label={t('rb_tabs')}>
        {onStart && (
          <button type="button" aria-pressed={!!startOn} data-rtab="start" className={`menu-btn rb-tab rb-start ${startOn ? 'on' : ''}`} title={t('sp_show_start')} onClick={onStart}>
            <Icon name="start" size={14} /><span className="rb-tab-label">{t('tb_start')}</span>
          </button>
        )}
        {RIBBON_TABS.map(([id, icon, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} data-rtab={id} className={`menu-btn rb-tab ${tab === id ? 'on' : ''}`} title={t(label)} onClick={() => onTab(id)}>
            <Icon name={icon} size={14} /><span className="rb-tab-label">{t(label)}</span>
          </button>
        ))}
      </span>
      <span className="tb-spacer" data-tauri-drag-region onClick={() => setPickerOpen(false)} onDoubleClick={() => { if (isDesktop) windowControl('maximize'); }} />
      {debug && <span className="tb-debug" title={t('dbg_paused_at', { file: debug.file || '', line: debug.line || '' })}><Icon name="bug" size={14} /><span className="tb-busy-label">{t('dbg_paused')}</span></span>}
      {busy && !debug && <span className="tb-busy" title={t('st_busy')}><Icon name="spinner" size={14} className="spin" /><span className="tb-busy-label">{t('st_busy')}</span></span>}
      <span className="app-controls">
        <span className="tb-split">
          <button type="button" className="tb-btn tb-split-main" title={t('tip_next_theme', { theme: themeName(nextThemeId(theme)) })} onClick={() => onAction('nextTheme')}>
            <Icon name="palette" size={14} /><span className="tb-theme-label">{themeName(theme)}</span>
          </button>
          <button type="button" className="tb-btn tb-split-caret" data-menu="themes" title={t('tip_theme')} aria-label={t('tip_theme')} onClick={openThemes}>
            <Icon name="chevronDown" size={14} />
          </button>
        </span>
        <button type="button" className="tb-btn tb-lang" title={t('tip_language_toggle', { lang: otherLang.label })} aria-label={t('tip_language_toggle', { lang: otherLang.label })} onClick={() => onAction(`lang:${otherLang.value}`)}>
          <LangFlag lang={lang} width={22} height={15} /><span className="tb-lang-code">{lang.toUpperCase()}</span>
        </button>
        <button type="button" className="tb-btn tb-icon-only tb-guide" data-tour="tb-guide" title={t('tip_guide')} aria-label={t('tip_guide')} onClick={() => onAction('guide')}><Icon name="book" size={15} /></button>
        <button type="button" className="tb-btn tb-icon-only tb-tutorial" data-tour="tb-tutorial" title={t('tip_tutorial')} aria-label={t('tip_tutorial')} onClick={() => onAction('tutorial')}><Icon name="graduation" size={15} /></button>
        <button type="button" className="tb-btn tb-icon-only" data-tour="tb-settings" title={t('tip_settings')} aria-label={t('tip_settings')} onClick={() => onAction('settings')}><Icon name="settings" size={15} /></button>
        <button type="button" className="tb-btn tb-icon-only" title={t('tip_about')} aria-label={t('tip_about')} onClick={() => onAction('about')}><Icon name="info" size={15} /></button>
      </span>
      {isDesktop && <WindowButtons onClose={onClose} />}
      {pickerOpen && (
        <div className="menu-pop theme-pop" style={{ right: 8, left: 'auto' }} onClick={(e) => e.stopPropagation()}>
          <ThemePicker list value={theme} onPick={(id) => { setPickerOpen(false); onAction(`theme:${id}`); }}
            onNewCustom={() => { setPickerOpen(false); onAction('settings:custom'); }} onEditCustom={() => { setPickerOpen(false); onAction('settings:custom'); }} />
        </div>
      )}
    </div>
  );
}
