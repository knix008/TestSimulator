// The outline panel: the headings of a document with the line they are on, and the
// counts the status bar and the statistics window show. Pure (no DOM).

/** Markdown headings (ATX "# x" and Setext "x\n==="), skipping fenced code. */
export function markdownOutline(text) {
  const list = String(text).split('\n');
  const out = [];
  let fence = null;
  for (let i = 0; i < list.length; i += 1) {
    const line = list[i];
    const open = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (open) {
      if (!fence) fence = open[1][0];
      else if (open[1][0] === fence) fence = null;
      continue;
    }
    if (fence) continue;
    const atx = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (atx) { out.push({ level: atx[1].length, text: clean(atx[2]), line: i + 1 }); continue; }
    const next = list[i + 1];
    if (line.trim() && next !== undefined && /^\s{0,3}(=+|-+)\s*$/.test(next) && !/^\s{0,3}([-*+]\s|>|\d+\.)/.test(line)) {
      out.push({ level: next.trim()[0] === '=' ? 1 : 2, text: clean(line.trim()), line: i + 1 });
      i += 1;
    }
  }
  return out;
}

/** HTML headings <h1>…<h6>, with their line. */
export function htmlOutline(text) {
  const source = String(text);
  const out = [];
  const pattern = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi;
  let match;
  while ((match = pattern.exec(source))) {
    const line = source.slice(0, match.index).split('\n').length;
    out.push({ level: Number(match[1]), text: decode(match[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim(), line });
  }
  return out;
}

export const outlineOf = (kind, text) => (kind === 'markdown' ? markdownOutline(text) : kind === 'html' ? htmlOutline(text) : []);

const clean = (text) => text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '').trim();
const decode = (text) => text.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/** A slug for a heading id ("Hello, World!" → "hello-world"); keeps Korean letters. */
export function slugify(text) {
  return String(text).toLowerCase().trim().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'section';
}

/** Characters, characters without spaces, words, lines, paragraphs and reading time (minutes). */
export function textStats(text) {
  const source = String(text);
  const chars = [...source].length;
  const noSpaces = [...source.replace(/\s/g, '')].length;
  // Korean and other CJK text: each run of letters between spaces is a word, like English.
  const words = (source.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) ?? []).length;
  const lines = source === '' ? 1 : source.split('\n').length;
  const paragraphs = source.split(/\n\s*\n/).filter((block) => block.trim()).length;
  return { chars, noSpaces, words, lines, paragraphs, minutes: Math.max(1, Math.round(words / 220)) };
}
