import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { platform } from '../lib/platform.js';
import { formatDuration } from '../lib/format.js';

/** Playback of a recorded (or opened) video document. */
export function VideoView({ doc, onMeta, onContextMenu }) {
  const { t } = useTranslation();
  const ref = useRef(null);
  const src = doc.blobUrl || platform.mediaUrl(doc.path);

  useEffect(() => {
    const v = ref.current;
    if (!v) return undefined;
    const meta = () => onMeta({ width: v.videoWidth, height: v.videoHeight, duration: Number.isFinite(v.duration) ? v.duration : 0 });
    v.addEventListener('loadedmetadata', meta);
    // A WebM straight from MediaRecorder has no duration until the end is
    // reached once; seeking to the end fills it in.
    const fix = () => { if (v.duration === Infinity) { v.currentTime = 1e9; v.addEventListener('timeupdate', () => { v.currentTime = 0; meta(); }, { once: true }); } };
    v.addEventListener('loadedmetadata', fix, { once: true });
    return () => v.removeEventListener('loadedmetadata', meta);
  }, [src, onMeta]);

  return (
    <div className="video-view" onContextMenu={(e) => { e.preventDefault(); onContextMenu(e); }}>
      <video ref={ref} src={src} controls playsInline />
      <div className="video-meta">
        <span>{doc.name}</span>
        {doc.width ? <span>{doc.width} × {doc.height}</span> : null}
        {doc.duration ? <span>{t('status.duration', { t: formatDuration(doc.duration) })}</span> : null}
        {doc.path ? <span title={doc.path}>{doc.path}</span> : null}
      </div>
    </div>
  );
}

/** Grabs the current frame of the playing video for printing. */
export function videoFrameDataUrl(container) {
  const v = container && container.querySelector('video');
  if (!v || !v.videoWidth) return null;
  const c = document.createElement('canvas');
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  return c.toDataURL('image/jpeg', 0.92);
}
