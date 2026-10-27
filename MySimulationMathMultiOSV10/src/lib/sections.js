// %% sections of an M script (pure; the editor uses its own copy on the live document).

/** Text of the %% section that contains line `lineNo` (1-based). */
export function sectionOfText(text, lineNo) {
  const lines = String(text).split(/\r?\n/);
  let start = 0;
  for (let i = Math.min(lineNo, lines.length) - 1; i >= 0; i--) { if (/^\s*%%(\s|$)/.test(lines[i])) { start = i; break; } }
  let end = lines.length - 1;
  for (let i = Math.max(lineNo - 1, start) + 1; i < lines.length; i++) { if (/^\s*%%(\s|$)/.test(lines[i])) { end = i - 1; break; } }
  return { startLine: start + 1, endLine: end + 1, text: lines.slice(start, end + 1).join('\n') };
}
