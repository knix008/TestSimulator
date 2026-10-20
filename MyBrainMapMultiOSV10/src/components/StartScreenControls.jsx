// The start page's background controls — scene, transparency and speeds —
// shared by the start page itself and Settings › 시작 화면.
import React, { useRef } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from './Icons';
import { CHANNEL_MAX, START_SCENE_IDS, START_SPEED_CHANNELS, startSceneId } from '../lib/startscenes';

// One icon per background scene (the buttons here and in Settings).
export const SCENE_ICONS = {
  radial: 'layoutMap', neurons: 'neuron', brain: 'brain', orgchart: 'layoutOrgDown', logic: 'layoutTreeRight', timeline: 'layoutTimeline', fishbone: 'layoutFishbone',
  idea: 'idea', sticky: 'notes', orbit: 'orbit', forest: 'tree', bubbles: 'bubbles', constellation: 'star', flowchart: 'flowchart',
  clusters: 'cluster', outline: 'outlineView', relations: 'relationship', matrix: 'splitGrid', spiral: 'spiral', islands: 'island', gantt: 'gantt',
};

export const SPEED_DEFAULTS = { motion: 20, cameraSpeed: 100, objectSpeed: 100, skySpeed: 100 };

export function screenOf(settings) {
  return settings && settings.startScreen && typeof settings.startScreen === 'object' ? settings.startScreen : {};
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

/** Scene buttons, then the transparency / speed sliders and their reset. `onScreen` takes a startScreen patch. */
export function StartScreenControls({ settings, onScreen }) {
  useLanguage();
  const screen = screenOf(settings);
  const scene = startSceneId(screen.scene);
  const speeds = [
    ['transparency', t('start_transparency'), percent(screen.transparency, 80, 100), 100, 5],
    ['motion', t('start_motion'), percent(screen.motion, 20, 100), 100, 5],
    ...START_SPEED_CHANNELS.map((ch) => [ch.key, t(ch.key === 'cameraSpeed' ? 'start_speed_camera' : ch.key === 'objectSpeed' ? 'start_speed_objects' : 'start_speed_sky'), percent(screen[ch.key], 100, CHANNEL_MAX), CHANNEL_MAX, 10]),
  ];
  return (
    <>
      <div className="start-scenes">
        {START_SCENE_IDS.map((id) => (
          <button key={id} type="button" className={`start-scene${scene === id ? ' on' : ''}`} data-scene={id} aria-pressed={scene === id ? 'true' : 'false'} title={t(`start_scene_${id}`)} onClick={() => onScreen({ scene: id })}><Icon name={SCENE_ICONS[id] || 'fileImage'} size={15} /><span>{t(`start_scene_${id}`)}</span></button>
        ))}
      </div>
      <div className="start-speeds">
        <div className="start-speed-list">
          {speeds.map(([key, label, value, max, step]) => (
            <SpeedRow key={key} id={key} label={label} value={value} max={max} step={step} onChange={(n) => onScreen({ [key]: n })} />
          ))}
        </div>
        <button type="button" className="start-speed-reset" onClick={() => onScreen({ ...SPEED_DEFAULTS })}>{t('start_speed_reset')}</button>
      </div>
    </>
  );
}

export default StartScreenControls;
