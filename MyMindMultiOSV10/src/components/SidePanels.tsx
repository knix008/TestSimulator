import { useTranslation } from 'react-i18next'
import type { DiagramDocument, DiagramNode, EndCap, LinePattern, LineType, ShapeType, TextStyle, ThemeMode } from '../types'
import { AUTO_TEXT_COLOR, resolveTextColor } from '../constants/colors'
import { ColorPicker } from './ColorPicker'
import { IconLine, IconShape } from './Icons'
import { LinePreview } from './LinePreview'
import { ToolbarDropdown } from './ToolbarDropdown'
import { ShapePreview } from './ShapePreview'
import { useSystemFonts } from '../hooks/useSystemFonts'

const PRESET_FONT_VALUES = ['notoSansKr', 'outfit', 'serif', 'mono']

const SHAPE_VALUES: ShapeType[] = [
  'rounded',
  'rect',
  'stadium',
  'ellipse',
  'diamond',
  'parallelogram',
  'trapezoid',
  'hexagon',
  'octagon',
  'chevron',
  'cylinder',
  'note',
]

type Props = {
  doc: DiagramDocument
  selectedNode: DiagramNode | null
  edgeOnlySelected: boolean
  currentLine: LineType
  currentLinePattern: LinePattern
  currentLineColor: string
  currentStartCap: EndCap
  currentEndCap: EndCap
  theme: ThemeMode
  onSelect: (id: string | null) => void
  onShape: (shape: ShapeType) => void
  onColor: (color: string) => void
  onNote: (id: string, note: string) => void
  onLine: (line: LineType) => void
  onLinePattern: (pattern: LinePattern) => void
  onLineColor: (color: string) => void
  onLineStartCap: (cap: EndCap) => void
  onLineEndCap: (cap: EndCap) => void
  onTextStyle: (style: Partial<TextStyle>) => void
  onTextChange: (id: string, text: string) => void
}

export function SidePanels({
  doc,
  selectedNode,
  edgeOnlySelected,
  currentLine,
  currentLinePattern,
  currentLineColor,
  currentStartCap,
  currentEndCap,
  theme,
  onSelect,
  onShape,
  onColor,
  onNote,
  onLine,
  onLinePattern,
  onLineColor,
  onLineStartCap,
  onLineEndCap,
  onTextStyle,
  onTextChange,
}: Props) {
  const { t } = useTranslation()
  const { fonts: systemFonts, load: loadFonts } = useSystemFonts()

  // Flatten the parent/child tree into ordered rows (depth-first) so the Node
  // List can render as an indented tree with connector lines. `lineage[k]` marks
  // whether the ancestor (or self) at depth k has a following sibling, which is
  // exactly what decides where vertical guide lines continue.
  const treeRows: { node: DiagramNode; depth: number; lineage: boolean[] }[] = []
  const childrenByParent = new Map<string | null, DiagramNode[]>()
  for (const node of doc.nodes) {
    const key = node.parentId
    const arr = childrenByParent.get(key) ?? []
    arr.push(node)
    childrenByParent.set(key, arr)
  }
  const ids = new Set(doc.nodes.map((n) => n.id))
  const pushRows = (parentId: string | null, depth: number, parentLineage: boolean[]) => {
    const kids = childrenByParent.get(parentId) ?? []
    kids.forEach((node, i) => {
      const lineage = [...parentLineage, i < kids.length - 1]
      treeRows.push({ node, depth, lineage })
      pushRows(node.id, depth + 1, lineage)
    })
  }
  pushRows(null, 0, [])
  // Include any node whose parent is missing (defensive) so none are dropped.
  for (const node of doc.nodes) {
    if (node.parentId && !ids.has(node.parentId) && !treeRows.some((r) => r.node.id === node.id)) {
      treeRows.push({ node, depth: 0, lineage: [false] })
    }
  }
  const textStyle: TextStyle = selectedNode?.textStyle ?? {
    fontFamily: 'notoSansKr',
    fontSize: 13,
    color: AUTO_TEXT_COLOR,
    bold: true,
    italic: false,
    underline: false,
    strike: false,
  }
  const isAutoTextColor = !textStyle.color || textStyle.color === AUTO_TEXT_COLOR

  // Preset keyword fonts first, then every installed system family.
  const fontOptions = [
    { value: 'notoSansKr', label: t('font.notoSansKr') },
    { value: 'outfit', label: t('font.outfit') },
    { value: 'serif', label: t('font.serif') },
    { value: 'mono', label: t('font.mono') },
    ...systemFonts
      .filter((f) => !PRESET_FONT_VALUES.includes(f))
      .map((f) => ({ value: f, label: f })),
  ]
  // Ensure the current family is always selectable, even before fonts load.
  if (!fontOptions.some((o) => o.value === textStyle.fontFamily)) {
    fontOptions.push({ value: textStyle.fontFamily, label: textStyle.fontFamily })
  }

  // Line/connector controls — shared by node selection and standalone edge
  // selection, so a line can be styled on its own.
  const lineSection = (
    <>
      <div className="panel-subheading">{t('panel.lineStyle')}</div>

      <ToolbarDropdown
        label={t('panel.lineShape')}
        icon={<IconLine />}
        value={currentLine}
        onChange={onLine}
        options={[
          { value: 'curve', label: t('line.curve'), icon: <LinePreview lineType="curve" /> },
          { value: 'straight', label: t('line.straight'), icon: <LinePreview lineType="straight" /> },
          { value: 'elbow', label: t('line.elbow'), icon: <LinePreview lineType="elbow" /> },
          { value: 'root', label: t('line.root'), icon: <LinePreview lineType="root" /> },
        ]}
      />

      <ToolbarDropdown
        label={t('panel.linePattern')}
        icon={<IconLine />}
        value={currentLinePattern}
        onChange={onLinePattern}
        options={[
          { value: 'solid', label: t('linePattern.solid'), icon: <LinePreview lineType="straight" pattern="solid" /> },
          { value: 'dashed', label: t('linePattern.dashed'), icon: <LinePreview lineType="straight" pattern="dashed" /> },
          { value: 'dotted', label: t('linePattern.dotted'), icon: <LinePreview lineType="straight" pattern="dotted" /> },
          { value: 'dashdot', label: t('linePattern.dashdot'), icon: <LinePreview lineType="straight" pattern="dashdot" /> },
        ]}
      />

      <ToolbarDropdown
        label={t('panel.startCap')}
        icon={<IconLine />}
        value={currentStartCap}
        onChange={onLineStartCap}
        options={[
          { value: 'none', label: t('cap.none'), icon: <LinePreview lineType="straight" startCap="none" /> },
          { value: 'arrow', label: t('cap.arrow'), icon: <LinePreview lineType="straight" startCap="arrow" /> },
          { value: 'dot', label: t('cap.dot'), icon: <LinePreview lineType="straight" startCap="dot" /> },
          { value: 'diamond', label: t('cap.diamond'), icon: <LinePreview lineType="straight" startCap="diamond" /> },
        ]}
      />

      <ToolbarDropdown
        label={t('panel.endCap')}
        icon={<IconLine />}
        value={currentEndCap}
        onChange={onLineEndCap}
        options={[
          { value: 'none', label: t('cap.none'), icon: <LinePreview lineType="straight" endCap="none" /> },
          { value: 'arrow', label: t('cap.arrow'), icon: <LinePreview lineType="straight" endCap="arrow" /> },
          { value: 'dot', label: t('cap.dot'), icon: <LinePreview lineType="straight" endCap="dot" /> },
          { value: 'diamond', label: t('cap.diamond'), icon: <LinePreview lineType="straight" endCap="diamond" /> },
        ]}
      />

      <ColorPicker label={t('panel.lineColor')} value={currentLineColor} onChange={onLineColor} />
    </>
  )

  return (
    <>
      <aside className="side-panel left-panel" aria-label={t('panel.navigator')}>
        <div className="panel-section panel-section-fill">
          <div className="panel-heading">{t('panel.nodes')}</div>
          <div className="node-tree" role="tree" aria-label={t('panel.nodes')}>
            {treeRows.map(({ node, depth, lineage }) => (
              <button
                key={node.id}
                type="button"
                className={`node-tree-item ${node.id === doc.selectedId ? 'selected' : ''}`}
                onClick={() => onSelect(node.id)}
                role="treeitem"
                aria-level={depth + 1}
                aria-selected={node.id === doc.selectedId}
              >
                {Array.from({ length: depth }, (_, idx) => {
                  const level = idx + 1
                  const cls =
                    level < depth
                      ? lineage[level]
                        ? 'tg tg-v'
                        : 'tg'
                      : lineage[depth]
                        ? 'tg tg-mid'
                        : 'tg tg-last'
                  return <span key={level} className={cls} aria-hidden />
                })}
                <span className="node-tree-swatch" style={{ background: node.color }} />
                <span className="node-tree-text">{node.text}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <aside className="side-panel right-panel" aria-label={t('panel.properties')}>
        <div className="panel-section">
          <div className="panel-heading">{t('panel.properties')}</div>
          {selectedNode ? (
            <div className="property-stack">
              <label className="property-field">
                <span>{t('panel.text')}</span>
                <input
                  type="text"
                  value={selectedNode.text}
                  onChange={(event) => onTextChange(selectedNode.id, event.target.value)}
                />
              </label>

              <label className="property-field">
                <span>{t('panel.memo')}</span>
                <textarea
                  className="property-memo"
                  rows={3}
                  value={selectedNode.note ?? ''}
                  placeholder={t('panel.memoPlaceholder')}
                  onChange={(event) => onNote(selectedNode.id, event.target.value)}
                />
              </label>

              <ToolbarDropdown
                label={t('toolbar.shape')}
                title={t('toolbar.shape')}
                icon={<IconShape />}
                value={selectedNode.shape}
                onChange={onShape}
                options={SHAPE_VALUES.map((s) => ({
                  value: s,
                  label: t(`shape.${s}`),
                  icon: <ShapePreview shape={s} />,
                }))}
              />

              <ColorPicker label={t('panel.shapeColor')} value={selectedNode.color} onChange={onColor} />

              <div className="panel-subheading">{t('panel.textStyle')}</div>

              <ToolbarDropdown
                label={t('panel.font')}
                value={textStyle.fontFamily}
                onOpen={loadFonts}
                onChange={(fontFamily) => onTextStyle({ fontFamily })}
                options={fontOptions}
              />

              <label className="property-field">
                <span>{t('panel.fontSize')}</span>
                <input
                  type="number"
                  min={8}
                  max={120}
                  step={1}
                  value={textStyle.fontSize}
                  onChange={(event) => {
                    const size = Number(event.target.value)
                    if (Number.isFinite(size) && size > 0) onTextStyle({ fontSize: size })
                  }}
                />
              </label>

              <div className="property-field">
                <ColorPicker
                  label={t('panel.textColor')}
                  value={resolveTextColor(textStyle.color, theme)}
                  onChange={(color) => onTextStyle({ color })}
                />
                <button
                  type="button"
                  className={`style-toggle auto-color ${isAutoTextColor ? 'active' : ''}`}
                  onClick={() => onTextStyle({ color: AUTO_TEXT_COLOR })}
                  title={t('panel.textColorAutoHint')}
                >
                  {t('panel.textColorAuto')}
                </button>
              </div>

              <div className="text-style-row" aria-label={t('panel.textStyle')}>
                <button type="button" className={`style-toggle ${textStyle.bold ? 'active' : ''}`} onClick={() => onTextStyle({ bold: !textStyle.bold })}>B</button>
                <button type="button" className={`style-toggle italic ${textStyle.italic ? 'active' : ''}`} onClick={() => onTextStyle({ italic: !textStyle.italic })}>I</button>
                <button type="button" className={`style-toggle underline ${textStyle.underline ? 'active' : ''}`} onClick={() => onTextStyle({ underline: !textStyle.underline })}>U</button>
                <button type="button" className={`style-toggle strike ${textStyle.strike ? 'active' : ''}`} onClick={() => onTextStyle({ strike: !textStyle.strike })}>S</button>
              </div>

              {lineSection}
            </div>
          ) : edgeOnlySelected ? (
            <div className="property-stack">{lineSection}</div>
          ) : (
            <p className="panel-empty">{t('panel.noSelection')}</p>
          )}
        </div>
      </aside>
    </>
  )
}