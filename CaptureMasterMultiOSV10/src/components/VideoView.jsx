import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { platform } from '../lib/platform.js';
import { clamp, formatDuration } from '../lib/format.js';
import { Icon } from './Icons.jsx';

export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
export const SKIP = 5;

/** Playback of a recorded (or opened) video document, scaled to fit the view. */
export function VideoView({ doc, onMeta, onContextMenu }) {
  const { t } = useTranslation();
  const ref = useRef(null);
  const viewRef = useRef(null);
  const stageRef = useRef(null);
  const [box, setBox] = useState(null);
  const src = doc.blobUrl || platform.mediaUrl(doc.path);
  const gif = /\.gif$/i.test(doc.path || '');

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el || !doc.width || !doc.height) return undefined;
    const update = () => {
      const s = Math.min(el.clientWidth / doc.width, el.clientHeight / doc.height);
      if (s > 0) setBox({ width: Math.floor(doc.width * s), height: Math.floor(doc.height * s) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc.width, doc.height]);

  useEffect(() => {
    const v = ref.current;
    if (!v) return undefined;
    if (gif) {
      const meta = () => onMeta({ width: v.naturalWidth, height: v.naturalHeight, duration: 0 });
      v.addEventListener('load', meta);
      return () => v.removeEventListener('load', meta);
    }
    const meta = () => onMeta({ width: v.videoWidth, height: v.videoHeight, duration: Number.isFinite(v.duration) ? v.duration : 0 });
    v.addEventListener('loadedmetadata', meta);
    // A WebM straight from MediaRecorder has no duration until the end is
    // reached once; seeking to the end fills it in.
    const fix = () => { if (v.duration === Infinity) { v.currentTime = 1e9; v.addEventListener('timeupdate', () => { v.currentTime = 0; meta(); }, { once: true }); } };
    v.addEventListener('loadedmetadata', fix, { once: true });
    return () => v.removeEventListener('loadedmetadata', meta);
  }, [src, gif, onMeta]);

  return (
    <div className="video-view" ref={viewRef} onContextMenu={(e) => { e.preventDefault(); onContextMenu(e); }}>
      <div className="video-stage" ref={stageRef}>
        {gif
          ? <img ref={ref} src={src} crossOrigin="anonymous" alt={doc.name} draggable={false} style={box || undefined} />
          : <video ref={ref} src={src} crossOrigin="anonymous" playsInline style={box || undefined} onClick={() => togglePlay(ref.current)} onDoubleClick={() => toggleFullscreen(viewRef.current)} />}
      </div>
      {gif ? null : <PlayerControls videoRef={ref} viewRef={viewRef} fallbackDuration={doc.duration} />}
      <div className="video-meta">
        <span>{doc.name}</span>
        {doc.width ? <span>{doc.width} × {doc.height}</span> : null}
        {doc.duration ? <span>{t('status.duration', { t: formatDuration(doc.duration) })}</span> : null}
        {doc.path ? <span title={doc.path}>{doc.path}</span> : null}
      </div>
    </div>
  );
}

function togglePlay(v) {
  if (!v) return;
  if (v.paused || v.ended) v.play().catch(() => {}); else v.pause();
}

function toggleFullscreen(el) {
  if (!el) return;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else el.requestFullscreen().catch(() => {});
}

// `loop` has no change event of its own; the controls listen for this one.
const LOOP_EVENT = 'cm-loopchange';
function toggleLoop(v) {
  if (!v) return;
  v.loop = !v.loop;
  v.dispatchEvent(new Event(LOOP_EVENT));
}

function frameDataUrl(v, type = 'image/png') {
  const w = v && (v.videoWidth || v.naturalWidth);
  if (!w) return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = v.videoHeight || v.naturalHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  return type === 'image/png' ? c.toDataURL(type) : c.toDataURL(type, 0.92);
}

/**
 * The player of the video shown inside `container`, for menus outside the
 * view; null when no video is shown (a GIF has no player).
 */
export function videoControl(container) {
  const view = container && container.querySelector('.video-view');
  const v = view && view.querySelector('video');
  if (!v) return null;
  const duration = () => (Number.isFinite(v.duration) ? v.duration : 0);
  const seek = (time) => { v.currentTime = clamp(time, 0, duration() || time); };
  return {
    paused: v.paused || v.ended,
    muted: v.muted || v.volume === 0,
    loop: v.loop,
    rate: v.playbackRate,
    time: v.currentTime,
    fullscreen: document.fullscreenElement === view,
    togglePlay: () => togglePlay(v),
    skip: (dt) => seek(v.currentTime + dt),
    toStart: () => seek(0),
    toggleMute: () => { if (v.muted || v.volume === 0) { v.muted = false; if (v.volume === 0) v.volume = 0.5; } else v.muted = true; },
    toggleLoop: () => toggleLoop(v),
    setRate: (r) => { v.playbackRate = r; },
    toggleFullscreen: () => toggleFullscreen(view),
    framePng: () => frameDataUrl(v),
  };
}

/** Play controls, centred under the video. */
function PlayerControls({ videoRef, viewRef, fallbackDuration }) {
  const { t } = useTranslation();
  const [state, setState] = useState({ time: 0, duration: 0, paused: true, volume: 1, muted: false, rate: 1, loop: false, buffered: 0 });
  const [scrub, setScrub] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    const sync = () => {
      const d = Number.isFinite(v.duration) ? v.duration : 0;
      const b = v.buffered && v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0;
      setState({ time: v.currentTime, duration: d, paused: v.paused || v.ended, volume: v.volume, muted: v.muted, rate: v.playbackRate, loop: v.loop, buffered: b });
    };
    const events = ['timeupdate', 'durationchange', 'loadedmetadata', 'play', 'pause', 'ended', 'volumechange', 'ratechange', 'progress', 'seeked', LOOP_EVENT];
    for (const e of events) v.addEventListener(e, sync);
    sync();
    return () => { for (const e of events) v.removeEventListener(e, sync); };
  }, [videoRef]);

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === viewRef.current);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, [viewRef]);

  const duration = state.duration || fallbackDuration || 0;
  const v = () => videoRef.current;
  const seek = useCallback((time) => {
    const el = videoRef.current;
    if (!el) return;
    const d = Number.isFinite(el.duration) ? el.duration : (fallbackDuration || 0);
    el.currentTime = clamp(time, 0, d || 0);
  }, [videoRef, fallbackDuration]);
  const skip = useCallback((dt) => { const el = videoRef.current; if (el) seek(el.currentTime + dt); }, [seek, videoRef]);
  const setVolume = useCallback((vol) => {
    const el = videoRef.current;
    if (!el) return;
    el.volume = clamp(vol, 0, 1);
    el.muted = el.volume === 0;
  }, [videoRef]);
  const toggleMute = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.muted || el.volume === 0) { el.muted = false; if (el.volume === 0) el.volume = 0.5; } else el.muted = true;
  }, [videoRef]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' && e.target.type !== 'range') return;
      if (tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable)) return;
      if (document.querySelector('.modal-backdrop')) return;
      const el = videoRef.current;
      if (!el) return;
      const k = e.key.toLowerCase();
      const act = {
        ' ': () => togglePlay(el), k: () => togglePlay(el),
        arrowleft: () => skip(-SKIP), arrowright: () => skip(SKIP), j: () => skip(-10), l: () => skip(10),
        arrowup: () => setVolume(el.volume + 0.1), arrowdown: () => setVolume(el.volume - 0.1),
        home: () => seek(0), end: () => seek(Infinity), m: toggleMute, f: () => toggleFullscreen(viewRef.current),
        ',': () => { if (el.paused) seek(el.currentTime - 1 / 30); }, '.': () => { if (el.paused) seek(el.currentTime + 1 / 30); },
      }[k];
      if (!act) return;
      e.preventDefault();
      e.stopPropagation();
      act();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [seek, setVolume, skip, toggleMute, videoRef, viewRef]);

  const shown = scrub != null ? scrub : state.time;
  const pct = duration ? (shown / duration) * 100 : 0;
  const bufPct = duration ? Math.min(100, (state.buffered / duration) * 100) : 0;
  const volIcon = state.muted || state.volume === 0 ? 'mute' : state.volume < 0.5 ? 'volumeLow' : 'volume';
  const btn = (icon, title, onClick, extra = {}) => (
    <button type="button" className={`pc-btn${extra.active ? ' active' : ''}${extra.big ? ' big' : ''}`} title={title} aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      <Icon name={icon} size={extra.big ? 22 : 17} />
    </button>
  );

  return (
    <div className="player-controls" onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }} onDoubleClick={(e) => e.stopPropagation()}>
      <div className="pc-seek">
        <span className="pc-time">{formatDuration(shown)}</span>
        <input
          type="range"
          className="pc-range"
          min={0}
          max={duration || 0}
          step="any"
          value={Math.min(shown, duration || 0)}
          disabled={!duration}
          aria-label={t('player.seek')}
          style={{ '--pct': `${pct}%`, '--buf': `${bufPct}%` }}
          onPointerDown={() => setScrub(state.time)}
          onChange={(e) => { const x = Number(e.target.value); setScrub(x); seek(x); }}
          onPointerUp={() => setScrub(null)}
          onBlur={() => setScrub(null)}
        />
        <span className="pc-time">{formatDuration(duration)}</span>
      </div>
      <div className="pc-row">
        <div className="pc-side left">
          {btn(volIcon, state.muted ? t('player.unmute') : t('player.mute'), toggleMute)}
          <input
            type="range"
            className="pc-range pc-volume"
            min={0}
            max={1}
            step={0.05}
            value={state.muted ? 0 : state.volume}
            aria-label={t('player.volume')}
            title={`${t('player.volume')} ${Math.round((state.muted ? 0 : state.volume) * 100)}%`}
            style={{ '--pct': `${(state.muted ? 0 : state.volume) * 100}%`, '--buf': '0%' }}
            onChange={(e) => setVolume(Number(e.target.value))}
          />
        </div>
        <div className="pc-center">
          {btn('skipStart', t('player.toStart'), () => seek(0))}
          {btn('rewind', t('player.back', { n: SKIP }), () => skip(-SKIP))}
          {btn(state.paused ? 'play' : 'pause', state.paused ? t('player.play') : t('player.pause'), () => togglePlay(v()), { big: true })}
          {btn('forward', t('player.forward', { n: SKIP }), () => skip(SKIP))}
          {btn('skipEnd', t('player.toEnd'), () => seek(Infinity))}
        </div>
        <div className="pc-side right">
          <select
            className="pc-speed"
            value={state.rate}
            title={t('player.speed')}
            aria-label={t('player.speed')}
            onChange={(e) => { const el = v(); if (el) el.playbackRate = Number(e.target.value); }}
          >
            {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
          </select>
          {btn('loop', t('player.loop'), () => toggleLoop(v()), { active: state.loop })}
          {btn('fullscreen', fullscreen ? t('player.exitFullscreen') : t('player.fullscreen'), () => toggleFullscreen(viewRef.current), { active: fullscreen })}
        </div>
      </div>
    </div>
  );
}

/** Grabs the current frame of the playing video for printing. */
export function videoFrameDataUrl(container) {
  return frameDataUrl(container && container.querySelector('video, img'), 'image/jpeg');
}
