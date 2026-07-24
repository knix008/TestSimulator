import { useState } from 'react';
import { t } from '../i18n';

export default function SidePanel({
  mode, lang,
  layers, activeLayers, onToggleLayer,
  settings, onSettingChange, onResetImageSettings, onResetWallSettings,
  sliderRanges,
  detectProgress, onDetectWalls,
  originalPreviewUrl,
  edgePreviewUrl,
  denoisedEdgePreviewUrl,
  cleanEdgePreviewUrl,
  collapsed, onToggleCollapse,
  style,
}) {
  const ranges = sliderRanges ?? {
    wallHeightMin: 0, wallHeightMax: 6,
    wallThicknessMin: 0, wallThicknessMax: 1.0,
  };
  const _ = (key) => t(lang, key);

  if (collapsed) {
    return (
      <aside className="side-panel side-panel--collapsed" style={style}>
        <button className="panel-collapse-btn" onClick={onToggleCollapse} title={lang === 'ko' ? '패널 펼치기' : 'Expand panel'}>
          &gt;
        </button>
      </aside>
    );
  }

  return (
    <aside className="side-panel" style={style}>
      <div className="panel-header">
        <span className="panel-header-title">{lang === 'ko' ? '설정' : 'Settings'}</span>
        <button className="panel-collapse-btn" onClick={onToggleCollapse} title={lang === 'ko' ? '패널 접기' : 'Collapse panel'}>
          &lt;
        </button>
      </div>

      <section className="panel-section">
        <div className="section-title-row">
          <h3 className="section-title">{_('options3D')}</h3>
          <button
            className="btn btn-sm btn-reset"
            onClick={onResetWallSettings}
            title={lang === 'ko' ? '3D 옵션 초기화' : 'Reset 3D defaults'}
          >
            {lang === 'ko' ? '초기화' : 'Reset'}
          </button>
        </div>

        <SliderRow label={_('wallHeight')} val={`${settings.wallHeight.toFixed(1)}m`}
          min={ranges.wallHeightMin} max={ranges.wallHeightMax} step={0.1}
          value={Math.min(Math.max(settings.wallHeight, ranges.wallHeightMin), ranges.wallHeightMax)}
          onChange={(v) => onSettingChange('wallHeight', parseFloat(v))} />

        <SliderRow
          label={_('wallThickness')}
          val={mode === 'model'
            ? (lang === 'ko' ? '3D 모델 미지원' : 'N/A for 3D')
            : `${(settings.wallThickness * 100).toFixed(0)}cm`}
          min={ranges.wallThicknessMin} max={ranges.wallThicknessMax} step={0.01}
          value={Math.min(Math.max(settings.wallThickness, ranges.wallThicknessMin), ranges.wallThicknessMax)}
          onChange={(v) => onSettingChange('wallThickness', parseFloat(v))}
          disabled={mode === 'model'} />

        <ToggleRow label={_('floor')}     checked={settings.showFloor}   onChange={(v) => onSettingChange('showFloor', v)} />
        <ToggleRow label={_('ceiling')}   checked={settings.showCeiling} onChange={(v) => onSettingChange('showCeiling', v)} />
        <ToggleRow label={_('wireframe')} checked={settings.wireframe}   onChange={(v) => onSettingChange('wireframe', v)} />
      </section>

      {mode === 'image' && (
        <section className="panel-section">
          <div className="section-title-row">
            <h3 className="section-title">{_('imageAnalysis')}</h3>
            <button
              className="btn btn-sm btn-reset"
              onClick={onResetImageSettings}
              title={_('resetImageDefaults')}
            >
              {_('resetImageDefaults')}
            </button>
          </div>

          <SliderRow label={_('imageScale')} val={`${settings.pixelsPerMeter}px/m`}
            min={20} max={500} step={10} value={settings.pixelsPerMeter}
            onChange={(v) => onSettingChange('pixelsPerMeter', parseInt(v))} />

          <SliderRow label={_('edgeSensitivity')} val={`${(settings.edgeThreshold * 100).toFixed(0)}%`}
            min={0.05} max={0.4} step={0.01} value={settings.edgeThreshold}
            onChange={(v) => onSettingChange('edgeThreshold', parseFloat(v))} />

          <SliderRow label={_('noiseRemoval')} val={`${settings.minNeighbors ?? 4}`}
            min={0} max={12} step={1} value={settings.minNeighbors ?? 4}
            onChange={(v) => onSettingChange('minNeighbors', parseInt(v))} />

          <ToggleRow label={_('imageAsFloor')} checked={settings.imageAsFloor}
            onChange={(v) => onSettingChange('imageAsFloor', v)} />

          <button
            className="btn btn-primary btn-block"
            onClick={onDetectWalls}
            title={_('detectWallsTip')}
            disabled={detectProgress !== null && detectProgress < 1}
          >
            {detectProgress !== null && detectProgress < 1
              ? `${_('detecting')}… ${Math.round(detectProgress * 100)}%`
              : _('detectWalls')}
          </button>

          {detectProgress !== null && detectProgress < 1 && (
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${detectProgress * 100}%` }} />
            </div>
          )}

          {originalPreviewUrl && (
            <div className="edge-preview">
              <p className="preview-label">
                {lang === 'ko' ? '① 원본' : '① Original'}
              </p>
              <img src={originalPreviewUrl} alt="original" />
            </div>
          )}
          {edgePreviewUrl && (
            <div className="edge-preview">
              <p className="preview-label">
                {lang === 'ko' ? '② 엣지 검출' : '② Edge Detection'}
              </p>
              <img src={edgePreviewUrl} alt="edge detection" />
            </div>
          )}
          {denoisedEdgePreviewUrl && (
            <div className="edge-preview">
              <p className="preview-label">
                {lang === 'ko' ? '③ 노이즈 제거' : '③ Noise Removal'}
              </p>
              <img src={denoisedEdgePreviewUrl} alt="denoised edges" />
            </div>
          )}
        </section>
      )}

      {(mode === 'dxf' || mode === 'ifc') && layers.length > 0 && (
        <section className="panel-section">
          <h3 className="section-title">
            {_('layers')}
            <span className="layer-count">{activeLayers.size}/{layers.length}</span>
          </h3>
          <button className="btn btn-sm" onClick={() => {
            const allOn = activeLayers.size === layers.length;
            layers.forEach((l) => onToggleLayer(l, !allOn));
          }}>
            {activeLayers.size === layers.length ? _('allOff') : _('allOn')}
          </button>
          <ul className="layer-list">
            {layers.map((layer) => (
              <li key={layer} className="layer-item">
                <label>
                  <input type="checkbox" checked={activeLayers.has(layer)}
                    onChange={(e) => onToggleLayer(layer, e.target.checked)} />
                  <span className="layer-dot" />
                  <span className="layer-name" title={layer}>{layer}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}

function SliderRow({ label, val, min, max, step, value, onChange, disabled }) {
  return (
    <label className="setting-row" style={disabled ? { opacity: 0.45, pointerEvents: 'none' } : {}}>
      <span>{label}</span>
      <div className="range-row">
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(e.target.value)} disabled={disabled} />
        <span className="range-val">{val}</span>
      </div>
    </label>
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
