// Start page opened from the Home button on the menu bar.
// A moving WebGL world behind a fixed title card (name, one line, guide / about / tutorial) and a
// board of translucent cards that can be moved (the handle) and resized (the corner; a double
// click fits it again): ways to begin, recent folders, tasks and the background. lib/startboard.js places the cards and the
// arrangement is kept in the session (startLayout).
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { StartBackground } from '../lib/startbg';
import { startBoard } from '../lib/startboard';
import { START_MOTION_DEFAULT, START_SCENE_DEFAULT, START_SCENES, motionScale, startSceneId } from '../lib/startscenes';
import { Icon } from './Icons';

export { START_MOTION_DEFAULT, START_SCENES };
export const START_CARD_OPACITY_DEFAULT = 80;

const TIP_COUNT = 5;

const BEGIN = [
  ['tutorial', 'help', 'start_tutorial', 'start_tutorial_text'],
  ['manual', 'book', 'start_manual', 'start_manual_text'],
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

const GRIP = (
  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="20" cy="20" r="2" /><circle cx="14" cy="20" r="2" /><circle cx="20" cy="14" r="2" /><circle cx="8" cy="20" r="2" /><circle cx="14" cy="14" r="2" /><circle cx="20" cy="8" r="2" /></svg>
);

function SpeedRow({ label, value, onChange, suffix = '', min = 0, max = 100 }) {
  const step = (by) => onChange(Math.min(max, Math.max(min, value + by)));
  const shown = `${value}${suffix}`;
  return (
    <div className="start-speed">
      <span>{label}</span>
      <button type="button" className="num-btn" aria-label={`${label} ${t('start_less')}`} title={t('start_less')} disabled={value <= min} onClick={() => step(-5)}>−</button>
      <input type="range" min={min} max={max} step="5" value={value} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={shown} onChange={(e) => onChange(Number(e.target.value))} />
      <button type="button" className="num-btn" aria-label={`${label} ${t('start_more')}`} title={t('start_more')} disabled={value >= max} onClick={() => step(5)}>+</button>
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

// Scene buttons, transparency, overall speed and (on the start page) card opacity. Shared by the start page and Settings.
export function StartBackgroundControls({ scene, transparency, motion, cardOpacity, showAtLaunch = true, tutorialPrompt = true, launch = true, onChange }) {
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
      {launch && (
        <label className="check start-launch start-tut-prompt">
          <input type="checkbox" checked={tutorialPrompt !== false} onChange={(e) => onChange({ tutorialPrompt: e.target.checked })} />
          <span>{t('start_tutorial_prompt')}</span>
        </label>
      )}
      <div className="start-scenes" role="group" aria-label={t('start_background')}>
        {START_SCENES.map((id) => (
          <button key={id} type="button" className={`start-scene ${current === id ? 'on' : ''}`} aria-pressed={current === id} title={t(`start_scene_${id}`)} onClick={() => onChange({ startScene: id })}>
            <span className="start-swatch" data-scene={id} />
            <span>{t(`start_scene_${id}`)}</span>
          </button>
        ))}
      </div>
      <div className="start-speeds">
        <SpeedRow label={t('start_transparency')} value={fade} suffix="%" onChange={(n) => onChange({ startTransparency: n })} />
        <SpeedRow label={t('start_motion')} value={pace} onChange={(n) => onChange({ startMotion: n })} />
        {cardOpacity !== undefined && (
          <SpeedRow label={t('start_card_opacity')} value={clamp(cardOpacity, 20, 100, START_CARD_OPACITY_DEFAULT)} suffix="%" min={20} max={100} onChange={(n) => onChange({ startCardOpacity: n })} />
        )}
        <button type="button" className="start-speed-reset" onClick={() => onChange({ startTransparency: 0, startMotion: START_MOTION_DEFAULT, ...(cardOpacity !== undefined ? { startCardOpacity: START_CARD_OPACITY_DEFAULT } : {}) })}>{t('start_speed_reset')}</button>
      </div>
    </div>
  );
}

// One card: its handle and title (a bare card has a floating handle), its body and its resize corner.
function Card({ id, icon, title, extra, bare = false, className = '', group, children }) {
  const handle = (
    <button type="button" className="card-handle" data-card-handle={id} title={t('start_move_card')} aria-label={t('start_move_card')}>
      <Icon name="dragHandle" size={15} />
    </button>
  );
  return (
    <section className={`start-card start-card-${id}${bare ? ' bare' : ''}${className ? ` ${className}` : ''}`} data-card={id} data-group={group} aria-label={title || undefined}>
      {bare
        ? <span className="card-handle-float">{handle}</span>
        : <h2>{handle}<Icon name={icon} size={16} /><span className="start-card-title">{title}</span><span className="grow" />{extra}</h2>}
      <div className="card-body">{children}</div>
      <span className="card-resize" data-card-resize={id} title={t('start_resize_card')}>{GRIP}</span>
    </section>
  );
}

export function StartPage({
  recent = [], scene = START_SCENE_DEFAULT, transparency = 0, motion = START_MOTION_DEFAULT, cardOpacity = START_CARD_OPACITY_DEFAULT,
  showAtLaunch = true, version = '', layout, onLayout, onBackground, onRun, onRecent, onRecentRemove, onRecentClear,
}) {
  useLanguage();
  const current = startSceneId(scene);
  const fade = clamp(transparency, 0, 100, 0);
  const alpha = clamp(cardOpacity, 20, 100, START_CARD_OPACITY_DEFAULT);
  const boardRef = useRef(null);
  const board = useRef(null);
  const saveLayout = useRef(onLayout);
  saveLayout.current = onLayout;
  useEffect(() => {
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    board.current = startBoard(boardRef.current, { saved: layout, reduced, onSave: (next) => saveLayout.current?.(next) });
    return () => { board.current?.destroy(); board.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const name = t('appName');

  return (
    <div className="start-page">
      <StartCanvas scene={current} transparency={fade} motion={motion} />
      <div className="start-scroll">
        <div className="start" style={{ '--start-card-alpha': `${alpha}%` }}>
          <div className="start-tools">
            <label className="start-btn check start-launch" title={t('start_at_launch')}>
              <input type="checkbox" checked={showAtLaunch !== false} onChange={(e) => onBackground({ startAtLaunch: e.target.checked })} />
              <span>{t('start_at_launch')}</span>
            </label>
            <button type="button" className="start-btn" title={t('settings')} onClick={() => onRun('settings')}><Icon name="settings" size={15} /><span>{t('settings')}</span></button>
            <button type="button" className="start-btn" title={t('start_arrange_tip')} onClick={() => board.current?.arrange()}><Icon name="grid" size={15} /><span>{t('start_arrange')}</span></button>
          </div>
          {/* The title card is fixed: always on top, full width, no move handle and no resize corner. */}
          <section className="start-card start-card-hero start-head bare fixed-card" aria-label={name}>
            <div className="card-body">
              <img src="./icon.svg" alt="" className="start-logo" width={64} height={64} draggable={false} />
              <div className="start-hero-text">
                <h1>{name}</h1>
                <p>{t('start_lead')}</p>
              </div>
              <div className="start-hero-actions">
                <button type="button" className="start-big" title={t('start_manual_text')} onClick={() => onRun('manual')}><Icon name="book" size={16} /><span>{t('start_manual')}</span></button>
                <button type="button" className="start-big" title={t('start_about_text')} onClick={() => onRun('about')}><Icon name="info" size={16} /><span>{t('about')}</span></button>
                <button type="button" className="start-big primary" title={t('start_tutorial_text')} onClick={() => onRun('tutorial')}><Icon name="play" size={16} /><span>{t('start_tutorial')}</span></button>
              </div>
            </div>
          </section>
          <div className="start-board" ref={boardRef}>
            <Card id="begin" icon="play" title={t('start_begin')} group="begin">
              <div className="start-actions">
                {BEGIN.map(([id, icon, title, text, primary]) => (
                  <button key={id} type="button" className="action-card" data-primary={primary ? '' : undefined} title={t(text)} onClick={() => onRun(id)}>
                    <span className="action-icon"><Icon name={icon} size={18} /></span>
                    <span className="action-text"><b>{t(title)}</b><small>{t(text)}</small></span>
                  </button>
                ))}
              </div>
            </Card>
            <Card id="recent" icon="history" title={t('start_recent_card')} group="recent">
              <RecentFolders recent={recent} onOpen={onRecent} onRemove={onRecentRemove} onClear={onRecentClear} />
              <Tip />
            </Card>
            <Card id="tasks" icon="grid" title={t('start_tasks')} group="tasks" extra={<span className="start-card-note">{TASKS.length}</span>}>
              <div className="task-grid">
                {TASKS.map(([id, icon, title, text]) => (
                  <button key={id} type="button" className="task-card" title={t(text)} onClick={() => onRun(id)}>
                    <span className="task-icon"><Icon name={icon} size={18} /></span>
                    <span className="task-text"><b>{t(title)}</b><small>{t(text)}</small></span>
                  </button>
                ))}
              </div>
            </Card>
            <Card id="scenes" icon="image" title={t('start_background')} group="scenes">
              <StartBackgroundControls scene={current} transparency={fade} motion={motion} cardOpacity={alpha} launch={false} onChange={onBackground} />
            </Card>
          </div>
          <footer className="start-foot">
            <Icon name="info" size={15} /><span className="grow">{name}{version ? ` · v${version}` : ''}</span>
            <span className="start-muted">© SHKWON(knix008@naver.com)</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
