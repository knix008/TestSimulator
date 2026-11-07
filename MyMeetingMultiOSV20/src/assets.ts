// Media kept beside the minutes: a file in the .mtg's folder, named in the document by its (encoded)
// file name alone, so the folder can move as a whole. On screen and on paper the name becomes an
// address of the host's mtgasset: scheme, and data-asset remembers the name for saving.
import { convertFileSrc } from '@tauri-apps/api/core'
import { host, isDesktop } from './host'
import { isMediaName } from './editor/media'
import type { Meeting } from './meeting'

let folder: string | null = null

/** The folder of the open minutes; null when they have not been saved. */
export const setAssetFolder = (dir: string | null) => {
  folder = dir
}
export const assetFolder = () => folder

const nameOf = (ref: string) => {
  try {
    return decodeURIComponent(ref)
  } catch {
    return ref
  }
}

/** A name of a file beside the minutes: no address, no folder. */
export const isAssetRef = (ref: string) => !!ref && !/^[a-z][a-z0-9+.-]*:|[\\/#?]|%2f|%5c|^\.\.?$/i.test(ref) && isMediaName(nameOf(ref))

export const assetUrl = (ref: string) => (folder ? convertFileSrc(`${folder}/${nameOf(ref)}`, 'mtgasset') : ref)

/** Rendered HTML with its file names turned into addresses the WebView can load. */
export function resolveAssets(html: string): string {
  if (!isDesktop || !folder || !/\ssrc="(?!data:|https?:)/.test(html)) return html
  const box = document.createElement('template')
  box.innerHTML = html
  for (const element of box.content.querySelectorAll('img[src], video[src], audio[src], source[src]')) {
    const ref = element.getAttribute('src') ?? ''
    if (!isAssetRef(ref)) continue
    element.setAttribute('data-asset', ref)
    element.setAttribute('src', assetUrl(ref))
  }
  return box.innerHTML
}

// ![alt](ref) and the <img>, <video> and <audio> that htmlToMarkdown writes.
const REFS = /(!\[[^\]]*\]\()([^)\s]+)(\))|(<(?:img|video|audio|source)\b[^>]*?\bsrc=")([^"]+)(")/g

/** The Markdown with each file name replaced. */
const replaceRefs = (md: string, replace: (ref: string) => string) =>
  md.replace(REFS, (all, a?: string, b?: string, c?: string, d?: string, e?: string, f?: string) => {
    const ref = b ?? e ?? ''
    return isAssetRef(ref) ? `${a ?? d}${replace(ref)}${c ?? f}` : all
  })

/** Every Markdown text of the minutes, each changed the same way. */
function mapBodies(m: Meeting, edit: (md: string) => string): Meeting {
  return { ...m, body: edit(m.body), sections: m.sections.map((s) => (s.body ? { ...s, body: edit(s.body) } : s)) }
}

function refsOf(m: Meeting): string[] {
  const refs = new Set<string>()
  mapBodies(m, (md) => replaceRefs(md, (ref) => {
    refs.add(ref)
    return ref
  }))
  return [...refs]
}

/** The minutes with the files themselves inside, for exports that travel alone. A missing file stays a name. */
export async function inlineAssets(m: Meeting): Promise<Meeting> {
  const dir = folder
  const refs = refsOf(m)
  if (!dir || !refs.length) return m
  const urls = new Map<string, string>()
  await Promise.all(refs.map(async (ref) => {
    const url = await host.readAsset(dir, nameOf(ref)).catch(() => null)
    if (url) urls.set(ref, url)
  }))
  return mapBodies(m, (md) => replaceRefs(md, (ref) => urls.get(ref) ?? ref))
}

/** Save As into another folder: the files go along. A name taken there by another file changes. */
export async function copyAssets(m: Meeting, from: string, to: string): Promise<{ meeting: Meeting; copied: number }> {
  const renamed = new Map<string, string>()
  let copied = 0
  for (const ref of refsOf(m)) {
    const name = await host.copyAsset(from, to, nameOf(ref)).catch(() => null)
    if (name === null) continue
    copied += 1
    if (name !== nameOf(ref)) renamed.set(ref, encodeURIComponent(name))
  }
  return { meeting: renamed.size ? mapBodies(m, (md) => replaceRefs(md, (ref) => renamed.get(ref) ?? ref)) : m, copied }
}

/** Puts a data URL's bytes in the folder under the file's name. Answers the reference for the document. */
export async function saveAsset(fileName: string, src: string): Promise<string> {
  if (!folder) throw new Error('the minutes have no folder yet')
  const mime = src.slice(5, src.indexOf(';'))
  // A picture the WebView cannot draw came back as PNG: the file must say so.
  const name = mime === 'image/png' && !/\.a?png$/i.test(fileName) ? `${fileName.replace(/\.[^.]+$/, '')}.png` : fileName
  return encodeURIComponent(await host.saveAsset(folder, name, src.slice(src.indexOf(',') + 1)))
}
