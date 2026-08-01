import { useTranslation } from 'react-i18next'
import type { DiagramDocument, DiagramNode, EndCap, LayoutDirection, LinePattern, LineType, ShapeType, TextFont, TextStyle, ThemeMode } from '../types'
import { AUTO_TEXT_COLOR, resolveTextColor } from '../constants/colors'
import { ColorPicker } from './ColorPicker'
import { IconLayout, IconLine, IconShape } from './Icons'
import { LinePreview } from './LinePreview'
import { ToolbarDropdown } from './ToolbarDropdown'

type Props = {
  doc: DiagramDocument
  selectedNode: DiagramNode | null
  currentLine: LineType
  currentLinePattern: LinePattern
  currentLineColor: string
  currentStartCap: EndCap
  currentEndCap: EndCap
  theme: ThemeMode
  onLayout: (layout: LayoutDirection) => void
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
  currentLine,
  currentLinePattern,
  currentLineColor,
  currentStartCap,
  currentEndCap,
  theme,
  onLayout,
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
  const layoutOptions =
    doc.mode === 'fishbone'
      ? [
          { value: 'ltr' as const, label: t('layout.ltr') },
          { value: 'rtl' as const, label: t('layout.rtl') },
        ]
      : [
          { value: 'radial' as const, label: t('layout.radial') },
          { value: 'ltr' as const, label: t('layout.ltr') },
          { value: 'rtl' as const, label: t('layout.rtl') },
          { value: 'ttb' as const, label: t('layout.ttb') },
        ]
  const textStyle = selectedNode?.textStyle ?? {
    fontFamily: 'notoSansKr' as TextFont,
    color: AUTO_TEXT_COLOR,
    bold: true,
    italic: false,
    underline: false,
    strike: false,
  }
  const isAutoTextColor = !textStyle.color || textStyle.color === AUTO_TEXT_COLOR

  return (
    <>
      <aside className="side-panel left-panel" aria-label={t('panel.navigator')}>
        <div className="panel-section">
          <div className="panel-heading">{t('panel.document')}</div>
          <dl className="panel-meta">
            <div>
              <dt>{t('status.mode')}</dt>
              <dd>{doc.mode === 'mindmap' ? t('toolbar.mindmap') : t('toolbar.fishbone')}</dd>
            </div>
            <div>
              <dt>{t('status.nodes')}</dt>
              <dd>{doc.nodes.length}</dd>
            </div>
          </dl>

          <div className="property-field panel-layout-field">
            <span>{t('toolbar.layout')}</span>
            <ToolbarDropdown
              label={t('toolbar.layout')}
              icon={<IconLayout />}
              value={doc.layout}
              onChange={onLayout}
              options={layoutOptions}
            />
          </div>
        </div>

        <div className="panel-section panel-section-fill">
          <div className="panel-heading">{t('panel.nodes')}</div>
          <div className="node-list" role="listbox" aria-label={t('panel.nodes')}>
            {doc.nodes.map((node) => (
              <button
                key={node.id}
                type="button"
                className={`node-list-item ${node.id === doc.selectedId ? 'selected' : ''}`}
                onClick={() => onSelect(node.id)}
                role="option"
                aria-selected={node.id === doc.selectedId}
              >
                <span className="node-list-swatch" style={{ background: node.color }} />
                <span className="node-list-text">{node.text}</span>
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
                icon={<IconShape />}
                value={selectedNode.shape}
                onChange={onShape}
                options={[
                  { value: 'rounded', label: t('shape.rounded') },
                  { value: 'rect', label: t('shape.rect') },
                  { value: 'ellipse', label: t('shape.ellipse') },
                  { value: 'diamond', label: t('shape.diamond') },
                  { value: 'parallelogram', label: t('shape.parallelogram') },
                ]}
              />

              <ColorPicker label={t('panel.shapeColor')} value={selectedNode.color} onChange={onColor} />

              <div className="panel-subheading">{t('panel.textStyle')}</div>

              <ToolbarDropdown
                label={t('panel.font')}
                value={textStyle.fontFamily}
                onChange={(fontFamily) => onTextStyle({ fontFamily })}
                options={[
                  { value: 'notoSansKr', label: t('font.notoSansKr') },
                  { value: 'outfit', label: t('font.outfit') },
                  { value: 'serif', label: t('font.serif') },
                  { value: 'mono', label: t('font.mono') },
                ]}
              />

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
            </div>
          ) : (
            <p className="panel-empty">{t('panel.noSelection')}</p>
          )}
        </div>
      </aside>
    </>
  )
}