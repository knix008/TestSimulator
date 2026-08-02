import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import type { PrimitiveType, ToolType } from '../types';
import { pickAndImportModels } from '../utils/modelImport';
import {
  IconBox,
  IconCone,
  IconCylinder,
  IconDuplicate,
  IconImport,
  IconMove,
  IconPlane,
  IconRotate,
  IconScale,
  IconSelect,
  IconSphere,
  IconTorus,
  IconTrash,
} from './Icons';

const transformTools: { id: ToolType; icon: typeof IconSelect; labelKey: string }[] = [
  { id: 'select', icon: IconSelect, labelKey: 'tools.select' },
  { id: 'move', icon: IconMove, labelKey: 'tools.move' },
  { id: 'rotate', icon: IconRotate, labelKey: 'tools.rotate' },
  { id: 'scale', icon: IconScale, labelKey: 'tools.scale' },
];

const primitives: { id: PrimitiveType; icon: typeof IconBox; labelKey: string }[] = [
  { id: 'box', icon: IconBox, labelKey: 'tools.box' },
  { id: 'sphere', icon: IconSphere, labelKey: 'tools.sphere' },
  { id: 'cylinder', icon: IconCylinder, labelKey: 'tools.cylinder' },
  { id: 'cone', icon: IconCone, labelKey: 'tools.cone' },
  { id: 'torus', icon: IconTorus, labelKey: 'tools.torus' },
  { id: 'plane', icon: IconPlane, labelKey: 'tools.plane' },
];

export default function LeftPanel() {
  const { t } = useTranslation();
  const tool = useAppStore((s) => s.tool);
  const setTool = useAppStore((s) => s.setTool);
  const addShape = useAppStore((s) => s.addShape);
  const deleteSelected = useAppStore((s) => s.deleteSelected);
  const duplicateSelected = useAppStore((s) => s.duplicateSelected);
  const selectedId = useAppStore((s) => s.selectedId);

  return (
    <aside className="panel left">
      <div className="panel-header">{t('tools.title')}</div>
      <div className="panel-body">
        <div className="tool-section">
          <h3>{t('tools.title')}</h3>
          <div className="tool-grid">
            {transformTools.map(({ id, icon: Icon, labelKey }) => (
              <button
                key={id}
                className={`tool-btn ${tool === id ? 'active' : ''}`}
                onClick={() => setTool(id)}
              >
                <Icon />
                {t(labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="tool-section">
          <h3>{t('tools.import')}</h3>
          <button className="tool-btn" style={{ width: '100%' }} onClick={() => pickAndImportModels()}>
            <IconImport />
            {t('tools.importModel')}
          </button>
          <p style={{ marginTop: 8, fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.4 }}>
            {t('tools.importHint')}
          </p>
        </div>

        <div className="tool-section">
          <h3>{t('tools.primitives')}</h3>
          <div className="tool-grid">
            {primitives.map(({ id, icon: Icon, labelKey }) => (
              <button key={id} className="tool-btn" onClick={() => addShape(id)}>
                <Icon />
                {t(labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="tool-section">
          <h3>{t('tools.actions')}</h3>
          <div className="tool-grid">
            <button className="tool-btn" disabled={!selectedId} onClick={duplicateSelected}>
              <IconDuplicate />
              {t('tools.duplicate')}
            </button>
            <button className="tool-btn" disabled={!selectedId} onClick={deleteSelected}>
              <IconTrash />
              {t('tools.delete')}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
