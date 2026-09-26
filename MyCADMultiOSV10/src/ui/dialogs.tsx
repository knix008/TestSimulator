import { useState, type ReactNode } from 'react'
import { AUTHOR, buildInfo, POPUP_SIZE } from '../core/buildInfo'
import type { MessageKey } from '../core/i18n'
import { menuIcon, translate } from '../core/i18n'
import type { PrintPage, PrintScope, PageSetup } from '../core/print'
import type { Settings, ThemeId, FontStyleName, Lang } from '../core/settings'
import { USAGE } from '../core/usage'
import { WORKBENCHES } from '../core/workbenches'
import type { CadDocument } from '../core/model'

export function PopupFrame({
  kind,
  title,
  icon,
  children,
  onClose
}: {
  kind: keyof typeof POPUP_SIZE
  title: string
  icon: string
  children: ReactNode
  onClose: () => void
}) {
  const size = POPUP_SIZE[kind]
  return (
    <div className="popup-backdrop" data-testid={`popup-${kind}`}>
      <section
        className="popup"
        role="dialog"
        aria-label={title}
        data-fixed="true"
        style={{ width: size.width, height: size.height }}
      >
        <header className="popup-title" data-testid="popup-title">
          <span className="popup-heading">
            <span className="menu-icon" data-testid="popup-icon">{icon}</span>
            <strong>{title}</strong>
          </span>
          <button type="button" className="ghost" onClick={onClose} title="×">×</button>
        </header>
        <div className="popup-body">{children}</div>
      </section>
    </div>
  )
}

export function AboutDialog({ onClose, platform }: { onClose: () => void; platform: string }) {
  const info = buildInfo(platform)
  return (
    <PopupFrame kind="about" title={`${info.name} ${info.version}`} icon={menuIcon('about')} onClose={onClose}>
      <p className="row" data-testid="about-name">{info.name}</p>
      <p className="row" data-testid="about-version">{info.version}</p>
      <p className="row" data-testid="about-build">{info.buildDate}</p>
      <p className="row" data-testid="about-author">{AUTHOR}</p>
      <p className="row" data-testid="about-platform">{info.platform}</p>
    </PopupFrame>
  )
}

export function ErrorDialog({
  message,
  detail,
  label,
  copyLabel,
  closeLabel,
  onClose
}: {
  message: string
  detail: string
  label: string
  copyLabel: string
  closeLabel: string
  onClose: () => void
}) {
  const full = `${message}\n${detail}`.trim()
  return (
    <PopupFrame kind="error" title={label} icon={menuIcon('error')} onClose={onClose}>
      <p className="row" data-testid="error-message">{message}</p>
      <p className="row" data-testid="error-detail">{detail}</p>
      <div className="row popup-actions">
        <button
          type="button"
          data-testid="copy-error"
          title={copyLabel}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(full)
            } catch {
              const area = document.createElement('textarea')
              area.value = full
              document.body.appendChild(area)
              area.select()
              document.execCommand('copy')
              area.remove()
            }
            const node = document.querySelector('[data-testid="copied-error"]')
            if (node) node.textContent = full
          }}
        >{copyLabel}</button>
        <button type="button" onClick={onClose} title={closeLabel}>{closeLabel}</button>
        <span className="sr" data-testid="copied-error" />
      </div>
    </PopupFrame>
  )
}

export function ProgressDialog({ title, message, percent }: { title: string; message: string; percent: number }) {
  return (
    <PopupFrame kind="progress" title={title} icon={menuIcon('progress')} onClose={() => undefined}>
      <p className="row" data-testid="progress-message">{message}</p>
      <div className="row" data-testid="progress-percent">{Math.round(percent)}%</div>
      <div className="progress-track"><div className="progress-fill" style={{ width: `${percent}%` }} /></div>
    </PopupFrame>
  )
}

export function ConfirmDialog({
  message,
  saveLabel,
  discardLabel,
  cancelLabel,
  onSave,
  onDiscard,
  onCancel
}: {
  message: string
  saveLabel: string
  discardLabel: string
  cancelLabel: string
  onSave: () => void
  onDiscard: () => void
  onCancel: () => void
}) {
  return (
    <PopupFrame kind="confirm" title={saveLabel} icon={menuIcon('confirm')} onClose={onCancel}>
      <p className="row" data-testid="confirm-message">{message}</p>
      <div className="row popup-actions">
        <button type="button" data-testid="confirm-save" title={saveLabel} onClick={onSave}>{saveLabel}</button>
        <button type="button" data-testid="confirm-discard" title={discardLabel} onClick={onDiscard}>{discardLabel}</button>
        <button type="button" data-testid="confirm-cancel" title={cancelLabel} onClick={onCancel}>{cancelLabel}</button>
      </div>
    </PopupFrame>
  )
}

export function PrintDialog({
  t,
  docs,
  scope,
  customIds,
  selectedOnly,
  setup,
  pages,
  pageIndex,
  onScope,
  onToggleDoc,
  onSelectedOnly,
  onSetup,
  onPage,
  onPrint,
  onClose
}: {
  t: (key: MessageKey) => string
  docs: CadDocument[]
  scope: PrintScope
  customIds: string[]
  selectedOnly: boolean
  setup: PageSetup
  pages: PrintPage[]
  pageIndex: number
  onScope: (scope: PrintScope) => void
  onToggleDoc: (id: string) => void
  onSelectedOnly: (value: boolean) => void
  onSetup: (setup: PageSetup) => void
  onPage: (index: number) => void
  onPrint: () => void
  onClose: () => void
}) {
  const page = pages[pageIndex]
  return (
    <PopupFrame kind="print" title={t('preview')} icon={menuIcon('print')} onClose={onClose}>
      <div className="row" data-testid="print-scope">
        <span>{t('printScope')}</span>
        <label className="row-item"><input type="radio" name="scope" checked={scope === 'all'} onChange={() => onScope('all')} />{t('scopeAll')}</label>
        <label className="row-item"><input type="radio" name="scope" checked={scope === 'current'} onChange={() => onScope('current')} />{t('scopeCurrent')}</label>
        <label className="row-item"><input type="radio" name="scope" checked={scope === 'custom'} onChange={() => onScope('custom')} />{t('scopeCustom')}</label>
      </div>
      {scope === 'custom' ? docs.map((doc) => (
        <label className="row" key={doc.id}>
          <input type="checkbox" checked={customIds.includes(doc.id)} onChange={() => onToggleDoc(doc.id)} />
          <span>{doc.name}</span>
        </label>
      )) : null}
      <label className="row">
        <input type="checkbox" checked={selectedOnly} onChange={(event) => onSelectedOnly(event.target.checked)} />
        <span>{t('selectedOnly')}</span>
      </label>
      <div className="row" data-testid="page-setup">
        <span>{t('pageSetup')}</span>
        <select aria-label={t('paper')} value={setup.paper} onChange={(event) => onSetup({ ...setup, paper: event.target.value as PageSetup['paper'] })}>
          <option value="A4">A4</option>
          <option value="Letter">Letter</option>
        </select>
        <select aria-label={t('orientation')} value={setup.orientation} onChange={(event) => onSetup({ ...setup, orientation: event.target.value as PageSetup['orientation'] })}>
          <option value="portrait">{t('portrait')}</option>
          <option value="landscape">{t('landscape')}</option>
        </select>
        <input aria-label={t('margin')} type="number" min={0} max={40} value={setup.marginMm} onChange={(event) => onSetup({ ...setup, marginMm: Number(event.target.value) })} />
      </div>
      <div className="preview-page" data-testid="print-preview">
        <strong>{page ? page.title : t('preview')}</strong>
        <span>{page ? `${page.objectCount}` : '0'}</span>
        <span>{page ? page.summary : ''}</span>
      </div>
      <div className="row popup-actions">
        <button type="button" data-testid="print-prev" title={t('prevPage')} onClick={() => onPage(Math.max(0, pageIndex - 1))}>{'<'}</button>
        <button type="button" data-testid="print-next" title={t('nextPage')} onClick={() => onPage(Math.min(pages.length - 1, pageIndex + 1))}>{'>'}</button>
        <button type="button" data-testid="print-now" title={t('printNow')} onClick={onPrint}>{t('printNow')}</button>
        <button type="button" title={t('close')} onClick={onClose}>{t('close')}</button>
      </div>
    </PopupFrame>
  )
}

export function SettingsDialog({
  settings,
  fonts,
  t,
  onChange,
  onRemoveRecent,
  onClearRecent,
  onPickBackground,
  onClose
}: {
  settings: Settings
  fonts: string[]
  t: (key: MessageKey) => string
  onChange: (patch: Partial<Settings>) => void
  onRemoveRecent: (path: string) => void
  onClearRecent: () => void
  onPickBackground: (file: File) => void
  onClose: () => void
}) {
  const tabs = ['general', 'font', 'appearance', 'recent', 'viewport'] as const
  const [active, setActive] = useState<(typeof tabs)[number]>('general')
  return (
    <PopupFrame kind="settings" title={t('settings')} icon={menuIcon('settings')} onClose={onClose}>
      <div className="row tabs" data-testid="settings-tabs">
        {tabs.map((id) => (
          <button type="button" key={id} data-testid={`settings-tab-${id}`} className={active === id ? 'on' : ''} title={t(id as MessageKey)} onClick={() => setActive(id)}>
            {t(id as MessageKey)}
          </button>
        ))}
      </div>
      {active === 'general' ? (
        <>
          <label className="row"><span>{t('language')}</span>
            <select aria-label={t('language')} data-testid="language" value={settings.language} onChange={(event) => onChange({ language: event.target.value as Lang })}>
              <option value="ko">{t('korean')}</option>
              <option value="en">{t('english')}</option>
            </select>
          </label>
          <label className="row"><span>{t('theme')}</span>
            <select aria-label={t('theme')} data-testid="theme" value={settings.theme} onChange={(event) => onChange({ theme: event.target.value as ThemeId })}>
              <option value="dark">{t('dark')}</option>
              <option value="light">{t('light')}</option>
              <option value="blueprint">{t('blueprint')}</option>
              <option value="graphite">{t('graphite')}</option>
              <option value="contrast">{t('contrast')}</option>
            </select>
          </label>
        </>
      ) : null}
      {active === 'font' ? (
        <>
          <label className="row"><span>{t('font')}</span>
            <select aria-label={t('font')} data-testid="font-family" value={settings.fontFamily} onChange={(event) => onChange({ fontFamily: event.target.value })}>
              {fonts.map((font) => <option key={font} value={font}>{font}</option>)}
            </select>
          </label>
          <label className="row"><span>{t('fontSize')}</span>
            <input aria-label={t('fontSize')} data-testid="font-size" type="number" min={8} max={72} value={settings.fontSize} onChange={(event) => onChange({ fontSize: Number(event.target.value) })} />
          </label>
          <label className="row"><span>{t('fontStyle')}</span>
            <select aria-label={t('fontStyle')} data-testid="font-style" value={settings.fontStyle} onChange={(event) => onChange({ fontStyle: event.target.value as FontStyleName })}>
              <option value="normal">{t('normal')}</option>
              <option value="italic">{t('italic')}</option>
              <option value="bold">{t('bold')}</option>
              <option value="bold-italic">{t('boldItalic')}</option>
            </select>
          </label>
        </>
      ) : null}
      {active === 'appearance' ? (
        <>
          <label className="row"><span>{t('background')}</span>
            <input aria-label={t('background')} data-testid="background-file" type="file" accept="image/*" onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) onPickBackground(file)
            }} />
          </label>
          <label className="row"><span>{t('backgroundOpacity')}</span>
            <input aria-label={t('backgroundOpacity')} data-testid="background-opacity" type="range" min={0} max={100} value={settings.backgroundOpacity} onChange={(event) => onChange({ backgroundOpacity: Number(event.target.value) })} />
            <span>{settings.backgroundOpacity}</span>
          </label>
        </>
      ) : null}
      {active === 'recent' ? (
        <>
          <div className="row">
            <button type="button" data-testid="clear-recent" title={t('clearRecent')} onClick={onClearRecent}>{t('clearRecent')}</button>
          </div>
          {settings.recentFiles.map((file) => (
            <div className="row" key={file.path} data-testid="recent-row">
              <span className="ellipsis">{file.name}</span>
              <button type="button" title={t('remove')} data-testid={`remove-recent-${file.path}`} onClick={() => onRemoveRecent(file.path)}>{t('remove')}</button>
            </div>
          ))}
        </>
      ) : null}
      {active === 'viewport' ? (
        <>
          <label className="row"><span>{t('grid')}</span>
            <input aria-label={t('grid')} type="checkbox" checked={settings.grid} onChange={() => onChange({ grid: !settings.grid })} />
          </label>
          <label className="row"><span>{t('ruler')}</span>
            <input aria-label={t('ruler')} data-testid="ruler-toggle" type="checkbox" checked={settings.ruler} onChange={() => onChange({ ruler: !settings.ruler })} />
          </label>
          <label className="row"><span>{t('snap')}</span>
            <input aria-label={t('snap')} data-testid="snap" type="number" min={0} value={settings.snap} onChange={(event) => onChange({ snap: Number(event.target.value) })} />
          </label>
        </>
      ) : null}
      <div className="row popup-actions">
        <button type="button" title={t('close')} onClick={onClose}>{t('close')}</button>
      </div>
    </PopupFrame>
  )
}

export function PartDialog({
  title,
  op,
  t,
  onApply,
  onClose
}: {
  title: string
  op: string
  t: (key: MessageKey) => string
  onApply: (values: { width: number; height: number; length: number; angle: number; count: number; spacing: number; radius: number; sides: number; diameter: number; plane: 'xy' | 'xz' | 'yz'; axis: 'x' | 'y' | 'z' }) => void
  onClose: () => void
}) {
  const [width, setWidth] = useState(40)
  const [height, setHeight] = useState(30)
  const [length, setLength] = useState(20)
  const [angle, setAngle] = useState(360)
  const [count, setCount] = useState(4)
  const [spacing, setSpacing] = useState(50)
  const [radius, setRadius] = useState(4)
  const [sides, setSides] = useState(6)
  const [diameter, setDiameter] = useState(8)
  const [plane, setPlane] = useState<'xy' | 'xz' | 'yz'>('xy')
  const [axis, setAxis] = useState<'x' | 'y' | 'z'>('x')
  const sketch = op.startsWith('sketch')
  const show = (id: string) => {
    if (sketch) return id === 'width' || id === 'height' || id === 'plane' || (op === 'sketchPolygon' && id === 'sides')
    if (op === 'pad' || op === 'pocket' || op === 'loft' || op === 'pipe') return id === 'length'
    if (op === 'helix') return id === 'radius' || id === 'length' || id === 'count'
    if (op === 'revolve' || op === 'shaft' || op === 'groove' || op === 'draft' || op === 'rotateBody') return id === 'angle'
    if (op === 'fillet' || op === 'chamfer' || op === 'shell') return id === 'radius'
    if (op === 'linearPattern' || op === 'rectPattern') return id === 'count' || id === 'spacing' || id === 'axis'
    if (op === 'polarPattern') return id === 'count' || id === 'spacing'
    if (op === 'hole' || op === 'counterbore' || op === 'countersink') return id === 'diameter' || id === 'length'
    if (op === 'mirror' || op === 'refPlane') return id === 'plane' || (op === 'refPlane' && id === 'length')
    if (op === 'translate' || op === 'offsetMate' || op === 'parameter') return id === 'length' || (op === 'translate' && id === 'axis')
    if (op === 'scaleBody') return id === 'length'
    return false
  }
  return (
    <PopupFrame kind="part" title={title} icon={menuIcon(op)} onClose={onClose}>
      <p className="row" data-testid="part-op">{t('reference')}</p>
      {show('plane') ? <label className="row"><span>{t('planeLabel')}</span>
        <select aria-label={t('planeLabel')} data-testid="part-plane" value={plane} onChange={(event) => setPlane(event.target.value as 'xy' | 'xz' | 'yz')}>
          <option value="xy">XY</option><option value="xz">XZ</option><option value="yz">YZ</option>
        </select></label> : null}
      {show('width') ? <label className="row"><span>{t('width')}</span><input aria-label={t('width')} data-testid="part-width" type="number" value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label> : null}
      {show('height') ? <label className="row"><span>{t('height')}</span><input aria-label={t('height')} data-testid="part-height" type="number" value={height} onChange={(event) => setHeight(Number(event.target.value))} /></label> : null}
      {show('sides') ? <label className="row"><span>{t('sides')}</span><input aria-label={t('sides')} data-testid="part-sides" type="number" value={sides} onChange={(event) => setSides(Number(event.target.value))} /></label> : null}
      {show('length') ? <label className="row"><span>{t('length')}</span><input aria-label={t('length')} data-testid="part-length" type="number" value={length} onChange={(event) => setLength(Number(event.target.value))} /></label> : null}
      {show('angle') ? <label className="row"><span>{t('angle')}</span><input aria-label={t('angle')} data-testid="part-angle" type="number" value={angle} onChange={(event) => setAngle(Number(event.target.value))} /></label> : null}
      {show('radius') ? <label className="row"><span>{t('radius')}</span><input aria-label={t('radius')} data-testid="part-radius" type="number" value={radius} onChange={(event) => setRadius(Number(event.target.value))} /></label> : null}
      {show('diameter') ? <label className="row"><span>{t('diameter')}</span><input aria-label={t('diameter')} data-testid="part-diameter" type="number" value={diameter} onChange={(event) => setDiameter(Number(event.target.value))} /></label> : null}
      {show('count') ? <label className="row"><span>{t('count')}</span><input aria-label={t('count')} data-testid="part-count" type="number" value={count} onChange={(event) => setCount(Number(event.target.value))} /></label> : null}
      {show('spacing') ? <label className="row"><span>{t('spacing')}</span><input aria-label={t('spacing')} data-testid="part-spacing" type="number" value={spacing} onChange={(event) => setSpacing(Number(event.target.value))} /></label> : null}
      {show('axis') ? <label className="row"><span>{t('axis')}</span>
        <select aria-label={t('axis')} data-testid="part-axis" value={axis} onChange={(event) => setAxis(event.target.value as 'x' | 'y' | 'z')}>
          <option value="x">X</option><option value="y">Y</option><option value="z">Z</option>
        </select></label> : null}
      <div className="row popup-actions">
        <button type="button" data-testid="part-apply" title={t('apply')} onClick={() => onApply({ width, height, length, angle, count, spacing, radius, sides, diameter, plane, axis })}>{t('apply')}</button>
        <button type="button" title={t('close')} onClick={onClose}>{t('close')}</button>
      </div>
    </PopupFrame>
  )
}

export function UsageDialog({ lang, t, onClose }: { lang: Lang; t: (key: MessageKey) => string; onClose: () => void }) {
  const [active, setActive] = useState(WORKBENCHES[0].id)
  const lines = USAGE[active]?.[lang] ?? USAGE[active]?.en ?? []
  return (
    <PopupFrame kind="usage" title={t('usage')} icon={menuIcon('usage')} onClose={onClose}>
      <label className="row" data-testid="usage-tabs">
        <span>{t('usage')}</span>
        <select aria-label={t('usage')} value={active} onChange={(event) => setActive(event.target.value)}>
          {WORKBENCHES.map((item) => <option key={item.id} value={item.id}>{t(item.labelKey)}</option>)}
        </select>
      </label>
      {lines.map((line) => <p className="row" key={line} data-testid="usage-line">{line}</p>)}
      <div className="row popup-actions">
        <button type="button" title={t('close')} onClick={onClose}>{t('close')}</button>
      </div>
    </PopupFrame>
  )
}

export function tOf(lang: Lang) {
  return (key: MessageKey) => translate(lang, key)
}
