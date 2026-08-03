import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import type { PrimitiveType } from '../types';
import { pickAndImportImages, pickAndImportModels } from '../utils/modelImport';
import {
  IconBox,
  IconCapsule,
  IconChevron,
  IconCone,
  IconCylinder,
  IconDodecahedron,
  IconIcosahedron,
  IconImage,
  IconImport,
  IconOctahedron,
  IconPlane,
  IconPyramid,
  IconRing,
  IconSphere,
  IconTemplate,
  IconTetrahedron,
  IconText,
  IconTorus,
  IconTorusKnot,
} from './Icons';

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

export default function LeftPanel({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const { t } = useTranslation();
  const addShape = useAppStore((s) => s.addShape);
  const addText = useAppStore((s) => s.addText);
  const setShowTemplates = useAppStore((s) => s.setShowTemplates);
  const projectName = useAppStore((s) => s.projectName);

  return (
    <aside className={`panel left ${collapsed ? 'collapsed-panel' : ''}`}>
      <div className="panel-header">
        {!collapsed && (
          <>
            <span>{t('tools.title')}</span>
            <span className="panel-project-name">{projectName}</span>
          </>
        )}
        <button className="panel-toggle-btn" title={collapsed ? 'Expand' : 'Collapse'} onClick={onToggleCollapsed}>
          {collapsed ? '>' : '<'}
        </button>
      </div>
      {!collapsed && <div className="panel-body">
        <ToolSection title={t('tools.addObjects')}>
          <div className="tool-grid">
            <button className="tool-btn" onClick={addText}>
              <IconText />
              {t('tools.text')}
            </button>
            <button className="tool-btn" onClick={() => pickAndImportModels()}>
              <IconImport />
              {t('tools.import3dModel')}
            </button>
            <button className="tool-btn" onClick={() => pickAndImportImages()}>
              <IconImage />
              {t('tools.importImage')}
            </button>
            <button className="tool-btn" onClick={() => setShowTemplates(true)}>
              <IconTemplate />
              {t('toolbar.templates')}
            </button>
          </div>
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
      </div>}
    </aside>
  );
}
