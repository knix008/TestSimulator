// My Photo Work: how the user guide behaves.
//
//   - font, text size and language at the top, kept between visits
//   - colours: the app's theme. The app leaves them in localStorage (src/host/userGuide.ts)
//     and the storage event brings any change while the guide is open
//   - left: the contents, built from the headings of the language on screen; a click
//     jumps there, and scrolling marks where you are
//   - on the desktop the header is the title bar, with the window buttons and a grip
(function () {
  'use strict'
  const body = document.body
  const root = document.documentElement
  const side = document.getElementById('side')
  const content = document.getElementById('content')
  const tauri = window.__TAURI__ || null
  const APPEARANCE_KEY = 'mpw-doc-appearance'
  const SIZE_KEY = 'mpw-doc-size'
  const LANG_KEY = 'mpw-doc-lang'
  const FONT_KEY = 'mpw-doc-font'
  const SIZE_MIN = 11
  const SIZE_MAX = 24
  const SIZE_DEFAULT = 15

  const store = {
    get(key) { try { return localStorage.getItem(key) } catch { return null } },
    set(key, value) { try { localStorage.setItem(key, value) } catch { /* private mode */ } },
  }

  const TEXT = {
    ko: { title: 'My Photo Work 사용자 설명서', smaller: '글자 작게', larger: '글자 크게', size: '글자 크기', font: '글꼴', fontDefault: '기본 글꼴', min: '최소화', max: '최대화 / 이전 크기', close: '닫기', grip: '끌어서 창 크기 조절' },
    en: { title: 'My Photo Work User Guide', smaller: 'Smaller text', larger: 'Larger text', size: 'Text size', font: 'Font', fontDefault: 'Default font', min: 'Minimize', max: 'Maximize / restore', close: 'Close', grip: 'Drag to resize the window' },
  }

  /* ----------------------------------------------------------------- theme */
  function applyAppearance(look) {
    if (!look) return
    if (look.vars) for (const [key, value] of Object.entries(look.vars)) root.style.setProperty(key, value)
    if (look.mode) root.style.colorScheme = look.mode
  }
  let look = null
  try { look = JSON.parse(store.get(APPEARANCE_KEY) || 'null') } catch { look = null }

  /* -------------------------------------------------------------- language */
  const params = new URLSearchParams(location.search)
  let language = params.get('lang') === 'en' || params.get('lang') === 'ko' ? params.get('lang')
    : store.get(LANG_KEY) || (look && look.language) || 'ko'

  /* ----------------------------------------------------------------- fonts */
  const FONTS = [
    ['', ''],
    ['Malgun Gothic', '"Malgun Gothic"'],
    ['Noto Sans KR', '"Noto Sans KR"'],
    ['NanumGothic', '"NanumGothic", "Nanum Gothic"'],
    ['Apple SD Gothic Neo', '"Apple SD Gothic Neo"'],
    ['Segoe UI', '"Segoe UI"'],
    ['Arial', 'Arial'],
    ['Verdana', 'Verdana'],
    ['Batang', 'Batang, "바탕"'],
    ['Gungsuh', 'Gungsuh, "궁서"'],
    ['Georgia', 'Georgia'],
    ['Times New Roman', '"Times New Roman"'],
    ['Consolas', 'Consolas'],
  ]
  /** A font the system lacks draws in the fallback at the fallback's width. */
  function installed(family) {
    if (!family) return true
    const context = document.createElement('canvas').getContext('2d')
    const sample = 'Photo Work 사진 편집 mmmwwwiii'
    return ['serif', 'monospace'].some((fallback) => {
      context.font = `32px ${fallback}`
      const plain = context.measureText(sample).width
      context.font = `32px ${family}, ${fallback}`
      return context.measureText(sample).width !== plain
    })
  }
  const available = FONTS.filter(([, family]) => installed(family))
  const fontButton = document.getElementById('font-button')
  const fontList = document.getElementById('font-list')
  const fontNow = document.getElementById('font-now')
  let font = store.get(FONT_KEY) || ''
  if (!available.some(([name]) => name === font)) font = ''

  function applyFont() {
    const entry = available.find(([name]) => name === font)
    if (entry && entry[1]) root.style.setProperty('--doc-font', `${entry[1]}, sans-serif`)
    else root.style.removeProperty('--doc-font')
    fontNow.textContent = font || TEXT[language].fontDefault
    for (const row of fontList.children) row.setAttribute('aria-selected', String(row.dataset.font === font))
  }
  function buildFontList() {
    fontList.replaceChildren(...available.map(([name, family]) => {
      const row = document.createElement('button')
      row.type = 'button'
      row.setAttribute('role', 'option')
      row.dataset.font = name
      row.textContent = name || TEXT[language].fontDefault
      if (family) row.style.fontFamily = family
      row.addEventListener('click', () => {
        font = name
        store.set(FONT_KEY, font)
        applyFont()
        showFontList(false)
      })
      return row
    }))
  }
  function showFontList(show) {
    fontList.hidden = !show
    fontButton.setAttribute('aria-expanded', String(show))
  }
  fontButton.addEventListener('click', () => showFontList(fontList.hidden))
  document.addEventListener('mousedown', (event) => {
    if (!event.target.closest('.font-pick')) showFontList(false)
  })

  /* ------------------------------------------------------------- text size */
  const sizeDown = document.getElementById('size-down')
  const sizeUp = document.getElementById('size-up')
  const sizeNow = document.getElementById('size-now')
  let size = Number(store.get(SIZE_KEY)) || SIZE_DEFAULT
  if (!(size >= SIZE_MIN && size <= SIZE_MAX)) size = SIZE_DEFAULT
  function applySize() {
    root.style.setProperty('--doc-size', `${size}px`)
    sizeNow.textContent = `${size}px`
    sizeDown.disabled = size <= SIZE_MIN
    sizeUp.disabled = size >= SIZE_MAX
  }
  sizeDown.addEventListener('click', () => { size = Math.max(SIZE_MIN, size - 1); store.set(SIZE_KEY, String(size)); applySize() })
  sizeUp.addEventListener('click', () => { size = Math.min(SIZE_MAX, size + 1); store.set(SIZE_KEY, String(size)); applySize() })

  /* -------------------------------------------------------------- contents */
  let entries = []
  function link(target, text) {
    const anchor = document.createElement('a')
    anchor.href = `#${target.id}`
    anchor.textContent = text
    anchor.addEventListener('click', (event) => {
      event.preventDefault()
      target.scrollIntoView({ block: 'start' })
      history.replaceState(null, '', `${location.search}#${target.id}`)
    })
    entries.push({ element: target, link: anchor })
    return anchor
  }
  function buildSide() {
    entries = []
    const article = document.querySelector(`article.${language}`)
    const list = document.createElement('ol')
    for (const section of article.querySelectorAll(':scope > section')) {
      if (!section.id.startsWith(language)) section.id = `${language}-${section.id}`
      const item = document.createElement('li')
      item.appendChild(link(section, section.querySelector('h2').textContent))
      const subs = [...section.querySelectorAll(':scope > h3')]
      if (subs.length) {
        const nested = document.createElement('ol')
        subs.forEach((heading, index) => {
          if (!heading.id) heading.id = `${section.id}-${index + 1}`
          const row = document.createElement('li')
          row.appendChild(link(heading, heading.textContent))
          nested.appendChild(row)
        })
        item.appendChild(nested)
      }
      list.appendChild(item)
    }
    side.replaceChildren(list)
    spy()
  }
  // The entry of the heading nearest above the top of the content marks the place.
  function spy() {
    const top = content.getBoundingClientRect().top + 24
    let current = entries[0]
    for (const entry of entries) if (entry.element.getBoundingClientRect().top <= top) current = entry
    for (const entry of entries) entry.link.classList.toggle('on', entry === current)
    if (current) {
      const box = current.link.getBoundingClientRect()
      const bounds = side.getBoundingClientRect()
      if (box.top < bounds.top || box.bottom > bounds.bottom) current.link.scrollIntoView({ block: 'nearest' })
    }
  }
  content.addEventListener('scroll', () => requestAnimationFrame(spy), { passive: true })

  /* ------------------------------------------------------- language switch */
  function setLanguage(next) {
    if (next !== 'ko' && next !== 'en') return
    language = next
    store.set(LANG_KEY, language)
    body.classList.remove('ko', 'en')
    body.classList.add(language)
    root.lang = language
    const text = TEXT[language]
    document.title = text.title
    sizeDown.title = text.smaller
    sizeUp.title = text.larger
    sizeNow.title = text.size
    fontButton.title = text.font
    sizeDown.setAttribute('aria-label', text.smaller)
    sizeUp.setAttribute('aria-label', text.larger)
    fontButton.setAttribute('aria-label', text.font)
    for (const [id, key] of [['win-min', 'min'], ['win-max', 'max'], ['win-close', 'close'], ['grip', 'grip']]) {
      const element = document.getElementById(id)
      element.title = text[key]
      element.setAttribute('aria-label', text[key])
    }
    for (const button of document.querySelectorAll('.lang-group button')) button.classList.toggle('on', button.dataset.lang === language)
    buildFontList()
    applyFont()
    buildSide()
  }
  for (const button of document.querySelectorAll('.lang-group button')) button.addEventListener('click', () => setLanguage(button.dataset.lang))

  /* ------------------------------------------------------- follow the app */
  window.addEventListener('storage', (event) => {
    if (event.key !== APPEARANCE_KEY || !event.newValue) return
    try {
      const next = JSON.parse(event.newValue)
      applyAppearance(next)
      if (next.language && next.language !== (look && look.language)) setLanguage(next.language)
      look = next
    } catch { /* not ours */ }
  })

  /* ---------------------------------------------------------- desktop window */
  if (tauri && tauri.window) {
    body.classList.add('desktop')
    const win = tauri.window.getCurrentWindow()
    document.getElementById('win-min').addEventListener('click', () => win.minimize())
    document.getElementById('win-max').addEventListener('click', () => win.toggleMaximize())
    document.getElementById('win-close').addEventListener('click', () => win.close())
    document.querySelector('.doc-head').addEventListener('mousedown', (event) => {
      if (event.button !== 0 || event.target.closest('button, a, output, .font-list')) return
      if (event.detail === 2) win.toggleMaximize()
      else win.startDragging()
    })
    document.getElementById('grip').addEventListener('mousedown', (event) => {
      if (event.button !== 0) return
      event.preventDefault()
      win.startResizeDragging('SouthEast')
    })
  }

  applyAppearance(look)
  applySize()
  setLanguage(language)
  body.classList.add('ready')
}())
