import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  IconHome, IconFolder, IconOpen, IconImage, IconCube, IconRecent, IconTrash, IconDown,
  IconWand, IconStop, IconExport, IconCamera, IconFit, IconOrbit, IconWireframe, IconGrid,
  IconAxes, IconRuler, IconBulb, IconBox, IconPanelLeftOpen, IconPanelRightOpen, IconTerminal,
  IconTheme, IconFlag, IconHelp, IconSettings, IconInfo, IconLayers, IconCheck, IconAlert,
  IconDownload, IconEye, IconClose,
} from './Icons.jsx';
import { nextTheme, THEME_OPEN_SETTINGS } from '../lib/themes.js';
import { ThemeMenu } from './ThemePicker.jsx';
import { otherLang } from '../i18n.js';
import { api, isDesktop } from '../lib/platform.js';
import { EXPORT_FORMATS } from '../lib/formats.js';
import { VIEW_PRESETS } from '../lib/viewer3d.js';

// The window must never be narrow enough to hide a toolbar button. How much the
// row needs depends on the language, the UI font and whether button labels are
// shown, so it is measured from the laid-out toolbar and handed to the host as
// the window's minimum width rather than guessed as a constant.
function useToolbarMinWidth(barRef, scrollRef, deps) {
  const last = useRef(0);

  const measure = useCallback(() => {
    if (!isDesktop) return;
    const bar = barRef.current;
    const scroll = scrollRef.current;
    if (!bar || !scroll) return;
    const kids = [...scroll.children];
    if (!kids.length) return;
    const gap = parseFloat(getComputedStyle(scroll).columnGap) || 0;
    // Every group is `flex: none`, so its laid-out width is its natural width
    // even while the row is scrolled. Margins are added by hand: the
    // separators carry 6px on each side.
    const content = kids.reduce((w, el) => {
      const cs = getComputedStyle(el);
      return w + el.getBoundingClientRect().width
        + (parseFloat(cs.marginLeft) || 0) + (parseFloat(cs.marginRight) || 0);
    }, 0) + gap * (kids.length - 1);
    const chrome = bar.getBoundingClientRect().width - scroll.getBoundingClientRect().width;
    const needed = Math.ceil(chrome + content) + 2;
    if (!Number.isFinite(needed) || needed <= 0) return;
    if (Math.abs(needed - last.current) < 2) return;
    last.current = needed;
    api?.win?.setMinWidth?.(needed)?.catch?.(() => {});
  }, [barRef, scrollRef]);

  useLayoutEffect(() => {
    measure();
    let cancelled = false;
    document.fonts?.ready?.then(() => { if (!cancelled) measure(); }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, ...deps]);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!isDesktop || !scroll || typeof ResizeObserver === 'undefined') return undefined;
    let frame = 0;
    const soon = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const sizes = new ResizeObserver(soon);
    const watch = () => {
      sizes.disconnect();
      for (const el of scroll.children) sizes.observe(el);
    };
    watch();
    const kids = new MutationObserver(() => { watch(); soon(); });
    kids.observe(scroll, { childList: true });
    return () => { cancelAnimationFrame(frame); sizes.disconnect(); kids.disconnect(); };
  }, [measure, scrollRef]);
}

// Every toolbar control carries a `title`, which the global Tooltip component
// turns into a fast custom tooltip.
export function ToolButton({ icon: Icon, label, tip, onClick, disabled, active, showLabel, className = '' }) {
  return (
    <button
      className={`tbtn${active ? ' active' : ''}${showLabel ? ' with-label' : ''}${className ? ` ${className}` : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={tip || label}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : !!active}
    >
      <Icon size={18} />
      {showLabel ? <span className="tbtn-label">{label}</span> : null}
    </button>
  );
}

const MENU_LEAVE_MS = 140;

// A toolbar button that opens a small popup menu below itself.
//
// Pass `onAction` to split the control: the icon runs that action and only
// the chevron on the right opens the menu. `text` is shown next to the icon
// whatever the label setting (the model picker shows the model's name).
//
// The menu is rendered into <body> through a portal: the toolbar scrolls
// horizontally, and an overflow container clips absolutely positioned
// children.
export function MenuButton({
  icon: Icon, label, tip, menuTip, disabled, showLabel, children, width = 300, onAction,
  constrain = true, overflowWindow = false, menuValue, active = false, align = 'left', text = '', className = '',
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);

  const place = useCallback(() => {
    const el = btnRef.current;
    const pop = popRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = pop?.offsetWidth || width;
    const h = pop?.offsetHeight || 0;
    let left = align === 'right' ? r.right - w : r.left;
    let top = r.bottom + 6;
    if (constrain) {
      left = Math.max(6, Math.min(left, window.innerWidth - w - 6));
      if (h && top + h > window.innerHeight - 6) {
        const above = r.top - h - 6;
        top = above >= 6 ? above : Math.max(6, window.innerHeight - h - 6);
      }
    }
    setPos({ left, top });
  }, [align, constrain, width]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (btnRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const reflow = () => place();
    place();
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', reflow);
    window.addEventListener('scroll', reflow, true);
    let leaveTimer = 0;
    const onPointerMove = (e) => {
      const over = btnRef.current?.contains(e.target) || popRef.current?.contains(e.target);
      if (over) {
        if (leaveTimer) { window.clearTimeout(leaveTimer); leaveTimer = 0; }
        return;
      }
      if (!leaveTimer) leaveTimer = window.setTimeout(() => setOpen(false), MENU_LEAVE_MS);
    };
    document.addEventListener('pointermove', onPointerMove);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', reflow);
      window.removeEventListener('scroll', reflow, true);
      if (leaveTimer) window.clearTimeout(leaveTimer);
    };
  }, [open, place]);

  const openDetached = () => {
    if (!overflowWindow || !isDesktop || !api.win?.openThemePopup) return false;
    const el = btnRef.current;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    void (async () => {
      const bounds = await api.win.getContentBounds?.();
      if (!bounds) {
        place();
        setOpen(true);
        return;
      }
      await api.win.openThemePopup({
        x: bounds.x + (align === 'right' ? r.right - width : r.left),
        y: bounds.y + r.bottom + 6,
        aboveY: bounds.y + r.top,
        width,
        current: menuValue,
        button: { x: bounds.x + r.left, y: bounds.y + r.top, width: r.width, height: r.height },
      });
    })();
    return true;
  };

  const toggle = () => {
    if (open) { setOpen(false); return; }
    if (openDetached()) return;
    place();
    setOpen(true);
  };

  const split = typeof onAction === 'function';
  const shown = text || (showLabel ? label : '');

  return (
    <span className={`menu-wrap${split ? ' split' : ''}${className ? ` ${className}` : ''}`} ref={btnRef}>
      {split ? (
        <>
          <button
            className={`tbtn${active ? ' active' : ''}${shown ? ' with-label' : ''}`}
            onClick={() => { setOpen(false); onAction(); }}
            disabled={disabled}
            title={tip || label}
            aria-label={label}
            aria-pressed={active}
          >
            <Icon size={18} />
            {shown ? <span className="tbtn-label">{shown}</span> : null}
          </button>
          <button
            className={`tbtn chevron${active || open ? ' active' : ''}`}
            onClick={toggle}
            disabled={disabled}
            title={menuTip || tip || label}
            aria-label={menuTip || label}
            aria-expanded={open}
            aria-haspopup="listbox"
          >
            <IconDown size={11} />
          </button>
        </>
      ) : (
        <button
          className={`tbtn${open ? ' active' : ''}${shown ? ' with-label' : ''}`}
          onClick={toggle}
          disabled={disabled}
          title={tip || label}
          aria-label={label}
          aria-expanded={open}
        >
          <Icon size={18} />
          {shown ? <span className="tbtn-label">{shown}</span> : null}
          <IconDown size={11} />
        </button>
      )}
      {open && pos ? createPortal(
        <div
          ref={popRef}
          className="dropdown"
          style={{ left: pos.left, top: pos.top, width }}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>,
        document.body
      ) : null}
    </span>
  );
}

// The model picker: which image-to-3D model converts the next image.
function ModelMenu({ models, current, onPick, onInstall, lang, t }) {
  return (
    <>
      <div className="dd-head"><span>{t('model.choose')}</span></div>
      <ul className="dd-list model-list">
        {models.map((m) => {
          const status = m.status || 'unknown';
          return (
            <li key={m.id}>
              <button
                className={`dd-item model-item${m.id === current ? ' active' : ''}`}
                onClick={() => onPick(m.id)}
                title={m.summary?.[lang] || m.summary?.en || m.name}
              >
                {m.id === current ? <IconCheck size={15} /> : <IconLayers size={15} />}
                <span className="model-item-text">
                  <span className="model-item-name">{m.name}</span>
                  <span className="model-item-sub">{m.summary?.[lang] || m.summary?.en || ''}</span>
                  <span className="model-item-meta">
                    <span className={`model-status s-${status}`}>{t(`model.status.${status}`, status)}</span>
                    {m.license ? <span>{m.license}</span> : null}
                    {m.size ? <span>{m.size}</span> : null}
                    {m.gated ? <span className="model-gated">{t('model.gated')}</span> : null}
                  </span>
                </span>
              </button>
              {status === 'not-installed' && onInstall ? (
                <button
                  className="icon-btn"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); onInstall(m.id); }}
                  title={t('model.installNow')}
                  aria-label={t('model.installNow')}
                >
                  <IconDownload size={15} />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {models.length === 0 ? <p className="dd-empty">{t('model.noEngine')}</p> : null}
      <p className="dd-note">{t('model.note')}</p>
    </>
  );
}

export default function Toolbar({
  settings, onSettings, hasModel, hasImage, busy, models, onHome, homeOpen,
  onOpenImage, onOpenModel, onOpenRecent, onRemoveRecent, onClearRecent,
  onConvert, onCancel, onPickModel, onInstallModel,
  onExport, onScreenshot, onFit, onView,
  onTheme, onLang, onHelp, onShowSettings, onAbout,
}) {
  const { t, i18n } = useTranslation();
  const showLabel = settings.showToolbarLabels;
  const barRef = useRef(null);
  const scrollRef = useRef(null);
  const v = settings.view;
  const lang = i18n.language?.startsWith('en') ? 'en' : 'ko';

  useToolbarMinWidth(barRef, scrollRef, [
    showLabel, i18n.language, settings.fontFamily, settings.fontSize, settings.fontWeight, settings.fontStyle,
    settings.model, models.length, busy,
  ]);

  // The detached theme popup (desktop) answers with the theme picked, or with
  // THEME_OPEN_SETTINGS from its Settings button.
  useEffect(() => {
    if (!isDesktop || !api.win?.onThemePicked) return undefined;
    return api.win.onThemePicked((id) => (id === THEME_OPEN_SETTINGS ? onShowSettings?.() : onTheme(id)));
  }, [onTheme, onShowSettings]);

  const toggleView = (key) => onSettings((s) => ({ ...s, view: { ...s.view, [key]: !s.view[key] } }));
  const toggle = (key) => onSettings((s) => ({ ...s, [key]: !s[key] }));
  const current = models.find((m) => m.id === settings.model);
  const modelName = settings.backend === 'stability' ? 'Stability AI API' : (current?.name || settings.model);

  return (
    <div className="toolbar" ref={barRef}>
      <div className="toolbar-scroll" ref={scrollRef}>
        <div className="toolbar-group" role="group">
          <ToolButton icon={IconHome} label={t('toolbar.home')} tip={t('tip.home')} onClick={onHome} active={homeOpen} showLabel={showLabel} />
          <MenuButton icon={IconFolder} label={t('toolbar.fileMenu')} tip={t('tip.fileMenu')} showLabel={showLabel} width={430}>
            <ul className="dd-list">
              <li><button className="dd-item" onClick={onOpenImage} title={t('tip.openImage')}>
                <IconImage size={15} /><span className="dd-name wide">{t('toolbar.openImage')}</span><span className="dd-key">Ctrl+O</span></button></li>
              <li><button className="dd-item" onClick={onOpenModel} title={t('tip.openModel')}>
                <IconCube size={15} /><span className="dd-name wide">{t('toolbar.openModel')}</span><span className="dd-key">Ctrl+Shift+O</span></button></li>
              <li><button className="dd-item" onClick={() => onExport()} disabled={!hasModel} title={t('tip.export')}>
                <IconExport size={15} /><span className="dd-name wide">{t('toolbar.export')}</span><span className="dd-key">Ctrl+S</span></button></li>
              <li><button className="dd-item" onClick={onScreenshot} disabled={!hasModel} title={t('tip.screenshot')}>
                <IconCamera size={15} /><span className="dd-name wide">{t('toolbar.screenshot')}</span></button></li>
            </ul>
            <div className="dd-head">
              <span>{t('recent.title')}</span>
              {settings.recentFiles.length ? (
                <button
                  className="linkish"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); onClearRecent(); }}
                  title={t('recent.clear')}
                >
                  <IconTrash size={13} /> {t('recent.clear')}
                </button>
              ) : null}
            </div>
            {settings.recentFiles.length === 0 ? (
              <p className="dd-empty">{t('recent.empty')}</p>
            ) : (
              <ul className="dd-list">
                {settings.recentFiles.map((f) => (
                  <li key={f.path || f.name}>
                    <button className="dd-item" onClick={() => onOpenRecent(f)} title={f.path || f.name}>
                      {f.kind === 'model' ? <IconCube size={15} /> : <IconImage size={15} />}
                      <span className="dd-name">{f.name}</span>
                      <span className="dd-dir">{f.dir || ''}</span>
                    </button>
                    <button
                      className="icon-btn"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); onRemoveRecent(f.path || f.name); }}
                      title={t('recent.remove')}
                    >
                      <IconClose size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </MenuButton>
        </div>

        <div className="toolbar-sep" />

        <div className="toolbar-group" role="group">
          <ToolButton icon={IconImage} label={t('toolbar.openImage')} tip={t('tip.openImage')} onClick={onOpenImage} showLabel={showLabel} />
          <ToolButton icon={IconCube} label={t('toolbar.openModel')} tip={t('tip.openModel')} onClick={onOpenModel} showLabel={showLabel} />
        </div>

        <div className="toolbar-sep" />

        <div className="toolbar-group convert-group" role="group" aria-label={t('toolbar.convert')}>
          <MenuButton
            icon={IconLayers}
            label={t('toolbar.model')}
            tip={t('tip.model', { name: modelName })}
            text={modelName}
            width={400}
            className="model-picker"
            disabled={settings.backend === 'stability'}
          >
            <ModelMenu models={models} current={settings.model} onPick={onPickModel} onInstall={onInstallModel} lang={lang} t={t} />
          </MenuButton>
          {busy ? (
            <button className="tbtn with-label danger" onClick={onCancel} title={t('tip.cancel')}>
              <IconStop size={18} /><span className="tbtn-label">{t('toolbar.cancel')}</span>
            </button>
          ) : (
            <button className="tbtn with-label primary" onClick={onConvert} disabled={!hasImage} title={t('tip.convert')}>
              <IconWand size={18} /><span className="tbtn-label">{t('toolbar.convert')}</span>
            </button>
          )}
        </div>

        <div className="toolbar-sep" />

        <div className="toolbar-group" role="group">
          <MenuButton
            icon={IconExport}
            label={t('toolbar.export')}
            tip={t('tip.exportAs', { fmt: settings.exportFormat.toUpperCase() })}
            menuTip={t('tip.exportMenu')}
            showLabel={showLabel}
            width={260}
            disabled={!hasModel}
            onAction={() => onExport(settings.exportFormat)}
          >
            <div className="dd-head"><span>{t('toolbar.exportAs')}</span></div>
            <ul className="dd-list">
              {EXPORT_FORMATS.map((f) => (
                <li key={f.id}>
                  <button className={`dd-item${settings.exportFormat === f.id ? ' active' : ''}`} onClick={() => onExport(f.id)} title={f.name}>
                    <IconExport size={15} /><span className="dd-name wide">{f.name}</span>
                    {f.textures ? null : <span className="dd-key">{t('toolbar.noTextures')}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </MenuButton>
          <ToolButton icon={IconCamera} label={t('toolbar.screenshot')} tip={t('tip.screenshot')} onClick={onScreenshot} disabled={!hasModel} showLabel={showLabel} />
        </div>

        <div className="toolbar-sep" />

        <div className="toolbar-group" role="group" aria-label={t('toolbar.viewGroup')}>
          <MenuButton
            icon={IconFit}
            label={t('toolbar.fit')}
            tip={t('tip.fit')}
            menuTip={t('tip.views')}
            showLabel={showLabel}
            width={200}
            onAction={onFit}
          >
            <ul className="dd-list">
              {Object.keys(VIEW_PRESETS).map((name) => (
                <li key={name}>
                  <button className="dd-item" onClick={() => onView(name)} title={t(`view.${name}`)}>
                    <IconEye size={15} /><span className="dd-name wide">{t(`view.${name}`)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </MenuButton>
          <ToolButton icon={IconOrbit} label={t('toolbar.autoRotate')} tip={t('tip.autoRotate')} onClick={() => toggleView('autoRotate')} active={v.autoRotate} showLabel={showLabel} />
          <ToolButton icon={IconWireframe} label={t('toolbar.wireframe')} tip={t('tip.wireframe')} onClick={() => toggleView('wireframe')} active={v.wireframe} showLabel={showLabel} />
          <ToolButton icon={IconGrid} label={t('toolbar.grid')} tip={t('tip.grid')} onClick={() => toggleView('grid')} active={v.grid} showLabel={showLabel} />
          <ToolButton icon={IconAxes} label={t('toolbar.axes')} tip={t('tip.axes')} onClick={() => toggleView('axes')} active={v.axes} showLabel={showLabel} />
          <ToolButton icon={IconRuler} label={t('toolbar.rulers')} tip={t('tip.rulers')} onClick={() => toggleView('rulers')} active={v.rulers} showLabel={showLabel} />
          <ToolButton icon={IconBox} label={t('toolbar.bbox')} tip={t('tip.bbox')} onClick={() => toggleView('boundingBox')} active={v.boundingBox} showLabel={showLabel} />
          <ToolButton icon={IconBulb} label={t('toolbar.lights')} tip={t('tip.lights')} onClick={() => toggleView('showLightHelpers')} active={v.showLightHelpers} showLabel={showLabel} />
        </div>

        <div className="toolbar-sep" />

        <div className="toolbar-group" role="group" aria-label={t('toolbar.panels')}>
          <ToolButton icon={IconPanelLeftOpen} label={t('toolbar.leftPanel')} tip={t('tip.leftPanel')} onClick={() => toggle('leftPanel')} active={settings.leftPanel} showLabel={showLabel} />
          <ToolButton icon={IconPanelRightOpen} label={t('toolbar.rightPanel')} tip={t('tip.rightPanel')} onClick={() => toggle('rightPanel')} active={settings.rightPanel} showLabel={showLabel} />
          <ToolButton icon={IconTerminal} label={t('toolbar.log')} tip={t('tip.log')} onClick={() => toggle('logPanel')} active={settings.logPanel} showLabel={showLabel} />
        </div>
      </div>

      {/* Theme, language, help, settings and about: always at the right end. */}
      <div className="toolbar-right">
        <MenuButton
          icon={IconTheme}
          label={t('toolbar.theme')}
          tip={t('tip.theme', { name: nextTheme(settings.theme, settings.customThemes) })}
          menuTip={t('tip.themePick')}
          width={400}
          constrain={false}
          overflowWindow
          align="right"
          menuValue={settings.theme}
          onAction={() => onTheme(nextTheme(settings.theme, settings.customThemes))}
        >
          <ThemeMenu
            current={settings.theme}
            customThemes={settings.customThemes}
            onPick={onTheme}
            onOpenSettings={onShowSettings}
            labelledBy={t('toolbar.theme')}
          />
        </MenuButton>
        <ToolButton
          icon={(p) => <IconFlag lang={otherLang(settings.lang)} {...p} />}
          label={t('toolbar.lang')}
          tip={t('tip.lang')}
          onClick={() => onLang()}
        />
        <ToolButton icon={IconHelp} label={t('toolbar.help')} tip={t('tip.help')} onClick={onHelp} />
        <ToolButton icon={IconSettings} label={t('toolbar.settings')} tip={t('tip.settings')} onClick={onShowSettings} />
        <ToolButton icon={IconInfo} label={t('toolbar.about')} tip={t('tip.about')} onClick={onAbout} />
      </div>
    </div>
  );
}

