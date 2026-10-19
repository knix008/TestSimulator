// Status bar: a transient message on the left; on the right the selection
// (how many topics, the level of the selected one), the map's size, the
// filter state, the layout and map style (each a picker) and the zoom. The
// size grip (desktop) resizes the frameless window.
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { isDesktop, getWindowSize, setWindowSize } from '../lib/backend';
import { Icon } from './Icons';
import { ContextMenu } from './ContextMenu';
import { LAYOUT_ICONS } from './Toolbar';

function SizeGrip() {
  const start = useRef(null);
  const onDown = async (e) => {
    e.preventDefault();
    const [w, h] = await getWindowSize();
    start.current = { x: e.screenX, y: e.screenY, w, h };
    const move = (ev) => { if (start.current) setWindowSize(start.current.w + (ev.screenX - start.current.x), start.current.h + (ev.screenY - start.current.y)); };
    const up = () => { start.current = null; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  return (
    <span className="size-grip" title={t('win_resize')} onMouseDown={onDown}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><circle cx="10" cy="2" r="1.2" /><circle cx="6" cy="6" r="1.2" /><circle cx="10" cy="6" r="1.2" /><circle cx="2" cy="10" r="1.2" /><circle cx="6" cy="10" r="1.2" /><circle cx="10" cy="10" r="1.2" /></svg>
    </span>
  );
}

export function StatusBar({ message, info, pickers, onAction }) {
  useLanguage();
  const [menu, setMenu] = useState(null);
  const [flash, setFlash] = useState(false);
  useEffect(() => { if (!message) return undefined; setFlash(true); const id = setTimeout(() => setFlash(false), 600); return () => clearTimeout(id); }, [message]);
  const open = (kind) => (e) => setMenu(menu && menu.kind === kind ? null : { kind, el: e.currentTarget });
  const items = menu ? pickers[menu.kind]() : null;
  return (
    <div className={`statusbar ${isDesktop ? 'has-grip' : ''}`}>
      <span className={`status-text ellipsis ${flash ? 'flash' : ''}`}>{message || t('ready')}</span>
      {info && (
        <>
          {info.selected > 1
            ? <span className="st-field st-sel">{t('st_selected', { n: info.selected })}</span>
            : info.level != null && <span className="st-field">{t(info.level === 0 ? 'st_central' : info.floating ? 'st_floating' : 'st_level', { n: info.level })}</span>}
          <span className="st-field muted">{t('st_topics', { n: info.topics.toLocaleString() })}</span>
          {info.filter > 0 && <button className="st-btn st-filter" title={t('filter_clear')} onClick={() => onAction('filterClear')}><Icon name="filter" size={13} />{t('st_filter', { n: info.filter })}</button>}
          {info.focused && <button className="st-btn st-filter" title={t('focus_off')} onClick={() => onAction('focusOff')}><Icon name="focus" size={13} />{t('st_focus')}</button>}
          <button className="st-btn" title={t('tip_layout')} onClick={open('layout')}><Icon name={LAYOUT_ICONS[info.layout] || 'layoutMap'} size={13} />{t(`layout_${info.layout}`)}</button>
          <button className="st-btn" title={t('tip_map_style')} onClick={open('style')}><Icon name="mapStyle" size={13} />{info.styleName}</button>
          {info.zoom != null && <button className="st-btn" title={t('tip_zoom_reset')} onClick={() => onAction('zoom100')}>{`${info.zoom}%`}</button>}
        </>
      )}
      {isDesktop && <SizeGrip />}
      {menu && items && (
        <ContextMenu anchorEl={menu.el} above x={0} y={0} items={items} className={menu.kind === 'style' ? 'style-menu' : 'st-menu'} onClose={() => setMenu(null)}
          onPick={(id) => { setMenu(null); onAction(id); }} />
      )}
    </div>
  );
}

export default StatusBar;
