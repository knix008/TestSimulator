import { useTranslation } from 'react-i18next'
import type { DiagramDocument, DiagramNode, EdgeSide, EndCap, LinePattern, LineType, Locale, MemoStyle, MemoTarget, ShapeType, TextStyle, ThemeMode } from '../types'
import { AUTO_TEXT_COLOR, LINE_WIDTH_MAX, LINE_WIDTH_MIN, resolveTextColor } from '../constants/colors'
import { ColorPicker } from './ColorPicker'
import { Icon, IconLine, IconShape } from './Icons'
import { DEFAULT_LINE_THEME } from '../lineThemes'
import { THEME_AREA_MIN } from '../settings'
import { LowerArea } from './DiagramThemes'
import { Stepper } from './controls'
import { MemoStyleFields } from './MemoEditor'
import { sanitizeMemo } from '../memo'
import { LinePreview, lineThemeOptions } from './LinePreview'
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

/** The divider above the lower area: dragging it, or its arrow keys, changes that area's height. */
function PanelSplitter({ height, label, onChange }: { height: number; label: string; onChange: (height: number) => void }) {
  const limit = (element: Element, wanted: number) => {
    // The list above always keeps some room, in whatever height the panel has.
    const panel = element.parentElement?.clientHeight ?? 800
    return Math.round(Math.max(THEME_AREA_MIN, Math.min(panel - 110, wanted)))
  }
  const begin = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    const element = event.currentTarget
    const startY = event.clientY
    const startHeight = element.nextElementSibling?.getBoundingClientRect().height ?? height
    const move = (moved: PointerEvent) => onChange(limit(element, startHeight + startY - moved.clientY))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }
  return (
    <div
      className="panel-splitter"
      data-panel-splitter=""
      role="separator"
      aria-orientation="horizontal"
      aria-label={label}
      aria-valuenow={height}
      title={label}
      tabIndex={0}
      onPointerDown={begin}
      onKeyDown={(event) => {
        const step = event.key === 'ArrowUp' ? 20 : event.key === 'ArrowDown' ? -20 : 0
        if (!step) return
        event.preventDefault()
        onChange(limit(event.currentTarget, height + step))
      }}
    />
  )
}

/** A panel's title row: its icon, its name and the button that folds it towards the window's edge. */
function PanelHead({ icon, title, side, foldLabel, onFold }: { icon: string; title: string; side: 'left' | 'right'; foldLabel: string; onFold: () => void }) {
  return (
    <div className="panel-head">
      <Icon name={icon} />
      <span className="panel-title">{title}</span>
      <button type="button" className="panel-fold" data-panel-fold={side} title={foldLabel} aria-label={foldLabel} onClick={onFold}>
        <Icon name={side === 'left' ? 'collapseLeft' : 'collapseRight'} size={14} />
      </button>
    </div>
  )
}

/** A folded panel: a strip with its icon and name, standing up. Pressing it opens the panel. */
function PanelStrip({ icon, title, side, label, onOpen }: { icon: string; title: string; side: 'left' | 'right'; label: string; onOpen: () => void }) {
  return (
    <aside className={`side-panel ${side}-panel folded`} aria-label={title}>
      <button type="button" className="panel-strip" data-panel-strip={side} title={label} aria-label={label} onClick={onOpen}>
        <Icon name={side === 'left' ? 'collapseRight' : 'collapseLeft'} size={14} />
        <Icon name={icon} />
        <span>{title}</span>
      </button>
    </aside>
  )
}

type Props = {
  leftOpen: boolean
  rightOpen: boolean
  onToggleLeft: () => void
  onToggleRight: () => void
  doc: DiagramDocument
  selectedNode: DiagramNode | null
  edgeOnlySelected: boolean
  currentLine: LineType
  currentLinePattern: LinePattern
  currentLineColor: string
  currentLineWidth: number
  currentStartCap: EndCap
  currentEndCap: EndCap
  currentFromSide: EdgeSide
  currentToSide: EdgeSide
  theme: ThemeMode
  onSelect: (id: string | null) => void
  onShape: (shape: ShapeType) => void
  onColor: (color: string) => void
  onLine: (line: LineType) => void
  onLinePattern: (pattern: LinePattern) => void
  onLineColor: (color: string) => void
  onLineWidth: (width: number) => void
  onLineStartCap: (cap: EndCap) => void
  onLineEndCap: (cap: EndCap) => void
  onLineFromSide: (side: EdgeSide) => void
  onLineToSide: (side: EdgeSide) => void
  onTextStyle: (style: Partial<TextStyle>) => void
  onTextChange: (id: string, text: string) => void
  onLineTheme: (id: string) => void
  onDiagramTheme: (id: string) => void
  onNodeIcon: (icon: string | undefined) => void
  onMemoChange: (target: MemoTarget, change: { note?: string; style?: Partial<MemoStyle>; remove?: boolean }) => void
  onMemoStyleAll: (style: Partial<MemoStyle>) => void
  onAddMemo: () => void
  onImageWidth: (id: string, width: number) => void
  themeAreaHeight: number
  onThemeAreaHeight: (height: number) => void
  language: Locale
}

export function SidePanels({
  leftOpen,
  rightOpen,
  onToggleLeft,
  onToggleRight,
  doc,
  selectedNode,
  edgeOnlySelected,
  currentLine,
  currentLinePattern,
  currentLineColor,
  currentLineWidth,
  currentStartCap,
  currentEndCap,
  theme,
  onSelect,
  onShape,
  onColor,
  onLine,
  onLinePattern,
  onLineColor,
  onLineWidth,
  onLineStartCap,
  onLineEndCap,
  onLineFromSide,
  onLineToSide,
  currentFromSide,
  currentToSide,
  onTextStyle,
  onTextChange,
  onLineTheme,
  onDiagramTheme,
  onNodeIcon,
  onMemoChange,
  onMemoStyleAll,
  onAddMemo,
  onImageWidth,
  themeAreaHeight,
  onThemeAreaHeight,
  language,
}: Props) {
  const { t, i18n } = useTranslation()
  const { fonts: systemFonts, load: loadFonts } = useSystemFonts()
  const sideOptions = [
    { value: 'auto' as const, label: t('side.auto') },
    { value: 'top' as const, label: t('side.top') },
    { value: 'bottom' as const, label: t('side.bottom') },
    { value: 'left' as const, label: t('side.left') },
    { value: 'right' as const, label: t('side.right') },
  ]

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

  const selectedEdge = doc.selectedEdgeId ? doc.edges.find((edge) => edge.id === doc.selectedEdgeId) : undefined
  // With several selected, the panel's values apply to all; text and memos stay one by one.
  const manyShapes = doc.selectedIds.length
  const manyLines = doc.selectedEdgeId ? (doc.selectedEdgeIds?.length ?? 1) : 0
  const manyOwners: { note?: string; noteStyle?: Partial<MemoStyle> }[] =
    manyShapes > 1 ? doc.nodes.filter((node) => doc.selectedIds.includes(node.id)) : manyLines > 1 ? doc.edges.filter((edge) => doc.selectedEdgeIds?.includes(edge.id)) : []
  const firstMemo = manyOwners.find((owner) => owner.note !== undefined)
  const manyMemos = firstMemo ? (
    <div className="memo-section" data-memo-section="many">
      <div className="panel-subheading">{t('panel.memo')}</div>
      <MemoStyleFields idPrefix="memoAll" style={sanitizeMemo(firstMemo.noteStyle)} onChange={onMemoStyleAll} />
    </div>
  ) : null

  // A memo of a shape or a line: a button until there is one, then its text and look.
  const memoSection = (target: MemoTarget, owner: { note?: string; noteStyle?: Partial<MemoStyle> }) => (
    <div className="memo-section" data-memo-section={target.kind}>
      <div className="panel-subheading">{t('panel.memo')}</div>
      {owner.note === undefined ? (
        <button type="button" className="style-toggle memo-add" data-command="memo-add" onClick={onAddMemo}><Icon name="memo" size={14} /> {t('memo.add')}</button>
      ) : (
        <>
          <textarea
            className="property-memo"
            rows={3}
            value={owner.note}
            placeholder={t('panel.memoPlaceholder')}
            onChange={(event) => onMemoChange(target, { note: event.target.value })}
          />
          <MemoStyleFields idPrefix="memo" style={sanitizeMemo(owner.noteStyle)} onChange={(style) => onMemoChange(target, { style })} />
          <button type="button" className="style-toggle memo-add" data-command="memo-remove" onClick={() => onMemoChange(target, { remove: true })}><Icon name="delete" size={14} /> {t('memo.remove')}</button>
        </>
      )}
    </div>
  )

  // Line/connector controls — shared by node selection and standalone edge
  // selection, so a line can be styled on its own.
  const lineSection = (
    <>
      <div className="panel-subheading">{t('panel.lineStyle')}</div>

      <ToolbarDropdown
        label={t('toolbar.lineTheme')}
        icon={<IconLine />}
        value={doc.lineTheme ?? DEFAULT_LINE_THEME}
        onChange={onLineTheme}
        options={lineThemeOptions(i18n.language === 'en' ? 'en' : 'ko')}
      />

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

      <div className="property-field">
        <span>{t('panel.lineWidth')}</span>
        <Stepper id="lineWidth" unit="px" min={LINE_WIDTH_MIN} max={LINE_WIDTH_MAX} value={currentLineWidth} onChange={onLineWidth} />
      </div>

      <div className="panel-subheading">{t('panel.connection')}</div>
      <ToolbarDropdown
        label={t('panel.fromSide')}
        icon={<IconLine />}
        value={currentFromSide}
        onChange={onLineFromSide}
        options={sideOptions}
      />
      <ToolbarDropdown
        label={t('panel.toSide')}
        icon={<IconLine />}
        value={currentToSide}
        onChange={onLineToSide}
        options={sideOptions}
      />
    </>
  )

  return (
    <>
      {!leftOpen ? <PanelStrip icon="panelStructure" title={t('panel.nodes')} side="left" label={t('panel.showLeft')} onOpen={onToggleLeft} /> : (
      <aside className="side-panel left-panel" aria-label={t('panel.navigator')}>
        <PanelHead icon="panelStructure" title={t('panel.nodes')} side="left" foldLabel={t('panel.hideLeft')} onFold={onToggleLeft} />
        <div className="panel-section panel-section-fill node-list-area">
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
        <PanelSplitter height={themeAreaHeight} label={t('panel.resizeThemes')} onChange={onThemeAreaHeight} />
        <LowerArea themeId={doc.diagramTheme} iconId={selectedNode?.icon} hasSelection={Boolean(selectedNode)} language={language} height={themeAreaHeight} onTheme={onDiagramTheme} onIcon={onNodeIcon} />
      </aside>
      )}

      {!rightOpen ? <PanelStrip icon="attributes" title={t('panel.properties')} side="right" label={t('panel.showRight')} onOpen={onToggleRight} /> : (
      <aside className="side-panel right-panel" aria-label={t('panel.properties')}>
        <PanelHead icon="attributes" title={t('panel.properties')} side="right" foldLabel={t('panel.hideRight')} onFold={onToggleRight} />
        <div className="panel-section panel-section-fill">
          {selectedNode ? (
            <div className="property-stack">
              {manyShapes <= 1 ? (
              <label className="property-field">
                <span>{t('panel.text')}</span>
                <input
                  type="text"
                  value={selectedNode.text}
                  onChange={(event) => onTextChange(selectedNode.id, event.target.value)}
                />
              </label>
              ) : null}

              {manyShapes > 1 ? <p className="panel-many" data-selection-count="">{t('panel.manyShapes', { count: manyShapes })}</p> : null}

              {manyShapes <= 1 && selectedNode.image ? (
                <div className="property-field">
                  <span>{t('panel.imageWidth')}</span>
                  <Stepper id="imageWidth" unit="px" step={10} min={20} max={4000} value={selectedNode.width} onChange={(width) => onImageWidth(selectedNode.id, width)} />
                </div>
              ) : null}

              {manyShapes <= 1 ? memoSection({ kind: 'node', id: selectedNode.id }, selectedNode) : manyMemos}

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
            <div className="property-stack">
              {manyLines > 1 ? <p className="panel-many" data-selection-count="">{t('panel.manyLines', { count: manyLines })}</p> : null}
              {selectedEdge && manyLines <= 1 ? memoSection({ kind: 'edge', id: selectedEdge.id }, selectedEdge) : manyMemos}
              {lineSection}
            </div>
          ) : (
            <p className="panel-empty">{t('panel.noSelection')}</p>
          )}
        </div>
      </aside>
      )}
    </>
  )
}