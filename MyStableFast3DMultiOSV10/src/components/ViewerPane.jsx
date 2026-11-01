import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Viewer3D } from '../lib/viewer3d.js';
import { IconImage, IconCube, IconStop } from './Icons.jsx';
import { formatDuration } from '../lib/platform.js';

// The 3D view in the middle of the window, plus what lies over it: the empty
// state (only while nothing is open, not even an image), the progress of a
// running conversion and the drop zone.
const ViewerPane = forwardRef(function ViewerPane({
  view, lights, object, animations, job, busy, hasImage, dragOver, onCancel, onOpenImage, onOpenModel,
  onLightMove, onLightSelect, selectedLight, banner, onContextMenu,
}, ref) {
  const { t } = useTranslation();
  const hostRef = useRef(null);
  const viewerRef = useRef(null);
  const callbacks = useRef({});
  const rightDown = useRef(null);
  callbacks.current = { onLightMove, onLightSelect };

  useEffect(() => {
    const viewer = new Viewer3D(hostRef.current, {
      onLightMove: (...a) => callbacks.current.onLightMove?.(...a),
      onLightSelect: (...a) => callbacks.current.onLightSelect?.(...a),
    });
    viewerRef.current = viewer;
    if (typeof window !== 'undefined') window.__mysf3dViewer = viewer;
    return () => { viewer.dispose(); viewerRef.current = null; };
  }, []);

  useEffect(() => { viewerRef.current?.apply(view, lights); }, [view, lights]);

  useEffect(() => { viewerRef.current?.setModel(object, animations || []); }, [object, animations]);

  useEffect(() => {
    const v = viewerRef.current;
    if (v && (selectedLight || null) !== v.selectedLight) v.selectLight(selectedLight || null);
  }, [selectedLight]);

  useImperativeHandle(ref, () => ({
    viewer: () => viewerRef.current,
    fit: () => viewerRef.current?.fit(),
    setView: (name) => viewerRef.current?.setView(name),
    snapshot: () => viewerRef.current?.snapshot(),
    exportRoot: () => viewerRef.current?.exportRoot(),
    setTransform: (tr) => viewerRef.current?.setTransform(tr),
    refresh: () => viewerRef.current?.apply(view, lights),
  }), [view, lights]);

  const pct = Math.round((job?.progress || 0) * 100);

  return (
    <main
      className={`viewer viewer3d${dragOver ? ' dragging' : ''}`}
      // Right-drag pans the view; only a right-click that did not move opens the menu.
      onPointerDown={(e) => { if (e.button === 2) rightDown.current = { x: e.clientX, y: e.clientY }; }}
      onContextMenu={(e) => {
        e.preventDefault();
        const d = rightDown.current;
        rightDown.current = null;
        if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;
        if (e.target.closest('.engine-banner, .convert-overlay, .viewer-empty .welcome')) return;
        onContextMenu?.(e.clientX, e.clientY);
      }}
    >
      <div className="viewer3d-host" ref={hostRef} />
      {!object && !busy && !hasImage ? (
        <div className="viewer-empty">
          <div className="welcome">
            <img src="./icon.svg" alt="" width="96" height="96" />
            <h2>{t('viewer.emptyTitle')}</h2>
            <p>{t('viewer.emptyHint')}</p>
            <div className="row center">
              <button className="btn primary" onClick={onOpenImage}><IconImage size={16} /> {t('toolbar.openImage')}</button>
              <button className="btn" onClick={onOpenModel}><IconCube size={16} /> {t('toolbar.openModel')}</button>
            </div>
          </div>
        </div>
      ) : null}
      {busy && job ? (
        <div className="convert-overlay" role="status">
          <div className="convert-card">
            <div className="convert-head">
              <span className="spinner" />
              <strong>{t(`stage.${job.stage}`, job.stage)}</strong>
              <span className="convert-pct">{pct}%</span>
            </div>
            <div className="progbar"><div className="progbar-fill" style={{ width: `${Math.max(2, pct)}%` }} /></div>
            <div className="convert-meta">
              <span>{job.modelName || ''}</span>
              <span>{job.deviceName || ''}</span>
              <span>{formatDuration(job.elapsed || 0)}</span>
            </div>
            {job.device === 'cpu' ? <p className="convert-note">{t('viewer.cpuNote')}</p> : null}
            <button className="btn small" onClick={onCancel}><IconStop size={14} /> {t('toolbar.cancel')}</button>
          </div>
        </div>
      ) : null}
      {banner}
      {dragOver ? <div className="dropzone">{t('viewer.dropHere')}</div> : null}
    </main>
  );
});

export default ViewerPane;
