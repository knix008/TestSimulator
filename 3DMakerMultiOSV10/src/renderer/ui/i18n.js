const LANG_STORAGE_KEY = 'space-maker.lang'
const THEME_STORAGE_KEY = 'space-maker.theme'

const SUPPORTED_LANGS = new Set(['ko', 'en'])
const SUPPORTED_THEMES = new Set(['dark', 'light'])

const listeners = new Set()

let currentLang = 'ko'
let currentTheme = 'dark'

const MESSAGES = {
  ko: {
    'app.subtitle': '2D 이미지 -> 탐색 가능한 3D 공간',
    'menu.image.select': '이미지 선택',
    'menu.formats': 'JPEG · PNG · GIF · AVIF · WebP · 고해상도',
    'menu.preview.empty': '미리보기 없음',
    'menu.model': '깊이 모델',
    'menu.mode': '생성 모드',
    'menu.depthScale': '깊이 강도',
    'menu.meshRes': '메시 해상도',
    'menu.build': '3D 공간 생성',
    'menu.build.space': '3D 공간 생성',
    'menu.build.object': '3D 객체 생성',
    'menu.about': '정보',
    'menu.modelInfo': '모델 정보',
    'menu.settings': '설정',
    'menu.language': '언어',
    'menu.theme': '테마',
    'mode.space': '공간',
    'mode.object': '객체',
    'ctx.savePng': 'PNG로 저장',
    'ctx.saveGlb': 'GLB로 저장',
    'ctx.close': '닫기',
    'lang.ko': '한국어',
    'lang.en': '영어',
    'theme.dark': '다크',
    'theme.light': '라이트',
    'mesh.fast': '빠름 (160)',
    'mesh.normal': '보통 (256)',
    'mesh.sharp': '선명 (384)',
    'mesh.ultra': '매우 선명 (512)',
    'help.title': '조작',
    'help.drag': '드래그 -> 시야',
    'help.walk': 'WASD / ↑↓ -> 걷기',
    'help.turn': 'Q E / ←→ -> 좌우 회전',
    'help.sprint': 'Shift -> 빠르게, Space/Ctrl -> 위·아래',
    'help.zoom': '휠 -> 확대·축소',
    'help.reset': '초기 또는 R / Home -> 시작 위치',
    'help.note': '한 장의 사진으로 방처럼 재구성합니다(바닥·벽·측면 wrap). 가려진 뒷면은 한계가 있습니다. 실내·복도·거리 사진과 Base/Large 모델, 깊이 강도 160~220%가 공간감에 유리합니다.',
    'status.idle': '대기 중',
    'toolbar.zoom': '확대/축소',
    'toolbar.view': '뷰',
    'toolbar.zoomOut': '축소',
    'toolbar.zoomIn': '확대',
    'toolbar.zoomReset': '초기화',
    'toolbar.axes': '축',
    'toolbar.reset': '초기',
    'toolbar.explore': '탐색',
    'tooltip.zoomOut': '축소 (휠 아래 / -)',
    'tooltip.zoomIn': '확대 (휠 위 / +)',
    'tooltip.zoomReset': '배율 100%로 초기화 (0)',
    'tooltip.zoomLabel': '현재 배율',
    'tooltip.axes': 'XYZ 축 표시/숨기기',
    'tooltip.reset': '초기 위치·시야·배율로 되돌리기 (R / Home)',
    'tooltip.explore': '이동(WASD) 켜기/끄기 - 시야는 드래그로 조작',
    'aria.zoomOut': '축소',
    'aria.zoomIn': '확대',
    'aria.zoomReset': '배율 초기화',
    'aria.axes': 'XYZ 축 토글',
    'aria.reset': '초기 위치로 되돌리기',
    'aria.explore': '이동 토글',
    'overlay.ready': '이미지를 선택한 뒤 3D 공간 생성을 누르세요<br /><small>XYZ: X 빨강(좌우) · Y 초록(위) · Z 파랑(안쪽) · 드래그로 시야</small>',
    'dialog.progress.title': '3D 공간 생성 중',
    'dialog.progress.preparing': '준비 중...',
    'dialog.error.title': '오류가 발생했습니다',
    'dialog.error.copy': '복사',
    'dialog.error.ok': '확인',
    'dialog.error.summaryDefault': '알 수 없는 오류입니다.',
    'status.exploringOn': '이동 중 - WASD/방향키 걷기 · 드래그·QE 시야 · Shift 빠르게',
    'status.exploringOff': '이동 꺼짐 - 탐색을 켜면 키보드로 공간을 걸을 수 있습니다.',
    'status.zoomOut': '축소 · 배율 {percent}%',
    'status.zoomIn': '확대 · 배율 {percent}%',
    'status.zoomReset': '배율 100%로 초기화',
    'status.axesOn': 'XYZ 축 표시',
    'status.axesOff': 'XYZ 축 숨김',
    'status.resetOk': '초기 위치·시야로 되돌렸습니다',
    'status.resetNoSpace': '생성된 공간이 없습니다',
    'status.needBuild': '먼저 3D 공간을 생성하세요',
    'status.moveOn': '이동 ON - WASD/방향키로 걸을 수 있습니다',
    'status.moveOff': '이동 OFF - 드래그로 시야만 조작',
    'tier.fast': '빠름',
    'tier.quality': '고품질',
    'tier.balanced': '균형',
    'model.cache.checking': '캐시 상태 확인 중...',
    'model.cache.hit': '로컬 캐시됨 · {bytes} (재다운로드 없음)',
    'model.cache.miss': '아직 캐시 없음 · 처음 생성 시 한 번 다운로드',
    'model.cache.unknown': '캐시 상태를 읽지 못했습니다',
    'model.id': 'ID',
    'status.loadingImage': '이미지 읽는 중...',
    'alt.selectedImage': '선택 이미지',
    'status.imageReady': '이미지 준비됨: {label}',
    'overlay.buildHint': '3D 공간 생성을 누르면 선택한 깊이 모델로 공간을 만듭니다<br /><small>XYZ: X 빨강(좌우) · Y 초록(위) · Z 파랑(사진 안쪽)</small>',
    'overlay.buildHintObject': '3D 공간 생성을 누르면 선택한 모델로 3D 객체를 생성합니다<br /><small>객체 모드는 배경보다 대상이 선명한 이미지에서 유리합니다.</small>',
    'error.openImage': '이미지를 열 수 없습니다',
    'status.imageLoadFail': '이미지 로드 실패',
    'status.modeChangedReady': '생성 모드를 {mode}(으)로 변경했습니다. 다시 생성하면 새 모드가 적용됩니다.',
    'status.modeChangedIdle': '생성 모드: {mode}',
    'status.buildingWithModel': '{model}로 공간을 구성하는 중...',
    'status.start': '처리 시작 - {summary}',
    'dialog.progress.building': '3D 공간 생성 - {model}',
    'status.depthBackground': '{model} - 백그라운드에서 깊이 추정 중...',
    'status.meshBuilding': '공간 메시 생성 중...',
    'status.scenePlacing': '장면 배치 중...',
    'status.done': '완료',
    'hud.model': '사용 모델',
    'status.completed': '완료 - {model}. WASD로 걸어 들어가고, 드래그로 둘러보세요.',
    'status.savedPng': 'PNG 저장 완료: {name}',
    'status.savedGlb': 'GLB 저장 완료: {name}',
    'status.noResultToSave': '저장할 변환 결과가 없습니다',
    'status.saveFailed': '저장에 실패했습니다: {reason}',
    'status.buildFailedOverlay': '생성에 실패했습니다. 아래 오류 내용을 확인해 주세요.',
    'error.buildFailed': '3D 공간 생성 실패',
    'error.unhandled': '처리되지 않은 오류',
    'status.unexpected': '예기치 않은 오류',
    'error.runtime': '런타임 오류',
    'error.script': '스크립트 오류가 발생했습니다.',
    'aria.depthScale': '깊이 강도 {percent}퍼센트',
    'title.depthScale': '깊이 강도 {percent}%',
    'zoom.currentTitle': '현재 배율 {percent}%',
    'zoom.currentAria': '현재 배율 {percent}퍼센트',
    'error.meta.time': '시간',
    'error.meta.where': '위치',
    'error.meta.userAgent': 'UserAgent',
    'error.meta.name': '이름',
    'error.meta.message': '메시지',
    'error.meta.code': '코드',
    'error.meta.cause': '원인(cause)',
    'error.meta.stack': '스택',
    'error.copy.success': '복사됨',
    'error.copy.fail': '복사 실패',
    'about.title': 'About',
    'about.summary': '2D 이미지 한 장으로 탐색 가능한 3D 공간을 생성하는 앱입니다.',
    'about.details': '3D Space Maker\nVersion: 0.1.0\nCopyright (c) 2026 SHKWON (knix008@naver.com)\nAll rights reserved.',
    'about.close': '닫기'
  },
  en: {
    'app.subtitle': '2D image -> explorable 3D space',
    'menu.image.select': 'Select Image',
    'menu.formats': 'JPEG · PNG · GIF · AVIF · WebP · High Resolution',
    'menu.preview.empty': 'No Preview',
    'menu.model': 'Depth Model',
    'menu.mode': 'Generation Mode',
    'menu.depthScale': 'Depth Strength',
    'menu.meshRes': 'Mesh Resolution',
    'menu.build': 'Build 3D Space',
    'menu.build.space': 'Build 3D Space',
    'menu.build.object': 'Build 3D Object',
    'menu.about': 'About',
    'menu.modelInfo': 'Model Info',
    'menu.settings': 'Settings',
    'menu.language': 'Language',
    'menu.theme': 'Theme',
    'mode.space': 'Space',
    'mode.object': 'Object',
    'ctx.savePng': 'Save as PNG',
    'ctx.saveGlb': 'Save as GLB',
    'ctx.close': 'Close',
    'lang.ko': 'Korean',
    'lang.en': 'English',
    'theme.dark': 'Dark',
    'theme.light': 'Light',
    'mesh.fast': 'Fast (160)',
    'mesh.normal': 'Normal (256)',
    'mesh.sharp': 'Sharp (384)',
    'mesh.ultra': 'Ultra (512)',
    'help.title': 'Controls',
    'help.drag': 'Drag -> Look around',
    'help.walk': 'WASD / Up Down -> Walk',
    'help.turn': 'Q E / Left Right -> Turn',
    'help.sprint': 'Shift -> Sprint, Space/Ctrl -> Up Down',
    'help.zoom': 'Wheel -> Zoom',
    'help.reset': 'Reset or R / Home -> Spawn view',
    'help.note': 'This app reconstructs a room-like view from one image. Hidden backfaces have limits. Indoor, hallway, and street photos with Base/Large model and depth 160 to 220 percent usually work better.',
    'status.idle': 'Idle',
    'toolbar.zoom': 'Zoom',
    'toolbar.view': 'View',
    'toolbar.zoomOut': 'Out',
    'toolbar.zoomIn': 'In',
    'toolbar.zoomReset': 'Reset',
    'toolbar.axes': 'Axes',
    'toolbar.reset': 'Home',
    'toolbar.explore': 'Explore',
    'tooltip.zoomOut': 'Zoom out (wheel down / -)',
    'tooltip.zoomIn': 'Zoom in (wheel up / +)',
    'tooltip.zoomReset': 'Reset to 100 percent (0)',
    'tooltip.zoomLabel': 'Current zoom',
    'tooltip.axes': 'Show or hide XYZ axes',
    'tooltip.reset': 'Reset position, view, and zoom (R / Home)',
    'tooltip.explore': 'Toggle movement (WASD) - drag still controls look',
    'aria.zoomOut': 'Zoom out',
    'aria.zoomIn': 'Zoom in',
    'aria.zoomReset': 'Reset zoom',
    'aria.axes': 'Toggle XYZ axes',
    'aria.reset': 'Reset to start view',
    'aria.explore': 'Toggle movement',
    'overlay.ready': 'Select an image, then click Build 3D Space<br /><small>XYZ: X red (left right) · Y green (up) · Z blue (forward) · drag to look</small>',
    'dialog.progress.title': 'Building 3D Space',
    'dialog.progress.preparing': 'Preparing...',
    'dialog.error.title': 'An Error Occurred',
    'dialog.error.copy': 'Copy',
    'dialog.error.ok': 'OK',
    'dialog.error.summaryDefault': 'Unknown error.',
    'status.exploringOn': 'Moving - WASD arrows walk · drag QE look · Shift sprint',
    'status.exploringOff': 'Movement off - turn on Explore to walk with keyboard.',
    'status.zoomOut': 'Zoom out · {percent}%',
    'status.zoomIn': 'Zoom in · {percent}%',
    'status.zoomReset': 'Reset zoom to 100%',
    'status.axesOn': 'XYZ axes shown',
    'status.axesOff': 'XYZ axes hidden',
    'status.resetOk': 'Reset to initial position and view',
    'status.resetNoSpace': 'No generated space yet',
    'status.needBuild': 'Build a 3D space first',
    'status.moveOn': 'Movement ON - walk with WASD arrows',
    'status.moveOff': 'Movement OFF - drag to look only',
    'tier.fast': 'Fast',
    'tier.quality': 'High quality',
    'tier.balanced': 'Balanced',
    'model.cache.checking': 'Checking cache status...',
    'model.cache.hit': 'Cached locally · {bytes} (no re-download)',
    'model.cache.miss': 'No cache yet · first build downloads once',
    'model.cache.unknown': 'Could not read cache status',
    'model.id': 'ID',
    'status.loadingImage': 'Reading image...',
    'alt.selectedImage': 'Selected image',
    'status.imageReady': 'Image ready: {label}',
    'overlay.buildHint': 'Click Build 3D Space to generate with the selected depth model<br /><small>XYZ: X red (left right) · Y green (up) · Z blue (into photo)</small>',
    'overlay.buildHintObject': 'Click Build 3D Space to generate a 3D object with the selected model<br /><small>Object mode works better when the subject is clear against the background.</small>',
    'error.openImage': 'Cannot open image',
    'status.imageLoadFail': 'Failed to load image',
    'status.modeChangedReady': 'Generation mode changed to {mode}. Rebuild to apply the new mode.',
    'status.modeChangedIdle': 'Generation mode: {mode}',
    'status.buildingWithModel': 'Building space with {model}...',
    'status.start': 'Started - {summary}',
    'dialog.progress.building': 'Build 3D Space - {model}',
    'status.depthBackground': '{model} - estimating depth in background...',
    'status.meshBuilding': 'Building space mesh...',
    'status.scenePlacing': 'Placing scene...',
    'status.done': 'Done',
    'hud.model': 'Model used',
    'status.completed': 'Done - {model}. Walk with WASD and look around by dragging.',
    'status.savedPng': 'Saved PNG: {name}',
    'status.savedGlb': 'Saved GLB: {name}',
    'status.noResultToSave': 'No converted result to save',
    'status.saveFailed': 'Save failed: {reason}',
    'status.buildFailedOverlay': 'Generation failed. Check the error details below.',
    'error.buildFailed': '3D space build failed',
    'error.unhandled': 'Unhandled error',
    'status.unexpected': 'Unexpected error',
    'error.runtime': 'Runtime error',
    'error.script': 'A script error occurred.',
    'aria.depthScale': 'Depth strength {percent} percent',
    'title.depthScale': 'Depth strength {percent}%',
    'zoom.currentTitle': 'Current zoom {percent}%',
    'zoom.currentAria': 'Current zoom {percent} percent',
    'error.meta.time': 'Time',
    'error.meta.where': 'Location',
    'error.meta.userAgent': 'UserAgent',
    'error.meta.name': 'Name',
    'error.meta.message': 'Message',
    'error.meta.code': 'Code',
    'error.meta.cause': 'Cause',
    'error.meta.stack': 'Stack',
    'error.copy.success': 'Copied',
    'error.copy.fail': 'Copy failed',
    'about.title': 'About',
    'about.summary': 'This app reconstructs an explorable 3D space from a single 2D image.',
    'about.details': '3D Space Maker\nVersion: 0.1.0\nCopyright (c) 2026 SHKWON (knix008@naver.com)\nAll rights reserved.',
    'about.close': 'Close'
  }
}

function normalizeLang(value) {
  const lower = String(value || '').toLowerCase()
  if (SUPPORTED_LANGS.has(lower)) return lower
  if (lower.startsWith('en')) return 'en'
  return 'ko'
}

function normalizeTheme(value) {
  const lower = String(value || '').toLowerCase()
  if (SUPPORTED_THEMES.has(lower)) return lower
  return 'dark'
}

function template(text, params) {
  return String(text).replace(/\{(\w+)\}/g, (_, key) => {
    if (params && params[key] != null) return String(params[key])
    return `{${key}}`
  })
}

export function t(key, params) {
  const dict = MESSAGES[currentLang] || MESSAGES.ko
  const fallback = MESSAGES.ko[key] || key
  const message = dict[key] || fallback
  return template(message, params)
}

export function getLanguage() {
  return currentLang
}

export function setLanguage(lang) {
  const next = normalizeLang(lang)
  if (next === currentLang) {
    applyDocumentTranslations()
    return
  }
  currentLang = next
  localStorage.setItem(LANG_STORAGE_KEY, currentLang)
  applyDocumentTranslations()
  for (const fn of listeners) fn(currentLang)
}

export function onLanguageChange(handler) {
  listeners.add(handler)
  return () => listeners.delete(handler)
}

export function getTheme() {
  return currentTheme
}

export function setTheme(theme) {
  currentTheme = normalizeTheme(theme)
  localStorage.setItem(THEME_STORAGE_KEY, currentTheme)
  document.documentElement.setAttribute('data-theme', currentTheme)
}

export function initUiPreferences() {
  const savedLang = localStorage.getItem(LANG_STORAGE_KEY)
  const browserLang = typeof navigator !== 'undefined' ? navigator.language : 'ko'
  currentLang = normalizeLang(savedLang || browserLang)
  document.documentElement.lang = currentLang

  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY)
  if (savedTheme) {
    currentTheme = normalizeTheme(savedTheme)
  } else {
    const prefersLight =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: light)').matches
    currentTheme = prefersLight ? 'light' : 'dark'
  }
  document.documentElement.setAttribute('data-theme', currentTheme)

  applyDocumentTranslations()
}

export function applyDocumentTranslations(root = document) {
  if (!root) return
  document.documentElement.lang = currentLang

  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n')
    if (!key) return
    el.textContent = t(key)
  })

  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const key = el.getAttribute('data-i18n-html')
    if (!key) return
    el.innerHTML = t(key)
  })

  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title')
    if (!key) return
    const value = t(key)
    el.setAttribute('title', value)
    if (el.hasAttribute('data-tooltip')) {
      el.setAttribute('data-tooltip', value)
    }
  })

  root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    const key = el.getAttribute('data-i18n-aria-label')
    if (!key) return
    el.setAttribute('aria-label', t(key))
  })
}
