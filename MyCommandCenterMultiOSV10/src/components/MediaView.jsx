// The viewer's pane for a video or audio file (F3, or a click in the list →
// the preview window): the browser's own <video> / <audio> player with its
// controls, playing from the host's streaming URL (lib/media.js) — not a
// full player, just enough to watch / listen and scrub. Space toggles
// playback, ← → seek 5 s, M mutes; the footer gets "duration · size · mime"
// (and the picture size of a video) through spec.onInfo.
import React, { useEffect, useRef, useState } from 'react';
import { t } from '../lib/i18n';
import { formatSize, baseName } from '../lib/format';
import { mediaUrl, formatTime } from '../lib/media';
import { Icon } from './Icons';

// spec: { data (fs.readFile result, kind 'media'), path, onInfo(text), onError(err, title), autoplay }
export function MediaView({ spec }) {
  const { data, path } = spec;
  const video = data.media === 'video';
  const ref = useRef(null);
  const [error, setError] = useState('');
  const [meta, setMeta] = useState(null);   // { duration, width, height }
  const url = mediaUrl(path);

  useEffect(() => { setError(''); setMeta(null); }, [path]);

  const onMeta = () => {
    const el = ref.current;
    if (!el) return;
    const m = { duration: el.duration, width: el.videoWidth || 0, height: el.videoHeight || 0 };
    setMeta(m);
    if (spec.onInfo) spec.onInfo(`${video && m.width ? `${m.width} × ${m.height}  ·  ` : ''}${formatTime(m.duration)}  ·  ${formatSize(data.size)}  ·  ${data.mime}`);
  };
  const onError = () => {
    const el = ref.current;
    const code = el && el.error ? el.error.code : 0;
    // 4 = MEDIA_ERR_SRC_NOT_SUPPORTED: the host has no decoder for this file (codec / container).
    const msg = t(code === 4 ? 'media_unsupported' : 'media_failed', { name: baseName(path) });
    setError(msg);
    if (spec.onInfo) spec.onInfo(`${formatSize(data.size)}  ·  ${data.mime}`);
  };

  // Keys of the player itself (the element has the focus after autoplay; the pane catches them too).
  const onKey = (e) => {
    const el = ref.current;
    if (!el || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === ' ') { e.preventDefault(); if (el.paused) el.play().catch(() => {}); else el.pause(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); el.currentTime = Math.max(0, el.currentTime - 5); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); el.currentTime = Math.min(el.duration || 0, el.currentTime + 5); }
    else if (e.key.toLowerCase() === 'm') { e.preventDefault(); el.muted = !el.muted; }
  };
  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className={`mediaview ${video ? 'video' : 'audio'}`} tabIndex={-1}>
      {video
        ? <video ref={ref} className="media-el" src={url} controls autoPlay={spec.autoplay !== false} playsInline onLoadedMetadata={onMeta} onError={onError} />
        : (
          <div className="audio-box">
            <div className="audio-art"><Icon name="audio" size={72} /></div>
            <div className="audio-name ellipsis" title={path}>{baseName(path)}</div>
            <audio ref={ref} className="media-el" src={url} controls autoPlay={spec.autoplay !== false} onLoadedMetadata={onMeta} onError={onError} />
          </div>
        )}
      {error && <div className="media-error"><Icon name="warning" size={16} /> {error}</div>}
      {!error && meta && video && !meta.width && <div className="media-error muted">{t('media_no_picture')}</div>}
    </div>
  );
}

export default MediaView;
