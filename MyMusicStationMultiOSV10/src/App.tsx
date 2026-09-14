import type { CSSProperties, ChangeEvent, FormEvent, MouseEvent as ReactMouseEvent, PointerEvent } from 'react'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { appCacheDir, appConfigDir, join, tempDir } from '@tauri-apps/api/path'
import { currentMonitor, getCurrentWindow, LogicalSize, PhysicalPosition } from '@tauri-apps/api/window'
import { open, save } from '@tauri-apps/plugin-dialog'
import { exists, mkdir, readDir, readFile, readTextFile, remove, writeFile, writeTextFile } from '@tauri-apps/plugin-fs'
import {
  ArrowLeftRight,
  AudioWaveform,
  Blend,
  ChartColumn,
  CloudDownload,
  Download,
  FileAudio,
  FolderOpen,
  Info,
  Languages,
  Link,
  Maximize2,
  Minimize2,
  Minus,
  Palette,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Settings,
  SkipBack,
  SkipForward,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { parseBuffer, selectCover, type IAudioMetadata } from 'music-metadata'
import {
  type AppSettings,
  saveAppSettingsDurable,
  type Language,
  type SpectrumColorOrder,
  type SpectrumStyle,
} from './appSettings'
import { buildLogBands, drawSpectrumFrame, nextSpectrumStyle, spectrumBandCount } from './spectrumModes'
import {
  buildThemeFile,
  captureThemeVars,
  parseThemeFile,
  serializeThemeFile,
  themeFileExtension,
  themeFileToDefinition,
  themeVarKeys,
} from './themeFile'
import { type ThemeDefinition, themes as builtInThemes } from './themes'
import {
  defaultBuiltInWallpaperId,
  findBuiltInWallpaper,
  isBuiltInWallpaperId,
  wallpaperDisplayName,
  wallpaperFileExtensions,
  wallpaperMimeFromPath,
} from './wallpapers'
import { text } from './labels'
import { PopupHost } from './popups/PopupHost'
import { closeAllPopupWindows } from './popups/popupWindows'
import type {
  ConvertPopupAction,
  ConvertPopupData,
  ExtractPopupAction,
  ExtractPopupData,
  PopupChrome,
  SettingsPopupAction,
  SettingsPopupData,
} from './popups/protocol'
import appIconUrl from '../asset/app-icon.svg'
import './App.css'

type Track = {
  id: string
  title: string
  source: string
  origin: 'local' | 'remote'
  filePath?: string
  remoteUrl?: string
  /** remote playback: stream URL, extracted file, or deferred extract on play */
  mode?: 'stream' | 'extracted' | 'pending'
  artist?: string
  album?: string
  year?: number
  genre?: string
  trackNumber?: number
  durationSeconds?: number
  bitrate?: number
  sampleRate?: number
  codec?: string
  container?: string
  artworkUrl?: string
}

type PlaylistFile = {
  format: 'my-music-station-playlist'
  version: 1
  tracks: Array<Pick<Track, 'title' | 'source' | 'origin' | 'filePath' | 'remoteUrl'>>
}

const audioExtensions = ['.mp3', '.flac', '.wav', '.ogg', '.aac', '.m4a', '.webm', '.opus', '.wma', '.aiff', '.aif']
const convertFormats = ['mp3', 'wav', 'flac', 'ogg', 'm4a'] as const
type ConvertFormat = (typeof convertFormats)[number]
const extractFormats = ['mp3', 'm4a', 'opus', 'flac', 'wav', 'ogg', 'aac'] as const
type ExtractFormat = (typeof extractFormats)[number]
const extractQualities = ['high', 'medium', 'low'] as const
type ExtractQuality = (typeof extractQualities)[number]
type TransportOverlay = 'play' | 'pause' | 'stop' | 'spectrum'
type StatusKind = 'info' | 'success' | 'error' | 'busy'
const customThemesKey = 'myMusicStation.customThemes'
const lastMusicFolderKey = 'myMusicStation.lastMusicFolder'
const lastPlaylistKey = 'myMusicStation.lastPlaylist'
// The working playlist is auto-saved here on every change so the exact list
// (folders, added files, URLs) is restored on the next launch.
const sessionPlaylistKey = 'myMusicStation.sessionPlaylist'
// WebView2 may drop localStorage writes when the process exits from the tray,
// so the session playlist is mirrored to a file in the app config directory.
const sessionPlaylistFileName = 'session-playlist.json'
// Media-page links (YouTube etc.) are extracted into this cache folder under
// the app cache dir, keyed by URL hash, so a restart can replay them without
// downloading again.
const remoteCacheFolderName = 'remote-audio'
const remoteCacheFormat = 'm4a'
const defaultMusicFolder = 'D:\\Home\\Music'
const normalWindowSize = { width: 835, height: 496 }
const miniWindowSize = { width: 340, height: 180 }

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds)) {
    return '0:00'
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)

  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

const formatBitrate = (bitrate?: number) => (bitrate ? `${Math.round(bitrate / 1000)} kbps` : '')
const formatSampleRate = (sampleRate?: number) => (sampleRate ? `${(sampleRate / 1000).toFixed(sampleRate % 1000 === 0 ? 0 : 1)} kHz` : '')

const loadCustomThemes = (): ThemeDefinition[] => {
  try {
    return JSON.parse(localStorage.getItem(customThemesKey) ?? '[]') as ThemeDefinition[]
  } catch {
    return []
  }
}

const getAudioMimeType = (fileName: string) => {
  const extension = fileName.toLowerCase().match(/\.[^.]+$/)?.[0]

  switch (extension) {
    case '.mp3':
      return 'audio/mpeg'
    case '.flac':
      return 'audio/flac'
    case '.wav':
      return 'audio/wav'
    case '.ogg':
      return 'audio/ogg'
    case '.aac':
      return 'audio/aac'
    case '.m4a':
      return 'audio/mp4'
    case '.webm':
      return 'audio/webm'
    case '.opus':
      return 'audio/opus'
    case '.wma':
      return 'audio/x-ms-wma'
    case '.aiff':
    case '.aif':
      return 'audio/aiff'
    default:
      return 'application/octet-stream'
  }
}

const directAudioExtensionPattern = /\.(mp3|flac|wav|ogg|aac|m4a|opus|webm|wma|aiff|aif)(\?|#|$)/i

const looksLikeDirectAudioUrl = (url: string) => directAudioExtensionPattern.test(url)

const isAudioContentType = (contentType: string | null | undefined) => {
  if (!contentType) {
    return false
  }

  const mime = contentType.split(';')[0]?.trim().toLowerCase() || ''
  return mime.startsWith('audio/') || mime === 'application/ogg'
}

const looksLikeHtmlPayload = (bytes: Uint8Array) => {
  const head = new TextDecoder().decode(bytes.slice(0, 96)).trimStart().toLowerCase()
  return head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('<head')
}

const mediaPageHostMarkers = [
  'youtube.com',
  'youtu.be',
  'instagram.com',
  'tiktok.com',
  'vimeo.com',
  'facebook.com',
  'fb.watch',
  'twitter.com',
  'x.com',
  'twitch.tv',
  'bilibili.com',
  'nicovideo.jp',
  'dailymotion.com',
  'reddit.com',
  'soundcloud.com',
  'bandcamp.com',
]

const looksLikeMediaPageUrl = (url: string) => {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    return mediaPageHostMarkers.some((marker) => host === marker || host.endsWith(`.${marker}`))
  } catch {
    return false
  }
}

const isStreamingRemoteTrack = (track: Track) =>
  track.origin === 'remote' && Boolean(track.remoteUrl) && !track.filePath && /^https?:\/\//i.test(track.source)

const isUrlAddedTrack = (track: Track) => Boolean(track.remoteUrl)

const fetchWithTimeout = async (url: string, init: RequestInit = {}, timeoutMs = 4000) => {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    window.clearTimeout(timer)
  }
}

const remoteTitleFromUrl = (url: string) => {
  try {
    return decodeURIComponent(url.split('/').pop()?.replace(/\?.*$/, '') || 'Remote audio')
  } catch {
    return url.split('/').pop()?.replace(/\?.*$/, '') || 'Remote audio'
  }
}

// Stable file stem for a remote URL (two independent 32-bit hashes -> 16 hex chars).
const remoteCacheStem = (url: string) => {
  let djb = 5381
  let sdbm = 0

  for (let index = 0; index < url.length; index += 1) {
    const code = url.charCodeAt(index)
    djb = (Math.imul(djb, 33) ^ code) >>> 0
    sdbm = (code + (sdbm << 6) + (sdbm << 16) - sdbm) >>> 0
  }

  return `${djb.toString(16).padStart(8, '0')}${sdbm.toString(16).padStart(8, '0')}`
}

const createBlobUrl = (data: Uint8Array, mimeType: string, objectUrls: string[]) => {
  const copy = data.slice()
  const url = URL.createObjectURL(new Blob([copy], { type: mimeType }))
  objectUrls.push(url)
  return url
}

// Read + decode + parse each audio file eagerly, but only a few at a time.
// An unbounded Promise.all over a large folder loads every file fully into
// memory at once (hundreds of MB of Uint8Array + blob + metadata parsing on the
// main thread), which spikes GC/CPU and makes the window stutter while opening.
const loadConcurrency = 4

const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
  const results = new Array<R>(items.length)
  let cursor = 0

  const runWorker = async () => {
    while (true) {
      const index = cursor
      cursor += 1

      if (index >= items.length) {
        return
      }

      results[index] = await mapper(items[index], index)
    }
  }

  const workerCount = Math.min(Math.max(1, limit), items.length)
  await Promise.all(Array.from({ length: workerCount }, runWorker))
  return results
}

const isSameOriginMediaSrc = (src: string) => src.startsWith('blob:') || src.startsWith('data:')

const fileNameFromPath = (filePath: string) => filePath.split(/[\\/]/).pop() || filePath

const normalizePathKey = (value: string) => value.replace(/\//g, '\\').toLowerCase()

const isSameTrackIdentity = (left: Track, right: Track) => {
  if (left.id === right.id) {
    return true
  }

  if (left.filePath && right.filePath && normalizePathKey(left.filePath) === normalizePathKey(right.filePath)) {
    return true
  }

  if (left.remoteUrl && right.remoteUrl && left.remoteUrl === right.remoteUrl) {
    return true
  }

  return false
}

const trackAlreadyExists = (track: Track, list: Track[]) => list.some((item) => isSameTrackIdentity(item, track))

// Serialize only the tracks we can rebuild from disk/network next launch.
// Blob-only remote tracks (no persistable URL) are dropped.
const buildPersistablePlaylist = (tracks: Track[]): PlaylistFile | null => {
  const persistableTracks = tracks.filter((track) =>
    track.origin === 'remote'
      ? Boolean(track.remoteUrl || (track.source && !track.source.startsWith('blob:')))
      : Boolean(track.filePath),
  )

  if (!persistableTracks.length) {
    return null
  }

  return {
    format: 'my-music-station-playlist',
    version: 1,
    tracks: persistableTracks.map((track) => {
      const remoteSource = track.remoteUrl || track.source

      return {
        title: track.title,
        source: track.origin === 'remote' ? remoteSource : (track.filePath ?? ''),
        origin: track.origin,
        filePath: track.filePath,
        remoteUrl: track.origin === 'remote' ? remoteSource : undefined,
      }
    }),
  }
}

/** Survives React Strict Mode remounts so startup reopen runs once. */
let didReopenFolderOnStart = false

function App({ initialSettings }: { initialSettings: AppSettings }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const animationRef = useRef<number | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const shouldPlayOnTrackLoadRef = useRef(false)
  const objectUrlsRef = useRef<string[]>([])
  const loadMusicFolderRef = useRef<(folderPath: string) => Promise<void>>(async () => {})
  const loadPlaylistFromPathRef = useRef<(playlistPath: string) => Promise<boolean>>(async () => false)
  const openPathsFromOsRef = useRef<(paths: string[]) => Promise<void>>(async () => {})
  const ensurePlayableTrackRef = useRef<(track: Track) => Promise<Track>>(async (track) => track)
  const restoreSessionPlaylistRef = useRef<(raw: string) => Promise<boolean>>(async () => false)
  const remoteCacheDirRef = useRef<string | null>(null)
  const sessionPlaylistPathRef = useRef<string | null>(null)
  const sessionSaveTimerRef = useRef<number | null>(null)
  // Guards the auto-save effect so it does not overwrite the saved session with
  // the initial empty list before startup restore has had a chance to run.
  const sessionReadyRef = useRef(false)
  const tracksRef = useRef<Track[]>([])
  const spectrumColorOrderRef = useRef<SpectrumColorOrder>(initialSettings.spectrumColorOrder)
  const spectrumStyleRef = useRef<SpectrumStyle>(initialSettings.spectrumStyle)
  const [language, setLanguage] = useState<Language>(initialSettings.language)
  const [availableThemes, setAvailableThemes] = useState<ThemeDefinition[]>(() => [...builtInThemes, ...loadCustomThemes()])
  const [themeId, setThemeId] = useState(initialSettings.themeId)
  const [tracks, setTracks] = useState<Track[]>([])
  tracksRef.current = tracks
  const [currentTrackId, setCurrentTrackId] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [transportOverlay, setTransportOverlay] = useState<TransportOverlay | null>('spectrum')
  const transportOverlayTimerRef = useRef<number | null>(null)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [volume, setVolume] = useState(() =>
    initialSettings.rememberVolume ? initialSettings.volume : 0.82,
  )
  const [isMuted, setIsMuted] = useState(false)
  const volumeBeforeMuteRef = useRef(initialSettings.rememberVolume ? initialSettings.volume : 0.82)
  const [remoteUrl, setRemoteUrl] = useState('')
  const [isResolvingRemote, setIsResolvingRemote] = useState(false)
  const [lastMusicFolder, setLastMusicFolder] = useState(() => localStorage.getItem(lastMusicFolderKey) ?? defaultMusicFolder)
  const [statusMessage, setStatusMessage] = useState('')
  const [statusKind, setStatusKind] = useState<StatusKind>('info')
  const [errorDialogMessage, setErrorDialogMessage] = useState('')
  const [showAppInfo, setShowAppInfo] = useState(false)
  const [miniMode, setMiniMode] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showConvertDialog, setShowConvertDialog] = useState(false)
  const [convertFormat, setConvertFormat] = useState<ConvertFormat>('mp3')
  const [convertQuality, setConvertQuality] = useState<ExtractQuality>('high')
  const [isConverting, setIsConverting] = useState(false)
  const [convertMessage, setConvertMessage] = useState('')
  const [convertTargetTrackId, setConvertTargetTrackId] = useState<string | null>(null)
  const [trackContextMenu, setTrackContextMenu] = useState<{ trackId: string; x: number; y: number } | null>(null)
  const [showExtractDialog, setShowExtractDialog] = useState(false)
  const [extractUrl, setExtractUrl] = useState('')
  const [extractFormat, setExtractFormat] = useState<ExtractFormat>('mp3')
  const [extractQuality, setExtractQuality] = useState<ExtractQuality>('high')
  const [extractAddToPlaylist, setExtractAddToPlaylist] = useState(true)
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractMessage, setExtractMessage] = useState('')
  const [alertDialog, setAlertDialog] = useState<{ title: string; message: string } | null>(null)
  const [folderProgress, setFolderProgress] = useState<{ phase: 'scanning' | 'loading'; loaded: number; total: number } | null>(null)
  const [themeMessage, setThemeMessage] = useState('')
  const [useSystemTray, setUseSystemTray] = useState(initialSettings.useSystemTray)
  const [rememberVolume] = useState(initialSettings.rememberVolume)
  const [showSpectrum] = useState(initialSettings.showSpectrum)
  const [spectrumColorOrder, setSpectrumColorOrder] = useState<SpectrumColorOrder>(initialSettings.spectrumColorOrder)
  const [spectrumStyle, setSpectrumStyle] = useState<SpectrumStyle>(initialSettings.spectrumStyle)
  const [reopenLastFolderOnStart, setReopenLastFolderOnStart] = useState(initialSettings.reopenLastFolderOnStart)
  const [wallpaperEnabled, setWallpaperEnabled] = useState(initialSettings.wallpaperEnabled)
  const [wallpaperPath, setWallpaperPath] = useState(initialSettings.wallpaperPath)
  const [wallpaperDim, setWallpaperDim] = useState(initialSettings.wallpaperDim)
  const [panelOpacity, setPanelOpacity] = useState(initialSettings.panelOpacity)
  const [trackListCollapsed, setTrackListCollapsed] = useState(initialSettings.trackListCollapsed)
  const [wallpaperUrl, setWallpaperUrl] = useState('')
  const wallpaperObjectUrlRef = useRef('')
  spectrumColorOrderRef.current = spectrumColorOrder
  spectrumStyleRef.current = spectrumStyle

  const labels = text[language]
  const spectrumStyleLabels: Record<SpectrumStyle, string> = {
    bars: labels.spectrumStyleBars,
    mirror: labels.spectrumStyleMirror,
    wave: labels.spectrumStyleWave,
    line: labels.spectrumStyleLine,
    radial: labels.spectrumStyleRadial,
    dots: labels.spectrumStyleDots,
    blocks: labels.spectrumStyleBlocks,
    ridge: labels.spectrumStyleRidge,
    ring: labels.spectrumStyleRing,
    needle: labels.spectrumStyleNeedle,
    pulse: labels.spectrumStylePulse,
    stripe: labels.spectrumStyleStripe,
    spark: labels.spectrumStyleSpark,
    aurora: labels.spectrumStyleAurora,
    matrix: labels.spectrumStyleMatrix,
  }
  const currentTrack = tracks.find((track) => track.id === currentTrackId)
  const convertTargetTrack =
    (convertTargetTrackId ? tracks.find((track) => track.id === convertTargetTrackId) : undefined) ?? currentTrack
  const convertDialogIsRemoteSave = Boolean(convertTargetTrack && isUrlAddedTrack(convertTargetTrack))
  const convertDialogTitle = convertDialogIsRemoteSave
    ? isStreamingRemoteTrack(convertTargetTrack!)
      ? labels.saveStream
      : labels.contextSaveDownload
    : labels.convertSave
  const convertDialogBusy = convertDialogIsRemoteSave
    ? labels.saveStreamBusy
    : labels.convertBusy
  const selectedTheme = availableThemes.find((theme) => theme.id === themeId) ?? availableThemes[0]
  const playbackStateLabel = isPlaying
    ? labels.statusPlaying
    : currentTime > 0
      ? labels.statusPaused
      : currentTrack
        ? labels.statusStopped
        : labels.statusReady
  const statusText = statusMessage || playbackStateLabel
  const effectiveVolume = isMuted ? 0 : volume
  const volumePercent = Math.round(volume * 100)

  const pushStatus = (message: string, kind: StatusKind = 'info') => {
    setStatusMessage(message)
    setStatusKind(kind)

    if (kind === 'error') {
      setErrorDialogMessage(message)
    }
  }

  const clearStatus = () => {
    setStatusMessage('')
    setStatusKind('info')
  }

  const closeErrorDialog = () => {
    setErrorDialogMessage('')
  }

  useEffect(() => {
    if (!statusMessage || statusKind === 'error' || statusKind === 'busy') {
      return
    }

    const timer = window.setTimeout(() => {
      clearStatus()
    }, 4500)

    return () => window.clearTimeout(timer)
  }, [statusMessage, statusKind])

  const playLoadedTrack = useEffectEvent(async (track?: Track) => {
    await playCurrentAudio(track)
  })

  const buildCurrentSettings = useEffectEvent((patch: Partial<AppSettings> = {}): AppSettings => ({
    language,
    themeId,
    useSystemTray,
    rememberVolume,
    volume,
    showSpectrum,
    spectrumColorOrder,
    spectrumStyle,
    reopenLastFolderOnStart,
    wallpaperEnabled,
    wallpaperPath,
    wallpaperDim,
    panelOpacity,
    trackListCollapsed,
    ...patch,
  }))

  const persistSettings = useEffectEvent(async (patch: Partial<AppSettings> = {}) => {
    const next = buildCurrentSettings(patch)
    try {
      await saveAppSettingsDurable(next)
    } catch {
      // localStorage already updated inside saveAppSettingsDurable before disk write
    }
  })

  const saveSettingsFromDialog = async () => {
    try {
      await saveAppSettingsDurable(buildCurrentSettings())
      pushStatus(labels.settingsSaved, 'success')
      setShowSettings(false)
    } catch {
      pushStatus(labels.settingsSaveError, 'error')
    }
  }

  const syncSystemTray = useEffectEvent(async (enabled: boolean) => {
    try {
      await invoke('set_use_system_tray', { enabled })
    } catch (error) {
      console.warn('[settings] failed to sync system tray', error)
    }
  })

  useEffect(() => {
    void syncSystemTray(useSystemTray)
  }, [useSystemTray])

  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined

    void listen('open-settings', () => {
      setShowSettings(true)
      setShowAppInfo(false)
    }).then((dispose) => {
      if (cancelled) {
        dispose()
        return
      }

      unlisten = dispose
    })

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  useEffect(() => {
    void persistSettings()
  }, [
    language,
    themeId,
    useSystemTray,
    rememberVolume,
    volume,
    showSpectrum,
    spectrumColorOrder,
    spectrumStyle,
    reopenLastFolderOnStart,
    wallpaperEnabled,
    wallpaperPath,
    wallpaperDim,
    panelOpacity,
    trackListCollapsed,
  ])

  useEffect(() => {
    let cancelled = false

    const releaseWallpaperUrl = () => {
      if (wallpaperObjectUrlRef.current) {
        URL.revokeObjectURL(wallpaperObjectUrlRef.current)
        wallpaperObjectUrlRef.current = ''
      }
    }

    const loadWallpaper = async () => {
      if (!wallpaperEnabled || !wallpaperPath) {
        releaseWallpaperUrl()
        setWallpaperUrl('')
        return
      }

      if (isBuiltInWallpaperId(wallpaperPath)) {
        const builtIn = findBuiltInWallpaper(wallpaperPath)
        releaseWallpaperUrl()
        setWallpaperUrl(builtIn?.url ?? '')
        return
      }

      try {
        const loaded = await invoke<{ mime: string; dataBase64: string }>('load_wallpaper_image', {
          path: wallpaperPath,
        })
        if (cancelled) {
          return
        }

        releaseWallpaperUrl()
        const mime = loaded.mime || wallpaperMimeFromPath(wallpaperPath)
        const binary = atob(loaded.dataBase64)
        const bytes = new Uint8Array(binary.length)
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index)
        }
        const url = URL.createObjectURL(new Blob([bytes], { type: mime }))
        wallpaperObjectUrlRef.current = url
        setWallpaperUrl(url)
      } catch (error) {
        console.warn('[wallpaper] failed to load image, trying asset URL', wallpaperPath, error)

        try {
          const assetUrl = convertFileSrc(wallpaperPath)
          if (!cancelled) {
            releaseWallpaperUrl()
            setWallpaperUrl(assetUrl)
          }
        } catch (assetError) {
          console.error('[wallpaper] unable to load', wallpaperPath, assetError)
          if (!cancelled) {
            releaseWallpaperUrl()
            setWallpaperUrl('')
          }
        }
      }
    }

    void loadWallpaper()

    return () => {
      cancelled = true
    }
  }, [wallpaperEnabled, wallpaperPath])

  useEffect(() => {
    return () => {
      if (wallpaperObjectUrlRef.current) {
        URL.revokeObjectURL(wallpaperObjectUrlRef.current)
        wallpaperObjectUrlRef.current = ''
      }
    }
  }, [])

  useEffect(() => {
    if (didReopenFolderOnStart) {
      return
    }

    didReopenFolderOnStart = true

    void (async () => {
      try {
        // 0) Restore the exact working playlist from the last session (folders,
        // added files and URLs alike). This wins over folder/playlist reopen.
        const session = (await readSessionPlaylistFile()) ?? localStorage.getItem(sessionPlaylistKey)

        if (session) {
          const restored = await restoreSessionPlaylistRef.current(session)

          if (restored) {
            return
          }

          // Stale/invalid (e.g. every file was moved); drop it and fall back.
          localStorage.removeItem(sessionPlaylistKey)
          await writeSessionPlaylistFile(null)
        }

        // 1) If a playlist was in use last session, reopen it as-is.
        const lastPlaylist = localStorage.getItem(lastPlaylistKey)

        if (lastPlaylist) {
          const restored = await loadPlaylistFromPathRef.current(lastPlaylist)

          if (restored) {
            return
          }

          // The saved playlist file is gone/invalid; forget it and fall back.
          localStorage.removeItem(lastPlaylistKey)
        }

        // 2) Otherwise reopen the most recently used music folder.
        if (!reopenLastFolderOnStart) {
          return
        }

        const folder = localStorage.getItem(lastMusicFolderKey) ?? defaultMusicFolder

        if (folder) {
          await loadMusicFolderRef.current(folder)
        }
      } finally {
        // From now on, track changes are persisted to the session playlist.
        sessionReadyRef.current = true
      }
    })()
  }, [reopenLastFolderOnStart])

  // Auto-save the working playlist so the exact list is restored next launch.
  // Skipped until startup restore has run (sessionReadyRef) so the initial empty
  // render can't clobber a saved session.
  useEffect(() => {
    if (!sessionReadyRef.current) {
      return
    }

    const playlist = buildPersistablePlaylist(tracks)
    const raw = playlist ? JSON.stringify(playlist) : null

    if (raw) {
      localStorage.setItem(sessionPlaylistKey, raw)
    } else {
      localStorage.removeItem(sessionPlaylistKey)
    }

    // Folder loads update the list many times in a row; coalesce the disk writes.
    if (sessionSaveTimerRef.current !== null) {
      window.clearTimeout(sessionSaveTimerRef.current)
    }
    sessionSaveTimerRef.current = window.setTimeout(() => {
      sessionSaveTimerRef.current = null
      void writeSessionPlaylistFile(raw)
    }, 300)
  }, [tracks])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = selectedTheme.builtIn ? selectedTheme.id : 'custom'

    for (const key of themeVarKeys) {
      root.style.removeProperty(key)
    }

    if (selectedTheme.vars) {
      Object.entries(selectedTheme.vars).forEach(([key, value]) => root.style.setProperty(key, value))
    }
  }, [selectedTheme])

  useEffect(() => {
    const audio = audioRef.current

    if (audio) {
      audio.volume = effectiveVolume
    }

    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = effectiveVolume
    }
  }, [effectiveVolume])

  useEffect(() => {
    const objectUrls = objectUrlsRef.current

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }

      objectUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  const applyTrackSource = (audio: HTMLAudioElement, track: Track) => {
    // Streaming remote URLs often lack CORS headers. Omitting crossOrigin keeps
    // playback working; Web Audio analysis may stay silent in that case.
    if (isSameOriginMediaSrc(track.source) || isStreamingRemoteTrack(track)) {
      audio.removeAttribute('crossorigin')
    } else {
      audio.crossOrigin = 'anonymous'
    }

    audio.src = track.source
    audio.dataset.trackId = track.id
    audio.load()
    setCurrentTime(0)
    setDuration(0)
    clearStatus()
  }

  useEffect(() => {
    const audio = audioRef.current

    if (!audio) {
      return
    }

    if (!currentTrack) {
      audio.removeAttribute('src')
      audio.removeAttribute('crossorigin')
      delete audio.dataset.trackId
      audio.load()
      stopSpectrum()
      setCurrentTime(0)
      setDuration(0)
      return
    }

    if (audio.dataset.trackId !== currentTrack.id) {
      if (currentTrack.mode === 'pending') {
        // Media-page links are extracted on play; loading the page URL into
        // <audio> only raises a media error.
        audio.removeAttribute('src')
        audio.removeAttribute('crossorigin')
        audio.dataset.trackId = currentTrack.id
        audio.load()
        setCurrentTime(0)
        setDuration(0)
      } else {
        applyTrackSource(audio, currentTrack)
      }
    }

    if (shouldPlayOnTrackLoadRef.current) {
      shouldPlayOnTrackLoadRef.current = false
      void playLoadedTrack(currentTrack)
    }
  }, [currentTrack])

  const createArtworkUrl = (metadata: IAudioMetadata) => {
    const cover = selectCover(metadata.common.picture)

    if (!cover) {
      return undefined
    }

    return createBlobUrl(cover.data, cover.format || 'image/jpeg', objectUrlsRef.current)
  }

  const applyMetadata = (track: Track, metadata: IAudioMetadata): Track => ({
    ...track,
    title: metadata.common.title?.trim() || track.title,
    artist: metadata.common.artist,
    album: metadata.common.album,
    year: metadata.common.year,
    genre: metadata.common.genre?.join(', '),
    trackNumber: metadata.common.track.no ?? undefined,
    durationSeconds: metadata.format.duration,
    bitrate: metadata.format.bitrate,
    sampleRate: metadata.format.sampleRate,
    codec: metadata.format.codec,
    container: metadata.format.container,
    artworkUrl: createArtworkUrl(metadata),
  })

  const getSessionPlaylistPath = async () => {
    if (!sessionPlaylistPathRef.current) {
      sessionPlaylistPathRef.current = await join(await appConfigDir(), sessionPlaylistFileName)
    }

    return sessionPlaylistPathRef.current
  }

  const readSessionPlaylistFile = async (): Promise<string | null> => {
    try {
      const path = await getSessionPlaylistPath()
      return (await exists(path)) ? await readTextFile(path) : null
    } catch (error) {
      console.warn('[session] read failed', error)
      return null
    }
  }

  const writeSessionPlaylistFile = async (raw: string | null) => {
    try {
      const path = await getSessionPlaylistPath()

      if (raw === null) {
        if (await exists(path)) {
          await remove(path)
        }
        return
      }

      await mkdir(await appConfigDir(), { recursive: true })
      await writeTextFile(path, raw)
    } catch (error) {
      console.warn('[session] write failed', error)
    }
  }

  const getRemoteCacheDir = async () => {
    if (!remoteCacheDirRef.current) {
      const dir = await join(await appCacheDir(), remoteCacheFolderName)
      await mkdir(dir, { recursive: true })
      remoteCacheDirRef.current = dir
    }

    return remoteCacheDirRef.current
  }

  const getRemoteCachePath = async (url: string) =>
    join(await getRemoteCacheDir(), `${remoteCacheStem(url)}.${remoteCacheFormat}`)

  const isRemoteCachePath = (filePath: string) => {
    const dir = remoteCacheDirRef.current
    return Boolean(dir) && normalizePathKey(filePath).startsWith(normalizePathKey(dir ?? ''))
  }

  // Already-downloaded audio for a link: the path saved with the track (if it
  // still exists) or the cache entry for that URL. Null -> needs extraction.
  const findCachedRemoteFile = async (url: string, savedPath?: string) => {
    try {
      if (savedPath && (await exists(savedPath))) {
        return savedPath
      }

      const cachePath = await getRemoteCachePath(url)
      return (await exists(cachePath)) ? cachePath : null
    } catch (error) {
      console.warn('[remote] cache lookup failed', url, error)
      return null
    }
  }

  const createTrackFromPath = async (filePath: string, fileName: string) => {
    const mimeType = getAudioMimeType(fileName)
    const track: Track = {
      id: `folder-${filePath}`,
      title: fileName.replace(/\.[^/.]+$/, ''),
      source: '',
      origin: 'local' as const,
      filePath,
    }

    try {
      const buffer = await readFile(filePath)
      const source = createBlobUrl(buffer, mimeType, objectUrlsRef.current)
      const playableTrack = { ...track, source }

      try {
        return applyMetadata(playableTrack, await parseBuffer(buffer, { mimeType, path: filePath }, { duration: true }))
      } catch {
        return playableTrack
      }
    } catch (readError) {
      console.warn('[track] readFile failed, trying asset fetch', filePath, readError)
    }

    // Web Audio's MediaElementSource outputs silence for cross-origin asset URLs
    // unless we re-wrap them as same-origin blob: URLs first.
    try {
      const assetUrl = convertFileSrc(filePath)
      const response = await fetch(assetUrl)

      if (!response.ok) {
        throw new Error(`asset fetch ${response.status}`)
      }

      const bytes = new Uint8Array(await response.arrayBuffer())
      const source = createBlobUrl(bytes, mimeType, objectUrlsRef.current)
      const playableTrack = { ...track, source }

      try {
        return applyMetadata(playableTrack, await parseBuffer(bytes, { mimeType, path: filePath }, { duration: true }))
      } catch {
        return playableTrack
      }
    } catch (assetError) {
      console.error('[track] unable to load local file', filePath, assetError)
      return {
        ...track,
        source: convertFileSrc(filePath),
      }
    }
  }

  const ensureAudioGraph = () => {
    const audio = audioRef.current

    if (!audio) {
      return false
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext()
    }

    if (!analyserRef.current) {
      analyserRef.current = audioContextRef.current.createAnalyser()
      // Larger FFT gives fine raw resolution (esp. in the bass); the linear bins
      // are then resampled onto a log frequency axis via buildLogBands().
      analyserRef.current.fftSize = 2048
      analyserRef.current.smoothingTimeConstant = 0.82
    }

    if (!gainNodeRef.current) {
      gainNodeRef.current = audioContextRef.current.createGain()
      gainNodeRef.current.gain.value = isMuted ? 0 : volume
    }

    const mediaSrc = audio.currentSrc || audio.src

    // Avoid createMediaElementSource on cross-origin media: WebView2 keeps the
    // element "playing" but the graph outputs silence (no sound, flat spectrum).
    if (!sourceNodeRef.current && isSameOriginMediaSrc(mediaSrc)) {
      sourceNodeRef.current = audioContextRef.current.createMediaElementSource(audio)
      sourceNodeRef.current.connect(analyserRef.current)
      analyserRef.current.connect(gainNodeRef.current)
      gainNodeRef.current.connect(audioContextRef.current.destination)
      console.log('[audioGraph] created', {
        ctx: audioContextRef.current.state,
        sampleRate: audioContextRef.current.sampleRate,
        destination: audioContextRef.current.destination.maxChannelCount,
      })
    }

    return Boolean(sourceNodeRef.current)
  }

  const drawSpectrum = () => {
    const canvas = canvasRef.current
    const analyser = analyserRef.current

    if (!showSpectrum || !canvas || !analyser) {
      stopSpectrum()
      return
    }

    const context = canvas.getContext('2d')

    if (!context) {
      return
    }

    const freqData = new Uint8Array(analyser.frequencyBinCount)
    const timeData = new Uint8Array(analyser.fftSize)
    const bandData = new Uint8Array(spectrumBandCount)
    const sampleRate = analyser.context.sampleRate

    stopSpectrum()

    const render = () => {
      analyser.getByteFrequencyData(freqData)
      analyser.getByteTimeDomainData(timeData)
      // Redistribute the linear FFT bins onto a log (perceptual) frequency axis
      // so the full audible range is shown the way we hear it.
      buildLogBands(freqData, sampleRate, spectrumBandCount, bandData)
      drawSpectrumFrame(
        context,
        canvas,
        spectrumStyleRef.current,
        spectrumColorOrderRef.current,
        bandData,
        timeData,
      )
      animationRef.current = requestAnimationFrame(render)
    }

    render()
  }

  const clearSpectrumCanvas = () => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')

    if (!canvas || !context) {
      return
    }

    context.clearRect(0, 0, canvas.width, canvas.height)
  }

  const stopSpectrum = (resetCanvas = false) => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }

    if (resetCanvas) {
      clearSpectrumCanvas()
    }
  }

  const playCurrentAudio = async (trackOverride?: Track) => {
    const audio = audioRef.current
    const track = trackOverride ?? currentTrack ?? tracks.find((item) => item.id === currentTrackId)

    if (!audio || !track) {
      return
    }

    try {
      if (audio.dataset.trackId !== track.id || !audio.src) {
        applyTrackSource(audio, track)
      }

      if (!track.source) {
        throw new Error('missing media source')
      }

      const usingWebAudio = ensureAudioGraph()

      // Kick off both promises synchronously so WebView2 keeps user activation.
      const resumePromise =
        usingWebAudio && audioContextRef.current?.state === 'suspended'
          ? audioContextRef.current.resume()
          : Promise.resolve()
      const playPromise = audio.play()

      await Promise.all([resumePromise, playPromise])

      if (usingWebAudio && audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume()
      }

      console.log('[play] ok', {
        ctx: audioContextRef.current?.state,
        node: !!sourceNodeRef.current,
        src: audio.src.slice(0, 48),
        readyState: audio.readyState,
        paused: audio.paused,
      })
      clearStatus()
      setIsPlaying(true)

      if (usingWebAudio) {
        drawSpectrum()
      } else {
        stopSpectrum()
      }
    } catch (error) {
      console.error('[play] failed', error, {
        ctx: audioContextRef.current?.state,
        node: !!sourceNodeRef.current,
        src: audio.src.slice(0, 48),
        mediaError: audio.error?.code,
      })
      setIsPlaying(false)
      pushStatus(
        `${labels.playbackError}: ${error instanceof Error ? `${error.name} ${error.message}` : String(error)}`,
        'error',
      )
      stopSpectrum()
    }
  }

  const showTransportOverlay = (kind: TransportOverlay) => {
    if (transportOverlayTimerRef.current !== null) {
      window.clearTimeout(transportOverlayTimerRef.current)
      transportOverlayTimerRef.current = null
    }

    setTransportOverlay(kind)

    if (kind === 'spectrum') {
      return
    }

    transportOverlayTimerRef.current = window.setTimeout(() => {
      setTransportOverlay(kind === 'stop' ? 'spectrum' : null)
      transportOverlayTimerRef.current = null
    }, 3000)
  }

  useEffect(() => {
    return () => {
      if (transportOverlayTimerRef.current !== null) {
        window.clearTimeout(transportOverlayTimerRef.current)
      }
    }
  }, [])

  const play = async () => {
    const audio = audioRef.current

    // Resume only when the currently loaded track is paused partway through.
    // Otherwise (fresh start, stopped, or nothing selected) begin at the top of
    // the list so the play button always starts from the first song.
    const isResumingCurrent =
      Boolean(currentTrack) &&
      audio?.dataset.trackId === currentTrackId &&
      (audio?.currentTime ?? 0) > 0 &&
      !audio?.ended

    if (tracks.length > 0 && !isResumingCurrent) {
      loadAndPlayTrack(tracks[0])
      return
    }

    await playCurrentAudio()
  }

  const handleAudioPlay = () => {
    setIsPlaying(true)
    showTransportOverlay('play')

    try {
      if (ensureAudioGraph()) {
        if (audioContextRef.current?.state === 'suspended') {
          void audioContextRef.current.resume()
        }

        drawSpectrum()
      }
    } catch {
      stopSpectrum()
    }
  }

  const loadAndPlayTrack = async (track: Track) => {
    const audio = audioRef.current

    shouldPlayOnTrackLoadRef.current = false

    let playable = track

    try {
      playable = await ensurePlayableTrackRef.current(track)
    } catch (error) {
      console.error('[play] prepare failed', error)
      const failed = `${labels.addRemoteError}: ${error instanceof Error ? error.message : String(error)}`
      pushStatus(failed, 'error')
      return
    }

    setCurrentTrackId(playable.id)
    setIsPlaying(true)

    if (audio) {
      applyTrackSource(audio, playable)
      void playCurrentAudio(playable)
      return
    }

    shouldPlayOnTrackLoadRef.current = true
  }

  const pause = () => {
    audioRef.current?.pause()
    setIsPlaying(false)
    stopSpectrum()
    showTransportOverlay('pause')
  }

  const stop = () => {
    const audio = audioRef.current

    if (!audio) {
      return
    }

    audio.pause()
    audio.currentTime = 0
    setCurrentTime(0)
    setIsPlaying(false)
    stopSpectrum(true)
    showTransportOverlay('stop')
  }

  const playRelativeTrack = (direction: -1 | 1) => {
    if (!tracks.length) {
      return
    }

    const index = tracks.findIndex((track) => track.id === currentTrackId)
    const currentIndex = index === -1 ? 0 : index
    const nextIndex = (currentIndex + direction + tracks.length) % tracks.length
    loadAndPlayTrack(tracks[nextIndex])
  }

  const selectTrack = (trackId: string) => {
    const track = tracks.find((item) => item.id === trackId)

    if (!track) {
      return
    }

    if (trackId === currentTrackId) {
      void (async () => {
        try {
          const playable = await ensurePlayableTrackRef.current(track)
          await playCurrentAudio(playable)
        } catch (error) {
          console.error('[play] prepare failed', error)
          const failed = `${labels.addRemoteError}: ${error instanceof Error ? error.message : String(error)}`
          pushStatus(failed, 'error')
        }
      })()
      return
    }

    void loadAndPlayTrack(track)
  }

  const removeTrackFromPlaylist = (trackId: string) => {
    const index = tracks.findIndex((track) => track.id === trackId)

    if (index === -1) {
      return
    }

    const removed = tracks[index]
    const remaining = tracks.filter((track) => track.id !== trackId)
    const wasCurrent = trackId === currentTrackId
    const wasPlaying = wasCurrent && isPlaying
    const nextTrack = wasCurrent && remaining.length ? remaining[Math.min(index, remaining.length - 1)] : null

    if (wasCurrent) {
      // Silence the removed track before the list re-renders so nothing keeps
      // playing from a row that no longer exists.
      const audio = audioRef.current
      if (audio) {
        audio.pause()
        audio.removeAttribute('src')
        audio.removeAttribute('crossorigin')
        delete audio.dataset.trackId
        audio.load()
      }
      setIsPlaying(false)
      setCurrentTime(0)
      setDuration(0)
      stopSpectrum(true)
    }

    setTracks(remaining)
    // Select the successor in the same batch so the player never renders an
    // empty "no track" state in between.
    setCurrentTrackId(nextTrack?.id ?? (wasCurrent ? '' : currentTrackId))

    // The cached download is only useful while the link is in the list.
    if (removed.remoteUrl && removed.filePath && isRemoteCachePath(removed.filePath)) {
      const cachePath = removed.filePath
      void remove(cachePath).catch((error) => console.warn('[remote] cache remove failed', cachePath, error))
    }

    if (!wasCurrent) {
      return
    }

    if (!nextTrack) {
      showTransportOverlay('spectrum')
      return
    }

    if (wasPlaying) {
      void loadAndPlayTrack(nextTrack)
    }
  }

  const addTracks = (nextTracks: Track[]) => {
    if (!nextTracks.length) {
      return 0
    }

    let addedCount = 0

    setTracks((previousTracks) => {
      const uniqueTracks = nextTracks.filter((track) => !trackAlreadyExists(track, previousTracks))
      addedCount = uniqueTracks.length

      if (!uniqueTracks.length) {
        return previousTracks
      }

      return [...uniqueTracks, ...previousTracks]
    })

    if (addedCount > 0) {
      const firstNew = nextTracks.find((track) => !trackAlreadyExists(track, tracksRef.current))
      if (firstNew) {
        setCurrentTrackId(firstNew.id)
      }
      setIsPlaying(false)
    }

    return addedCount
  }

  const openAudioFiles = async () => {
    const selected = await open({
      multiple: true,
      directory: false,
      defaultPath: lastMusicFolder || undefined,
      title: labels.addFiles,
      filters: [
        { name: labels.formats, extensions: audioExtensions.map((extension) => extension.slice(1)) },
        { name: labels.playlist, extensions: ['mplist'] },
      ],
    })

    const paths = Array.isArray(selected) ? selected : typeof selected === 'string' ? [selected] : []
    await openPathsFromOs(paths)
  }

  const openPathsFromOs = async (paths: string[]) => {
    if (!paths.length) {
      return
    }

    const playlistPaths = paths.filter((path) => path.toLowerCase().endsWith('.mplist'))
    const audioPaths = paths.filter((path) => {
      const lower = path.toLowerCase()
      return !lower.endsWith('.mplist') && audioExtensions.some((extension) => lower.endsWith(extension))
    })

    for (const playlistPath of playlistPaths) {
      await loadPlaylistFromPathRef.current(playlistPath)
    }

    if (!audioPaths.length) {
      return
    }

    const existingPaths = new Set(
      tracksRef.current
        .map((track) => track.filePath)
        .filter((value): value is string => Boolean(value))
        .map(normalizePathKey),
    )
    const pathsToLoad = audioPaths.filter((path) => !existingPaths.has(normalizePathKey(path)))

    if (!pathsToLoad.length) {
      pushStatus(labels.tracksAlreadyLoaded, 'info')
      return
    }

    const newTracks = await mapWithConcurrency(pathsToLoad, loadConcurrency, (path) =>
      createTrackFromPath(path, fileNameFromPath(path)),
    )
    const playable = newTracks.filter((track) => track.source)
    const added = addTracks(playable)

    if (added < audioPaths.length) {
      pushStatus(labels.tracksAlreadyLoaded, 'info')
    }

    if (playable[0]) {
      loadAndPlayTrack(playable[0])
    }
  }

  openPathsFromOsRef.current = openPathsFromOs

  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined

    const handlePaths = (paths: string[]) => {
      if (!paths.length || cancelled) {
        return
      }

      void openPathsFromOsRef.current(paths)
    }

    void invoke<string[]>('take_pending_open_files')
      .then(handlePaths)
      .catch((error) => console.warn('[open-files] pending paths failed', error))

    void listen<string[]>('open-files', (event) => {
      handlePaths(Array.isArray(event.payload) ? event.payload : [])
    }).then((dispose) => {
      if (cancelled) {
        dispose()
        return
      }

      unlisten = dispose
    })

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  const loadMusicFolder = async (folderPath: string) => {
    const collectAudioPaths = async (currentFolder: string): Promise<string[]> => {
      const entries = await readDir(currentFolder)
      const nestedPaths = await Promise.all(entries.map(async (entry) => {
        const filePath = await join(currentFolder, entry.name)

        if (entry.isDirectory) {
          try {
            return await collectAudioPaths(filePath)
          } catch {
            return []
          }
        }

        if (!entry.isFile || !audioExtensions.some((extension) => entry.name.toLowerCase().endsWith(extension))) {
          return []
        }

        return [filePath]
      }))

      return nestedPaths.flat()
    }

    setFolderProgress({ phase: 'scanning', loaded: 0, total: 0 })

    try {
      const audioPaths = await collectAudioPaths(folderPath)
      const existingPaths = new Set(
        tracksRef.current
          .map((track) => track.filePath)
          .filter((value): value is string => Boolean(value))
          .map(normalizePathKey),
      )
      const pathsToLoad = audioPaths.filter((path) => !existingPaths.has(normalizePathKey(path)))

      setLastMusicFolder(folderPath)
      localStorage.setItem(lastMusicFolderKey, folderPath)
      // Browsing a folder makes it the most-recent session target, so drop any
      // stale "last playlist" pointer that would otherwise win on next launch.
      localStorage.removeItem(lastPlaylistKey)

      if (!pathsToLoad.length) {
        pushStatus(labels.folderNothingNew, 'info')
        return
      }

      // Throttle progress renders so a big folder doesn't re-render the app once
      // per file (~100 updates max) while still showing smooth percentage.
      const total = pathsToLoad.length
      const progressStep = Math.max(1, Math.floor(total / 100))
      let loaded = 0
      setFolderProgress({ phase: 'loading', loaded, total })

      const folderTracks = (
        await mapWithConcurrency(pathsToLoad, loadConcurrency, async (path) => {
          const track = await createTrackFromPath(path, fileNameFromPath(path))
          loaded += 1

          if (loaded % progressStep === 0 || loaded === total) {
            setFolderProgress({ phase: 'loading', loaded, total })
          }

          return track
        })
      ).filter((track) => track.source)

      const added = addTracks(folderTracks)

      if (added < audioPaths.length) {
        pushStatus(labels.tracksAlreadyLoaded, 'info')
      }
    } finally {
      setFolderProgress(null)
    }
  }

  loadMusicFolderRef.current = loadMusicFolder

  const openMusicFolder = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      recursive: true,
      defaultPath: lastMusicFolder || undefined,
      title: labels.openFolder,
    })

    if (typeof selected === 'string') {
      await loadMusicFolder(selected)
      return
    }

    if (Array.isArray(selected) && typeof selected[0] === 'string') {
      await loadMusicFolder(selected[0])
    }
  }

  const reopenMusicFolder = async () => {
    if (lastMusicFolder) {
      await loadMusicFolder(lastMusicFolder)
      return
    }

    await openMusicFolder()
  }

  const probeAudioStreamUrl = async (url: string): Promise<{ title: string } | null> => {
    if (looksLikeMediaPageUrl(url)) {
      return null
    }

    const title = remoteTitleFromUrl(url)

    // Extension is enough to stream immediately — avoid network probes that can hang.
    if (looksLikeDirectAudioUrl(url)) {
      return { title }
    }

    try {
      const head = await fetchWithTimeout(url, { method: 'HEAD' }, 3500)

      if (head.ok) {
        const contentType = head.headers.get('content-type')
        const mime = contentType?.split(';')[0]?.trim().toLowerCase() || ''

        if (mime.startsWith('video/') || mime.includes('html') || mime.includes('xml') || mime.includes('json')) {
          return null
        }

        if (isAudioContentType(contentType)) {
          return { title }
        }
      }
    } catch (error) {
      console.warn('[remote] HEAD probe failed', url, error)
    }

    try {
      const response = await fetchWithTimeout(url, { headers: { Range: 'bytes=0-96' } }, 3500)

      if (!response.ok && response.status !== 206) {
        return null
      }

      const contentType = response.headers.get('content-type')
      const mime = contentType?.split(';')[0]?.trim().toLowerCase() || ''

      if (mime.startsWith('video/') || mime.includes('html') || mime.includes('xml') || mime.includes('json')) {
        return null
      }

      const bytes = new Uint8Array(await response.arrayBuffer())

      if (!bytes.length || looksLikeHtmlPayload(bytes)) {
        return null
      }

      if (isAudioContentType(contentType)) {
        return { title }
      }
    } catch (error) {
      console.warn('[remote] range probe failed', url, error)
    }

    return null
  }

  // Build a playable track from a previously extracted file for `url`.
  const createExtractedRemoteTrack = async (url: string, filePath: string, title: string) => {
    const localTrack = await createTrackFromPath(filePath, title || fileNameFromPath(filePath) || 'Remote audio')

    return {
      ...localTrack,
      // Keep the title we know (yt-dlp / playlist); the cache file stem is a hash.
      title: title || localTrack.title,
      origin: 'remote' as const,
      remoteUrl: url,
      mode: 'extracted' as const,
    }
  }

  const resolveUrlAsPlayableTrack = async (
    url: string,
    { quiet = false, title = '', savedPath }: { quiet?: boolean; title?: string; savedPath?: string } = {},
  ) => {
    // Reuse a finished download first; no network needed.
    const cached = await findCachedRemoteFile(url, savedPath)

    if (cached) {
      return createExtractedRemoteTrack(url, cached, title)
    }

    const stream = await probeAudioStreamUrl(url)

    if (stream) {
      return {
        id: `remote-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: title || stream.title,
        source: url,
        origin: 'remote' as const,
        remoteUrl: url,
        mode: 'stream' as const,
      }
    }

    if (!quiet) {
      pushStatus(labels.addRemoteBusy, 'busy')
    }

    const outputPath = await getRemoteCachePath(url)
    const result = await invoke<{ outputPath: string; title: string }>('extract_audio_from_url', {
      url,
      outputPath,
      format: remoteCacheFormat,
      quality: 'high',
    })

    return createExtractedRemoteTrack(url, result.outputPath, title || result.title)
  }

  const ensurePlayableTrack = async (track: Track): Promise<Track> => {
    if (track.filePath || track.mode === 'stream' || track.mode === 'extracted') {
      return track
    }

    if (track.origin === 'remote' && track.remoteUrl && (track.mode === 'pending' || looksLikeMediaPageUrl(track.remoteUrl))) {
      pushStatus(labels.addRemoteBusy, 'busy')
      const resolved = await resolveUrlAsPlayableTrack(track.remoteUrl, { title: track.title, savedPath: track.filePath })
      const nextTrack = { ...resolved, id: track.id, title: track.title || resolved.title }

      setTracks((previous) => previous.map((item) => (item.id === track.id ? nextTrack : item)))
      return nextTrack
    }

    return track
  }

  ensurePlayableTrackRef.current = ensurePlayableTrack

  const addRemoteTrack = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextUrl = remoteUrl.trim()

    if (!nextUrl || isResolvingRemote) {
      return
    }

    if (tracksRef.current.some((track) => track.remoteUrl === nextUrl)) {
      pushStatus(labels.tracksAlreadyLoaded, 'info')
      return
    }

    setIsResolvingRemote(true)
    pushStatus(labels.addRemoteBusy, 'busy')

    try {
      const track = await resolveUrlAsPlayableTrack(nextUrl)
      addTracks([track])
      setRemoteUrl('')
      await loadAndPlayTrack(track)
      pushStatus(
        track.mode === 'stream' ? labels.addRemoteStreamSuccess : labels.addRemoteExtractSuccess,
        'success',
      )
    } catch (error) {
      console.error('[remote] resolve failed', error)
      const failed = `${labels.addRemoteError}: ${error instanceof Error ? error.message : String(error)}`
      pushStatus(failed, 'error')
      showThemedAlert(labels.addRemote, failed)
    } finally {
      setIsResolvingRemote(false)
    }
  }

  const savePlaylist = async () => {
    if (!tracks.length) {
      pushStatus(labels.saveEmpty, 'error')
      return
    }

    const playlist = buildPersistablePlaylist(tracks)

    if (!playlist) {
      pushStatus(labels.saveNoPersistable, 'error')
      return
    }

    const persistableTracks = playlist.tracks

    // The browser <a download> mechanism does not work in the Tauri WebView,
    // so use the native save dialog together with the fs plugin.
    try {
      const defaultPath = lastMusicFolder
        ? await join(lastMusicFolder, 'my-music-station.mplist')
        : 'my-music-station.mplist'

      const targetPath = await save({
        defaultPath,
        filters: [{ name: labels.playlist, extensions: ['mplist'] }],
        title: labels.savePlaylist,
      })

      console.log('[save] dialog result', targetPath)

      if (!targetPath) {
        return
      }

      await writeTextFile(targetPath, JSON.stringify(playlist, null, 2))
      console.log('[save] written', targetPath)
      // Remember this as the playlist to auto-restore on the next launch.
      localStorage.setItem(lastPlaylistKey, targetPath)
      pushStatus(
        persistableTracks.length < tracks.length
          ? `${labels.saveSuccess} (${persistableTracks.length}/${tracks.length})`
          : labels.saveSuccess,
        'success',
      )
    } catch (error) {
      console.error('[save] failed', error)
      pushStatus(
        `${labels.saveError}: ${error instanceof Error ? `${error.name} ${error.message}` : String(error)}`,
        'error',
      )
    }
  }

  // Rebuild live tracks (reading files / fetching URLs) from a parsed playlist
  // and load them into the player. Shared by file open and session restore.
  const importPlaylist = async (playlist: PlaylistFile, { silent = false }: { silent?: boolean } = {}): Promise<boolean> => {
    if (playlist.format !== 'my-music-station-playlist' || playlist.version !== 1) {
      return false
    }

    const playlistTracks = playlist.tracks.filter((track) => track.source || track.filePath)
    const importedTracks = (await mapWithConcurrency(playlistTracks, loadConcurrency, async (track, index) => {
      const filePath = track.filePath || (track.origin === 'local' ? track.source : '')

      if (track.origin === 'local' && filePath) {
        return createTrackFromPath(filePath, track.title || fileNameFromPath(filePath) || `Track ${index + 1}`)
      }

      const remoteSource = track.remoteUrl || track.source

      if (track.origin === 'remote' && remoteSource) {
        // Never block playlist restore on yt-dlp. Stream direct audio; defer media-page extract until play.
        if (looksLikeDirectAudioUrl(remoteSource)) {
          return {
            id: `playlist-${Date.now()}-${index}`,
            title: track.title || remoteTitleFromUrl(remoteSource),
            source: remoteSource,
            origin: 'remote' as const,
            remoteUrl: remoteSource,
            mode: 'stream' as const,
          }
        }

        // A finished download from a previous session plays as-is.
        const cached = await findCachedRemoteFile(remoteSource, track.filePath)

        if (cached) {
          try {
            return {
              ...(await createExtractedRemoteTrack(remoteSource, cached, track.title)),
              id: `playlist-${Date.now()}-${index}`,
            }
          } catch (error) {
            console.warn('[playlist] cached remote file unusable, deferring extract', cached, error)
          }
        }

        return {
          id: `playlist-${Date.now()}-${index}`,
          title: track.title || remoteTitleFromUrl(remoteSource),
          source: remoteSource,
          origin: 'remote' as const,
          remoteUrl: remoteSource,
          mode: 'pending' as const,
        }
      }

      return {
        id: `playlist-${Date.now()}-${index}`,
        title: track.title,
        source: remoteSource,
        origin: track.origin,
        remoteUrl: track.origin === 'remote' ? remoteSource : undefined,
      }
    })).filter((track): track is Track => Boolean(track?.source))

    if (!importedTracks.length) {
      if (!silent) {
        pushStatus(labels.saveNoPersistable, 'error')
      }
      return false
    }

    setTracks(importedTracks)
    setCurrentTrackId(importedTracks[0]?.id ?? '')
    setIsPlaying(false)
    clearStatus()
    return true
  }

  const loadPlaylistFromPath = async (playlistPath: string): Promise<boolean> => {
    let playlist: PlaylistFile

    try {
      playlist = JSON.parse(await readTextFile(playlistPath)) as PlaylistFile
    } catch {
      return false
    }

    if (!(await importPlaylist(playlist))) {
      return false
    }

    // Remember this as the playlist to auto-restore on the next launch.
    localStorage.setItem(lastPlaylistKey, playlistPath)
    return true
  }

  loadPlaylistFromPathRef.current = loadPlaylistFromPath

  // Restore the auto-saved working playlist from localStorage (silent: a stale
  // entry with missing files must not raise a startup error toast).
  const restoreSessionPlaylist = async (raw: string): Promise<boolean> => {
    let playlist: PlaylistFile

    try {
      playlist = JSON.parse(raw) as PlaylistFile
    } catch {
      return false
    }

    return importPlaylist(playlist, { silent: true })
  }

  restoreSessionPlaylistRef.current = restoreSessionPlaylist

  const sanitizeFileStem = (value: string) =>
    value
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'track'

  const persistCustomThemes = (customThemes: ThemeDefinition[], nextThemeId?: string) => {
    localStorage.setItem(customThemesKey, JSON.stringify(customThemes))
    setAvailableThemes([...builtInThemes, ...customThemes])

    if (nextThemeId) {
      setThemeId(nextThemeId)
    }
  }

  const addTheme = (name: string, accent: string) => {
    const id = `custom-${Date.now()}`
    const newTheme: ThemeDefinition = {
      id,
      name: name.trim() || 'Custom',
      builtIn: false,
      vars: {
        '--primary': accent,
        '--primary-soft': `${accent}99`,
      },
    }
    const customThemes = [...availableThemes.filter((theme) => !theme.builtIn), newTheme]
    persistCustomThemes(customThemes, id)
  }

  const deleteTheme = () => {
    const selected = availableThemes.find((theme) => theme.id === themeId)

    if (!selected || selected.builtIn) {
      return
    }

    const customThemes = availableThemes.filter((theme) => !theme.builtIn && theme.id !== themeId)
    persistCustomThemes(customThemes, 'dark')
  }

  const exportThemeFile = async () => {
    const selected = availableThemes.find((theme) => theme.id === themeId) ?? availableThemes[0]
    const name = selected?.name || 'Theme'
    const vars = {
      ...captureThemeVars(),
      ...(selected?.vars ?? {}),
    }
    const themeFile = buildThemeFile(name, vars)
    const stem = sanitizeFileStem(name)
    const defaultPath = lastMusicFolder ? await join(lastMusicFolder, `${stem}.${themeFileExtension}`) : `${stem}.${themeFileExtension}`

    try {
      const outputPath = await save({
        defaultPath,
        title: labels.exportTheme,
        filters: [{ name: 'JSON', extensions: [themeFileExtension] }],
      })

      if (typeof outputPath !== 'string' || !outputPath) {
        return
      }

      await writeTextFile(outputPath, serializeThemeFile(themeFile))
      const exported = `${labels.exportThemeSuccess}: ${outputPath}`
      setThemeMessage(exported)
      pushStatus(exported, 'success')
    } catch (error) {
      console.error('[theme] export failed', error)
      const failed = `${labels.exportThemeError}: ${error instanceof Error ? error.message : String(error)}`
      setThemeMessage(failed)
      pushStatus(failed, 'error')
    }
  }

  const importThemeFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        defaultPath: lastMusicFolder || undefined,
        title: labels.importTheme,
        filters: [{ name: 'JSON', extensions: [themeFileExtension] }],
      })

      const path = typeof selected === 'string' ? selected : Array.isArray(selected) ? selected[0] : null

      if (!path) {
        return
      }

      const themeFile = parseThemeFile(await readTextFile(path))
      const imported = themeFileToDefinition(themeFile)
      const customThemes = [
        ...availableThemes.filter((theme) => !theme.builtIn && theme.id !== imported.id),
        imported,
      ]

      persistCustomThemes(customThemes, imported.id)

      const importedMsg = `${labels.importThemeSuccess}: ${imported.name}`
      setThemeMessage(importedMsg)
      pushStatus(importedMsg, 'success')
    } catch (error) {
      console.error('[theme] import failed', error)
      const failed = `${labels.importThemeError}: ${error instanceof Error ? error.message : String(error)}`
      setThemeMessage(failed)
      pushStatus(failed, 'error')
    }
  }

  const toggleLanguage = () => {
    setLanguage((currentLanguage) => (currentLanguage === 'ko' ? 'en' : 'ko'))
  }

  const flipSpectrumColors = () => {
    const nextOrder: SpectrumColorOrder = spectrumColorOrderRef.current === 'blue-red' ? 'red-blue' : 'blue-red'
    spectrumColorOrderRef.current = nextOrder
    setSpectrumColorOrder(nextOrder)
  }

  const cycleSpectrumStyle = () => {
    const nextStyle = nextSpectrumStyle(spectrumStyleRef.current)
    spectrumStyleRef.current = nextStyle
    setSpectrumStyle(nextStyle)
    pushStatus(`${labels.spectrumStyle}: ${spectrumStyleLabels[nextStyle]}`, 'success')

    if (showSpectrum && isPlaying) {
      drawSpectrum()
    }
  }

  // The toolbar theme button steps through the theme list in order; picking a
  // specific theme by colour happens in the settings window.
  const cycleTheme = () => {
    const index = availableThemes.findIndex((theme) => theme.id === themeId)
    const nextTheme = availableThemes[(index + 1) % availableThemes.length]
    selectTheme(nextTheme.id)
    pushStatus(`${labels.theme}: ${nextTheme.name}`, 'success')
  }

  const showThemedAlert = (title: string, messageText: string) => {
    setAlertDialog({ title, message: messageText })
  }

  const notifySelectTrackForConvert = () => {
    pushStatus(labels.convertNoTrack, 'info')
    showThemedAlert(labels.convertSave, labels.convertNoTrack)
  }

  const closeConvertDialog = () => {
    if (isConverting) {
      return
    }

    setShowConvertDialog(false)
    setConvertTargetTrackId(null)
    setConvertMessage('')
  }

  const openConvertDialogForTrack = (track: Track) => {
    setTrackContextMenu(null)
    setConvertTargetTrackId(track.id)
    setConvertQuality('high')
    setConvertMessage('')
    setShowConvertDialog(true)
  }

  const openConvertDialog = () => {
    setTrackContextMenu(null)

    if (!currentTrack) {
      notifySelectTrackForConvert()
      return
    }

    setConvertTargetTrackId(currentTrack.id)
    if (isUrlAddedTrack(currentTrack)) {
      setConvertQuality('high')
    }
    setConvertMessage('')
    setShowConvertDialog(true)
  }

  const openTrackContextMenu = (event: ReactMouseEvent, track: Track) => {
    event.preventDefault()
    event.stopPropagation()

    const shell = event.currentTarget.closest('.station-shell')
    const bounds = shell?.getBoundingClientRect()
    const x = bounds ? event.clientX - bounds.left : event.clientX
    const y = bounds ? event.clientY - bounds.top : event.clientY

    setTrackContextMenu({
      trackId: track.id,
      x: Math.max(8, Math.min(x, (bounds?.width ?? 400) - 180)),
      y: Math.max(8, Math.min(y, (bounds?.height ?? 400) - 120)),
    })
  }

  useEffect(() => {
    if (!trackContextMenu) {
      return
    }

    const close = () => setTrackContextMenu(null)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close()
      }
    }

    window.addEventListener('click', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [trackContextMenu])

  const openExtractDialog = () => {
    setExtractMessage('')
    if (remoteUrl.trim()) {
      setExtractUrl(remoteUrl.trim())
    }
    setShowExtractDialog(true)
  }

  const runExtractSave = async () => {
    const url = extractUrl.trim()
    if (!url) {
      setExtractMessage(labels.extractNoUrl)
      return
    }

    const stem = sanitizeFileStem(url.split('/').pop()?.replace(/\?.*$/, '') || 'extracted-audio')
    const defaultPath = lastMusicFolder
      ? await join(lastMusicFolder, `${stem}.${extractFormat}`)
      : `${stem}.${extractFormat}`

    const outputPath = await save({
      defaultPath,
      title: labels.extractAudio,
      filters: [{ name: extractFormat.toUpperCase(), extensions: [extractFormat] }],
    })

    if (typeof outputPath !== 'string' || !outputPath) {
      return
    }

    setIsExtracting(true)
    setExtractMessage(labels.extractBusy)
    pushStatus(labels.extractBusy, 'busy')

    try {
      const result = await invoke<{ outputPath: string; title: string }>('extract_audio_from_url', {
        url,
        outputPath,
        format: extractFormat,
        quality: extractQuality,
      })

      if (extractAddToPlaylist) {
        const track = await createTrackFromPath(
          result.outputPath,
          result.title || fileNameFromPath(result.outputPath),
        )
        addTracks([track])
      }

      const saved = `${labels.extractSuccess}: ${result.outputPath}`
      pushStatus(saved, 'success')
      setExtractMessage('')
      setShowExtractDialog(false)
      showThemedAlert(labels.extractAudio, `${labels.extractSuccess}\n${result.outputPath}`)
    } catch (error) {
      console.error('[extract] failed', error)
      const failed = `${labels.extractError}: ${error instanceof Error ? error.message : String(error)}`
      setExtractMessage(failed)
      pushStatus(failed, 'error')
    } finally {
      setIsExtracting(false)
    }
  }

  const adoptSavedLocalTrack = async (trackId: string, outputPath: string, title: string) => {
    const localTrack = await createTrackFromPath(outputPath, title || fileNameFromPath(outputPath))
    const nextTrack: Track = {
      ...localTrack,
      id: trackId,
      origin: 'local',
      remoteUrl: undefined,
      mode: undefined,
    }

    setTracks((previous) => previous.map((track) => (track.id === trackId ? nextTrack : track)))

    if (currentTrackId === trackId) {
      const audio = audioRef.current
      const shouldResume = Boolean(audio && !audio.paused)

      if (audio) {
        applyTrackSource(audio, nextTrack)
        if (shouldResume) {
          void playCurrentAudio(nextTrack)
        }
      }
    }

    return nextTrack
  }

  const runConvertSave = async () => {
    const targetTrack = convertTargetTrack

    if (!targetTrack) {
      setConvertMessage(labels.convertNoTrack)
      notifySelectTrackForConvert()
      return
    }

    const remoteSave = isUrlAddedTrack(targetTrack)
    const streaming = isStreamingRemoteTrack(targetTrack)
    const dialogTitle = remoteSave
      ? streaming
        ? labels.saveStream
        : labels.contextSaveDownload
      : labels.convertSave
    const busyLabel = remoteSave ? labels.saveStreamBusy : labels.convertBusy
    const successLabel = remoteSave ? labels.saveStreamSuccess : labels.convertSuccess
    const quality = remoteSave ? convertQuality : 'high'

    let prepared = targetTrack
    try {
      prepared = await ensurePlayableTrackRef.current(targetTrack)
    } catch (error) {
      const failed = `${labels.convertError}: ${error instanceof Error ? error.message : String(error)}`
      setConvertMessage(failed)
      pushStatus(failed, 'error')
      return
    }

    const stem = sanitizeFileStem(prepared.title)
    const defaultDirectory =
      (prepared.filePath && !prepared.filePath.toLowerCase().includes('mms-extract-')
        ? prepared.filePath.replace(/[\\/][^\\/]+$/, '')
        : '') || lastMusicFolder || undefined
    const defaultPath = defaultDirectory ? await join(defaultDirectory, `${stem}.${convertFormat}`) : `${stem}.${convertFormat}`

    const outputPath = await save({
      defaultPath,
      title: dialogTitle,
      filters: [{ name: convertFormat.toUpperCase(), extensions: [convertFormat] }],
    })

    if (typeof outputPath !== 'string' || !outputPath) {
      return
    }

    setIsConverting(true)
    setConvertMessage(busyLabel)
    pushStatus(busyLabel, 'busy')

    let tempInputPath = ''

    try {
      // URL-added tracks: prefer saving from the original link at the chosen quality.
      if (remoteSave && prepared.remoteUrl) {
        try {
          await invoke('extract_audio_from_url', {
            url: prepared.remoteUrl,
            outputPath,
            format: convertFormat,
            quality,
          })

          await adoptSavedLocalTrack(prepared.id, outputPath, prepared.title)
          const saved = `${successLabel}: ${outputPath}`
          pushStatus(saved, 'success')
          setIsConverting(false)
          setConvertMessage('')
          setShowConvertDialog(false)
          setConvertTargetTrackId(null)
          showThemedAlert(dialogTitle, `${successLabel}\n${outputPath}`)
          return
        } catch (extractError) {
          console.warn('[save] extract from URL failed, falling back to local convert', extractError)
        }
      }

      let inputPath: string | undefined

      if (prepared.filePath) {
        inputPath = prepared.filePath
      } else if (prepared.source.startsWith('blob:') || prepared.remoteUrl || /^https?:\/\//i.test(prepared.source)) {
        const url = prepared.source.startsWith('blob:')
          ? prepared.source
          : prepared.remoteUrl || prepared.source

        const response = await fetchWithTimeout(url, {}, 60000)

        if (!response.ok) {
          throw new Error(`source fetch ${response.status}`)
        }

        tempInputPath = await join(await tempDir(), `my-music-station-input-${Date.now()}.bin`)
        await writeFile(tempInputPath, new Uint8Array(await response.arrayBuffer()))
        inputPath = tempInputPath
      } else {
        throw new Error(labels.convertNoSource)
      }

      await invoke('convert_audio', {
        inputPath,
        inputBytes: null,
        outputPath,
        format: convertFormat,
        quality,
      })

      if (remoteSave) {
        await adoptSavedLocalTrack(prepared.id, outputPath, prepared.title)
      }

      const converted = `${successLabel}: ${outputPath}`
      pushStatus(converted, 'success')
      setIsConverting(false)
      setConvertMessage('')
      setShowConvertDialog(false)
      setConvertTargetTrackId(null)
      showThemedAlert(dialogTitle, `${successLabel}\n${outputPath}`)

      return
    } catch (error) {
      console.error('[convert] failed', error)
      const failed = `${labels.convertError}: ${error instanceof Error ? error.message : String(error)}`
      setConvertMessage(failed)
      pushStatus(failed, 'error')
    } finally {
      if (tempInputPath) {
        try {
          await remove(tempInputPath)
        } catch {
          // Temp cleanup is best-effort.
        }
      }

      setIsConverting(false)
    }
  }

  const selectTheme = (nextThemeId: string) => {
    setThemeId(nextThemeId)
  }

  const seek = (event: ChangeEvent<HTMLInputElement>) => {
    const nextTime = Number(event.target.value)
    const audio = audioRef.current

    if (audio) {
      audio.currentTime = nextTime
    }

    setCurrentTime(nextTime)
  }

  const applyOutputVolume = (nextVolume: number) => {
    if (audioRef.current) {
      audioRef.current.volume = nextVolume
    }

    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = nextVolume
    }
  }

  const changeVolume = (nextVolume: number) => {
    // Snap to 1% steps so keyboard/slider always move in whole percent units.
    const clamped = Math.min(1, Math.max(0, Math.round(nextVolume * 100) / 100))

    if (clamped > 0) {
      volumeBeforeMuteRef.current = clamped
      setVolume(clamped)
      setIsMuted(false)
      applyOutputVolume(clamped)
      return
    }

    // Dragging to 0 mutes but keeps the last positive level for unmute restore.
    if (volume > 0) {
      volumeBeforeMuteRef.current = volume
    }

    setIsMuted(true)
    applyOutputVolume(0)
  }

  const toggleMute = () => {
    if (isMuted) {
      const restored =
        volume > 0
          ? volume
          : volumeBeforeMuteRef.current > 0
            ? volumeBeforeMuteRef.current
            : 0.82

      if (volume !== restored) {
        setVolume(restored)
      }

      volumeBeforeMuteRef.current = restored
      setIsMuted(false)
      applyOutputVolume(restored)
      return
    }

    if (volume > 0) {
      volumeBeforeMuteRef.current = volume
    }

    setIsMuted(true)
    applyOutputVolume(0)
  }

  const currentTrackDetails = currentTrack
    ? [
        currentTrack.artist,
        currentTrack.album,
        currentTrack.year?.toString(),
        currentTrack.genre,
      ].filter(Boolean)
    : []
  const currentTechnicalDetails = currentTrack
    ? [
        currentTrack.trackNumber ? `Track ${currentTrack.trackNumber}` : '',
        currentTrack.durationSeconds ? formatTime(currentTrack.durationSeconds) : '',
        currentTrack.codec,
        currentTrack.container,
        formatBitrate(currentTrack.bitrate),
        formatSampleRate(currentTrack.sampleRate),
      ].filter(Boolean)
    : []

  const resizeWindowTo = async ({ width, height }: { width: number; height: number }) => {
    const win = getCurrentWindow()
    const size = new LogicalSize(width, height)

    // The main window is created non-resizable with min == max locked to the
    // normal size, so temporarily allow resizing and relax both bounds before
    // applying the new size, then re-lock so the user cannot drag-resize.
    try {
      await win.setResizable(true)
      await win.setMinSize(size)
      await win.setMaxSize(size)
      await win.setSize(size)
      await win.setResizable(false)
    } catch (error) {
      console.warn('[miniMode] failed to resize window', error)
    }
  }

  // Snap the (already resized) window to the bottom-right of the current monitor.
  const moveWindowBottomRight = async ({ width, height }: { width: number; height: number }) => {
    const win = getCurrentWindow()

    try {
      const monitor = await currentMonitor()

      if (!monitor) {
        return
      }

      const scale = monitor.scaleFactor
      const rightMargin = 16
      // Leave room for the Windows taskbar since the monitor size is the full
      // screen, not the work area.
      const bottomMargin = 56
      const x = monitor.position.x + monitor.size.width - Math.round((width + rightMargin) * scale)
      const y = monitor.position.y + monitor.size.height - Math.round((height + bottomMargin) * scale)

      await win.setPosition(new PhysicalPosition(Math.max(monitor.position.x, x), Math.max(monitor.position.y, y)))
    } catch (error) {
      console.warn('[miniMode] failed to move window', error)
    }
  }

  const enterMiniMode = async () => {
    setShowAppInfo(false)
    setShowSettings(false)
    setShowConvertDialog(false)
    setMiniMode(true)
    await resizeWindowTo(miniWindowSize)
    await moveWindowBottomRight(miniWindowSize)
  }

  const exitMiniMode = async () => {
    setMiniMode(false)
    await resizeWindowTo(normalWindowSize)

    try {
      await getCurrentWindow().center()
    } catch (error) {
      console.warn('[miniMode] failed to recenter window', error)
    }
  }

  // Rebind the spectrum loop to the canvas that just mounted for the new layout;
  // the previous animation frame kept drawing to the now-detached canvas.
  useEffect(() => {
    if (isPlaying && showSpectrum && sourceNodeRef.current) {
      drawSpectrum()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [miniMode])

  const openSettings = () => {
    setShowAppInfo(false)
    setShowConvertDialog(false)
    setShowSettings(true)
  }

  const minimizeWindow = async () => {
    await getCurrentWindow().minimize()
  }

  const closeWindow = async () => {
    // Popups are owned by this window; never leave one floating without it.
    await closeAllPopupWindows()

    if (useSystemTray) {
      await getCurrentWindow().hide()
      return
    }

    await getCurrentWindow().close()
  }

  const updateUseSystemTray = (enabled: boolean) => {
    setUseSystemTray(enabled)
    pushStatus(enabled ? labels.statusTrayOn : labels.statusTrayOff, 'info')
  }

  const selectBuiltInWallpaper = (wallpaperId: string) => {
    setWallpaperPath(wallpaperId)
    setWallpaperEnabled(true)
    pushStatus(`${labels.statusWallpaperOn}: ${wallpaperDisplayName(wallpaperId)}`, 'success')
  }

  const chooseWallpaper = async () => {
    const selected = await open({
      multiple: false,
      directory: false,
      defaultPath:
        wallpaperPath && !isBuiltInWallpaperId(wallpaperPath) ? wallpaperPath : lastMusicFolder || undefined,
      title: labels.wallpaperChoose,
      filters: [
        { name: labels.wallpaperFormats, extensions: [...wallpaperFileExtensions] },
        { name: 'JPEG', extensions: ['jpg', 'jpeg', 'jpe', 'jfif'] },
        { name: 'PNG', extensions: ['png', 'apng'] },
        { name: 'GIF', extensions: ['gif'] },
        { name: 'WEBP', extensions: ['webp'] },
        { name: 'TIFF', extensions: ['tif', 'tiff'] },
        { name: 'BMP', extensions: ['bmp', 'dib'] },
        { name: 'SVG', extensions: ['svg', 'svgz'] },
        { name: 'AVIF', extensions: ['avif'] },
        { name: 'ICO', extensions: ['ico'] },
      ],
    })

    const path = typeof selected === 'string' ? selected : Array.isArray(selected) ? selected[0] : null

    if (!path) {
      return
    }

    setWallpaperPath(path)
    setWallpaperEnabled(true)
    pushStatus(labels.statusWallpaperOn, 'success')
  }

  const clearWallpaper = () => {
    if (defaultBuiltInWallpaperId) {
      setWallpaperPath(defaultBuiltInWallpaperId)
      setWallpaperEnabled(true)
      pushStatus(`${labels.statusWallpaperOn}: ${wallpaperDisplayName(defaultBuiltInWallpaperId)}`, 'info')
      return
    }

    setWallpaperPath('')
    setWallpaperEnabled(false)
    setWallpaperUrl('')
    pushStatus(labels.statusWallpaperOff, 'info')
  }

  const startWindowDrag = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return
    }

    const target = event.target as HTMLElement
    if (target.closest('button, input, select, label, a, .toolbar-popover')) {
      return
    }

    // startDragging must run in the same turn as pointerdown.
    // Awaiting the promise often drops the first drag gesture on Windows.
    event.preventDefault()
    void getCurrentWindow().startDragging()
  }


  const popupChrome: PopupChrome = { language, theme: selectedTheme }

  const settingsPopupData: SettingsPopupData = {
    useSystemTray,
    reopenLastFolderOnStart,
    wallpaperEnabled,
    wallpaperPath,
    wallpaperDim,
    panelOpacity,
    themeId,
    themes: availableThemes,
    themeMessage,
  }

  const onSettingsPopupAction = (action: SettingsPopupAction) => {
    switch (action.type) {
      case 'setUseSystemTray':
        updateUseSystemTray(action.enabled)
        break
      case 'setReopenLastFolderOnStart':
        setReopenLastFolderOnStart(action.enabled)
        break
      case 'setWallpaperEnabled': {
        const enabled = action.enabled
        if (enabled && !wallpaperPath && defaultBuiltInWallpaperId) {
          setWallpaperPath(defaultBuiltInWallpaperId)
        }
        setWallpaperEnabled(enabled)
        pushStatus(enabled ? labels.statusWallpaperOn : labels.statusWallpaperOff, 'info')
        break
      }
      case 'selectBuiltInWallpaper':
        selectBuiltInWallpaper(action.wallpaperId)
        break
      case 'chooseWallpaper':
        void chooseWallpaper()
        break
      case 'clearWallpaper':
        clearWallpaper()
        break
      case 'setWallpaperDim':
        setWallpaperDim(action.value)
        break
      case 'setPanelOpacity':
        setPanelOpacity(action.value)
        break
      case 'selectTheme':
        selectTheme(action.themeId)
        break
      case 'addTheme':
        addTheme(action.name, action.accent)
        break
      case 'deleteTheme':
        deleteTheme()
        break
      case 'exportTheme':
        void exportThemeFile()
        break
      case 'importTheme':
        void importThemeFile()
        break
      case 'save':
        void saveSettingsFromDialog()
        break
      case 'close':
        setShowSettings(false)
        break
    }
  }

  const convertPopupData: ConvertPopupData = {
    title: convertDialogTitle,
    busyLabel: convertDialogBusy,
    trackTitle: convertTargetTrack?.title ?? null,
    isRemoteSave: convertDialogIsRemoteSave,
    format: convertFormat,
    formats: convertFormats,
    quality: convertQuality,
    isConverting,
    message: convertMessage,
  }

  const onConvertPopupAction = (action: ConvertPopupAction) => {
    switch (action.type) {
      case 'setFormat':
        setConvertFormat(action.format)
        break
      case 'setQuality':
        setConvertQuality(action.quality)
        break
      case 'run':
        void runConvertSave()
        break
      case 'close':
        closeConvertDialog()
        break
    }
  }

  const extractPopupData: ExtractPopupData = {
    url: extractUrl,
    format: extractFormat,
    formats: extractFormats,
    quality: extractQuality,
    addToPlaylist: extractAddToPlaylist,
    isExtracting,
    message: extractMessage,
  }

  // The OS window can also vanish on its own (Alt+F4, main window closing); the
  // flag must follow it or the next open would find no window to show.
  const onConvertPopupClosed = () => {
    setShowConvertDialog(false)
    if (!isConverting) {
      setConvertTargetTrackId(null)
      setConvertMessage('')
    }
  }

  const onExtractPopupAction = (action: ExtractPopupAction) => {
    switch (action.type) {
      case 'setUrl':
        setExtractUrl(action.url)
        break
      case 'setFormat':
        setExtractFormat(action.format)
        break
      case 'setQuality':
        setExtractQuality(action.quality)
        break
      case 'setAddToPlaylist':
        setExtractAddToPlaylist(action.enabled)
        break
      case 'run':
        void runExtractSave()
        break
      case 'close':
        if (!isExtracting) {
          setShowExtractDialog(false)
        }
        break
    }
  }

  return (
    <main
      className={`station-shell${wallpaperEnabled && wallpaperUrl ? ' has-wallpaper' : ''}${miniMode ? ' mini-mode' : ''}`}
      style={
        {
          '--panel-opacity': String(panelOpacity),
          ...(wallpaperEnabled && wallpaperUrl
            ? {
                '--wallpaper-dim': String(wallpaperDim),
              }
            : {}),
        } as CSSProperties
      }
    >
      {wallpaperEnabled && wallpaperUrl && (
        <>
          <img className="wallpaper-layer" src={wallpaperUrl} alt="" draggable={false} />
          <div className="wallpaper-dim" aria-hidden="true" />
        </>
      )}
      <audio
        ref={audioRef}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onEnded={() => playRelativeTrack(1)}
        onError={(event) => {
          const mediaError = event.currentTarget.error
          console.error('[audio] element error', mediaError?.code, mediaError?.message, event.currentTarget.src.slice(0, 60))
          pushStatus(`${labels.playbackError} (media error ${mediaError?.code ?? '?'})`, 'error')
        }}
        onPause={() => setIsPlaying(false)}
        onPlay={handleAudioPlay}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
      />

      {miniMode ? (
      <div className="mini-view" onPointerDown={startWindowDrag}>
        <div className="mini-toolbar">
          <div className="mini-brand" aria-hidden="true" title={labels.appName} />
          <div className="mini-toolbar-group">
            <button
              type="button"
              className="mini-button"
              data-tooltip={`${labels.theme}: ${selectedTheme?.name ?? ''}`}
              aria-label={labels.theme}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={cycleTheme}
            >
              <Palette size={13} />
            </button>
            <button
              type="button"
              className={`mini-button${spectrumColorOrder === 'red-blue' ? ' is-active' : ''}`}
              data-tooltip={`${labels.flipSpectrumColors} (${spectrumColorOrder === 'blue-red' ? labels.spectrumBlueRed : labels.spectrumRedBlue})`}
              aria-label={labels.flipSpectrumColors}
              aria-pressed={spectrumColorOrder === 'red-blue'}
              disabled={!showSpectrum}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={flipSpectrumColors}
            >
              <ArrowLeftRight size={13} />
            </button>
            <button
              type="button"
              className="mini-button mini-style-button"
              data-tooltip={`${labels.cycleSpectrumStyle}: ${spectrumStyleLabels[spectrumStyle]}`}
              aria-label={labels.cycleSpectrumStyle}
              disabled={!showSpectrum}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={cycleSpectrumStyle}
            >
              <ChartColumn size={13} />
            </button>
          </div>
          <div
            className="mini-opacity"
            data-tooltip={`${labels.panelOpacity} (${Math.round(panelOpacity * 100)}%)`}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <Blend size={13} aria-hidden="true" />
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.01"
              value={panelOpacity}
              aria-label={labels.panelOpacity}
              onChange={(event) => setPanelOpacity(Number(event.target.value))}
            />
            <span className="mini-opacity-value">{Math.round(panelOpacity * 100)}%</span>
          </div>
          <div className="mini-toolbar-group">
            <button
              type="button"
              className="mini-button"
              data-tooltip={labels.restoreNormalMode}
              aria-label={labels.restoreNormalMode}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => void exitMiniMode()}
            >
              <Maximize2 size={13} />
            </button>
            <button
              type="button"
              className="mini-button"
              data-tooltip={labels.settings}
              aria-label={labels.settings}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={openSettings}
            >
              <Settings size={13} />
            </button>
            <button
              type="button"
              className="mini-button mini-close"
              data-tooltip={useSystemTray ? labels.close : labels.quitApp}
              aria-label={useSystemTray ? labels.close : labels.quitApp}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={closeWindow}
            >
              <X size={13} />
            </button>
          </div>
        </div>
        <div className="mini-spectrum-stage">
          {showSpectrum ? (
            <canvas ref={canvasRef} className="mini-spectrum" width="320" height="76" aria-label="Spectrum" />
          ) : (
            <div className="mini-spectrum mini-spectrum-disabled" aria-hidden="true" />
          )}
          {transportOverlay && (
            <div className={`spectrum-overlay spectrum-overlay-mini spectrum-overlay-${transportOverlay}`} aria-hidden="true">
              <span className="spectrum-overlay-icon">
                {transportOverlay === 'spectrum' && <AudioWaveform size={22} />}
                {transportOverlay === 'play' && <Play size={24} />}
                {transportOverlay === 'pause' && <Pause size={24} />}
                {transportOverlay === 'stop' && <Square size={20} />}
              </span>
            </div>
          )}
        </div>
        <div className="mini-now-playing">
          <div className="mini-control-row">
            <div className="mini-transport">
              <button
                type="button"
                className="mini-transport-button mini-skip-button"
                data-tooltip={labels.previous}
                aria-label={labels.previous}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => playRelativeTrack(-1)}
              >
                <SkipBack size={11} />
              </button>
              <button
                type="button"
                className="mini-transport-button primary"
                data-tooltip={isPlaying ? labels.pause : labels.play}
                aria-label={isPlaying ? labels.pause : labels.play}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={isPlaying ? pause : play}
              >
                {isPlaying ? <Pause size={11} /> : <Play size={11} />}
              </button>
              <button
                type="button"
                className="mini-transport-button stop-button"
                data-tooltip={labels.stop}
                aria-label={labels.stop}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={stop}
              >
                <Square size={11} />
              </button>
              <button
                type="button"
                className="mini-transport-button mini-skip-button"
                data-tooltip={labels.next}
                aria-label={labels.next}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => playRelativeTrack(1)}
              >
                <SkipForward size={11} />
              </button>
            </div>
            <div
              className="mini-progress"
              data-tooltip={formatTime(Math.min(currentTime, duration || 0))}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <span className="mini-time">{formatTime(Math.min(currentTime, duration || 0))}</span>
              <input
                className="mini-seek"
                aria-label={labels.position}
                aria-valuetext={formatTime(Math.min(currentTime, duration || 0))}
                type="range"
                min="0"
                max={duration || 0}
                step="0.1"
                value={Math.min(currentTime, duration || 0)}
                onChange={seek}
              />
              <span className="mini-time">{formatTime(duration)}</span>
            </div>
            <div
              className={`mini-volume${isMuted ? ' is-inactive' : ''}`}
              data-tooltip={`${labels.volume} (${volumePercent}%)`}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="mini-volume-mute"
                data-tooltip={isMuted ? labels.unmute : labels.mute}
                aria-label={isMuted ? labels.unmute : labels.mute}
                aria-pressed={!isMuted}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={toggleMute}
              >
                {isMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
              </button>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={volumePercent}
                aria-label={labels.volume}
                aria-valuetext={`${volumePercent}%`}
                onChange={(event) => changeVolume(Number(event.target.value) / 100)}
                onInput={(event) => changeVolume(Number(event.currentTarget.value) / 100)}
              />
              <span className="mini-volume-value">{volumePercent}%</span>
            </div>
          </div>
          <div className="mini-track-row">
            <span className="mini-track-icon" aria-hidden="true">
              <img src={currentTrack?.artworkUrl ?? appIconUrl} alt="" />
            </span>
            <div className="mini-track-text">
              <strong title={currentTrack?.title ?? labels.noTrack}>{currentTrack?.title ?? labels.noTrack}</strong>
              <small title={currentTrackDetails.join(' / ')}>
                {currentTrackDetails.length > 0 ? currentTrackDetails.join(' / ') : ''}
              </small>
            </div>
          </div>
        </div>
      </div>
      ) : (
      <>
      <header className="title-toolbar" onPointerDown={startWindowDrag}>
        <div className="brand-block">
          <strong>{labels.appName}</strong>
        </div>

        <div className="toolbar-drag-space" />

        <div className="toolbar-actions">
          <button className="tool-button icon-only" type="button" data-tooltip={labels.openFolder} aria-label={labels.openFolder} onPointerDown={(event) => event.stopPropagation()} onClick={openMusicFolder}>
            <FolderOpen size={14} aria-hidden="true" />
          </button>
          <button className="tool-button icon-only" type="button" data-tooltip={labels.reopenFolder} aria-label={labels.reopenFolder} onPointerDown={(event) => event.stopPropagation()} onClick={reopenMusicFolder}>
            <RotateCcw size={14} aria-hidden="true" />
          </button>
          <button className="tool-button icon-only" type="button" data-tooltip={labels.addFiles} aria-label={labels.addFiles} onPointerDown={(event) => event.stopPropagation()} onClick={openAudioFiles}>
            <Plus size={14} aria-hidden="true" />
          </button>
          <button className="tool-button icon-only" type="button" data-tooltip={labels.savePlaylist} aria-label={labels.savePlaylist} onPointerDown={(event) => event.stopPropagation()} onClick={savePlaylist}>
            <Save size={14} aria-hidden="true" />
          </button>
          <button
            className="tool-button icon-only"
            type="button"
            data-tooltip={currentTrack && isStreamingRemoteTrack(currentTrack) ? labels.saveStream : labels.convertSave}
            aria-label={currentTrack && isStreamingRemoteTrack(currentTrack) ? labels.saveStream : labels.convertSave}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={openConvertDialog}
          >
            <FileAudio size={14} aria-hidden="true" />
          </button>
          <button className="tool-button icon-only" type="button" data-tooltip={labels.extractAudio} aria-label={labels.extractAudio} onPointerDown={(event) => event.stopPropagation()} onClick={openExtractDialog}>
            <CloudDownload size={14} aria-hidden="true" />
          </button>
          <button
            className={`tool-button icon-only${spectrumColorOrder === 'red-blue' ? ' active-toggle' : ''}`}
            type="button"
            data-tooltip={`${labels.flipSpectrumColors} (${spectrumColorOrder === 'blue-red' ? labels.spectrumBlueRed : labels.spectrumRedBlue})`}
            aria-label={labels.flipSpectrumColors}
            aria-pressed={spectrumColorOrder === 'red-blue'}
            disabled={!showSpectrum}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={flipSpectrumColors}
          >
            <ArrowLeftRight size={14} />
          </button>
          <button
            className="tool-button icon-only"
            type="button"
            data-tooltip={`${labels.cycleSpectrumStyle}: ${spectrumStyleLabels[spectrumStyle]}`}
            aria-label={labels.cycleSpectrumStyle}
            disabled={!showSpectrum}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={cycleSpectrumStyle}
          >
            <ChartColumn size={14} />
          </button>
          <div
            className="toolbar-opacity"
            data-tooltip={`${labels.panelOpacity} (${Math.round(panelOpacity * 100)}%)`}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <Blend size={14} aria-hidden="true" />
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.01"
              value={panelOpacity}
              aria-label={labels.panelOpacity}
              onChange={(event) => setPanelOpacity(Number(event.target.value))}
            />
            <span className="toolbar-opacity-value">{Math.round(panelOpacity * 100)}%</span>
          </div>
          <button className="tool-button icon-only language-toggle" type="button" data-tooltip={labels.language} aria-label={labels.language} onPointerDown={(event) => event.stopPropagation()} onClick={toggleLanguage}>
            <Languages size={14} aria-hidden="true" />
          </button>
          <button
            className="tool-button icon-only"
            type="button"
            data-tooltip={`${labels.theme}: ${selectedTheme.name}`}
            aria-label={labels.theme}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              cycleTheme()
            }}
          >
            <Palette size={14} />
          </button>
          <button
            className="tool-button icon-only"
            type="button"
            data-tooltip={labels.appInfo}
            aria-label={labels.appInfo}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              setShowSettings(false)
              setShowConvertDialog(false)
              setShowAppInfo(true)
            }}
          >
            <Info size={14} />
          </button>
          <button
            className={`tool-button icon-only${trackListCollapsed ? ' active-toggle' : ''}`}
            type="button"
            data-tooltip={trackListCollapsed ? labels.expandTrackList : labels.collapseTrackList}
            aria-label={trackListCollapsed ? labels.expandTrackList : labels.collapseTrackList}
            aria-pressed={trackListCollapsed}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setTrackListCollapsed((collapsed) => !collapsed)}
          >
            {trackListCollapsed ? <PanelRightOpen size={14} /> : <PanelRightClose size={14} />}
          </button>
        </div>

        <div className="window-actions">
          <button
            type="button"
            className="mini-mode-button"
            data-tooltip={labels.miniMode}
            aria-label={labels.miniMode}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => void enterMiniMode()}
          >
            <Minimize2 size={14} />
          </button>
          <button
            type="button"
            data-tooltip={labels.settings}
            aria-label={labels.settings}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              openSettings()
            }}
          >
            <Settings size={14} />
          </button>
          <button type="button" data-tooltip={labels.minimize} aria-label={labels.minimize} onPointerDown={(event) => event.stopPropagation()} onClick={minimizeWindow}>
            <Minus size={14} />
          </button>
          <button
            type="button"
            className="close-button"
            data-tooltip={useSystemTray ? labels.close : labels.quitApp}
            aria-label={useSystemTray ? labels.close : labels.quitApp}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={closeWindow}
          >
            <X size={14} />
          </button>
        </div>
      </header>

      <section className={`content-grid${trackListCollapsed ? ' track-list-collapsed' : ''}`}>
        <section className="player-panel">
          <div className="now-playing">
            <div className="album-art" aria-label={currentTrack?.artworkUrl ? currentTrack.title : labels.noAlbumArt}>
              <img src={currentTrack?.artworkUrl ?? appIconUrl} alt="" />
            </div>
            <div className="now-playing-meta">
              <span>{currentTrack ? (currentTrack.origin === 'local' ? labels.local : labels.remote) : '\u00a0'}</span>
              <h1>{currentTrack?.title ?? labels.noTrack}</h1>
              <p>{currentTrackDetails.length > 0 ? currentTrackDetails.join(' / ') : '\u00a0'}</p>
              <div className="track-detail-line">
                {currentTechnicalDetails.length > 0 ? currentTechnicalDetails.join(' · ') : '\u00a0'}
              </div>
            </div>
            <small>{labels.formats}</small>
          </div>

          <div className="spectrum-stage">
            {showSpectrum ? (
              <canvas ref={canvasRef} className="spectrum" width="500" height="236" aria-label="Spectrum" />
            ) : (
              <div className="spectrum spectrum-disabled" aria-hidden="true" />
            )}
            {transportOverlay && (
              <div className={`spectrum-overlay spectrum-overlay-${transportOverlay}`} aria-hidden="true">
                <span className="spectrum-overlay-icon">
                  {transportOverlay === 'spectrum' && <AudioWaveform size={40} />}
                  {transportOverlay === 'play' && <Play size={42} />}
                  {transportOverlay === 'pause' && <Pause size={42} />}
                  {transportOverlay === 'stop' && <Square size={36} />}
                </span>
              </div>
            )}
          </div>
          <div className="transport-bar">
            <div className="transport">
              <button type="button" data-tooltip={labels.previous} aria-label={labels.previous} onClick={() => playRelativeTrack(-1)}>
                <SkipBack size={13} />
              </button>
              <button type="button" className="primary" data-tooltip={isPlaying ? labels.pause : labels.play} aria-label={isPlaying ? labels.pause : labels.play} onClick={isPlaying ? pause : play}>
                {isPlaying ? <Pause size={13} /> : <Play size={13} />}
              </button>
              <button type="button" className="stop-button" data-tooltip={labels.stop} aria-label={labels.stop} onClick={stop}>
                <Square size={13} />
              </button>
              <button type="button" data-tooltip={labels.next} aria-label={labels.next} onClick={() => playRelativeTrack(1)}>
                <SkipForward size={13} />
              </button>
            </div>

            <div className={`volume-control transport-volume${isMuted ? ' is-inactive' : ' is-active'}`}>
              <button
                type="button"
                className={`volume-mute-button${isMuted ? ' is-inactive' : ' is-active'}`}
                data-tooltip={isMuted ? labels.unmute : labels.mute}
                aria-label={isMuted ? labels.unmute : labels.mute}
                aria-pressed={!isMuted}
                onClick={toggleMute}
              >
                {isMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
              </button>
              <span className="volume-bound">0%</span>
              <input
                aria-label={labels.volume}
                data-tooltip={`${labels.volume} ${volumePercent}%`}
                aria-valuetext={`${volumePercent}%`}
                type="range"
                min="0"
                max="100"
                step="1"
                value={volumePercent}
                onChange={(event) => changeVolume(Number(event.target.value) / 100)}
                onInput={(event) => changeVolume(Number(event.currentTarget.value) / 100)}
              />
              <span className="volume-bound">100%</span>
              <span className="volume-value" aria-live="polite">
                {volumePercent}%
              </span>
            </div>
          </div>

          <div className="timeline">
            <span>{formatTime(currentTime)}</span>
            <input aria-label={labels.position} type="range" min="0" max={duration || 0} step="0.1" value={Math.min(currentTime, duration || 0)} onChange={seek} />
            <span>{formatTime(duration)}</span>
          </div>
        </section>

        {!trackListCollapsed && (
        <aside className="side-panel">
          <form className="remote-form" onSubmit={(event) => void addRemoteTrack(event)}>
            <Link size={14} />
            <input
              id="remote-url"
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              aria-label={labels.remoteUrl}
              placeholder="https://…"
              value={remoteUrl}
              onChange={(event) => setRemoteUrl(event.target.value)}
              onPointerDown={(event) => event.stopPropagation()}
            />
            <button type="submit" data-tooltip={labels.addRemote} aria-label={labels.addRemote} disabled={isResolvingRemote || !remoteUrl.trim()}>
              <Download size={14} />
            </button>
          </form>

          <div className="folder-chip" title={lastMusicFolder || labels.folder}>
            {lastMusicFolder || labels.folder}
          </div>

          <div className="track-list" aria-label={labels.playlist}>
            {tracks.map((track) => (
              <div
                key={track.id}
                className={`track-row${track.id === currentTrackId ? ' active' : ''}`}
                onContextMenu={(event) => openTrackContextMenu(event, track)}
              >
                <button
                  type="button"
                  className="track-select"
                  data-tooltip={track.title}
                  aria-label={track.title}
                  onClick={() => selectTrack(track.id)}
                >
                  <span>{track.title}</span>
                  <small>{[track.artist, track.album].filter(Boolean).join(' / ') || (track.origin === 'local' ? labels.local : labels.remote)}</small>
                </button>
                <button
                  type="button"
                  className="track-remove"
                  data-tooltip={labels.removeTrack}
                  aria-label={`${labels.removeTrack}: ${track.title}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    removeTrackFromPlaylist(track.id)
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </aside>
        )}
      </section>

      {trackContextMenu && (() => {
        const menuTrack = tracks.find((track) => track.id === trackContextMenu.trackId)
        if (!menuTrack) {
          return null
        }

        return (
          <div
            className="track-context-menu"
            role="menu"
            style={{ left: trackContextMenu.x, top: trackContextMenu.y }}
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setTrackContextMenu(null)
                void loadAndPlayTrack(menuTrack)
              }}
            >
              <Play size={13} />
              <span>{labels.contextPlay}</span>
            </button>
            {isUrlAddedTrack(menuTrack) && (
              <button
                type="button"
                role="menuitem"
                onClick={() => openConvertDialogForTrack(menuTrack)}
              >
                <Save size={13} />
                <span>{labels.contextSaveDownload}</span>
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className="danger"
              onClick={() => {
                setTrackContextMenu(null)
                removeTrackFromPlaylist(menuTrack.id)
              }}
            >
              <Trash2 size={13} />
              <span>{labels.removeTrack}</span>
            </button>
          </div>
        )
      })()}

      <footer className="status-bar" role="status" aria-live="polite" aria-label={labels.statusBar}>
        <span
          className={`status-state status-${statusMessage ? statusKind : 'info'}${statusMessage && statusKind === 'error' ? ' status-clickable' : ''}`}
          title={statusText}
          role={statusMessage && statusKind === 'error' ? 'button' : undefined}
          tabIndex={statusMessage && statusKind === 'error' ? 0 : undefined}
          onClick={() => {
            if (statusMessage && statusKind === 'error') {
              setErrorDialogMessage(statusMessage)
            }
          }}
          onKeyDown={(event) => {
            if ((event.key === 'Enter' || event.key === ' ') && statusMessage && statusKind === 'error') {
              event.preventDefault()
              setErrorDialogMessage(statusMessage)
            }
          }}
        >
          {statusText}
        </span>
        <span className="status-track" title={currentTrack?.title ?? labels.noTrack}>
          {currentTrack?.title ?? labels.noTrack}
        </span>
        <span className="status-meta">
          <span>{selectedTheme.name}</span>
          <span>{useSystemTray ? labels.statusTrayOn : labels.statusTrayOff}</span>
          <span>{wallpaperEnabled && wallpaperPath ? labels.statusWallpaperOn : labels.statusWallpaperOff}</span>
          <span className={isMuted ? 'status-volume-inactive' : undefined}>
            {volumePercent}%{isMuted ? ` (${labels.speakerInactive})` : ''}
          </span>
        </span>
      </footer>
      </>
      )}

      {/* Dialogs live in their own OS windows (or inline in a plain browser); mounted in
          both layouts so a window never outlives the state that opened it. */}
      <PopupHost
        kind="convert"
        open={showConvertDialog}
        chrome={popupChrome}
        data={convertPopupData}
        onAction={onConvertPopupAction}
        onClosed={onConvertPopupClosed}
      />
      <PopupHost
        kind="extract"
        open={showExtractDialog}
        chrome={popupChrome}
        data={extractPopupData}
        onAction={onExtractPopupAction}
        onClosed={() => setShowExtractDialog(false)}
      />
      <PopupHost
        kind="settings"
        open={showSettings}
        chrome={popupChrome}
        data={settingsPopupData}
        onAction={onSettingsPopupAction}
        onClosed={() => setShowSettings(false)}
      />
      <PopupHost
        kind="appInfo"
        open={showAppInfo}
        chrome={popupChrome}
        data={{}}
        onAction={() => setShowAppInfo(false)}
        onClosed={() => setShowAppInfo(false)}
      />
      <PopupHost
        kind="alert"
        open={Boolean(alertDialog)}
        chrome={popupChrome}
        data={alertDialog}
        onAction={() => setAlertDialog(null)}
        onClosed={() => setAlertDialog(null)}
      />
      <PopupHost
        kind="error"
        open={Boolean(errorDialogMessage)}
        chrome={popupChrome}
        data={errorDialogMessage ? { message: errorDialogMessage } : null}
        onAction={closeErrorDialog}
        onClosed={closeErrorDialog}
      />
      <PopupHost
        kind="folderProgress"
        open={Boolean(folderProgress)}
        chrome={popupChrome}
        data={folderProgress}
        onAction={() => {}}
        onClosed={() => {}}
      />
    </main>
  )
}

export default App
