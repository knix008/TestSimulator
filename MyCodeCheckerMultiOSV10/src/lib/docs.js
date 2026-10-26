// The HTML documents in ./docs (npm run build:docs): 사용 설명서, 튜토리얼
// 문서, README and ARCHITECTURE, in the current language when there is an
// English page. Before a page opens, the app's theme colours go to
// localStorage['mycodechecker.docTheme'] so the page matches the app.
// Web: a new browser tab. Desktop (Tauri): a separate app window
// (WebviewWindow) on the same origin, so the stored theme reaches it.
import { getLanguage } from './i18n';
import { isDesktop } from './backend';
import { writeDocTheme } from '../components/UserGuide';

export const DOCS = {
  guide: { base: 'UsersGuide', en: true },
  tutorial: { base: 'Tutorial', en: true },
  readme: { base: 'README', en: true },
  architecture: { base: 'ARCHITECTURE', en: false },
};

export function docPath(id) {
  const d = DOCS[id] || DOCS.guide;
  return `docs/${d.base}${d.en && getLanguage() === 'en' ? '.en' : ''}.html`;
}

const exists = new Map();
/** Whether the document has been built (HEAD request; cached per path). */
export async function docExists(id) {
  const path = docPath(id);
  if (exists.has(path)) return exists.get(path);
  let ok = false;
  try {
    const res = await fetch(new URL(`./${path}`, window.location.href).href, { method: 'HEAD', cache: 'no-store' });
    ok = res.ok;
    // Vite's dev server answers unknown paths with index.html: check the title marker.
    if (ok) {
      const body = await (await fetch(new URL(`./${path}`, window.location.href).href, { cache: 'no-store' })).text();
      ok = !/<div id="root"><\/div>/.test(body);
    }
  } catch { ok = false; }
  exists.set(path, ok);
  return ok;
}

let seq = 0;
export async function openDoc(id) {
  writeDocTheme();
  const path = docPath(id);
  const url = new URL(`./${path}`, window.location.href).href;
  if (isDesktop) {
    try {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      seq += 1;
      // eslint-disable-next-line no-new
      new WebviewWindow(`doc-${id}-${Date.now().toString(36)}${seq}`, { url: path, title: `MyCodeChecker — ${DOCS[id] ? DOCS[id].base : id}`, width: 1100, height: 800, center: true, focus: true });
      return;
    } catch { /* fall back to the browser */ }
  }
  window.open(url, '_blank', 'noopener');
}
