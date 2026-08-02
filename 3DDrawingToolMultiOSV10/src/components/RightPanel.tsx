import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import type { SceneObject, Vec3 } from '../types';

const COLOR_PRESETS = [
  '#4f8cff',
  '#ff6b6b',
  '#51cf66',
  '#fcc419',
  '#cc5de8',
  '#22b8cf',
  '#ff922b',
  '#ffffff',
  '#868e96',
  '#212529',
];

function normalizeHex(value: string): string {
  const v = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v.toLowerCase()}`;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const r = v[1],
      g = v[2],
      b = v[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return '#4f8cff';
}

function Vec3Fields({
  value,
  onChange,
  step = 0.1,
}: {
  value: Vec3;
  onChange: (v: Vec3) => void;
  step?: number;
}) {
  return (
    <div className="vec3-grid">
      {(['x', 'y', 'z'] as const).map((axis) => (
        <div className="prop-row" key={axis}>
          <span className={`axis ${axis}`}>{axis.toUpperCase()}</span>
          <input
            type="number"
            step={step}
            value={Number(value[axis].toFixed(3))}
            onChange={(e) => onChange({ ...value, [axis]: parseFloat(e.target.value) || 0 })}
          />
        </div>
      ))}
    </div>
  );
}

function Vec3Sliders({
  value,
  onChange,
  min = -20,
  max = 20,
  step = 0.1,
}: {
  value: Vec3;
  onChange: (v: Vec3) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="vec3-sliders">
      {(['x', 'y', 'z'] as const).map((axis) => (
        <div className="slider-row prop-axis-slider" key={axis}>
          <span className={`axis ${axis}`}>{axis.toUpperCase()}</span>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value[axis]}
            onChange={(e) => onChange({ ...value, [axis]: parseFloat(e.target.value) })}
          />
          <span>{value[axis].toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="prop-section-title">{children}</div>;
}

function ColorField({
  label,
  value,
  onChange,
  showPresets = false,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
  showPresets?: boolean;
}) {
  const hex = normalizeHex(value || '#ffffff');

  return (
    <div className="prop-group">
      <label>{label}</label>
      <div className="color-field">
        <input
          type="color"
          value={hex}
          onChange={(e) => onChange(e.target.value)}
          title={hex}
        />
        <input
          type="text"
          value={hex}
          spellCheck={false}
          onChange={(e) => {
            const next = e.target.value;
            if (/^#?[0-9a-fA-F]{0,6}$/.test(next)) {
              if (/^#?[0-9a-fA-F]{6}$/.test(next) || /^#?[0-9a-fA-F]{3}$/.test(next)) {
                onChange(normalizeHex(next));
              }
            }
          }}
          onBlur={(e) => onChange(normalizeHex(e.target.value))}
        />
      </div>
      {showPresets && (
        <div className="color-swatches">
          {COLOR_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              className={`color-swatch ${hex === c ? 'active' : ''}`}
              style={{ background: c }}
              title={c}
              onClick={() => onChange(c)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ObjectProperties({ obj }: { obj: SceneObject }) {
  const { t } = useTranslation();
  const updateObject = useAppStore((s) => s.updateObject);

  const patch = (partial: Partial<SceneObject>) => updateObject(obj.id, partial);

  const rotateAxis = (axis: keyof Vec3, deg = 15) => {
    patch({
      rotation: {
        ...obj.rotation,
        [axis]: obj.rotation[axis] + (deg * Math.PI) / 180,
      },
    });
  };

  return (
    <>
      <SectionTitle>{t('properties.identity')}</SectionTitle>
      <div className="prop-group">
        <label>{t('properties.name')}</label>
        <input type="text" value={obj.name} onChange={(e) => patch({ name: e.target.value })} />
      </div>
      <div className="prop-group">
        <label>{t('properties.type')}</label>
        <input
          type="text"
          value={obj.modelFormat ? `${obj.type} (${obj.modelFormat})` : obj.type}
          disabled
        />
      </div>
      {obj.sourceFileName && (
        <div className="prop-group">
          <label>{t('properties.sourceFile')}</label>
          <input type="text" value={obj.sourceFileName} disabled />
        </div>
      )}

      <SectionTitle>{t('properties.appearance')}</SectionTitle>
      <ColorField
        label={t('properties.color')}
        value={obj.color}
        onChange={(color) => patch({ color })}
        showPresets
      />

      <div className="prop-group">
        <label>{t('properties.opacity')}</label>
        <div className="slider-row">
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.01}
            value={obj.opacity}
            onChange={(e) => patch({ opacity: parseFloat(e.target.value) })}
          />
          <span>{obj.opacity.toFixed(2)}</span>
        </div>
      </div>

      <div className="prop-group">
        <label>{t('properties.metalness')}</label>
        <div className="slider-row">
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={obj.metalness}
            onChange={(e) => patch({ metalness: parseFloat(e.target.value) })}
          />
          <span>{obj.metalness.toFixed(2)}</span>
        </div>
      </div>

      <div className="prop-group">
        <label>{t('properties.roughness')}</label>
        <div className="slider-row">
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={obj.roughness}
            onChange={(e) => patch({ roughness: parseFloat(e.target.value) })}
          />
          <span>{obj.roughness.toFixed(2)}</span>
        </div>
      </div>

      <ColorField
        label={t('properties.emissive')}
        value={obj.emissive || '#000000'}
        onChange={(emissive) => patch({ emissive })}
      />

      <div className="prop-group">
        <label>{t('properties.emissiveIntensity')}</label>
        <div className="slider-row">
          <input
            type="range"
            min={0}
            max={2}
            step={0.01}
            value={obj.emissiveIntensity ?? 0}
            onChange={(e) => patch({ emissiveIntensity: parseFloat(e.target.value) })}
          />
          <span>{(obj.emissiveIntensity ?? 0).toFixed(2)}</span>
        </div>
      </div>

      <div className="toggle-row">
        <span>{t('properties.wireframe')}</span>
        <input
          type="checkbox"
          checked={!!obj.wireframe}
          onChange={(e) => patch({ wireframe: e.target.checked })}
        />
      </div>
      <div className="toggle-row">
        <span>{t('properties.flatShading')}</span>
        <input
          type="checkbox"
          checked={!!obj.flatShading}
          onChange={(e) => patch({ flatShading: e.target.checked })}
        />
      </div>
      <div className="toggle-row">
        <span>{t('properties.visible')}</span>
        <input
          type="checkbox"
          checked={obj.visible}
          onChange={(e) => patch({ visible: e.target.checked })}
        />
      </div>

      <SectionTitle>{t('properties.transform')}</SectionTitle>
      <div className="prop-group">
        <label>{t('properties.position')}</label>
        <Vec3Fields value={obj.position} onChange={(position) => patch({ position })} />
      </div>

      <div className="prop-group">
        <label>{t('properties.rotation')} (°)</label>
        <Vec3Fields
          value={{
            x: (obj.rotation.x * 180) / Math.PI,
            y: (obj.rotation.y * 180) / Math.PI,
            z: (obj.rotation.z * 180) / Math.PI,
          }}
          onChange={(deg) =>
            patch({
              rotation: {
                x: (deg.x * Math.PI) / 180,
                y: (deg.y * Math.PI) / 180,
                z: (deg.z * Math.PI) / 180,
              },
            })
          }
          step={1}
        />
      </div>

      <div className="prop-group">
        <label>{t('properties.axisRotate')} (0°–360°)</label>
        {(['x', 'y', 'z'] as const).map((axis) => {
          const deg = (((obj.rotation[axis] * 180) / Math.PI) % 360 + 360) % 360;
          return (
            <div key={axis} style={{ marginBottom: 8 }}>
              <div className="slider-row">
                <input
                  type="range"
                  min={0}
                  max={360}
                  step={1}
                  value={Math.round(deg)}
                  onChange={(e) =>
                    patch({
                      rotation: {
                        ...obj.rotation,
                        [axis]: (parseFloat(e.target.value) * Math.PI) / 180,
                      },
                    })
                  }
                />
                <span className={`axis ${axis}`}>{Math.round(deg)}°</span>
              </div>
            </div>
          );
        })}
        <div className="axis-rotate-btns">
          <button className="axis-btn x" onClick={() => rotateAxis('x', 90)}>
            {t('properties.rotateX')} +90°
          </button>
          <button className="axis-btn y" onClick={() => rotateAxis('y', 90)}>
            {t('properties.rotateY')} +90°
          </button>
          <button className="axis-btn z" onClick={() => rotateAxis('z', 90)}>
            {t('properties.rotateZ')} +90°
          </button>
        </div>
      </div>

      <div className="prop-group">
        <label>{t('properties.scale')}</label>
        <Vec3Fields value={obj.scale} onChange={(scale) => patch({ scale })} step={0.05} />
      </div>
    </>
  );
}

function LightingProperties() {
  const { t } = useTranslation();
  const lights = useAppStore((s) => s.lights);
  const setLights = useAppStore((s) => s.setLights);

  return (
    <>
      <SectionTitle>{t('properties.lighting')}</SectionTitle>
      <div className="prop-group">
        <label>{t('properties.ambient')}</label>
        <div className="slider-row">
          <input
            type="range"
            min={0}
            max={2}
            step={0.01}
            value={lights.ambientIntensity}
            onChange={(e) => setLights({ ambientIntensity: parseFloat(e.target.value) })}
          />
          <span>{lights.ambientIntensity.toFixed(2)}</span>
        </div>
        <ColorField
          label={t('properties.color')}
          value={lights.ambientColor}
          onChange={(ambientColor) => setLights({ ambientColor })}
        />
      </div>

      <div className="prop-group">
        <label>{t('properties.directional')}</label>
        <div className="slider-row">
          <input
            type="range"
            min={0}
            max={3}
            step={0.01}
            value={lights.directionalIntensity}
            onChange={(e) => setLights({ directionalIntensity: parseFloat(e.target.value) })}
          />
          <span>{lights.directionalIntensity.toFixed(2)}</span>
        </div>
        <ColorField
          label={t('properties.color')}
          value={lights.directionalColor}
          onChange={(directionalColor) => setLights({ directionalColor })}
        />
        <div style={{ marginTop: 8 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 11, color: 'var(--text-muted)' }}>
            {t('lightsPanel.position')}
          </label>
          <Vec3Sliders
            value={lights.directionalPosition}
            onChange={(directionalPosition) => setLights({ directionalPosition })}
          />
        </div>
      </div>

      <div className="prop-group">
        <label>{t('properties.point')}</label>
        <div className="slider-row">
          <input
            type="range"
            min={0}
            max={3}
            step={0.01}
            value={lights.pointIntensity}
            onChange={(e) => setLights({ pointIntensity: parseFloat(e.target.value) })}
          />
          <span>{lights.pointIntensity.toFixed(2)}</span>
        </div>
        <ColorField
          label={t('properties.color')}
          value={lights.pointColor}
          onChange={(pointColor) => setLights({ pointColor })}
        />
        <div style={{ marginTop: 8 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 11, color: 'var(--text-muted)' }}>
            {t('lightsPanel.position')}
          </label>
          <Vec3Sliders
            value={lights.pointPosition}
            onChange={(pointPosition) => setLights({ pointPosition })}
          />
        </div>
      </div>
    </>
  );
}

function ViewportProperties() {
  const { t } = useTranslation();
  const viewport = useAppStore((s) => s.viewport);
  const setViewport = useAppStore((s) => s.setViewport);

  return (
    <>
      <SectionTitle>{t('properties.viewport')}</SectionTitle>
      <div className="toggle-row">
        <span>{t('properties.showGrid')}</span>
        <input
          type="checkbox"
          checked={viewport.showGrid}
          onChange={(e) => setViewport({ showGrid: e.target.checked })}
        />
      </div>
      <div className="toggle-row">
        <span>{t('properties.showAxes')}</span>
        <input
          type="checkbox"
          checked={viewport.showAxes}
          onChange={(e) => setViewport({ showAxes: e.target.checked })}
        />
      </div>
    </>
  );
}

export default function RightPanel() {
  const { t } = useTranslation();
  const objects = useAppStore((s) => s.objects);
  const selectedId = useAppStore((s) => s.selectedId);
  const selected = objects.find((o) => o.id === selectedId) || null;

  return (
    <aside className="panel right">
      <div className="panel-header">{t('properties.title')}</div>
      <div className="panel-body">
        {selected ? (
          <ObjectProperties obj={selected} />
        ) : (
          <div className="empty-state">{t('properties.none')}</div>
        )}
        <LightingProperties />
        <ViewportProperties />
      </div>
    </aside>
  );
}
