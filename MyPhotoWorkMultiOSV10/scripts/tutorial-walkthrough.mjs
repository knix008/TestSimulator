// The hands-on part of the tutorial: real edits on the sample "빨간 비키니의 금발 여성 /
// Blonde woman in a red bikini" (sample id 'swimsuit'), driven in the web app over CDP.
// scripts/tutorial-shots.mjs photographs every step for doc/Tutorial*.md, and
// scripts/tutorial-video.mjs records them as the video's hands-on chapter.
//
// Every step is something a user does through a menu, a tool or a window. Where a
// window's sliders would need a long chain of synthetic input, the window's own result
// (the values a user would set, then Apply) is handed to the app through window.__mpw.
import { sleep } from './cdp.mjs'

export const SAMPLE_ID = 'swimsuit'

/** The crop the tutorial makes: a tighter portrait without the cables at the bottom right. */
export const CROP = { x: 150, y: 250, width: 820, height: 1240 }
/** Points on the sample, in the cropped picture's pixels. */
/** The bundle of black cables on the grey stage floor, bottom right, retouched away. */
const CABLES = { left: 760 - CROP.x, right: 925 - CROP.x, top: 1360 - CROP.y, bottom: 1440 - CROP.y }

/** Helpers bound to one page. */
export function helpers(page) {
  const js = (expression) => page.evaluate(expression)
  const state = async () => JSON.parse(await js("JSON.stringify((() => { const s = window.__mpw.state(); return { pan: s.pan, zoom: s.settings.zoom, tool: s.tool, layers: s.doc.layers.map((l) => ({ id: l.id, name: l.name, visible: l.visible, kind: l.kind })), active: s.doc.activeLayerId, width: s.doc.width, height: s.doc.height, selection: Boolean(s.selection) } })())"))
  /** Picture pixel → page pixel. */
  const toScreen = async (x, y) => JSON.parse(await js(`JSON.stringify((() => { const s = window.__mpw.state(); const r = document.querySelector('.canvas-stage').getBoundingClientRect(); return [r.left + s.pan.x + ${x} * s.settings.zoom, r.top + s.pan.y + ${y} * s.settings.zoom] })())`))
  const mouse = (type, x, y, buttons = 1) => page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 })
  const click = async (x, y) => { await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y, 0) }
  /** A drag through picture points, as a stroke with the current tool. */
  const stroke = async (points) => {
    const screen = []
    for (const point of points) screen.push(await toScreen(point.x, point.y))
    await mouse('mousePressed', screen[0][0], screen[0][1])
    for (let i = 1; i < screen.length; i += 1) {
      const [ax, ay] = screen[i - 1]
      const [bx, by] = screen[i]
      for (let t = 0.2; t <= 1.001; t += 0.2) { await mouse('mouseMoved', ax + (bx - ax) * t, ay + (by - ay) * t); await sleep(16) }
    }
    const [lx, ly] = screen[screen.length - 1]
    await mouse('mouseReleased', lx, ly, 0)
  }
  const run = (id) => js(`window.__mpw.run(${JSON.stringify(id)})`)
  const apply = (name, result) => js(`window.__mpw.dialog(${JSON.stringify(name)}, ${JSON.stringify({ action: 'apply', ...result })})`)
  const open = (name) => js(`window.__mpw.openDialog(${JSON.stringify(name)})`)
  const closeDialogs = async () => {
    await js('window.__mpw.closeDialogs?.()')
    for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await sleep(200)
  }
  const settings = (patch) => js(`window.__mpw.setSettings(${JSON.stringify(patch)})`)
  const tool = (id) => js(`window.__mpw.tool(${JSON.stringify(id)})`)
  const fit = async () => { await run('view.zoomFit'); await sleep(300) }
  /** The colour of a picture pixel on the active layer, as #rrggbb. */
  const pixel = (x, y) => js(`(() => { const c = window.__mpw.layerCanvas(); const d = c.getContext('2d').getImageData(${Math.round(x)}, ${Math.round(y)}, 1, 1).data; return '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('') })()`)
  /** The bikini's red: the average of the strongly red pixels on the active layer. */
  const reddest = () => js(`(() => { const c = window.__mpw.layerCanvas(); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i < d.length; i += 16) { if (d[i] > 170 && d[i + 1] < 90 && d[i + 2] < 90) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n += 1 } } if (!n) return '#d92b2b'; return '#' + [r / n, g / n, b / n].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('') })()`)
  return { js, state, toScreen, mouse, click, stroke, run, apply, open, closeDialogs, settings, tool, fit, pixel, reddest }
}

/** Answers the launch prompts (tutorial question, model setup) with Later. */
export async function dismissLaunchPrompts(page) {
  for (let i = 0; i < 3; i += 1) {
    await page.evaluate("document.querySelector('[data-action=tutorial-later]')?.click(); for (const b of document.querySelectorAll('.dialog button')) if (/^(나중에|Later)$/.test(b.textContent.trim())) b.click()")
    await sleep(400)
  }
  await helpers(page).closeDialogs()
}

/** Opens the sample from the start screen tile, as a user would. */
export async function openSample(page) {
  const h = helpers(page)
  await h.js('window.__mpw.showStart()')
  await sleep(600)
  const index = await h.js(`[...document.querySelectorAll('.sample-tile')].findIndex((tile) => tile.dataset.sample === ${JSON.stringify(SAMPLE_ID)})`)
  if (index < 0) throw new Error('the swimsuit sample tile is missing')
  await h.js(`document.querySelectorAll('.sample-tile')[${index}].click()`)
  await page.until("window.__mpw.state().doc.layers.length > 0 && !document.querySelector('.start-screen')", 20000)
  await sleep(1200)
  await h.fit()
}

/**
 * The hands-on edits, in order. `act` performs the step and leaves the screen showing its
 * result (or, for `window`, the window a user would open).
 */
export const HANDS_ON = [
  {
    id: 'duplicate',
    title: { ko: '원본 레이어 복제', en: 'Duplicate the original layer' },
    async act(page) {
      const h = helpers(page)
      await h.settings({ rightTab: 'layers', rightCollapsed: false })
      await h.run('layer.duplicate')
      await sleep(500)
    },
  },
  {
    id: 'crop',
    title: { ko: '세로 구도로 자르기', en: 'Crop to a portrait' },
    async act(page) {
      const h = helpers(page)
      await h.js(`window.__mpw.select(${JSON.stringify({ x: CROP.x, y: CROP.y, width: CROP.width, height: CROP.height })})`)
      await sleep(500)
      await h.run('image.crop')
      await sleep(600)
      await h.fit()
    },
  },
  {
    id: 'exposure',
    title: { ko: '밝기와 대비 맞추기', en: 'Fix brightness and contrast' },
    async act(page) {
      const h = helpers(page)
      await h.apply('brightness', { brightness: 12, contrast: 18 })
      await sleep(500)
    },
  },
  {
    id: 'recolor',
    title: { ko: '비키니 색을 파랑으로 바꾸기', en: 'Turn the bikini blue' },
    async act(page) {
      const h = helpers(page)
      // Eyedropper: the bikini's red becomes the foreground colour. Color Range selects
      // everything of that colour, and Hue/Saturation turns it blue, keeping the shading.
      // Twice: the second pass picks up the red left in the folds and highlights.
      for (let pass = 0; pass < 2; pass += 1) {
        await h.settings({ foreground: await h.reddest() })
        await sleep(400)
        await h.apply('colorRange', { tolerance: 42 })
        await page.until('Boolean(window.__mpw.state().selection)', 10000)
        await sleep(300)
        await h.apply('hue', { hue: -135, saturation: 5, lightness: 0 })
        await sleep(500)
        await h.run('select.none')
        await sleep(300)
      }
    },
  },
  {
    id: 'blur',
    title: { ko: '배경 흐리게 하기', en: 'Blur the background' },
    async act(page) {
      const h = helpers(page)
      await h.run('select.subject')
      await page.until('Boolean(window.__mpw.state().selection)', 60000)
      await sleep(400)
      await h.run('select.invert')
      await sleep(300)
      await h.apply('blur', { radius: 7 })
      await sleep(600)
      await h.run('select.none')
      await sleep(300)
    },
  },
  {
    id: 'heal',
    title: { ko: '바닥의 전선 지우기 (제거 도구)', en: 'Remove the cables on the floor (Remove tool)' },
    async act(page) {
      const h = helpers(page)
      // A rectangle around the cables, then one click inside it with the Remove tool.
      const area = { x: CABLES.left, y: CABLES.top, width: CABLES.right - CABLES.left, height: CABLES.bottom - CABLES.top }
      await h.js(`window.__mpw.select(${JSON.stringify(area)})`)
      await sleep(300)
      await h.tool('remove')
      await sleep(200)
      const [x, y] = await h.toScreen((CABLES.left + CABLES.right) / 2, (CABLES.top + CABLES.bottom) / 2)
      await h.click(x, y)
      await sleep(4000)
      await h.run('select.none')
      await sleep(300)
      await h.tool('move')
    },
  },
  {
    id: 'vignette',
    title: { ko: '비네팅으로 가장자리 어둡게', en: 'Darken the edges with a vignette' },
    async act(page) {
      const h = helpers(page)
      await h.apply('lensCorrection', { distortion: 0, vignette: -70, fringe: 0 })
      await sleep(600)
    },
  },
  {
    id: 'title',
    title: { ko: '제목 글자 넣기', en: 'Add a title' },
    async act(page) {
      const h = helpers(page)
      const s = await h.state()
      await h.settings({ foreground: '#ffffff' })
      await h.tool('text')
      await sleep(200)
      const [x, y] = await h.toScreen(s.width * 0.08, s.height * 0.05)
      await h.click(x, y)
      await sleep(500)
      await h.closeDialogs()
      await h.apply('text', { text: 'SUMMER', fontSize: Math.round(s.width / 6), bold: true })
      await sleep(600)
      await h.tool('move')
    },
  },
  {
    id: 'compare',
    title: { ko: '전후 비교 (레이어 숨기기)', en: 'Before and after (hide a layer)' },
    async act(page) {
      const h = helpers(page)
      // The edited copy is hidden: what shows is the original underneath.
      const s = await h.state()
      const copy = s.layers.find((layer) => layer.kind !== 'text' && layer.id !== s.layers[0].id)
      await h.js(`document.querySelector('[data-layer-id="${copy?.id ?? ''}"] button')?.click()`)
      await sleep(500)
    },
    async undo(page) {
      const h = helpers(page)
      const s = await h.state()
      const copy = s.layers.find((layer) => layer.kind !== 'text' && layer.id !== s.layers[0].id)
      await h.js(`document.querySelector('[data-layer-id="${copy?.id ?? ''}"] button')?.click()`)
      await sleep(400)
    },
  },
  {
    id: 'export',
    title: { ko: 'JPEG·PNG로 내보내기', en: 'Export as JPEG or PNG' },
    async act(page) {
      const h = helpers(page)
      await h.open('exportAs')
      await sleep(900)
    },
    async undo(page) {
      await helpers(page).closeDialogs()
    },
  },
]
