// The 3D model import window: a live preview of the model on the left (drag to turn it, wheel to
// zoom), the view on the right (presets, turn, tilt, roll, zoom, light, one colour, wireframe,
// shadow). "Place on canvas" renders the view at 1024 px onto a transparent background and the
// editor puts that picture on the canvas.
import React, { useEffect, useRef, useState } from 'react';
import { t } from '../i18n.js';
import { createModelView, DEFAULT_VIEW, VIEW_PRESETS } from '../lib/model3d.js';
import { Btn, ColorField, Modal, Slider, Toggle } from './controls.jsx';

export default function Model3DDialog({ model, onPlace, onClose }) {
  const canvas = useRef(null);
  const viewer = useRef(null);
  const [view, setViewState] = useState(DEFAULT_VIEW);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const setView = (patch) => setViewState((v) => ({ ...v, ...patch }));

  useEffect(() => {
    let live = true;
    createModelView(canvas.current, model.object).then((v) => {
      if (!live) { v.dispose(); return; }
      viewer.current = v;
      setStats(v.stats);
      v.render(view);
    }).catch((err) => setError(String(err?.message ?? err)));
    return () => { live = false; viewer.current?.dispose(); viewer.current = null; };
  }, [model]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { viewer.current?.render(view); }, [view]);
  useEffect(() => {
    const el = canvas.current;
    const observer = new ResizeObserver(() => viewer.current?.render(view));
    observer.observe(el);
    return () => observer.disconnect();
  }, [view]);

  // Drag to turn and tilt; wheel to zoom.
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    const start = { x: e.clientX, y: e.clientY, yaw: view.yaw, pitch: view.pitch };
    const move = (ev) => setView({
      yaw: Math.round(((start.yaw + (ev.clientX - start.x) * 0.5 + 540) % 360) - 180),
      pitch: Math.round(Math.max(-89, Math.min(89, start.pitch + (ev.clientY - start.y) * 0.4))),
    });
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const onWheel = (e) => setView({ zoom: Math.round(Math.max(30, Math.min(300, view.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)))) });

  const place = () => {
    const v = viewer.current;
    if (!v) return;
    const url = v.snapshot(1024, view);
    onPlace({ name: model.name, url });
  };

  return (
    <Modal icon="cube" title={`${t('model3d.title')} — ${model.name}`} onClose={onClose} className="model3d-modal"
      actions={(
        <>
          <span className="muted model3d-stats">{stats ? t('model3d.stats', { meshes: stats.meshes, triangles: stats.triangles.toLocaleString() }) : error || t('model3d.loading')}</span>
          <span className="grow" />
          <Btn icon="close" label={t('common.cancel')} onClick={onClose} />
          <Btn icon="importImage" label={t('model3d.place')} primary onClick={place} disabled={!stats} data-testid="model3d-place" />
        </>
      )}>
      <div className="model3d-body">
        <div className="model3d-stage checker-bg">
          <canvas ref={canvas} className="model3d-canvas" onPointerDown={onPointerDown} onWheel={onWheel} data-testid="model3d-canvas" />
        </div>
        <div className="model3d-options side-scroll">
          <div className="btn-grid two">
            {Object.keys(VIEW_PRESETS).map((id) => (
              <Btn key={id} icon="cube" label={t(`model3d.view.${id}`)} className="small" active={view.yaw === VIEW_PRESETS[id].yaw && view.pitch === VIEW_PRESETS[id].pitch}
                onClick={() => setView(VIEW_PRESETS[id])} data-view-preset={id} />
            ))}
            <Btn icon="refresh" label={t('model3d.reset')} className="small" onClick={() => setViewState(DEFAULT_VIEW)} />
          </div>
          <Slider icon="refresh" label={t('model3d.yaw')} value={view.yaw} min={-180} max={180} unit="°" onChange={(v) => setView({ yaw: v })} />
          <Slider icon="rotate" label={t('model3d.pitch')} value={view.pitch} min={-89} max={89} unit="°" onChange={(v) => setView({ pitch: v })} />
          <Slider icon="rotate" label={t('model3d.roll')} value={view.roll} min={-180} max={180} unit="°" onChange={(v) => setView({ roll: v })} />
          <Slider icon="zoomIn" label={t('model3d.zoom')} value={view.zoom} min={30} max={300} step={5} unit="%" onChange={(v) => setView({ zoom: v })} />
          <Slider icon="sun" label={t('model3d.light')} value={view.light} min={20} max={250} step={5} unit="%" onChange={(v) => setView({ light: v })} />
          <Toggle icon="palette" label={t('model3d.oneColor')} checked={view.useColor} onChange={(v) => setView({ useColor: v })} />
          {view.useColor && <ColorField label={t('model3d.color')} value={view.color} onChange={(c) => setView({ color: c })} />}
          <Toggle icon="grid" label={t('model3d.wire')} checked={view.wire} onChange={(v) => setView({ wire: v })} />
          <Toggle icon="shadow" label={t('model3d.shadow')} checked={view.shadow} onChange={(v) => setView({ shadow: v })} />
          <p className="muted model3d-tip">{t('model3d.tip')}</p>
        </div>
      </div>
    </Modal>
  );
}
