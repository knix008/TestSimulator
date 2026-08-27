import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  CursorIcon, SquareIcon, CircleShapeIcon, LineIcon, PenIcon, TextIcon, ImportIcon,
  TriangleIcon, DiamondIcon, StarIcon, PentagonIcon, HexagonIcon, ArrowShapeIcon, HeartIcon,
  RightTriangleIcon, TrapezoidIcon, ParallelogramIcon, OctagonIcon, PlusShapeIcon,
  ChevronShapeIcon, BoltIcon, MoonIcon, CloudIcon, RingIcon, GearIcon,
  CubeIcon, CylinderIcon, SphereIcon, ConeIcon, PyramidIcon,
  ForwardIcon, BackwardIcon, TrashIcon, LayersIcon,
} from './Icons.jsx';

const ICON = {
  select: CursorIcon, rect: SquareIcon, ellipse: CircleShapeIcon, line: LineIcon, pen: PenIcon, text: TextIcon,
  triangle: TriangleIcon, rightTriangle: RightTriangleIcon, diamond: DiamondIcon, trapezoid: TrapezoidIcon,
  parallelogram: ParallelogramIcon, pentagon: PentagonIcon, hexagon: HexagonIcon, octagon: OctagonIcon,
  star: StarIcon, plus: PlusShapeIcon, chevron: ChevronShapeIcon, arrow: ArrowShapeIcon, heart: HeartIcon,
  bolt: BoltIcon, moon: MoonIcon, cloud: CloudIcon, ring: RingIcon, gear: GearIcon,
  cube: CubeIcon, cylinder: CylinderIcon, sphere: SphereIcon, cone: ConeIcon, pyramid: PyramidIcon,
  image: ImportIcon,
};

const SECTIONS = [
  { title: 'tools.basic', keys: ['select', 'rect', 'ellipse', 'line', 'pen', 'text'] },
  { title: 'tools.shapes', keys: ['triangle', 'rightTriangle', 'diamond', 'trapezoid', 'parallelogram', 'pentagon', 'hexagon', 'octagon', 'star', 'plus', 'chevron', 'arrow', 'heart', 'bolt', 'moon', 'cloud', 'ring', 'gear'] },
  { title: 'tools.solids', keys: ['cube', 'cylinder', 'sphere', 'cone', 'pyramid'] },
];

export default function DrawTools({
  tool, setTool, onImportImage,
  objects, selectedId, setSelectedId, onReorder, onDelete,
}) {
  const { t } = useTranslation();
  const ordered = [...objects].reverse(); // top of list = front-most

  const nameOf = (o) => {
    if (o.type === 'text') return `“${o.text}”`;
    if (o.type === 'shape') return t(`tools.${o.shape}`);
    return t(`tools.${o.type}`);
  };
  const iconOf = (o) => ICON[o.type === 'shape' ? o.shape : o.type] || SquareIcon;

  return (
    <div className="tools">
      <div className="panel-head"><span>{t('tools.title')}</span></div>

      {SECTIONS.map((sec) => (
        <div key={sec.title} className="tool-section">
          <div className="tool-section-title">{t(sec.title)}</div>
          <div className="tool-rows">
            {sec.keys.map((key) => {
              const Icon = ICON[key];
              return (
                <button key={key} className={`tool-row ${tool === key ? 'active' : ''}`} onClick={() => setTool(key)}>
                  <Icon size={17} />
                  <span>{t(`tools.${key}`)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="tool-section">
        <div className="tool-section-title">{t('tools.imageSection')}</div>
        <button className="tool-row" onClick={onImportImage}>
          <ImportIcon size={17} />
          <span>{t('tools.image')}</span>
        </button>
      </div>

      <div className="panel-head layers-head">
        <span><LayersIcon size={15} /> {t('tools.layers')}</span>
        <em>{objects.length}</em>
      </div>
      <div className="layer-list">
        {ordered.length === 0 && <div className="layer-empty">{t('tools.empty')}</div>}
        {ordered.map((o) => {
          const Icon = iconOf(o);
          return (
            <div key={o.id} className={`layer-item ${selectedId === o.id ? 'active' : ''}`} onClick={() => setSelectedId(o.id)}>
              <span className="layer-swatch" style={{ background: o.hasFill ? o.fill : (o.hasStroke ? o.stroke : 'transparent') }} />
              <Icon size={16} />
              <span className="layer-name">{nameOf(o)}</span>
              <span className="layer-ops">
                <button title={t('tools.forward')} onClick={(e) => { e.stopPropagation(); onReorder(o.id, 'up'); }}><ForwardIcon size={14} /></button>
                <button title={t('tools.backward')} onClick={(e) => { e.stopPropagation(); onReorder(o.id, 'down'); }}><BackwardIcon size={14} /></button>
                <button className="danger" title={t('tools.delete')} onClick={(e) => { e.stopPropagation(); onDelete(o.id); }}><TrashIcon size={14} /></button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
