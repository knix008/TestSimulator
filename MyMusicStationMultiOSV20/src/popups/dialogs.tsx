import type { PointerEvent as ReactPointerEvent } from 'react'
import { useState } from 'react'
import {
  AudioLines,
  Check,
  CircleAlert,
  Copy,
  FolderOpen,
  ImagePlus,
  Info,
  Link,
  Plus,
  Save,
  Settings,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { appVersion, buildDate } from '../appMeta'
import { copyTextToClipboard } from '../clipboard'
import type { Labels } from '../labels'
import { themeSwatch } from '../themes'
import {
  builtInWallpapers,
  defaultBuiltInWallpaperId,
  isBuiltInWallpaperId,
  wallpaperDisplayName,
} from '../wallpapers'
import appIconUrl from '../../asset/app-icon.svg'
import type {
  AlertPopupData,
  ConvertFormat,
  ConvertPopupData,
  ErrorPopupData,
  FolderProgressPopupData,
  OpenLinkPopupData,
  PopupAction,
  PopupData,
  PopupKind,
  SettingsPopupData,
} from './protocol'

type DragHandler = (event: ReactPointerEvent<HTMLElement>) => void

/** Top-right "X" shared by every dismissable dialog header. */
function DialogCloseButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="dialog-close" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      <X size={14} />
    </button>
  )
}

type DialogProps<K extends PopupKind> = {
  labels: Labels
  data: PopupData[K]
  send: (action: PopupAction[K]) => void
  /** Present when the dialog lives in its own OS window; the header then drags the window. */
  onDragStart?: DragHandler
}

export function ConvertDialog({ labels, data, send, onDragStart }: DialogProps<'convert'>) {
  const d: ConvertPopupData = data

  return (
    <section
      className="settings-dialog convert-dialog themed-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={d.title}
      onClick={(event) => event.stopPropagation()}
    >
      <header className="settings-header dialog-drag-handle" onPointerDown={onDragStart}>
        <AudioLines size={18} />
        <h2>{d.title}</h2>
        <DialogCloseButton label={labels.close} disabled={d.isConverting} onClick={() => send({ type: 'close' })} />
      </header>

      <div className="settings-body">
        <label className="settings-row">
          <span>{labels.convertTrack}</span>
          <strong className="convert-track-name">{d.trackTitle ?? labels.noTrack}</strong>
        </label>
        <label className="settings-row">
          <span>{labels.convertFormat}</span>
          <select
            value={d.format}
            aria-label={labels.convertFormat}
            disabled={d.isConverting || !d.trackTitle}
            onChange={(event) => send({ type: 'setFormat', format: event.target.value as ConvertFormat })}
          >
            {d.formats.map((format) => (
              <option key={format} value={format}>
                {format.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        {d.message && <p className={`convert-message${d.isConverting ? ' busy' : ''}`}>{d.message}</p>}
      </div>

      <div className="convert-actions">
        <button type="button" aria-label={labels.close} disabled={d.isConverting} onClick={() => send({ type: 'close' })}>
          {labels.close}
        </button>
        <button
          type="button"
          className="primary-action"
          aria-label={d.isConverting ? d.busyLabel : d.title}
          disabled={d.isConverting || !d.trackTitle}
          onClick={() => send({ type: 'run' })}
        >
          {d.isConverting ? d.busyLabel : d.title}
        </button>
      </div>
    </section>
  )
}

export function OpenLinkDialog({ labels, data, send, onDragStart }: DialogProps<'openLink'>) {
  const d: OpenLinkPopupData = data

  return (
    <section
      className="settings-dialog convert-dialog open-link-dialog themed-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={labels.openLink}
      onClick={(event) => event.stopPropagation()}
    >
      <header className="settings-header dialog-drag-handle" onPointerDown={onDragStart}>
        <Link size={18} />
        <h2>{labels.openLink}</h2>
        <DialogCloseButton label={labels.close} disabled={d.isOpening} onClick={() => send({ type: 'close' })} />
      </header>

      <div className="settings-body">
        <p className="open-link-hint">{labels.openLinkHint}</p>
        <label className="settings-row settings-row-stack">
          <span>{labels.remoteUrl}</span>
          <input
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={d.url}
            aria-label={labels.remoteUrl}
            placeholder="https://…"
            disabled={d.isOpening}
            onChange={(event) => send({ type: 'setUrl', url: event.target.value })}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && d.url.trim() && !d.isOpening) {
                event.preventDefault()
                send({ type: 'run' })
              }
            }}
          />
        </label>
        {d.message && <p className={`convert-message${d.isOpening ? ' busy' : ''}`}>{d.message}</p>}
      </div>

      <div className="convert-actions">
        <button type="button" aria-label={labels.close} disabled={d.isOpening} onClick={() => send({ type: 'close' })}>
          {labels.close}
        </button>
        <button
          type="button"
          className="primary-action"
          aria-label={d.isOpening ? labels.addRemoteBusy : labels.openLink}
          disabled={d.isOpening || !d.url.trim()}
          onClick={() => send({ type: 'run' })}
        >
          {d.isOpening ? labels.addRemoteBusy : labels.openLink}
        </button>
      </div>
    </section>
  )
}

export function SettingsDialog({ labels, data, send, onDragStart }: DialogProps<'settings'>) {
  const d: SettingsPopupData = data
  const selectedTheme = d.themes.find((theme) => theme.id === d.themeId)
  // The custom-theme editor is local UI state; only the final "add" reaches the main window.
  const [themeName, setThemeName] = useState('Custom')
  const [themeAccent, setThemeAccent] = useState('#4cc9a6')

  return (
    <section
      className="settings-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={labels.settings}
      onClick={(event) => event.stopPropagation()}
    >
      <header className="settings-header dialog-drag-handle" onPointerDown={onDragStart}>
        <Settings size={16} />
        <h2>{labels.settings}</h2>
        <DialogCloseButton label={labels.close} onClick={() => send({ type: 'close' })} />
      </header>

      <div className="settings-body">
        <section className="settings-section">
          <h3>{labels.settingsWindow}</h3>
          <label className="settings-toggle" title={labels.useSystemTrayHint}>
            <input
              type="checkbox"
              checked={d.useSystemTray}
              onChange={(event) => send({ type: 'setUseSystemTray', enabled: event.target.checked })}
            />
            <span>
              <strong>{labels.useSystemTray}</strong>
              <small>{labels.useSystemTrayHint}</small>
            </span>
          </label>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={d.reopenLastFolderOnStart}
              onChange={(event) => send({ type: 'setReopenLastFolderOnStart', enabled: event.target.checked })}
            />
            <span>
              <strong>{labels.reopenLastFolderOnStart}</strong>
            </span>
          </label>
        </section>

        <section className="settings-section">
          <h3>{labels.theme}</h3>
          <p className="settings-hint">{labels.themePickerHint}</p>
          <div className="theme-swatch-grid" role="listbox" aria-label={labels.theme}>
            {d.themes.map((theme) => {
              const swatch = themeSwatch(theme)
              const active = theme.id === d.themeId

              return (
                <button
                  type="button"
                  key={theme.id}
                  className={`theme-swatch${active ? ' active' : ''}`}
                  role="option"
                  aria-selected={active}
                  aria-label={theme.name}
                  title={theme.name}
                  onClick={() => send({ type: 'selectTheme', themeId: theme.id })}
                >
                  <span className="theme-swatch-preview" style={{ background: swatch.bg }}>
                    <span className="theme-swatch-panel" style={{ background: swatch.panel }}>
                      <span className="theme-swatch-text" style={{ background: swatch.text }} />
                      <span className="theme-swatch-control" style={{ background: swatch.control }} />
                    </span>
                    <span className="theme-swatch-primary" style={{ background: swatch.primary }} />
                    {active && (
                      <span className="theme-swatch-check" style={{ background: swatch.primary, color: swatch.bg }}>
                        <Check size={10} />
                      </span>
                    )}
                  </span>
                  <span className="theme-swatch-name">{theme.name}</span>
                </button>
              )
            })}
          </div>
          <div className="theme-editor compact">
            <input
              aria-label={labels.themeName}
              value={themeName}
              onChange={(event) => setThemeName(event.target.value)}
              onPointerDown={(event) => event.stopPropagation()}
            />
            <input
              aria-label={labels.accent}
              type="color"
              value={themeAccent}
              onChange={(event) => setThemeAccent(event.target.value)}
            />
            <button
              type="button"
              data-tooltip={labels.addTheme}
              aria-label={labels.addTheme}
              onClick={() => send({ type: 'addTheme', name: themeName, accent: themeAccent })}
            >
              <Plus size={14} />
            </button>
            <button
              type="button"
              data-tooltip={labels.deleteTheme}
              aria-label={labels.deleteTheme}
              disabled={!selectedTheme || selectedTheme.builtIn}
              onClick={() => send({ type: 'deleteTheme' })}
            >
              <Trash2 size={14} />
            </button>
            <button type="button" data-tooltip={labels.exportTheme} aria-label={labels.exportTheme} onClick={() => send({ type: 'exportTheme' })}>
              <Save size={14} />
            </button>
            <button type="button" data-tooltip={labels.importTheme} aria-label={labels.importTheme} onClick={() => send({ type: 'importTheme' })}>
              <Upload size={14} />
            </button>
          </div>
          {d.themeMessage && <p className="theme-message">{d.themeMessage}</p>}
        </section>

        <section className="settings-section">
          <h3>{labels.settingsAppearance}</h3>
          <label className="settings-toggle" title={labels.wallpaperEnabledHint}>
            <input
              type="checkbox"
              checked={d.wallpaperEnabled}
              onChange={(event) => send({ type: 'setWallpaperEnabled', enabled: event.target.checked })}
              disabled={!d.wallpaperPath && !defaultBuiltInWallpaperId}
            />
            <span>
              <strong>{labels.wallpaperEnabled}</strong>
              <small>{labels.wallpaperEnabledHint}</small>
            </span>
          </label>
          {builtInWallpapers.length > 0 && (
            <div className="wallpaper-built-in">
              <span className="wallpaper-built-in-label">{labels.wallpaperBuiltIn}</span>
              <div className="wallpaper-gallery" role="listbox" aria-label={labels.wallpaperBuiltIn}>
                {builtInWallpapers.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`wallpaper-thumb${d.wallpaperPath === item.id ? ' active' : ''}`}
                    role="option"
                    aria-selected={d.wallpaperPath === item.id}
                    aria-label={item.name}
                    onClick={() => send({ type: 'selectBuiltInWallpaper', wallpaperId: item.id })}
                  >
                    <img src={item.url} alt="" />
                    <span>{item.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="settings-row wallpaper-path-row">
            <small className="wallpaper-path" title={d.wallpaperPath || labels.wallpaperNone}>
              {d.wallpaperPath
                ? isBuiltInWallpaperId(d.wallpaperPath)
                  ? `${labels.wallpaperBuiltIn}: ${wallpaperDisplayName(d.wallpaperPath)}`
                  : `${labels.wallpaperCustom}: ${wallpaperDisplayName(d.wallpaperPath)}`
                : labels.wallpaperNone}
            </small>
            <div className="convert-actions">
              <button type="button" aria-label={labels.wallpaperChoose} onClick={() => send({ type: 'chooseWallpaper' })}>
                <ImagePlus size={12} />
                {labels.wallpaperChoose}
              </button>
              <button
                type="button"
                aria-label={labels.wallpaperClear}
                disabled={!d.wallpaperPath && !defaultBuiltInWallpaperId}
                onClick={() => send({ type: 'clearWallpaper' })}
              >
                {labels.wallpaperClear}
              </button>
            </div>
          </div>
          <label className="settings-row">
            <span>{labels.wallpaperDim}</span>
            <input
              type="range"
              min="0.15"
              max="0.9"
              step="0.01"
              value={d.wallpaperDim}
              aria-label={labels.wallpaperDim}
              disabled={!d.wallpaperEnabled || !d.wallpaperPath}
              onChange={(event) => send({ type: 'setWallpaperDim', value: Number(event.target.value) })}
            />
          </label>
          <label className="settings-row" title={labels.panelOpacityHint}>
            <span>
              {labels.panelOpacity}
              <small className="settings-inline-hint"> ({Math.round(d.panelOpacity * 100)}%)</small>
            </span>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.01"
              value={d.panelOpacity}
              aria-label={labels.panelOpacity}
              onChange={(event) => send({ type: 'setPanelOpacity', value: Number(event.target.value) })}
            />
          </label>
        </section>
      </div>

      <div className="settings-actions">
        <button type="button" aria-label={labels.close} onClick={() => send({ type: 'close' })}>
          {labels.close}
        </button>
        <button type="button" className="primary-action" aria-label={labels.saveSettings} onClick={() => send({ type: 'save' })}>
          <Save size={14} />
          {labels.saveSettings}
        </button>
      </div>
    </section>
  )
}

export function AppInfoDialog({ labels, send, onDragStart }: DialogProps<'appInfo'>) {
  return (
    <section
      className="app-info-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={labels.appInfo}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="app-info-header dialog-drag-handle" onPointerDown={onDragStart}>
        <img src={appIconUrl} alt="" />
        <div>
          <h2>{labels.appName}</h2>
          <p>{appVersion}</p>
        </div>
        <DialogCloseButton label={labels.close} onClick={() => send({ type: 'close' })} />
      </div>
      <dl>
        <div>
          <dt>{labels.version}</dt>
          <dd>{appVersion}</dd>
        </div>
        <div>
          <dt>{labels.build}</dt>
          <dd>{buildDate} / Tauri + React + Vite</dd>
        </div>
        <div>
          <dt>{labels.author}</dt>
          <dd>SHKWON(knix008@naver.com)</dd>
        </div>
        <div>
          <dt>{labels.copyright}</dt>
          <dd>{labels.copyrightText}</dd>
        </div>
      </dl>
      <button type="button" aria-label={labels.close} onClick={() => send({ type: 'close' })}>
        {labels.close}
      </button>
    </section>
  )
}

export function AlertDialog({ labels, data, send, onDragStart }: DialogProps<'alert'>) {
  const d: AlertPopupData = data

  return (
    <section
      className="alert-dialog themed-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-label={d.title}
      onClick={(event) => event.stopPropagation()}
    >
      <header className="alert-dialog-header dialog-drag-handle" onPointerDown={onDragStart}>
        <Info size={18} />
        <h2>{d.title}</h2>
        <DialogCloseButton label={labels.close} onClick={() => send({ type: 'close' })} />
      </header>
      <p className="alert-dialog-message">{d.message}</p>
      <button type="button" className="primary-action" aria-label={labels.confirm} onClick={() => send({ type: 'close' })}>
        {labels.confirm}
      </button>
    </section>
  )
}

export function ErrorDialog({ labels, data, send, onDragStart }: DialogProps<'error'>) {
  const d: ErrorPopupData = data
  // Copying must happen in the window that has focus, so the dialog does it itself.
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copyLabel = copyState === 'copied' ? labels.copied : copyState === 'failed' ? labels.copyFailed : labels.copyError

  return (
    <section
      className="error-dialog themed-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-label={labels.errorDialog}
      onClick={(event) => event.stopPropagation()}
    >
      <header className="error-dialog-header dialog-drag-handle" onPointerDown={onDragStart}>
        <CircleAlert size={18} />
        <div>
          <h2>{labels.errorDialog}</h2>
          <p>{labels.errorDialogHint}</p>
        </div>
        <DialogCloseButton label={labels.close} onClick={() => send({ type: 'close' })} />
      </header>
      <textarea
        className="error-dialog-details"
        readOnly
        value={d.message}
        aria-label={labels.errorDialog}
        onFocus={(event) => event.currentTarget.select()}
      />
      <div className="error-dialog-actions">
        <button
          type="button"
          className="error-copy-button"
          aria-label={copyLabel}
          onClick={() => {
            void copyTextToClipboard(d.message).then((ok) => setCopyState(ok ? 'copied' : 'failed'))
          }}
        >
          <Copy size={14} />
          {copyLabel}
        </button>
        <button type="button" aria-label={labels.close} onClick={() => send({ type: 'close' })}>
          {labels.close}
        </button>
      </div>
    </section>
  )
}

export function FolderProgressDialog({ labels, data, onDragStart }: DialogProps<'folderProgress'>) {
  const d: FolderProgressPopupData = data
  const loading = d.phase === 'loading'

  return (
    <section
      className="folder-progress-dialog themed-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-label={labels.folderProgressTitle}
    >
      <header className="folder-progress-header dialog-drag-handle" onPointerDown={onDragStart}>
        <FolderOpen size={18} />
        <h2>{labels.folderProgressTitle}</h2>
      </header>
      <p className="folder-progress-message">
        {d.phase === 'scanning' ? labels.folderScanning : `${labels.folderLoadingTracks} · ${d.loaded} / ${d.total}`}
      </p>
      <div
        className={`folder-progress-bar${d.phase === 'scanning' ? ' indeterminate' : ''}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={loading ? d.total : undefined}
        aria-valuenow={loading ? d.loaded : undefined}
      >
        <span
          className="folder-progress-fill"
          style={loading ? { width: `${d.total ? Math.round((d.loaded / d.total) * 100) : 0}%` } : undefined}
        />
      </div>
    </section>
  )
}

/** Picks the dialog component for a popup kind; the discriminant narrows the props. */
export function PopupDialog(props: { kind: PopupKind } & DialogProps<PopupKind>) {
  const { kind, ...rest } = props

  switch (kind) {
    case 'settings':
      return <SettingsDialog {...(rest as unknown as DialogProps<'settings'>)} />
    case 'convert':
      return <ConvertDialog {...(rest as unknown as DialogProps<'convert'>)} />
    case 'openLink':
      return <OpenLinkDialog {...(rest as unknown as DialogProps<'openLink'>)} />
    case 'appInfo':
      return <AppInfoDialog {...(rest as unknown as DialogProps<'appInfo'>)} />
    case 'alert':
      return <AlertDialog {...(rest as unknown as DialogProps<'alert'>)} />
    case 'error':
      return <ErrorDialog {...(rest as unknown as DialogProps<'error'>)} />
    case 'folderProgress':
      return <FolderProgressDialog {...(rest as unknown as DialogProps<'folderProgress'>)} />
    default:
      return null
  }
}
