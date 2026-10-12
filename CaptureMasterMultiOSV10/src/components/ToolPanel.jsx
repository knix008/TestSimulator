import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Icon } from './Icons.jsx';
import { NumberInput } from './common.jsx';
import { TOOL_PANEL_WIDTH } from '../lib/settings.js';
import { SELECTION_SHAPES, SHAPE_ICON } from '../lib/selection.js';

export const TOOLS = ['select', 'pen', 'rect', 'ellipse', 'arrow', 'line', 'text', 'highlight', 'pixelate', 'number', 'crop'];
export const TOOL_KEYS = { select: 'V', pen: 'P', rect: 'R', ellipse: 'O', arrow: 'A', line: 'L', text: 'T', highlight: 'H', pixelate: 'M', number: 'N', crop: 'C' };

/** The selection section: the marquee shape plus what can be done with a selection. */
function selectionItems(t, sel, on) {
  const any = sel.hasSelection || sel.hasAnnotation;
  return [
    ...SELECTION_SHAPES.map((shape) => ({
      id: `shape-${shape}`, icon: SHAPE_ICON[shape], label: t(`selShape.${shape}`), tip: t(`selShape.${shape}Tip`),
      active: sel.shape === shape, onClick: () => on.setShape(shape),
    })),
    { id: 'selectAll', icon: 'region', label: t('menu.selectAll'), tip: t('toolPanel.selectAllTip'), kbd: 'Ctrl+A', onClick: on.selectAll },
    { id: 'crop', icon: 'check', label: t('toolbar.applyCrop'), tip: t('toolPanel.cropTip'), kbd: 'Enter', disabled: !sel.hasSelection, onClick: on.crop },
    { id: 'delete', icon: 'trash', label: t('edit.delete'), tip: t('toolPanel.deleteTip'), kbd: 'Del', disabled: !any, onClick: on.remove },
    { id: 'deselect', icon: 'close', label: t('menu.deselect'), tip: t('toolPanel.deselectTip'), kbd: 'Esc', disabled: !any, onClick: on.deselect },
  ];
}

/**
 * The collapsible annotation tool palette on the left of the window. Collapsed,
 * it keeps the tools as a strip of icons so they stay one click away.
 */
export function ToolPanel({ open, width, tool, enabled, selection, onSelection, annotation, onAnnotation, onSetTool, onToggle, onResize }) {
  const { t } = useTranslation();
  const drag = useRef(null);
  const selItems = selectionItems(t, selection, onSelection);
  const fillItem = {
    id: 'fill', icon: 'fill', label: t('toolbar.fill'), tip: t('toolbar.fillTip'),
    active: annotation.fill, onClick: () => onAnnotation.setFill(!annotation.fill),
  };
  const colorInput = (className) => (
    <input className={className} type="color" value={annotation.color} onChange={(e) => onAnnotation.setColor(e.target.value)} disabled={!enabled} aria-label={t('toolbar.color')} />
  );

  if (!open) {
    const stripBtn = ({ id, icon, tip, label, active, disabled, onClick }) => (
      <button
        key={id}
        type="button"
        className={`tool-strip-btn${active ? ' active' : ''}`}
        data-tip={tip}
        aria-label={label}
        aria-pressed={!!active}
        disabled={!enabled || disabled}
        onClick={onClick}
      >
        <Icon name={icon} />
      </button>
    );
    return (
      <aside className="tool-panel collapsed">
        <button type="button" className="tool-strip-toggle" onClick={onToggle} data-tip={t('toolPanel.expandTip')} aria-label={t('toolPanel.expand')}>
          <Icon name="chevronRight" />
          <Icon name="tools" className="strip-icon" />
          <span className="history-strip-label">{t('toolPanel.title')}</span>
        </button>
        <div className="tool-strip" role="toolbar" aria-label={t('toolPanel.title')} aria-orientation="vertical">
          {TOOLS.map((id) => stripBtn({ id, icon: id, tip: t(`tool.${id}Tip`), label: t(`tool.${id}`), active: tool === id, onClick: () => onSetTool(id) }))}
          <div className="tool-strip-sep" role="separator" />
          {selItems.map(stripBtn)}
          {/* Stroke and text size need room for a number field; expand the panel for those. */}
          <div className="tool-strip-sep" role="separator" />
          <span className="tool-strip-color" data-tip={t('toolbar.colorTip')}>{colorInput('tool-color')}</span>
          {stripBtn(fillItem)}
        </div>
      </aside>
    );
  }

  const startResize = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, w: width };
  };
  const moveResize = (e) => {
    if (!drag.current) return;
    const w = Math.min(TOOL_PANEL_WIDTH.max, Math.max(TOOL_PANEL_WIDTH.min, drag.current.w + e.clientX - drag.current.x));
    onResize(Math.round(w));
  };
  const endResize = () => { drag.current = null; };

  const item = ({ id, icon, label, tip, kbd, active, disabled, onClick }) => (
    <button
      key={id}
      type="button"
      className={`tool-item${active ? ' active' : ''}`}
      data-tip={tip}
      aria-pressed={!!active}
      disabled={!enabled || disabled}
      onClick={onClick}
    >
      <Icon name={icon} />
      <span className="tool-item-label">{label}</span>
      {kbd ? <kbd>{kbd}</kbd> : null}
    </button>
  );

  return (
    <aside className="tool-panel" style={{ width }}>
      <div className="tool-panel-resize" onPointerDown={startResize} onPointerMove={moveResize} onPointerUp={endResize} onPointerCancel={endResize} />
      <header className="history-head">
        <Icon name="tools" />
        <span className="history-title">{t('toolPanel.title')}</span>
        <span className="history-spacer" />
        <button type="button" data-tip={t('toolPanel.collapseTip')} aria-label={t('toolPanel.collapse')} onClick={onToggle}><Icon name="chevronLeft" /></button>
      </header>
      <div className="tool-list" role="toolbar" aria-label={t('toolPanel.title')} aria-orientation="vertical">
        {TOOLS.map((id) => item({ id, icon: id, label: t(`tool.${id}`), tip: t(`tool.${id}Tip`), kbd: TOOL_KEYS[id], active: tool === id, onClick: () => onSetTool(id) }))}
        <div className="tool-section">{t('toolPanel.selection')}</div>
        {selItems.map(item)}
        <div className="tool-section">{t('toolPanel.properties')}</div>
        <div className={`tool-prop${enabled ? '' : ' disabled'}`} data-tip={t('toolbar.colorTip')}>
          <Icon name="palette" />
          <span className="tool-item-label">{t('toolbar.color')}</span>
          {colorInput('tool-color')}
        </div>
        <div className={`tool-prop${enabled ? '' : ' disabled'}`} data-tip={t('toolbar.strokeTip')}>
          <Icon name="line" />
          <span className="tool-item-label">{t('toolbar.stroke')}</span>
          <NumberInput min={1} max={40} value={annotation.strokeWidth} onChange={onAnnotation.setStrokeWidth} disabled={!enabled} ariaLabel={t('toolbar.stroke')} width={30} />
        </div>
        <div className={`tool-prop${enabled ? '' : ' disabled'}`} data-tip={t('toolbar.fontSizeTip')}>
          <Icon name="font" />
          <span className="tool-item-label">{t('toolbar.fontSize')}</span>
          <NumberInput min={8} max={200} value={annotation.fontSize} onChange={onAnnotation.setFontSize} disabled={!enabled} ariaLabel={t('toolbar.fontSize')} width={30} />
        </div>
        {item(fillItem)}
      </div>
      {!enabled ? <div className="tool-panel-hint">{t('toolPanel.noImage')}</div> : null}
    </aside>
  );
}
