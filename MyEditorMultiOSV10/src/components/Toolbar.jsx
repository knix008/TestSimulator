// Icon toolbar under the menu bar: file · edit · find · view shortcuts.
// Hidden with 보기 › 도구 모음.
import React from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from './Icons';

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
];

export function Toolbar({ onAction, settings, state }) {
  useLanguage();
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
    </div>
  );
}

export default Toolbar;
