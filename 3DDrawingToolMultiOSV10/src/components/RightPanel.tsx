import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import { ALL_PRIMITIVES, type LightKind, type LineEndpoint, type LinePathType, type LineStyle, type PrimitiveType, type SceneObject, type TextFontId, type Vec3 } from '../types';
import {
  TEXTURE_PRESETS,
  getPresetTextureUrl,
  getTexturePreview,
  readImageFileAsDataUrl,
  type TexturePresetId,
} from '../utils/textures';

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

const TEXT_FONT_OPTIONS: { id: TextFontId; labelKey: string }[] = [
  { id: 'helvetiker', labelKey: 'properties.fontHelvetiker' },
  { id: 'gentilis', labelKey: 'properties.fontGentilis' },
  { id: 'optimer', labelKey: 'properties.fontOptimer' },
  { id: 'droidSans', labelKey: 'properties.fontDroidSans' },
  { id: 'droidSerif', labelKey: 'properties.fontDroidSerif' },
];

const LINE_STYLE_OPTIONS: { id: LineStyle; labelKey: string }[] = [
  { id: 'solid', labelKey: 'properties.lineStyleSolid' },
  { id: 'dashed', labelKey: 'properties.lineStyleDashed' },
  { id: 'dotted', labelKey: 'properties.lineStyleDotted' },
];

const LINE_PATH_OPTIONS: { id: LinePathType; labelKey: string }[] = [
  { id: 'straight', labelKey: 'properties.linePathStraight' },
  { id: 'elbow', labelKey: 'properties.linePathElbow' },
  { id: 'curve', labelKey: 'properties.linePathCurve' },
];

const LINE_ENDPOINT_OPTIONS: { id: LineEndpoint; labelKey: string }[] = [
  { id: 'none', labelKey: 'properties.lineEndpointNone' },
  { id: 'circle', labelKey: 'properties.lineEndpointCircle' },
  { id: 'arrow', labelKey: 'properties.lineEndpointArrow' },
];

const LINE_THICKNESS_OPTIONS = [
  { id: 'thin', value: 0.03, labelKey: 'properties.lineThicknessThin' },
  { id: 'medium', value: 0.06, labelKey: 'properties.lineThicknessMedium' },
  { id: 'thick', value: 0.14, labelKey: 'properties.lineThicknessThick' },
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

function UniformScaleSlider({ value, onChange }: { value: Vec3; onChange: (v: Vec3) => void }) {
  const current = Math.max(0.05, (value.x + value.y + value.z) / 3);
  const max = Math.max(5, Math.ceil(current + 1));

  return (
    <div className="slider-row">
      <input
        type="range"
        min={0.05}
        max={max}
        step={0.05}
        value={current}
        onChange={(e) => {
          const scale = parseFloat(e.target.value);
          onChange({ x: scale, y: scale, z: scale });
        }}
      />
      <span>{current.toFixed(2)}</span>
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

function LineStylePicker({ value, onChange }: { value: LineStyle; onChange: (style: LineStyle) => void }) {
  const { t } = useTranslation();

  return (
    <div className="line-style-grid">
      {LINE_STYLE_OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`line-style-btn ${value === option.id ? 'active' : ''}`}
          title={t(option.labelKey)}
          onClick={() => onChange(option.id)}
        >
          <span className={`line-style-preview ${option.id}`} aria-hidden>
            <span />
          </span>
          <span>{t(option.labelKey)}</span>
        </button>
      ))}
    </div>
  );
}

function LinePathPicker({ value, onChange }: { value: LinePathType; onChange: (path: LinePathType) => void }) {
  const { t } = useTranslation();

  return (
    <div className="line-style-grid">
      {LINE_PATH_OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`line-style-btn ${value === option.id ? 'active' : ''}`}
          title={t(option.labelKey)}
          onClick={() => onChange(option.id)}
        >
          <span className={`line-path-preview ${option.id}`} aria-hidden>
            <span />
          </span>
          <span>{t(option.labelKey)}</span>
        </button>
      ))}
    </div>
  );
}

function LineEndpointPicker({ value, onChange }: { value: LineEndpoint; onChange: (endpoint: LineEndpoint) => void }) {
  const { t } = useTranslation();

  return (
    <div className="line-style-grid">
      {LINE_ENDPOINT_OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`line-style-btn ${value === option.id ? 'active' : ''}`}
          title={t(option.labelKey)}
          onClick={() => onChange(option.id)}
        >
          <span className={`line-endpoint-preview ${option.id}`} aria-hidden>
            <span />
          </span>
          <span>{t(option.labelKey)}</span>
        </button>
      ))}
    </div>
  );
}

function LineThicknessPicker({ value, onChange }: { value: number; onChange: (thickness: number) => void }) {
  const { t } = useTranslation();

  return (
    <div className="line-style-grid">
      {LINE_THICKNESS_OPTIONS.map((option) => {
        const active = Math.abs(value - option.value) < 0.015;
        return (
          <button
            key={option.id}
            type="button"
            className={`line-style-btn ${active ? 'active' : ''}`}
            title={t(option.labelKey)}
            onClick={() => onChange(option.value)}
          >
            <span className={`line-thickness-preview ${option.id}`} aria-hidden>
              <span />
            </span>
            <span>{t(option.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}

function TexturePicker({
  textureId,
  textureUrl,
  textureRepeat,
  onSelectPreset,
  onCustomUrl,
  onClear,
  onRepeat,
}: {
  textureId: string;
  textureUrl?: string;
  textureRepeat: number;
  onSelectPreset: (id: string, url?: string) => void;
  onCustomUrl: (url: string) => void;
  onClear: () => void;
  onRepeat: (repeat: number) => void;
}) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const p of TEXTURE_PRESETS) {
      map[p.id] = getTexturePreview(p.id);
    }
    return map;
  }, []);

  return (
    <div className="prop-group">
      <label>{t('properties.texture')}</label>
      <div className="texture-grid">
        {TEXTURE_PRESETS.map((p) => {
          const active = textureId === p.id || (p.id === 'none' && (!textureId || textureId === 'none'));
          const preview = previews[p.id];
          return (
            <button
              key={p.id}
              type="button"
              className={`texture-swatch ${active ? 'active' : ''}`}
              title={t(p.labelKey)}
              onClick={() => {
                if (p.id === 'none') onClear();
                else onSelectPreset(p.id, getPresetTextureUrl(p.id as TexturePresetId));
              }}
            >
              {preview ? (
                <img src={preview} alt={p.id} />
              ) : (
                <span className="texture-none">{t('properties.textureNone')}</span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          className={`texture-swatch ${textureId === 'custom' ? 'active' : ''}`}
          title={t('properties.textureCustom')}
          onClick={() => fileRef.current?.click()}
        >
          {textureId === 'custom' && textureUrl ? (
            <img src={textureUrl} alt="custom" />
          ) : (
            <span className="texture-none">{t('properties.textureCustom')}</span>
          )}
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          const url = await readImageFileAsDataUrl(file);
          onCustomUrl(url);
        }}
      />
      {(textureId && textureId !== 'none') || textureUrl ? (
        <div className="slider-row" style={{ marginTop: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 48 }}>
            {t('properties.textureRepeat')}
          </span>
          <input
            type="range"
            min={0.25}
            max={8}
            step={0.25}
            value={textureRepeat}
            onChange={(e) => onRepeat(parseFloat(e.target.value))}
          />
          <span>{textureRepeat.toFixed(2)}</span>
        </div>
      ) : null}
    </div>
  );
}

function ObjectProperties({ obj }: { obj: SceneObject }) {
  const { t } = useTranslation();
  const objects = useAppStore((s) => s.objects);
  const updateObject = useAppStore((s) => s.updateObject);
  const addConnection = useAppStore((s) => s.addConnection);
  const [connectionTargetId, setConnectionTargetId] = useState('');

  const patch = (partial: Partial<SceneObject>) => updateObject(obj.id, partial);
  const isPrimitive = ALL_PRIMITIVES.includes(obj.type as PrimitiveType);
  const isText = obj.type === 'text';
  const isConnection = obj.type === 'connection';
  const connectableObjects = objects.filter((candidate) => candidate.type !== 'connection');
  const targetOptions = connectableObjects.filter((candidate) => candidate.id !== obj.id);
  const selectedTargetId = targetOptions.some((candidate) => candidate.id === connectionTargetId)
    ? connectionTargetId
    : targetOptions[0]?.id || '';

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

      {isConnection && (
        <>
          <SectionTitle>{t('properties.connection')}</SectionTitle>
          <div className="prop-group">
            <label>{t('properties.connectionStart')}</label>
            <select
              value={obj.connectionStartId || ''}
              onChange={(e) => patch({ connectionStartId: e.target.value })}
            >
              {connectableObjects.map((candidate) => (
                <option key={candidate.id} value={candidate.id} disabled={candidate.id === obj.connectionEndId}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </div>
          <div className="prop-group">
            <label>{t('properties.connectionEnd')}</label>
            <select
              value={obj.connectionEndId || ''}
              onChange={(e) => patch({ connectionEndId: e.target.value })}
            >
              {connectableObjects.map((candidate) => (
                <option key={candidate.id} value={candidate.id} disabled={candidate.id === obj.connectionStartId}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </div>
          <div className="prop-group">
            <label>{t('properties.linePathType')}</label>
            <LinePathPicker value={obj.linePathType || 'straight'} onChange={(linePathType) => patch({ linePathType })} />
          </div>
          <div className="prop-group">
            <label>{t('properties.lineStyle')}</label>
            <LineStylePicker value={obj.lineStyle || 'solid'} onChange={(lineStyle) => patch({ lineStyle })} />
          </div>
          <div className="prop-group">
            <label>{t('properties.lineStartEndpoint')}</label>
            <LineEndpointPicker value={obj.lineStartEndpoint || 'none'} onChange={(lineStartEndpoint) => patch({ lineStartEndpoint })} />
          </div>
          <div className="prop-group">
            <label>{t('properties.lineEndEndpoint')}</label>
            <LineEndpointPicker value={obj.lineEndEndpoint || 'none'} onChange={(lineEndEndpoint) => patch({ lineEndEndpoint })} />
          </div>
          <div className="prop-group">
            <label>{t('properties.lineThickness')}</label>
            <LineThicknessPicker value={obj.lineThickness ?? 0.06} onChange={(lineThickness) => patch({ lineThickness })} />
            <div className="slider-row">
              <input
                type="range"
                min={0.01}
                max={0.5}
                step={0.01}
                value={obj.lineThickness ?? 0.06}
                onChange={(e) => patch({ lineThickness: parseFloat(e.target.value) })}
              />
              <span>{(obj.lineThickness ?? 0.06).toFixed(2)}</span>
            </div>
          </div>
        </>
      )}

      {!isConnection && targetOptions.length > 0 && (
        <>
          <SectionTitle>{t('properties.connection')}</SectionTitle>
          <div className="prop-group">
            <label>{t('properties.connectionTarget')}</label>
            <select value={selectedTargetId} onChange={(e) => setConnectionTargetId(e.target.value)}>
              {targetOptions.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="axis-btn"
            disabled={!selectedTargetId}
            onClick={() => {
              if (selectedTargetId) addConnection(obj.id, selectedTargetId);
            }}
          >
            {t('properties.createConnection')}
          </button>
        </>
      )}

      <SectionTitle>{t('properties.appearance')}</SectionTitle>
      <ColorField
        label={isText ? t('properties.textSurfaceColor') : t('properties.color')}
        value={obj.color}
        onChange={(color) => patch({ color })}
        showPresets
      />

      {isText && (
        <>
          <SectionTitle>{t('properties.text')}</SectionTitle>
          <div className="prop-group">
            <label>{t('properties.textContent')}</label>
            <input
              type="text"
              value={obj.text || ''}
              onChange={(e) => patch({ text: e.target.value })}
            />
          </div>
          <ColorField
            label={t('properties.textOutlineColor')}
            value={obj.textOutlineColor || '#1f2937'}
            onChange={(textOutlineColor) => patch({ textOutlineColor })}
            showPresets
          />
          <div className="prop-group">
            <label>{t('properties.font')}</label>
            <select
              value={obj.textFont || 'helvetiker'}
              onChange={(e) => patch({ textFont: e.target.value as TextFontId })}
            >
              {TEXT_FONT_OPTIONS.map((font) => (
                <option key={font.id} value={font.id}>
                  {t(font.labelKey)}
                </option>
              ))}
            </select>
          </div>
          <div className="prop-group">
            <label>{t('properties.textSize')}</label>
            <div className="slider-row">
              <input
                type="range"
                min={0.1}
                max={3}
                step={0.05}
                value={obj.textSize ?? 0.55}
                onChange={(e) => patch({ textSize: parseFloat(e.target.value) })}
              />
              <span>{(obj.textSize ?? 0.55).toFixed(2)}</span>
            </div>
          </div>
          <div className="prop-group">
            <label>{t('properties.textDepth')}</label>
            <div className="slider-row">
              <input
                type="range"
                min={0.01}
                max={2}
                step={0.01}
                value={obj.textDepth ?? 0.08}
                onChange={(e) => patch({ textDepth: parseFloat(e.target.value) })}
              />
              <span>{(obj.textDepth ?? 0.08).toFixed(2)}</span>
            </div>
          </div>
          <div className="toggle-row">
            <span>{t('properties.bold')}</span>
            <input
              type="checkbox"
              checked={!!obj.textBold}
              onChange={(e) => patch({ textBold: e.target.checked })}
            />
          </div>
          <div className="toggle-row">
            <span>{t('properties.italic')}</span>
            <input
              type="checkbox"
              checked={!!obj.textItalic}
              onChange={(e) => patch({ textItalic: e.target.checked })}
            />
          </div>
          <div className="toggle-row">
            <span>{t('properties.underline')}</span>
            <input
              type="checkbox"
              checked={!!obj.textUnderline}
              onChange={(e) => patch({ textUnderline: e.target.checked })}
            />
          </div>
        </>
      )}

      {(isPrimitive || isText) && (
        <TexturePicker
          textureId={obj.textureId || 'none'}
          textureUrl={obj.textureUrl}
          textureRepeat={obj.textureRepeat ?? 2}
          onSelectPreset={(textureId, textureUrl) =>
            patch({
              textureId,
              textureUrl,
              textureRepeat: obj.textureRepeat ?? 2,
            })
          }
          onCustomUrl={(textureUrl) =>
            patch({ textureId: 'custom', textureUrl, textureRepeat: obj.textureRepeat ?? 2 })
          }
          onClear={() => patch({ textureId: 'none', textureUrl: undefined })}
          onRepeat={(textureRepeat) => patch({ textureRepeat })}
        />
      )}

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

      {!isConnection && (
        <>
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
            <label>{t('properties.axisRotate')} (0°-360°)</label>
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
            <UniformScaleSlider value={obj.scale} onChange={(scale) => patch({ scale })} />
          </div>
        </>
      )}
    </>
  );
}

function LightProperties({ kind }: { kind: LightKind }) {
  const { t } = useTranslation();
  const lights = useAppStore((s) => s.lights);
  const setLights = useAppStore((s) => s.setLights);
  const isDirectional = kind === 'directional';
  const label = isDirectional ? t('properties.directional') : t('properties.point');
  const enabled = isDirectional ? lights.directionalEnabled : lights.pointEnabled;
  const intensity = isDirectional ? lights.directionalIntensity : lights.pointIntensity;
  const color = isDirectional ? lights.directionalColor : lights.pointColor;
  const position = isDirectional ? lights.directionalPosition : lights.pointPosition;

  return (
    <>
      <SectionTitle>{t('properties.lighting')}</SectionTitle>
      <div className="prop-group">
        <label>{t('properties.type')}</label>
        <input type="text" value={label} disabled />
      </div>
      <div className="toggle-row">
        <span>{t('properties.enabled')}</span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            if (isDirectional) setLights({ directionalEnabled: e.target.checked });
            else setLights({ pointEnabled: e.target.checked });
          }}
        />
      </div>
      <div className="prop-group">
        <label>{t('properties.intensity')}</label>
        <div className="slider-row">
          <input
            type="range"
            disabled={!enabled}
            min={0}
            max={isDirectional ? 5 : 8}
            step={0.05}
            value={intensity}
            onChange={(e) => {
              const next = parseFloat(e.target.value);
              if (isDirectional) setLights({ directionalIntensity: next });
              else setLights({ pointIntensity: next });
            }}
          />
          <span>{intensity.toFixed(2)}</span>
        </div>
      </div>
      <ColorField
        label={t('properties.color')}
        value={color}
        onChange={(next) => {
          if (isDirectional) setLights({ directionalColor: next });
          else setLights({ pointColor: next });
        }}
        showPresets
      />
      <div className="prop-group">
        <label>{t('properties.position')}</label>
        <Vec3Fields
          value={position}
          onChange={(next) => {
            if (isDirectional) setLights({ directionalPosition: next });
            else setLights({ pointPosition: next });
          }}
        />
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

export default function RightPanel({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const { t } = useTranslation();
  const objects = useAppStore((s) => s.objects);
  const selectedId = useAppStore((s) => s.selectedId);
  const selectedLight = useAppStore((s) => s.selectedLight);
  const selected = objects.find((o) => o.id === selectedId) || null;

  return (
    <aside className={`panel right ${collapsed ? 'collapsed-panel' : ''}`}>
      <div className="panel-header">
        <button className="panel-toggle-btn" title={collapsed ? 'Expand' : 'Collapse'} onClick={onToggleCollapsed}>
          {collapsed ? '<' : '>'}
        </button>
        {!collapsed && <span>{t('properties.title')}</span>}
      </div>
      {!collapsed && <div className="panel-body">
        {selectedLight ? (
          <LightProperties kind={selectedLight} />
        ) : selected ? (
          <ObjectProperties obj={selected} />
        ) : (
          <div className="empty-state">{t('properties.none')}</div>
        )}
        <ViewportProperties />
      </div>}
    </aside>
  );
}
