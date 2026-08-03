import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import type { PrimitiveType, ToolType } from '../types';
import { pickAndImportModels } from '../utils/modelImport';
import {
  IconBox,
  IconCapsule,
  IconChevron,
  IconCone,
  IconCylinder,
  IconDodecahedron,
  IconDuplicate,
  IconIcosahedron,
  IconImport,
  IconMove,
  IconOctahedron,
  IconPlane,
  IconPyramid,
  IconRing,
  IconRotate,
  IconScale,
  IconSelect,
  IconSphere,
  IconTemplate,
  IconTetrahedron,
  IconText,
  IconTorus,
  IconTorusKnot,
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
  { id: 'capsule', icon: IconCapsule, labelKey: 'tools.capsule' },
  { id: 'pyramid', icon: IconPyramid, labelKey: 'tools.pyramid' },
  { id: 'dodecahedron', icon: IconDodecahedron, labelKey: 'tools.dodecahedron' },
  { id: 'icosahedron', icon: IconIcosahedron, labelKey: 'tools.icosahedron' },
  { id: 'octahedron', icon: IconOctahedron, labelKey: 'tools.octahedron' },
  { id: 'tetrahedron', icon: IconTetrahedron, labelKey: 'tools.tetrahedron' },
  { id: 'torusKnot', icon: IconTorusKnot, labelKey: 'tools.torusKnot' },
  { id: 'ring', icon: IconRing, labelKey: 'tools.ring' },
  { id: 'circle', icon: IconRing, labelKey: 'tools.circle' },
  { id: 'hexPrism', icon: IconCylinder, labelKey: 'tools.hexPrism' },
  { id: 'triangularPrism', icon: IconPyramid, labelKey: 'tools.triangularPrism' },
  { id: 'pipe', icon: IconCylinder, labelKey: 'tools.pipe' },
  { id: 'halfSphere', icon: IconSphere, labelKey: 'tools.halfSphere' },
  { id: 'truncatedCone', icon: IconCone, labelKey: 'tools.truncatedCone' },
];

function ToolSection({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`tool-section ${open ? 'open' : 'collapsed'}`}>
      <button type="button" className="section-toggle" onClick={() => setOpen((next) => !next)}>
        <IconChevron />
        <span>{title}</span>
      </button>
      {open && <div className="section-content">{children}</div>}
    </div>
  );
}

export default function LeftPanel() {
  const { t } = useTranslation();
  const tool = useAppStore((s) => s.tool);
  const setTool = useAppStore((s) => s.setTool);
  const addShape = useAppStore((s) => s.addShape);
  const addText = useAppStore((s) => s.addText);
  const deleteSelected = useAppStore((s) => s.deleteSelected);
  const duplicateSelected = useAppStore((s) => s.duplicateSelected);
  const setShowTemplates = useAppStore((s) => s.setShowTemplates);
  const selectedId = useAppStore((s) => s.selectedId);

  return (
    <aside className="panel left">
      <div className="panel-header">{t('tools.title')}</div>
      <div className="panel-body">
        <ToolSection title={t('tools.title')}>
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
        </ToolSection>

        <ToolSection title={t('tools.addObjects')}>
          <div className="tool-grid">
            <button className="tool-btn" onClick={addText}>
              <IconText />
              {t('tools.text')}
            </button>
          </div>
        </ToolSection>

        <ToolSection title={t('tools.import')}>
          <button className="tool-btn" style={{ width: '100%' }} onClick={() => pickAndImportModels()}>
            <IconImport />
            {t('tools.importModel')}
          </button>
          <button
            className="tool-btn"
            style={{ width: '100%', marginTop: 6 }}
            onClick={() => setShowTemplates(true)}
          >
            <IconTemplate />
            {t('toolbar.templates')}
          </button>
          <p style={{ marginTop: 8, fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.4 }}>
            {t('tools.importHint')}
          </p>
        </ToolSection>

        <ToolSection title={t('tools.primitives')}>
          <div className="tool-grid tool-grid-dense">
            {primitives.map(({ id, icon: Icon, labelKey }) => (
              <button key={id} className="tool-btn" onClick={() => addShape(id)}>
                <Icon />
                {t(labelKey)}
              </button>
            ))}
          </div>
        </ToolSection>

        <ToolSection title={t('tools.actions')}>
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
        </ToolSection>
      </div>
    </aside>
  );
}
