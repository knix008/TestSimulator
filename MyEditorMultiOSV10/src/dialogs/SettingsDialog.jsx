// Settings dialog (Ctrl+,) — three tabs: general, editor, files. Changes
// apply immediately (the editor reconfigures live) and are persisted.
import React, { useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { THEMES } from '../themes';
import { FONT_SUGGESTIONS } from '../lib/settings';
import { Dialog } from './Dialogs';

function Check({ id, label, settings, onChange }) {
  return (
    <label className="check settings-check">
      <input type="checkbox" checked={!!settings[id]} onChange={(e) => onChange({ [id]: e.target.checked })} />
      <span>{label}</span>
    </label>
  );
}

export function SettingsDialog({ settings, encodings, onChange, onClose }) {
  useLanguage();
  const [tab, setTab] = useState('general');
  const lang = getLanguage();
  const tabs = [['general', t('set_general')], ['editor', t('set_editor')], ['files', t('set_files')]];
  return (
    <Dialog title={t('settings_title')} icon="settings" kind="info" width={560} onClose={onClose} onEnter={onClose}
      footer={<button className="btn primary" onClick={onClose}>{t('ok')}</button>}>
      <div className="settings-tabs">
        {tabs.map(([id, label]) => <button key={id} className={`settings-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {tab === 'general' && (
        <div className="form-grid settings-grid">
          <label>{t('set_language')}</label>
          <select value={settings.language} onChange={(e) => onChange({ language: e.target.value })}>
            <option value="ko">한국어</option>
            <option value="en">English</option>
          </select>
          <label>{t('set_theme')}</label>
          <select value={settings.theme} onChange={(e) => onChange({ theme: e.target.value })}>
            {THEMES.map((th) => <option key={th.id} value={th.id}>{lang === 'ko' ? th.label : th.labelEn}</option>)}
          </select>
          <label>{t('set_font')}</label>
          <span>
            <input list="font-list" value={settings.fontFamily} placeholder={t('set_font_ph')} onChange={(e) => onChange({ fontFamily: e.target.value })} spellCheck={false} />
            <datalist id="font-list">{FONT_SUGGESTIONS.map((f) => <option key={f} value={f} />)}</datalist>
          </span>
          <label>{t('set_font_size')}</label>
          <span className="row">
            <input type="number" min={8} max={40} value={settings.fontSize} onChange={(e) => onChange({ fontSize: Math.max(8, Math.min(40, Number(e.target.value) || 14)) })} style={{ width: 80 }} />
            <span className="muted small">px</span>
          </span>
          <label />
          <Check id="restoreSession" label={t('set_restore')} settings={settings} onChange={onChange} />
          <label />
          <Check id="confirmClose" label={t('set_confirm_close')} settings={settings} onChange={onChange} />
        </div>
      )}
      {tab === 'editor' && (
        <div className="form-grid settings-grid">
          <label>{t('set_tab_size')}</label>
          <span className="row">
            <input type="number" min={1} max={16} value={settings.tabSize} onChange={(e) => onChange({ tabSize: Math.max(1, Math.min(16, Number(e.target.value) || 4)) })} style={{ width: 80 }} />
            <Check id="insertSpaces" label={t('set_insert_spaces')} settings={settings} onChange={onChange} />
          </span>
          <label />
          <Check id="wordWrap" label={t('set_word_wrap')} settings={settings} onChange={onChange} />
          <label />
          <Check id="lineNumbers" label={t('set_line_numbers')} settings={settings} onChange={onChange} />
          <label />
          <Check id="showWhitespace" label={t('set_show_ws')} settings={settings} onChange={onChange} />
          <label />
          <Check id="highlightActiveLine" label={t('set_active_line')} settings={settings} onChange={onChange} />
          <label />
          <Check id="autoCloseBrackets" label={t('set_auto_close')} settings={settings} onChange={onChange} />
          <label />
          <Check id="bracketMatching" label={t('set_bracket_match')} settings={settings} onChange={onChange} />
          <label />
          <Check id="foldGutter" label={t('set_fold')} settings={settings} onChange={onChange} />
        </div>
      )}
      {tab === 'files' && (
        <div className="form-grid settings-grid">
          <label>{t('set_default_enc')}</label>
          <select value={settings.defaultEncoding} onChange={(e) => onChange({ defaultEncoding: e.target.value })}>
            {encodings.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
          <label>{t('set_default_eol')}</label>
          <select value={settings.defaultEol} onChange={(e) => onChange({ defaultEol: e.target.value })}>
            <option value="crlf">{t('eol_crlf')}</option>
            <option value="lf">{t('eol_lf')}</option>
            <option value="cr">{t('eol_cr')}</option>
          </select>
          <label />
          <Check id="trimTrailingOnSave" label={t('set_trim')} settings={settings} onChange={onChange} />
          <label />
          <Check id="finalNewlineOnSave" label={t('set_final_nl')} settings={settings} onChange={onChange} />
          <label />
          <Check id="reloadChangedFiles" label={t('set_reload')} settings={settings} onChange={onChange} />
        </div>
      )}
    </Dialog>
  );
}

export default SettingsDialog;
