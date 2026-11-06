// The lower area of the left panel: the mind map theme gallery and the list of icons, and the
// small picture of a theme that the gallery and the toolbar's drop-down share.
import { useTranslation } from 'react-i18next'
import { DEFAULT_DIAGRAM_THEME, DIAGRAM_THEMES, type DiagramTheme } from '../diagramThemes'
import { lineThemeById } from '../lineThemes'
import { NODE_ICONS, type NodeIcon } from '../nodeIcons'
import type { Locale } from '../types'
import { shapePath } from '../utils/shapePath'
import { Icon } from './Icons'

const AUTO_TEXT = '#1f2937'

/** Node sizes for shapePath, whose corners are in canvas pixels, and the scale that fits them here. */
const PICTURE_SCALE = 0.1
const PICTURE_ROOT = { width: 160, height: 100 }
const PICTURE_BRANCH = { width: 150, height: 70 }

/** A centre with three branches, in the theme's colours and shapes: the last is what grows further out. */
export function DiagramThemePicture({ theme, width = 44, height = 28 }: { theme: DiagramTheme; width?: number; height?: number }) {
  const colors = theme.byLevel ? [theme.palette[1], theme.palette[1], theme.palette[1]] : [theme.palette[0], theme.palette[1 % theme.palette.length], theme.palette[2 % theme.palette.length]]
  const lines = lineThemeById(theme.line).palette
  const rows = [5, 14, 23]
  return (
    <svg className="diagram-theme-picture" width={width} height={height} viewBox="0 0 44 28" aria-hidden="true">
      <rect width="44" height="28" rx="3" fill="var(--bg)" />
      {rows.map((y, index) => <path key={y} d={`M16 14 C22 14 20 ${y} 26 ${y}`} fill="none" stroke={lines[index % lines.length]} strokeWidth="1.2" />)}
      {rows.map((y, index) => (
        <path
          key={y}
          data-picture-shape={index === 2 ? theme.outer ?? theme.shape : theme.shape}
          transform={`translate(26 ${y - 3.5}) scale(${PICTURE_SCALE})`}
          d={shapePath(index === 2 ? theme.outer ?? theme.shape : theme.shape, 0, 0, PICTURE_BRANCH.width, PICTURE_BRANCH.height)}
          fill={colors[index]}
          stroke="var(--line)"
          strokeWidth="5"
        />
      ))}
      <path data-picture-shape={theme.rootShape} transform={`translate(2 9) scale(${PICTURE_SCALE})`} d={shapePath(theme.rootShape, 0, 0, PICTURE_ROOT.width, PICTURE_ROOT.height)} fill={theme.root} />
      <rect x="6" y="13.2" width="8" height="1.6" rx="0.8" fill={theme.rootText === 'auto' ? AUTO_TEXT : theme.rootText} />
    </svg>
  )
}

export const diagramThemeOptions = (language: Locale) =>
  DIAGRAM_THEMES.map((theme) => ({ value: theme.id, label: theme[language], icon: <DiagramThemePicture theme={theme} width={33} height={21} /> }))

/** One icon of the list, as an element for a menu or a tile. */
export function NodeIconPicture({ item, size = 20 }: { item: NodeIcon; size?: number }) {
  return <svg className="node-icon-picture" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={`var(--node-icon-${item.id})`} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: item.body }} />
}

type Props = {
  themeId: string | undefined
  iconId: string | undefined
  hasSelection: boolean
  language: Locale
  /** In pixels; null shares the panel's height evenly with the node list. */
  height: number | null
  onTheme: (id: string) => void
  onIcon: (id: string | undefined) => void
  /** Which tab shows: the folded panel's strip can choose it too. */
  tab: LowerTab
  onTab: (tab: LowerTab) => void
}

export type LowerTab = 'themes' | 'icons'

export function LowerArea({ themeId, iconId, hasSelection, language, height, onTheme, onIcon, tab, onTab }: Props) {
  const { t } = useTranslation()
  const current = themeId ?? DEFAULT_DIAGRAM_THEME
  return (
    <section className="diagram-themes" style={height === null ? { flex: '1 1 0' } : { flexBasis: height }}>
      <div className="panel-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'themes'} className={tab === 'themes' ? 'on' : undefined} data-lower-tab="themes" onClick={() => onTab('themes')}><Icon name="color" size={14} /><span>{t('toolbar.diagramTheme')}</span></button>
        <button type="button" role="tab" aria-selected={tab === 'icons'} className={tab === 'icons' ? 'on' : undefined} data-lower-tab="icons" onClick={() => onTab('icons')}><Icon name="star" size={14} /><span>{t('toolbar.icons')}</span></button>
      </div>
      {tab === 'themes' ? (
        <div className="diagram-theme-grid" role="radiogroup" aria-label={t('toolbar.diagramTheme')}>
          {DIAGRAM_THEMES.map((theme) => (
            <button type="button" role="radio" key={theme.id} aria-checked={theme.id === current} className={theme.id === current ? 'diagram-theme-tile on' : 'diagram-theme-tile'} data-diagram-theme={theme.id} title={theme[language]} onClick={() => onTheme(theme.id)}>
              <DiagramThemePicture theme={theme} />
              <span>{theme[language]}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="node-icon-area">
          {/* "No icon" stands apart, so that the icons fill every row of the grid. */}
          <div className="node-icon-head">
            <p className="node-icon-hint">{hasSelection ? t('icons.hint') : t('icons.pickFirst')}</p>
            <button type="button" className={!iconId ? 'node-icon-tile on' : 'node-icon-tile'} data-node-icon="" title={t('icons.none')} disabled={!hasSelection} onClick={() => onIcon(undefined)}><Icon name="close" size={16} /></button>
          </div>
          <div className="node-icon-grid">
            {NODE_ICONS.map((item) => (
              <button type="button" key={item.id} className={iconId === item.id ? 'node-icon-tile on' : 'node-icon-tile'} data-node-icon={item.id} title={item[language]} disabled={!hasSelection} onClick={() => onIcon(item.id)}>
                <NodeIconPicture item={item} />
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
