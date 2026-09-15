// Icon toolbar under the menu bar: file · edit · find · view shortcuts, the
// auto-indent / spell-check toggles and the editor font (family combo box +
// size). Next to the format button the formatter the active document will
// get, between zoom in / out the current zoom. Hidden with 보기 › 도구 모음.
import React, { useLayoutEffect, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { syncWindowMinWidth } from '../lib/backend';
import { Icon } from './Icons';
import { ContextMenu } from './ContextMenu';
import { AppControls } from './MenuBar';
import { FontPicker } from './FontPicker';

const GROUPS = [
  [
    { id: 'new', icon: 'filePlus', tip: 'tip_new' },
    { id: 'open', icon: 'fileOpen', tip: 'tip_open' },
    { id: 'openFolder', icon: 'folderOpen', tip: 'tip_open_folder' },
    { id: 'save', icon: 'fileSave', tip: 'tip_save', needs: 'dirty' },
    { id: 'saveAll', icon: 'saveAll', tip: 'tip_save_all', needs: 'anyDirty' },
    { id: 'close', icon: 'close', tip: 'tip_close' },
    { id: 'print', icon: 'print', tip: 'tip_print' },
  ],
  [
    { id: 'undo', icon: 'undo', tip: 'tip_undo' },
    { id: 'redo', icon: 'redo', tip: 'tip_redo' },
  ],
  [
    { id: 'cut', icon: 'cut', tip: 'tip_cut' },
    { id: 'copy', icon: 'copy', tip: 'tip_copy' },
    { id: 'paste', icon: 'paste', tip: 'tip_paste' },
  ],
  [
    { id: 'find', icon: 'search', tip: 'tip_find' },
    { id: 'replace', icon: 'replace', tip: 'tip_replace' },
  ],
  [
    { id: 'formatDoc', icon: 'format', tip: 'tip_format', needs: 'canFormat', tipOf: (st) => st.formatTip },   // an action, not a toggle: formats the active document with the language's formatter
    { label: 'formatter' },   // which formatter that is (state.formatter, see App)
  ],
  [
    { id: 'toggle:showWhitespace', icon: 'pilcrow', tip: 'tip_ws', toggle: 'showWhitespace' },
    { id: 'zoomIn', icon: 'zoomIn', tip: 'tip_zoom_in' },
    { label: 'zoom' },        // the zoom level; a click resets it
    { id: 'zoomOut', icon: 'zoomOut', tip: 'tip_zoom_out' },
    { id: 'toggle:sidebarVisible', icon: 'sidebar', tip: 'tip_sidebar', toggle: 'sidebarVisible' },
    { id: 'toggleSplit', icon: 'splitCols', tip: 'tip_split', on: (st) => st.split && st.split !== 'none' },
  ],
  [
    { id: 'toggle:wordWrap', icon: 'wrap', tip: 'tip_wrap', toggle: 'wordWrap' },
    { id: 'toggle:autoIndent', icon: 'autoIndent', tip: 'tip_auto_indent', toggle: 'autoIndent' },
    { id: 'toggle:spellCheck', icon: 'spell', tip: 'tip_spell', toggle: 'spellCheck' },
    { id: 'toggle:lint', icon: 'lint', tip: 'tip_lint', toggle: 'lint' },
    { id: 'toggle:termVisible', icon: 'terminal', tip: 'tip_terminal', toggle: 'termVisible' },
  ],
];

// The formatter label: the tool 문서 정렬 will use for the active document
// (state.formatter from App: { label, auto, off, missing }). A click opens
// the choices for the document's language (state.formatterItems, the same
// list as settings › 정렬). Nothing without a document.
function FormatterLabel({ info, onOpen }) {
  if (!info) return null;
  const tip = info.off ? t('tip_formatter_off') : t(info.missing ? 'tip_formatter_missing' : info.auto ? 'tip_formatter_auto' : 'tip_formatter', { tool: info.label });
  return (
    <button className={`tool-btn tb-label tb-formatter ${info.off ? 'off' : ''} ${info.missing ? 'missing' : ''}`} title={`${tip}
${t('tip_formatter_pick')}`}
      onMouseDown={(e) => e.preventDefault()} onClick={(e) => onOpen(e.currentTarget)}>
      <span className="tb-formatter-name">{info.label}</span><Icon name="chevronDown" size={11} className="muted" />
    </button>
  );
}

export function Toolbar({ onAction, onSetting, settings, state }) {
  useLanguage();
  const size = Number(settings.fontSize) || 14;
  const setSize = (n) => onSetting({ fontSize: Math.max(8, Math.min(40, Math.round(n) || 14)) });
  // Whatever changed on the bar (labels, language, font), the window must still fit it.
  useLayoutEffect(() => { syncWindowMinWidth(); });
  const [picker, setPicker] = useState(null);   // the element the formatter picker is anchored to
  const labels = {
    formatter: () => <FormatterLabel key="formatter" info={state.formatter} onOpen={(el) => setPicker(picker ? null : el)} />,
    zoom: () => <button key="zoom" className="tool-btn tb-label tb-zoom" title={t('tip_zoom_level', { n: state.zoom })} onMouseDown={(e) => e.preventDefault()} onClick={() => onAction('zoomReset')}>{t('st_zoom', { n: state.zoom })}</button>,
  };
  return (
    <div className="icon-toolbar">
      {GROUPS.map((g, gi) => (
        <React.Fragment key={gi}>
          {gi > 0 && <span className="tb-sep" />}
          {g.map((b) => b.label ? labels[b.label]() : (
            <button key={b.id} className={`tool-btn ${(b.on ? b.on(settings) : b.toggle && settings[b.toggle]) ? 'on' : ''}`} title={(b.tipOf && b.tipOf(state)) || t(b.tip)} aria-label={t(b.tip)}
              disabled={b.needs ? !state[b.needs] : false}
              onMouseDown={(e) => e.preventDefault()}   /* keep the editor focused */
              onClick={() => onAction(b.id)}>
              <Icon name={b.icon} size={17} />
            </button>
          ))}
        </React.Fragment>
      ))}
      <span className="tb-sep" />
      <span className="tb-font" title={t('tb_font')}>
        <Icon name="text" size={15} className="muted" />
        <FontPicker value={settings.fontFamily} onChange={(f) => onSetting({ fontFamily: f })} width={140} />
      </span>
      <span className="tb-size" title={t('tb_font_size')}>
        <button className="tool-btn" title={t('tb_font_smaller')} onMouseDown={(e) => e.preventDefault()} onClick={() => setSize(size - 1)}><Icon name="minus" size={14} /></button>
        <input type="number" min={8} max={40} value={size} onChange={(e) => setSize(Number(e.target.value))} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur(); }} />
        <button className="tool-btn" title={t('tb_font_larger')} onMouseDown={(e) => e.preventDefault()} onClick={() => setSize(size + 1)}><Icon name="plus" size={14} /></button>
      </span>
      <span className="tb-spacer" />
      <AppControls onAction={onAction} theme={settings.theme} compact />
      {picker && state.formatterItems && (
        <ContextMenu anchorEl={picker} x={0} y={0} items={state.formatterItems()} className="st-menu" onClose={() => setPicker(null)}
          onPick={(id) => { setPicker(null); onAction(id); }} />
      )}
    </div>
  );
}

export default Toolbar;
