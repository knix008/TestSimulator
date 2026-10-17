// Start page opened from the Home button on the menu bar.
// The board (ways to begin, tasks, recent folders, a tip, background choices)
// follows the start page in MyPhotoManager: translucent cards over a landscape.
import React, { useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from './Icons';

const SCENES = ['day', 'dusk', 'night', 'sea', 'forest'];
const TIP_COUNT = 5;

const BEGIN = [
  ['tutorial', 'help', 'start_tutorial', 'start_tutorial_text'],
  ['files', 'grid', 'start_files', 'start_files_text', true],
  ['home', 'home', 'start_home_folder', 'start_home_folder_text'],
  ['newFolder', 'folderNew', 'new_folder', 'start_new_folder_text'],
  ['search', 'search', 'search', 'start_search_text'],
  ['terminal', 'terminal', 'terminal', 'start_terminal_text'],
  ['settings', 'settings', 'settings', 'start_settings_text'],
  ['about', 'info', 'about', 'start_about_text'],
];

const TASKS = [
  ['copyOther', 'copy', 'tb_copy', 'start_desc_copy'],
  ['moveOther', 'move', 'tb_move', 'start_desc_move'],
  ['compress', 'archive', 'compress', 'start_desc_compress'],
  ['extract', 'extract', 'extract', 'start_desc_extract'],
  ['multiRename', 'multiRename', 'multi_rename', 'start_desc_rename'],
  ['compareDirs', 'compare', 'compare_dirs', 'start_desc_compare'],
  ['view', 'view', 'view_file', 'start_desc_view'],
  ['print', 'print', 'print', 'start_desc_print'],
  ['hotlist', 'star', 'hotlist', 'start_desc_hotlist'],
  ['newTab', 'tabNew', 'tab_new', 'start_desc_tab'],
];

function folderLabel(path) {
  const parts = String(path || '').split(/[\\/]/).filter(Boolean);
  return parts.at(-1) || path;
}

function Tip() {
  const index = Math.floor(Date.now() / 86400000) % TIP_COUNT;
  const [open, setOpen] = useState(false);
  return (
    <div className="start-tip">
      <button type="button" className="start-tip-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name="star" size={16} />
        <span className="start-tip-text"><b>{t('start_tip')} </b>{t(`start_tip_${index}`)}</span>
        <span className="start-tip-more-label">{t(open ? 'start_tip_less' : 'start_tip_more')}</span>
      </button>
      {open && <p className="start-tip-more">{t(`start_tip_${index}_more`)}</p>}
    </div>
  );
}

export function StartPage({ recent = [], scene = 'day', onScene, onRun, onRecent }) {
  useLanguage();
  const current = SCENES.includes(scene) ? scene : 'day';
  return (
    <div className="start-page">
      <div className="start-bg" data-scene={current} />
      <div className="start-scroll">
        <div className="start">
          <header className="start-head">
            <span className="start-logo"><img src="./icon.svg" alt="" width={32} height={32} draggable={false} /></span>
            <div>
              <h1>{t('appName')}</h1>
              <p>{t('start_lead')}</p>
            </div>
          </header>
          <div className="start-board">
            <section className="start-group" data-group="begin">
              <h2><Icon name="play" size={16} />{t('start_begin')}</h2>
              <div className="start-actions">
                {BEGIN.map(([id, icon, title, text, primary]) => (
                  <button key={id} type="button" className="action-card" data-primary={primary ? '' : undefined} title={t(title)} onClick={() => onRun(id)}>
                    <span className="action-icon"><Icon name={icon} size={18} /></span>
                    <span className="action-text"><b>{t(title)}</b><small>{t(text)}</small></span>
                  </button>
                ))}
              </div>
            </section>
            <section className="start-group" data-group="tasks">
              <h2><Icon name="grid" size={16} />{t('start_tasks')}</h2>
              <div className="task-grid">
                {TASKS.map(([id, icon, title, text]) => (
                  <button key={id} type="button" className="task-card" title={t(title)} onClick={() => onRun(id)}>
                    <span className="task-icon"><Icon name={icon} size={18} /></span>
                    <span className="task-text"><b>{t(title)}</b><small>{t(text)}</small></span>
                  </button>
                ))}
              </div>
            </section>
            <section className="start-group" data-group="recent">
              <h2><Icon name="history" size={16} />{t('start_recent')}</h2>
              {recent.length ? (
                <ul className="recent-list">
                  {recent.slice(0, 8).map((path) => (
                    <li key={path}>
                      <button type="button" className="recent-item" title={path} onClick={() => onRecent(path)}>
                        <Icon name="folder" size={15} />
                        <span className="recent-name">{folderLabel(path)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="start-muted">{t('start_no_recent')}</p>}
              <Tip />
            </section>
            <section className="start-group" data-group="scenes">
              <h2><Icon name="image" size={16} />{t('start_background')}</h2>
              <div className="start-scenes">
                {SCENES.map((id) => (
                  <button key={id} type="button" className={`start-scene ${current === id ? 'on' : ''}`} aria-pressed={current === id} onClick={() => onScene(id)}>
                    {t(`start_scene_${id}`)}
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
