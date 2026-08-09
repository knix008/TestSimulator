import type { ChangeEvent, FormEvent, MouseEvent } from 'react'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { join } from '@tauri-apps/api/path'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open, save } from '@tauri-apps/plugin-dialog'
import { readDir, readFile, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import {
  Download,
  FileInput,
  FolderOpen,
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
  Volume2,
  X,
} from 'lucide-react'
import { parseBuffer, selectCover, type IAudioMetadata } from 'music-metadata'
import { type AppSettings, loadAppSettings, saveAppSettings, type Language } from './appSettings'
import { type ThemeDefinition, themes as builtInThemes } from './themes'
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
    openFolder: '폴더 열기',
    reopenFolder: '다시 열기',
    savePlaylist: '플레이리스트 저장',
    savePlaylistShort: '저장',
    openPlaylist: '플레이리스트 열기',
    addRemote: 'URL 추가',
    addTheme: '테마 추가',
    deleteTheme: '테마 삭제',
    appInfo: '프로그램 정보',
    settings: '설정',
    settingsGeneral: '일반',
    settingsWindow: '창 / 시스템',
    settingsPlayback: '재생',
    useSystemTray: '시스템 트레이 사용',
    useSystemTrayHint: '끄면 닫기 시 앱이 종료되고 트레이 아이콘이 숨겨집니다.',
    rememberVolume: '종료 후 볼륨 기억',
    showSpectrum: '스펙트럼 표시',
    reopenLastFolderOnStart: '시작 시 마지막 폴더 열기',
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
    position: '재생 위치',
    remoteUrl: '원격 오디오 URL',
    noTrack: '음악을 추가하세요',
    playlist: '재생 목록',
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
    openFolder: 'Open folder',
    reopenFolder: 'Reopen',
    savePlaylist: 'Save playlist',
    savePlaylistShort: 'Save',
    openPlaylist: 'Open playlist',
    addRemote: 'Add URL',
    addTheme: 'Add theme',
    deleteTheme: 'Delete theme',
    appInfo: 'About',
    settings: 'Settings',
    settingsGeneral: 'General',
    settingsWindow: 'Window / System',
    settingsPlayback: 'Playback',
    useSystemTray: 'Use system tray',
    useSystemTrayHint: 'When off, Close quits the app and the tray icon is hidden.',
    rememberVolume: 'Remember volume',
    showSpectrum: 'Show spectrum',
    reopenLastFolderOnStart: 'Open last folder on start',
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
    position: 'Position',
    remoteUrl: 'Remote audio URL',
    noTrack: 'Add music to begin',
    playlist: 'Playlist',
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
    openFiles: 'Open files',
    version: 'Version',
    build: 'Build',
    author: 'Author',
    copyright: 'Copyright',
  },
} as const

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

function App() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const animationRef = useRef<number | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const shouldPlayOnTrackLoadRef = useRef(false)
  const objectUrlsRef = useRef<string[]>([])
  const didReopenOnStartRef = useRef(false)
  const loadMusicFolderRef = useRef<(folderPath: string) => Promise<void>>(async () => {})
  const initialSettingsRef = useRef(loadAppSettings())
  const [language, setLanguage] = useState<Language>(() => initialSettingsRef.current.language)
  const [availableThemes, setAvailableThemes] = useState<ThemeDefinition[]>(() => [...builtInThemes, ...loadCustomThemes()])
  const [themeId, setThemeId] = useState(() => initialSettingsRef.current.themeId)
  const [activeToolbarMenu, setActiveToolbarMenu] = useState<'language' | 'theme' | null>(null)
  const [themeName, setThemeName] = useState('Custom')
  const [themeAccent, setThemeAccent] = useState('#4cc9a6')
  const [tracks, setTracks] = useState<Track[]>([])
  const [currentTrackId, setCurrentTrackId] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [volume, setVolume] = useState(() =>
    initialSettingsRef.current.rememberVolume ? initialSettingsRef.current.volume : 0.82,
  )
  const [remoteUrl, setRemoteUrl] = useState('')
  const [lastMusicFolder, setLastMusicFolder] = useState(() => localStorage.getItem(lastMusicFolderKey) ?? defaultMusicFolder)
  const [playbackError, setPlaybackError] = useState('')
  const [showAppInfo, setShowAppInfo] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [useSystemTray, setUseSystemTray] = useState(() => initialSettingsRef.current.useSystemTray)
  const [rememberVolume, setRememberVolume] = useState(() => initialSettingsRef.current.rememberVolume)
  const [showSpectrum, setShowSpectrum] = useState(() => initialSettingsRef.current.showSpectrum)
  const [reopenLastFolderOnStart, setReopenLastFolderOnStart] = useState(
    () => initialSettingsRef.current.reopenLastFolderOnStart,
  )

  const labels = text[language]
  const currentTrack = tracks.find((track) => track.id === currentTrackId)
  const selectedTheme = availableThemes.find((theme) => theme.id === themeId) ?? availableThemes[0]
  const playLoadedTrack = useEffectEvent(async (track?: Track) => {
    await playCurrentAudio(track)
  })

  const persistSettings = useEffectEvent((patch: Partial<AppSettings> = {}) => {
    const next: AppSettings = {
      language,
      themeId,
      useSystemTray,
      rememberVolume,
      volume,
      showSpectrum,
      reopenLastFolderOnStart,
      ...patch,
    }
    saveAppSettings(next)
  })

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
    persistSettings()
  }, [language, themeId, useSystemTray, rememberVolume, volume, showSpectrum, reopenLastFolderOnStart])

  useEffect(() => {
    if (didReopenOnStartRef.current || !reopenLastFolderOnStart) {
      return
    }

    const folder = localStorage.getItem(lastMusicFolderKey) ?? defaultMusicFolder

    if (!folder) {
      return
    }

    didReopenOnStartRef.current = true
    void loadMusicFolderRef.current(folder)
  }, [reopenLastFolderOnStart])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = selectedTheme.builtIn ? selectedTheme.id : 'custom'

    if (selectedTheme.vars) {
      Object.entries(selectedTheme.vars).forEach(([key, value]) => root.style.setProperty(key, value))
    }
  }, [selectedTheme])

  useEffect(() => {
    const audio = audioRef.current

    if (audio) {
      audio.volume = volume
    }

    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume
    }
  }, [volume])

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
    setPlaybackError('')
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
      gainNodeRef.current.gain.value = volume
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

    const data = new Uint8Array(analyser.frequencyBinCount)
    const binCount = data.length

    stopSpectrum()

    const render = () => {
      analyser.getByteFrequencyData(data)
      context.clearRect(0, 0, canvas.width, canvas.height)

      const barWidth = canvas.width / binCount
      data.forEach((value, index) => {
        const level = value / 255
        const height = Math.max(2, level * canvas.height)
        // Left (low frequency) = blue → right (high frequency) = red.
        const t = index / Math.max(binCount - 1, 1)
        const hue = 240 - t * 240
        const saturation = 70 + level * 30
        const lightness = 38 + level * 22
        context.fillStyle = `hsl(${hue} ${saturation}% ${lightness}%)`
        context.fillRect(index * barWidth, canvas.height - height, Math.max(barWidth - 2, 2), height)
      })

      animationRef.current = requestAnimationFrame(render)
    }

    render()
  }

  const stopSpectrum = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
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
      setPlaybackError('')
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
      setPlaybackError(`${labels.playbackError}: ${error instanceof Error ? `${error.name} ${error.message}` : String(error)}`)
      stopSpectrum()
    }
  }

  const play = async () => {
    await playCurrentAudio()
  }

  const handleAudioPlay = () => {
    setIsPlaying(true)

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
    stopSpectrum()
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

  const addTracks = (nextTracks: Track[]) => {
    if (!nextTracks.length) {
      return
    }

    setTracks((previousTracks) => [...nextTracks, ...previousTracks])
    setCurrentTrackId(nextTracks[0].id)
    setIsPlaying(false)
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

    const newTracks = await Promise.all(
      paths.map((path) => createTrackFromPath(path, fileNameFromPath(path))),
    )
    addTracks(newTracks.filter((track) => track.source))
  }

  const loadMusicFolder = async (folderPath: string) => {
    const collectTracks = async (currentFolder: string): Promise<Track[]> => {
      const entries = await readDir(currentFolder)
      const nestedTracks = await Promise.all(entries.map(async (entry) => {
        const filePath = await join(currentFolder, entry.name)

        if (entry.isDirectory) {
          try {
            return await collectTracks(filePath)
          } catch {
            return []
          }
        }

        if (!entry.isFile || !audioExtensions.some((extension) => entry.name.toLowerCase().endsWith(extension))) {
          return []
        }

        return [await createTrackFromPath(filePath, entry.name)]
      }))

      return nestedTracks.flat()
    }

    const folderTracks = (await collectTracks(folderPath)).filter((track) => track.source)

    addTracks(folderTracks)
    setLastMusicFolder(folderPath)
    localStorage.setItem(lastMusicFolderKey, folderPath)
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
      setPlaybackError(labels.saveEmpty)
      return
    }

    const persistableTracks = tracks.filter((track) => (
      track.origin === 'remote'
        ? Boolean(track.remoteUrl || (track.source && !track.source.startsWith('blob:')))
        : Boolean(track.filePath)
    ))

    if (!persistableTracks.length) {
      setPlaybackError(labels.saveNoPersistable)
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
      setPlaybackError(
        persistableTracks.length < tracks.length
          ? `${labels.saveSuccess} (${persistableTracks.length}/${tracks.length})`
          : labels.saveSuccess,
      )
    } catch (error) {
      console.error('[save] failed', error)
      setPlaybackError(`${labels.saveError}: ${error instanceof Error ? `${error.name} ${error.message}` : String(error)}`)
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
      setPlaybackError(labels.saveNoPersistable)
      return
    }

    setTracks(importedTracks)
    setCurrentTrackId(importedTracks[0]?.id ?? '')
    setIsPlaying(false)
    setPlaybackError('')
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

    localStorage.setItem(customThemesKey, JSON.stringify(customThemes))
    setAvailableThemes([...builtInThemes, ...customThemes])
    setThemeId(id)
  }

  const deleteTheme = () => {
    const selected = availableThemes.find((theme) => theme.id === themeId)

    if (!selected || selected.builtIn) {
      return
    }

    const customThemes = availableThemes.filter((theme) => !theme.builtIn && theme.id !== themeId)
    localStorage.setItem(customThemesKey, JSON.stringify(customThemes))
    setAvailableThemes([...builtInThemes, ...customThemes])
    setThemeId('dark')
  }

  const toggleLanguage = () => {
    setLanguage((currentLanguage) => (currentLanguage === 'ko' ? 'en' : 'ko'))
    setActiveToolbarMenu(null)
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

  const changeVolume = (nextVolume: number) => {
    setVolume(nextVolume)

    if (audioRef.current) {
      audioRef.current.volume = nextVolume
    }

    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = nextVolume
    }
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
  }

  const startWindowDrag = async (event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return
    }

    if ((event.target as HTMLElement).closest('button, input, select, label')) {
      return
    }

    await getCurrentWindow().startDragging()
  }

  return (
    <main className="station-shell">
      <audio
        ref={audioRef}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onEnded={() => playRelativeTrack(1)}
        onError={(event) => {
          const mediaError = event.currentTarget.error
          console.error('[audio] element error', mediaError?.code, mediaError?.message, event.currentTarget.src.slice(0, 60))
          setPlaybackError(`${labels.playbackError} (media error ${mediaError?.code ?? '?'})`)
        }}
        onPause={() => setIsPlaying(false)}
        onPlay={handleAudioPlay}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
      />

      <header className="title-toolbar" onMouseDown={startWindowDrag} data-tauri-drag-region>
        <div className="brand-block" onMouseDown={startWindowDrag} data-tauri-drag-region>
          <strong data-tauri-drag-region>{labels.appName}</strong>
        </div>

        <div className="toolbar-actions">
          <button className="tool-button" type="button" data-tooltip={labels.openFolder} aria-label={labels.openFolder} onClick={openMusicFolder}>
            <FolderOpen size={15} />
            <span>{labels.openFolder}</span>
          </button>
          <button className="tool-button" type="button" data-tooltip={labels.reopenFolder} aria-label={labels.reopenFolder} onClick={reopenMusicFolder}>
            <RotateCcw size={15} />
            <span>{labels.reopenFolder}</span>
          </button>
          <button className="tool-button" type="button" data-tooltip={labels.addFiles} aria-label={labels.addFiles} onClick={openAudioFiles}>
            <Plus size={15} />
            <span>{labels.addFiles}</span>
          </button>
          <button className="tool-button" type="button" data-tooltip={labels.savePlaylist} aria-label={labels.savePlaylist} onClick={savePlaylist}>
            <Save size={15} />
            <span>{labels.savePlaylistShort}</span>
          </button>
          <button className="tool-button icon-only" type="button" data-tooltip={labels.openFiles} aria-label={labels.openFiles} onClick={openFiles}>
            <FileInput size={15} />
          </button>
          <button className="tool-button language-toggle" type="button" data-tooltip={labels.language} aria-label={labels.language} onClick={toggleLanguage}>
            <Languages size={15} />
            <span>{language === 'ko' ? 'English' : '한글'}</span>
          </button>
          <button className="tool-button icon-only" type="button" data-tooltip={labels.settings} aria-label={labels.settings} onClick={() => setShowSettings(true)}>
            <Settings size={15} />
          </button>
          <button className="tool-button icon-only" type="button" data-tooltip={labels.appInfo} aria-label={labels.appInfo} onClick={() => setShowAppInfo(true)}>
            <Info size={15} />
          </button>
          <div className="toolbar-menu">
            <button
              className="tool-button icon-only"
              type="button"
              data-tooltip={labels.theme}
              aria-label={labels.theme}
              onClick={() => setActiveToolbarMenu((menu) => (menu === 'theme' ? null : 'theme'))}
            >
              <Palette size={15} />
            </button>
            {activeToolbarMenu === 'theme' && (
              <div className="toolbar-popover theme-popover">
                <div className="theme-list">
                  {availableThemes.map((theme) => (
                    <button type="button" key={theme.id} className={theme.id === themeId ? 'active' : ''} onClick={() => selectTheme(theme.id)}>
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
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="toolbar-drag-space" onMouseDown={startWindowDrag} data-tauri-drag-region />

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
              <span>{currentTrack?.origin === 'local' ? labels.local : labels.remote}</span>
              <h1>{currentTrack?.title ?? labels.noTrack}</h1>
              {currentTrackDetails.length > 0 && <p>{currentTrackDetails.join(' / ')}</p>}
              {currentTechnicalDetails.length > 0 && <div className="track-detail-line">{currentTechnicalDetails.join(' · ')}</div>}
            </div>
            <small>{labels.formats}</small>
          </div>

          {showSpectrum ? (
            <canvas ref={canvasRef} className="spectrum" width="620" height="140" aria-label="Spectrum" />
          ) : (
            <div className="spectrum spectrum-disabled" aria-hidden="true" />
          )}
          {playbackError && <div className="playback-error">{playbackError}</div>}

          <div className="transport">
            <button type="button" data-tooltip={labels.previous} aria-label={labels.previous} onClick={() => playRelativeTrack(-1)}>
              <SkipBack size={17} />
            </button>
            <button type="button" className="primary" data-tooltip={isPlaying ? labels.pause : labels.play} aria-label={isPlaying ? labels.pause : labels.play} onClick={isPlaying ? pause : play}>
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>
            <button type="button" data-tooltip={labels.stop} aria-label={labels.stop} onClick={stop}>
              <Square size={15} />
            </button>
            <button type="button" data-tooltip={labels.next} aria-label={labels.next} onClick={() => playRelativeTrack(1)}>
              <SkipForward size={17} />
            </button>
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

          <div className="volume-control">
            <Volume2 size={15} />
            <input
              aria-label={labels.volume}
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(event) => changeVolume(Number(event.target.value))}
              onInput={(event) => changeVolume(Number(event.currentTarget.value))}
            />
          </div>

          <div className="folder-chip" title={lastMusicFolder || labels.folder}>
            {lastMusicFolder || labels.folder}
          </div>

          <div className="track-list" aria-label={labels.playlist}>
            {tracks.map((track) => (
              <button
                type="button"
                key={track.id}
                className={track.id === currentTrackId ? 'active' : ''}
                onClick={() => selectTrack(track.id)}
              >
                <span>{track.title}</span>
                <small>{[track.artist, track.album].filter(Boolean).join(' / ') || (track.origin === 'local' ? labels.local : labels.remote)}</small>
              </button>
            ))}
          </div>
        </aside>
      </section>

      {showSettings && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowSettings(false)}>
          <section
            className="settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={labels.settings}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="settings-header">
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
                <label className="settings-row">
                  <span>{labels.volume}</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volume}
                    aria-label={labels.volume}
                    onChange={(event) => changeVolume(Number(event.target.value))}
                  />
                </label>
              </section>
            </div>

            <button type="button" onClick={() => setShowSettings(false)}>
              {labels.close}
            </button>
          </section>
        </div>
      )}

      {showAppInfo && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowAppInfo(false)}>
          <section className="app-info-dialog" role="dialog" aria-modal="true" aria-label={labels.appInfo} onMouseDown={(event) => event.stopPropagation()}>
            <div className="app-info-header">
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
            <button type="button" onClick={() => setShowAppInfo(false)}>{labels.close}</button>
          </section>
        </div>
      )}
    </main>
  )
}

export default App
