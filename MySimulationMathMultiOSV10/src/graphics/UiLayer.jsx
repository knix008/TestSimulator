// uicontrol / ui* components as real HTML controls over the figure, placed by
// their pixel Position ([left bottom width height] from the bottom left of the
// figure or their uipanel). Changes go to the engine as graphics.callback
// (props first, then the callback runs).
import React, { useEffect, useState } from 'react';
import { IconSelect } from '../views/common';
import { rgbCss } from './theme.js';
import { uiItems } from './scene.js';

const UI_TYPES = new Set(['uicontrol', 'uibutton', 'uislider', 'uieditfield', 'uilabel', 'uidropdown', 'uicheckbox', 'uipanel']);

function colorOf(node, prop, fallback) {
  const v = node.props[prop];
  if (node.auto && node.auto.includes(prop)) return fallback;
  if (Array.isArray(v)) return rgbCss(v);
  return v === 'none' ? 'transparent' : fallback;
}

function boxOf(node, pw, ph) {
  const p = node.props;
  let [l, b, w, h] = Array.isArray(p.Position) ? p.Position : [20, 20, 60, 20];
  if (p.Units === 'normalized') { l *= pw; b *= ph; w *= pw; h *= ph; }
  if (node.type === 'uislider' && h < 20) { b -= (24 - h) / 2; h = 24; }
  return { left: l, top: ph - b - h, width: Math.max(4, w), height: Math.max(4, h) };
}

const pxFont = (p) => (p.FontSize ? `${Math.round(p.FontSize * 1.25)}px` : undefined);

/** A text field that commits on Enter / blur (not on every key). */
function EditBox({ value, onCommit, disabled, style, multiline, numeric, placeholder }) {
  const [text, setText] = useState(String(value ?? ''));
  useEffect(() => { setText(String(value ?? '')); }, [value]);
  const commit = () => { if (text !== String(value ?? '')) onCommit(text); };
  const common = {
    value: text, disabled, style, placeholder,
    onChange: (e) => setText(e.target.value), onBlur: commit,
    onKeyDown: (e) => { e.stopPropagation(); if (e.key === 'Enter' && !(multiline && e.shiftKey)) { e.preventDefault(); commit(); } if (e.key === 'Escape') setText(String(value ?? '')); },
  };
  return multiline ? <textarea className="fig-ui-edit" {...common} /> : <input type="text" inputMode={numeric ? 'decimal' : undefined} className="fig-ui-edit" {...common} />;
}

function Control({ node, ctl, pw, ph, theme }) {
  const p = node.props;
  if (p.Visible === false) return null;
  const box = boxOf(node, pw, ph);
  const enabled = p.Enable === undefined ? true : p.Enable === true || p.Enable === 'on';
  const bg = colorOf(node, 'BackgroundColor', null);
  const fg = colorOf(node, node.type === 'uicontrol' || node.type === 'uipanel' ? 'ForegroundColor' : 'FontColor', null);
  const style = { position: 'absolute', ...box, fontSize: pxFont(p), color: fg || undefined, background: bg || undefined, fontWeight: p.FontWeight === 'bold' ? 650 : undefined };
  const fire = (event, props) => ctl.callback(node, event, props);
  const tip = p.Tooltip || p.TooltipString || undefined;
  const common = { 'data-handle': node.id, title: tip };

  if (node.type === 'uipanel') {
    return (
      <fieldset className="fig-ui-panel" style={style} {...common}>
        {p.Title ? <legend>{p.Title}</legend> : null}
        <Children nodes={node.children} ctl={ctl} pw={box.width} ph={box.height} theme={theme} />
      </fieldset>
    );
  }
  if (node.type === 'uibutton') {
    return <button type="button" className="fig-ui-btn" style={style} disabled={!enabled} {...common} onClick={() => fire('ButtonPushed')}>{p.Text}</button>;
  }
  if (node.type === 'uilabel') {
    return <div className="fig-ui-label" style={{ ...style, justifyContent: { left: 'flex-start', center: 'center', right: 'flex-end' }[p.HorizontalAlignment] || 'flex-start', alignItems: { top: 'flex-start', center: 'center', bottom: 'flex-end' }[p.VerticalAlignment] || 'center', whiteSpace: p.WordWrap ? 'normal' : 'pre' }} {...common}>{p.Text}</div>;
  }
  if (node.type === 'uicheckbox') {
    return <label className="fig-ui-check" style={style} {...common}><input type="checkbox" checked={!!p.Value} disabled={!enabled} onChange={(e) => fire('ValueChanged', { Value: e.target.checked })} /><span>{p.Text}</span></label>;
  }
  if (node.type === 'uislider') {
    const [lo, hi] = p.Limits || [0, 100];
    return <input type="range" className="fig-ui-slider" style={style} min={lo} max={hi} step={p.Step > 0 ? p.Step : (hi - lo) / 1000} value={Number(p.Value) || 0} disabled={!enabled} {...common}
      onChange={(e) => { node.props.Value = Number(e.target.value); ctl.emit(); }}
      onPointerUp={(e) => fire('ValueChanged', { Value: Number(e.target.value) })} onKeyUp={(e) => fire('ValueChanged', { Value: Number(e.target.value) })} />;
  }
  if (node.type === 'uieditfield') {
    const numeric = p.EditStyle === 'numeric';
    return <EditBox value={p.Value} numeric={numeric} placeholder={p.Placeholder} disabled={!enabled || p.Editable === false} style={{ ...style, textAlign: p.HorizontalAlignment || 'left' }}
      onCommit={(s) => { if (numeric) { const v = Number(s); if (Number.isFinite(v)) fire('ValueChanged', { Value: v }); } else fire('ValueChanged', { Value: s }); }} />;
  }
  if (node.type === 'uidropdown') {
    const items = (p.Items || []).map(String);
    return (
      <div className="fig-ui-drop" style={style} {...common}>
        <IconSelect value={p.Value == null ? items[0] : String(p.Value)} options={items.map((s) => ({ value: s, label: s, icon: 'list' }))} onChange={(v) => fire('ValueChanged', { Value: v })} width={box.width} />
      </div>
    );
  }
  // uicontrol
  const s = p.Style || 'pushbutton';
  const min = p.Min ?? 0, max = p.Max ?? 1;
  const cb = (props) => fire('Callback', props);
  switch (s) {
    case 'pushbutton': return <button type="button" className="fig-ui-btn" style={style} disabled={!enabled} {...common} onClick={() => cb()}>{String(p.String ?? '')}</button>;
    case 'togglebutton': {
      const on = Number(p.Value) === max;
      return <button type="button" className={`fig-ui-btn ${on ? 'on' : ''}`} aria-pressed={on} style={style} disabled={!enabled} {...common} onClick={() => cb({ Value: on ? min : max })}>{String(p.String ?? '')}</button>;
    }
    case 'checkbox': case 'radiobutton': {
      const on = Number(p.Value) === max;
      return <label className="fig-ui-check" style={style} {...common}><input type={s === 'checkbox' ? 'checkbox' : 'radio'} checked={on} disabled={!enabled} onChange={() => cb({ Value: s === 'radiobutton' ? max : (on ? min : max) })} /><span>{String(p.String ?? '')}</span></label>;
    }
    case 'edit': {
      const multi = max - min > 1;
      return <EditBox value={Array.isArray(p.String) ? p.String.join('\n') : p.String} multiline={multi} disabled={!enabled || p.Enable === 'inactive'} style={{ ...style, textAlign: p.HorizontalAlignment || 'center' }} onCommit={(t) => cb({ String: t })} />;
    }
    case 'text': return <div className="fig-ui-label" style={{ ...style, justifyContent: { left: 'flex-start', center: 'center', right: 'flex-end' }[p.HorizontalAlignment] || 'center', alignItems: 'flex-start', whiteSpace: 'pre-wrap' }} {...common}>{Array.isArray(p.String) ? p.String.join('\n') : String(p.String ?? '')}</div>;
    case 'slider': {
      const step = Array.isArray(p.SliderStep) ? p.SliderStep[0] * (max - min) : (max - min) / 100;
      return <input type="range" className="fig-ui-slider" style={style} min={min} max={max} step={step || 'any'} value={Number(p.Value ?? min)} disabled={!enabled} {...common}
        onChange={(e) => { node.props.Value = Number(e.target.value); ctl.emit(); }}
        onPointerUp={(e) => cb({ Value: Number(e.target.value) })} onKeyUp={(e) => cb({ Value: Number(e.target.value) })} />;
    }
    case 'listbox': {
      const items = uiItems(p.String);
      const sel = new Set((Array.isArray(p.Value) ? p.Value : [p.Value ?? 1]).map(Number));
      return (
        <div className="fig-ui-list" role="listbox" style={style} {...common}>
          {items.map((t, i) => <div key={i} role="option" aria-selected={sel.has(i + 1)} className={`fig-ui-item ${sel.has(i + 1) ? 'on' : ''}`} onClick={() => enabled && cb({ Value: i + 1 })}>{t}</div>)}
        </div>
      );
    }
    case 'popupmenu': {
      const items = uiItems(p.String);
      const v = Math.max(1, Math.min(items.length, Number(p.Value) || 1));
      return (
        <div className="fig-ui-drop" style={style} {...common}>
          <IconSelect value={v} options={items.map((t, i) => ({ value: i + 1, label: t, icon: 'list' }))} onChange={(nv) => cb({ Value: nv })} width={box.width} />
        </div>
      );
    }
    case 'frame': return <div className="fig-ui-frame" style={style} {...common} />;
    default: return null;
  }
}

function Children({ nodes, ctl, pw, ph, theme }) {
  return (nodes || []).slice().reverse().filter((n) => UI_TYPES.has(n.type)).map((n) => <Control key={n.id} node={n} ctl={ctl} pw={pw} ph={ph} theme={theme} />);
}

export function UiLayer({ ctl, fig, left, top, width, height, theme }) {
  const has = (fig.children || []).some((n) => UI_TYPES.has(n.type));
  if (!has) return null;
  return (
    <div className="fig-ui" style={{ left, top, width, height }} onPointerDown={(e) => e.stopPropagation()}>
      <Children nodes={fig.children} ctl={ctl} pw={width} ph={height} theme={theme} />
    </div>
  );
}
