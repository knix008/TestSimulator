// Start page: a moving picture behind a column of ways to begin, a grid of
// templates, recent files, one daily tip, and the background controls
// (scene, transparency, speeds). The picture is the same WebGL set as the
// sibling apps' start pages (src/lib/startbg.js).
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { StartBackground } from '../lib/startbg';
import { Icon } from './Icons';
import { StartScreenControls, screenOf } from './StartScreenControls';
import { TEMPLATES } from '../lib/templates';
import { SAMPLES } from '../lib/samples';

const TIP_COUNT = 8;
const BEGIN = [
  ['tour', 'bookOpen', 'start_tutorial', 'start_tutorial_text', false],
  ['new', 'filePlus', 'new_map', 'start_new_text', true],
  ['template', 'template', 'new_from_template', 'start_template_text', false],
  ['open', 'fileOpen', 'open_file', 'start_open_text', false],
  ['import', 'import', 'import_file', 'start_import_text', false],
  ['samples', 'mapView', 'samples_menu', 'start_samples_text', false],
  ['settings', 'settings', 'settings', 'start_settings_text', false],
];
const START_TEMPLATES = ['brainstorm', 'project', 'meeting', 'swot', 'decision', 'fishbone', 'org', 'roadmap', 'okr'];

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
        <Icon name="idea" size={16} />
        <span className="start-tip-text"><b>{t('start_tip')} </b>{t(`start_tip_${index}`)}</span>
        <span className="start-tip-more-label">{t(open ? 'start_tip_less' : 'start_tip_more')}</span>
      </button>
      {open && <p className="start-tip-more">{t(`start_tip_${index}_more`)}</p>}
    </div>
  );
}

export function StartPage({ settings, recent, onAction, onSettings, onScreen }) {
  useLanguage();
  const lang = getLanguage();
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
            <span className="start-logo"><img src="./icon.svg" alt="" width={40} height={40} /></span>
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
              <h2><Icon name="template" size={16} /><span>{t('start_templates')}</span></h2>
              <div className="task-grid">
                {START_TEMPLATES.map((id) => {
                  const tpl = TEMPLATES.find((x) => x.id === id);
                  return (
                    <button key={id} type="button" className="task-card" data-template={id} title={tpl.label[lang === 'ko' ? 0 : 1]} onClick={() => onAction(`template:${id}`)}>
                      <span className="task-icon"><Icon name={tpl.icon} size={18} /></span>
                      <span className="task-text"><b>{tpl.label[lang === 'ko' ? 0 : 1]}</b><small>{tpl.desc[lang === 'ko' ? 0 : 1]}</small></span>
                    </button>
                  );
                })}
              </div>
              <h2 className="start-sub"><Icon name="mapView" size={16} /><span>{t('start_samples_title')}</span><small className="muted">{t('start_samples_all', { n: SAMPLES.length })}</small></h2>
              <div className="task-grid sample-grid">
                {SAMPLES.map((sm) => (
                  <button key={sm.id} type="button" className="task-card sample-card" data-sample={sm.id} title={sm.desc[lang === 'ko' ? 0 : 1]} onClick={() => onAction(`sample:${sm.id}`)}>
                    <span className="task-icon"><Icon name={sm.icon || 'mapView'} size={18} /></span>
                    <span className="task-text"><b>{sm.label[lang === 'ko' ? 0 : 1]}</b><small>{sm.desc[lang === 'ko' ? 0 : 1]}</small></span>
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
                      <Icon name="mapView" size={15} /><span className="recent-name">{fileLabel(path)}</span>
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
