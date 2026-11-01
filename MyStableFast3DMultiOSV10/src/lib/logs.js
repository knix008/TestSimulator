// The log panel's lines: the app's own messages, the desktop host's (engine
// start-up: uv, Python), and the engine's (installation, conversions), merged
// in arrival order. Kept to MAX_LINES; older ones drop off the top.
export const MAX_LINES = 5000;
export const LEVELS = ['debug', 'info', 'warn', 'error'];

let seq = 0;

export function makeLine(level, msg, src = 'app', t = Date.now()) {
  return {
    id: ++seq,
    t,
    level: LEVELS.includes(level) ? level : 'info',
    src,
    msg: String(msg ?? ''),
  };
}

export function appendLines(list, lines) {
  if (!lines?.length) return list;
  const out = list.concat(lines);
  return out.length > MAX_LINES ? out.slice(out.length - MAX_LINES) : out;
}

export function levelAtLeast(level, min) {
  return LEVELS.indexOf(level) >= LEVELS.indexOf(min);
}

export function filterLines(lines, { level = 'info', text = '', src = 'all' } = {}) {
  const needle = text.trim().toLowerCase();
  return lines.filter((l) => levelAtLeast(l.level, level)
    && (src === 'all' || l.src === src || (src === 'engine' && !['app', 'host'].includes(l.src)))
    && (!needle || l.msg.toLowerCase().includes(needle)));
}

export function timeText(t) {
  const d = new Date(t);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

export function formatLine(l) {
  return `${timeText(l.t)} ${l.level.toUpperCase().padEnd(5)} [${l.src}] ${l.msg}`;
}

export function formatLines(lines) {
  return lines.map(formatLine).join('\n');
}
