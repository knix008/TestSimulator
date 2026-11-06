import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DiagramDocument, DiagramNode, EdgeSide, EndCap, LinePattern, LineType, Locale, MemoStyle, MemoTarget, ShapeType, TextStyle, ThemeMode } from '../types'
import { AUTO_TEXT_COLOR, INK_COLORS, LINE_WIDTH_MAX, LINE_WIDTH_MIN, NODE_COLORS, resolveTextColor } from '../constants/colors'
import { ColorPalette, IconPalette, PanelGroup, SideIcon } from './Palette'
import { Icon } from './Icons'
import { DEFAULT_LINE_THEME } from '../lineThemes'
import { SHAPES, THEME_AREA_MIN } from '../settings'
import { LowerArea, type LowerTab } from './DiagramThemes'
import { Stepper } from './controls'
import { MemoStyleFields } from './MemoEditor'
import { sanitizeMemo } from '../memo'
import { LinePreview, LineThemePreview } from './LinePreview'
import { LINE_THEMES } from '../lineThemes'
import { ToolbarDropdown } from './ToolbarDropdown'
import { ShapePreview } from './ShapePreview'
import { useSystemFonts } from '../hooks/useSystemFonts'

const PRESET_FONT_VALUES = ['notoSansKr', 'outfit', 'serif', 'mono']

/** The divider above the lower area: dragging it, or its arrow keys, changes that area's height. */
function PanelSplitter({ height, label, onChange }: { height: number | null; label: string; onChange: (height: number) => void }) {
  const measured = (element: Element) => height ?? element.nextElementSibling?.getBoundingClientRect().height ?? THEME_AREA_MIN
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
    const startHeight = element.nextElementSibling?.getBoundingClientRect().height ?? measured(element)
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
      aria-valuenow={height ?? undefined}
      title={label}
      tabIndex={0}
      onPointerDown={begin}
      onKeyDown={(event) => {
        const step = event.key === 'ArrowUp' ? 20 : event.key === 'ArrowDown' ? -20 : 0
        if (!step) return
        event.preventDefault()
        onChange(limit(event.currentTarget, measured(event.currentTarget) + step))
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
function PanelStrip({ icon, title, side, label, more = [], onOpen }: { icon: string; title: string; side: 'left' | 'right'; label: string; more?: { id: string; icon: string; title: string; onOpen: () => void }[]; onOpen: () => void }) {
  return (
    <aside className={`side-panel ${side}-panel folded`} aria-label={title}>
      <div className="panel-strip-stack">
        <button type="button" className="panel-strip" data-panel-strip={side} title={label} aria-label={label} onClick={onOpen}>
          <Icon name={side === 'left' ? 'collapseRight' : 'collapseLeft'} size={14} />
          <Icon name={icon} />
          <span>{title}</span>
        </button>
        {more.map((item) => (
          <button type="button" key={item.id} className="panel-strip" data-panel-strip-tab={item.id} title={item.title} aria-label={item.title} onClick={item.onOpen}>
            <Icon name={item.icon} />
            <span>{item.title}</span>
          </button>
        ))}
      </div>
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
  onToggleNode: (id: string) => void
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
  themeAreaHeight: number | null
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
  onToggleNode,
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
  const { t } = useTranslation()
  const [lowerTab, setLowerTab] = useState<LowerTab>('themes')
  const openOnTab = (tab: LowerTab) => {
    setLowerTab(tab)
    onToggleLeft()
  }
  const { fonts: systemFonts, load: loadFonts } = useSystemFonts()
  const sideOptions = (['auto', 'top', 'bottom', 'left', 'right'] as const).map((value) => ({ value, label: t(`side.${value}`), icon: <SideIcon side={value} /> }))
  const capOptions = (place: 'startCap' | 'endCap') => (['none', 'arrow', 'dot', 'diamond'] as const).map((value) => ({ value, label: t(`cap.${value}`), icon: <LinePreview lineType="straight" {...{ [place]: value }} /> }))

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
    manyShapes > 1 || manyLines > 1 ? [...doc.nodes.filter((node) => doc.selectedIds.includes(node.id)), ...doc.edges.filter((edge) => doc.selectedEdgeId && doc.selectedEdgeIds?.includes(edge.id))] : []
  const firstMemo = manyOwners.find((owner) => owner.note !== undefined)
  const manyMemos = firstMemo ? (
    <PanelGroup id="memo" icon="memo" title={t('panel.groupMemo')}>
      <div className="memo-section" data-memo-section="many">
        <MemoStyleFields idPrefix="memoAll" style={sanitizeMemo(firstMemo.noteStyle)} onChange={onMemoStyleAll} />
      </div>
    </PanelGroup>
  ) : null

  // A memo of a shape or a line: a button until there is one, then its text and look.
  const memoSection = (target: MemoTarget, owner: { note?: string; noteStyle?: Partial<MemoStyle> }) => (
    <PanelGroup id="memo" icon="memo" title={t('panel.groupMemo')}>
    <div className="memo-section" data-memo-section={target.kind}>
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
    </PanelGroup>
  )

  // Line/connector controls — shared by node selection and standalone edge
  // selection, so a line can be styled on its own.
  const lineSection = (
    <>
      <PanelGroup id="line" icon="line" title={t('panel.groupLine')}>
        <IconPalette id="lineTheme" label={t('toolbar.lineTheme')} columns={5} value={doc.lineTheme ?? DEFAULT_LINE_THEME} onChange={onLineTheme} options={LINE_THEMES.map((item) => ({ value: item.id, label: item[language], icon: <LineThemePreview theme={item} /> }))} />
        <IconPalette id="lineShape" inline label={t('panel.lineShape')} columns={4} value={currentLine} onChange={onLine} options={(['curve', 'straight', 'elbow', 'root'] as const).map((value) => ({ value, label: t(`line.${value}`), icon: <LinePreview lineType={value} /> }))} />
        <IconPalette id="linePattern" inline label={t('panel.linePattern')} columns={4} value={currentLinePattern} onChange={onLinePattern} options={(['solid', 'dashed', 'dotted', 'dashdot'] as const).map((value) => ({ value, label: t(`linePattern.${value}`), icon: <LinePreview lineType="straight" pattern={value} /> }))} />
        <IconPalette id="startCap" inline label={t('panel.startCap')} columns={4} value={currentStartCap} onChange={onLineStartCap} options={capOptions('startCap')} />
        <IconPalette id="endCap" inline label={t('panel.endCap')} columns={4} value={currentEndCap} onChange={onLineEndCap} options={capOptions('endCap')} />
        <ColorPalette id="lineColor" label={t('panel.lineColor')} value={currentLineColor} colors={INK_COLORS} onChange={onLineColor} />
        <div className="property-field property-inline">
          <span>{t('panel.lineWidth')}</span>
          <Stepper id="lineWidth" unit="px" min={LINE_WIDTH_MIN} max={LINE_WIDTH_MAX} value={currentLineWidth} onChange={onLineWidth} />
        </div>
      </PanelGroup>
      <PanelGroup id="connection" icon="align" title={t('panel.groupConnection')}>
        <IconPalette id="fromSide" inline label={t('panel.fromSide')} columns={5} value={currentFromSide} onChange={onLineFromSide} options={sideOptions} />
        <IconPalette id="toSide" inline label={t('panel.toSide')} columns={5} value={currentToSide} onChange={onLineToSide} options={sideOptions} />
      </PanelGroup>
    </>
  )

  return (
    <>
      {!leftOpen ? <PanelStrip icon="panelStructure" title={t('panel.nodes')} side="left" label={t('panel.showLeft')} onOpen={onToggleLeft} more={[{ id: 'themes', icon: 'color', title: t('toolbar.diagramTheme'), onOpen: () => openOnTab('themes') }, { id: 'icons', icon: 'star', title: t('toolbar.icons'), onOpen: () => openOnTab('icons') }]} /> : (
      <aside className="side-panel left-panel" aria-label={t('panel.navigator')}>
        <PanelHead icon="panelStructure" title={t('panel.nodes')} side="left" foldLabel={t('panel.hideLeft')} onFold={onToggleLeft} />
        <div className="panel-section panel-section-fill node-list-area">
          <div className="node-tree" role="tree" aria-label={t('panel.nodes')}>
            {treeRows.map(({ node, depth, lineage }) => (
              <button
                key={node.id}
                type="button"
                className={`node-tree-item ${doc.selectedIds.includes(node.id) ? 'selected' : ''}`}
                onClick={(event) => (event.ctrlKey || event.shiftKey || event.metaKey ? onToggleNode(node.id) : onSelect(node.id))}
                role="treeitem"
                aria-level={depth + 1}
                aria-selected={doc.selectedIds.includes(node.id)}
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
        <LowerArea themeId={doc.diagramTheme} iconId={selectedNode?.icon} hasSelection={Boolean(selectedNode)} language={language} height={themeAreaHeight} onTheme={onDiagramTheme} onIcon={onNodeIcon} tab={lowerTab} onTab={setLowerTab} />
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
              {manyLines > 0 ? <p className="panel-many" data-line-count="">{t('panel.manyLines', { count: manyLines })}</p> : null}

              {manyShapes <= 1 && selectedNode.image ? (
                <div className="property-field">
                  <span>{t('panel.imageWidth')}</span>
                  <Stepper id="imageWidth" unit="px" step={10} min={20} max={4000} value={selectedNode.width} onChange={(width) => onImageWidth(selectedNode.id, width)} />
                </div>
              ) : null}

              <PanelGroup id="shape" icon="shape" title={t('panel.groupShape')}>
                <IconPalette id="shape" label={t('panel.shapeKind')} columns={6} value={selectedNode.shape} onChange={onShape} options={SHAPES.map((value) => ({ value, label: t(`shape.${value}`), icon: <ShapePreview shape={value} /> }))} />
                <ColorPalette id="shapeColor" label={t('panel.shapeColor')} value={selectedNode.color} colors={NODE_COLORS} onChange={onColor} />
              </PanelGroup>

              <PanelGroup id="text" icon="fontFile" title={t('panel.groupText')}>
                <ToolbarDropdown
                  label={t('panel.font')}
                  value={textStyle.fontFamily}
                  onOpen={loadFonts}
                  onChange={(fontFamily) => onTextStyle({ fontFamily })}
                  options={fontOptions}
                />

                <div className="property-field">
                  <span>{t('panel.fontSize')}</span>
                  <Stepper id="panelFontSize" unit="px" min={8} max={120} value={textStyle.fontSize} onChange={(fontSize) => onTextStyle({ fontSize })} />
                </div>

                <div className="text-style-row" aria-label={t('panel.textStyle')}>
                  <button type="button" title={t('style.bold')} aria-label={t('style.bold')} className={`style-toggle ${textStyle.bold ? 'active' : ''}`} onClick={() => onTextStyle({ bold: !textStyle.bold })}>B</button>
                  <button type="button" title={t('style.italic')} aria-label={t('style.italic')} className={`style-toggle italic ${textStyle.italic ? 'active' : ''}`} onClick={() => onTextStyle({ italic: !textStyle.italic })}>I</button>
                  <button type="button" title={t('style.underline')} aria-label={t('style.underline')} className={`style-toggle underline ${textStyle.underline ? 'active' : ''}`} onClick={() => onTextStyle({ underline: !textStyle.underline })}>U</button>
                  <button type="button" title={t('style.strike')} aria-label={t('style.strike')} className={`style-toggle strike ${textStyle.strike ? 'active' : ''}`} onClick={() => onTextStyle({ strike: !textStyle.strike })}>S</button>
                  <button type="button" className={`style-toggle auto-color ${isAutoTextColor ? 'active' : ''}`} onClick={() => onTextStyle({ color: AUTO_TEXT_COLOR })} title={t('panel.textColorAutoHint')}>{t('panel.textColorAuto')}</button>
                </div>

                <ColorPalette id="textColor" label={t('panel.textColor')} value={resolveTextColor(textStyle.color, theme)} colors={INK_COLORS} onChange={(color) => onTextStyle({ color })} />
              </PanelGroup>

              {lineSection}

              {manyShapes <= 1 ? memoSection({ kind: 'node', id: selectedNode.id }, selectedNode) : manyMemos}
            </div>
          ) : edgeOnlySelected ? (
            <div className="property-stack">
              {manyLines > 1 ? <p className="panel-many" data-selection-count="">{t('panel.manyLines', { count: manyLines })}</p> : null}
              {selectedEdge && manyLines <= 1 ? <p className="panel-many" data-line-between="">{t('panel.lineBetween', { from: doc.nodes.find((node) => node.id === selectedEdge.from)?.text ?? '', to: doc.nodes.find((node) => node.id === selectedEdge.to)?.text ?? '' })}</p> : null}
              {lineSection}
              {selectedEdge && manyLines <= 1 ? memoSection({ kind: 'edge', id: selectedEdge.id }, selectedEdge) : manyMemos}
            </div>
          ) : (
            <div className="panel-welcome">
              <p className="panel-empty">{t('panel.noSelection')}</p>
              <ul className="panel-hints" data-panel-hints="">
                {([['shape', 'hintClick'], ['edit', 'hintDouble'], ['add', 'hintMany'], ['child', 'hintRight'], ['zoomIn', 'hintWheel']] as const).map(([icon, key]) => (
                  <li key={key}><Icon name={icon} size={14} /><span>{t(`panel.${key}`)}</span></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </aside>
      )}
    </>
  )
}