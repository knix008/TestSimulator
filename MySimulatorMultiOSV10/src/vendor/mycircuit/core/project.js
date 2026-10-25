// Copied from MyCircuit (MyCircuitMultiOSV20/src/core/project.js (parseValue only)) by scripts/vendor-mycircuit.mjs. Do not edit.

const SI = { f: 1e-15, p: 1e-12, n: 1e-9, u: 1e-6, "µ": 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9, T: 1e12 };

export function parseValue(text) {
  if (typeof text === "number") return text;
  let s = String(text ?? "").trim().replace(/Ω|ohms?|Ohms?/g, "");
  if (!s) return NaN;
  s = s.replace(/meg/i, "M");
  const m = s.match(/^([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s*([fpnuµmkKMGT]?)(\d*)\s*[A-Za-z]*$/);
  if (m) {
    const mul = m[2] ? SI[m[2]] : 1;
    let num = parseFloat(m[1]);
    if (m[3]) num = parseFloat(`${m[1]}.${m[3]}`);
    return num * mul;
  }
  // 4k7 style: digits, prefix, digits
  const r = s.match(/^(\d+)([fpnuµmkKMGTR])(\d+)\s*[A-Za-z]*$/);
  if (r) {
    const mul = r[2] === "R" ? 1 : SI[r[2]];
    return parseFloat(`${r[1]}.${r[3]}`) * mul;
  }
  return NaN;
}
