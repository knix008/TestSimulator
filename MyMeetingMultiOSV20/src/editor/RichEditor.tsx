// The discussion editor: WYSIWYG only. The page is HTML made from the Markdown; every edit is
// written back as Markdown, so the file, the preview and the paper read the same text. Undo is the
// app's (it covers the whole meeting), so Ctrl+Z is handed up instead of the browser's own.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../components/Icons'
import { renderMarkdown, sanitizePaste } from '../document'
import { docIconHtml } from './docIcons'
import { htmlToMarkdown } from './htmlToMarkdown'
import { IconPicker } from './IconPicker'
import { MEDIA_ACCEPT, UnsupportedImage, mediaDataUrl, mediaType } from './media'
import { assetUrl, saveAsset } from '../assets'
import type { MediaStorageChoice } from '../settings'

type Block = 'p' | 'h2' | 'h3' | 'h4' | 'pre' | 'blockquote'
type Active = { block: Block | ''; bold: boolean; italic: boolean; underline: boolean; strike: boolean; ul: boolean; ol: boolean; table: boolean }
const IDLE: Active = { block: '', bold: false, italic: false, underline: false, strike: false, ul: false, ol: false, table: false }

const MAX_MEDIA = 25 * 1024 * 1024
const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

const exec = (command: string, value?: string) => document.execCommand(command, false, value)

function closest(node: Node | null, selector: string, root: HTMLElement): HTMLElement | null {
  let el: Node | null = node
  while (el && el !== root) {
    if (el.nodeType === 1 && (el as Element).matches(selector)) return el as HTMLElement
    el = el.parentNode
  }
  return null
}

function placeCaret(el: Node, atEnd = false) {
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(!atEnd)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

/** A format button: it never takes the focus, so the selection it works on stays. */
function Tool({ id, label, on, children, onClick }: { id: string; label: string; on?: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className={`format-button${on ? ' is-on' : ''}`} data-tool={id} data-tip={label} aria-label={label} aria-pressed={on} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {children}
    </button>
  )
}

const MEDIA_DRAG = 'application/x-mymeeting-media'
/** The picture being dragged and how its editor reports the change: it can land in another editor. */
let moving: { node: HTMLElement; flush: () => void } | null = null

/** Where the insertion mark goes for a caret: a collapsed range often has no box of its own. */
function caretRect(range: Range) {
  const own = range.getClientRects()[0]
  if (own) return { x: own.left, y: own.top, height: own.height }
  const parent = range.startContainer
  const box = (node: Node) => {
    const around = document.createRange()
    around.selectNode(node)
    return around.getBoundingClientRect()
  }
  if (parent.nodeType !== 1) {
    const r = box(parent)
    return { x: r.left, y: r.top, height: r.height }
  }
  const next = parent.childNodes[range.startOffset]
  const previous = parent.childNodes[range.startOffset - 1]
  const r = next ? box(next) : previous ? box(previous) : (parent as Element).getBoundingClientRect()
  return { x: next || !previous ? r.left : r.right, y: r.top, height: r.height }
}

export type RichEditorProps = {
  value: string
  /** A new key reloads the page from `value` (undo, open, a tutorial step). */
  docKey: number
  onChange: (markdown: string) => void
  onUndo: () => void
  onRedo: () => void
  placeholder?: string
  onError?: (message: string) => void
  /** Where what is being put in goes; null is cancelled. Without it, inside the document. */
  onChooseStorage?: () => Promise<MediaStorageChoice | null>
}

export function RichEditor({ value, docKey, onChange, onUndo, onRedo, placeholder, onError, onChooseStorage }: RichEditorProps) {
  const { t } = useTranslation()
  const page = useRef<HTMLDivElement>(null)
  const pending = useRef<number | null>(null)
  const last = useRef(value)
  // A flush that was scheduled earlier still reports to the newest listener.
  const report = useRef(onChange)
  report.current = onChange
  const [active, setActive] = useState<Active>(IDLE)
  const [empty, setEmpty] = useState(!value.trim())
  const [link, setLink] = useState<{ url: string; range: Range | null } | null>(null)
  const [picked, setPicked] = useState<HTMLElement | null>(null)
  const [icons, setIcons] = useState(false)
  const [dropMark, setDropMark] = useState<{ left: number; top: number; height: number } | null>(null)
  const [, setTick] = useState(0)
  const saved = useRef<Range | null>(null)

  useLayoutEffect(() => {
    if (!page.current) return
    page.current.innerHTML = renderMarkdown(value)
    last.current = value
    setEmpty(!value.trim())
    setPicked(null)
    // The page is only rebuilt when the key changes; typing never comes back through here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey])

  const flush = useCallback(() => {
    if (pending.current !== null) window.clearTimeout(pending.current)
    pending.current = null
    if (!page.current) return
    const md = htmlToMarkdown(page.current)
    setEmpty(!page.current.textContent?.trim() && !page.current.querySelector('img,video,audio,table,hr'))
    if (md !== last.current) {
      last.current = md
      report.current(md)
    }
  }, [])

  const changed = useCallback(() => {
    if (pending.current !== null) window.clearTimeout(pending.current)
    pending.current = window.setTimeout(flush, 180)
  }, [flush])

  useEffect(() => () => flush(), [flush])

  const refresh = useCallback(() => {
    const root = page.current
    const sel = window.getSelection()
    if (!root || !sel?.rangeCount || !root.contains(sel.anchorNode)) return
    saved.current = sel.getRangeAt(0).cloneRange()
    const block = closest(sel.anchorNode, 'h1,h2,h3,h4,h5,h6,pre,blockquote,p,li', root)
    const tag = block?.tagName.toLowerCase() ?? 'p'
    const state = (name: string) => {
      try {
        return document.queryCommandState(name)
      } catch {
        return false
      }
    }
    setActive({
      block: (/^h[1-6]$/.test(tag) ? (tag === 'h1' ? 'h2' : tag > 'h4' ? 'h4' : tag) : tag === 'pre' || tag === 'blockquote' ? tag : closest(sel.anchorNode, 'blockquote', root) ? 'blockquote' : 'p') as Block,
      bold: state('bold'),
      italic: state('italic'),
      underline: state('underline'),
      strike: state('strikeThrough'),
      ul: !!closest(sel.anchorNode, 'ul', root),
      ol: !!closest(sel.anchorNode, 'ol', root),
      table: !!closest(sel.anchorNode, 'table', root),
    })
  }, [])

  useEffect(() => {
    document.addEventListener('selectionchange', refresh)
    return () => document.removeEventListener('selectionchange', refresh)
  }, [refresh])

  /** Puts the caret back where it was before a button took the focus. */
  const focus = () => {
    const root = page.current
    if (!root) return
    root.focus()
    const sel = window.getSelection()
    if (saved.current && root.contains(saved.current.startContainer)) {
      sel?.removeAllRanges()
      sel?.addRange(saved.current)
    } else if (!sel?.rangeCount || !root.contains(sel.anchorNode)) placeCaret(root, true)
  }

  const run = (fn: () => void) => {
    focus()
    fn()
    changed()
    refresh()
  }

  const setBlock = (block: Block) =>
    run(() => {
      if (block === 'blockquote' && active.block === 'blockquote') exec('outdent')
      else exec('formatBlock', `<${block === active.block && block !== 'p' ? 'p' : block}>`)
    })

  const insertHtml = (html: string) => run(() => exec('insertHTML', html))

  const insertChecklist = () =>
    run(() => {
      const root = page.current!
      const sel = window.getSelection()
      const li = closest(sel?.anchorNode ?? null, 'li', root)
      if (li) {
        const box = li.querySelector(':scope > input[type=checkbox]')
        if (box) box.remove()
        else li.insertAdjacentHTML('afterbegin', '<input type="checkbox"> ')
        return
      }
      exec('insertHTML', '<ul><li><input type="checkbox"> <br></li></ul>')
    })

  const insertTable = () => {
    const head = `<tr>${[1, 2, 3].map((n) => `<th>${escapeHtml(t('editor.column', { n }))}</th>`).join('')}</tr>`
    const row = `<tr>${'<td><br></td>'.repeat(3)}</tr>`
    insertHtml(`<table><thead>${head}</thead><tbody>${row}${row}</tbody></table><p><br></p>`)
  }

  const tableEdit = (what: 'rowAdd' | 'rowDel' | 'colAdd' | 'colDel') =>
    run(() => {
      const root = page.current!
      const cell = closest(window.getSelection()?.anchorNode ?? null, 'td,th', root) as HTMLTableCellElement | null
      const table = cell ? (closest(cell, 'table', root) as HTMLTableElement | null) : null
      if (!cell || !table) return
      const row = cell.parentElement as HTMLTableRowElement
      const col = cell.cellIndex
      if (what === 'rowAdd') {
        const next = document.createElement('tr')
        next.innerHTML = '<td><br></td>'.repeat(row.cells.length)
        if (row.parentElement?.tagName === 'THEAD') {
          const body = table.tBodies[0] ?? table.createTBody()
          body.insertBefore(next, body.firstChild)
        } else row.after(next)
        placeCaret(next.cells[Math.min(col, next.cells.length - 1)])
      } else if (what === 'rowDel') {
        if (row.parentElement?.tagName === 'THEAD' || table.rows.length <= 2) return
        row.remove()
      } else if (what === 'colAdd') {
        Array.from(table.rows).forEach((r) => {
          const added = document.createElement(r.parentElement?.tagName === 'THEAD' ? 'th' : 'td')
          added.innerHTML = '<br>'
          r.cells[col]?.after(added)
        })
      } else {
        if (row.cells.length <= 1) return
        Array.from(table.rows).forEach((r) => r.cells[col]?.remove())
      }
    })

  const insertMedia = async (files: File[]) => {
    const usable = files.filter((file) => {
      if (!mediaType(file)) onError?.(t('editor.notMedia', { name: file.name }))
      else if (file.size > MAX_MEDIA) onError?.(t('editor.tooLarge', { name: file.name }))
      else return true
      return false
    })
    if (!usable.length) return
    const storage = onChooseStorage ? await onChooseStorage() : 'internal'
    if (!storage) return
    for (const file of usable) {
      try {
        const media = await mediaDataUrl(file)
        if (!media) continue
        const alt = escapeHtml(file.name.replace(/\.[^.]+$/, ''))
        // Beside the minutes: the document keeps the file's name, the page shows it from its folder.
        const ref = storage === 'external' ? await saveAsset(file.name, media.src) : null
        const source = ref ? `src="${escapeHtml(assetUrl(ref))}" data-asset="${escapeHtml(ref)}"` : `src="${media.src}"`
        // A picture sits in the line like a character; video and sound are players.
        insertHtml(media.kind === 'image' ? `<img ${source} alt="${alt}">` : `<${media.kind} ${source} controls></${media.kind}>`)
      } catch (error) {
        onError?.(error instanceof UnsupportedImage ? t('editor.unsupportedImage', { name: file.name }) : t('editor.readFailed', { name: file.name }))
      }
    }
  }

  const pickImage = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = MEDIA_ACCEPT
    input.multiple = true
    input.onchange = () => void insertMedia(Array.from(input.files ?? []))
    input.click()
  }

  const openLink = () => {
    focus()
    const sel = window.getSelection()
    const anchor = closest(sel?.anchorNode ?? null, 'a', page.current!)
    setLink({ url: anchor?.getAttribute('href') ?? 'https://', range: sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null })
  }

  const applyLink = (url: string) => {
    const range = link?.range
    setLink(null)
    page.current?.focus()
    if (range) {
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
    const href = url.trim()
    run(() => {
      if (!href || href === 'https://') return exec('unlink')
      if (window.getSelection()?.isCollapsed) exec('insertHTML', `<a href="${escapeHtml(href)}">${escapeHtml(href)}</a>`)
      else exec('createLink', href)
    })
  }

  /** "# ", "- ", "1. ", "> " and "[] " at the start of a line become the block they stand for. */
  const shortcut = () => {
    const root = page.current!
    const sel = window.getSelection()
    if (!sel?.isCollapsed || !sel.anchorNode || sel.anchorNode.nodeType !== 3) return false
    const block = closest(sel.anchorNode, 'p,div,li,h1,h2,h3,h4,h5,h6', root) ?? root
    if (block.firstChild !== sel.anchorNode && !(block === root && root.firstChild === sel.anchorNode)) return false
    const before = (sel.anchorNode.textContent ?? '').slice(0, sel.anchorOffset)
    const action: Record<string, () => void> = {
      '#': () => exec('formatBlock', '<h2>'),
      '##': () => exec('formatBlock', '<h3>'),
      '###': () => exec('formatBlock', '<h4>'),
      '-': () => exec('insertUnorderedList'),
      '*': () => exec('insertUnorderedList'),
      '1.': () => exec('insertOrderedList'),
      '>': () => exec('formatBlock', '<blockquote>'),
    }
    const fn = action[before]
    if (!fn || block.tagName === 'LI') return false
    const range = document.createRange()
    range.setStart(sel.anchorNode, 0)
    range.setEnd(sel.anchorNode, sel.anchorOffset)
    sel.removeAllRanges()
    sel.addRange(range)
    exec('delete')
    fn()
    return true
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    const mod = event.ctrlKey || event.metaKey
    const key = event.key.toLowerCase()
    if (mod && !event.altKey && (key === 'z' || key === 'y')) {
      event.preventDefault()
      flush()
      if (key === 'y' || event.shiftKey) onRedo()
      else onUndo()
      return
    }
    if (mod && key === 'k') {
      event.preventDefault()
      openLink()
      return
    }
    if (mod && key === 'u') {
      event.preventDefault()
      run(() => exec('underline'))
      return
    }
    if (event.key === ' ' && !mod && shortcut()) {
      event.preventDefault()
      changed()
      return
    }
    if (event.key === 'Tab') {
      const root = page.current!
      const anchor = window.getSelection()?.anchorNode ?? null
      const cell = closest(anchor, 'td,th', root) as HTMLTableCellElement | null
      if (cell) {
        event.preventDefault()
        const cells = Array.from(closest(cell, 'table', root)!.querySelectorAll('th,td'))
        const next = cells[cells.indexOf(cell) + (event.shiftKey ? -1 : 1)]
        if (next) placeCaret(next, true)
        else if (!event.shiftKey) tableEdit('rowAdd')
        return
      }
      if (closest(anchor, 'li', root)) {
        event.preventDefault()
        run(() => exec(event.shiftKey ? 'outdent' : 'indent'))
      }
    }
  }

  const onPaste = (event: React.ClipboardEvent) => {
    const files = Array.from(event.clipboardData.files)
    if (files.length) {
      event.preventDefault()
      void insertMedia(files)
      return
    }
    const html = event.clipboardData.getData('text/html')
    if (html) {
      event.preventDefault()
      insertHtml(sanitizePaste(html))
      return
    }
    const text = event.clipboardData.getData('text/plain')
    if (text) {
      event.preventDefault()
      run(() => exec('insertText', text))
    }
  }

  /* --------------------------------------------- moving a picture by dragging it */

  /** The place in the page under a point; code keeps only text, so a picture goes after it. */
  const dropPlace = (x: number, y: number) => {
    const root = page.current
    const range = document.caretRangeFromPoint?.(x, y)
    if (!root || !range || !root.contains(range.startContainer)) return null
    // Its <pre> first: after the <code> inside one would still be in the block.
    const code = closest(range.startContainer, 'pre', root) ?? closest(range.startContainer, 'code', root)
    if (code) {
      range.setStartAfter(code)
      range.collapse(true)
    }
    return range
  }

  const onDragStart = (event: React.DragEvent) => {
    const target = event.target as HTMLElement
    if (target.tagName !== 'IMG') return
    // Only the mark of our own: no copy of the file or address for this page or other programs to take.
    event.dataTransfer.clearData()
    event.dataTransfer.setData(MEDIA_DRAG, '1')
    event.dataTransfer.effectAllowed = 'move'
    moving = { node: target, flush }
    setPicked(null)
  }

  const onDragOver = (event: React.DragEvent) => {
    if (event.dataTransfer.types.includes(MEDIA_DRAG) && moving) {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      const range = dropPlace(event.clientX, event.clientY)
      const host = page.current?.parentElement?.getBoundingClientRect()
      if (!range || !host) return setDropMark(null)
      const at = caretRect(range)
      setDropMark({ left: at.x - host.left, top: at.y - host.top, height: Math.max(at.height, 18) })
    } else if (event.dataTransfer.types.includes('Files')) {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    }
  }

  const moveMedia = (event: React.DragEvent) => {
    event.preventDefault()
    setDropMark(null)
    const source = moving
    moving = null
    const range = source && dropPlace(event.clientX, event.clientY)
    if (!source || !range) return
    const from = source.node.parentElement
    range.insertNode(source.node)
    // A paragraph that only held the picture would stay behind as an empty gap.
    if (from?.matches('p,div') && !from.isSameNode(source.node.parentElement) && !from.classList.contains('richeditor-page') && !from.textContent?.trim() && !from.querySelector('img,video,audio,input,table,hr')) from.remove()
    source.flush()
    flush()
    setPicked(source.node)
  }

  const onDrop = (event: React.DragEvent) => {
    if (event.dataTransfer.types.includes(MEDIA_DRAG)) return moveMedia(event)
    const files = Array.from(event.dataTransfer.files)
    if (!files.length) return
    event.preventDefault()
    const at = document.caretRangeFromPoint?.(event.clientX, event.clientY)
    if (at) {
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(at)
      saved.current = at
    }
    void insertMedia(files)
  }

  const onClick = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement
    if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'checkbox') {
      const box = target as HTMLInputElement
      if (box.checked) box.setAttribute('checked', '')
      else box.removeAttribute('checked')
      changed()
    }
    if (target.tagName === 'A' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      const href = target.getAttribute('href') ?? ''
      if (/^(https?:|mailto:)/i.test(href)) window.dispatchEvent(new CustomEvent('mymeeting-open-link', { detail: href }))
    }
    setPicked(/^(IMG|VIDEO)$/.test(target.tagName) ? target : null)
  }

  /* --------------------------------------------- picture size handle */

  const startResize = (event: React.PointerEvent) => {
    if (!picked) return
    event.preventDefault()
    const startX = event.clientX
    const startWidth = picked.getBoundingClientRect().width
    const max = page.current!.clientWidth
    const move = (e: PointerEvent) => {
      const width = Math.round(Math.max(40, Math.min(max, startWidth + e.clientX - startX)))
      picked.setAttribute('width', String(width))
      picked.style.width = ''
      setTick((n) => n + 1)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      changed()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const box = picked && page.current?.contains(picked) ? (() => {
    const host = page.current!.parentElement!.getBoundingClientRect()
    const r = picked.getBoundingClientRect()
    return { left: r.left - host.left, top: r.top - host.top + page.current!.parentElement!.scrollTop, width: r.width, height: r.height }
  })() : null

  const sizePreset = (fraction: number) => {
    if (!picked) return
    if (fraction === 1) picked.removeAttribute('width')
    else picked.setAttribute('width', String(Math.round(page.current!.clientWidth * fraction)))
    setTick((n) => n + 1)
    changed()
  }

  return (
    <div className="richeditor">
      <div className="format-bar" role="toolbar" aria-label={t('editor.toolbar')}>
        <select className="format-block" value={active.block || 'p'} data-tip={t('editor.block')} aria-label={t('editor.block')} onChange={(e) => setBlock(e.target.value as Block)}>
          <option value="p">{t('editor.paragraph')}</option>
          <option value="h2">{t('editor.heading', { n: 1 })}</option>
          <option value="h3">{t('editor.heading', { n: 2 })}</option>
          <option value="h4">{t('editor.heading', { n: 3 })}</option>
          <option value="blockquote">{t('editor.quote')}</option>
          <option value="pre">{t('editor.codeBlock')}</option>
        </select>
        <span className="format-sep" />
        <Tool id="bold" label={t('editor.bold')} on={active.bold} onClick={() => run(() => exec('bold'))}><b>B</b></Tool>
        <Tool id="italic" label={t('editor.italic')} on={active.italic} onClick={() => run(() => exec('italic'))}><i>I</i></Tool>
        <Tool id="underline" label={t('editor.underline')} on={active.underline} onClick={() => run(() => exec('underline'))}><u>U</u></Tool>
        <Tool id="strike" label={t('editor.strike')} on={active.strike} onClick={() => run(() => exec('strikeThrough'))}><s>S</s></Tool>
        <Tool id="code" label={t('editor.code')} onClick={() => run(() => {
          const sel = window.getSelection()
          const text = sel?.toString() ?? ''
          if (text) exec('insertHTML', `<code>${escapeHtml(text)}</code>&#8203;`)
        })}><Icon name="code" /></Tool>
        <span className="format-sep" />
        <Tool id="ul" label={t('editor.bullets')} on={active.ul} onClick={() => run(() => exec('insertUnorderedList'))}><Icon name="list" /></Tool>
        <Tool id="ol" label={t('editor.numbers')} on={active.ol} onClick={() => run(() => exec('insertOrderedList'))}><Icon name="numbered" /></Tool>
        <Tool id="check" label={t('editor.checklist')} onClick={insertChecklist}><Icon name="checklist" /></Tool>
        <Tool id="quote" label={t('editor.quote')} on={active.block === 'blockquote'} onClick={() => setBlock('blockquote')}><Icon name="quote" /></Tool>
        <span className="format-sep" />
        <Tool id="link" label={t('editor.link')} onClick={openLink}><Icon name="link" /></Tool>
        <Tool id="icon" label={t('editor.icon')} on={icons} onClick={() => setIcons(!icons)}><Icon name="smile" /></Tool>
        <Tool id="image" label={t('editor.image')} onClick={pickImage}><Icon name="image" /></Tool>
        <Tool id="table" label={t('editor.table')} onClick={insertTable}><Icon name="table" /></Tool>
        <Tool id="rule" label={t('editor.rule')} onClick={() => insertHtml('<hr><p><br></p>')}><Icon name="rule" /></Tool>
        {active.table && (
          <>
            <span className="format-sep" />
            <Tool id="rowAdd" label={t('editor.rowAdd')} onClick={() => tableEdit('rowAdd')}><span className="format-text">+{t('editor.row')}</span></Tool>
            <Tool id="rowDel" label={t('editor.rowDel')} onClick={() => tableEdit('rowDel')}><span className="format-text">−{t('editor.row')}</span></Tool>
            <Tool id="colAdd" label={t('editor.colAdd')} onClick={() => tableEdit('colAdd')}><span className="format-text">+{t('editor.col')}</span></Tool>
            <Tool id="colDel" label={t('editor.colDel')} onClick={() => tableEdit('colDel')}><span className="format-text">−{t('editor.col')}</span></Tool>
          </>
        )}
        {icons && (
          <IconPicker
            onClose={() => setIcons(false)}
            onPick={(name, size) => {
              setIcons(false)
              insertHtml(docIconHtml(name, size))
            }}
          />
        )}
        {link && (
          <form className="format-link" onSubmit={(e) => { e.preventDefault(); applyLink(link.url) }}>
            <input autoFocus value={link.url} aria-label={t('editor.linkUrl')} onChange={(e) => setLink({ ...link, url: e.target.value })} onKeyDown={(e) => e.key === 'Escape' && (e.preventDefault(), setLink(null), focus())} />
            <button type="submit" className="btn btn-primary btn-small">{t('common.ok')}</button>
            <button type="button" className="btn btn-small" onClick={() => applyLink('')}>{t('editor.unlink')}</button>
          </form>
        )}
      </div>
      <div className="richeditor-scroll">
        <div
          ref={page}
          className={`richeditor-page doc${empty ? ' is-empty' : ''}`}
          contentEditable
          suppressContentEditableWarning
          spellCheck
          role="textbox"
          aria-multiline="true"
          aria-label={t('section.discussion')}
          data-placeholder={placeholder}
          onInput={changed}
          onBlur={flush}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragLeave={(event) => !page.current?.contains(event.relatedTarget as Node) && setDropMark(null)}
          onDragEnd={() => {
            moving = null
            setDropMark(null)
          }}
          onDrop={onDrop}
          onClick={onClick}
        />
        {dropMark && <span className="media-drop-mark" style={dropMark} />}
        {box && (
          <div className={`media-frame${box.width < 40 || box.height < 40 ? ' is-small' : ''}`} style={{ left: box.left, top: box.top, width: box.width, height: box.height }}>
            <div className="media-sizes" onMouseDown={(e) => e.preventDefault()}>
              {[0.25, 0.5, 0.75, 1].map((f) => (
                <button key={f} type="button" className="btn btn-small" onClick={() => sizePreset(f)}>{Math.round(f * 100)}%</button>
              ))}
            </div>
            <span className="media-handle" onPointerDown={startResize} data-tip={t('editor.resize')} />
          </div>
        )}
      </div>
    </div>
  )
}
