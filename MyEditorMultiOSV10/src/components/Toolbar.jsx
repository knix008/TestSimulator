// Icon toolbar under the menu bar: file · edit · find · view shortcuts, the
// auto-indent / spell-check toggles and the editor font (family combo box +
// size). Hidden with 보기 › 도구 모음.
import React from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from './Icons';
import { FontPicker } from './FontPicker';

const GROUPS = [
  [
    { id: 'new', icon: 'filePlus', tip: 'tip_new' },
    { id: 'open', icon: 'folderOpen', tip: 'tip_open' },
    { id: 'save', icon: 'fileSave', tip: 'tip_save', needs: 'dirty' },
    { id: 'saveAll', icon: 'saveAll', tip: 'tip_save_all', needs: 'anyDirty' },
    { id: 'close', icon: 'close', tip: 'tip_close' },
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
    { id: 'toggle:wordWrap', icon: 'wrap', tip: 'tip_wrap', toggle: 'wordWrap' },
    { id: 'toggle:showWhitespace', icon: 'pilcrow', tip: 'tip_ws', toggle: 'showWhitespace' },
    { id: 'zoomIn', icon: 'zoomIn', tip: 'tip_zoom_in' },
    { id: 'zoomOut', icon: 'zoomOut', tip: 'tip_zoom_out' },
    { id: 'toggle:sidebarVisible', icon: 'sidebar', tip: 'tip_sidebar', toggle: 'sidebarVisible' },
  ],
  [
    { id: 'toggle:autoIndent', icon: 'autoIndent', tip: 'tip_auto_indent', toggle: 'autoIndent' },
    { id: 'toggle:spellCheck', icon: 'spell', tip: 'tip_spell', toggle: 'spellCheck' },
    { id: 'toggle:termVisible', icon: 'terminal', tip: 'tip_terminal', toggle: 'termVisible' },
  ],
];

export function Toolbar({ onAction, onSetting, settings, state }) {
  useLanguage();
  const size = Number(settings.fontSize) || 14;
  const setSize = (n) => onSetting({ fontSize: Math.max(8, Math.min(40, Math.round(n) || 14)) });
  return (
    <div className="icon-toolbar">
      {GROUPS.map((g, gi) => (
        <React.Fragment key={gi}>
          {gi > 0 && <span className="tb-sep" />}
          {g.map((b) => (
            <button key={b.id} className={`tool-btn ${b.toggle && settings[b.toggle] ? 'on' : ''}`} title={t(b.tip)} aria-label={t(b.tip)}
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
        <FontPicker value={settings.fontFamily} onChange={(f) => onSetting({ fontFamily: f })} width={190} />
      </span>
      <span className="tb-size" title={t('tb_font_size')}>
        <button className="tool-btn" title={t('tb_font_smaller')} onMouseDown={(e) => e.preventDefault()} onClick={() => setSize(size - 1)}><Icon name="minus" size={14} /></button>
        <input type="number" min={8} max={40} value={size} onChange={(e) => setSize(Number(e.target.value))} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur(); }} />
        <button className="tool-btn" title={t('tb_font_larger')} onMouseDown={(e) => e.preventDefault()} onClick={() => setSize(size + 1)}><Icon name="plus" size={14} /></button>
      </span>
    </div>
  );
}

export default Toolbar;
