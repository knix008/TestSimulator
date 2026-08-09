import type { CSSProperties, ChangeEvent, FormEvent, PointerEvent } from 'react'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { join, tempDir } from '@tauri-apps/api/path'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { message, open, save } from '@tauri-apps/plugin-dialog'
import { readDir, readFile, readTextFile, remove, writeFile, writeTextFile } from '@tauri-apps/plugin-fs'
import {
  ArrowLeftRight,
  AudioWaveform,
  ChartColumn,
  CircleAlert,
  Copy,
  Download,
  FileAudio,
  FileInput,
  FolderOpen,
  ImagePlus,
  Info,
  Languages,
  Link,
  Minus,
  Palette,
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
  Upload,
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
import {
  drawSpectrumFrame,
  nextSpectrumStyle,
  spectrumStyles,
} from './spectrumModes'
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
  builtInWallpapers,
  defaultBuiltInWallpaperId,
  findBuiltInWallpaper,
  isBuiltInWallpaperId,
  wallpaperDisplayName,
  wallpaperFileExtensions,
  wallpaperMimeFromPath,
} from './wallpapers'
import { useDialogDrag } from './useDialogDrag'
import appIconUrl from '../asset/app-icon.svg'
import './App.css'
type Track = {
  id: string
  title: string
  source: string
  origin: 'local' | 'remote'
  filePath?: string
  remoteUrl?: string
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

const audioExtensions = ['.mp3', '.flac', '.wav', '.ogg', '.aac', '.m4a', '.webm', '.opus']
const convertFormats = ['mp3', 'wav', 'flac', 'ogg', 'm4a'] as const
type ConvertFormat = (typeof convertFormats)[number]
type TransportOverlay = 'play' | 'pause' | 'stop' | 'spectrum'
type StatusKind = 'info' | 'success' | 'error' | 'busy'
const customThemesKey = 'myMusicStation.customThemes'
const lastMusicFolderKey = 'myMusicStation.lastMusicFolder'
const defaultMusicFolder = 'D:\\Home\\Music'
const appVersion = '0.0.0'
const buildDate = '2026-08-08'

const text = {
  ko: {
    appName: 'My Music Station',
    title: '멀티 OS 플레이어',
    addFiles: '파일 추가',
    addFilesShort: '추가',
    openFolder: '폴더 열기',
    openFolderShort: '폴더',
    reopenFolder: '다시 열기',
    reopenFolderShort: '다시',
    savePlaylist: '플레이리스트 저장',
    savePlaylistShort: '저장',
    openPlaylist: '플레이리스트 열기',
    addRemote: 'URL 추가',
    addTheme: '테마 추가',
    deleteTheme: '테마 삭제',
    exportTheme: '테마 파일 저장',
    importTheme: '테마 파일 열기',
    exportThemeSuccess: '테마 파일을 저장했습니다',
    importThemeSuccess: '테마 파일을 불러왔습니다',
    exportThemeError: '테마 파일을 저장할 수 없습니다',
    importThemeError: '테마 파일을 읽을 수 없습니다',
    appInfo: '프로그램 정보',
    settings: '설정',
    settingsGeneral: '일반',
    settingsWindow: '창 / 시스템',
    settingsAppearance: '배경',
    settingsPlayback: '재생',
    saveSettings: '설정 저장',
    settingsSaved: '설정을 저장했습니다',
    settingsSaveError: '설정을 저장할 수 없습니다',
    useSystemTray: '시스템 트레이 사용',
    useSystemTrayHint: '끄면 닫기 시 앱이 종료되고 트레이 아이콘이 숨겨집니다.',
    wallpaperEnabled: '배경 이미지 사용',
    wallpaperEnabledHint: 'background 폴더의 기본 이미지 또는 사용자 지정 이미지를 표시합니다.',
    wallpaperBuiltIn: '기본 배경',
    wallpaperChoose: '다른 이미지 선택',
    wallpaperClear: '배경 이미지 제거',
    wallpaperDim: '배경 어둡기',
    panelOpacity: '패널 불투명도',
    panelOpacityHint: '값을 낮출수록 배경이 더 비칩니다.',
    wallpaperNone: '선택된 이미지 없음',
    wallpaperCustom: '사용자 지정',
    wallpaperFormats: '이미지 파일',
    rememberVolume: '종료 후 볼륨 기억',
    showSpectrum: '스펙트럼 표시',
    spectrumColorOrder: '스펙트럼 색 방향',
    spectrumBlueRed: '왼쪽 파랑 → 오른쪽 빨강',
    spectrumRedBlue: '왼쪽 빨강 → 오른쪽 파랑',
    flipSpectrumColors: '스펙트럼 색 좌우 반전',
    spectrumStyle: '스펙트럼 표시 방식',
    cycleSpectrumStyle: '스펙트럼 방식 전환',
    spectrumStyleBars: '막대',
    spectrumStyleMirror: '대칭 막대',
    spectrumStyleWave: '파형',
    spectrumStyleLine: '라인',
    spectrumStyleRadial: '원형',
    spectrumStyleDots: '도트',
    spectrumStyleBlocks: '블록',
    convertSave: '형식 변환 저장',
    convertSaveShort: '변환',
    languageShortEn: 'EN',
    languageShortKo: '한',
    convertFormat: '저장 형식',
    convertTrack: '대상 트랙',
    convertBusy: '변환 중…',
    convertSuccess: '변환 파일을 저장했습니다',
    convertError: '변환할 수 없습니다',
    convertNoTrack: '변환할 곡을 먼저 선택하세요',
    convertNoSource: '변환할 수 있는 오디오 소스가 없습니다',
    reopenLastFolderOnStart: '시작 시 마지막 폴더 열기',
    tracksAlreadyLoaded: '이미 목록에 있는 항목은 건너뛰었습니다',
    folderNothingNew: '새 파일이 없어 다시 불러오지 않았습니다',
    language: '언어',
    theme: '테마',
    minimize: '최소화',
    close: '닫기',
    quitApp: '종료',
    previous: '이전 곡',
    play: '재생',
    pause: '일시정지',
    stop: '정지',
    next: '다음 곡',
    volume: '볼륨',
    mute: '볼륨 Off',
    unmute: '볼륨 On',
    speakerActive: '스피커 켜짐',
    speakerInactive: '스피커 꺼짐',
    position: '재생 위치',
    remoteUrl: '원격 오디오 URL',
    noTrack: '음악을 추가하세요',
    playlist: '재생 목록',
    removeTrack: '목록에서 삭제',
    folder: '폴더',
    formats: 'MP3 FLAC WAV OGG AAC M4A WebM OPUS',
    themeName: '테마 이름',
    accent: '강조색',
    local: '로컬',
    remote: '원격',
    noAlbumArt: '앨범 이미지 없음',
    playbackError: '재생할 수 없습니다',
    saveError: '저장할 수 없습니다',
    saveEmpty: '저장할 재생 목록이 없습니다',
    saveNoPersistable: '경로가 있는 로컬 파일이나 URL만 저장할 수 있습니다. 폴더 열기/파일 열기를 사용하세요.',
    saveSuccess: '재생 목록을 저장했습니다',
    statusReady: '준비됨',
    statusPlaying: '재생 중',
    statusPaused: '일시정지',
    statusStopped: '정지',
    statusTrayOn: '트레이 사용',
    statusTrayOff: '트레이 끄기',
    statusWallpaperOn: '배경 사용',
    statusWallpaperOff: '배경 없음',
    statusBar: '상태바',
    errorDialog: '오류',
    errorDialogHint: '아래 내용을 선택하거나 복사할 수 있습니다.',
    copyError: '내용 복사',
    copied: '복사됨',
    copyFailed: '클립보드에 복사하지 못했습니다',
    openFiles: '파일 열기',
    version: '버전',
    build: '빌드',
    author: '작성자',
    copyright: 'Copyright',
  },
  en: {
    appName: 'My Music Station',
    title: 'Multi OS Player',
    addFiles: 'Add files',
    addFilesShort: 'Add',
    openFolder: 'Open folder',
    openFolderShort: 'Open',
    reopenFolder: 'Reopen',
    reopenFolderShort: 'Reopen',
    savePlaylist: 'Save playlist',
    savePlaylistShort: 'Save',
    openPlaylist: 'Open playlist',
    addRemote: 'Add URL',
    addTheme: 'Add theme',
    deleteTheme: 'Delete theme',
    exportTheme: 'Save theme file',
    importTheme: 'Open theme file',
    exportThemeSuccess: 'Theme file saved',
    importThemeSuccess: 'Theme file loaded',
    exportThemeError: 'Cannot save theme file',
    importThemeError: 'Cannot read theme file',
    appInfo: 'About',
    settings: 'Settings',
    settingsGeneral: 'General',
    settingsWindow: 'Window / System',
    settingsAppearance: 'Background',
    settingsPlayback: 'Playback',
    saveSettings: 'Save settings',
    settingsSaved: 'Settings saved',
    settingsSaveError: 'Could not save settings',
    useSystemTray: 'Use system tray',
    useSystemTrayHint: 'When off, Close quits the app and the tray icon is hidden.',
    wallpaperEnabled: 'Use background image',
    wallpaperEnabledHint: 'Show built-in images from the background folder, or a custom image.',
    wallpaperBuiltIn: 'Built-in backgrounds',
    wallpaperChoose: 'Choose another image',
    wallpaperClear: 'Clear background image',
    wallpaperDim: 'Background dim',
    panelOpacity: 'Panel opacity',
    panelOpacityHint: 'Lower values reveal more of the wallpaper.',
    wallpaperNone: 'No image selected',
    wallpaperCustom: 'Custom',
    wallpaperFormats: 'Image files',
    rememberVolume: 'Remember volume',
    showSpectrum: 'Show spectrum',
    spectrumColorOrder: 'Spectrum color direction',
    spectrumBlueRed: 'Left blue → right red',
    spectrumRedBlue: 'Left red → right blue',
    flipSpectrumColors: 'Flip spectrum colors',
    spectrumStyle: 'Spectrum style',
    cycleSpectrumStyle: 'Cycle spectrum style',
    spectrumStyleBars: 'Bars',
    spectrumStyleMirror: 'Mirror bars',
    spectrumStyleWave: 'Waveform',
    spectrumStyleLine: 'Line',
    spectrumStyleRadial: 'Radial',
    spectrumStyleDots: 'Dots',
    spectrumStyleBlocks: 'Blocks',
    convertSave: 'Convert & save',
    convertSaveShort: 'Convert',
    languageShortEn: 'EN',
    languageShortKo: '한',
    convertFormat: 'Output format',
    convertTrack: 'Track',
    convertBusy: 'Converting…',
    convertSuccess: 'Converted file saved',
    convertError: 'Cannot convert this track',
    convertNoTrack: 'Select a track to convert first',
    convertNoSource: 'No convertible audio source is available',
    reopenLastFolderOnStart: 'Open last folder on start',
    tracksAlreadyLoaded: 'Skipped items already in the playlist',
    folderNothingNew: 'No new files to load',
    language: 'Language',
    theme: 'Theme',
    minimize: 'Minimize',
    close: 'Close',
    quitApp: 'Quit',
    previous: 'Previous track',
    play: 'Play',
    pause: 'Pause',
    stop: 'Stop',
    next: 'Next track',
    volume: 'Volume',
    mute: 'Volume Off',
    unmute: 'Volume On',
    speakerActive: 'Speaker on',
    speakerInactive: 'Speaker off',
    position: 'Position',
    remoteUrl: 'Remote audio URL',
    noTrack: 'Add music to begin',
    playlist: 'Playlist',
    removeTrack: 'Remove from playlist',
    folder: 'Folder',
    formats: 'MP3 FLAC WAV OGG AAC M4A WebM OPUS',
    themeName: 'Theme name',
    accent: 'Accent',
    local: 'Local',
    remote: 'Remote',
    noAlbumArt: 'No album art',
    playbackError: 'Cannot play this track',
    saveError: 'Cannot save the playlist',
    saveEmpty: 'There is no playlist to save',
    saveNoPersistable: 'Only local files with paths or remote URLs can be saved. Use Open folder / Open files.',
    saveSuccess: 'Playlist saved',
    statusReady: 'Ready',
    statusPlaying: 'Playing',
    statusPaused: 'Paused',
    statusStopped: 'Stopped',
    statusTrayOn: 'Tray on',
    statusTrayOff: 'Tray off',
    statusWallpaperOn: 'Wallpaper on',
    statusWallpaperOff: 'No wallpaper',
    statusBar: 'Status bar',
    errorDialog: 'Error',
    errorDialogHint: 'You can select or copy the details below.',
    copyError: 'Copy details',
    copied: 'Copied',
    copyFailed: 'Could not copy to the clipboard',
    openFiles: 'Open files',
    version: 'Version',
    build: 'Build',
    author: 'Author',
    copyright: 'Copyright',
  },
} as const

const copyTextToClipboard = async (value: string) => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    // Fall through to the legacy copy path.
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(textarea)
  return ok
}

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
    default:
      return 'application/octet-stream'
  }
}

const createBlobUrl = (data: Uint8Array, mimeType: string, objectUrls: string[]) => {
  const copy = data.slice()
  const url = URL.createObjectURL(new Blob([copy], { type: mimeType }))
  objectUrls.push(url)
  return url
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
  const tracksRef = useRef<Track[]>([])
  const spectrumColorOrderRef = useRef<SpectrumColorOrder>(initialSettings.spectrumColorOrder)
  const spectrumStyleRef = useRef<SpectrumStyle>(initialSettings.spectrumStyle)
  const [language, setLanguage] = useState<Language>(initialSettings.language)
  const [availableThemes, setAvailableThemes] = useState<ThemeDefinition[]>(() => [...builtInThemes, ...loadCustomThemes()])
  const [themeId, setThemeId] = useState(initialSettings.themeId)
  const [activeToolbarMenu, setActiveToolbarMenu] = useState<'language' | 'theme' | null>(null)
  const [themeName, setThemeName] = useState('Custom')
  const [themeAccent, setThemeAccent] = useState('#4cc9a6')
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
  const [lastMusicFolder, setLastMusicFolder] = useState(() => localStorage.getItem(lastMusicFolderKey) ?? defaultMusicFolder)
  const [statusMessage, setStatusMessage] = useState('')
  const [statusKind, setStatusKind] = useState<StatusKind>('info')
  const [errorDialogMessage, setErrorDialogMessage] = useState('')
  const [errorCopyState, setErrorCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [showAppInfo, setShowAppInfo] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showConvertDialog, setShowConvertDialog] = useState(false)
  const settingsDialogDrag = useDialogDrag(showSettings)
  const convertDialogDrag = useDialogDrag(showConvertDialog)
  const appInfoDialogDrag = useDialogDrag(showAppInfo)
  const errorDialogDrag = useDialogDrag(Boolean(errorDialogMessage))
  const [convertFormat, setConvertFormat] = useState<ConvertFormat>('mp3')
  const [isConverting, setIsConverting] = useState(false)
  const [convertMessage, setConvertMessage] = useState('')
  const [themeMessage, setThemeMessage] = useState('')
  const [useSystemTray, setUseSystemTray] = useState(initialSettings.useSystemTray)
  const [rememberVolume, setRememberVolume] = useState(initialSettings.rememberVolume)
  const [showSpectrum, setShowSpectrum] = useState(initialSettings.showSpectrum)
  const [spectrumColorOrder, setSpectrumColorOrder] = useState<SpectrumColorOrder>(initialSettings.spectrumColorOrder)
  const [spectrumStyle, setSpectrumStyle] = useState<SpectrumStyle>(initialSettings.spectrumStyle)
  const [reopenLastFolderOnStart, setReopenLastFolderOnStart] = useState(initialSettings.reopenLastFolderOnStart)
  const [wallpaperEnabled, setWallpaperEnabled] = useState(initialSettings.wallpaperEnabled)
  const [wallpaperPath, setWallpaperPath] = useState(initialSettings.wallpaperPath)
  const [wallpaperDim, setWallpaperDim] = useState(initialSettings.wallpaperDim)
  const [panelOpacity, setPanelOpacity] = useState(initialSettings.panelOpacity)
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
  }
  const currentTrack = tracks.find((track) => track.id === currentTrackId)
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
      setErrorCopyState('idle')
    }
  }

  const clearStatus = () => {
    setStatusMessage('')
    setStatusKind('info')
  }

  const closeErrorDialog = () => {
    setErrorDialogMessage('')
    setErrorCopyState('idle')
  }

  const copyErrorDetails = async () => {
    if (!errorDialogMessage) {
      return
    }

    const ok = await copyTextToClipboard(errorDialogMessage)
    setErrorCopyState(ok ? 'copied' : 'failed')
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
      setActiveToolbarMenu(null)
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
    if (didReopenFolderOnStart || !reopenLastFolderOnStart) {
      return
    }

    const folder = localStorage.getItem(lastMusicFolderKey) ?? defaultMusicFolder

    if (!folder) {
      return
    }

    didReopenFolderOnStart = true
    void loadMusicFolderRef.current(folder)
  }, [reopenLastFolderOnStart])

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
    if (isSameOriginMediaSrc(track.source)) {
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
      applyTrackSource(audio, currentTrack)
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
      analyserRef.current.fftSize = 128
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

    stopSpectrum()

    const render = () => {
      analyser.getByteFrequencyData(freqData)
      analyser.getByteTimeDomainData(timeData)
      drawSpectrumFrame(
        context,
        canvas,
        spectrumStyleRef.current,
        spectrumColorOrderRef.current,
        freqData,
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

  const loadAndPlayTrack = (track: Track) => {
    const audio = audioRef.current

    shouldPlayOnTrackLoadRef.current = false
    setCurrentTrackId(track.id)
    setIsPlaying(true)

    if (audio) {
      applyTrackSource(audio, track)
      void playCurrentAudio(track)
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
      void playCurrentAudio(track)
      return
    }

    loadAndPlayTrack(track)
  }

  const removeTrackFromPlaylist = (trackId: string) => {
    const index = tracks.findIndex((track) => track.id === trackId)

    if (index === -1) {
      return
    }

    const remaining = tracks.filter((track) => track.id !== trackId)
    setTracks(remaining)

    if (trackId !== currentTrackId) {
      return
    }

    if (!remaining.length) {
      const audio = audioRef.current
      if (audio) {
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
      }
      setCurrentTrackId('')
      setCurrentTime(0)
      setDuration(0)
      setIsPlaying(false)
      stopSpectrum(true)
      showTransportOverlay('spectrum')
      return
    }

    const nextTrack = remaining[Math.min(index, remaining.length - 1)]
    loadAndPlayTrack(nextTrack)
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
      ],
    })

    const paths = Array.isArray(selected) ? selected : typeof selected === 'string' ? [selected] : []

    if (!paths.length) {
      return
    }

    const existingPaths = new Set(
      tracksRef.current
        .map((track) => track.filePath)
        .filter((value): value is string => Boolean(value))
        .map(normalizePathKey),
    )
    const pathsToLoad = paths.filter((path) => !existingPaths.has(normalizePathKey(path)))

    if (!pathsToLoad.length) {
      pushStatus(labels.tracksAlreadyLoaded, 'info')
      return
    }

    const newTracks = await Promise.all(
      pathsToLoad.map((path) => createTrackFromPath(path, fileNameFromPath(path))),
    )
    const added = addTracks(newTracks.filter((track) => track.source))

    if (added < paths.length) {
      pushStatus(labels.tracksAlreadyLoaded, 'info')
    }
  }

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

    if (!pathsToLoad.length) {
      pushStatus(labels.folderNothingNew, 'info')
      return
    }

    const folderTracks = (
      await Promise.all(pathsToLoad.map((path) => createTrackFromPath(path, fileNameFromPath(path))))
    ).filter((track) => track.source)

    const added = addTracks(folderTracks)

    if (added < audioPaths.length) {
      pushStatus(labels.tracksAlreadyLoaded, 'info')
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

  const addRemoteTrack = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextUrl = remoteUrl.trim()

    if (!nextUrl) {
      return
    }

    if (tracksRef.current.some((track) => track.remoteUrl === nextUrl)) {
      pushStatus(labels.tracksAlreadyLoaded, 'info')
      return
    }

    let source = nextUrl

    // Prefer a blob URL so MediaElementSource can analyse without CORS silence.
    try {
      const response = await fetch(nextUrl)

      if (response.ok) {
        const contentType = response.headers.get('content-type') || getAudioMimeType(nextUrl)
        source = createBlobUrl(new Uint8Array(await response.arrayBuffer()), contentType, objectUrlsRef.current)
      }
    } catch (error) {
      console.warn('[remote] fetch-to-blob failed, using original URL', error)
    }

    addTracks([
      {
        id: `remote-${Date.now()}`,
        title: nextUrl.split('/').pop()?.replace(/\?.*$/, '') || 'Remote audio',
        source,
        origin: 'remote',
        remoteUrl: nextUrl,
      },
    ])
    setRemoteUrl('')
  }

  const savePlaylist = async () => {
    if (!tracks.length) {
      pushStatus(labels.saveEmpty, 'error')
      return
    }

    const persistableTracks = tracks.filter((track) => (
      track.origin === 'remote'
        ? Boolean(track.remoteUrl || (track.source && !track.source.startsWith('blob:')))
        : Boolean(track.filePath)
    ))

    if (!persistableTracks.length) {
      pushStatus(labels.saveNoPersistable, 'error')
      return
    }

    const playlist: PlaylistFile = {
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

  const loadPlaylistFromPath = async (playlistPath: string) => {
    let playlist: PlaylistFile

    try {
      playlist = JSON.parse(await readTextFile(playlistPath)) as PlaylistFile
    } catch {
      return
    }

    if (playlist.format !== 'my-music-station-playlist' || playlist.version !== 1) {
      return
    }

    const playlistTracks = playlist.tracks.filter((track) => track.source || track.filePath)
    const importedTracks = (await Promise.all(playlistTracks.map(async (track, index) => {
      const filePath = track.filePath || (track.origin === 'local' ? track.source : '')

      if (track.origin === 'local' && filePath) {
        return createTrackFromPath(filePath, track.title || fileNameFromPath(filePath) || `Track ${index + 1}`)
      }

      const remoteSource = track.remoteUrl || track.source
      let source = remoteSource

      if (track.origin === 'remote' && remoteSource) {
        try {
          const response = await fetch(remoteSource)

          if (response.ok) {
            const contentType = response.headers.get('content-type') || getAudioMimeType(remoteSource)
            source = createBlobUrl(new Uint8Array(await response.arrayBuffer()), contentType, objectUrlsRef.current)
          }
        } catch (error) {
          console.warn('[playlist] remote fetch-to-blob failed', remoteSource, error)
        }
      }

      return {
        id: `playlist-${Date.now()}-${index}`,
        title: track.title,
        source,
        origin: track.origin,
        remoteUrl: track.origin === 'remote' ? remoteSource : undefined,
      }
    }))).filter((track) => track.source)

    if (!importedTracks.length) {
      pushStatus(labels.saveNoPersistable, 'error')
      return
    }

    setTracks(importedTracks)
    setCurrentTrackId(importedTracks[0]?.id ?? '')
    setIsPlaying(false)
    clearStatus()
  }

  const openFiles = async () => {
    const selected = await open({
      multiple: true,
      directory: false,
      defaultPath: lastMusicFolder || undefined,
      title: labels.openFiles,
      filters: [
        { name: labels.openFiles, extensions: [...audioExtensions.map((extension) => extension.slice(1)), 'mplist'] },
        { name: labels.playlist, extensions: ['mplist'] },
        { name: labels.formats, extensions: audioExtensions.map((extension) => extension.slice(1)) },
      ],
    })

    const paths = Array.isArray(selected) ? selected : typeof selected === 'string' ? [selected] : []

    if (!paths.length) {
      return
    }

    const playlistPaths = paths.filter((path) => path.toLowerCase().endsWith('.mplist'))
    const audioPaths = paths.filter((path) => !path.toLowerCase().endsWith('.mplist'))

    for (const playlistPath of playlistPaths) {
      await loadPlaylistFromPath(playlistPath)
    }

    if (audioPaths.length) {
      const newTracks = await Promise.all(
        audioPaths.map((path) => createTrackFromPath(path, fileNameFromPath(path))),
      )
      addTracks(newTracks.filter((track) => track.source))
    }
  }

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

  const addTheme = () => {
    const id = `custom-${Date.now()}`
    const newTheme: ThemeDefinition = {
      id,
      name: themeName.trim() || 'Custom',
      builtIn: false,
      vars: {
        '--primary': themeAccent,
        '--primary-soft': `${themeAccent}99`,
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
    const name = selected?.name || themeName.trim() || 'Theme'
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
      setThemeName(imported.name)

      if (imported.vars?.['--primary']) {
        setThemeAccent(imported.vars['--primary'])
      }

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
    setActiveToolbarMenu(null)
  }

  const flipSpectrumColors = () => {
    const nextOrder: SpectrumColorOrder = spectrumColorOrderRef.current === 'blue-red' ? 'red-blue' : 'blue-red'
    spectrumColorOrderRef.current = nextOrder
    setSpectrumColorOrder(nextOrder)
    setActiveToolbarMenu(null)
  }

  const cycleSpectrumStyle = () => {
    const nextStyle = nextSpectrumStyle(spectrumStyleRef.current)
    spectrumStyleRef.current = nextStyle
    setSpectrumStyle(nextStyle)
    pushStatus(`${labels.spectrumStyle}: ${spectrumStyleLabels[nextStyle]}`, 'success')
    setActiveToolbarMenu(null)

    if (showSpectrum && isPlaying) {
      drawSpectrum()
    }
  }

  const selectSpectrumStyle = (nextStyle: SpectrumStyle) => {
    spectrumStyleRef.current = nextStyle
    setSpectrumStyle(nextStyle)

    if (showSpectrum && isPlaying) {
      drawSpectrum()
    }
  }

  const notifySelectTrackForConvert = async () => {
    pushStatus(labels.convertNoTrack, 'info')

    try {
      await message(labels.convertNoTrack, {
        title: labels.convertSave,
        kind: 'info',
      })
    } catch (dialogError) {
      console.warn('[convert] select-track dialog failed', dialogError)
    }
  }

  const openConvertDialog = () => {
    setActiveToolbarMenu(null)

    if (!currentTrack) {
      void notifySelectTrackForConvert()
      return
    }

    setConvertMessage('')
    setShowConvertDialog(true)
  }

  const runConvertSave = async () => {
    if (!currentTrack) {
      setConvertMessage(labels.convertNoTrack)
      void notifySelectTrackForConvert()
      return
    }

    const stem = sanitizeFileStem(currentTrack.title)
    const defaultDirectory =
      (currentTrack.filePath ? currentTrack.filePath.replace(/[\\/][^\\/]+$/, '') : '') || lastMusicFolder || undefined
    const defaultPath = defaultDirectory ? await join(defaultDirectory, `${stem}.${convertFormat}`) : `${stem}.${convertFormat}`

    const outputPath = await save({
      defaultPath,
      title: labels.convertSave,
      filters: [{ name: convertFormat.toUpperCase(), extensions: [convertFormat] }],
    })

    if (typeof outputPath !== 'string' || !outputPath) {
      return
    }

    setIsConverting(true)
    setConvertMessage(labels.convertBusy)
    pushStatus(labels.convertBusy, 'busy')

    let tempInputPath = ''

    try {
      let inputPath: string | undefined

      if (currentTrack.filePath) {
        inputPath = currentTrack.filePath
      } else if (currentTrack.source.startsWith('blob:') || currentTrack.remoteUrl || /^https?:\/\//i.test(currentTrack.source)) {
        const url = currentTrack.source.startsWith('blob:')
          ? currentTrack.source
          : currentTrack.remoteUrl || currentTrack.source
        const response = await fetch(url)

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
      })

      const converted = `${labels.convertSuccess}: ${outputPath}`
      pushStatus(converted, 'success')
      setIsConverting(false)
      setConvertMessage('')
      setShowConvertDialog(false)

      try {
        await message(`${labels.convertSuccess}\n${outputPath}`, {
          title: labels.convertSave,
          kind: 'info',
        })
      } catch (dialogError) {
        console.warn('[convert] completion dialog failed', dialogError)
      }

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
    setActiveToolbarMenu(null)
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
    const clamped = Math.min(1, Math.max(0, nextVolume))

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

  const minimizeWindow = async () => {
    await getCurrentWindow().minimize()
  }

  const closeWindow = async () => {
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

  return (
    <main
      className={`station-shell${wallpaperEnabled && wallpaperUrl ? ' has-wallpaper' : ''}`}
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

      <header className="title-toolbar">
        <div className="brand-block" onPointerDown={startWindowDrag}>
          <strong>{labels.appName}</strong>
        </div>

        <div className="toolbar-actions">
          <button className="tool-button tool-button-labeled" type="button" data-tooltip={labels.openFolder} aria-label={labels.openFolder} onClick={openMusicFolder}>
            <FolderOpen size={14} aria-hidden="true" />
            <span className="tool-button-label" style={{ whiteSpace: 'nowrap' }}>{labels.openFolderShort}</span>
          </button>
          <button className="tool-button tool-button-labeled" type="button" data-tooltip={labels.reopenFolder} aria-label={labels.reopenFolder} onClick={reopenMusicFolder}>
            <RotateCcw size={14} aria-hidden="true" />
            <span className="tool-button-label" style={{ whiteSpace: 'nowrap' }}>{labels.reopenFolderShort}</span>
          </button>
          <button className="tool-button tool-button-labeled" type="button" data-tooltip={labels.addFiles} aria-label={labels.addFiles} onClick={openAudioFiles}>
            <Plus size={14} aria-hidden="true" />
            <span className="tool-button-label" style={{ whiteSpace: 'nowrap' }}>{labels.addFilesShort}</span>
          </button>
          <button className="tool-button tool-button-labeled" type="button" data-tooltip={labels.savePlaylist} aria-label={labels.savePlaylist} onClick={savePlaylist}>
            <Save size={14} aria-hidden="true" />
            <span className="tool-button-label" style={{ whiteSpace: 'nowrap' }}>{labels.savePlaylistShort}</span>
          </button>
          <button className="tool-button tool-button-labeled" type="button" data-tooltip={labels.convertSave} aria-label={labels.convertSave} onClick={openConvertDialog}>
            <FileAudio size={14} aria-hidden="true" />
            <span className="tool-button-label" style={{ whiteSpace: 'nowrap' }}>{labels.convertSaveShort}</span>
          </button>
          <button className="tool-button icon-only" type="button" data-tooltip={labels.openFiles} aria-label={labels.openFiles} onClick={openFiles}>
            <FileInput size={14} />
          </button>
          <button className="tool-button tool-button-labeled language-toggle" type="button" data-tooltip={labels.language} aria-label={labels.language} onClick={toggleLanguage}>
            <Languages size={14} aria-hidden="true" />
            <span className="tool-button-label" style={{ whiteSpace: 'nowrap' }}>{language === 'ko' ? labels.languageShortEn : labels.languageShortKo}</span>
          </button>
          <button
            className={`tool-button icon-only${spectrumColorOrder === 'red-blue' ? ' active-toggle' : ''}`}
            type="button"
            data-tooltip={`${labels.flipSpectrumColors} (${spectrumColorOrder === 'blue-red' ? labels.spectrumBlueRed : labels.spectrumRedBlue})`}
            aria-label={labels.flipSpectrumColors}
            aria-pressed={spectrumColorOrder === 'red-blue'}
            disabled={!showSpectrum}
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
            onClick={cycleSpectrumStyle}
          >
            <ChartColumn size={14} />
          </button>
          <button className="tool-button icon-only" type="button" data-tooltip={labels.settings} aria-label={labels.settings} onClick={() => setShowSettings(true)}>
            <Settings size={14} />
          </button>
          <div className="toolbar-menu">
            <button
              className="tool-button icon-only"
              type="button"
              data-tooltip={labels.theme}
              aria-label={labels.theme}
              onClick={() => setActiveToolbarMenu((menu) => (menu === 'theme' ? null : 'theme'))}
            >
              <Palette size={14} />
            </button>
            {activeToolbarMenu === 'theme' && (
              <div className="toolbar-popover theme-popover">
                <div className="theme-list">
                  {availableThemes.map((theme) => (
                    <button
                      type="button"
                      key={theme.id}
                      className={theme.id === themeId ? 'active' : ''}
                      data-tooltip={theme.name}
                      aria-label={theme.name}
                      onClick={() => selectTheme(theme.id)}
                    >
                      {theme.name}
                    </button>
                  ))}
                </div>
                <div className="theme-editor compact">
                  <input aria-label={labels.themeName} value={themeName} onChange={(event) => setThemeName(event.target.value)} />
                  <input aria-label={labels.accent} type="color" value={themeAccent} onChange={(event) => setThemeAccent(event.target.value)} />
                  <button type="button" data-tooltip={labels.addTheme} aria-label={labels.addTheme} onClick={addTheme}>
                    <Plus size={14} />
                  </button>
                  <button type="button" data-tooltip={labels.deleteTheme} aria-label={labels.deleteTheme} onClick={deleteTheme}>
                    <Trash2 size={14} />
                  </button>
                  <button type="button" data-tooltip={labels.exportTheme} aria-label={labels.exportTheme} onClick={() => void exportThemeFile()}>
                    <Save size={14} />
                  </button>
                  <button type="button" data-tooltip={labels.importTheme} aria-label={labels.importTheme} onClick={() => void importThemeFile()}>
                    <Upload size={14} />
                  </button>
                </div>
                {themeMessage && <p className="theme-message">{themeMessage}</p>}
              </div>
            )}
          </div>
          <button className="tool-button icon-only" type="button" data-tooltip={labels.appInfo} aria-label={labels.appInfo} onClick={() => setShowAppInfo(true)}>
            <Info size={14} />
          </button>
        </div>

        <div className="toolbar-drag-space" onPointerDown={startWindowDrag} />

        <div className="window-actions">
          <button type="button" data-tooltip={labels.minimize} aria-label={labels.minimize} onClick={minimizeWindow}>
            <Minus size={14} />
          </button>
          <button
            type="button"
            className="close-button"
            data-tooltip={useSystemTray ? labels.close : labels.quitApp}
            aria-label={useSystemTray ? labels.close : labels.quitApp}
            onClick={closeWindow}
          >
            <X size={14} />
          </button>
        </div>
      </header>

      <section className="content-grid">
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
              <canvas ref={canvasRef} className="spectrum" width="620" height="192" aria-label="Spectrum" />
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
            <div className="transport-bar-spacer" aria-hidden="true" />
            <div className="transport">
              <button type="button" data-tooltip={labels.previous} aria-label={labels.previous} onClick={() => playRelativeTrack(-1)}>
                <SkipBack size={17} />
              </button>
              <button type="button" className="primary" data-tooltip={isPlaying ? labels.pause : labels.play} aria-label={isPlaying ? labels.pause : labels.play} onClick={isPlaying ? pause : play}>
                {isPlaying ? <Pause size={20} /> : <Play size={20} />}
              </button>
              <button type="button" className="stop-button" data-tooltip={labels.stop} aria-label={labels.stop} onClick={stop}>
                <Square size={15} />
              </button>
              <button type="button" data-tooltip={labels.next} aria-label={labels.next} onClick={() => playRelativeTrack(1)}>
                <SkipForward size={17} />
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
                {isMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
              </button>
              <span className="volume-bound">0%</span>
              <input
                aria-label={labels.volume}
                data-tooltip={`${labels.volume} ${volumePercent}%`}
                aria-valuetext={`${volumePercent}%`}
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(event) => changeVolume(Number(event.target.value))}
                onInput={(event) => changeVolume(Number(event.currentTarget.value))}
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

        <aside className="side-panel">
          <form className="remote-form" onSubmit={addRemoteTrack}>
            <Link size={14} />
            <input id="remote-url" type="url" aria-label={labels.remoteUrl} placeholder="https://example.com/song.mp3" value={remoteUrl} onChange={(event) => setRemoteUrl(event.target.value)} />
            <button type="submit" data-tooltip={labels.addRemote} aria-label={labels.addRemote}>
              <Download size={14} />
            </button>
          </form>

          <div className="folder-chip" title={lastMusicFolder || labels.folder}>
            {lastMusicFolder || labels.folder}
          </div>

          <div className="track-list" aria-label={labels.playlist}>
            {tracks.map((track) => (
              <div key={track.id} className={`track-row${track.id === currentTrackId ? ' active' : ''}`}>
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
      </section>

      {showConvertDialog && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => {
            if (!isConverting) {
              setShowConvertDialog(false)
            }
          }}
        >
          <section
            className="settings-dialog convert-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={labels.convertSave}
            style={convertDialogDrag.style}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="settings-header dialog-drag-handle" onPointerDown={convertDialogDrag.onHeaderPointerDown}>
              <FileAudio size={18} />
              <h2>{labels.convertSave}</h2>
            </header>

            <div className="settings-body">
              <label className="settings-row">
                <span>{labels.convertTrack}</span>
                <strong className="convert-track-name">{currentTrack?.title ?? labels.noTrack}</strong>
              </label>
              <label className="settings-row">
                <span>{labels.convertFormat}</span>
                <select
                  value={convertFormat}
                  aria-label={labels.convertFormat}
                  disabled={isConverting || !currentTrack}
                  onChange={(event) => setConvertFormat(event.target.value as ConvertFormat)}
                >
                  {convertFormats.map((format) => (
                    <option key={format} value={format}>
                      {format.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
              {convertMessage && <p className={`convert-message${isConverting ? ' busy' : ''}`}>{convertMessage}</p>}
            </div>

            <div className="convert-actions">
              <button type="button" aria-label={labels.close} disabled={isConverting} onClick={() => setShowConvertDialog(false)}>
                {labels.close}
              </button>
              <button
                type="button"
                className="primary-action"
                aria-label={isConverting ? labels.convertBusy : labels.convertSave}
                disabled={isConverting || !currentTrack}
                onClick={() => void runConvertSave()}
              >
                {isConverting ? labels.convertBusy : labels.convertSave}
              </button>
            </div>
          </section>
        </div>
      )}

      {showSettings && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowSettings(false)}>
          <section
            className="settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={labels.settings}
            style={settingsDialogDrag.style}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="settings-header dialog-drag-handle" onPointerDown={settingsDialogDrag.onHeaderPointerDown}>
              <Settings size={18} />
              <h2>{labels.settings}</h2>
            </header>

            <div className="settings-body">
              <section className="settings-section">
                <h3>{labels.settingsGeneral}</h3>
                <label className="settings-row">
                  <span>{labels.language}</span>
                  <select
                    value={language}
                    onChange={(event) => setLanguage(event.target.value as Language)}
                    aria-label={labels.language}
                  >
                    <option value="ko">한국어</option>
                    <option value="en">English</option>
                  </select>
                </label>
                <label className="settings-row">
                  <span>{labels.theme}</span>
                  <select value={themeId} onChange={(event) => selectTheme(event.target.value)} aria-label={labels.theme}>
                    {availableThemes.map((theme) => (
                      <option key={theme.id} value={theme.id}>
                        {theme.name}
                      </option>
                    ))}
                  </select>
                </label>
              </section>

              <section className="settings-section">
                <h3>{labels.settingsWindow}</h3>
                <label className="settings-toggle">
                  <input
                    type="checkbox"
                    checked={useSystemTray}
                    onChange={(event) => updateUseSystemTray(event.target.checked)}
                  />
                  <span>
                    <strong>{labels.useSystemTray}</strong>
                    <small>{labels.useSystemTrayHint}</small>
                  </span>
                </label>
              </section>

              <section className="settings-section">
                <h3>{labels.settingsAppearance}</h3>
                <label className="settings-toggle">
                  <input
                    type="checkbox"
                    checked={wallpaperEnabled}
                    onChange={(event) => {
                      const enabled = event.target.checked
                      if (enabled && !wallpaperPath && defaultBuiltInWallpaperId) {
                        setWallpaperPath(defaultBuiltInWallpaperId)
                      }
                      setWallpaperEnabled(enabled)
                      pushStatus(enabled ? labels.statusWallpaperOn : labels.statusWallpaperOff, 'info')
                    }}
                    disabled={!wallpaperPath && !defaultBuiltInWallpaperId}
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
                          className={`wallpaper-thumb${wallpaperPath === item.id ? ' active' : ''}`}
                          role="option"
                          aria-selected={wallpaperPath === item.id}
                          aria-label={item.name}
                          onClick={() => selectBuiltInWallpaper(item.id)}
                        >
                          <img src={item.url} alt="" />
                          <span>{item.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="settings-row wallpaper-path-row">
                  <span>{labels.settingsAppearance}</span>
                  <small className="wallpaper-path" title={wallpaperPath || labels.wallpaperNone}>
                    {wallpaperPath
                      ? isBuiltInWallpaperId(wallpaperPath)
                        ? `${labels.wallpaperBuiltIn}: ${wallpaperDisplayName(wallpaperPath)}`
                        : `${labels.wallpaperCustom}: ${wallpaperDisplayName(wallpaperPath)}`
                      : labels.wallpaperNone}
                  </small>
                </div>
                <div className="convert-actions">
                  <button type="button" aria-label={labels.wallpaperChoose} onClick={() => void chooseWallpaper()}>
                    <ImagePlus size={14} />
                    {labels.wallpaperChoose}
                  </button>
                  <button
                    type="button"
                    aria-label={labels.wallpaperClear}
                    disabled={!wallpaperPath && !defaultBuiltInWallpaperId}
                    onClick={clearWallpaper}
                  >
                    {labels.wallpaperClear}
                  </button>
                </div>
                <label className="settings-row">
                  <span>{labels.wallpaperDim}</span>
                  <input
                    type="range"
                    min="0.15"
                    max="0.9"
                    step="0.01"
                    value={wallpaperDim}
                    aria-label={labels.wallpaperDim}
                    disabled={!wallpaperEnabled || !wallpaperPath}
                    onChange={(event) => setWallpaperDim(Number(event.target.value))}
                  />
                </label>
                <label className="settings-row">
                  <span>
                    {labels.panelOpacity}
                    <small className="settings-inline-hint"> ({Math.round(panelOpacity * 100)}%)</small>
                  </span>
                  <input
                    type="range"
                    min="0.2"
                    max="1"
                    step="0.01"
                    value={panelOpacity}
                    aria-label={labels.panelOpacity}
                    disabled={!wallpaperEnabled || !wallpaperPath}
                    onChange={(event) => setPanelOpacity(Number(event.target.value))}
                  />
                </label>
                <p className="settings-hint">{labels.panelOpacityHint}</p>
              </section>

              <section className="settings-section">
                <h3>{labels.settingsPlayback}</h3>
                <label className="settings-toggle">
                  <input
                    type="checkbox"
                    checked={rememberVolume}
                    onChange={(event) => setRememberVolume(event.target.checked)}
                  />
                  <span>
                    <strong>{labels.rememberVolume}</strong>
                  </span>
                </label>
                <label className="settings-toggle">
                  <input
                    type="checkbox"
                    checked={showSpectrum}
                    onChange={(event) => {
                      const enabled = event.target.checked
                      setShowSpectrum(enabled)

                      if (!enabled) {
                        stopSpectrum()
                      } else if (isPlaying) {
                        drawSpectrum()
                      }
                    }}
                  />
                  <span>
                    <strong>{labels.showSpectrum}</strong>
                  </span>
                </label>
                <label className="settings-row">
                  <span>{labels.spectrumStyle}</span>
                  <select
                    value={spectrumStyle}
                    aria-label={labels.spectrumStyle}
                    disabled={!showSpectrum}
                    onChange={(event) => selectSpectrumStyle(event.target.value as SpectrumStyle)}
                  >
                    {spectrumStyles.map((style) => (
                      <option key={style} value={style}>
                        {spectrumStyleLabels[style]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="settings-row">
                  <span>{labels.spectrumColorOrder}</span>
                  <select
                    value={spectrumColorOrder}
                    aria-label={labels.spectrumColorOrder}
                    disabled={!showSpectrum}
                    onChange={(event) => {
                      const nextOrder = event.target.value as SpectrumColorOrder
                      spectrumColorOrderRef.current = nextOrder
                      setSpectrumColorOrder(nextOrder)
                    }}
                  >
                    <option value="blue-red">{labels.spectrumBlueRed}</option>
                    <option value="red-blue">{labels.spectrumRedBlue}</option>
                  </select>
                </label>
                <label className="settings-toggle">
                  <input
                    type="checkbox"
                    checked={reopenLastFolderOnStart}
                    onChange={(event) => setReopenLastFolderOnStart(event.target.checked)}
                  />
                  <span>
                    <strong>{labels.reopenLastFolderOnStart}</strong>
                  </span>
                </label>
                <label className="settings-row volume-settings-row">
                  <span>{labels.volume}</span>
                  <div className={`volume-slider-wrap${isMuted ? ' is-inactive' : ' is-active'}`}>
                    <button
                      type="button"
                      className={`volume-mute-button${isMuted ? ' is-inactive' : ' is-active'}`}
                      aria-label={isMuted ? labels.unmute : labels.mute}
                      aria-pressed={!isMuted}
                      onClick={toggleMute}
                    >
                      {isMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
                    </button>
                    <span className="volume-bound">0%</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={volume}
                      aria-label={labels.volume}
                      aria-valuetext={`${volumePercent}%`}
                      onChange={(event) => changeVolume(Number(event.target.value))}
                    />
                    <span className="volume-bound">100%</span>
                    <span className="volume-value" aria-live="polite">
                      {volumePercent}%
                    </span>
                  </div>
                </label>
              </section>
            </div>

            <div className="settings-actions">
              <button type="button" aria-label={labels.close} onClick={() => setShowSettings(false)}>
                {labels.close}
              </button>
              <button
                type="button"
                className="primary-action"
                aria-label={labels.saveSettings}
                onClick={() => void saveSettingsFromDialog()}
              >
                <Save size={14} />
                {labels.saveSettings}
              </button>
            </div>
          </section>
        </div>
      )}

      {showAppInfo && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowAppInfo(false)}>
          <section
            className="app-info-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={labels.appInfo}
            style={appInfoDialogDrag.style}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="app-info-header dialog-drag-handle" onPointerDown={appInfoDialogDrag.onHeaderPointerDown}>
              <img src={appIconUrl} alt="" />
              <div>
                <h2>{labels.appName}</h2>
                <p>{appVersion}</p>
              </div>
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
                <dd>Copyright (c) 2026 SHKWON. All rights reserved.</dd>
              </div>
            </dl>
            <button type="button" aria-label={labels.close} onClick={() => setShowAppInfo(false)}>{labels.close}</button>
          </section>
        </div>
      )}

      {errorDialogMessage && (
        <div className="modal-backdrop error-backdrop" role="presentation" onMouseDown={closeErrorDialog}>
          <section
            className="error-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-label={labels.errorDialog}
            style={errorDialogDrag.style}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="error-dialog-header dialog-drag-handle" onPointerDown={errorDialogDrag.onHeaderPointerDown}>
              <CircleAlert size={18} />
              <div>
                <h2>{labels.errorDialog}</h2>
                <p>{labels.errorDialogHint}</p>
              </div>
            </header>
            <textarea
              className="error-dialog-details"
              readOnly
              value={errorDialogMessage}
              aria-label={labels.errorDialog}
              onFocus={(event) => event.currentTarget.select()}
            />
            <div className="error-dialog-actions">
              <button
                type="button"
                className="error-copy-button"
                aria-label={errorCopyState === 'copied' ? labels.copied : errorCopyState === 'failed' ? labels.copyFailed : labels.copyError}
                onClick={() => void copyErrorDetails()}
              >
                <Copy size={14} />
                {errorCopyState === 'copied' ? labels.copied : errorCopyState === 'failed' ? labels.copyFailed : labels.copyError}
              </button>
              <button type="button" aria-label={labels.close} onClick={closeErrorDialog}>
                {labels.close}
              </button>
            </div>
          </section>
        </div>
      )}

      <footer className="status-bar" role="status" aria-live="polite" aria-label={labels.statusBar}>
        <span
          className={`status-state status-${statusMessage ? statusKind : 'info'}${statusMessage && statusKind === 'error' ? ' status-clickable' : ''}`}
          title={statusText}
          role={statusMessage && statusKind === 'error' ? 'button' : undefined}
          tabIndex={statusMessage && statusKind === 'error' ? 0 : undefined}
          onClick={() => {
            if (statusMessage && statusKind === 'error') {
              setErrorDialogMessage(statusMessage)
              setErrorCopyState('idle')
            }
          }}
          onKeyDown={(event) => {
            if ((event.key === 'Enter' || event.key === ' ') && statusMessage && statusKind === 'error') {
              event.preventDefault()
              setErrorDialogMessage(statusMessage)
              setErrorCopyState('idle')
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
    </main>
  )
}

export default App
