// Right panel: the selected object's properties and effects, arrangement, and the icon's
// background and export settings.
import React from 'react';
import { t } from '../i18n.js';
import { BOX_TYPES, DEFAULT_SIZES, FONTS, ICO_SIZES, bbox } from '../lib/iconCanvas.js';
import { Btn, Card, ColorField, IconSelect, Segmented, Slider, Stepper, Toggle } from './controls.jsx';
import { objectName } from './LeftPanel.jsx';

const r1 = (v) => Math.round(v * 10) / 10;

function FillControls({ o, set, setKeyed }) {
  return (
    <>
      <Toggle icon="fill" label={t('props.fill')} checked={o.hasFill} onChange={(v) => set({ hasFill: v })} />
      {o.hasFill && (
        <>
          <Segmented label={t('props.fillType')} value={o.fillType ?? 'solid'} onChange={(v) => set({ fillType: v })} options={[
            { value: 'solid', icon: 'fill', label: t('props.solid') },
            { value: 'linear', icon: 'gradient', label: t('props.linear') },
            { value: 'radial', icon: 'gloss', label: t('props.radial') },
          ]} />
          <ColorField label={t('props.fill')} value={o.fill} onChange={(c) => setKeyed({ fill: c }, 'fill')} />
          {o.fillType && o.fillType !== 'solid' && (
            <>
              <div className="sub-label">{t('props.fill2')}</div>
              <ColorField label={t('props.fill2')} value={o.fill2} onChange={(c) => setKeyed({ fill2: c }, 'fill2')} swatches={false} />
              {o.fillType === 'linear' && <Slider icon="rotate" label={t('props.gradAngle')} value={o.gradAngle ?? 90} min={0} max={359} unit="°" onChange={(v) => setKeyed({ gradAngle: v }, 'gradAngle')} />}
            </>
          )}
        </>
      )}
    </>
  );
}

function StrokeControls({ o, set, setKeyed }) {
  return (
    <>
      <Toggle icon="stroke" label={t('props.stroke')} checked={o.hasStroke} onChange={(v) => set({ hasStroke: v })} />
      {o.hasStroke && (
        <>
          <ColorField label={t('props.stroke')} value={o.stroke} onChange={(c) => setKeyed({ stroke: c }, 'stroke')} />
          <Slider icon="line" label={t('props.strokeWidth')} value={o.strokeWidth} min={1} max={80} unit="px" onChange={(v) => setKeyed({ strokeWidth: v }, 'strokeWidth')} />
          <Segmented label={t('props.dash')} value={o.dash ?? 'solid'} onChange={(v) => set({ dash: v })} options={[
            { value: 'solid', icon: 'line', label: t('props.dashSolid') },
            { value: 'dash', icon: 'dash', label: t('props.dashDash') },
            { value: 'dot', icon: 'moveHandle', label: t('props.dashDot') },
          ]} />
        </>
      )}
    </>
  );
}

function Geometry({ o, onBox }) {
  const b = bbox(o);
  const row = (icon, label, value, key) => (
    <div className="kv-row">
      <span className="ctrl-label"><span>{label}</span></span>
      <Stepper label={label} value={r1(value)} step={1} min={key === 'w' || key === 'h' ? 1 : -2048} max={4096} unit="px" onChange={(v) => onBox({ ...b, [key]: v })} />
    </div>
  );
  return (
    <div className="geometry">
      {row('position', 'X', b.x, 'x')}
      {row('position', 'Y', b.y, 'y')}
      {row('size', t('props.width'), b.w, 'w')}
      {row('size', t('props.height'), b.h, 'h')}
    </div>
  );
}

export default function RightPanel({ sel, update, updateFx, onBox, style, setStyle, design, setDesign, onAction, onExport, exporting }) {
  const fx = sel?.fx ?? {};
  const set = (patch) => update(patch);
  const setKeyed = (patch, key) => update(patch, key);
  const fxSet = (patch, key) => updateFx(patch, key);
  const sizes = design.sizes ?? [];
  const toggleSize = (s) => setDesign({ sizes: sizes.includes(s) ? sizes.filter((x) => x !== s) : [...sizes, s].sort((a, b) => a - b) });
  const transparent = !design.background || design.background === 'transparent';

  return (
    <div className="side-scroll">
      <Card icon="design" title={sel ? `${t('panel.properties')} · ${objectName(sel)}` : t('panel.newStyle')} testId="props-card">
        {!sel && (
          <>
            <p className="hint">{t('props.noneHint')}</p>
            <div className="sub-label">{t('props.fill')}</div>
            <ColorField label={t('props.fill')} value={style.fill} onChange={(c) => setStyle({ fill: c })} />
            <div className="sub-label">{t('props.fill2')}</div>
            <ColorField label={t('props.fill2')} value={style.fill2} onChange={(c) => setStyle({ fill2: c })} swatches={false} />
            <div className="sub-label">{t('props.stroke')}</div>
            <ColorField label={t('props.stroke')} value={style.stroke} onChange={(c) => setStyle({ stroke: c })} swatches={false} />
            <Slider icon="line" label={t('props.strokeWidth')} value={style.strokeWidth} min={1} max={80} unit="px" onChange={(v) => setStyle({ strokeWidth: v })} />
          </>
        )}
        {sel && (
          <>
            {sel.type !== 'image' && sel.type !== 'emoji' && sel.type !== 'line' && sel.type !== 'pen' && <FillControls o={sel} set={set} setKeyed={setKeyed} />}
            {sel.type !== 'image' && sel.type !== 'emoji' && <StrokeControls o={sel} set={set} setKeyed={setKeyed} />}
            {sel.type === 'rect' && <Slider icon="corner" label={t('props.corner')} value={sel.rx || 0} min={0} max={256} unit="px" onChange={(v) => setKeyed({ rx: v }, 'rx')} />}
            {sel.type === 'line' && (
              <div className="btn-grid two">
                <Toggle icon="arrowLine" label={t('props.arrowEnd')} checked={!!sel.arrowEnd} onChange={(v) => set({ arrowEnd: v })} />
                <Toggle icon="arrowLine" label={t('props.arrowStart')} checked={!!sel.arrowStart} onChange={(v) => set({ arrowStart: v })} />
              </div>
            )}
            {sel.type === 'poly' && <Toggle icon="poly" label={t('props.closed')} checked={!!sel.closed} onChange={(v) => set({ closed: v })} />}
            {sel.type === 'text' && (
              <>
                <label className="ctrl">
                  <span className="ctrl-label"><span>{t('props.text')}</span></span>
                  <input className="text-input" value={sel.text} onChange={(e) => setKeyed({ text: e.target.value, w: Math.max(40, e.target.value.length * (sel.fontSize || 96) * 0.62) }, 'text')} aria-label={t('props.text')} />
                </label>
                <div className="kv-row">
                  <span className="ctrl-label"><span>{t('props.font')}</span></span>
                  <IconSelect label={t('props.font')} value={sel.fontFamily ?? 'Segoe UI'} onChange={(v) => set({ fontFamily: v })} options={FONTS.map((f) => ({ value: f, label: f, icon: 'font' }))} />
                </div>
                <Slider icon="font" label={t('props.fontSize')} value={sel.fontSize} min={8} max={480} unit="px" onChange={(v) => setKeyed({ fontSize: v, h: Math.round(v * 1.2) }, 'fontSize')} />
                <div className="btn-grid two">
                  <Toggle icon="font" label={t('props.bold')} checked={(sel.fontWeight ?? 700) >= 700} onChange={(v) => set({ fontWeight: v ? 700 : 400 })} />
                  <Toggle icon="font" label={t('props.italic')} checked={!!sel.italic} onChange={(v) => set({ italic: v })} />
                </div>
              </>
            )}
            <Slider icon="opacity" label={t('props.opacity')} value={Math.round((sel.opacity ?? 1) * 100)} min={0} max={100} unit="%" onChange={(v) => setKeyed({ opacity: v / 100 }, 'opacity')} />
            <Slider icon="rotate" label={t('props.rotate')} value={sel.rotate || 0} min={0} max={359} unit="°" onChange={(v) => setKeyed({ rotate: v }, 'rotate')} />
            {(BOX_TYPES.includes(sel.type) || sel.type === 'pen' || sel.type === 'poly' || sel.type === 'line') && <Geometry o={sel} onBox={onBox} />}
          </>
        )}
      </Card>

      {sel && (
        <Card icon="fx" title={t('panel.effects')} testId="fx-card">
          <Toggle icon="cube" label={t('fx.threeD')} checked={!!fx.threeD} onChange={(v) => fxSet({ threeD: v })} />
          {fx.threeD && (
            <>
              <Slider label={t('fx.depth')} value={fx.depth} min={1} max={24} onChange={(v) => fxSet({ depth: v }, 'depth')} />
              <Slider label={t('fx.lightX')} value={fx.lightX} min={0} max={512} onChange={(v) => fxSet({ lightX: v }, 'lightX')} />
              <Slider label={t('fx.lightY')} value={fx.lightY} min={0} max={512} onChange={(v) => fxSet({ lightY: v }, 'lightY')} />
            </>
          )}
          <Toggle icon="gloss" label={t('fx.gloss')} checked={!!fx.gloss} onChange={(v) => fxSet({ gloss: v })} />
          {fx.gloss && <Slider label={t('fx.glossOpacity')} value={Math.round((fx.glossOpacity ?? 0.55) * 100)} min={5} max={100} unit="%" onChange={(v) => fxSet({ glossOpacity: v / 100 }, 'gloss')} />}
          <Toggle icon="shadow" label={t('fx.shadow')} checked={!!fx.shadow} onChange={(v) => fxSet({ shadow: v })} />
          {fx.shadow && (
            <>
              <Slider label={t('fx.shadowDx')} value={fx.shadowDx} min={-60} max={60} onChange={(v) => fxSet({ shadowDx: v }, 'sdx')} />
              <Slider label={t('fx.shadowDy')} value={fx.shadowDy} min={-60} max={60} onChange={(v) => fxSet({ shadowDy: v }, 'sdy')} />
              <Slider label={t('fx.shadowBlur')} value={fx.shadowBlur} min={0} max={50} onChange={(v) => fxSet({ shadowBlur: v }, 'sblur')} />
              <Slider label={t('fx.shadowOpacity')} value={Math.round((fx.shadowOpacity ?? 0.45) * 100)} min={0} max={100} unit="%" onChange={(v) => fxSet({ shadowOpacity: v / 100 }, 'sop')} />
              <ColorField label={t('fx.shadowColor')} value={fx.shadowColor} onChange={(c) => fxSet({ shadowColor: c }, 'scolor')} swatches={false} />
            </>
          )}
          <Toggle icon="glow" label={t('fx.glow')} checked={!!fx.glow} onChange={(v) => fxSet({ glow: v })} />
          {fx.glow && (
            <>
              <Slider label={t('fx.glowSize')} value={fx.glowSize} min={1} max={40} onChange={(v) => fxSet({ glowSize: v }, 'glowSize')} />
              <ColorField label={t('fx.glowColor')} value={fx.glowColor} onChange={(c) => fxSet({ glowColor: c }, 'glowColor')} swatches={false} />
            </>
          )}
          <Slider icon="blur" label={t('fx.blur')} value={fx.blur ?? 0} min={0} max={30} onChange={(v) => fxSet({ blur: v }, 'blur')} />
        </Card>
      )}

      {sel && (
        <Card icon="arrange" title={t('panel.arrange')} testId="arrange-card">
          <div className="btn-grid three">
            {[['alignLeft', 'left'], ['alignHCenter', 'hcenter'], ['alignRight', 'right'], ['alignTop', 'top'], ['alignVCenter', 'vcenter'], ['alignBottom', 'bottom']].map(([icon, how]) => (
              <Btn key={how} icon={icon} label={t(`align.${how}`)} onClick={() => onAction('align', how)} />
            ))}
          </div>
          <div className="btn-grid two">
            <Btn icon="flipH" label={t('arrange.flipH')} onClick={() => onAction('flipH')} />
            <Btn icon="flipV" label={t('arrange.flipV')} onClick={() => onAction('flipV')} />
            <Btn icon="rotateLeft" label={t('arrange.rotateLeft')} onClick={() => onAction('rotate', -90)} />
            <Btn icon="rotateRight" label={t('arrange.rotateRight')} onClick={() => onAction('rotate', 90)} />
            <Btn icon="bringFront" label={t('arrange.front')} onClick={() => onAction('order', 'front')} />
            <Btn icon="sendBack" label={t('arrange.back')} onClick={() => onAction('order', 'back')} />
            <Btn icon="forward" label={t('arrange.forward')} onClick={() => onAction('order', 'up')} />
            <Btn icon="backward" label={t('arrange.backward')} onClick={() => onAction('order', 'down')} />
            <Btn icon="center" label={t('arrange.center')} onClick={() => onAction('center')} />
            <Btn icon="size" label={t('arrange.fill')} onClick={() => onAction('fillCanvas')} />
            <Btn icon="duplicate" label={t('edit.duplicate')} onClick={() => onAction('duplicate')} />
            <Btn icon="trash" label={t('edit.delete')} danger onClick={() => onAction('delete')} />
          </div>
        </Card>
      )}

      <Card icon="image" title={t('panel.background')} testId="background-card">
        <Toggle icon="checker" label={t('bg.transparent')} checked={transparent} onChange={(v) => setDesign({ background: v ? 'transparent' : '#ffffff' })} />
        {!transparent && (
          <>
            <ColorField label={t('bg.color')} value={design.background} onChange={(c) => setDesign({ background: c }, 'bg')} />
            <Toggle icon="gradient" label={t('bg.gradient')} checked={!!design.bgGradient} onChange={(v) => setDesign({ bgGradient: v })} />
            {design.bgGradient && <ColorField label={t('bg.color2')} value={design.background2} onChange={(c) => setDesign({ background2: c }, 'bg2')} swatches={false} />}
            <Segmented label={t('bg.shape')} value={design.bgShape ?? 'square'} onChange={(v) => setDesign({ bgShape: v })} options={[
              { value: 'square', icon: 'roundRect', label: t('bg.square') },
              { value: 'circle', icon: 'ellipse', label: t('bg.circle') },
            ]} />
            <Slider icon="fit" label={t('bg.margin')} value={design.bgPad ?? 0} min={0} max={45} unit="%" onChange={(v) => setDesign({ bgPad: v }, 'bgPad')} />
            {design.bgShape !== 'circle' && <Slider icon="corner" label={t('bg.radius')} value={design.bgRadius ?? 0} min={0} max={50} unit="%" onChange={(v) => setDesign({ bgRadius: v }, 'bgRadius')} />}
          </>
        )}
        <Slider icon="opacity" label={t('bg.opacity')} value={design.exportOpacity ?? 100} min={0} max={100} unit="%" onChange={(v) => setDesign({ exportOpacity: v }, 'opacity')} />
      </Card>

      <Card icon="export" title={t('panel.export')} testId="export-card">
        <div className="sub-label with-action">
          <span>{t('export.sizes')}</span>
          <Btn icon="refresh" label={t('export.defaultSizes')} className="small" onClick={() => setDesign({ sizes: [...DEFAULT_SIZES] })} />
        </div>
        <div className="size-grid">
          {ICO_SIZES.map((s) => (
            <button key={s} type="button" className={`size-chip ${sizes.includes(s) ? 'active' : ''}`} aria-pressed={sizes.includes(s)} onClick={() => toggleSize(s)}>
              <span className="chip-box" aria-hidden="true">{sizes.includes(s) ? '✓' : ''}</span>{s}
            </button>
          ))}
        </div>
        <Toggle icon="exportEach" label={t('export.perSize')} checked={!!design.perSize} onChange={(v) => setDesign({ perSize: v })} />
        <div className="btn-grid two export-buttons">
          <Btn icon="exportIco" label={t('export.ico')} primary disabled={exporting} onClick={() => onExport('ico')} data-testid="export-ico" />
          <Btn icon="exportPng" label={t('export.png')} disabled={exporting} onClick={() => onExport('png')} />
          <Btn icon="exportIcns" label={t('export.icns')} disabled={exporting} onClick={() => onExport('icns')} />
          <Btn icon="exportSvg" label={t('export.svg')} disabled={exporting} onClick={() => onExport('svg')} />
          <Btn icon="print" label={t('action.print')} onClick={() => onAction('print')} />
          <Btn icon="save" label={t('action.save')} onClick={() => onAction('save')} />
        </div>
        <p className="hint">{design.perSize ? t('export.noteEach', { n: sizes.length }) : t('export.noteCombined', { n: sizes.length })}</p>
      </Card>
    </div>
  );
}
