// Settings dialog (Ctrl+,) — four tabs: general, editor, files, terminal. Changes
// apply immediately (the editor reconfigures live) and are persisted.
import React, { useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { THEMES } from '../themes';
import { FontPicker } from '../components/FontPicker';
import { Dialog } from './Dialogs';
import { isElectron, nativeDialog } from '../lib/backend';

function Check({ id, label, settings, onChange }) {
  return (
    <label className="check settings-check">
      <input type="checkbox" checked={!!settings[id]} onChange={(e) => onChange({ [id]: e.target.checked })} />
      <span>{label}</span>
    </label>
  );
}

export function SettingsDialog({ settings, encodings, shells = [], onChange, onClose }) {
  useLanguage();
  const [tab, setTab] = useState('general');
  const lang = getLanguage();
  const tabs = [['general', t('set_general')], ['editor', t('set_editor')], ['files', t('set_files')], ['terminal', t('set_terminal')]];
  // The folder picker is a native dialog on the desktop; the web version's fallback dialog would replace this one, so there the path is typed.
  const browseTermCwd = async () => { try { const p = await nativeDialog('openFolder', { defaultPath: settings.termCwd || undefined }); if (p) onChange({ termCwd: p }); } catch { /* cancelled */ } };
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
          <FontPicker value={settings.fontFamily} onChange={(f) => onChange({ fontFamily: f })} />
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
          <label />
          <Check id="autoIndent" label={t('set_auto_indent')} settings={settings} onChange={onChange} />
          <label>{t('set_indent_with')}</label>
          <span className="row">
            <label className="check"><input type="radio" name="indent-with" checked={!!settings.insertSpaces} onChange={() => onChange({ insertSpaces: true })} /><span>{t('set_indent_spaces')}</span></label>
            <label className="check"><input type="radio" name="indent-with" checked={!settings.insertSpaces} onChange={() => onChange({ insertSpaces: false })} /><span>{t('set_indent_tabs')}</span></label>
          </span>
          <label>{t('set_tab_size')}</label>
          <span className="row">
            <input type="number" min={1} max={16} value={settings.tabSize} onChange={(e) => onChange({ tabSize: Math.max(1, Math.min(16, Number(e.target.value) || 4)) })} style={{ width: 80 }} />
            <span className="muted small">{t('set_tab_size_hint')}</span>
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
          <label />
          <Check id="spellCheck" label={t('set_spell')} settings={settings} onChange={onChange} />
          <label />
          <Check id="spellCodeAll" label={t('set_spell_code_all')} settings={settings} onChange={onChange} />
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
      {tab === 'terminal' && (
        <div className="form-grid settings-grid">
          <label>{t('set_term_shell')}</label>
          <select value={settings.termShell || ''} onChange={(e) => onChange({ termShell: e.target.value })}>
            <option value="">{shells.length ? t('set_term_shell_default', { name: shells[0].label }) : t('set_term_shell_default', { name: '' })}</option>
            {shells.map((sh) => <option key={sh.id} value={sh.id}>{sh.label}</option>)}
          </select>
          <label>{t('set_term_cwd')}</label>
          <span className="row">
            <input type="text" className="mono" value={settings.termCwd || ''} placeholder={t('set_term_cwd_default')} spellCheck={false} onChange={(e) => onChange({ termCwd: e.target.value })} style={{ flex: 1, minWidth: 0 }} />
            {isElectron && <button className="btn" onClick={browseTermCwd}>{t('set_browse')}</button>}
          </span>
          <label />
          <span className="muted small">{t('set_term_cwd_hint')}</span>
        </div>
      )}
    </Dialog>
  );
}

export default SettingsDialog;
