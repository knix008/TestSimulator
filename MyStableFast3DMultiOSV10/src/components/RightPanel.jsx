import React from 'react';
import { useTranslation } from 'react-i18next';
import Panel from './Panel.jsx';
import { Section, Check, SelectField, RangeField, NumberField, ColorField, Vec3Field, Seg } from './Form.jsx';
import {
  IconSettings, IconWand, IconGrid, IconBulb, IconPalette, IconCube, IconCamera, IconPlus, IconTrash,
  IconRefresh, IconEye, IconFit,
} from './Icons.jsx';
import { DEFAULT_LIGHTS, DEFAULT_VIEW } from '../lib/settings.js';
import { MOVABLE, VIEW_PRESETS, rulerText } from '../lib/viewer3d.js';
import { formatDuration, openExternal } from '../lib/platform.js';

export const RIGHT_TABS = [
  { id: 'convert', icon: IconWand },
  { id: 'scene', icon: IconGrid },
  { id: 'lights', icon: IconBulb },
  { id: 'material', icon: IconPalette },
  { id: 'model', icon: IconCube },
  { id: 'camera', icon: IconCamera },
];

function Row({ label, value }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="info-row">
      <dt>{label}</dt>
      <dd title={String(value)}>{String(value)}</dd>
    </div>
  );
}

const fmtInt = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString() : '—');

// ── Convert ───────────────────────────────────────────────
function ConvertTab({ settings, onSettings, models, health, lastJob, onDevice, t, lang }) {
  const model = models.find((m) => m.id === settings.model);
  const values = settings.convertOptions?.[settings.model] || {};
  const setOpt = (key, value) => onSettings((s) => ({
    ...s,
    convertOptions: { ...s.convertOptions, [s.model]: { ...(s.convertOptions?.[s.model] || {}), [key]: value } },
  }));
  const optValue = (o) => (values[o.key] !== undefined ? values[o.key] : o.default);
  const common = [
    { key: 'removeBackground', type: 'bool', default: true },
    { key: 'foregroundRatio', type: 'number', default: 0.85, min: 0.5, max: 1, step: 0.05 },
  ];
  const remeshOk = health?.loaded !== 'sf3d' || health?.capabilities?.remesh;
  const stability = settings.backend === 'stability';

  const renderOption = (o) => {
    const label = t(`opt.${o.key}`, o.key);
    const tip = t(`optTip.${o.key}`, '');
    if (o.type === 'bool') {
      return <Check key={o.key} label={label} tip={tip} checked={optValue(o)} onChange={(v) => setOpt(o.key, v)} />;
    }
    if (o.type === 'select') {
      return (
        <SelectField
          key={o.key}
          label={label}
          tip={tip}
          value={optValue(o)}
          disabled={o.needs === 'remesh' && !remeshOk}
          options={o.choices.map((c) => ({
            value: c.value,
            label: c.value === 'auto' && o.deviceDefault
              ? t('opt.auto', { gpu: o.deviceDefault.gpu, cpu: o.deviceDefault.cpu })
              : t(`opt.${o.key}Choice.${c.value}`, String(c.value)),
          }))}
          onChange={(v) => setOpt(o.key, v)}
        />
      );
    }
    if (o.allowOff !== undefined) {
      const off = Number(optValue(o)) === o.allowOff;
      return (
        <div key={o.key}>
          <Check label={label} tip={tip} checked={!off} onChange={(on) => setOpt(o.key, on ? 10000 : o.allowOff)} />
          {off ? null : (
            <NumberField label={t('opt.target')} value={optValue(o)} min={o.min} max={o.max} step={o.step} onChange={(v) => setOpt(o.key, v)} />
          )}
        </div>
      );
    }
    return (
      <RangeField key={o.key} label={label} tip={tip} value={Number(optValue(o))} min={o.min} max={o.max} step={o.step} onChange={(v) => setOpt(o.key, v)} />
    );
  };

  const dev = health?.device || {};
  return (
    <div className="info-body">
      <Section title={t('right.model')}>
        {stability ? (
          <p className="panel-note warn">{t('right.stabilityActive')}</p>
        ) : (
          <>
            <SelectField
              label={t('right.modelPick')}
              value={settings.model}
              options={(models.length ? models : [{ id: settings.model, name: settings.model }]).map((m) => ({ value: m.id, label: m.name }))}
              onChange={(id) => onSettings((s) => ({ ...s, model: id }))}
            />
            {model ? (
              <>
                <p className="panel-note">{model.summary?.[lang] || model.summary?.en}</p>
                <dl className="info-dl">
                  <Row label={t('right.status')} value={t(`model.status.${model.status}`, model.status)} />
                  <Row label={t('right.license')} value={model.license} />
                  <Row label={t('right.size')} value={model.size} />
                  <Row label={t('right.output')} value={model.textured ? t('right.textured') : t('right.vertexColors')} />
                </dl>
                <div className="panel-links">
                  <button className="linkish" onClick={() => openExternal(model.page)}>{t('right.modelPage')}</button>
                  {model.licenseUrl ? <button className="linkish" onClick={() => openExternal(model.licenseUrl)}>{t('right.licenseText')}</button> : null}
                </div>
                {model.error ? <p className="panel-note error">{model.error}</p> : null}
              </>
            ) : null}
          </>
        )}
      </Section>

      <Section title={t('right.options')}>
        {common.map(renderOption)}
        {(model?.options || []).map(renderOption)}
        <button
          className="btn small"
          onClick={() => onSettings((s) => ({ ...s, convertOptions: { ...s.convertOptions, [s.model]: {} } }))}
          title={t('right.resetOptions')}
        >
          <IconRefresh size={14} /> {t('right.resetOptions')}
        </button>
      </Section>

      <Section title={t('right.device')}>
        <Seg
          value={settings.device}
          options={['auto', 'gpu', 'cpu'].map((id) => ({ value: id, label: t(`device.${id}`), tip: t(`deviceTip.${id}`) }))}
          onChange={(id) => onDevice(id)}
        />
        <dl className="info-dl">
          <Row label={t('right.deviceNow')} value={dev.name || (health ? t('right.deviceNone') : '—')} />
          <Row label={t('right.gpu')} value={dev.gpu || t('right.noGpu')} />
          <Row label="PyTorch" value={health?.torch ? `${health.torch} (${health.build})` : ''} />
        </dl>
      </Section>

      {lastJob ? (
        <Section title={t('right.lastResult')}>
          <dl className="info-dl">
            <Row label={t('right.modelUsed')} value={lastJob.modelName} />
            <Row label={t('right.deviceUsed')} value={`${lastJob.deviceName || ''}${lastJob.fallback ? ` (${t('right.fallback')})` : ''}`} />
            <Row label={t('right.time')} value={formatDuration(lastJob.elapsed)} />
            <Row label={t('right.vertices')} value={fmtInt(lastJob.stats?.vertices)} />
            <Row label={t('right.faces')} value={fmtInt(lastJob.stats?.faces)} />
            <Row label={t('right.texture')} value={lastJob.stats?.textureResolution ? `${lastJob.stats.textureResolution} px` : ''} />
            {Object.entries(lastJob.timings || {}).map(([k, sec]) => (
              <Row key={k} label={`· ${t(`stage.${k}`, k)}`} value={formatDuration(sec)} />
            ))}
          </dl>
        </Section>
      ) : null}
    </div>
  );
}

// ── Scene ─────────────────────────────────────────────────
function SceneTab({ view, setView, t }) {
  const unit = view.units === 'none' ? '' : view.units;
  return (
    <div className="info-body">
      <Section title={t('scene.grid')}>
        <Check label={t('scene.showGrid')} checked={view.grid} onChange={(v) => setView({ grid: v })} />
        <SelectField
          label={t('scene.gridSize')}
          value={view.gridSize}
          options={[{ value: 'auto', label: t('scene.auto') }, ...[0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10].map((n) => ({ value: n, label: rulerText(n, unit) }))]}
          onChange={(v) => setView({ gridSize: v === 'auto' ? 'auto' : Number(v) })}
        />
        <RangeField label={t('scene.gridDivisions')} value={view.gridDivisions} min={1} max={10} step={1} onChange={(v) => setView({ gridDivisions: v })} />
        <RangeField label={t('scene.gridOpacity')} value={view.gridOpacity} min={0.1} max={1} step={0.05} onChange={(v) => setView({ gridOpacity: v })} />
        <Check label={t('scene.gridAutoColor')} checked={!view.gridColor} onChange={(v) => setView({ gridColor: v ? '' : '#8c8c8c' })} />
        {view.gridColor ? <ColorField label={t('scene.gridColor')} value={view.gridColor} onChange={(v) => setView({ gridColor: v })} /> : null}
      </Section>

      <Section title={t('scene.axesRulers')}>
        <Check label={t('scene.axes')} checked={view.axes} onChange={(v) => setView({ axes: v })} />
        <Check label={t('scene.negativeAxes')} checked={view.negativeAxes} onChange={(v) => setView({ negativeAxes: v })} />
        <Check label={t('scene.rulers')} checked={view.rulers} onChange={(v) => setView({ rulers: v })} />
        <Check label={t('scene.rulerY')} checked={view.rulerY} onChange={(v) => setView({ rulerY: v })} />
        <RangeField label={t('scene.rulerCells')} value={view.rulerCells} min={1} max={20} step={1} onChange={(v) => setView({ rulerCells: v })} />
        <SelectField
          label={t('scene.units')}
          value={view.units}
          options={['m', 'cm', 'mm', 'in', 'none'].map((u) => ({ value: u, label: t(`unit.${u}`) }))}
          onChange={(v) => setView({ units: v })}
        />
        <ColorField label={t('scene.rulerColor')} value={view.rulerColor} onChange={(v) => setView({ rulerColor: v })} />
        <Check label={t('scene.bbox')} checked={view.boundingBox} onChange={(v) => setView({ boundingBox: v })} />
        <Check label={t('scene.viewCube')} checked={view.viewCube} onChange={(v) => setView({ viewCube: v })} />
      </Section>

      <Section title={t('scene.background')}>
        <SelectField
          label={t('scene.bgMode')}
          value={view.background}
          options={['theme', 'color', 'gradient', 'environment'].map((m) => ({ value: m, label: t(`scene.bg.${m}`) }))}
          onChange={(v) => setView({ background: v })}
        />
        {view.background === 'color' || view.background === 'gradient' ? (
          <ColorField label={view.background === 'gradient' ? t('scene.bgTop') : t('scene.bgColor')} value={view.bgColor} onChange={(v) => setView({ bgColor: v })} />
        ) : null}
        {view.background === 'gradient' ? (
          <ColorField label={t('scene.bgBottom')} value={view.bgColor2} onChange={(v) => setView({ bgColor2: v })} />
        ) : null}
      </Section>

      <Section title={t('scene.rendering')}>
        <Check label={t('scene.environment')} checked={view.environment} onChange={(v) => setView({ environment: v })} />
        <RangeField label={t('scene.envIntensity')} value={view.envIntensity} min={0} max={3} step={0.05} onChange={(v) => setView({ envIntensity: v })} disabled={!view.environment} />
        <SelectField
          label={t('scene.toneMapping')}
          value={view.toneMapping}
          options={['aces', 'agx', 'neutral', 'none'].map((m) => ({ value: m, label: t(`scene.tone.${m}`) }))}
          onChange={(v) => setView({ toneMapping: v })}
        />
        <RangeField label={t('scene.exposure')} value={view.exposure} min={0.1} max={4} step={0.05} onChange={(v) => setView({ exposure: v })} />
        <Check label={t('scene.shadows')} checked={view.shadows} onChange={(v) => setView({ shadows: v })} />
        <RangeField label={t('scene.shadowOpacity')} value={view.shadowOpacity} min={0} max={1} step={0.05} onChange={(v) => setView({ shadowOpacity: v })} disabled={!view.shadows} />
        <button className="btn small" onClick={() => setView({ ...DEFAULT_VIEW, material: view.material, wireframe: view.wireframe })}>
          <IconRefresh size={14} /> {t('scene.reset')}
        </button>
      </Section>
    </div>
  );
}

// ── Lights ────────────────────────────────────────────────
let lightSeq = 0;

function LightsTab({ lights, setLights, selected, onSelect, view, setView, t }) {
  const sel = lights.find((l) => l.id === selected) || null;
  const update = (id, patch) => setLights(lights.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const add = (type) => {
    const id = `${type}-${Date.now().toString(36)}${++lightSeq}`;
    const light = {
      id, type, name: t(`lights.type.${type}`), color: '#ffffff', enabled: true,
      intensity: { directional: 1.5, point: 5, spot: 8, hemisphere: 0.5, ambient: 0.3 }[type],
      position: [2, 3, 2], castShadow: false, distance: 0, angle: 30, penumbra: 0.3, groundColor: '#444444',
    };
    setLights([...lights, light]);
    if (MOVABLE.has(type)) onSelect(id);
  };
  return (
    <div className="info-body">
      <Section title={t('lights.list')}>
        <Check label={t('lights.showHandles')} checked={view.showLightHelpers} onChange={(v) => setView({ showLightHelpers: v })} />
        <p className="panel-note">{t('lights.dragHint')}</p>
        <ul className="light-list">
          {lights.map((l) => (
            <li key={l.id} className={l.id === selected ? 'active' : ''}>
              <input
                type="checkbox"
                checked={l.enabled !== false}
                onChange={(e) => update(l.id, { enabled: e.target.checked })}
                title={t('lights.enabled')}
                aria-label={t('lights.enabled')}
              />
              <button className="light-row" onClick={() => onSelect(l.id === selected ? null : l.id)} title={l.name}>
                <span className="light-swatch" style={{ background: l.color }} />
                <span className="light-name">{l.name}</span>
                <span className="light-type">{t(`lights.type.${l.type}`)}</span>
              </button>
              <button
                className="icon-btn"
                onClick={() => { setLights(lights.filter((x) => x.id !== l.id)); if (l.id === selected) onSelect(null); }}
                title={t('lights.remove')}
                aria-label={t('lights.remove')}
              >
                <IconTrash size={14} />
              </button>
            </li>
          ))}
        </ul>
        <div className="light-add">
          {['directional', 'point', 'spot', 'hemisphere', 'ambient'].map((type) => (
            <button key={type} className="btn small" onClick={() => add(type)} title={t('lights.add', { type: t(`lights.type.${type}`) })}>
              <IconPlus size={13} /> {t(`lights.type.${type}`)}
            </button>
          ))}
        </div>
        <button className="btn small" onClick={() => { setLights(DEFAULT_LIGHTS.map((l) => ({ ...l }))); onSelect(null); }}>
          <IconRefresh size={14} /> {t('lights.reset')}
        </button>
      </Section>

      {sel ? (
        <Section title={t('lights.edit', { name: sel.name })}>
          <label className="field">
            <span className="field-label">{t('lights.name')}</span>
            <input className="input" value={sel.name} onChange={(e) => update(sel.id, { name: e.target.value })} />
          </label>
          <ColorField label={t('lights.color')} value={sel.color} onChange={(v) => update(sel.id, { color: v })} />
          <RangeField label={t('lights.intensity')} value={sel.intensity} min={0} max={sel.type === 'point' || sel.type === 'spot' ? 50 : 10} step={0.05} onChange={(v) => update(sel.id, { intensity: v })} />
          {MOVABLE.has(sel.type) ? (
            <>
              <Vec3Field label={t('lights.position')} value={sel.position} onChange={(v) => update(sel.id, { position: v })} />
              <Check label={t('lights.castShadow')} checked={sel.castShadow} onChange={(v) => update(sel.id, { castShadow: v })} />
            </>
          ) : null}
          {sel.type === 'hemisphere' ? (
            <ColorField label={t('lights.groundColor')} value={sel.groundColor || '#444444'} onChange={(v) => update(sel.id, { groundColor: v })} />
          ) : null}
          {sel.type === 'spot' ? (
            <>
              <RangeField label={t('lights.angle')} value={sel.angle || 30} min={5} max={85} step={1} onChange={(v) => update(sel.id, { angle: v })} />
              <RangeField label={t('lights.penumbra')} value={sel.penumbra ?? 0.3} min={0} max={1} step={0.05} onChange={(v) => update(sel.id, { penumbra: v })} />
            </>
          ) : null}
          {sel.type === 'point' || sel.type === 'spot' ? (
            <NumberField label={t('lights.distance')} value={sel.distance || 0} min={0} step={0.5} onChange={(v) => update(sel.id, { distance: v })} />
          ) : null}
        </Section>
      ) : (
        <p className="panel-note">{t('lights.pick')}</p>
      )}
    </div>
  );
}

// ── Material ──────────────────────────────────────────────
function MaterialTab({ view, setView, t }) {
  return (
    <div className="info-body">
      <Section title={t('material.mode')}>
        <Seg
          value={view.material}
          options={['original', 'clay', 'normal', 'vertex'].map((m) => ({ value: m, label: t(`material.${m}`), tip: t(`materialTip.${m}`) }))}
          onChange={(v) => setView({ material: v })}
        />
        {view.material === 'clay' ? <ColorField label={t('material.clayColor')} value={view.clayColor} onChange={(v) => setView({ clayColor: v })} /> : null}
      </Section>
      <Section title={t('material.display')}>
        <Check label={t('material.wireframe')} checked={view.wireframe} onChange={(v) => setView({ wireframe: v })} />
        <Check label={t('material.flatShading')} checked={view.flatShading} onChange={(v) => setView({ flatShading: v })} />
        <Check label={t('material.doubleSided')} checked={view.doubleSided} onChange={(v) => setView({ doubleSided: v })} />
      </Section>
    </div>
  );
}

// ── Model ─────────────────────────────────────────────────
function ModelTab({ info, transform, onTransform, view, t }) {
  if (!info) return <div className="info-body"><p className="panel-note">{t('modelTab.none')}</p></div>;
  const s = info.stats || {};
  const unit = view.units === 'none' ? '' : view.units;
  return (
    <div className="info-body">
      <Section title={t('modelTab.source')}>
        <dl className="info-dl">
          <Row label={t('modelTab.name')} value={info.name} />
          <Row label={t('modelTab.format')} value={info.format} />
          <Row label={t('modelTab.path')} value={info.path} />
          <Row label={t('modelTab.from')} value={info.fromImage} />
        </dl>
      </Section>
      <Section title={t('modelTab.stats')}>
        <dl className="info-dl">
          <Row label={t('modelTab.meshes')} value={fmtInt(s.meshes)} />
          <Row label={t('right.vertices')} value={fmtInt(s.vertices)} />
          <Row label={t('modelTab.triangles')} value={fmtInt(s.triangles)} />
          {s.points ? <Row label={t('modelTab.points')} value={fmtInt(s.points)} /> : null}
          <Row label={t('modelTab.materials')} value={fmtInt(s.materials)} />
          <Row label={t('modelTab.textures')} value={fmtInt(s.textures)} />
          <Row label={t('modelTab.size')} value={(s.size || []).map((n) => rulerText(n * (transform.scale || 1), unit)).join(' × ')} />
        </dl>
      </Section>
      <Section title={t('modelTab.transform')}>
        <Vec3Field label={t('modelTab.rotation')} step={15} value={transform.rotation} onChange={(v) => onTransform({ ...transform, rotation: v })} />
        <NumberField label={t('modelTab.scale')} value={transform.scale} min={0.0001} step={0.1} onChange={(v) => onTransform({ ...transform, scale: v })} />
        <div className="row">
          <button className="btn small" onClick={() => onTransform({ ...transform, rotation: [transform.rotation[0] - 90, transform.rotation[1], transform.rotation[2]] })}>X −90°</button>
          <button className="btn small" onClick={() => onTransform({ ...transform, rotation: [transform.rotation[0] + 90, transform.rotation[1], transform.rotation[2]] })}>X +90°</button>
          <button className="btn small" onClick={() => onTransform({ ...transform, rotation: [transform.rotation[0], transform.rotation[1] + 90, transform.rotation[2]] })}>Y +90°</button>
        </div>
        <button className="btn small" onClick={() => onTransform({ rotation: [0, 0, 0], scale: 1 })}>
          <IconRefresh size={14} /> {t('modelTab.resetTransform')}
        </button>
        <p className="panel-note">{t('modelTab.transformNote')}</p>
      </Section>
    </div>
  );
}

// ── Camera ────────────────────────────────────────────────
function CameraTab({ view, setView, onView, onFit, t }) {
  return (
    <div className="info-body">
      <Section title={t('camera.views')}>
        <div className="view-grid">
          {Object.keys(VIEW_PRESETS).map((name) => (
            <button key={name} className="btn small" onClick={() => onView(name)} title={t(`view.${name}`)}>
              <IconEye size={13} /> {t(`view.${name}`)}
            </button>
          ))}
        </div>
        <button className="btn small" onClick={onFit}><IconFit size={14} /> {t('toolbar.fit')}</button>
      </Section>
      <Section title={t('camera.lens')}>
        <RangeField label={t('camera.fov')} value={view.fov} min={15} max={100} step={1} format={(v) => `${v}°`} onChange={(v) => setView({ fov: v })} />
      </Section>
      <Section title={t('camera.motion')}>
        <Check label={t('camera.autoRotate')} checked={view.autoRotate} onChange={(v) => setView({ autoRotate: v })} />
        <RangeField label={t('camera.speed')} value={view.autoRotateSpeed} min={0.2} max={20} step={0.1} onChange={(v) => setView({ autoRotateSpeed: v })} disabled={!view.autoRotate} />
        <p className="panel-note">{t('camera.mouseHelp')}</p>
      </Section>
    </div>
  );
}

export default function RightPanel({
  settings, onSettings, models, health, lastJob, onDevice, modelInfo, transform, onTransform,
  selectedLight, onSelectLight, onView, onFit,
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('en') ? 'en' : 'ko';
  const tab = settings.rightTab;
  const view = settings.view;
  const setView = (patch) => onSettings((s) => ({ ...s, view: { ...s.view, ...patch } }));
  const setLights = (lights) => onSettings((s) => ({ ...s, lights }));

  return (
    <Panel
      side="right"
      open={settings.rightPanel}
      width={settings.rightPanelWidth}
      onResize={(w) => onSettings((s) => ({ ...s, rightPanelWidth: w }))}
      onOpen={() => onSettings((s) => ({ ...s, rightPanel: true }))}
      onClose={() => onSettings((s) => ({ ...s, rightPanel: false }))}
      icon={IconSettings}
      title={t('right.title')}
      expandLabel={t('right.expand')}
      collapseLabel={t('right.collapse')}
    >
      <div className="panel-tabs" role="tablist">
        {RIGHT_TABS.map(({ id, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={`panel-tab${tab === id ? ' active' : ''}`}
            onClick={() => onSettings((s) => ({ ...s, rightTab: id }))}
            title={t(`right.tab.${id}`)}
          >
            <Icon size={16} />
            <span>{t(`right.tab.${id}`)}</span>
          </button>
        ))}
      </div>
      <div className="panel-scroll">
        {tab === 'convert' ? <ConvertTab settings={settings} onSettings={onSettings} models={models} health={health} lastJob={lastJob} onDevice={onDevice} t={t} lang={lang} /> : null}
        {tab === 'scene' ? <SceneTab view={view} setView={setView} t={t} /> : null}
        {tab === 'lights' ? (
          <LightsTab lights={settings.lights} setLights={setLights} selected={selectedLight} onSelect={onSelectLight} view={view} setView={setView} t={t} />
        ) : null}
        {tab === 'material' ? <MaterialTab view={view} setView={setView} t={t} /> : null}
        {tab === 'model' ? <ModelTab info={modelInfo} transform={transform} onTransform={onTransform} view={view} t={t} /> : null}
        {tab === 'camera' ? <CameraTab view={view} setView={setView} onView={onView} onFit={onFit} t={t} /> : null}
      </div>
    </Panel>
  );
}
