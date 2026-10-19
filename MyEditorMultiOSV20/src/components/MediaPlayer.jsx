// Audio and video files fill the tab: the picture or a sound mark, a status
// line, and the transport (play, pause, stop, seek, volume).
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { mediaSrc } from '../lib/backend';
import { isVideoName } from '../lib/imagekind';
import { Icon } from './Icons';

function clock(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}

const STATUS = {
  loading: 'media_status_loading',
  playing: 'media_status_playing',
  paused: 'media_status_paused',
  stopped: 'media_status_stopped',
  ended: 'media_status_ended',
  error: 'media_status_error',
};

export function MediaPlayer({ path, name }) {
  useLanguage();
  const video = isVideoName(name);
  const elRef = useRef(null);
  const stopped = useRef(true);
  const [src, setSrc] = useState('');
  const [status, setStatus] = useState('loading');
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [vol, setVol] = useState(1);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    let dead = false;
    setSrc('');
    setStatus('loading');
    setTime(0);
    setDur(0);
    stopped.current = true;
    mediaSrc(path).then((u) => { if (!dead) setSrc(u); }).catch(() => { if (!dead) setStatus('error'); });
    return () => { dead = true; };
  }, [path]);

  const el = () => elRef.current;
  const play = () => {
    const node = el();
    if (!node) return;
    stopped.current = false;
    node.play().catch(() => setStatus('error'));
  };
  const pause = () => { const node = el(); if (node) node.pause(); };
  const stop = () => {
    const node = el();
    if (!node) return;
    stopped.current = true;
    node.pause();
    try { node.currentTime = 0; } catch { /* not ready */ }
    setTime(0);
    setStatus(node.error ? 'error' : 'stopped');
  };
  const onPause = () => setStatus((s) => (s === 'error' || s === 'ended' ? s : stopped.current ? 'stopped' : 'paused'));

  const ready = status !== 'loading' && status !== 'error';
  const mediaProps = {
    src,
    onLoadedMetadata: (e) => { setDur(e.currentTarget.duration || 0); setStatus((s) => (s === 'playing' ? s : 'stopped')); },
    onTimeUpdate: (e) => setTime(e.currentTarget.currentTime || 0),
    onPlay: () => setStatus('playing'),
    onPause,
    onEnded: () => { stopped.current = true; setStatus('ended'); },
    onPlaying: () => setStatus('playing'),
    onError: () => setStatus('error'),
  };
  return (
    <div className={`media-player ${video ? 'video' : 'audio'}`}>
      {src && video && <video ref={elRef} {...mediaProps} className="media-stage" />}
      {src && !video && <audio ref={elRef} {...mediaProps} />}
      {!video && (
        <div className="media-art">
          <Icon name="fileAudio" size={64} />
          <div className="media-name ellipsis">{name}</div>
        </div>
      )}
      <div className={`media-status media-${status}`} role="status">
        <span>{t(STATUS[status] || STATUS.stopped)}</span>
        <span className="media-clock">{clock(time)} / {clock(dur)}</span>
        {video && <span className="media-name ellipsis">{name}</span>}
      </div>
      <div className="media-controls">
        <button type="button" className="md-btn" title={status === 'playing' ? t('media_pause') : t('media_play')} aria-label={status === 'playing' ? t('media_pause') : t('media_play')} disabled={!ready} onClick={() => (status === 'playing' ? pause() : play())}>
          <Icon name={status === 'playing' ? 'pause' : 'play'} size={16} />
        </button>
        <button type="button" className="md-btn" title={t('media_stop')} aria-label={t('media_stop')} disabled={!ready} onClick={stop}>
          <Icon name="stop" size={16} />
        </button>
        <input className="media-seek" type="range" min={0} max={dur || 0} step={0.1} value={Math.min(time, dur || 0)} disabled={!ready || !dur}
          aria-label={t('media_seek')}
          onChange={(e) => { const node = el(); const n = Number(e.target.value); if (node) { stopped.current = false; node.currentTime = n; } setTime(n); }} />
        <button type="button" className="md-btn" title={muted ? t('media_unmute') : t('media_mute')} aria-label={muted ? t('media_unmute') : t('media_mute')} onClick={() => { const node = el(); const next = !muted; setMuted(next); if (node) node.muted = next; }}>
          <Icon name={muted || vol === 0 ? 'volumeOff' : 'volume'} size={16} />
        </button>
        <input className="media-vol" type="range" min={0} max={1} step={0.05} value={muted ? 0 : vol} aria-label={t('media_volume')}
          onChange={(e) => { const n = Number(e.target.value); setVol(n); setMuted(n === 0); const node = el(); if (node) { node.volume = n; node.muted = n === 0; } }} />
      </div>
    </div>
  );
}

export default MediaPlayer;
