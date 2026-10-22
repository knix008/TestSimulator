// Pure text helpers of the terminal tab (kept out of the component so they
// can be unit-tested without a browser).

// Adds output to the text of the last output entry, applying the CR rule:
// 'overwrite' — the text after a lone CR replaces the current line (what a
// terminal shows when a progress bar redraws itself), 'newline' — the CR
// breaks the line, 'strip' — it is dropped (the pieces run together). A CR
// at the very end is kept until the next piece says whether an LF follows.
export function mergeOutput(prev, text, mode) {
  let out = prev;
  if (out.endsWith('\r')) { out = out.slice(0, -1); text = '\r' + text; }
  let i = 0;
  while (i < text.length) {
    const cr = text.indexOf('\r', i);
    if (cr < 0) { out += text.slice(i); break; }
    out += text.slice(i, cr);
    if (cr === text.length - 1) { out += '\r'; break; }          // pending
    if (text[cr + 1] === '\n') { out += '\n'; i = cr + 2; continue; }
    if (mode === 'newline') out += '\n';
    else if (mode !== 'strip') out = out.slice(0, out.lastIndexOf('\n') + 1);   // overwrite
    i = cr + 1;
  }
  return out;
}
