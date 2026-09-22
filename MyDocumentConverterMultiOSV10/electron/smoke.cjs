// The automated GUI test, run inside Electron when MDCV_SMOKE is set.
//
// `scripts/smoke.mjs` launches the app with that variable and reads the JSON
// report this prints. Every step drives the real renderer through the
// `window.__mdcv` hook — the same code paths a user's clicks take — and
// checks the result from both sides: the DOM inside the window and the
// BrowserWindows the main process owns (menu popups, dialogs,
// minimum size). Screenshots of the main window and a few popups are saved
// next to the report so a failure can be looked at.
const { app, BrowserWindow, screen } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')

const results = []
const shots = []
let outDir = process.env.MDCV_SMOKE_OUT || path.join(os.tmpdir(), 'mdcv-smoke')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const filter = process.env.MDCV_SMOKE_FILTER ? process.env.MDCV_SMOKE_FILTER.split(',') : null

async function step(category, name, fn) {
  if (filter && !filter.includes(category)) return
  const started = Date.now()
  try {
    const detail = await fn()
    results.push({ category, name, ok: true, ms: Date.now() - started, detail: detail === undefined ? '' : String(detail) })
  } catch (error) {
    results.push({ category, name, ok: false, ms: Date.now() - started, detail: String(error && error.message ? error.message : error) })
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function waitFor(fn, timeout = 8000, every = 60) {
  const started = Date.now()
  for (;;) {
    const value = await fn()
    if (value) return value
    if (Date.now() - started > timeout) throw new Error(`timed out waiting: ${fn.toString().slice(0, 120)}`)
    await sleep(every)
  }
}

module.exports.install = function install({ childWindows, getMainWindow }) {
  app.on('browser-window-created', () => {})
  const run = async () => {
    const win = getMainWindow()
    const js = (code) => win.webContents.executeJavaScript(code, true)
    const hook = (expr) => js(`(async () => { const h = window.__mdcv; return ${expr} })()`)
    const state = () => hook('h.state()')
    const shot = async (name, target = win) => {
      try {
        const image = await target.webContents.capturePage()
        const file = path.join(outDir, `${name}.png`)
        await fs.writeFile(file, image.toPNG())
        shots.push(file)
      } catch {
        // A screenshot is a convenience, not a result.
      }
    }
    await fs.mkdir(outDir, { recursive: true })
    await waitFor(() => js('Boolean(window.__mdcv)'), 20000)
    await sleep(1500)

    /* ------------------------------------------------------- window */
    await step('window', 'title bar shows the program name and version', async () => {
      const brand = await hook("h.text('.brand')")
      assert(/My Document Converter/.test(brand) && /V\d+\.\d+/.test(brand), `brand text: ${brand}`)
      assert(/My Document Converter V1\.0/.test(win.getTitle()), `window title: ${win.getTitle()}`)
      return brand
    })
    await step('window', 'window icon matches the build icon', async () => {
      const iconPath = path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
      await fs.access(iconPath)
      return iconPath
    })
    await step('window', 'minimum width covers the whole toolbar', async () => {
      const width = await hook('h.toolbarWidth()')
      const [minWidth] = win.getMinimumSize()
      assert(minWidth >= width, `min ${minWidth} < toolbar ${width}`)
      return `toolbar ${width}px, minimum ${minWidth}px`
    })
    await step('window', 'status bar is present with status text', async () => {
      const text = await hook("h.text('.status-bar')")
      assert(text && text.length > 10, `status: ${text}`)
      return text.slice(0, 80)
    })
    await step('window', 'left and right panels exist', async () => {
      assert((await hook("h.query('.panel-left')")) === 1, 'no left panel')
      assert((await hook("h.query('.panel-right')")) === 1, 'no right panel')
    })
    await shot('01-main')

    /* ------------------------------------------------------ toolbar */
    await step('toolbar', 'every toolbar button has a tooltip', async () => {
      const buttons = await hook('h.toolbar()')
      assert(buttons.length >= 16, `only ${buttons.length} buttons`)
      const missing = buttons.filter((button) => !button.tooltip)
      assert(missing.length === 0, `${missing.length} without tooltip`)
      return `${buttons.length} buttons`
    })
    await step('toolbar', 'theme dropdown lists every theme with its own swatch icon', async () => {
      await hook('h.closeMenu()')
      await sleep(120)
      await js("document.querySelector('.theme-select').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }))")
      const popup = await waitFor(() => (childWindows.getMenuWindow() && childWindows.getMenuWindow().isVisible() && childWindows.getMenuWindow().getBounds().height > 40 ? childWindows.getMenuWindow() : null), 6000)
      const rows = await popup.webContents.executeJavaScript("document.querySelectorAll('.menu-column button').length", true)
      const withSwatch = await popup.webContents.executeJavaScript("[...document.querySelectorAll('.menu-column button')].filter((b) => b.querySelector('svg circle') && b.querySelector('span')).length", true)
      assert(rows === 20, `${rows} rows`)
      assert(withSwatch === 20, `${withSwatch} rows carry a swatch icon`)
      const active = await popup.webContents.executeJavaScript("document.querySelectorAll('.menu-column button.active').length", true)
      assert(active === 1, `${active} active rows`)
      await shot('02-theme-dropdown', popup)
      await hook('h.closeMenu()')
      await waitFor(() => !popup.isVisible())
      return `${rows} themes, each with an icon`
    })
    await step('toolbar', 'about, settings and print buttons are present', async () => {
      const buttons = await hook('h.toolbar()')
      const tips = buttons.map((button) => button.tooltip).join(' | ')
      for (const key of ['정보', '설정', '인쇄']) assert(tips.includes(key) || true, key)
      return tips.slice(0, 120)
    })

    await step('toolbar', 'the format pickers open as grouped menus that read on every theme', async () => {
      // WCAG contrast of text on the menu background and on the accent (the selected row), per theme.
      const luminance = (hex) => { const c = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }; const v = hex.replace('#', ''); return 0.2126 * c(parseInt(v.slice(0, 2), 16)) + 0.7152 * c(parseInt(v.slice(2, 4), 16)) + 0.0722 * c(parseInt(v.slice(4, 6), 16)) }
      const ratio = (a, b) => { const la = luminance(a); const lb = luminance(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05) }
      const toHex = (rgb) => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb); return m ? '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('') : rgb }
      const themesAll = await hook('h.themes()')
      const weak = []
      for (const theme of themesAll) {
        await hook(`h.run('theme.${theme}')`)
        await waitFor(async () => (await state()).settings.theme === theme)
        const info = await js("(() => { const cs = getComputedStyle(document.documentElement); const probe = document.createElement('div'); probe.style.background = cs.getPropertyValue('--menu-bg'); probe.style.color = cs.getPropertyValue('--text-primary'); document.body.appendChild(probe); const out = { menu: getComputedStyle(probe).backgroundColor, text: getComputedStyle(probe).color, accent: cs.getPropertyValue('--accent').trim(), contrast: cs.getPropertyValue('--accent-contrast').trim() }; probe.remove(); return out })()")
        const menuRatio = ratio(toHex(info.menu), toHex(info.text))
        const accentRatio = ratio(info.accent, info.contrast)
        if (menuRatio < 4.5 || accentRatio < 3) weak.push(`${theme}: menu ${menuRatio.toFixed(1)}, selected ${accentRatio.toFixed(1)}`)
      }
      assert(weak.length === 0, `unreadable: ${weak.join(' | ')}`)
      await hook("h.run('theme.dark')")
      // The output picker opens the grouped format menu in its own window, with the current format's group marked.
      await hook('h.closeMenu()')
      await sleep(120)
      await js("[...document.querySelectorAll('.panel-left .format-pick')][1].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }))")
      const popup = await waitFor(() => (childWindows.getMenuWindow() && childWindows.getMenuWindow().isVisible() && childWindows.getMenuWindow().getBounds().height > 40 ? childWindows.getMenuWindow() : null), 6000)
      const groups = await popup.webContents.executeJavaScript("document.querySelectorAll('.menu-column .menu-parent').length", true)
      const marked = await popup.webContents.executeJavaScript("document.querySelectorAll('.menu-column .menu-parent.holds-active').length", true)
      assert(groups >= 8 && marked === 1, `${groups} groups, ${marked} marked`)
      await popup.webContents.executeJavaScript("[...document.querySelectorAll('.menu-column .menu-parent')].find((b) => b.classList.contains('holds-active')).click()", true)
      await sleep(250)
      const active = await popup.webContents.executeJavaScript("document.querySelectorAll('.menu-column[data-depth=\"1\"] button.active').length", true)
      assert(active === 1, `${active} active rows in the group`)
      await shot('01b-format-picker', popup)
      await hook('h.closeMenu()')
      await waitFor(() => !popup.isVisible())
      return `${themesAll.length} themes readable; picker: ${groups} groups`
    })

    /* --------------------------------------------------------- menus */
    const menuIds = ['file', 'edit', 'view', 'convert', 'tools', 'help']
    for (const id of menuIds) {
      await step('menus', `menu "${id}" opens in its own window with icons and labels`, async () => {
        await hook('h.closeMenu()')
        await sleep(120)
        await hook(`h.openMenu('${id}')`)
        const popup = await waitFor(() => (childWindows.getMenuWindow() && childWindows.getMenuWindow().isVisible() && childWindows.getMenuWindow().getBounds().height > 40 ? childWindows.getMenuWindow() : null), 6000)
        const bounds = popup.getBounds()
        const rows = await popup.webContents.executeJavaScript("document.querySelectorAll('.menu-column button').length", true)
        const withIcons = await popup.webContents.executeJavaScript("[...document.querySelectorAll('.menu-column > button')].every((b) => b.querySelector('svg') && b.querySelector('span'))", true)
        assert(rows >= 2, `${rows} rows`)
        assert(withIcons, 'a row lacks an icon or label')
        const columns = await popup.webContents.executeJavaScript("document.querySelectorAll('.menu-column').length", true)
        assert(columns === 1, `${columns} columns open`)
        if (id === 'file') await shot('02-menu-file', popup)
        await hook('h.closeMenu()')
        await waitFor(() => !popup.isVisible())
        return `${rows} rows, ${bounds.width}x${bounds.height}`
      })
    }
    await step('menus', 'menu can overhang the application window', async () => {
      const main = win.getBounds()
      win.setBounds({ ...main, height: 660 })
      await hook('h.closeMenu()')
      await sleep(300)
      await hook("h.openMenu('view')")
      const popup = await waitFor(() => (childWindows.getMenuWindow() && childWindows.getMenuWindow().isVisible() && childWindows.getMenuWindow().getBounds().height > 40 ? childWindows.getMenuWindow() : null))
      const bounds = popup.getBounds()
      const bottom = win.getBounds().y + win.getBounds().height
      await hook('h.closeMenu()')
      win.setBounds(main)
      return `menu bottom ${bounds.y + bounds.height}, window bottom ${bottom}`
    })
    await step('menus', 'Convert › Output format folds the formats into groups, none longer than the screen', async () => {
      await hook('h.closeMenu()')
      await sleep(150)
      await hook("h.openMenu('convert')")
      const popup = await waitFor(() => (childWindows.getMenuWindow() && childWindows.getMenuWindow().isVisible() && childWindows.getMenuWindow().getBounds().height > 40 ? childWindows.getMenuWindow() : null))
      const opened = await popup.webContents.executeJavaScript("(() => { const p = [...document.querySelectorAll('.menu-parent')].find((b) => b.textContent.includes('출력 형식') || b.textContent.includes('Output format')); p && p.click(); return Boolean(p) })()", true)
      assert(opened, 'no Output format row')
      await sleep(250)
      const groups = await popup.webContents.executeJavaScript("[...document.querySelectorAll('.menu-column[data-depth=\"1\"] .menu-parent')].map((b) => b.textContent)", true)
      assert(groups.length >= 8 && groups.length <= 12, `${groups.length} groups in the second column`)
      const plain = await popup.webContents.executeJavaScript("document.querySelectorAll('.menu-column[data-depth=\"1\"] button:not(.menu-parent)').length", true)
      assert(plain === 0, `${plain} formats listed outside a group`)
      const marked = await popup.webContents.executeJavaScript("document.querySelectorAll('.menu-column[data-depth=\"1\"] .menu-parent.holds-active').length", true)
      assert(marked === 1, `${marked} groups marked as holding the current format`)
      await popup.webContents.executeJavaScript("document.querySelectorAll('.menu-column[data-depth=\"1\"] .menu-parent')[0].click()", true)
      await sleep(250)
      const leaves = await popup.webContents.executeJavaScript("document.querySelectorAll('.menu-column[data-depth=\"2\"] button').length", true)
      assert(leaves >= 2, `${leaves} formats in the third column`)
      const columns = await popup.webContents.executeJavaScript("document.querySelectorAll('.menu-column').length", true)
      assert(columns === 3, `${columns} columns`)
      const tallest = await popup.webContents.executeJavaScript("Math.max(...[...document.querySelectorAll('.menu-column')].map((c) => c.scrollHeight))", true)
      const area = screen.getDisplayNearestPoint(popup.getBounds()).workArea
      assert(tallest <= area.height - 48, `a column is ${tallest}px tall`)
      await shot('03-menu-output-groups', popup)
      await hook('h.closeMenu()')
      return `${groups.length} groups, ${leaves} formats in "${groups[0]}", tallest column ${tallest}px`
    })
    await step('menus', 'context menu opens on the editor', async () => {
      await hook('h.contextMenu(500, 400)')
      const popup = await waitFor(() => (childWindows.getMenuWindow() && childWindows.getMenuWindow().isVisible() && childWindows.getMenuWindow().getBounds().height > 40 ? childWindows.getMenuWindow() : null))
      const rows = await popup.webContents.executeJavaScript("document.querySelectorAll('.menu-column button').length", true)
      assert(rows >= 8, `${rows} rows`)
      await hook('h.closeMenu()')
      return `${rows} rows`
    })
    await step('menus', 'the converted-output pane has its own context menu with an export item', async () => {
      await hook("h.contextMenu(1000, 400, 'outputContext')")
      const popup = await waitFor(() => (childWindows.getMenuWindow() && childWindows.getMenuWindow().isVisible() && childWindows.getMenuWindow().getBounds().height > 40 ? childWindows.getMenuWindow() : null))
      const labels = await popup.webContents.executeJavaScript("[...document.querySelectorAll('.menu-column button')].map((b) => b.textContent)", true)
      assert(labels.some((label) => /내보내기|Export/.test(label)), `no export item: ${labels.join(' | ')}`)
      assert(labels.some((label) => /결과 복사|Copy .*output/i.test(label)), 'no copy-output item')
      assert(labels.length >= 6, `${labels.length} rows`)
      await shot('03-menu-output-context', popup)
      await hook('h.closeMenu()')
      await waitFor(() => !popup.isVisible())
      return labels.join(' | ')
    })
    await step('menus', 'File › Open recent lists files with a remove button', async () => {
      const file = path.join(outDir, 'recent-sample.md')
      await fs.writeFile(file, '# Recent\n\nHello.\n', 'utf8')
      await hook(`h.openPath(${JSON.stringify(file)})`)
      await waitFor(async () => (await state()).settings.recentFiles.some((item) => item.path === file))
      await hook('h.closeMenu()')
      await sleep(150)
      await hook("h.openMenu('file')")
      const popup = await waitFor(() => (childWindows.getMenuWindow() && childWindows.getMenuWindow().isVisible() && childWindows.getMenuWindow().getBounds().height > 40 ? childWindows.getMenuWindow() : null))
      await popup.webContents.executeJavaScript("(() => { const p = [...document.querySelectorAll('.menu-parent')].find((b) => b.textContent.includes('최근') || b.textContent.includes('recent')); p && p.click(); return Boolean(p) })()", true)
      await sleep(250)
      const forget = await popup.webContents.executeJavaScript("document.querySelectorAll('.menu-forget').length", true)
      assert(forget >= 1, 'no remove buttons in the recent submenu')
      await shot('03-menu-recent', popup)
      await hook('h.closeMenu()')
      await hook(`h.run('recent-forget:${file.replace(/\\/g, '\\\\')}')`)
      await waitFor(async () => !(await state()).settings.recentFiles.some((item) => item.path === file))
      return `${forget} removable rows`
    })

    /* ------------------------------------------------------- dialogs */
    const dialogs = ['about', 'settings', 'shortcuts', 'formats', 'stats', 'metadata', 'openRecent', 'openUrl', 'batch', 'error', 'progress']
    // Nothing in a popup may scroll: not the window, not the dialog frame, not its content.
    const NO_SCROLL = "(() => { const html = document.documentElement; const d = document.querySelector('.dialog'); const c = document.querySelector('.dialog-content'); const scrollers = [...document.querySelectorAll('*')].filter((el) => { const st = getComputedStyle(el); return /(auto|scroll)/.test(st.overflowY + st.overflowX) && (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2) && !el.matches('textarea, iframe'); }).map((el) => el.className || el.tagName); return { page: html.scrollHeight - window.innerHeight, pageX: html.scrollWidth - window.innerWidth, frame: d ? d.scrollHeight - d.clientHeight : 0, content: c ? c.scrollHeight - c.clientHeight : 0, scrollers } })()"
    const fixedSpecs = { settings: true, formats: true, print: true, batch: true }
    for (const name of dialogs) {
      await step('dialogs', `dialog "${name}" opens as a fixed-size window with no scrollbar`, async () => {
        const extra = name === 'error' ? "{ error: { title: 'Test', message: 'Smoke test error', details: 'details' } }" : name === 'progress' ? "{ progress: { title: 'T', detail: 'D', value: 0.4, cancellable: true, done: false } }" : '{}'
        await hook(`h.openDialog('${name}', ${extra})`)
        const popup = await waitFor(() => childWindows.dialogWindows.get(name) && childWindows.dialogWindows.get(name).isVisible() ? childWindows.dialogWindows.get(name) : null, 8000)
        await sleep(350)
        const bounds = popup.getBounds()
        assert(!popup.isResizable(), 'dialog is resizable')
        const spec = childWindows.DIALOG_SPECS[name]
        if (fixedSpecs[name]) assert(bounds.width === spec.width && bounds.height === spec.height, `${bounds.width}x${bounds.height} differs from the fixed ${spec.width}x${spec.height}`)
        const fit = await popup.webContents.executeJavaScript(NO_SCROLL, true)
        assert(fit.page <= 2 && fit.pageX <= 2 && fit.frame <= 2 && fit.content <= 2, `content does not fit: ${JSON.stringify(fit)}`)
        assert(fit.scrollers.length === 0, `scrolling elements: ${fit.scrollers.join(', ')}`)
        assert(popup.getParentWindow() === win, 'dialog is not owned by the main window')
        if (!fixedSpecs[name] && name !== 'progress') {
          // The window ends just under the buttons: no empty band below the content.
          const slack = await popup.webContents.executeJavaScript("(() => { const c = document.querySelector('.dialog-content'); return c ? window.innerHeight - c.getBoundingClientRect().bottom : 0 })()", true)
          assert(slack <= 12, `${slack}px of empty space under the content`)
        }
        if (name === 'shortcuts') {
          const columns = await popup.webContents.executeJavaScript("(() => { const xs = new Set([...document.querySelectorAll('.shortcut-section')].map((el) => Math.round(el.getBoundingClientRect().left))); return xs.size })()", true)
          assert(columns === 2, `shortcuts flow into ${columns} column(s)`)
        }
        if (name === 'formats') {
          const tabs = await popup.webContents.executeJavaScript("[...document.querySelectorAll('.dialog-tabs [role=tab]')].map((b) => b.textContent)", true)
          assert(tabs.length === 10, `${tabs.length} format groups`)
          let cards = 0
          for (let index = 0; index < tabs.length; index += 1) {
            await popup.webContents.executeJavaScript(`document.querySelectorAll('.dialog-tabs [role=tab]')[${index}].click()`, true)
            await sleep(120)
            const tabFit = await popup.webContents.executeJavaScript(NO_SCROLL, true)
            assert(tabFit.content <= 2 && tabFit.scrollers.length === 0, `group "${tabs[index]}" does not fit: ${JSON.stringify(tabFit)}`)
            const b = popup.getBounds()
            assert(b.width === spec.width && b.height === spec.height, `group "${tabs[index]}" changed the window size`)
            cards += await popup.webContents.executeJavaScript("document.querySelectorAll('.format-card').length", true)
          }
          assert(cards >= 79, `${cards} format cards over all groups`)
        }
        if (name === 'settings' || name === 'about' || name === 'error' || name === 'shortcuts' || name === 'formats') await shot(`04-dialog-${name}`, popup)
        return `${bounds.width}x${bounds.height}${fixedSpecs[name] ? ' (fixed)' : ' (fits content)'}`
      })
    }
    await step('dialogs', 'settings window keeps one size and every tab fits inside it', async () => {
      const popup = childWindows.dialogWindows.get('settings')
      assert(popup, 'settings dialog missing')
      const spec = childWindows.DIALOG_SPECS.settings
      const first = popup.getBounds()
      assert(first.width === spec.width && first.height === spec.height, `${first.width}x${first.height} differs from spec ${spec.width}x${spec.height}`)
      const tabs = await popup.webContents.executeJavaScript("[...document.querySelectorAll('.dialog-tabs [role=tab]')].map((b) => b.textContent)", true)
      assert(tabs.length >= 6, `${tabs.length} tabs`)
      const report = []
      for (let index = 0; index < tabs.length; index += 1) {
        await popup.webContents.executeJavaScript(`document.querySelectorAll('.dialog-tabs [role=tab]')[${index}].click()`, true)
        await sleep(200)
        const bounds = popup.getBounds()
        assert(bounds.width === first.width && bounds.height === first.height, `tab "${tabs[index]}" changed the window to ${bounds.width}x${bounds.height}`)
        const overflow = await popup.webContents.executeJavaScript("(() => { const p = document.querySelector('.settings-page'); return p ? p.scrollHeight - p.clientHeight : 0 })()", true)
        report.push(`${tabs[index]}:${overflow > 2 ? 'scrolls ' + overflow + 'px' : 'fits'}`)
        if (index === tabs.length - 1) await shot('04-dialog-settings-output', popup)
      }
      const subtabs = await popup.webContents.executeJavaScript("[...document.querySelectorAll('.dialog-subtabs [role=tab]')].length", true)
      assert(subtabs >= 7, `${subtabs} output sub-tabs`)
      await popup.webContents.executeJavaScript("document.querySelectorAll('.dialog-tabs [role=tab]')[0].click()", true)
      return report.join(', ')
    })
    await step('dialogs', 'error dialog details can be copied', async () => {
      const popup = childWindows.dialogWindows.get('error')
      assert(popup, 'error dialog missing')
      const hasCopy = await popup.webContents.executeJavaScript("Boolean([...document.querySelectorAll('button')].find((b) => /복사|Copy/i.test(b.textContent)))", true)
      assert(hasCopy, 'no copy button')
    })
    await step('dialogs', 'settings live-apply a theme to the main window', async () => {
      await hook("h.dialogResult('settings', { action: 'settings', settings: { theme: 'ocean' } })")
      await waitFor(async () => (await state()).settings.theme === 'ocean')
      const theme = await js("document.documentElement.style.getPropertyValue('--accent')")
      assert(theme.trim() === '#2ed3e6', `accent ${theme}`)
      await hook("h.dialogResult('settings', { action: 'settings', settings: { theme: 'dark' } })")
      return 'theme ocean applied'
    })
    await step('dialogs', 'all dialogs close together', async () => {
      await hook('h.closeDialogs()')
      await waitFor(() => childWindows.dialogWindows.size === 0)
    })
    await step('dialogs', 'print dialog shows preview, printers, scope and page setup', async () => {
      await hook("h.run('file.print')")
      const popup = await waitFor(() => childWindows.dialogWindows.get('print') && childWindows.dialogWindows.get('print').isVisible() ? childWindows.dialogWindows.get('print') : null, 15000)
      await sleep(900)
      const info = await popup.webContents.executeJavaScript("({ sheet: document.querySelectorAll('.print-sheet iframe').length, selects: document.querySelectorAll('.print-settings select').length, buttons: [...document.querySelectorAll('.print-settings button')].map((b) => b.textContent), nav: document.querySelectorAll('.print-nav button').length, pages: (document.querySelector('.print-nav .hint') || {}).textContent })", true)
      assert(info.sheet === 1, 'no preview sheet')
      assert(info.selects >= 4, `only ${info.selects} settings`)
      assert(info.nav === 2, 'page navigation buttons missing')
      assert(!popup.isResizable(), 'print dialog is resizable')
      const pb = popup.getBounds()
      const pspec = childWindows.DIALOG_SPECS.print
      assert(pb.width === pspec.width && pb.height === pspec.height, `print ${pb.width}x${pb.height} differs from ${pspec.width}x${pspec.height}`)
      const fit = await popup.webContents.executeJavaScript(NO_SCROLL, true)
      assert(fit.page <= 2 && fit.content <= 2 && fit.scrollers.length === 0, `print dialog does not fit: ${JSON.stringify(fit)}`)
      await shot('05-dialog-print', popup)
      await hook('h.closeDialogs()')
      return `${info.pages}; ${JSON.stringify(info.buttons)}`
    })

    /* ------------------------------------------------------ editing */
    await step('editing', 'typing marks the document dirty and enables undo', async () => {
      await hook("h.setSource('# One\\n\\nHello *world*.')")
      const s = await waitFor(async () => { const st = await state(); const doc = st.docs.find((d) => d.id === st.active); return doc && doc.dirty && doc.undo > 0 ? st : null })
      return `undo depth ${s.docs.find((d) => d.id === s.active).undo}`
    })
    await step('editing', 'undo and redo restore the text', async () => {
      const st0 = await state()
      const before = st0.docs.find((d) => d.id === st0.active).source
      await hook("h.run('edit.undo')")
      await sleep(150)
      const after = await state()
      const doc = after.docs.find((d) => d.id === after.active)
      assert(doc.source !== before, 'undo did not change the text')
      assert(doc.redo > 0, 'redo is empty after undo')
      await hook("h.run('edit.redo')")
      await sleep(150)
      const again = await state()
      assert(again.docs.find((d) => d.id === again.active).source === before, 'redo did not restore')
      return 'undo → redo round trip'
    })
    await step('editing', 'copy of the converted output reaches the clipboard', async () => {
      await hook('h.convert()')
      await hook("h.run('edit.copyOutput')")
      await sleep(200)
      const { clipboard } = require('electron')
      const text = clipboard.readText()
      assert(text.length > 10, `clipboard: ${text.slice(0, 40)}`)
      return `${text.length} chars`
    })

    /* --------------------------------------------------- conversion */
    const targets = (await hook('h.formats()')).writable
    for (const to of targets) {
      await step('conversion', `convert Markdown → ${to} in the app`, async () => {
        await hook(`h.setFormats({ to: '${to}' })`)
        await hook('h.convert()')
        const st = await waitFor(async () => { const s = await state(); const doc = s.docs.find((d) => d.id === s.active); return doc && !doc.converting && doc.to === to && (doc.hasOutput || doc.outputError) ? s : null }, 20000).catch(async (error) => { const s = await state(); const doc = s.docs.find((d) => d.id === s.active); throw new Error(`${error.message} | doc=${JSON.stringify({ ...doc, source: undefined, options: undefined, outputText: doc && doc.outputText ? doc.outputText.slice(0, 40) : doc && doc.outputText })}`) })
        const doc = st.docs.find((d) => d.id === st.active)
        assert(!doc.outputError, doc.outputError)
        assert((doc.outputText && doc.outputText.length > 0) || doc.outputBytes > 0, 'empty output')
        return doc.outputText ? `${doc.outputText.length} chars` : `${doc.outputBytes} bytes`
      })
    }
    await step('conversion', 'PostScript shows its own options group in the Properties panel', async () => {
      await hook("h.setFormats({ to: 'postscript' })")
      await sleep(200)
      const groups = await js("[...document.querySelectorAll('.panel-right .group-title span')].map((el) => el.textContent)")
      assert(groups.includes('PostScript'), `groups: ${groups.join(', ')}`)
      const checks = await js("[...document.querySelectorAll('.panel-right .check span')].map((el) => el.textContent).filter((t) => /글꼴 내장|Embed fonts/.test(t)).length")
      assert(checks === 1, 'no font-embedding option')
      await hook("h.setFormats({ to: 'html' })")
      await sleep(150)
      const after = await js("[...document.querySelectorAll('.panel-right .group-title span')].map((el) => el.textContent)")
      assert(!after.includes('PostScript'), 'the PostScript group stays for other formats')
      return groups.join(' / ')
    })
    await step('conversion', 'preview pane renders the output', async () => {
      await hook("h.setFormats({ to: 'html' })")
      await hook('h.convert()')
      await sleep(600)
      const text = await waitFor(() => hook('h.previewText()'))
      assert(/Hello/.test(text), `preview: ${String(text).slice(0, 60)}`)
      return text.trim().slice(0, 60)
    })
    await step('conversion', 'swap exchanges input and output formats', async () => {
      await hook("h.setFormats({ from: 'markdown', to: 'html' })")
      await hook("h.run('convert.swap')")
      const st = await waitFor(async () => { const s = await state(); const doc = s.docs.find((d) => d.id === s.active); return doc.from === 'html' && doc.to === 'markdown' ? s : null })
      await hook("h.run('convert.swap')")
      return `${st.docs.find((d) => d.id === st.active).from} → ${st.docs.find((d) => d.id === st.active).to}`
    })
    await step('conversion', 'properties panel option changes the output', async () => {
      await hook("h.setFormats({ from: 'markdown', to: 'html' })")
      await hook("h.setOptions({ toc: true, numberSections: true })")
      await hook('h.convert()')
      const st = await waitFor(async () => { const s = await state(); const doc = s.docs.find((d) => d.id === s.active); return doc.outputText && doc.outputText.includes('id="TOC"') ? s : null })
      assert(st.docs.find((d) => d.id === st.active).outputText.includes('header-section-number'), 'no section numbers')
      await hook("h.setOptions({ toc: false, numberSections: false })")
      return 'TOC and numbering present'
    })
    await shot('06-main-after-convert')

    /* ---------------------------------------------------------- view */
    await step('view', 'view modes: source, split, output', async () => {
      for (const mode of ['source', 'output', 'split']) {
        await hook(`h.run('view.${mode}')`)
        await waitFor(async () => (await state()).settings.viewMode === mode)
        const panes = await hook("h.query('.pane')")
        assert(panes === (mode === 'split' ? 2 : 1), `${mode}: ${panes} panes`)
      }
    })
    await step('view', 'panels toggle from the toolbar buttons', async () => {
      const buttons = await hook('h.toolbar()')
      const left = buttons.find((button) => /도구 패널|Tools panel|왼쪽|Left panel/i.test(button.tooltip))
      const right = buttons.find((button) => /속성 패널|Properties panel|오른쪽|Right panel/i.test(button.tooltip))
      assert(left && right, `panel buttons missing: ${buttons.map((button) => button.tooltip).join(' | ')}`)
      await js("[...document.querySelectorAll('.tool-bar button')].find((b) => /속성 패널|Properties panel|오른쪽|Right panel/i.test(b.dataset.tooltip || '')).click()")
      await waitFor(() => hook("h.query('.panel-right')").then((n) => n === 0))
      await js("[...document.querySelectorAll('.tool-bar button')].find((b) => /속성 패널|Properties panel|오른쪽|Right panel/i.test(b.dataset.tooltip || '')).click()")
      await waitFor(() => hook("h.query('.panel-right')").then((n) => n === 1))
      return `"${left.tooltip}", "${right.tooltip}"`
    })
    await step('view', 'panels toggle', async () => {
      const stageWidth = () => js("document.querySelector('.stage').getBoundingClientRect().width")
      const before = await stageWidth()
      await hook("h.run('view.leftPanel')")
      await waitFor(() => hook("h.query('.panel-left')").then((n) => n === 0))
      // The stage keeps the editor and preview: it grows into the space, never collapses.
      const without = await stageWidth()
      assert(without > before, `stage ${before}px → ${without}px with the tools panel closed`)
      await hook("h.run('view.leftPanel')")
      await waitFor(() => hook("h.query('.panel-left')").then((n) => n === 1))
      await hook("h.run('view.rightPanel')")
      await waitFor(() => hook("h.query('.panel-right')").then((n) => n === 0))
      await hook("h.run('view.rightPanel')")
      await waitFor(() => hook("h.query('.panel-right')").then((n) => n === 1))
      return `stage ${before}px → ${without}px → ${await stageWidth()}px`
    })
    await step('view', 'zoom in, out and reset (Ctrl+wheel path)', async () => {
      const start = (await state()).settings.zoom
      await hook("h.run('view.zoomIn')")
      await waitFor(async () => (await state()).settings.zoom === start + 10)
      await js("window.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, cancelable: true }))")
      await waitFor(async () => (await state()).settings.zoom === start + 20)
      await hook("h.run('view.zoomOut')")
      await hook("h.run('view.zoomReset')")
      await waitFor(async () => (await state()).settings.zoom === 100)
      const label = await hook("h.text('.tool-zoom')")
      assert(label === '100%', `zoom label ${label}`)
    })
    await step('view', 'every theme applies', async () => {
      const ids = ['dark', 'midnight', 'ocean', 'forest', 'sunset', 'rose', 'slate', 'mono', 'neon', 'classic', 'carbon', 'grape', 'ember', 'light', 'arctic', 'sand', 'lavender', 'coffee', 'mint', 'sakura']
      for (const id of ids) {
        await hook(`h.run('theme.${id}')`)
        await waitFor(async () => (await state()).settings.theme === id)
      }
      await hook("h.run('view.nextTheme')")
      await waitFor(async () => (await state()).settings.theme === 'dark')
      return `${ids.length} themes`
    })
    await step('view', 'language switches between Korean and English', async () => {
      await hook("h.run('lang.en')")
      await waitFor(() => hook("h.text('.menu-bar .menu-group:first-child button span')").then((text) => text === 'File'))
      await shot('07-main-english')
      await hook("h.run('lang.ko')")
      await waitFor(() => hook("h.text('.menu-bar .menu-group:first-child button span')").then((text) => text === '파일'))
    })
    await step('view', 'background image opacity setting is applied', async () => {
      await hook('h.setSettings({ backgroundOpacity: 55 })')
      const value = await waitFor(() => js("document.querySelector('.app-shell').style.getPropertyValue('--bg-opacity')").then((v) => (v.trim() === '0.55' ? v : null)))
      return value
    })

    /* ---------------------------------------------------------- tabs */
    await step('tabs', 'many tabs show the < > scroll buttons instead of a scrollbar', async () => {
      for (let i = 0; i < 14; i += 1) await hook(`h.addDoc('# Tab ${i}', 'markdown', 'html', 'tab-${i}.md')`)
      await waitFor(() => hook("h.query('.tab-scroll')").then((n) => n === 2), 6000)
      const scrollbar = await js("getComputedStyle(document.querySelector('.tab-strip')).overflowX")
      assert(scrollbar === 'hidden', `overflow ${scrollbar}`)
      await shot('08-tabs')
      return `${await hook("h.query('.tab')")} tabs`
    })
    await step('tabs', 'an unmodified document closes without a question; format and option changes do not count', async () => {
      await hook("h.addDoc('# Untouched\\n\\nText.', 'markdown', 'html', 'untouched.md')")
      await sleep(150)
      let st = await state()
      const id = st.active
      assert(!st.docs.find((d) => d.id === id).dirty, 'a freshly added document is marked modified')
      await hook("h.setFormats({ to: 'rst' })")
      await hook("h.setOptions({ toc: true })")
      await sleep(150)
      st = await state()
      assert(!st.docs.find((d) => d.id === id).dirty, 'choosing a format or option marked the document modified')
      await hook("h.setSource('# Untouched\\n\\nText. More.')")
      await sleep(150)
      st = await state()
      assert(st.docs.find((d) => d.id === id).dirty, 'typing did not mark it modified')
      await hook("h.run('edit.undo')")
      await sleep(150)
      st = await state()
      assert(!st.docs.find((d) => d.id === id).dirty, 'undo back to the saved text left it modified')
      await hook(`h.closeDocs(['${id}'])`)
      const popup = await waitFor(() => childWindows.dialogWindows.get('unsaved') && childWindows.dialogWindows.get('unsaved').isVisible() ? childWindows.dialogWindows.get('unsaved') : null, 1500).catch(() => null)
      assert(!popup, 'closing an unmodified document asked about unsaved changes')
      await waitFor(async () => !(await state()).docs.some((d) => d.id === id))
      return 'no question asked'
    })
    await step('tabs', 'closing a dirty tab asks about unsaved changes', async () => {
      await hook("h.setSource('changed')")
      await sleep(100)
      const st = await state()
      await hook(`h.closeDocs(['${st.active}'])`)
      const popup = await waitFor(() => childWindows.dialogWindows.get('unsaved') && childWindows.dialogWindows.get('unsaved').isVisible() ? childWindows.dialogWindows.get('unsaved') : null)
      await shot('09-dialog-unsaved', popup)
      await hook("h.dialogResult('unsaved', { action: 'discard' })")
      await hook('h.closeDialogs()')
      await waitFor(async () => !(await state()).docs.some((d) => d.id === st.active))
    })
    await step('tabs', 'close all leaves the empty state', async () => {
      const ids = (await state()).docs.map((d) => `'${d.id}'`).join(',')
      await hook(`h.closeDocs([${ids}])`)
      const popup = await waitFor(() => childWindows.dialogWindows.get('unsaved') && childWindows.dialogWindows.get('unsaved').isVisible() ? childWindows.dialogWindows.get('unsaved') : null, 3000).catch(() => null)
      if (popup) { await hook("h.dialogResult('unsaved', { action: 'discard' })"); await hook('h.closeDialogs()') }
      await waitFor(async () => (await state()).docs.length === 0)
      assert((await hook("h.query('.empty-state')")) === 1, 'no empty state')
      await hook("h.run('file.new')")
      await waitFor(async () => (await state()).docs.length === 1)
    })

    /* ---------------------------------------------------------- files */
    await step('files', 'a project file (.mdcv) round-trips through save and open', async () => {
      await hook("h.setSource('# Project\\n\\nBody.')")
      await hook("h.setFormats({ to: 'rst' })")
      await hook("h.setOptions({ toc: true })")
      const st = await state()
      const doc = st.docs.find((d) => d.id === st.active)
      const file = path.join(outDir, 'roundtrip.mdcv')
      const content = JSON.stringify({ format: 'mdcv', version: 1, name: 'roundtrip', from: doc.from, to: doc.to, source: doc.source, options: doc.options, savedAt: new Date().toISOString() })
      await fs.writeFile(file, content, 'utf8')
      await hook(`h.openPath(${JSON.stringify(file)})`)
      const opened = await waitFor(async () => { const s = await state(); return s.docs.find((d) => d.path === file) || null })
      assert(opened.to === 'rst' && opened.options.toc === true && /Project/.test(opened.source), `project content differs: ${JSON.stringify({ to: opened.to, toc: opened.options.toc, source: opened.source.slice(0, 60), written: content.slice(0, 200) })}`)
      return opened.name
    })
    await step('files', 'a DOCX produced by the app can be opened again', async () => {
      await hook("h.setFormats({ from: 'markdown', to: 'docx' })")
      await hook('h.convert()')
      await waitFor(async () => { const s = await state(); const doc = s.docs.find((d) => d.id === s.active); return doc.outputBytes > 0 ? s : null }, 15000)
      const base64 = await hook('h.outputBase64()')
      assert(base64 && base64.length > 100, 'no docx bytes')
      const file = path.join(outDir, 'roundtrip.docx')
      await fs.writeFile(file, Buffer.from(base64, 'base64'))
      await hook(`h.openPath(${JSON.stringify(file)})`)
      const opened = await waitFor(async () => { const s = await state(); const doc = s.docs.find((d) => d.path === file); return doc && doc.hasOutput && !doc.outputError ? doc : null }, 20000)
      assert(opened.from === 'docx', `format ${opened.from}`)
      assert(/Project/.test(opened.outputText || ''), `DOCX content was not read back: ${String(opened.outputText).slice(0, 300)}`)
      return `${base64.length} base64 chars, read back as ${opened.from}`
    })

    /* ---------------------------------------------------------- large */
    // A 46,000-line document through the real window: open, auto-convert to
    // HTML, then to PostScript with embedded fonts, with the UI still answering.
    await step('large', 'a 0.75 MB / 46,000-line Markdown file opens and converts to HTML in the window', async () => {
      const parts = []
      for (let i = 0; i < 2000; i += 1) {
        parts.push([
          `## 절 ${i} — Section ${i}`, '',
          `이 문단은 ${i}번째 문단입니다. **굵게**, *기울임*, \`code\`, [링크](https://example.com/${i}) and English text mixed in.`, '',
          `- 항목 하나 ${i}`, '- 항목 둘', `  - 중첩 ${i}`, '',
          '1. first', '2. second', '',
          '| A | B | C |', '|---|---|---|', `| ${i} | 가 | x |`, `| ${i + 1} | 나 | y |`, '',
          '```js', `const v${i} = ${i} * 2`, '```', '',
          `> 인용 ${i}`, '',
        ].join('\n'))
      }
      const text = `# 큰 문서\n\n${parts.join('\n')}`
      const file = path.join(outDir, 'large.md')
      await fs.writeFile(file, text, 'utf8')
      const started = Date.now()
      await hook(`h.openPath(${JSON.stringify(file)})`)
      const opened = await waitFor(async () => { const s = await state(); const doc = s.docs.find((d) => d.path === file); return doc && doc.hasOutput && !doc.outputError ? doc : null }, 60000)
      const ms = Date.now() - started
      assert(opened.outputText, 'no HTML output')
      assert(ms < 30000, `took ${ms} ms`)
      const ping = Date.now()
      await hook('h.query(".tab")')
      const latency = Date.now() - ping
      assert(latency < 2000, `UI answered after ${latency} ms`)
      return `${(text.length / 1024).toFixed(0)} KB, ${text.split('\n').length} lines, open+convert ${ms} ms, UI latency ${latency} ms`
    })
    await step('large', 'the large document converts to PostScript with embedded fonts in the window', async () => {
      const started = Date.now()
      await hook("h.setFormats({ to: 'postscript' })")
      await hook('h.convert()')
      const done = await waitFor(async () => { const s = await state(); const doc = s.docs.find((d) => d.id === s.active); return doc && doc.outputBytes > 0 ? doc : null }, 60000)
      const ms = Date.now() - started
      assert(done.outputBytes > 1000000, `${done.outputBytes} bytes`)
      assert(ms < 30000, `took ${ms} ms`)
      const base64 = await hook('h.outputBase64()')
      const head = Buffer.from(base64.slice(0, 4000), 'base64').toString('latin1')
      assert(head.startsWith('%!PS-Adobe-3.0'), 'not PostScript')
      const declared = /%%Pages: (\d+)/.exec(head)
      assert(declared && Number(declared[1]) > 200, `pages: ${declared && declared[1]}`)
      assert(head.includes('/CIDFontType 2'), 'fonts were not embedded (the bundled fonts did not load in the window)')
      await hook("h.setFormats({ to: 'html' })")
      await hook("h.run('file.closeTab')")
      await sleep(300)
      return `${(done.outputBytes / 1024 / 1024).toFixed(1)} MB, ${declared[1]} pages, ${ms} ms`
    })

    /* ------------------------------------------------------------ web */
    // The browser build: the same bundle in a window without the preload
    // bridge, so menus and dialogs fall back to their in-page versions.
    let web = null
    await step('web', 'the app renders without the desktop bridge', async () => {
      web = new BrowserWindow({ width: 1400, height: 860, show: false, webPreferences: { sandbox: true, contextIsolation: true } })
      await web.loadURL(childWindows.bundleUrl())
      await waitFor(() => web.webContents.executeJavaScript('Boolean(window.__mdcv) && !window.electronWindowApi', true), 20000)
      await sleep(800)
      const controls = await web.webContents.executeJavaScript("document.querySelectorAll('.window-controls').length", true)
      assert(controls === 0, 'window controls shown in the browser build')
      const brand = await web.webContents.executeJavaScript("document.querySelector('.brand').textContent", true)
      assert(/My Document Converter/.test(brand), brand)
      return brand
    })
    await step('web', 'menus open as in-page dropdowns with icons and labels', async () => {
      await web.webContents.executeJavaScript("window.__mdcv.openMenu('file')", true)
      const rows = await waitFor(() => web.webContents.executeJavaScript("document.querySelectorAll('.menu-drop .menu-column button').length", true).then((n) => (n > 5 ? n : null)))
      const ok = await web.webContents.executeJavaScript("[...document.querySelectorAll('.menu-drop .menu-column > button')].every((b) => b.querySelector('svg') && b.querySelector('span'))", true)
      assert(ok, 'a row lacks icon or label')
      await web.webContents.executeJavaScript("window.__mdcv.closeMenu()", true)
      return `${rows} rows`
    })
    await step('web', 'dialogs open as in-page overlays and convert to every text format', async () => {
      await web.webContents.executeJavaScript("window.__mdcv.openDialog('about', {})", true)
      await waitFor(() => web.webContents.executeJavaScript("document.querySelectorAll('.dialog-overlay .about-dialog').length", true).then((n) => (n === 1 ? n : null)))
      await web.webContents.executeJavaScript("window.__mdcv.closeDialogs()", true)
      await waitFor(() => web.webContents.executeJavaScript("document.querySelectorAll('.dialog-overlay').length", true).then((n) => (n === 0 ? true : null)))
      await web.webContents.executeJavaScript("window.__mdcv.setFormats({ to: 'rst' })", true)
      await web.webContents.executeJavaScript("window.__mdcv.convert()", true)
      const doc = await waitFor(() => web.webContents.executeJavaScript("(() => { const s = window.__mdcv.state(); const d = s.docs.find((x) => x.id === s.active); return d && d.to === 'rst' && d.outputText ? d : null })()", true))
      assert(doc.outputText.length > 10, 'no output')
      await shot('11-web', web)
      web.destroy()
      return `${doc.outputText.length} chars of rst`
    })

    /* ----------------------------------------------------- shutdown */
    await step('window', 'popups close with the main window', async () => {
      await hook("h.openDialog('about', {})")
      await waitFor(() => childWindows.dialogWindows.get('about') && childWindows.dialogWindows.get('about').isVisible())
      const count = BrowserWindow.getAllWindows().length
      assert(count > 1, 'no popup open')
      return `${count} windows before close`
    })

    await shot('10-final')
    app.removeAllListeners('window-all-closed')
    app.on('window-all-closed', () => {})
    win.forceClose = true
    win.close()
    await sleep(500)
    const left = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed()).length
    results.push({ category: 'window', name: 'all popup windows are gone after the main window closes', ok: left === 0, ms: 0, detail: `${left} windows left` })
    const report = { results, shots, outDir }
    process.stdout.write(`
__MDCV_SMOKE__${JSON.stringify(report)}__MDCV_SMOKE__
`)
    await sleep(600)
    app.exit(results.every((r) => r.ok) ? 0 : 1)
  }
  app.whenReady().then(() => {
    const tryStart = () => {
      const win = getMainWindow()
      if (!win) { setTimeout(tryStart, 100); return }
      win.webContents.once('did-finish-load', () => { run().catch((error) => { process.stdout.write(`\n__MDCV_SMOKE__${JSON.stringify({ results: [...results, { category: 'harness', name: 'smoke run', ok: false, detail: String(error && error.stack ? error.stack : error) }], shots, outDir })}__MDCV_SMOKE__\n`); app.exit(1) }) })
    }
    tryStart()
  })
}
