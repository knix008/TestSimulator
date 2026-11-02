// The figure's own menus and tool bars (uimenu, uicontextmenu, uitoolbar,
// uipushtool, uitoggletool): a menu bar row and tool bar rows above the
// figure canvas, and the context menus opened on right-click. Menus open
// with the app's icon menu (lib/menu); a submenu opens in place of its
// parent when picked. Every pick goes to the engine as graphics.callback.
import React, { useMemo } from 'react';
import { openMenu } from '../lib/menu';
import { FigIcon } from './icons.jsx';
import { tr } from './i18n.js';
import { menuChildren, menuItems, menuLabel, findIn, toolbarsOf, toolLabel, cdataPixels } from './uimodel.js';

/** Opens the items of a uimenu / uicontextmenu node at a point or element rectangle. */
export function openUiMenu(ctl, root, at) {
  const items = menuItems(root);
  if (!items.length) return;
  openMenu(at, items, (id) => {
    const n = findIn(root, Number(id));
    if (!n) return;
    ctl.callback(n, 'MenuSelected');
    if (menuChildren(n).length) setTimeout(() => openUiMenu(ctl, n, at), 0);
  });
}

export function MenuBar({ ctl, fig, lang }) {
  const menus = menuChildren(fig);
  if (!menus.length) return null;
  return (
    <div className="fig-menubar" role="menubar" aria-label={tr(lang, 'menuBar')}>
      {menus.map((m) => {
        const sub = menuChildren(m).length > 0;
        const disabled = m.props.Enable === false;
        return (
          <button key={m.id} type="button" role="menuitem" className={`fig-menu ${m.props.Checked ? 'on' : ''}`} data-handle={m.id} disabled={disabled}
            onClick={(e) => {
              if (!sub) { ctl.callback(m, 'MenuSelected'); return; }
              if (m.props.Callback || m.props.MenuSelectedFcn) ctl.callback(m, 'MenuSelected');
              openUiMenu(ctl, m, e.currentTarget.getBoundingClientRect());
            }}>
            <span>{menuLabel(m)}</span>{sub && <FigIcon name="chevronDown" size={12} />}
          </button>
        );
      })}
    </div>
  );
}

function ToolImage({ cdata }) {
  const url = useMemo(() => {
    const px = cdataPixels(cdata);
    if (!px || typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = px.width; c.height = px.height;
    const g = c.getContext('2d');
    if (!g) return null;
    g.putImageData(new ImageData(px.data, px.width, px.height), 0, 0);
    return c.toDataURL('image/png');
  }, [cdata]);
  return url ? <img className="fig-tool-img" src={url} alt="" width={16} height={16} /> : <FigIcon name="tool" size={15} />;
}

export function UiToolbars({ ctl, fig, lang }) {
  const bars = toolbarsOf(fig);
  if (!bars.length) return null;
  return bars.map(({ node, tools }) => (
    <div key={node.id} className="fig-uitoolbar" role="toolbar" aria-label={tr(lang, 'toolBar')} data-handle={node.id}>
      {tools.map((t, i) => {
        const toggle = t.type === 'uitoggletool';
        const on = toggle && !!t.props.State;
        const label = toolLabel(t, tr(lang, 'tool'));
        return (
          <React.Fragment key={t.id}>
            {t.props.Separator && i > 0 && <span className="fig-sep" />}
            <button type="button" className={`fig-tb ${on ? 'on' : ''}`} data-handle={t.id} title={label} aria-pressed={toggle ? on : undefined} disabled={t.props.Enable === false}
              onClick={() => ctl.callback(t, 'ClickedCallback', toggle ? { State: !on } : null)}>
              <ToolImage cdata={t.props.CData} /><span className="fig-tb-label">{label}</span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  ));
}
