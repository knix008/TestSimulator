// Web addresses inside plain messages (engine errors, log lines): found so
// they can be shown as links that open in the system's web browser.

const URL_RE = /https?:\/\/[^\s<>"'`]+/g;
// Punctuation that ends a sentence rather than the address.
const TRAILING = /[.,;:!?)\]}'"’”]+$/;

/** [{ text } | { url }] pieces of `text`, in order; joined they give `text` back. */
export function splitLinks(text) {
  const s = String(text ?? '');
  const out = [];
  let last = 0;
  for (const m of s.matchAll(URL_RE)) {
    let url = m[0];
    const tail = url.match(TRAILING);
    // Keep a closing bracket that belongs to the address: …/wiki/Foo_(bar)
    if (tail) {
      let cut = tail[0];
      if (cut.startsWith(')') && (url.match(/\(/g) || []).length >= (url.match(/\)/g) || []).length) cut = cut.slice(1);
      if (cut) url = url.slice(0, url.length - cut.length);
    }
    if (url.length <= 'https://'.length) continue;
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    out.push({ url });
    last = m.index + url.length;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}

export const hasLinks = (text) => splitLinks(text).some((p) => p.url);
