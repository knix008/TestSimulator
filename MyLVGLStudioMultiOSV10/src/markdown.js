// Enough Markdown for the app's own documents: headings, paragraphs, lists, tables, code and
// images. It gives plain data, which the guide window renders as elements: no HTML is ever built.

/** A line of text as pieces: { text }, { code }, { bold }, { link, href } and { image, src }. */
export function inlinePieces(text) {
  const pieces = [];
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*|!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)/g;
  let at = 0;
  for (const match of String(text).matchAll(pattern)) {
    if (match.index > at) pieces.push({ text: text.slice(at, match.index) });
    if (match[1] !== undefined) pieces.push({ code: match[1] });
    else if (match[2] !== undefined) pieces.push({ bold: match[2] });
    else if (match[4] !== undefined) pieces.push({ image: match[3], src: match[4] });
    else pieces.push({ link: match[5], href: match[6] });
    at = match.index + match[0].length;
  }
  if (at < text.length) pieces.push({ text: text.slice(at) });
  return pieces;
}

const cellsOf = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
const isRule = (row) => /^\s*\|?[\s:|-]+\|?\s*$/.test(row) && row.includes("-");

/** The document as blocks: heading, paragraph, list, table and code. */
export function parseMarkdown(source) {
  const lines = String(source).replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
    } else if (line.startsWith("```")) {
      const code = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) code.push(lines[i++]);
      i++;
      blocks.push({ type: "code", text: code.join("\n") });
    } else if (/^#{1,6}\s/.test(line)) {
      const [hashes] = line.match(/^#+/);
      blocks.push({ type: "heading", level: hashes.length, text: line.slice(hashes.length).trim() });
      i++;
    } else if (line.includes("|") && i + 1 < lines.length && isRule(lines[i + 1])) {
      const head = cellsOf(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|")) rows.push(cellsOf(lines[i++]));
      blocks.push({ type: "table", head, rows });
    } else if (/^\s*([-*]|\d+\.)\s/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ""));
      blocks.push({ type: "list", ordered, items });
    } else {
      const text = [];
      while (i < lines.length && lines[i].trim() !== "" && !/^(#{1,6}\s|```)/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s/.test(lines[i])) text.push(lines[i++].trim());
      blocks.push({ type: "paragraph", text: text.join(" ") });
    }
  }
  return blocks;
}
