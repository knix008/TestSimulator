// Start page opened from the Home button on the menu bar.
// Translucent cards sit over a moving WebGL world. Twenty scenes share one
// speed, a transparency slider and the choice to open this page at launch.
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { StartBackground } from '../lib/startbg';
import { START_MOTION_DEFAULT, START_SCENE_DEFAULT, START_SCENES, motionScale, startSceneId } from '../lib/startscenes';
import { Icon } from './Icons';

export { START_MOTION_DEFAULT, START_SCENES };

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

function SpeedRow({ label, value, onChange, suffix = '' }) {
  const step = (by) => onChange(Math.min(100, Math.max(0, value + by)));
  const shown = `${value}${suffix}`;
  return (
    <div className="start-speed">
      <span>{label}</span>
      <button type="button" className="num-btn" aria-label={`${label} ${t('start_less')}`} title={t('start_less')} disabled={value <= 0} onClick={() => step(-5)}>−</button>
      <input type="range" min="0" max="100" step="5" value={value} aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-valuetext={shown} onChange={(e) => onChange(Number(e.target.value))} />
      <button type="button" className="num-btn" aria-label={`${label} ${t('start_more')}`} title={t('start_more')} disabled={value >= 100} onClick={() => step(5)}>+</button>
      <span className="start-speed-value">{shown}</span>
    </div>
  );
}

// Up to ten recent folders, each with its own remove button, plus clear-all.
export function RecentFolders({ recent = [], onOpen, onRemove, onClear }) {
  useLanguage();
  const list = recent.slice(0, 10);
  return (
    <div className="recent-folders">
      <div className="recent-head">
        <Icon name="history" size={16} />
        <span>{t('start_recent')}</span>
        <button type="button" className="recent-clear" disabled={!list.length} onClick={onClear}>{t('recent_dirs_clear')}</button>
      </div>
      {list.length ? (
        <ul className="recent-list">
          {list.map((path) => (
            <li key={path} className="recent-row">
              {onOpen
                ? <button type="button" className="recent-item" title={path} onClick={() => onOpen(path)}><Icon name="folder" size={15} /><span className="recent-name">{folderLabel(path)}</span></button>
                : <span className="recent-item" title={path}><Icon name="folder" size={15} /><span className="recent-name">{folderLabel(path)}</span></span>}
              <button type="button" className="recent-x" title={t('recent_remove')} aria-label={t('recent_remove')} onClick={() => onRemove(path)}><Icon name="close" size={12} /></button>
            </li>
          ))}
        </ul>
      ) : <p className="start-muted">{t('start_no_recent')}</p>}
    </div>
  );
}

function clamp(n, min, max, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(max, Math.max(min, x));
}

function folderLabel(path) {
  const parts = String(path || '').split(/[\\/]/).filter(Boolean);
  return parts.at(-1) || path;
}

function Tip() {
  useLanguage();
  const [open, setOpen] = useState(false);
  const day = Math.floor(Date.now() / 86400000) % TIP_COUNT;
  return (
    <div className="start-tip">
      <button type="button" className="start-tip-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name="star" size={16} />
        <span className="start-tip-text"><b>{t('start_tip')}</b> {t(`start_tip_${day}`)}</span>
        <span className="start-tip-more-label">{open ? t('start_tip_less') : t('start_tip_more')}</span>
      </button>
      {open && <p className="start-tip-more">{t(`start_tip_${day}_more`)}</p>}
    </div>
  );
}

// Scene buttons, transparency and overall speed. Shared by the start page and Settings.
function StartCanvas({ scene, transparency, motion }) {
  const host = useRef(null);
  const picture = useRef(null);
  const read = useRef({ scene, transparency, motion });
  read.current = { scene, transparency, motion };
  useEffect(() => {
    const bg = new StartBackground(host.current, () => read.current);
    picture.current = bg;
    bg.show();
    return () => bg.dispose();
  }, []);
  useEffect(() => { picture.current?.sync(); }, [scene, transparency, motion]);
  const fade = clamp(transparency, 0, 100, 0);
  const still = motionScale(motion) <= 0 || fade >= 100;
  return (
    <div
      ref={host}
      className={`start-bg${still ? ' is-still' : ''}`}
      data-scene={startSceneId(scene)}
      style={{ '--start-opacity': String(1 - fade / 100) }}
    />
  );
}

export function StartBackgroundControls({ scene, transparency, motion, showAtLaunch = true, launch = true, onChange }) {
  useLanguage();
  const current = startSceneId(scene);
  const fade = clamp(transparency, 0, 100, 0);
  const pace = clamp(motion, 0, 100, START_MOTION_DEFAULT);
  return (
    <div className="start-controls">
      {launch && (
        <label className="check start-launch">
          <input type="checkbox" checked={showAtLaunch !== false} onChange={(e) => onChange({ startAtLaunch: e.target.checked })} />
          <span>{t('start_at_launch')}</span>
        </label>
      )}
      <div className="start-scenes" role="group" aria-label={t('start_background')}>
        {START_SCENES.map((id) => (
          <button key={id} type="button" className={`start-scene ${current === id ? 'on' : ''}`} aria-pressed={current === id} onClick={() => onChange({ startScene: id })}>
            <span className="start-swatch" data-scene={id} />
            <span>{t(`start_scene_${id}`)}</span>
          </button>
        ))}
      </div>
      <div className="start-speeds">
        <SpeedRow label={t('start_transparency')} value={fade} suffix="%" onChange={(n) => onChange({ startTransparency: n })} />
        <SpeedRow label={t('start_motion')} value={pace} onChange={(n) => onChange({ startMotion: n })} />
        <button type="button" className="start-speed-reset" onClick={() => onChange({ startTransparency: 0, startMotion: START_MOTION_DEFAULT })}>{t('start_speed_reset')}</button>
      </div>
    </div>
  );
}

export function StartPage({ recent = [], scene = START_SCENE_DEFAULT, transparency = 0, motion = START_MOTION_DEFAULT, showAtLaunch = true, onBackground, onRun, onRecent, onRecentRemove, onRecentClear }) {
  useLanguage();
  const current = startSceneId(scene);
  const fade = clamp(transparency, 0, 100, 0);
  return (
    <div className="start-page">
      <StartCanvas scene={current} transparency={fade} motion={motion} />
      <div className="start-scroll">
        <div className="start">
          <header className="start-head">
            <span className="start-logo"><img src="./icon.svg" alt="" width={32} height={32} draggable={false} /></span>
            <div>
              <h1>{t('appName')}</h1>
              <p>{t('start_lead')}</p>
            </div>
            <label className="check start-launch">
              <input type="checkbox" checked={showAtLaunch !== false} onChange={(e) => onBackground({ startAtLaunch: e.target.checked })} />
              <span>{t('start_at_launch')}</span>
            </label>
          </header>
          <div className="start-board">
            <section className="start-group" data-group="begin">
              <h2><Icon name="play" size={16} />{t('start_begin')}</h2>
              <div className="start-actions">
                {BEGIN.map(([id, icon, title, text, primary]) => (
                  <button key={id} type="button" className="action-card" data-primary={primary ? '' : undefined} title={t(title)} onClick={() => onRun(id)}>
                    <span className="action-icon"><Icon name={icon} size={16} /></span>
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
                    <span className="task-icon"><Icon name={icon} size={16} /></span>
                    <span className="task-text"><b>{t(title)}</b><small>{t(text)}</small></span>
                  </button>
                ))}
              </div>
            </section>
            <section className="start-group" data-group="recent">
              <RecentFolders recent={recent} onOpen={onRecent} onRemove={onRecentRemove} onClear={onRecentClear} />
              <Tip />
            </section>
            <section className="start-group" data-group="scenes">
              <h2><Icon name="image" size={16} />{t('start_background')}</h2>
              <StartBackgroundControls scene={current} transparency={fade} motion={motion} launch={false} onChange={onBackground} />
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
