import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import type { Vec3 } from '../types';

const PANEL_W = 280;
const PANEL_H = 460;
const STORAGE_KEY = 'lightsPanelPos';
const POS_MIN = -20;
const POS_MAX = 20;
const POS_STEP = 0.1;

type Pos = { x: number; y: number };

function loadPos(): Pos {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Pos;
      if (typeof p.x === 'number' && typeof p.y === 'number') return p;
    }
  } catch {
    /* ignore */
  }
  return { x: 16, y: 16 };
}

function VecSliders({
  value,
  onChange,
}: {
  value: Vec3;
  onChange: (v: Vec3) => void;
}) {
  return (
    <div className="light-vec">
      {(['x', 'y', 'z'] as const).map((axis) => (
        <label key={axis} className="light-vec-slider">
          <span className={`axis ${axis}`}>{axis.toUpperCase()}</span>
          <input
            type="range"
            min={POS_MIN}
            max={POS_MAX}
            step={POS_STEP}
            value={value[axis]}
            onChange={(e) =>
              onChange({ ...value, [axis]: parseFloat(e.target.value) })
            }
          />
          <em>{value[axis].toFixed(1)}</em>
        </label>
      ))}
    </div>
  );
}

export default function LightsCanvasPanel() {
  const { t } = useTranslation();
  const lights = useAppStore((s) => s.lights);
  const setLights = useAppStore((s) => s.setLights);
  const showLightsPanel = useAppStore((s) => s.showLightsPanel);
  const setShowLightsPanel = useAppStore((s) => s.setShowLightsPanel);

  const [pos, setPos] = useState<Pos>(loadPos);
  const dragRef = useRef<{
    active: boolean;
    ox: number;
    oy: number;
    startX: number;
    startY: number;
  }>({ active: false, ox: 0, oy: 0, startX: 0, startY: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const clampPos = useCallback((x: number, y: number): Pos => {
    const parent = panelRef.current?.parentElement;
    const pw = parent?.clientWidth ?? window.innerWidth;
    const ph = parent?.clientHeight ?? window.innerHeight;
    return {
      x: Math.max(0, Math.min(x, pw - PANEL_W)),
      y: Math.max(0, Math.min(y, ph - 48)),
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
  }, [pos]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d.active) return;
      setPos(clampPos(d.startX + (e.clientX - d.ox), d.startY + (e.clientY - d.oy)));
    };
    const onUp = () => {
      dragRef.current.active = false;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [clampPos]);

  if (!showLightsPanel) return null;

  const startDrag = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest('button, input, select, label')) return;
    e.preventDefault();
    dragRef.current = {
      active: true,
      ox: e.clientX,
      oy: e.clientY,
      startX: pos.x,
      startY: pos.y,
    };
  };

  return (
    <div
      ref={panelRef}
      className="lights-canvas-panel"
      style={{ left: pos.x, top: pos.y, width: PANEL_W, maxHeight: PANEL_H }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="lights-panel-header" onPointerDown={startDrag}>
        <span>{t('lightsPanel.title')}</span>
        <button
          type="button"
          className="tb-btn"
          title={t('lightsPanel.close')}
          onClick={() => setShowLightsPanel(false)}
        >
          ×
        </button>
      </div>

      <div className="lights-panel-body">
        <div className="light-card">
          <div className="light-card-title">
            <span className="light-badge ambient">{t('properties.ambient')}</span>
            <span className="light-type">{t('lightsPanel.typeAmbient')}</span>
          </div>
          <label className="light-row">
            <span>{t('properties.intensity')}</span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.01}
              value={lights.ambientIntensity}
              onChange={(e) => setLights({ ambientIntensity: parseFloat(e.target.value) })}
            />
            <em>{lights.ambientIntensity.toFixed(2)}</em>
          </label>
          <label className="light-row">
            <span>{t('properties.color')}</span>
            <input
              type="color"
              value={lights.ambientColor}
              onChange={(e) => setLights({ ambientColor: e.target.value })}
            />
          </label>
          <p className="light-note">{t('lightsPanel.ambientNote')}</p>
          <p className="light-note">{t('lightsPanel.dragHint')}</p>
        </div>

        <div className="light-card">
          <div className="light-card-title">
            <span className="light-badge directional">{t('properties.directional')}</span>
            <span className="light-type">{t('lightsPanel.typeDirectional')}</span>
          </div>
          <label className="light-row">
            <span>{t('properties.intensity')}</span>
            <input
              type="range"
              min={0}
              max={3}
              step={0.01}
              value={lights.directionalIntensity}
              onChange={(e) => setLights({ directionalIntensity: parseFloat(e.target.value) })}
            />
            <em>{lights.directionalIntensity.toFixed(2)}</em>
          </label>
          <label className="light-row">
            <span>{t('properties.color')}</span>
            <input
              type="color"
              value={lights.directionalColor}
              onChange={(e) => setLights({ directionalColor: e.target.value })}
            />
          </label>
          <div className="light-pos-label">{t('lightsPanel.position')}</div>
          <VecSliders
            value={lights.directionalPosition}
            onChange={(directionalPosition) => setLights({ directionalPosition })}
          />
        </div>

        <div className="light-card">
          <div className="light-card-title">
            <span className="light-badge point">{t('properties.point')}</span>
            <span className="light-type">{t('lightsPanel.typePoint')}</span>
          </div>
          <label className="light-row">
            <span>{t('properties.intensity')}</span>
            <input
              type="range"
              min={0}
              max={3}
              step={0.01}
              value={lights.pointIntensity}
              onChange={(e) => setLights({ pointIntensity: parseFloat(e.target.value) })}
            />
            <em>{lights.pointIntensity.toFixed(2)}</em>
          </label>
          <label className="light-row">
            <span>{t('properties.color')}</span>
            <input
              type="color"
              value={lights.pointColor}
              onChange={(e) => setLights({ pointColor: e.target.value })}
            />
          </label>
          <div className="light-pos-label">{t('lightsPanel.position')}</div>
          <VecSliders
            value={lights.pointPosition}
            onChange={(pointPosition) => setLights({ pointPosition })}
          />
        </div>
      </div>
    </div>
  );
}
