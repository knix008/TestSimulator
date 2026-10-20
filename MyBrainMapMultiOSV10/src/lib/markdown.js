// Markdown → safe HTML: topic notes (the notes pane preview, HTML export)
// and the Help window's chapters.
import { marked } from 'marked';
import DOMPurify from 'dompurify';

export function renderMarkdown(text) {
  let html = '';
  try { html = marked.parse(text || '', { breaks: true }); } catch (e) { html = `<pre>${String(e.message)}</pre>`; }
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, ADD_ATTR: ['target'] });
}
