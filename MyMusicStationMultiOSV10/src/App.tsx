import type { ChangeEvent, FormEvent, MouseEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { join } from '@tauri-apps/api/path'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open } from '@tauri-apps/plugin-dialog'
import { readDir } from '@tauri-apps/plugin-fs'
import {
  Download,
  FileInput,
  FolderOpen,
  Languages,
  Link,
  Minus,
  Palette,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  SkipBack,
  SkipForward,
  Square,
  Trash2,
  Volume2,
  X,
} from 'lucide-react'
import { type ThemeDefinition, themes as builtInThemes } from './themes'
import './App.css'

type Language = 'ko' | 'en'
type Track = {
  id: string
  title: string
  source: string
  origin: 'local' | 'remote'
}

type PlaylistFile = {
  format: 'my-music-station-playlist'
  version: 1
  tracks: Array<Pick<Track, 'title' | 'source' | 'origin'>>
}

const audioExtensions = ['.mp3', '.flac', '.wav', '.ogg', '.aac', '.m4a', '.webm']
const customThemesKey = 'myMusicStation.customThemes'
const lastMusicFolderKey = 'myMusicStation.lastMusicFolder'

const text = {
  ko: {
    appName: 'My Music Station',
    title: '멀티 OS 플레이어',
    addFiles: '파일 추가',
    openFolder: '폴더 열기',
    reopenFolder: '다시 열기',
    savePlaylist: '저장',
    openPlaylist: '열기',
    addRemote: 'URL 추가',
    addTheme: '테마 추가',
    deleteTheme: '테마 삭제',
    language: '언어',
    theme: '테마',
    minimize: '최소화',
    close: '닫기',
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
    formats: 'MP3 FLAC WAV OGG AAC M4A WebM',
    themeName: '테마 이름',
    accent: '강조색',
    local: '로컬',
    remote: '원격',
  },
  en: {
    appName: 'My Music Station',
    title: 'Multi OS Player',
    addFiles: 'Add files',
    openFolder: 'Open folder',
    reopenFolder: 'Reopen',
    savePlaylist: 'Save',
    openPlaylist: 'Open',
    addRemote: 'Add URL',
    addTheme: 'Add theme',
    deleteTheme: 'Delete theme',
    language: 'Language',
    theme: 'Theme',
    minimize: 'Minimize',
    close: 'Close',
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
    formats: 'MP3 FLAC WAV OGG AAC M4A WebM',
    themeName: 'Theme name',
    accent: 'Accent',
    local: 'Local',
    remote: 'Remote',
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

const loadCustomThemes = (): ThemeDefinition[] => {
  try {
    return JSON.parse(localStorage.getItem(customThemesKey) ?? '[]') as ThemeDefinition[]
  } catch {
    return []
  }
}

function App() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationRef = useRef<number | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const objectUrlsRef = useRef<string[]>([])
  const [language, setLanguage] = useState<Language>('ko')
  const [availableThemes, setAvailableThemes] = useState<ThemeDefinition[]>(() => [...builtInThemes, ...loadCustomThemes()])
  const [themeId, setThemeId] = useState('dark')
  const [activeToolbarMenu, setActiveToolbarMenu] = useState<'language' | 'theme' | null>(null)
  const [themeName, setThemeName] = useState('Custom')
  const [themeAccent, setThemeAccent] = useState('#4cc9a6')
  const [tracks, setTracks] = useState<Track[]>([])
  const [currentTrackId, setCurrentTrackId] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [volume, setVolume] = useState(0.82)
  const [remoteUrl, setRemoteUrl] = useState('')
  const [lastMusicFolder, setLastMusicFolder] = useState(() => localStorage.getItem(lastMusicFolderKey) ?? '')

  const labels = text[language]
  const currentTrack = tracks.find((track) => track.id === currentTrackId)
  const selectedTheme = availableThemes.find((theme) => theme.id === themeId) ?? availableThemes[0]

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

  useEffect(() => {
    const audio = audioRef.current

    if (!audio) {
      return
    }

    if (!currentTrack) {
      audio.removeAttribute('src')
      audio.load()
      return
    }

    audio.src = currentTrack.source
    audio.load()
    setCurrentTime(0)
    setDuration(0)

    if (isPlaying) {
      void audio.play()
    }
  }, [currentTrack, isPlaying])

  const ensureAudioGraph = () => {
    const audio = audioRef.current

    if (!audio) {
      return
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext()
    }

    if (!analyserRef.current) {
      analyserRef.current = audioContextRef.current.createAnalyser()
      analyserRef.current.fftSize = 128
    }

    if (!sourceNodeRef.current) {
      sourceNodeRef.current = audioContextRef.current.createMediaElementSource(audio)
      sourceNodeRef.current.connect(analyserRef.current)
      analyserRef.current.connect(audioContextRef.current.destination)
    }
  }

  const drawSpectrum = () => {
    const canvas = canvasRef.current
    const analyser = analyserRef.current

    if (!canvas || !analyser) {
      return
    }

    const context = canvas.getContext('2d')

    if (!context) {
      return
    }

    const data = new Uint8Array(analyser.frequencyBinCount)
    const render = () => {
      analyser.getByteFrequencyData(data)
      context.clearRect(0, 0, canvas.width, canvas.height)

      const barWidth = canvas.width / data.length
      data.forEach((value, index) => {
        const height = Math.max(2, (value / 255) * canvas.height)
        context.fillStyle = index % 2 === 0 ? 'var(--primary)' : 'var(--primary-soft)'
        context.fillRect(index * barWidth, canvas.height - height, Math.max(barWidth - 2, 2), height)
      })

      animationRef.current = requestAnimationFrame(render)
    }

    render()
  }

  const play = async () => {
    const audio = audioRef.current

    if (!audio || !currentTrack) {
      return
    }

    ensureAudioGraph()

    if (audioContextRef.current?.state === 'suspended') {
      await audioContextRef.current.resume()
    }

    await audio.play()
    setIsPlaying(true)
    drawSpectrum()
  }

  const pause = () => {
    audioRef.current?.pause()
    setIsPlaying(false)
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
  }

  const playRelativeTrack = (direction: -1 | 1) => {
    if (!tracks.length) {
      return
    }

    const index = tracks.findIndex((track) => track.id === currentTrackId)
    const currentIndex = index === -1 ? 0 : index
    const nextIndex = (currentIndex + direction + tracks.length) % tracks.length
    setCurrentTrackId(tracks[nextIndex].id)
    setIsPlaying(true)
  }

  const addTracks = (nextTracks: Track[]) => {
    if (!nextTracks.length) {
      return
    }

    setTracks((previousTracks) => [...nextTracks, ...previousTracks])
    setCurrentTrackId(nextTracks[0].id)
    setIsPlaying(false)
  }

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])

    const localTracks = files.map((file) => {
      const source = URL.createObjectURL(file)
      objectUrlsRef.current.push(source)

      return {
        id: `${file.name}-${file.lastModified}`,
        title: file.name.replace(/\.[^/.]+$/, ''),
        source,
        origin: 'local' as const,
      }
    })

    addTracks(localTracks)
    event.target.value = ''
  }

  const loadMusicFolder = async (folderPath: string) => {
    const entries = await readDir(folderPath)
    const folderTracks = await Promise.all(
      entries
        .filter((entry) => entry.isFile && audioExtensions.some((extension) => entry.name.toLowerCase().endsWith(extension)))
        .map(async (entry) => {
          const filePath = await join(folderPath, entry.name)

          return {
            id: `folder-${filePath}`,
            title: entry.name.replace(/\.[^/.]+$/, ''),
            source: convertFileSrc(filePath),
            origin: 'local' as const,
          }
        }),
    )

    addTracks(folderTracks)
    setLastMusicFolder(folderPath)
    localStorage.setItem(lastMusicFolderKey, folderPath)
  }

  const openMusicFolder = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      recursive: false,
      defaultPath: lastMusicFolder || undefined,
      title: labels.openFolder,
    })

    if (typeof selected === 'string') {
      await loadMusicFolder(selected)
    }
  }

  const reopenMusicFolder = async () => {
    if (lastMusicFolder) {
      await loadMusicFolder(lastMusicFolder)
      return
    }

    await openMusicFolder()
  }

  const addRemoteTrack = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextUrl = remoteUrl.trim()

    if (!nextUrl) {
      return
    }

    addTracks([
      {
        id: `remote-${Date.now()}`,
        title: nextUrl.split('/').pop()?.replace(/\?.*$/, '') || 'Remote audio',
        source: nextUrl,
        origin: 'remote',
      },
    ])
    setRemoteUrl('')
  }

  const savePlaylist = () => {
    const playlist: PlaylistFile = {
      format: 'my-music-station-playlist',
      version: 1,
      tracks: tracks.map((track) => ({
        title: track.title,
        source: track.origin === 'remote' ? track.source : '',
        origin: track.origin,
      })),
    }
    const blob = new Blob([JSON.stringify(playlist, null, 2)], { type: 'application/vnd.mymusicstation.playlist+json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = 'my-music-station.mmspl'
    link.click()
    URL.revokeObjectURL(url)
  }

  const openPlaylist = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    const reader = new FileReader()

    reader.onload = () => {
      try {
        const playlist = JSON.parse(String(reader.result)) as PlaylistFile

        if (playlist.format !== 'my-music-station-playlist' || playlist.version !== 1) {
          return
        }

        const importedTracks = playlist.tracks
          .filter((track) => track.source)
          .map((track, index) => ({
            id: `playlist-${Date.now()}-${index}`,
            title: track.title,
            source: track.source,
            origin: track.origin,
          }))

        setTracks(importedTracks)
        setCurrentTrackId(importedTracks[0]?.id ?? '')
        setIsPlaying(false)
      } finally {
        event.target.value = ''
      }
    }

    reader.readAsText(file)
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

  const minimizeWindow = async () => {
    await getCurrentWindow().minimize()
  }

  const closeWindow = async () => {
    await getCurrentWindow().hide()
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
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
      />

      <header className="title-toolbar">
        <div className="brand-block" onMouseDown={startWindowDrag} data-tauri-drag-region>
          <strong data-tauri-drag-region>{labels.appName}</strong>
          <span data-tauri-drag-region>{labels.title}</span>
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
          <label className="tool-button" data-tooltip={labels.addFiles} aria-label={labels.addFiles}>
            <Plus size={15} />
            <span>{labels.addFiles}</span>
            <input type="file" accept="audio/*,.flac,.ogg,.wav,.mp3,.m4a,.aac,.webm" multiple onChange={handleFiles} />
          </label>
          <button className="tool-button icon-only" type="button" data-tooltip={labels.savePlaylist} aria-label={labels.savePlaylist} onClick={savePlaylist}>
            <Save size={15} />
          </button>
          <label className="tool-button icon-only" data-tooltip={labels.openPlaylist} aria-label={labels.openPlaylist}>
            <FileInput size={15} />
            <input type="file" accept=".mmspl,application/json" onChange={openPlaylist} />
          </label>
          <button className="tool-button language-toggle" type="button" data-tooltip={labels.language} aria-label={labels.language} onClick={toggleLanguage}>
            <Languages size={15} />
            <span>{language === 'ko' ? 'English' : '한글'}</span>
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
          <button type="button" className="close-button" data-tooltip={labels.close} aria-label={labels.close} onClick={closeWindow}>
            <X size={14} />
          </button>
        </div>
      </header>

      <section className="content-grid">
        <section className="player-panel">
          <div className="now-playing">
            <div>
              <span>{currentTrack?.origin === 'local' ? labels.local : labels.remote}</span>
              <h1>{currentTrack?.title ?? labels.noTrack}</h1>
            </div>
            <small>{labels.formats}</small>
          </div>

          <canvas ref={canvasRef} className="spectrum" width="620" height="128" aria-label="Spectrum" />

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
            <input aria-label={labels.volume} type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
          </div>

          <div className="folder-chip" title={lastMusicFolder || labels.folder}>
            {lastMusicFolder || labels.folder}
          </div>

          <div className="track-list" aria-label={labels.playlist}>
            {tracks.slice(0, 9).map((track) => (
              <button
                type="button"
                key={track.id}
                className={track.id === currentTrackId ? 'active' : ''}
                onClick={() => {
                  setCurrentTrackId(track.id)
                  setIsPlaying(false)
                }}
              >
                <span>{track.title}</span>
                <small>{track.origin === 'local' ? labels.local : labels.remote}</small>
              </button>
            ))}
          </div>
        </aside>
      </section>
    </main>
  )
}

export default App
