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

const basicPrimitives: { id: PrimitiveType; icon: typeof IconBox; labelKey: string }[] = [
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
];

const advancedPrimitives: { id: PrimitiveType; icon: typeof IconBox; labelKey: string }[] = [
  { id: 'ring', icon: IconRing, labelKey: 'tools.ring' },
  { id: 'circle', icon: IconRing, labelKey: 'tools.circle' },
  { id: 'hexPrism', icon: IconCylinder, labelKey: 'tools.hexPrism' },
  { id: 'triangularPrism', icon: IconPyramid, labelKey: 'tools.triangularPrism' },
  { id: 'pipe', icon: IconCylinder, labelKey: 'tools.pipe' },
  { id: 'halfSphere', icon: IconSphere, labelKey: 'tools.halfSphere' },
  { id: 'truncatedCone', icon: IconCone, labelKey: 'tools.truncatedCone' },
  { id: 'slab', icon: IconBox, labelKey: 'tools.slab' },
  { id: 'wall', icon: IconPlane, labelKey: 'tools.wall' },
  { id: 'rod', icon: IconCylinder, labelKey: 'tools.rod' },
  { id: 'disk', icon: IconCylinder, labelKey: 'tools.disk' },
  { id: 'pentagonalPrism', icon: IconCylinder, labelKey: 'tools.pentagonalPrism' },
  { id: 'octagonalPrism', icon: IconCylinder, labelKey: 'tools.octagonalPrism' },
  { id: 'diamond', icon: IconOctahedron, labelKey: 'tools.diamond' },
  { id: 'thinTorus', icon: IconTorus, labelKey: 'tools.thinTorus' },
  { id: 'arc', icon: IconRing, labelKey: 'tools.arc' },
  { id: 'halfCylinder', icon: IconCylinder, labelKey: 'tools.halfCylinder' },
];

const objectPrimitives: { id: PrimitiveType; icon: typeof IconBox; labelKey: string }[] = [
  { id: 'table', icon: IconBox, labelKey: 'tools.table' },
  { id: 'chair', icon: IconBox, labelKey: 'tools.chair' },
  { id: 'sofa', icon: IconBox, labelKey: 'tools.sofa' },
  { id: 'bed', icon: IconBox, labelKey: 'tools.bed' },
  { id: 'door', icon: IconPlane, labelKey: 'tools.door' },
  { id: 'windowFrame', icon: IconPlane, labelKey: 'tools.windowFrame' },
  { id: 'bookshelf', icon: IconBox, labelKey: 'tools.bookshelf' },
  { id: 'laptop', icon: IconBox, labelKey: 'tools.laptop' },
  { id: 'cup', icon: IconCylinder, labelKey: 'tools.cup' },
  { id: 'bottle', icon: IconCylinder, labelKey: 'tools.bottle' },
  { id: 'plantPot', icon: IconCylinder, labelKey: 'tools.plantPot' },
  { id: 'deskLamp', icon: IconCone, labelKey: 'tools.deskLamp' },
];

const networkPrimitives: { id: PrimitiveType; icon: typeof IconBox; labelKey: string }[] = [
  { id: 'networkRouter', icon: IconBox, labelKey: 'tools.networkRouter' },
  { id: 'networkSwitch', icon: IconBox, labelKey: 'tools.networkSwitch' },
  { id: 'serverRack', icon: IconBox, labelKey: 'tools.serverRack' },
  { id: 'firewallAppliance', icon: IconBox, labelKey: 'tools.firewallAppliance' },
  { id: 'wifiAccessPoint', icon: IconCylinder, labelKey: 'tools.wifiAccessPoint' },
  { id: 'modem', icon: IconBox, labelKey: 'tools.modem' },
  { id: 'nasStorage', icon: IconBox, labelKey: 'tools.nasStorage' },
  { id: 'patchPanel', icon: IconBox, labelKey: 'tools.patchPanel' },
  { id: 'antennaTower', icon: IconCylinder, labelKey: 'tools.antennaTower' },
  { id: 'networkCable', icon: IconTorus, labelKey: 'tools.networkCable' },
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
            {basicPrimitives.map(({ id, icon: Icon, labelKey }) => (
              <button key={id} className="tool-btn" onClick={() => addShape(id)}>
                <Icon />
                {t(labelKey)}
              </button>
            ))}
          </div>
        </ToolSection>

        <ToolSection title={t('tools.advancedPrimitives')} defaultOpen={false}>
          <div className="tool-grid tool-grid-dense">
            {advancedPrimitives.map(({ id, icon: Icon, labelKey }) => (
              <button key={id} className="tool-btn" onClick={() => addShape(id)}>
                <Icon />
                {t(labelKey)}
              </button>
            ))}
          </div>
        </ToolSection>

        <ToolSection title={t('tools.objectPrimitives')} defaultOpen={false}>
          <div className="tool-grid tool-grid-dense">
            {objectPrimitives.map(({ id, icon: Icon, labelKey }) => (
              <button key={id} className="tool-btn" onClick={() => addShape(id)}>
                <Icon />
                {t(labelKey)}
              </button>
            ))}
          </div>
        </ToolSection>

        <ToolSection title={t('tools.networkPrimitives')} defaultOpen={false}>
          <div className="tool-grid tool-grid-dense">
            {networkPrimitives.map(({ id, icon: Icon, labelKey }) => (
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
