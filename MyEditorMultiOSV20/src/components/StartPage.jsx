// Start page: a moving picture behind a column of ways to begin, a grid of
// tasks, recent files, one daily tip, and the background controls (scene,
// transparency, speeds). The picture is the same WebGL set as the photo
// manager's start page (src/lib/startbg.js).
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { StartBackground } from '../lib/startbg';
import { CHANNEL_MAX, START_SCENE_IDS, START_SPEED_CHANNELS, startSceneId } from '../lib/startscenes';
import { Icon } from './Icons';

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

function screenOf(settings) {
  return settings.startScreen && typeof settings.startScreen === 'object' ? settings.startScreen : {};
}

function percent(value, fallback, max) {
  if (value == null || value === '') return fallback;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(max, n));
}

function SpeedRow({ id, label, value, max, step, onChange }) {
  const track = useRef(null);
  const setFrom = (clientX) => {
    const rect = track.current.getBoundingClientRect();
    const ratio = rect.width ? (clientX - rect.left) / rect.width : 0;
    const raw = Math.max(0, Math.min(1, ratio)) * max;
    onChange(Math.max(0, Math.min(max, Math.round(raw / step) * step)));
  };
  const ratio = `${(value / max) * 100}%`;
  return (
    <div className="start-speed" data-speed={id}>
      <span className="start-speed-label">{label}</span>
      <div className="start-speed-control">
        <button type="button" className="start-speed-step" aria-label={`${label} ${t('start_speed_down')}`} title={t('start_speed_down')} disabled={value <= 0} onClick={() => onChange(Math.max(0, value - step))}>−</button>
        <div className="start-speed-track" ref={track} role="slider" tabIndex={0} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setFrom(e.clientX); }}
          onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) setFrom(e.clientX); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); onChange(Math.max(0, value - step)); }
            else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); onChange(Math.min(max, value + step)); }
            else if (e.key === 'Home') { e.preventDefault(); onChange(0); }
            else if (e.key === 'End') { e.preventDefault(); onChange(max); }
          }}>
          <span className="start-speed-fill" style={{ width: ratio }} />
          <span className="start-speed-thumb" style={{ left: ratio }} />
          <span className="start-speed-value">{value}%</span>
        </div>
        <button type="button" className="start-speed-step" aria-label={`${label} ${t('start_speed_up')}`} title={t('start_speed_up')} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>+</button>
      </div>
    </div>
  );
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

export function StartPage({ settings, recent, onAction, onScreen }) {
  useLanguage();
  const host = useRef(null);
  const bg = useRef(null);
  const screenRef = useRef(screenOf(settings));
  screenRef.current = screenOf(settings);
  const screen = screenRef.current;
  const scene = startSceneId(screen.scene);

  useEffect(() => {
    const picture = new StartBackground(host.current, () => screenRef.current);
    bg.current = picture;
    picture.show();
    return () => { picture.hide(); bg.current = null; };
  }, []);
  useEffect(() => { bg.current?.refresh(); }, [settings.startScreen]);

  const speeds = [
    ['transparency', t('start_transparency'), percent(screen.transparency, 0, 100), 100, 5],
    ['motion', t('start_motion'), percent(screen.motion, 20, 100), 100, 5],
    ...START_SPEED_CHANNELS.map((ch) => [ch.key, t(ch.key === 'cameraSpeed' ? 'start_speed_camera' : ch.key === 'objectSpeed' ? 'start_speed_objects' : 'start_speed_sky'), percent(screen[ch.key], 100, CHANNEL_MAX), CHANNEL_MAX, 10]),
  ];

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
              <div className="start-scenes">
                {START_SCENE_IDS.map((id) => (
                  <button key={id} type="button" className={`start-scene${scene === id ? ' on' : ''}`} data-scene={id} aria-pressed={scene === id ? 'true' : 'false'} onClick={() => onScreen({ scene: id })}>{t(`start_scene_${id}`)}</button>
                ))}
              </div>
              <div className="start-speeds">
                <div className="start-speed-list">
                  {speeds.map(([key, label, value, max, step]) => (
                    <SpeedRow key={key} id={key} label={label} value={value} max={max} step={step} onChange={(n) => onScreen({ [key]: n })} />
                  ))}
                </div>
                <button type="button" className="start-speed-reset" onClick={() => onScreen({ motion: 20, cameraSpeed: 100, objectSpeed: 100, skySpeed: 100 })}>{t('start_speed_reset')}</button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StartPage;
