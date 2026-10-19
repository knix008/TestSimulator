// Start page: a moving picture behind a column of ways to begin, a grid of
// tasks, recent files, one daily tip, and the background controls (scene,
// transparency, speeds). The picture is the same WebGL set as the photo
// manager's start page (src/lib/startbg.js).
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { StartBackground } from '../lib/startbg';
import { Icon } from './Icons';
import { StartScreenControls, screenOf } from './StartScreenControls';

const TIP_COUNT = 7;
const BEGIN = [
  ['tutorial', 'help', 'tut_menu', 'start_tutorial_text', false],
  ['new', 'filePlus', 'new_file', 'start_new_text', true],
  ['open', 'fileOpen', 'open_file', 'start_open_text', false],
  ['openFolder', 'folderOpen', 'open_folder', 'start_folder_text', false],
  ['settings', 'settings', 'settings', 'start_settings_text', false],
  ['shortcuts', 'keyboard', 'shortcuts', 'start_shortcuts_text', false],
];
const TASKS = [
  ['find', 'search', 'find', 'start_desc_find'],
  ['replace', 'replace', 'replace', 'start_desc_replace'],
  ['togglePreview', 'eye', 'md_preview', 'start_desc_preview'],
  ['toggle:mdWysiwyg', 'wysiwyg', 'md_wysiwyg_menu', 'start_desc_wysiwyg'],
  ['html:browser', 'play', 'html_browser', 'start_desc_run'],
  ['toggleStructure', 'listTree', 'md_outline', 'start_desc_structure'],
  ['toggleTerminal', 'terminal', 'terminal', 'start_desc_terminal'],
  ['toggleLog', 'log', 'log_tab', 'start_desc_log'],
  ['formatDoc', 'format', 'format_doc', 'start_desc_format'],
  ['print', 'print', 'print', 'start_desc_print'],
  ['toggleSplit', 'splitCols', 'split_cols', 'start_desc_split'],
  ['nextTheme', 'eye', 'start_task_theme', 'start_desc_theme'],
];

function fileLabel(path) {
  const parts = String(path).split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || path;
}

function TipCard() {
  useLanguage();
  const index = Math.floor(Date.now() / 86400000) % TIP_COUNT;
  const [open, setOpen] = useState(false);
  return (
    <div className="start-tip">
      <button type="button" className="start-tip-toggle" aria-expanded={open ? 'true' : 'false'} onClick={() => setOpen((v) => !v)}>
        <Icon name="star" size={16} />
        <span className="start-tip-text"><b>{t('start_tip')} </b>{t(`start_tip_${index}`)}</span>
        <span className="start-tip-more-label">{t(open ? 'start_tip_less' : 'start_tip_more')}</span>
      </button>
      {open && <p className="start-tip-more">{t(`start_tip_${index}_more`)}</p>}
    </div>
  );
}

export function StartPage({ settings, recent, onAction, onSettings, onScreen }) {
  useLanguage();
  const host = useRef(null);
  const bg = useRef(null);
  const screenRef = useRef(screenOf(settings));
  screenRef.current = screenOf(settings);

  useEffect(() => {
    const picture = new StartBackground(host.current, () => screenRef.current);
    bg.current = picture;
    picture.show();
    return () => { picture.hide(); bg.current = null; };
  }, []);
  useEffect(() => { bg.current?.refresh(); }, [settings.startScreen]);

  return (
    <div className="start-page">
      <div className="start-bg" ref={host} />
      <div className="start-scroll">
        <div className="start">
          <header className="start-head">
            <span className="start-logo"><Icon name="edit" size={32} /></span>
            <div>
              <h1>{t('appName')}</h1>
              <p>{t('start_lead')}</p>
            </div>
          </header>
          <div className="start-board">
            <section className="start-group" data-group="begin">
              <h2><Icon name="play" size={16} /><span>{t('start_begin')}</span></h2>
              <div className="start-actions">
                {BEGIN.map(([id, icon, label, text, primary]) => (
                  <button key={id} type="button" className="action-card" id={`start-${id}`} data-primary={primary ? '' : undefined} title={t(label)} onClick={() => onAction(id)}>
                    <span className="action-icon"><Icon name={icon} size={18} /></span>
                    <span className="action-text"><b>{t(label)}</b><small>{t(text)}</small></span>
                  </button>
                ))}
              </div>
              <label className="check start-always">
                <input type="checkbox" checked={!!settings.showStartOnLaunch} onChange={(e) => onSettings({ showStartOnLaunch: e.target.checked })} />
                <span>{t('set_start_always')}</span>
              </label>
            </section>
            <section className="start-group" data-group="tasks">
              <h2><Icon name="grid" size={16} /><span>{t('start_tasks')}</span></h2>
              <div className="task-grid">
                {TASKS.map(([id, icon, label, text]) => (
                  <button key={id} type="button" className="task-card" data-task={id} title={t(label)} onClick={() => onAction(id)}>
                    <span className="task-icon"><Icon name={icon} size={18} /></span>
                    <span className="task-text"><b>{t(label)}</b><small>{t(text)}</small></span>
                  </button>
                ))}
              </div>
              <button type="button" className="action-card start-help" id="start-help" title={t('help_open')} onClick={() => onAction('openHelp')}>
                <span className="action-icon"><Icon name="help" size={18} /></span>
                <span className="action-text"><b>{t('help_open')}</b><small>{t('start_help_text')}</small></span>
              </button>
            </section>
            <section className="start-group" data-group="recent">
              <h2><Icon name="clock" size={16} /><span>{t('start_recent')}</span></h2>
              {recent.length ? (
                <ul className="recent-list">
                  {recent.slice(0, 8).map((path) => (
                    <li key={path} className="recent-item" title={path} onClick={() => onAction(`recent:${path}`)}>
                      <Icon name="file" size={15} /><span className="recent-name">{fileLabel(path)}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="start-muted">{t('start_no_recent')}</p>}
              <TipCard />
            </section>
            <section className="start-group" data-group="scenes">
              <h2><Icon name="fileImage" size={16} /><span>{t('start_background')}</span></h2>
              <StartScreenControls settings={settings} onScreen={onScreen} />
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StartPage;
