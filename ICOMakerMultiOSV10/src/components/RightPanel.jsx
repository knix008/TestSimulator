import React from 'react';
import { useTranslation } from 'react-i18next';
import { ExportIcon, FxIcon, CubeIcon } from './Icons.jsx';
import { ICO_SIZES } from '../lib/iconCanvas.js';

// 20 preset pastel colors — evenly-spaced, distinct hues around the wheel.
export const PASTELS = [
  '#FFB3B3', '#FFC9B3', '#FFE0B3', '#FFF3B3', '#F3FFB3',
  '#DBFFB3', '#C2FFB8', '#B3FFC9', '#B3FFE0', '#B3FFF3',
  '#B3F3FF', '#B3E0FF', '#B3C9FF', '#B3B8FF', '#C2B3FF',
  '#DBB3FF', '#F3B3FF', '#FFB3F3', '#FFB3DB', '#FFB3C2',
];

function Swatches({ onPick, current }) {
  return (
    <div className="swatches">
      {PASTELS.map((c) => (
        <button
          key={c}
          type="button"
          className={`swatch ${current && current.toLowerCase() === c.toLowerCase() ? 'active' : ''}`}
          style={{ background: c }}
          title={c}
          onClick={() => onPick(c)}
        />
      ))}
    </div>
  );
}

function Slider({ label, value, min, max, step = 1, suffix = '', onChange }) {
  return (
    <label className="ctrl">
      <span className="ctrl-label">{label}<em>{value}{suffix}</em></span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function ColorRow({ label, on, color, onToggle, onColor }) {
  return (
    <div className="ctrl">
      <div className="bg-row">
        <label className="chk" style={{ flex: 1 }}>
          <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} />
          {label}
        </label>
        <input type="color" value={color} disabled={!on} onChange={(e) => onColor(e.target.value)} />
      </div>
      {on && <Swatches current={color} onPick={onColor} />}
    </div>
  );
}

export default function RightPanel({
  sel, updateSel, updateFx,
  background, setBackground,
  bgPad, setBgPad,
  sizes, toggleSize,
  perSize, setPerSize,
  exportOpacity, setExportOpacity,
  onExport, exporting, hasObjects,
}) {
  const { t } = useTranslation();
  const fx = sel?.fx || {};
  const boxLike = sel && ['rect', 'ellipse', 'image', 'text'].includes(sel.type);

  return (
    <div className="panel rp">
      {/* ── Selected object properties ── */}
      <div className="panel-head"><span>{t('props.title')}</span></div>
      {!sel && <div className="rp-empty">{t('props.none')}</div>}

      {sel && (
        <>
          {['rect', 'ellipse', 'text', 'shape'].includes(sel.type) && (
            <ColorRow label={t('props.fill')} on={sel.hasFill} color={sel.fill}
              onToggle={(v) => updateSel({ hasFill: v })} onColor={(c) => updateSel({ fill: c })} />
          )}
          {sel.type !== 'image' && (
            <>
              <ColorRow label={t('props.stroke')} on={sel.hasStroke} color={sel.stroke}
                onToggle={(v) => updateSel({ hasStroke: v })} onColor={(c) => updateSel({ stroke: c })} />
              {sel.hasStroke && (
                <Slider label={t('props.strokeWidth')} value={sel.strokeWidth} min={1} max={60}
                  onChange={(v) => updateSel({ strokeWidth: v })} />
              )}
            </>
          )}
          {sel.type === 'rect' && (
            <Slider label={t('props.corner')} value={sel.rx || 0} min={0} max={256}
              onChange={(v) => updateSel({ rx: v })} />
          )}
          {sel.type === 'text' && (
            <>
              <label className="ctrl">
                <span className="ctrl-label">{t('props.text')}</span>
                <input className="text-input" value={sel.text}
                  onChange={(e) => updateSel({ text: e.target.value })} />
              </label>
              <Slider label={t('props.fontSize')} value={sel.fontSize} min={8} max={400}
                onChange={(v) => updateSel({ fontSize: v })} />
            </>
          )}
          <Slider label={t('props.opacity')} value={Math.round(sel.opacity * 100)} min={0} max={100} suffix="%"
            onChange={(v) => updateSel({ opacity: v / 100 })} />
          <Slider label={t('props.rotate')} value={sel.rotate || 0} min={0} max={360} suffix="°"
            onChange={(v) => updateSel({ rotate: v })} />

          {/* ── Effects ── */}
          <div className="panel-head fx-head"><span><FxIcon size={15} /> {t('fx.title')}</span></div>

          <label className="chk">
            <input type="checkbox" checked={!!fx.threeD} onChange={(e) => updateFx({ threeD: e.target.checked })} />
            <CubeIcon size={15} /> {t('fx.threeD')}
          </label>
          {fx.threeD && (
            <>
              <Slider label={t('fx.depth')} value={fx.depth} min={1} max={20} onChange={(v) => updateFx({ depth: v })} />
              <Slider label={t('fx.lightX')} value={fx.lightX} min={0} max={512} onChange={(v) => updateFx({ lightX: v })} />
              <Slider label={t('fx.lightY')} value={fx.lightY} min={0} max={512} onChange={(v) => updateFx({ lightY: v })} />
            </>
          )}

          <label className="chk">
            <input type="checkbox" checked={!!fx.shadow} onChange={(e) => updateFx({ shadow: e.target.checked })} />
            {t('fx.shadow')}
          </label>
          {fx.shadow && (
            <>
              <Slider label={t('fx.shadowDy')} value={fx.shadowDy} min={-40} max={40} onChange={(v) => updateFx({ shadowDy: v })} />
              <Slider label={t('fx.shadowBlur')} value={fx.shadowBlur} min={0} max={40} onChange={(v) => updateFx({ shadowBlur: v })} />
              <Slider label={t('fx.shadowOpacity')} value={Math.round(fx.shadowOpacity * 100)} min={0} max={100} suffix="%"
                onChange={(v) => updateFx({ shadowOpacity: v / 100 })} />
            </>
          )}

          <Slider label={t('fx.blur')} value={fx.blur} min={0} max={30} onChange={(v) => updateFx({ blur: v })} />
        </>
      )}

      {/* ── ICO export ── */}
      <div className="panel-head export-head" style={{ marginTop: 12 }}><span><ExportIcon size={15} /> {t('export.title')}</span></div>

      <label className="ctrl">
        <span className="ctrl-label">{t('export.background')}</span>
        <div className="bg-row">
          <label className="chk" style={{ flex: 1 }}>
            <input type="checkbox" checked={background === 'transparent'}
              onChange={(e) => setBackground(e.target.checked ? 'transparent' : '#ffffff')} />
            {t('export.transparentBg')}
          </label>
          <input type="color" disabled={background === 'transparent'}
            value={background === 'transparent' ? '#ffffff' : background}
            onChange={(e) => setBackground(e.target.value)} />
        </div>
        {background !== 'transparent' && <Swatches current={background} onPick={setBackground} />}
      </label>

      {background !== 'transparent' && (
        <Slider label={t('export.bgMargin')} value={bgPad} min={0} max={45} suffix="%"
          onChange={setBgPad} />
      )}

      <Slider label={t('export.opacity')} value={exportOpacity} min={0} max={100} suffix="%"
        onChange={setExportOpacity} />

      <div className="ctrl-label" style={{ marginTop: 6 }}>{t('export.sizes')}</div>
      <div className="size-grid">
        {ICO_SIZES.map((s) => (
          <label key={s} className={`size-chip ${sizes.includes(s) ? 'active' : ''}`}>
            <input type="checkbox" checked={sizes.includes(s)} onChange={() => toggleSize(s)} />
            {s}
          </label>
        ))}
      </div>
      <label className="chk" style={{ marginTop: 8 }}>
        <input type="checkbox" checked={perSize} onChange={(e) => setPerSize(e.target.checked)} />
        {t('export.perSize')}
      </label>

      <button className="export-btn" onClick={onExport} disabled={!hasObjects || exporting || sizes.length === 0}>
        <ExportIcon size={18} />
        {exporting ? t('export.exporting') : t('export.button')}
      </button>
      <p className="export-note">
        {perSize
          ? t('export.noteEach', { n: sizes.length })
          : t('export.noteCombined', { n: sizes.length })}
      </p>
    </div>
  );
}
