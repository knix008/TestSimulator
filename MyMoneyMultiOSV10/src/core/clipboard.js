export function cutText(text, start, end) {
  const value = String(text ?? "");
  const a = clampIndex(value, start);
  const b = clampIndex(value, end);
  const [from, to] = a <= b ? [a, b] : [b, a];
  return {
    clipboard: value.slice(from, to),
    text: value.slice(0, from) + value.slice(to),
    cursor: from,
  };
}

export function copyRange(text, start, end) {
  const value = String(text ?? "");
  const a = clampIndex(value, start);
  const b = clampIndex(value, end);
  const [from, to] = a <= b ? [a, b] : [b, a];
  return value.slice(from, to);
}

export function pasteText(text, start, end, clip) {
  const value = String(text ?? "");
  const a = clampIndex(value, start);
  const b = clampIndex(value, end);
  const [from, to] = a <= b ? [a, b] : [b, a];
  const insert = String(clip ?? "");
  return {
    text: value.slice(0, from) + insert + value.slice(to),
    cursor: from + insert.length,
  };
}

function clampIndex(value, index) {
  const n = Number.isFinite(index) ? index : value.length;
  return Math.max(0, Math.min(value.length, n));
}
