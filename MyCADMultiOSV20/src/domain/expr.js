// Numbers typed into property fields may be simple expressions:
// "25.4*2", "(100-12)/2", "sqrt(2)*10", "pi*30", "2^3". No eval: a small
// recursive-descent parser over + - * / ^ ( ) and a few functions.

const FUNCTIONS = {
  sqrt: Math.sqrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  sin: (d) => Math.sin((d * Math.PI) / 180), cos: (d) => Math.cos((d * Math.PI) / 180), tan: (d) => Math.tan((d * Math.PI) / 180),
};
const CONSTANTS = { pi: Math.PI, e: Math.E };

/** Value of the expression, or NaN when it is not valid. */
export function evaluate(text) {
  const source = String(text ?? '').trim().toLowerCase().replace(/,/g, '.').replace(/×/g, '*').replace(/÷/g, '/');
  if (!source) return NaN;
  let index = 0;
  const peek = () => source[index];
  const skip = () => { while (source[index] === ' ') index += 1; };
  function number() {
    skip();
    const match = /^(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/.exec(source.slice(index));
    if (match) { index += match[0].length; return Number(match[0]); }
    const name = /^[a-z]+/.exec(source.slice(index));
    if (name) {
      index += name[0].length;
      if (name[0] in CONSTANTS) return CONSTANTS[name[0]];
      if (name[0] in FUNCTIONS) {
        skip();
        if (peek() !== '(') throw new Error('(');
        index += 1;
        const value = sum();
        skip();
        if (peek() !== ')') throw new Error(')');
        index += 1;
        return FUNCTIONS[name[0]](value);
      }
      throw new Error(name[0]);
    }
    if (peek() === '(') {
      index += 1;
      const value = sum();
      skip();
      if (peek() !== ')') throw new Error(')');
      index += 1;
      return value;
    }
    throw new Error('number');
  }
  function unary() {
    skip();
    if (peek() === '-') { index += 1; return -unary(); }
    if (peek() === '+') { index += 1; return unary(); }
    return power();
  }
  function power() {
    const base = number();
    skip();
    if (peek() === '^') { index += 1; return base ** unary(); }
    return base;
  }
  function product() {
    let value = unary();
    for (;;) {
      skip();
      if (peek() === '*') { index += 1; value *= unary(); } else if (peek() === '/') { index += 1; value /= unary(); } else return value;
    }
  }
  function sum() {
    let value = product();
    for (;;) {
      skip();
      if (peek() === '+') { index += 1; value += product(); } else if (peek() === '-') { index += 1; value -= product(); } else return value;
    }
  }
  try {
    const value = sum();
    skip();
    return index === source.length && Number.isFinite(value) ? value : NaN;
  } catch {
    return NaN;
  }
}
