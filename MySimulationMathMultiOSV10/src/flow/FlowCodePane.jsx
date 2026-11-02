// 코드 보기: the graphical script's generated M code in a read-only, syntax-coloured editor beside
// the canvas. It follows every block edit; the header copies it or opens it as a script.
import React, { useEffect, useRef } from 'react';
import { EditorState, StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { createMEditor } from '../lib/editor';
import { t } from '../lib/i18n';
import { writeText } from '../lib/clipboard';
import { Icon } from '../components/Chrome';

const CANVAS_MIN = 200;

/** The widest the code pane may get: the canvas keeps CANVAS_MIN px beside the shown side panes. */
export function flowCodeMax(main, panes) {
  const total = main ? main.clientWidth : 1200;
  const side = (panes.palette ? 210 : 0) + (panes.side ? 300 : 0);
  return Math.max(240, Math.round(total - side - CANVAS_MIN));
}

export function FlowCodePane({ width, code, problems, onToScript, onClose }) {
  const host = useRef(null);
  const ed = useRef(null);
  useEffect(() => {
    ed.current = createMEditor({ parent: host.current, doc: code, settings: { fontFamily: 'Consolas', fontSize: 12.5, tabSize: 4, wrap: false } });
    ed.current.view.dispatch({ effects: StateEffect.appendConfig.of([EditorState.readOnly.of(true), EditorView.editable.of(false)]) });
    host.current.__msmEditor = ed.current; // GUI tests read the code through this
    return () => { ed.current.destroy(); ed.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (ed.current && ed.current.getText() !== code) ed.current.setText(code); }, [code]);
  const has = !!code;
  return (
    <div className="fl-codepane" style={{ width }} data-codepane="">
      <div className="fp-section small">
        <Icon name="code" size={12} />{t('fl_code')}<span className="spacer" />
        {problems > 0 ? <span className="fl-badge bad">{t('fl_problems', { n: problems })}</span> : has && <span className="fl-badge ok"><Icon name="checkCircle" size={11} /></span>}
        <button type="button" className="icon-btn" title={t('copy')} aria-label={t('copy')} disabled={!has} onClick={() => writeText(code)}><Icon name="copy" size={12} /></button>
        <button type="button" className="icon-btn" data-act="toScript" title={t('fl_to_script')} aria-label={t('fl_to_script')} disabled={!has} onClick={onToScript}><Icon name="script" size={12} /></button>
        <button type="button" className="icon-btn" title={t('fl_code_close')} aria-label={t('fl_code_close')} onClick={onClose}><Icon name="close" size={12} /></button>
      </div>
      {!has && <div className="fl-empty small muted">{t('fl_no_code')}</div>}
      <div ref={host} className="fl-codehost" style={has ? undefined : { display: 'none' }} />
    </div>
  );
}
