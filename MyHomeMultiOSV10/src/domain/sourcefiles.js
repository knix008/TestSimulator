// The files a published site is made of, as text the editor can change: each page's HTML,
// style.css and script.js. An empty override means "write what the blocks and the design
// would write". A saved override is that file, and publishing uses it as it stands.
import { inlineScript, pageHtml, siteStyles } from './render.js';

const LINK = /<link\b[^>]*\bhref=(["'])style\.css\1[^>]*>/i;
const SCRIPT = /<script\b[^>]*\bsrc=(["'])script\.js\1[^>]*>\s*<\/script>/i;

export const pageHasSource = (page) => typeof page?.source === 'string' && page.source.length > 0;
export const cssHasSource = (site) => typeof site?.files?.css === 'string' && site.files.css.length > 0;

/** style.css as the design would write it (no saved file). */
export function generatedCss(site) {
  return siteStyles({ ...site, files: { ...(site.files ?? {}), css: '' } });
}

/** The page's HTML file: the saved text, or the page the blocks would publish. */
export function pageFileText(site, page) {
  return pageHasSource(page) ? page.source : pageHtml(site, page, { css: 'style.css' });
}

/** style.css: the saved file, or the design's style sheet plus the site's own CSS. */
export const cssFileText = (site) => siteStyles(site);

/** script.js: the site's JavaScript (empty when the site has none). */
export const jsFileText = (site) => String(site?.code?.js ?? '');

/** Keeps `text` as the page's HTML file, or drops it when it is what the blocks already write. */
export function assignPageSource(site, page, text) {
  if (text === pageHtml(site, page, { css: 'style.css' })) delete page.source;
  else page.source = text;
}

/** Keeps `text` as style.css, or drops it when it is the design's style sheet. */
export function assignCssFile(site, text) {
  if (!site.files || typeof site.files !== 'object') site.files = { css: '' };
  site.files.css = text === generatedCss(site) ? '' : text;
}

/** One published page. `css` null inlines style.css and script.js (a single file). */
export function publishedPageHtml(site, page, { css = 'style.css' } = {}) {
  if (!pageHasSource(page)) return pageHtml(site, page, { css });
  const text = page.source.endsWith('\n') ? page.source : `${page.source}\n`;
  return css ? text : inlineSiteFiles(text, site);
}

/** A saved page that still points at style.css / script.js, turned into one file. */
export function inlineSiteFiles(html, site) {
  const styles = siteStyles(site);
  const js = String(site?.code?.js ?? '').trim();
  return String(html ?? '')
    .replace(LINK, () => `<style>\n${styles}\n</style>`)
    .replace(SCRIPT, () => (js ? `<script>\n${inlineScript(js)}\n</script>` : ''));
}

/** What the canvas shows for a page saved as HTML: its style and its body, without scripts. */
export function customPageView(html, site) {
  const doc = String(html ?? '');
  const head = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(doc)?.[1] ?? '';
  const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(doc);
  const body = (bodyMatch ? bodyMatch[1] : doc).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  let css = '';
  if (/href=(["'])style\.css\1/i.test(head)) css += `${siteStyles(site)}\n`;
  for (const match of head.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) css += `${match[1]}\n`;
  return { css, body };
}
