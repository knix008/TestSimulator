// Settings dialog (Ctrl+,) — four tabs: general, editor, files, terminal. Changes
// apply immediately (the editor reconfigures live) and are persisted.
import React, { useEffect, useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { THEMES } from '../themes';
import { FontPicker } from '../components/FontPicker';
import { Icon } from '../components/Icons';
import { Dialog, ConfirmDialog } from './Dialogs';
import { InstallDialog } from './InstallDialog';
import { isElectron, nativeDialog, call } from '../lib/backend';
import { toolLabel } from '../lib/formatters';

function Check({ id, label, settings, onChange }) {
  return (
    <label className="check settings-check">
      <input type="checkbox" checked={!!settings[id]} onChange={(e) => onChange({ [id]: e.target.checked })} />
      <span>{label}</span>
    </label>
  );
}

export function SettingsDialog({ settings, encodings, shells = [], formatDir = '', onChange, onClose, tools: knownTools = null, onTools, embedded = false }) {
  useLanguage();
  const [tab, setTab] = useState('general');
  const lang = getLanguage();
  const tabs = [['general', t('set_general')], ['editor', t('set_editor')], ['files', t('set_files')], ['terminal', t('set_terminal')], ['format', t('set_format')]];
  // The formatters per language and which are installed: the list the app
  // already holds (looked up once at start, for the toolbar) is shown as it
  // is; the backend is only asked when there is none yet, or to look again.
  const [tools, setTools] = useState(knownTools);
  const [rescan, setRescan] = useState(false);   // the next listing looks again instead of using the cached lookups (다시 찾기, after an install)
  useEffect(() => { if (knownTools && !tools && !rescan) setTools(knownTools); }, [knownTools]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [job, setJob] = useState(null);        // { tool, id } while a tool is being (re)installed from here
  const [installMsg, setInstallMsg] = useState(null);
  const [askReinstall, setAskReinstall] = useState(null);   // { lang, tool } — the tool is installed already: the user decides
  // (Re)installs the tool chosen for a language. An installed one is only
  // replaced when the user chooses so (remove + fresh install).
  const installTool = async (lang, decided = null) => {
    const id = (settings.formatters || {})[lang];
    const list = (tools || {})[lang] || [];
    const tool = list.find((x) => x.id === id) || (id === 'auto' || !id ? list.find((x) => x.installable) : null);
    if (!tool) { setInstallMsg(t('inst_pick_first')); return; }
    if (!tool.installable) { setInstallMsg(tool.hint || t('inst_no_recipe', { tool: tool.id })); return; }
    setInstallMsg(null);
    if (tool.available && decided == null) { setAskReinstall({ lang, tool }); return; }
    let st;
    try { st = await call('install.start', { tool: tool.id, reinstall: tool.available && decided === 'reinstall' }); } catch (e) { st = { error: e.message }; }
    if (st.error) { setInstallMsg(st.error); return; }
    if (st.manual) { setInstallMsg(st.manual); return; }
    if (st.missing) { setInstallMsg(t('inst_missing_pm', { pm: st.missing, tool: tool.id })); return; }
    setJob({ tool: tool.id, id: st.id });
  };
  // onTools lets the app refresh its own copy (the toolbar label) after a rescan or install.
  useEffect(() => { if (tab === 'format' && !tools) { const again = rescan; setRescan(false); call('format.tools', { dir: formatDir, refresh: again }).then((r) => { setTools(r); if (onTools) onTools(r); }).catch(() => setTools({})); } }, [tab, tools, formatDir]);   // eslint-disable-line react-hooks/exhaustive-deps
  const setFormatter = (lang, id) => onChange({ formatters: { ...(settings.formatters || {}), [lang]: id } });
  // The folder picker is a native dialog on the desktop; the web version's fallback dialog would replace this one, so there the path is typed.
  const browseTermCwd = async () => { try { const p = await nativeDialog('openFolder', { defaultPath: settings.termCwd || undefined }); if (p) onChange({ termCwd: p }); } catch { /* cancelled */ } };
  return (
    <Dialog modal={false} embedded={embedded} title={t('settings_title')} icon="settings" kind="info" className="settings" width={780} onClose={onClose} onEnter={onClose}
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
          <label />
          <Check id="lint" label={t('set_lint')} settings={settings} onChange={onChange} />
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
      {tab === 'format' && (
        <div className="settings-format">
          <label className="check settings-check"><input type="checkbox" checked={!!settings.formatOnSave} onChange={(e) => onChange({ formatOnSave: e.target.checked })} /><span>{t('set_format_on_save')}</span></label>
          <p className="muted small">{t('set_format_hint')} <button className="btn small" onClick={() => { setRescan(true); setTools(null); }}>{t('fmt_rescan')}</button></p>
          {installMsg && <div className="danger small">{installMsg}</div>}
          <div className="format-grid">
            {!tools && <span className="muted small">…</span>}
            {tools && Object.entries(tools).map(([lang, list]) => (
              <React.Fragment key={lang}>
                <label>{lang}</label>
                <span className="row fmt-row">
                <select value={(settings.formatters || {})[lang] || 'auto'} onChange={(e) => setFormatter(lang, e.target.value)}>
                  <option value="auto">{t('fmt_auto', { tool: list.some((x) => x.available) ? toolLabel(list.find((x) => x.available)) : t('fmt_indent') })}</option>
                  {list.map((x) => <option key={x.id} value={x.id}>{toolLabel(x)}{x.available ? '' : ` — ${x.installable ? t('fmt_not_installed_auto') : t('fmt_not_installed_manual')}`}</option>)}
                  <option value="indent">{t('fmt_indent')}</option>
                  <option value="none">{t('fmt_none_opt')}</option>
                </select>
                {(() => { const id = (settings.formatters || {})[lang]; const x = list.find((y) => y.id === id) || (id === 'auto' || !id ? list.find((y) => y.installable) : null); return x && x.installable ? <button className="icon-btn" title={x.available ? t('inst_reinstall', { tool: x.id }) : t('inst_install', { tool: x.id })} onClick={() => installTool(lang)}><Icon name={x.available ? 'refresh' : 'download'} size={14} /></button> : null; })()}
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
      {askReinstall && (
        <ConfirmDialog title={t('inst_already_title', { tool: askReinstall.tool.id })} message={t('inst_already_msg', { tool: askReinstall.tool.id })} icon="download" kind="info"
          buttons={[{ id: 'reinstall', label: t('inst_already_reinstall'), kind: 'primary' }, { id: 'keep', label: t('inst_already_keep') }, { id: 'cancel', label: t('cancel') }]}
          onResult={(r) => { const a = askReinstall; setAskReinstall(null); if (r === 'reinstall' || r === 'keep') installTool(a.lang, r); }} />
      )}
      {job && <InstallDialog tool={job.tool} jobId={job.id} onResult={() => { setJob(null); setRescan(true); setTools(null); }} />}
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
