import { useEffect, useRef, useState } from 'react'
import {
  ArrowRightLeft,
  Clipboard,
  Copy,
  Download,
  FileText,
  Info,
  Languages,
  LoaderCircle,
  Minus,
  Moon,
  Pause,
  Play,
  RefreshCw,
  Save,
  Settings,
  Square,
  Sun,
  Upload,
  Volume2,
  X,
} from 'lucide-react'
import appIconUrl from './assets/app-icon.png'
import './App.css'

type UiLanguage = 'en' | 'ko'
type Theme = 'dark' | 'light'
type AudioFormat = 'wav' | 'mp3'

type ErrorInfo = {
  title: string
  message: string
  details: string
}

type OllamaTagsResponse = {
  models?: Array<{ name?: string; model?: string }>
}

type TtsVoiceInfo = {
  id: string
  language: string
  display_name: string
  engine: string
  installed?: boolean
  downloadable?: boolean
}

type DownloadProgress = {
  status?: string
  error?: string
  completed?: number
  total?: number
}

const OLLAMA_URL_STORAGE_KEY = 'langtrans.ollamaUrl'
const OLLAMA_MODEL_STORAGE_KEY = 'langtrans.ollamaModel'
const TTS_URL_STORAGE_KEY = 'langtrans.ttsUrl'
const TTS_VOICE_STORAGE_KEY = 'langtrans.ttsVoiceId'
const DEFAULT_OLLAMA_URL = 'http://localhost:11434'
const DEFAULT_OLLAMA_MODEL = 'llama3.1'
const DEFAULT_TTS_URL = 'http://localhost:8756'

const readStoredValue = (key: string, fallback: string) => {
  if (typeof window === 'undefined') {
    return fallback
  }

  return window.localStorage.getItem(key) || fallback
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
    langTransWindow?: {
      minimize: () => Promise<void>
      toggleMaximize: () => Promise<void>
      close: () => Promise<void>
      startTtsServer: () => Promise<{ ok: boolean; message: string }>
    }
  }
}

type LanguageOption = {
  code: string
  name: string
  nativeName: string
  ttsVoiceId?: string
}

const languages: LanguageOption[] = [
  { code: 'auto', name: 'Auto detect', nativeName: '자동 감지' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', ttsVoiceId: 'ko-supertonic' },
  { code: 'en', name: 'English', nativeName: 'English', ttsVoiceId: 'en-piper-onnx' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
]

const copy = {
  en: {
    appName: 'LangTrans V1.0.0',
    subtitle: 'Ollama translation with local ONNX TTS routing for Web, Linux, macOS, and Windows.',
    source: 'Input language',
    target: 'Output language',
    input: 'Text to translate',
    output: 'Translation',
    placeholder: 'Type or paste text here.',
    translate: 'Translate',
    read: 'Read aloud',
    play: 'Play',
    pause: 'Pause',
    stop: 'Stop',
    openTextFile: 'Open text file',
    pasteText: 'Paste text',
    copyOutput: 'Copy output',
    saveOutput: 'Save output text',
    saveWav: 'Save WAV',
    saveMp3: 'Save MP3',
    swap: 'Swap languages',
    model: 'Ollama model',
    ollamaUrl: 'Ollama URL',
    settings: 'Settings',
    saveOllama: 'Save Ollama settings',
    testOllama: 'Test Ollama connection',
    refreshModels: 'Detect Ollama models',
    downloadTtsModel: 'Download TTS model',
    downloadingModel: 'Downloading model',
    modelDownloadComplete: 'Model download complete.',
    ollamaSaved: 'Ollama settings saved.',
    ollamaConnected: 'Ollama connection is ready.',
    ollamaModelsLoaded: 'Ollama models loaded.',
    noOllamaModels: 'No Ollama models found. Pull a model first.',
    ttsUrl: 'Local TTS URL',
    ttsModel: 'TTS model / voice',
    startTtsServer: 'Start TTS server',
    refreshTtsModels: 'Load TTS models',
    ttsModelsLoaded: 'TTS models loaded.',
    noTtsModels: 'No TTS models found. Check the local TTS config.',
    installed: 'Installed',
    missing: 'Missing',
    downloadable: 'Downloadable',
    notDownloadable: 'Manual install required',
    saveSettings: 'Save settings',
    settingsSaved: 'Settings saved.',
    testTts: 'Test local TTS connection',
    ttsConnected: 'Local TTS connection is ready.',
    theme: 'Theme',
    interface: 'Interface',
    ttsRoute: 'TTS voice route',
    koreanRoute: 'Korean output uses Supertonic external runner when selected.',
    englishRoute: 'English output uses a separate Piper/ONNX voice profile.',
    ready: 'Ready',
    translating: 'Translating...',
    speaking: 'Synthesizing speech...',
    ttsProgressTitle: 'Voice generation',
    saving: 'Saving audio...',
    saved: 'Audio file saved.',
    outputSaved: 'Output text saved.',
    fileLoaded: 'Text file loaded.',
    dropTextFile: 'Drop a text file here',
    waveform: 'Audio waveform',
    noText: 'Enter text before translating.',
    noOutput: 'Translate text before TTS playback.',
    ttsUnavailable: 'Local TTS service is not responding.',
    info: 'Info',
    programInfo: 'Program information',
    version: 'Version',
    author: 'Author',
    description: 'Local-first translation app using Ollama and a separate ONNX/Supertonic TTS service.',
    errorTitle: 'Error details',
    copyError: 'Copy error details',
    copied: 'Copied to clipboard.',
    closeDialog: 'Close dialog',
    statusLabel: 'Status',
    routeLabel: 'Voice route',
    textStats: 'Characters',
    minimize: 'Minimize',
    maximize: 'Maximize or restore',
    close: 'Close',
  },
  ko: {
    appName: 'LangTrans V1.0.0',
    subtitle: 'Ollama 번역과 로컬 ONNX TTS 라우팅을 Web, Linux, macOS, Windows에서 사용합니다.',
    source: '입력 언어',
    target: '출력 언어',
    input: '번역할 문장',
    output: '번역 결과',
    placeholder: '번역할 텍스트를 입력하거나 붙여넣으세요.',
    translate: '번역하기',
    read: '소리로 읽기',
    play: '플레이',
    pause: '잠시 멈춤',
    stop: '멈춤',
    openTextFile: '텍스트 파일 열기',
    pasteText: '텍스트 붙여넣기',
    copyOutput: '결과 복사',
    saveOutput: '결과 텍스트 저장',
    saveWav: 'WAV 저장',
    saveMp3: 'MP3 저장',
    swap: '언어 바꾸기',
    model: 'Ollama 모델',
    ollamaUrl: 'Ollama URL',
    settings: '설정',
    saveOllama: 'Ollama 설정 저장',
    testOllama: 'Ollama 연결 확인',
    refreshModels: 'Ollama 모델 감지',
    downloadTtsModel: 'TTS 모델 다운로드',
    downloadingModel: '모델 다운로드 중',
    modelDownloadComplete: '모델 다운로드가 완료되었습니다.',
    ollamaSaved: 'Ollama 설정을 저장했습니다.',
    ollamaConnected: 'Ollama 연결이 정상입니다.',
    ollamaModelsLoaded: 'Ollama 모델 목록을 불러왔습니다.',
    noOllamaModels: 'Ollama 모델이 없습니다. 먼저 모델을 pull 하세요.',
    ttsUrl: '로컬 TTS URL',
    ttsModel: 'TTS 모델 / 음성',
    startTtsServer: 'TTS 서버 실행',
    refreshTtsModels: 'TTS 모델 불러오기',
    ttsModelsLoaded: 'TTS 모델 목록을 불러왔습니다.',
    noTtsModels: 'TTS 모델이 없습니다. 로컬 TTS 설정을 확인하세요.',
    installed: '설치됨',
    missing: '없음',
    downloadable: '다운로드 가능',
    notDownloadable: '수동 설치 필요',
    saveSettings: '설정 저장',
    settingsSaved: '설정을 저장했습니다.',
    testTts: '로컬 TTS 연결 확인',
    ttsConnected: '로컬 TTS 연결이 정상입니다.',
    theme: '테마',
    interface: '인터페이스',
    ttsRoute: 'TTS 음성 라우트',
    koreanRoute: '한국어 출력은 선택 시 Supertonic 외부 실행기를 사용합니다.',
    englishRoute: '영어 출력은 별도의 Piper/ONNX 음성 프로필을 사용합니다.',
    ready: '준비됨',
    translating: '번역 중...',
    speaking: '음성 생성 중...',
    ttsProgressTitle: '음성 생성',
    saving: '음성 저장 중...',
    saved: '음성 파일을 저장했습니다.',
    outputSaved: '출력 텍스트를 저장했습니다.',
    fileLoaded: '텍스트 파일을 불러왔습니다.',
    dropTextFile: '텍스트 파일을 여기에 놓으세요',
    waveform: '음성 파형',
    noText: '번역할 텍스트를 먼저 입력하세요.',
    noOutput: 'TTS 재생 전에 번역을 먼저 실행하세요.',
    ttsUnavailable: '로컬 TTS 서비스가 응답하지 않습니다.',
    info: '정보',
    programInfo: '프로그램 정보',
    version: '버전',
    author: '제작자',
    description: 'Ollama와 별도 ONNX/Supertonic TTS 서비스를 사용하는 로컬 우선 번역 앱입니다.',
    errorTitle: '오류 상세 정보',
    copyError: '오류 내용 복사',
    copied: '클립보드에 복사했습니다.',
    closeDialog: '대화상자 닫기',
    statusLabel: '상태',
    routeLabel: '음성 라우트',
    textStats: '글자 수',
    minimize: '최소화',
    maximize: '최대화 또는 복원',
    close: '닫기',
  },
} satisfies Record<UiLanguage, Record<string, string>>

const getLanguageLabel = (language: LanguageOption, uiLanguage: UiLanguage) =>
  uiLanguage === 'ko' ? language.nativeName : language.name

const resolveVoiceId = (targetLanguage: string) =>
  languages.find((language) => language.code === targetLanguage)?.ttsVoiceId ?? 'en-piper-onnx'

type ToolbarButtonProps = {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}

function ToolbarButton({ label, onClick, disabled, children }: ToolbarButtonProps) {
  return (
    <button className="toolbar-button tooltip" type="button" onClick={onClick} disabled={disabled} aria-label={label} data-tooltip={label} title={label}>
      {children}
    </button>
  )
}

type LanguageToggleButtonProps = {
  label: string
  onClick: () => void
  children: React.ReactNode
}

function LanguageToggleButton({ label, onClick, children }: LanguageToggleButtonProps) {
  return (
    <button className="toolbar-button language-toggle tooltip" type="button" onClick={onClick} aria-label={label} data-tooltip={label} title={label}>
      <Languages size={16} />
      <span>{children}</span>
    </button>
  )
}

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlRef = useRef<string | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const toastTimeoutRef = useRef<number | null>(null)
  const ttsProgressTimerRef = useRef<number | null>(null)
  const ttsProgressCloseTimerRef = useRef<number | null>(null)
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>('ko')
  const [theme, setTheme] = useState<Theme>('dark')
  const [sourceLanguage, setSourceLanguage] = useState('auto')
  const [targetLanguage, setTargetLanguage] = useState('ko')
  const [inputText, setInputText] = useState('')
  const [outputText, setOutputText] = useState('')
  const [status, setStatus] = useState(copy.ko.ready)
  const [ollamaUrl, setOllamaUrl] = useState(() => readStoredValue(OLLAMA_URL_STORAGE_KEY, DEFAULT_OLLAMA_URL))
  const [ttsUrl, setTtsUrl] = useState(() => readStoredValue(TTS_URL_STORAGE_KEY, DEFAULT_TTS_URL))
  const [ollamaModel, setOllamaModel] = useState(() => readStoredValue(OLLAMA_MODEL_STORAGE_KEY, DEFAULT_OLLAMA_MODEL))
  const [ttsVoiceId, setTtsVoiceId] = useState(() => readStoredValue(TTS_VOICE_STORAGE_KEY, ''))
  const [availableOllamaModels, setAvailableOllamaModels] = useState<string[]>([])
  const [availableTtsVoices, setAvailableTtsVoices] = useState<TtsVoiceInfo[]>([])
  const [isTranslating, setIsTranslating] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isTestingOllama, setIsTestingOllama] = useState(false)
  const [isLoadingOllamaModels, setIsLoadingOllamaModels] = useState(false)
  const [isLoadingTtsVoices, setIsLoadingTtsVoices] = useState(false)
  const [isStartingTtsServer, setIsStartingTtsServer] = useState(false)
  const [downloadingTtsVoiceId, setDownloadingTtsVoiceId] = useState('')
  const [modelDownloadProgress, setModelDownloadProgress] = useState('')
  const [isTestingTts, setIsTestingTts] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isInfoOpen, setIsInfoOpen] = useState(false)
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null)
  const [toastMessage, setToastMessage] = useState('')
  const [ttsProgress, setTtsProgress] = useState(0)
  const [isTtsProgressOpen, setIsTtsProgressOpen] = useState(false)
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [waveform, setWaveform] = useState<number[]>([])
  const [playbackProgress, setPlaybackProgress] = useState(0)
  const [audioDuration, setAudioDuration] = useState(0)

  const text = copy[uiLanguage]
  const targetVoiceId = ttsVoiceId || resolveVoiceId(targetLanguage)
  const displayedStatus = status === text.ready ? '' : status

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.lang = uiLanguage
  }, [theme, uiLanguage])

  useEffect(() => {
    setStatus(copy[uiLanguage].ready)
  }, [uiLanguage])

  useEffect(() => () => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    if (toastTimeoutRef.current !== null) {
      window.clearTimeout(toastTimeoutRef.current)
    }
    if (ttsProgressTimerRef.current !== null) {
      window.clearInterval(ttsProgressTimerRef.current)
    }
    if (ttsProgressCloseTimerRef.current !== null) {
      window.clearTimeout(ttsProgressCloseTimerRef.current)
    }
    audioRef.current?.pause()
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current)
    }
  }, [])

  const describeError = (error: unknown) => error instanceof Error ? error.message : String(error)

  const showError = (title: string, message: string, details: string) => {
    setStatus(message)
    setErrorInfo({ title, message, details })
  }

  const showToast = (message: string) => {
    setToastMessage(message)
    if (toastTimeoutRef.current !== null) {
      window.clearTimeout(toastTimeoutRef.current)
    }
    toastTimeoutRef.current = window.setTimeout(() => setToastMessage(''), 2000)
  }

  const startTtsProgress = () => {
    if (ttsProgressTimerRef.current !== null) {
      window.clearInterval(ttsProgressTimerRef.current)
    }
    if (ttsProgressCloseTimerRef.current !== null) {
      window.clearTimeout(ttsProgressCloseTimerRef.current)
    }

    setIsTtsProgressOpen(true)
    setTtsProgress(3)
    ttsProgressTimerRef.current = window.setInterval(() => {
      setTtsProgress((current) => Math.min(90, current + Math.max(1, Math.round((90 - current) * 0.12))))
    }, 450)
  }

  const finishTtsProgress = () => {
    if (ttsProgressTimerRef.current !== null) {
      window.clearInterval(ttsProgressTimerRef.current)
      ttsProgressTimerRef.current = null
    }
    setTtsProgress(100)
    ttsProgressCloseTimerRef.current = window.setTimeout(() => setIsTtsProgressOpen(false), 700)
  }

  const closeTtsProgress = () => {
    if (ttsProgressTimerRef.current !== null) {
      window.clearInterval(ttsProgressTimerRef.current)
      ttsProgressTimerRef.current = null
    }
    setIsTtsProgressOpen(false)
    setTtsProgress(0)
  }

  const readErrorResponse = async (response: Response) => {
    const rawText = await response.text()
    if (!rawText) {
      return `${response.status} ${response.statusText}`
    }

    try {
      const parsed = JSON.parse(rawText) as { detail?: unknown; error?: unknown }
      return String(parsed.detail ?? parsed.error ?? rawText)
    } catch {
      return rawText
    }
  }

  const updateDownloadProgress = (progress: DownloadProgress) => {
    if (progress.status === 'error' || progress.error) {
      throw new Error(progress.error || progress.status)
    }

    if (progress.total && progress.completed !== undefined) {
      const percent = Math.min(100, Math.round(progress.completed / progress.total * 100))
      setModelDownloadProgress(`${text.downloadingModel}: ${percent}%`)
      setStatus(`${text.downloadingModel}: ${percent}%`)
      return
    }

    if (progress.status) {
      setModelDownloadProgress(progress.status)
      setStatus(progress.status)
    }
  }

  const readJsonLinesProgress = async (response: Response) => {
    if (!response.body) {
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.trim()) {
          continue
        }

        updateDownloadProgress(JSON.parse(line) as DownloadProgress)
      }

      if (done) {
        if (buffer.trim()) {
          updateDownloadProgress(JSON.parse(buffer) as DownloadProgress)
        }
        return
      }
    }
  }

  const copyErrorDetails = async () => {
    if (!errorInfo) {
      return
    }

    await navigator.clipboard.writeText([
      errorInfo.title,
      errorInfo.message,
      errorInfo.details,
    ].join('\n\n'))
    setStatus(text.copied)
    showToast(text.copied)
  }

  const saveSettings = () => {
    window.localStorage.setItem(OLLAMA_URL_STORAGE_KEY, ollamaUrl)
    window.localStorage.setItem(OLLAMA_MODEL_STORAGE_KEY, ollamaModel)
    window.localStorage.setItem(TTS_URL_STORAGE_KEY, ttsUrl)
    window.localStorage.setItem(TTS_VOICE_STORAGE_KEY, ttsVoiceId)
    setStatus(text.settingsSaved)
    showToast(text.settingsSaved)
  }

  const testOllama = async () => {
    setIsTestingOllama(true)
    try {
      const response = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/version`)
      if (!response.ok) {
        const detail = await readErrorResponse(response)
        throw new Error(`Ollama returned ${response.status}: ${detail}`)
      }

      window.localStorage.setItem(OLLAMA_URL_STORAGE_KEY, ollamaUrl)
      window.localStorage.setItem(OLLAMA_MODEL_STORAGE_KEY, ollamaModel)
      setStatus(text.ollamaConnected)
    } catch (error) {
      showError(text.errorTitle, text.testOllama, `Endpoint: ${ollamaUrl}\n${describeError(error)}`)
    } finally {
      setIsTestingOllama(false)
    }
  }

  const loadOllamaModels = async () => {
    setIsLoadingOllamaModels(true)
    try {
      const response = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/tags`)
      if (!response.ok) {
        const detail = await readErrorResponse(response)
        throw new Error(`Ollama returned ${response.status}: ${detail}`)
      }

      const data = (await response.json()) as OllamaTagsResponse
      const models = [...new Set((data.models ?? []).map((model) => model.name ?? model.model).filter((model): model is string => Boolean(model)))]
      setAvailableOllamaModels(models)
      if (models.length > 0 && !models.includes(ollamaModel)) {
        setOllamaModel(models[0])
      }
      window.localStorage.setItem(OLLAMA_URL_STORAGE_KEY, ollamaUrl)
      setStatus(models.length > 0 ? text.ollamaModelsLoaded : text.noOllamaModels)
      return true
    } catch (error) {
      showError(text.errorTitle, text.refreshModels, `Endpoint: ${ollamaUrl}\n${describeError(error)}`)
      return false
    } finally {
      setIsLoadingOllamaModels(false)
    }
  }

  const loadTtsVoices = async () => {
    setIsLoadingTtsVoices(true)
    try {
      const response = await fetch(`${ttsUrl.replace(/\/$/, '')}/voices`)
      if (!response.ok) {
        const detail = await readErrorResponse(response)
        throw new Error(`TTS service returned ${response.status}: ${detail}`)
      }

      const voices = (await response.json()) as TtsVoiceInfo[]
      setAvailableTtsVoices(voices)
      setStatus(voices.length > 0 ? text.ttsModelsLoaded : text.noTtsModels)
      return true
    } catch (error) {
      showError(text.errorTitle, text.refreshTtsModels, `Endpoint: ${ttsUrl}\n${describeError(error)}`)
      return false
    } finally {
      setIsLoadingTtsVoices(false)
    }
  }

  const testTts = async () => {
    setIsTestingTts(true)
    try {
      const response = await fetch(`${ttsUrl.replace(/\/$/, '')}/health`)
      if (!response.ok) {
        const detail = await readErrorResponse(response)
        throw new Error(`TTS service returned ${response.status}: ${detail}`)
      }

      const voicesLoaded = await loadTtsVoices()
      if (!voicesLoaded) {
        return
      }

      window.localStorage.setItem(TTS_URL_STORAGE_KEY, ttsUrl)
      window.localStorage.setItem(TTS_VOICE_STORAGE_KEY, ttsVoiceId)
      setStatus(text.ttsConnected)
    } catch (error) {
      showError(text.errorTitle, text.testTts, `Endpoint: ${ttsUrl}\n${describeError(error)}`)
    } finally {
      setIsTestingTts(false)
    }
  }

  const startTtsServer = async () => {
    if (!window.langTransWindow?.startTtsServer) {
      setStatus(text.ttsUnavailable)
      return
    }

    setIsStartingTtsServer(true)
    try {
      const result = await window.langTransWindow.startTtsServer()
      setStatus(result.message)
      window.setTimeout(() => void testTts(), 900)
    } catch (error) {
      showError(text.errorTitle, text.startTtsServer, describeError(error))
    } finally {
      setIsStartingTtsServer(false)
    }
  }

  const downloadTtsModel = async (voiceId = targetVoiceId) => {
    if (!voiceId.trim()) {
      setStatus(text.noTtsModels)
      return false
    }

    setDownloadingTtsVoiceId(voiceId)
    setModelDownloadProgress(`${text.downloadingModel}: 0%`)
    try {
      const response = await fetch(`${ttsUrl.replace(/\/$/, '')}/models/${encodeURIComponent(voiceId)}/download`, { method: 'POST' })
      if (!response.ok) {
        const detail = await readErrorResponse(response)
        throw new Error(`TTS service returned ${response.status}: ${detail}`)
      }

      await readJsonLinesProgress(response)
      window.localStorage.setItem(TTS_URL_STORAGE_KEY, ttsUrl)
      window.localStorage.setItem(TTS_VOICE_STORAGE_KEY, ttsVoiceId)
      await loadTtsVoices()
      setModelDownloadProgress(text.modelDownloadComplete)
      setStatus(text.modelDownloadComplete)
      return true
    } catch (error) {
      showError(text.errorTitle, text.downloadTtsModel, `Endpoint: ${ttsUrl}\nVoice: ${voiceId}\n${describeError(error)}`)
      return false
    } finally {
      setDownloadingTtsVoiceId('')
    }
  }

  const saveBlob = (blob: Blob, filename: string) => {
    const downloadUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = filename
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(downloadUrl)
  }

  const loadTextFile = async (file: File) => {
    try {
      const content = await file.text()
      setInputText(content)
      setStatus(`${text.fileLoaded} ${file.name}`)
    } catch (error) {
      showError(text.errorTitle, 'Text file load failed', `File: ${file.name}\n${describeError(error)}`)
    }
  }

  const pasteText = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText()
      setInputText((current) => current ? `${current}\n${clipboardText}` : clipboardText)
      setStatus(text.ready)
    } catch (error) {
      showError(text.errorTitle, 'Clipboard paste failed', describeError(error))
    }
  }

  const copyOutput = async () => {
    if (!outputText.trim()) {
      setStatus(text.noOutput)
      return
    }

    try {
      await navigator.clipboard.writeText(outputText)
      setStatus(text.copied)
    } catch (error) {
      showError(text.errorTitle, 'Clipboard copy failed', describeError(error))
    }
  }

  const saveOutputText = () => {
    if (!outputText.trim()) {
      setStatus(text.noOutput)
      return
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    saveBlob(new Blob([outputText], { type: 'text/plain;charset=utf-8' }), `langtrans-${targetLanguage}-${timestamp}.txt`)
    setStatus(text.outputSaved)
  }

  const decodeWaveform = async (audioBlob: Blob) => {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext
    if (!AudioContextConstructor) {
      return
    }

    const audioContext = new AudioContextConstructor()
    const audioBuffer = await audioContext.decodeAudioData(await audioBlob.arrayBuffer())
    const channelData = audioBuffer.getChannelData(0)
    const barCount = 128
    const blockSize = Math.max(1, Math.floor(channelData.length / barCount))
    const bars = Array.from({ length: barCount }, (_, index) => {
      const start = index * blockSize
      const end = Math.min(channelData.length, start + blockSize)
      let sum = 0
      for (let cursor = start; cursor < end; cursor += 1) {
        sum += Math.abs(channelData[cursor])
      }
      return Math.max(0.08, Math.min(1, sum / Math.max(1, end - start) * 4))
    })

    setWaveform(bars)
    setAudioDuration(audioBuffer.duration)
    await audioContext.close()
  }

  const trackPlayback = (audio: HTMLAudioElement) => {
    setPlaybackProgress(audio.duration ? audio.currentTime / audio.duration : 0)
    if (!audio.paused && !audio.ended) {
      animationFrameRef.current = requestAnimationFrame(() => trackPlayback(audio))
    }
  }

  const releaseCurrentAudio = () => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    audioRef.current?.pause()
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current)
      audioUrlRef.current = null
    }
    audioRef.current = null
    setIsAudioPlaying(false)
  }

  const translate = async () => {
    if (!inputText.trim()) {
      setStatus(text.noText)
      return
    }

    setIsTranslating(true)
    setStatus(text.translating)

    const source = languages.find((language) => language.code === sourceLanguage)
    const target = languages.find((language) => language.code === targetLanguage)
    const prompt = [
      'Translate the user text only. Do not add explanations.',
      `Source language: ${source?.name ?? sourceLanguage}`,
      `Target language: ${target?.name ?? targetLanguage}`,
      `Text: ${inputText}`,
    ].join('\n')

    try {
      const response = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: ollamaModel, prompt, stream: false }),
      })

      if (!response.ok) {
        const detail = await readErrorResponse(response)
        throw new Error(`Ollama returned ${response.status}: ${detail}`)
      }

      const data = (await response.json()) as { response?: string }
      setOutputText(data.response?.trim() ?? '')
      setStatus(text.ready)
    } catch (error) {
      const detail = describeError(error)
      showError(text.errorTitle, 'Translation failed', `Endpoint: ${ollamaUrl}\nModel: ${ollamaModel}\n${detail}`)
    } finally {
      setIsTranslating(false)
    }
  }

  const synthesizeAudio = async (format: AudioFormat) => {
    if (!outputText.trim()) {
      setStatus(text.noOutput)
      return null
    }

    const response = await fetch(`${ttsUrl.replace(/\/$/, '')}/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: outputText,
        language: targetLanguage,
        voice_id: targetVoiceId,
        output_format: format,
      }),
    })

    if (!response.ok) {
      const detail = await readErrorResponse(response)
      if (response.status === 404 && detail.includes('ONNX model not found')) {
        const downloaded = await downloadTtsModel(targetVoiceId)
        if (downloaded) {
          return synthesizeAudio(format)
        }
      }
      throw new Error(`${text.ttsUnavailable} ${detail}`)
    }

    return response.blob()
  }

  const speak = async () => {
    setIsSpeaking(true)
    startTtsProgress()

    try {
      const audioBlob = await synthesizeAudio('wav')
      if (!audioBlob) {
        closeTtsProgress()
        return
      }
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      releaseCurrentAudio()
      await decodeWaveform(audioBlob)
      const audioUrl = URL.createObjectURL(audioBlob)
      audioUrlRef.current = audioUrl
      const audio = new Audio(audioUrl)
      audioRef.current = audio
      audio.onloadedmetadata = () => setAudioDuration(audio.duration || audioDuration)
      audio.onplay = () => {
        setIsAudioPlaying(true)
        trackPlayback(audio)
      }
      audio.onpause = () => setIsAudioPlaying(false)
      audio.onended = () => {
        setPlaybackProgress(1)
        setIsAudioPlaying(false)
        setStatus(text.ready)
      }
      finishTtsProgress()
      await audio.play()
    } catch (error) {
      closeTtsProgress()
      const detail = describeError(error)
      showError(text.errorTitle, text.ttsUnavailable, `Endpoint: ${ttsUrl}\nVoice: ${targetVoiceId}\nFormat: wav\n${detail}`)
    } finally {
      setIsSpeaking(false)
    }
  }

  const playAudio = async () => {
    if (!audioRef.current) {
      await speak()
      return
    }

    try {
      await audioRef.current.play()
    } catch (error) {
      showError(text.errorTitle, text.ttsUnavailable, describeError(error))
    }
  }

  const pauseAudio = () => {
    audioRef.current?.pause()
  }

  const stopAudio = () => {
    if (!audioRef.current) {
      setPlaybackProgress(0)
      return
    }

    audioRef.current.pause()
    audioRef.current.currentTime = 0
    setPlaybackProgress(0)
    setIsAudioPlaying(false)
  }

  const saveAudio = async (format: AudioFormat) => {
    setIsSaving(true)
    setStatus(text.saving)

    try {
      const audioBlob = await synthesizeAudio(format)
      if (!audioBlob) {
        return
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      saveBlob(audioBlob, `langtrans-${targetLanguage}-${timestamp}.${format}`)
      setStatus(text.saved)
    } catch (error) {
      const detail = describeError(error)
      showError(text.errorTitle, text.ttsUnavailable, `Endpoint: ${ttsUrl}\nVoice: ${targetVoiceId}\nFormat: ${format}\n${detail}`)
    } finally {
      setIsSaving(false)
    }
  }

  const swapLanguages = () => {
    if (sourceLanguage === 'auto') {
      setSourceLanguage(targetLanguage)
      setTargetLanguage('en')
    } else {
      setSourceLanguage(targetLanguage)
      setTargetLanguage(sourceLanguage)
    }
    setInputText(outputText)
    setOutputText(inputText)
  }

  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      void loadTextFile(file)
    }
    event.target.value = ''
  }

  const handleDrop = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault()
    setIsDraggingOver(false)
    const file = event.dataTransfer.files[0]
    if (file) {
      void loadTextFile(file)
      return
    }

    const droppedText = event.dataTransfer.getData('text/plain')
    if (droppedText) {
      setInputText(droppedText)
      setStatus(text.ready)
    }
  }

  const seekPlayback = (index: number) => {
    if (!audioRef.current || waveform.length === 0) {
      return
    }

    const progress = index / Math.max(1, waveform.length - 1)
    audioRef.current.currentTime = progress * (audioRef.current.duration || audioDuration)
    setPlaybackProgress(progress)
  }

  return (
    <main className="app-shell">
      <header className="app-toolbar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            <img src={appIconUrl} alt="" />
          </div>
          <div>
            <h1>{text.appName}</h1>
          </div>
        </div>

        <div className="toolbar-actions" aria-label="Application toolbar">
          <input ref={fileInputRef} className="hidden-file-input" type="file" accept=".txt,.md,.csv,.json,text/*" onChange={handleFileSelection} />
          <ToolbarButton label={text.openTextFile} onClick={() => fileInputRef.current?.click()}>
            <FileText size={18} />
          </ToolbarButton>
          <ToolbarButton label={text.pasteText} onClick={() => void pasteText()}>
            <Clipboard size={18} />
          </ToolbarButton>
          <ToolbarButton label={text.translate} onClick={translate} disabled={isTranslating}>
            {isTranslating ? <LoaderCircle className="spin" size={18} /> : <Languages size={18} />}
          </ToolbarButton>
          <ToolbarButton label={text.read} onClick={speak} disabled={isSpeaking}>
            {isSpeaking ? <LoaderCircle className="spin" size={18} /> : <Volume2 size={18} />}
          </ToolbarButton>
          <ToolbarButton label={text.saveWav} onClick={() => saveAudio('wav')} disabled={isSaving}>
            {isSaving ? <LoaderCircle className="spin" size={18} /> : <Save size={18} />}
          </ToolbarButton>
          <ToolbarButton label={text.saveMp3} onClick={() => saveAudio('mp3')} disabled={isSaving}>
            {isSaving ? <LoaderCircle className="spin" size={18} /> : <Download size={18} />}
          </ToolbarButton>
          <ToolbarButton label={text.copyOutput} onClick={() => void copyOutput()}>
            <Copy size={18} />
          </ToolbarButton>
          <ToolbarButton label={text.saveOutput} onClick={saveOutputText}>
            <Upload size={18} />
          </ToolbarButton>
          <ToolbarButton label={text.swap} onClick={swapLanguages}>
            <ArrowRightLeft size={18} />
          </ToolbarButton>
          <ToolbarButton label={text.settings} onClick={() => setIsSettingsOpen(true)}>
            <Settings size={18} />
          </ToolbarButton>
          <LanguageToggleButton label={text.interface} onClick={() => setUiLanguage(uiLanguage === 'ko' ? 'en' : 'ko')}>
            {uiLanguage === 'ko' ? 'English' : '한국어'}
          </LanguageToggleButton>
          <ToolbarButton label={text.theme} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </ToolbarButton>
        </div>

        <div className="window-drag-region" aria-hidden="true" />

        <div className="window-controls" aria-label="Window controls">
          <ToolbarButton label={text.info} onClick={() => setIsInfoOpen(true)}>
            <Info size={18} />
          </ToolbarButton>
          <ToolbarButton label={text.minimize} onClick={() => void window.langTransWindow?.minimize()}>
            <Minus size={16} />
          </ToolbarButton>
          <ToolbarButton label={text.maximize} onClick={() => void window.langTransWindow?.toggleMaximize()}>
            <Square size={16} />
          </ToolbarButton>
          <ToolbarButton label={text.close} onClick={() => void window.langTransWindow?.close()}>
            <X size={16} />
          </ToolbarButton>
        </div>
      </header>

      <section className="translator-grid">
        <article
          className={`pane input-pane${isDraggingOver ? ' drag-over' : ''}`}
          onDragEnter={(event) => {
            event.preventDefault()
            setIsDraggingOver(true)
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={handleDrop}
        >
          <div className="pane-header">
            <label>
              <span>{text.source}</span>
              <select value={sourceLanguage} onChange={(event) => setSourceLanguage(event.target.value)}>
                {languages.map((language) => (
                  <option key={language.code} value={language.code}>
                    {getLanguageLabel(language, uiLanguage)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <textarea value={inputText} onChange={(event) => setInputText(event.target.value)} placeholder={text.placeholder} />
          {isDraggingOver && <div className="drop-overlay"><FileText size={28} />{text.dropTextFile}</div>}
        </article>

        <div className="center-actions" aria-label="Translation controls">
          <button className="translate-button tooltip" type="button" onClick={translate} disabled={isTranslating} aria-label={text.translate} data-tooltip={text.translate} title={text.translate}>
            {isTranslating ? <LoaderCircle className="spin" size={20} /> : <Languages size={20} />}
          </button>
          <button className="swap-button tooltip" type="button" onClick={swapLanguages} aria-label={text.swap} data-tooltip={text.swap} title={text.swap}>
            <ArrowRightLeft size={20} />
          </button>
        </div>

        <article className="pane result-pane">
          <div className="pane-header">
            <label>
              <span>{text.target}</span>
              <select value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)}>
                {languages.filter((language) => language.code !== 'auto').map((language) => (
                  <option key={language.code} value={language.code}>
                    {getLanguageLabel(language, uiLanguage)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <textarea value={outputText} onChange={(event) => setOutputText(event.target.value)} aria-label={text.output} />
        </article>
      </section>

      {displayedStatus && (
        <section className="command-row">
          <div className="status-pill" role="status">{displayedStatus}</div>
        </section>
      )}

      <aside className="route-panel">
        <div>
          <span>{text.ttsRoute}</span>
          <strong>{targetVoiceId}</strong>
        </div>
        <p>{text.koreanRoute}</p>
        <p>{text.englishRoute}</p>
      </aside>

      <section className="waveform-panel" aria-label={text.waveform}>
        <div className="waveform-header">
          <span>{text.waveform}</span>
          <div className="playback-controls" aria-label="Audio playback controls">
            <button className="toolbar-button tooltip" type="button" onClick={() => void playAudio()} disabled={isSpeaking || isAudioPlaying} aria-label={text.play} data-tooltip={text.play} title={text.play}>
              {isSpeaking ? <LoaderCircle className="spin" size={16} /> : <Play size={16} />}
            </button>
            <button className="toolbar-button tooltip" type="button" onClick={pauseAudio} disabled={!audioRef.current || !isAudioPlaying} aria-label={text.pause} data-tooltip={text.pause} title={text.pause}>
              <Pause size={16} />
            </button>
            <button className="toolbar-button stop-button tooltip" type="button" onClick={stopAudio} disabled={!audioRef.current && playbackProgress === 0} aria-label={text.stop} data-tooltip={text.stop} title={text.stop}>
              <Square size={16} />
            </button>
            <strong>{Math.round(playbackProgress * 100)}%</strong>
          </div>
        </div>
        <div className="waveform-track">
          {(waveform.length > 0 ? waveform : Array.from({ length: 128 }, (_, index) => 0.12 + Math.sin(index * 0.42) * 0.05 + Math.sin(index * 0.11) * 0.04)).map((level, index, bars) => {
            const isActive = index / Math.max(1, bars.length - 1) <= playbackProgress
            return (
              <button
                key={`${index}-${level}`}
                className={`waveform-bar${isActive ? ' active' : ''}`}
                type="button"
                style={{ height: `${Math.max(10, level * 130)}px` }}
                aria-label={`${text.waveform} ${index + 1}`}
                onClick={() => seekPlayback(index)}
              />
            )
          })}
        </div>
      </section>

      <footer className="statusbar" role="status" aria-label={text.statusLabel}>
        {displayedStatus && <span><strong>{text.statusLabel}</strong> {displayedStatus}</span>}
        <span><strong>{text.routeLabel}</strong> {targetVoiceId}</span>
        <span><strong>{text.textStats}</strong> {inputText.length} / {outputText.length}</span>
        <span><strong>{text.model}</strong> {ollamaModel}</span>
      </footer>

      {isSettingsOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setIsSettingsOpen(false)}>
          <section className="modal-card settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2 id="settings-title">{text.settings}</h2>
              <ToolbarButton label={text.closeDialog} onClick={() => setIsSettingsOpen(false)}>
                <X size={16} />
              </ToolbarButton>
            </div>
            <div className="settings-form">
              <label>
                <span>{text.ollamaUrl}</span>
                <input value={ollamaUrl} onChange={(event) => setOllamaUrl(event.target.value)} />
              </label>
              <label>
                <span>{text.model}</span>
                <select value={ollamaModel} onChange={(event) => setOllamaModel(event.target.value)}>
                  {availableOllamaModels.length === 0 && <option value={ollamaModel}>{ollamaModel}</option>}
                  {availableOllamaModels.map((model) => <option key={model} value={model}>{model}</option>)}
                </select>
              </label>
              <div className="settings-actions">
                <button className="secondary-button" type="button" onClick={() => void loadOllamaModels()} disabled={isLoadingOllamaModels}>
                  {isLoadingOllamaModels ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}
                  {text.refreshModels}
                </button>
                <button className="secondary-button" type="button" onClick={() => void testOllama()} disabled={isTestingOllama}>
                  {isTestingOllama ? <LoaderCircle className="spin" size={16} /> : <Settings size={16} />}
                  {text.testOllama}
                </button>
              </div>
              <label>
                <span>{text.ttsUrl}</span>
                <input value={ttsUrl} onChange={(event) => setTtsUrl(event.target.value)} />
              </label>
              <label>
                <span>{text.ttsModel}</span>
                <input list="tts-voices" value={ttsVoiceId} onChange={(event) => setTtsVoiceId(event.target.value)} placeholder={resolveVoiceId(targetLanguage)} />
                <datalist id="tts-voices">
                  {availableTtsVoices.map((voice) => (
                    <option key={voice.id} value={voice.id} label={`${voice.display_name} / ${voice.language} / ${voice.engine} / ${voice.installed ? 'installed' : 'missing'}`} />
                  ))}
                </datalist>
              </label>
              <div className="settings-actions">
                <button className="secondary-button" type="button" onClick={() => void startTtsServer()} disabled={isStartingTtsServer}>
                  {isStartingTtsServer ? <LoaderCircle className="spin" size={16} /> : <Play size={16} />}
                  {text.startTtsServer}
                </button>
                <button className="secondary-button" type="button" onClick={() => void loadTtsVoices()} disabled={isLoadingTtsVoices}>
                  {isLoadingTtsVoices ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}
                  {text.refreshTtsModels}
                </button>
                <button className="secondary-button" type="button" onClick={() => void testTts()} disabled={isTestingTts}>
                  {isTestingTts ? <LoaderCircle className="spin" size={16} /> : <Settings size={16} />}
                  {text.testTts}
                </button>
              </div>
              {availableTtsVoices.length > 0 && (
                <div className="tts-model-list">
                  {availableTtsVoices.map((voice) => {
                    const isDownloading = downloadingTtsVoiceId === voice.id
                    return (
                      <div className="tts-model-row" key={voice.id}>
                        <button className="tts-model-main" type="button" onClick={() => setTtsVoiceId(voice.id)}>
                          <strong>{voice.display_name}</strong>
                          <span>{voice.id} / {voice.language} / {voice.engine}</span>
                        </button>
                        <span className={`model-state ${voice.installed ? 'installed' : 'missing'}`}>{voice.installed ? text.installed : text.missing}</span>
                        <span className="model-state">{voice.downloadable ? text.downloadable : text.notDownloadable}</span>
                        <button className="secondary-button model-install-button" type="button" onClick={() => void downloadTtsModel(voice.id)} disabled={voice.installed || !voice.downloadable || isDownloading}>
                          {isDownloading ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}
                          {text.downloadTtsModel}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
              {modelDownloadProgress && <div className="download-progress" role="status">{modelDownloadProgress}</div>}
            </div>
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={saveSettings}>{text.saveSettings}</button>
            </div>
          </section>
        </div>
      )}

      {isInfoOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setIsInfoOpen(false)}>
          <section className="modal-card info-card" role="dialog" aria-modal="true" aria-labelledby="program-info-title" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2 id="program-info-title">{text.programInfo}</h2>
              <ToolbarButton label={text.closeDialog} onClick={() => setIsInfoOpen(false)}>
                <X size={16} />
              </ToolbarButton>
            </div>
            <div className="info-layout">
              <div className="info-icon" aria-hidden="true">
                <img src={appIconUrl} alt="" />
              </div>
              <div>
                <h3>{text.appName}</h3>
                <p>{text.description}</p>
                <dl>
                  <div>
                    <dt>{text.version}</dt>
                    <dd>1.0.0</dd>
                  </div>
                  <div>
                    <dt>{text.author}</dt>
                    <dd>SHKWON (knix008@naver.com)</dd>
                  </div>
                </dl>
              </div>
            </div>
          </section>
        </div>
      )}

      {errorInfo && (
        <div className="modal-backdrop" role="presentation" onClick={() => setErrorInfo(null)}>
          <section className="modal-card error-card" role="alertdialog" aria-modal="true" aria-labelledby="error-title" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2 id="error-title">{errorInfo.title}</h2>
              <ToolbarButton label={text.closeDialog} onClick={() => setErrorInfo(null)}>
                <X size={16} />
              </ToolbarButton>
            </div>
            <p>{errorInfo.message}</p>
            <pre>{errorInfo.details}</pre>
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => void copyErrorDetails()}>
                {text.copyError}
              </button>
            </div>
          </section>
        </div>
      )}

      {isTtsProgressOpen && (
        <div className="tts-progress-popup" role="status" aria-live="polite">
          <div className="tts-progress-header">
            <span>{text.ttsProgressTitle}</span>
            <strong>{ttsProgress}%</strong>
          </div>
          <div className="tts-progress-track" aria-hidden="true">
            <div className="tts-progress-fill" style={{ width: `${ttsProgress}%` }} />
          </div>
        </div>
      )}

      {toastMessage && <div className="toast-popup" role="status">{toastMessage}</div>}
    </main>
  )
}

export default App
