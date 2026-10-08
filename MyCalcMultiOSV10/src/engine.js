/**
 * Real-number expression parser and evaluator.
 * No eval / Function. Supports scientific functions, constants, and a variable scope for graphing.
 */

const FUNCTIONS = {
  sin: { args: 1 },
  cos: { args: 1 },
  tan: { args: 1 },
  asin: { args: 1 },
  acos: { args: 1 },
  atan: { args: 1 },
  sinh: { args: 1 },
  cosh: { args: 1 },
  tanh: { args: 1 },
  asinh: { args: 1 },
  acosh: { args: 1 },
  atanh: { args: 1 },
  log: { args: 1 },
  ln: { args: 1 },
  log2: { args: 1 },
  log10: { args: 1 },
  sqrt: { args: 1 },
  cbrt: { args: 1 },
  abs: { args: 1 },
  exp: { args: 1 },
  fact: { args: 1 },
  floor: { args: 1 },
  ceil: { args: 1 },
  round: { args: 1 },
  mod: { args: 2 },
  ncr: { args: 2 },
  npr: { args: 2 },
  min: { args: 2 },
  max: { args: 2 },
  // Σ: the first argument names the counter, so it is read as a name rather
  // than worked out, and the last argument waits until the counter has a value.
  sum: { args: 4, counts: true },
  // Statistics. These read a list, so they take as many arguments as they are
  // given; `sum` was already the counted Σ, hence `total` for a plain list.
  total: { args: { min: 1 } },
  count: { args: { min: 1 } },
  mean: { args: { min: 1 } },
  median: { args: { min: 1 } },
  // stdev / variance divide by n-1 and want two points; the population pair
  // divides by n and is happy with one.
  stdev: { args: { min: 2 } },
  variance: { args: { min: 2 } },
  stdevp: { args: { min: 1 } },
  variancep: { args: { min: 1 } },
  // The normal distribution, standard unless a mean and deviation are given.
  normalpdf: { args: { min: 1, max: 3 } },
  normalcdf: { args: { min: 1, max: 3 } },
  invnorm: { args: { min: 1, max: 3 } },
};

// A runaway loop would hang the window, so the counter is kept to a length a
// person could have meant.
const SUM_STEPS = 100000;

// Names that already stand for something cannot also count a sum.
const RESERVED_NAMES = new Set(["ans", "pi", "e"]);

function CalcError(message, at, near) {
  const err = new Error(message);
  err.name = "CalcError";
  if (Number.isInteger(at)) err.at = at;
  if (near) err.near = String(near);
  return err;
}

function tokenize(input) {
  const s = String(input);
  const tokens = [];
  let i = 0;

  while (i < s.length) {
    const raw = s[i];
    if (/\s/.test(raw)) {
      i++;
      continue;
    }
    const c = raw === "×" ? "*" : raw === "÷" ? "/" : raw === "−" ? "-" : raw;

    if (c >= "0" && c <= "9" || c === ".") {
      const at = i;
      let j = i;
      while (j < s.length && ((s[j] >= "0" && s[j] <= "9") || s[j] === ".")) j++;
      if ((s[j] === "e" || s[j] === "E") && j > i) {
        let k = j + 1;
        if (s[k] === "+" || s[k] === "-") k++;
        if (k < s.length && s[k] >= "0" && s[k] <= "9") {
          while (k < s.length && s[k] >= "0" && s[k] <= "9") k++;
          j = k;
        }
      }
      const text = s.slice(i, j);
      if ((text.match(/\./g) || []).length > 1 || text === ".") {
        throw CalcError(uiText("표현식 오류", "Expression error"), at, text);
      }
      tokens.push({ type: "num", value: text, at, end: j });
      i = j;
      continue;
    }

    if (c === "π") {
      tokens.push({ type: "ident", value: "pi", at: i, end: i + 1 });
      i++;
      continue;
    }

    // The sign is the name: Σ(k, 1, 10, k^2) reads as sum(k, 1, 10, k^2).
    if (c === "Σ" || c === "∑" || c === "σ") {
      tokens.push({ type: "ident", value: "sum", at: i, end: i + 1 });
      i++;
      continue;
    }

    if (c === "√") {
      tokens.push({ type: "sqrt", at: i, end: i + 1 });
      i++;
      continue;
    }

    if ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_") {
      const at = i;
      let j = i + 1;
      while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
      tokens.push({ type: "ident", value: s.slice(i, j).toLowerCase(), at, end: j });
      i = j;
      continue;
    }

    if (c === "*" && s[i + 1] === "*") {
      tokens.push({ type: "op", value: "^", at: i, end: i + 2 });
      i += 2;
      continue;
    }

    if ("+-*/^".includes(c)) {
      tokens.push({ type: "op", value: c, at: i, end: i + 1 });
      i++;
      continue;
    }
    if (c === "(") {
      tokens.push({ type: "lparen", value: "(", at: i, end: i + 1 });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ type: "rparen", value: ")", at: i, end: i + 1 });
      i++;
      continue;
    }
    if (c === ",") {
      tokens.push({ type: "comma", value: ",", at: i, end: i + 1 });
      i++;
      continue;
    }
    if (c === "!") {
      tokens.push({ type: "fact", value: "!", at: i, end: i + 1 });
      i++;
      continue;
    }
    if (c === "%") {
      tokens.push({ type: "percent", value: "%", at: i, end: i + 1 });
      i++;
      continue;
    }

    throw CalcError(uiText("표현식 오류", "Expression error"), i, raw);
  }

  return insertImplicitMultiply(tokens);
}

function isValueEnd(token) {
  return token && (token.type === "num" || token.type === "ident" || token.type === "rparen" || token.type === "fact" || token.type === "percent");
}

function isValueStart(token) {
  return token && (token.type === "num" || token.type === "ident" || token.type === "lparen" || token.type === "sqrt");
}

function insertImplicitMultiply(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const prev = out[out.length - 1];
    const cur = tokens[i];
    if (isValueEnd(prev) && isValueStart(cur)) {
      const prevIsFunc = prev.type === "ident" && FUNCTIONS[prev.value] && cur.type === "lparen";
      if (!prevIsFunc) out.push({ type: "op", value: "*" });
    }
    out.push(cur);
  }
  return out;
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.i = 0;
    this.lastAt = 0;
    this.lastEnd = 0;
  }

  peek() {
    return this.tokens[this.i];
  }

  eat() {
    const token = this.tokens[this.i++];
    if (Number.isInteger(token.at)) this.lastAt = token.at;
    if (Number.isInteger(token.end)) this.lastEnd = token.end;
    return token;
  }

  fail(message, token, near) {
    const picked = token || this.peek();
    const at = Number.isInteger(picked?.at) ? picked.at : this.lastEnd;
    throw CalcError(message, at, near || picked?.value);
  }

  parse() {
    if (this.tokens.length === 0) throw CalcError(uiText("식을 입력하세요", "Enter an expression"));
    const ast = this.parseAdd();
    if (this.peek()) this.fail(uiText("표현식 오류", "Expression error"));
    return ast;
  }

  parseAdd() {
    let node = this.parseMul();
    while (this.peek() && this.peek().type === "op" && (this.peek().value === "+" || this.peek().value === "-")) {
      const token = this.eat();
      const right = this.parseMul();
      node = { type: "binary", op: token.value, left: node, right, at: token.at };
    }
    return node;
  }

  parseMul() {
    let node = this.parseUnary();
    while (this.peek() && this.peek().type === "op" && (this.peek().value === "*" || this.peek().value === "/")) {
      const token = this.eat();
      const right = this.parseUnary();
      node = { type: "binary", op: token.value, left: node, right, at: token.at };
    }
    return node;
  }

  parseUnary() {
    const t = this.peek();
    if (t && t.type === "op" && (t.value === "+" || t.value === "-")) {
      const token = this.eat();
      return { type: "unary", op: token.value, expr: this.parseUnary(), at: token.at };
    }
    return this.parsePow();
  }

  parsePow() {
    const base = this.parsePostfix();
    if (this.peek() && this.peek().type === "op" && this.peek().value === "^") {
      const token = this.eat();
      const exp = this.parseUnary();
      return { type: "binary", op: "^", left: base, right: exp, at: token.at };
    }
    return base;
  }

  parsePostfix() {
    let node = this.parsePrimary();
    while (this.peek() && (this.peek().type === "fact" || this.peek().type === "percent")) {
      const token = this.eat();
      node = { type: "postfix", op: token.type, expr: node, at: token.at };
    }
    return node;
  }

  // Σ(k, 1, 10, k^2): the counter is a name to bind, not a value to read, and
  // the body is kept unevaluated until the counter stands for something.
  parseCounted(name, token) {
    const counter = this.peek();
    if (!counter || counter.type !== "ident") {
      this.fail(uiText("합의 변수를 적어 주세요", "Name the counter of the sum"), token, name);
    }
    this.eat();
    if (RESERVED_NAMES.has(counter.value)) {
      this.fail(uiText("합의 변수로 쓸 수 없는 이름입니다", "That name cannot count a sum"), counter, counter.value);
    }
    const parts = [];
    while (parts.length < 3) {
      if (!this.peek() || this.peek().type !== "comma") {
        this.fail(uiText("인수 개수가 맞지 않습니다", "Wrong number of arguments"), token, name);
      }
      this.eat();
      parts.push(this.parseAdd());
    }
    if (!this.peek() || this.peek().type !== "rparen") {
      this.fail(uiText("괄호가 맞지 않습니다", "Parentheses do not match"), token, name);
    }
    this.eat();
    return { type: "sum", counter: counter.value, from: parts[0], to: parts[1], body: parts[2], at: token.at };
  }

  parsePrimary() {
    const t = this.peek();
    if (!t) this.fail(uiText("표현식 오류", "Expression error"));

    if (t.type === "sqrt") {
      this.eat();
      return { type: "call", name: "sqrt", args: [this.parsePostfix()], at: t.at };
    }

    if (t.type === "num") {
      this.eat();
      const value = Number(t.value);
      if (!Number.isFinite(value)) this.fail(uiText("표현식 오류", "Expression error"), t, t.value);
      return { type: "num", value, at: t.at };
    }

    if (t.type === "ident") {
      this.eat();
      const name = t.value;
      if (this.peek() && this.peek().type === "lparen") {
        if (!FUNCTIONS[name]) this.fail(uiText("알 수 없는 함수", "Unknown function"), t, name);
        this.eat();
        if (FUNCTIONS[name].counts) return this.parseCounted(name, t);
        const args = [];
        if (!this.peek() || this.peek().type !== "rparen") {
          args.push(this.parseAdd());
          while (this.peek() && this.peek().type === "comma") {
            this.eat();
            args.push(this.parseAdd());
          }
        }
        if (!this.peek() || this.peek().type !== "rparen") this.fail(uiText("괄호가 맞지 않습니다", "Parentheses do not match"), t, name);
        this.eat();
        const expected = FUNCTIONS[name].args;
        const wrongCount =
          typeof expected === "number"
            ? args.length !== expected
            : args.length < (expected.min ?? 0) || args.length > (expected.max ?? Infinity);
        if (wrongCount) this.fail(uiText("인수 개수가 맞지 않습니다", "Wrong number of arguments"), t, name);
        return { type: "call", name, args, at: t.at };
      }
      return { type: "var", name, at: t.at };
    }

    if (t.type === "lparen") {
      this.eat();
      const inner = this.parseAdd();
      if (!this.peek() || this.peek().type !== "rparen") this.fail(uiText("괄호가 맞지 않습니다", "Parentheses do not match"), t, "(");
      this.eat();
      return inner;
    }

    this.fail(uiText("표현식 오류", "Expression error"));
  }
}

function factorial(n, at) {
  if (!Number.isFinite(n) || Math.abs(n - Math.round(n)) > 1e-9) {
    throw CalcError(uiText("정의되지 않음", "Undefined"), at, "!");
  }
  const k = Math.round(n);
  if (k < 0 || k > 170) throw CalcError(uiText("정의되지 않음", "Undefined"), at, "!");
  let r = 1;
  for (let i = 2; i <= k; i++) r *= i;
  return r;
}

function combination(n, r, at) {
  n = Math.round(n);
  r = Math.round(r);
  if (n < 0 || r < 0 || r > n) throw CalcError(uiText("범위 오류", "Out of range"), at, "nCr");
  r = Math.min(r, n - r);
  let c = 1;
  for (let i = 0; i < r; i++) c = (c * (n - i)) / (i + 1);
  return Math.round(c);
}

function permutation(n, r, at) {
  n = Math.round(n);
  r = Math.round(r);
  if (n < 0 || r < 0 || r > n) throw CalcError(uiText("범위 오류", "Out of range"), at, "nPr");
  let p = 1;
  for (let i = 0; i < r; i++) p *= n - i;
  return p;
}

function listMean(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function listMedian(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// `ddof` is what comes off the divisor: 1 for a sample, 0 for a population.
// The two-pass form is used because the Σx² shortcut loses its digits on data
// that sits far from zero, which is exactly the data people paste in.
function listVariance(values, ddof) {
  const n = values.length;
  if (n - ddof <= 0) return 0;
  const avg = listMean(values);
  let total = 0;
  for (const value of values) total += (value - avg) ** 2;
  return total / (n - ddof);
}

function sigmaOf(value, at, near) {
  const sigma = value === undefined ? 1 : value;
  if (!(sigma > 0)) throw CalcError(uiText("범위 오류", "Out of range"), at, near);
  return sigma;
}

function normalPdf(x, mu, sigma) {
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}

// The Chebyshev erfc of Numerical Recipes. The screen shows twelve digits, so
// the cheap 1e-7 rational forms would be wrong in plain sight; this one holds
// to roughly machine precision.
const ERFC_COF = [
  -1.3026537197817094, 6.4196979235649026e-1, 1.9476473204185836e-2, -9.561514786808631e-3,
  -9.46595344482036e-4, 3.66839497852761e-4, 4.2523324806907e-5, -2.0278578112534e-5,
  -1.624290004647e-6, 1.30365583558e-6, 1.5626441722e-8, -8.5238095915e-8,
  6.529054439e-9, 5.059343495e-9, -9.91364156e-10, -2.27365122e-10,
  9.6467911e-11, 2.394038e-12, -6.886027e-12, 8.94487e-13,
  3.13092e-13, -1.12708e-13, 3.81e-16, 7.106e-15,
  -1.523e-15, -9.4e-17, 1.21e-16, -2.8e-17,
];

function erfcCheb(z) {
  const t = 2 / (2 + z);
  const ty = 4 * t - 2;
  let d = 0;
  let dd = 0;
  for (let j = ERFC_COF.length - 1; j > 0; j--) {
    const tmp = d;
    d = ty * d - dd + ERFC_COF[j];
    dd = tmp;
  }
  return t * Math.exp(-z * z + 0.5 * (ERFC_COF[0] + ty * d) - dd);
}

function erfc(x) {
  return x >= 0 ? erfcCheb(x) : 2 - erfcCheb(-x);
}

function erf(x) {
  return 1 - erfc(x);
}

// Φ is taken from erfc rather than erf so the far left tail keeps its digits
// instead of cancelling against 1.
function normalCdf(x, mu, sigma) {
  return 0.5 * erfc(-(x - mu) / (sigma * Math.SQRT2));
}

// Acklam's inverse-normal approximation, then one Halley step against the cdf
// above so the result agrees with normalcdf to the digits on screen.
function normalQuantile(p) {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;
  let x;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - low) {
    const q = p - 0.5;
    const r = q * q;
    x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const err = normalCdf(x, 0, 1) - p;
  const u = err * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

function realPow(a, b, at) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) throw CalcError(uiText("정의되지 않음", "Undefined"), at, "^");
  if (a === 0 && b === 0) return 1;
  if (Number.isInteger(b)) return Math.pow(a, b);
  if (Math.abs(b - Math.round(b)) < 1e-10) return Math.pow(a, Math.round(b));
  if (a < 0) {
    const inv = 1 / b;
    if (Number.isFinite(inv) && Math.abs(inv - Math.round(inv)) < 1e-8) {
      const root = Math.round(inv);
      if (root % 2 !== 0) {
        return -Math.pow(-a, b);
      }
    }
    throw CalcError(uiText("정의되지 않음", "Undefined"), at, "^");
  }
  const v = Math.pow(a, b);
  if (!Number.isFinite(v)) throw CalcError(uiText("정의되지 않음", "Undefined"), at, "^");
  return v;
}

class CalcEngine {
  constructor() {
    this.angleMode = "deg";
    this.ans = 0;
  }

  parse(expression) {
    return new Parser(tokenize(expression)).parse();
  }

  evaluate(expression, scope) {
    const ast = this.parse(expression);
    const value = this.evalAst(ast, scope);
    if (!Number.isFinite(value)) throw CalcError(uiText("정의되지 않음", "Undefined"));
    this.ans = value;
    return value;
  }

  evalAst(ast, scope) {
    switch (ast.type) {
      case "num":
        return ast.value;
      case "var":
        return this.evalVar(ast.name, scope, ast.at);
      case "unary": {
        const v = this.evalAst(ast.expr, scope);
        return ast.op === "-" ? -v : +v;
      }
      case "postfix": {
        const v = this.evalAst(ast.expr, scope);
        if (ast.op === "fact") return factorial(v, ast.at);
        if (ast.op === "percent") return v / 100;
        throw CalcError(uiText("표현식 오류", "Expression error"), ast.at);
      }
      case "binary":
        return this.evalBinary(ast, scope);
      case "sum":
        return this.evalSum(ast, scope);
      case "call":
        return this.evalCall(ast, scope);
      default:
        throw CalcError(uiText("표현식 오류", "Expression error"), ast.at);
    }
  }

  evalVar(name, scope, at) {
    if (name === "ans") return this.ans;
    if (name === "pi") return Math.PI;
    if (name === "e") return Math.E;
    if (scope && Object.prototype.hasOwnProperty.call(scope, name)) {
      const v = scope[name];
      if (!Number.isFinite(v)) throw CalcError(uiText("정의되지 않음", "Undefined"), at, name);
      return v;
    }
    throw CalcError(uiText("정의되지 않은 변수", "Undefined variable"), at, name);
  }

  evalSum(ast, scope) {
    const from = this.evalAst(ast.from, scope);
    const to = this.evalAst(ast.to, scope);
    const whole = (value) => Number.isFinite(value) && Math.abs(value - Math.round(value)) < 1e-9;
    if (!whole(from) || !whole(to)) {
      throw CalcError(uiText("합의 범위는 정수여야 합니다", "A sum counts in whole numbers"), ast.at, "sum");
    }
    const first = Math.round(from);
    const last = Math.round(to);
    // Counting down is an empty sum, the same answer every book gives.
    if (last < first) return 0;
    if (last - first + 1 > SUM_STEPS) {
      throw CalcError(uiText("합의 범위가 너무 넓습니다", "The sum counts too far"), ast.at, "sum");
    }
    const inner = { ...(scope || {}) };
    let total = 0;
    for (let count = first; count <= last; count++) {
      inner[ast.counter] = count;
      total += this.evalAst(ast.body, inner);
    }
    return total;
  }

  evalBinary(ast, scope) {
    const a = this.evalAst(ast.left, scope);
    const b = this.evalAst(ast.right, scope);
    switch (ast.op) {
      case "+":
        return a + b;
      case "-":
        return a - b;
      case "*":
        return a * b;
      case "/":
        if (b === 0) throw CalcError(uiText("0으로 나눌 수 없습니다", "Cannot divide by zero"), ast.at, "/");
        return a / b;
      case "^":
        return realPow(a, b, ast.at);
      default:
        throw CalcError(uiText("표현식 오류", "Expression error"), ast.at, ast.op);
    }
  }

  toRad(x) {
    return this.angleMode === "deg" ? (x * Math.PI) / 180 : x;
  }

  fromRad(x) {
    return this.angleMode === "deg" ? (x * 180) / Math.PI : x;
  }

  evalCall(ast, scope) {
    const args = ast.args.map((a) => this.evalAst(a, scope));
    const [x, y] = args;
    switch (ast.name) {
      case "sin":
        return Math.sin(this.toRad(x));
      case "cos":
        return Math.cos(this.toRad(x));
      case "tan": {
        const r = this.toRad(x);
        const c = Math.cos(r);
        if (Math.abs(c) < 1e-14) throw CalcError(uiText("정의되지 않음", "Undefined"), ast.at, "tan");
        return Math.sin(r) / c;
      }
      case "asin": {
        if (x < -1 || x > 1) throw CalcError(uiText("정의되지 않음", "Undefined"), ast.at, "asin");
        return this.fromRad(Math.asin(x));
      }
      case "acos": {
        if (x < -1 || x > 1) throw CalcError(uiText("정의되지 않음", "Undefined"), ast.at, "acos");
        return this.fromRad(Math.acos(x));
      }
      case "atan":
        return this.fromRad(Math.atan(x));
      case "sinh":
        return Math.sinh(x);
      case "cosh":
        return Math.cosh(x);
      case "tanh":
        return Math.tanh(x);
      case "asinh":
        return Math.asinh(x);
      case "acosh":
        return Math.acosh(x);
      case "atanh":
        return Math.atanh(x);
      case "log":
      case "log10":
        if (x <= 0) throw CalcError(uiText("정의되지 않음", "Undefined"), ast.at, "log");
        return Math.log10(x);
      case "ln":
        if (x <= 0) throw CalcError(uiText("정의되지 않음", "Undefined"), ast.at, "ln");
        return Math.log(x);
      case "log2":
        if (x <= 0) throw CalcError(uiText("정의되지 않음", "Undefined"), ast.at, "log2");
        return Math.log2(x);
      case "sqrt":
        if (x < 0) throw CalcError(uiText("정의되지 않음", "Undefined"), ast.at, "sqrt");
        return Math.sqrt(x);
      case "cbrt":
        return Math.cbrt(x);
      case "abs":
        return Math.abs(x);
      case "exp":
        return Math.exp(x);
      case "fact":
        return factorial(x, ast.at);
      case "floor":
        return Math.floor(x);
      case "ceil":
        return Math.ceil(x);
      case "round":
        return Math.round(x);
      case "mod":
        if (y === 0) throw CalcError(uiText("0으로 나눌 수 없습니다", "Cannot divide by zero"), ast.at, "mod");
        return x - y * Math.floor(x / y);
      case "ncr":
        return combination(x, y, ast.at);
      case "npr":
        return permutation(x, y, ast.at);
      case "min":
        return Math.min(x, y);
      case "max":
        return Math.max(x, y);
      case "total":
        return args.reduce((a, b) => a + b, 0);
      case "count":
        return args.length;
      case "mean":
        return listMean(args);
      case "median":
        return listMedian(args);
      case "stdev":
        return Math.sqrt(listVariance(args, 1));
      case "variance":
        return listVariance(args, 1);
      case "stdevp":
        return Math.sqrt(listVariance(args, 0));
      case "variancep":
        return listVariance(args, 0);
      case "normalpdf":
        return normalPdf(x, args[1] ?? 0, sigmaOf(args[2], ast.at, "normalpdf"));
      case "normalcdf":
        return normalCdf(x, args[1] ?? 0, sigmaOf(args[2], ast.at, "normalcdf"));
      case "invnorm": {
        if (!(x > 0) || !(x < 1)) throw CalcError(uiText("정의되지 않음", "Undefined"), ast.at, "invnorm");
        return (args[1] ?? 0) + sigmaOf(args[2], ast.at, "invnorm") * normalQuantile(x);
      }
      default:
        throw CalcError(uiText("알 수 없는 함수", "Unknown function"), ast.at, ast.name);
    }
  }
}

function formatNumber(value, style = "norm") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "오류";
  if (value === 0) return "0";

  if (style === "sci") return trimExp(value.toExponential(8));
  if (style === "eng") return toEngineering(value);

  const abs = Math.abs(value);
  if (abs >= 1e12 || abs < 1e-9) return trimExp(value.toExponential(8));
  return groupThousands(trimPlain(value.toPrecision(12)));
}

function formatForChain(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw CalcError(uiText("정의되지 않음", "Undefined"));
  if (value === 0) return "0";
  let text;
  const abs = Math.abs(value);
  if (Math.abs(value - Math.round(value)) < 1e-9 && abs < 1e15) {
    text = String(Math.round(value));
  } else if (abs >= 1e12 || abs < 1e-9) {
    text = trimExp(value.toExponential(12));
  } else {
    text = trimPlain(value.toPrecision(12));
  }
  if (text.startsWith("-")) return `(${text})`;
  return text;
}

function trimPlain(text) {
  if (!text.includes("e") && !text.includes("E")) {
    return String(parseFloat(text));
  }
  return trimExp(text);
}

function trimExp(text) {
  const m = String(text).match(/^([+-]?)(\d+(?:\.\d+)?)[eE]([+-]?\d+)$/);
  if (!m) return String(text);
  const digits = m[2].includes(".") ? m[2].replace(/\.?0+$/, "") : m[2];
  const exp = String(Number(m[3]));
  const sign = m[1] === "-" ? "-" : "";
  return `${sign}${digits}e${exp}`;
}

function toEngineering(value) {
  const abs = Math.abs(value);
  const exp = Math.floor(Math.log10(abs));
  let eng = Math.floor(exp / 3) * 3;
  let mant = value / 10 ** eng;
  let text = trimPlain(mant.toPrecision(9));
  const mantAbs = Math.abs(Number(text));
  if (mantAbs >= 1000) {
    text = trimPlain((Number(text) / 1000).toPrecision(9));
    eng += 3;
  } else if (mantAbs > 0 && mantAbs < 1) {
    text = trimPlain((Number(text) * 1000).toPrecision(9));
    eng -= 3;
  }
  if (eng === 0) return text;
  return `${text}×10^${eng}`;
}

function groupThousands(text) {
  const neg = text.startsWith("-");
  const raw = neg ? text.slice(1) : text;
  const [intPart, frac] = raw.split(".");
  if (intPart.includes("e")) return text;
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (neg ? "-" : "") + grouped + (frac ? `.${frac}` : "");
}

function maskBits(value, bits) {
  const width = BigInt(bits);
  const mask = (1n << width) - 1n;
  return BigInt.asUintN(bits, value) & mask;
}

function formatInt(value, base, bits) {
  const unsigned = maskBits(value, bits);
  if (base === 10) return BigInt.asIntN(bits, unsigned).toString(10);
  const digits = unsigned.toString(base).toUpperCase();
  if (base === 2) return groupNibbles(digits);
  if (base === 16) return groupBytes(digits);
  return digits;
}

function groupNibbles(bin) {
  const pad = (4 - (bin.length % 4)) % 4;
  const s = "0".repeat(pad) + bin;
  return s.replace(/(.{4})/g, "$1 ").trim();
}

function groupBytes(hex) {
  const pad = hex.length % 2 === 0 ? 0 : 1;
  const s = "0".repeat(pad) + hex;
  return s.replace(/(.{2})(?=.)/g, "$1 ").trim();
}

const INT_OPS = {
  "|": 1,
  "^": 2,
  "&": 3,
  "<<": 4,
  ">>": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "%": 6,
};

function tokenizeInt(input, base) {
  const s = String(input);
  const tokens = [];
  let i = 0;
  const digit = (ch) => {
    const c = ch.toUpperCase();
    if (c >= "0" && c <= "9") return c.charCodeAt(0) - 48 < base;
    if (c >= "A" && c <= "F") return c.charCodeAt(0) - 55 < base;
    return false;
  };

  while (i < s.length) {
    const raw = s[i];
    if (/\s/.test(raw)) {
      i++;
      continue;
    }
    const c = raw === "×" ? "*" : raw === "÷" ? "/" : raw === "−" ? "-" : raw;
    if (digit(c)) {
      const at = i;
      let j = i + 1;
      while (j < s.length && digit(s[j])) j++;
      tokens.push({ type: "num", value: s.slice(i, j), at, end: j });
      i = j;
      continue;
    }
    if ((c === "<" || c === ">") && s[i + 1] === c) {
      tokens.push({ type: "op", value: c + c, at: i, end: i + 2 });
      i += 2;
      continue;
    }
    if ("+-*/%&|^~()".includes(c)) {
      const token = { at: i, end: i + 1, value: c };
      if (c === "(") token.type = "lparen";
      else if (c === ")") token.type = "rparen";
      else if (c === "~") token.type = "tilde";
      else token.type = "op";
      tokens.push(token);
      i++;
      continue;
    }
    throw CalcError(uiText("표현식 오류", "Expression error"), i, raw);
  }
  return tokens;
}

class IntParser {
  constructor(tokens, base, bits) {
    this.tokens = tokens;
    this.base = base;
    this.bits = bits;
    this.i = 0;
    this.lastEnd = 0;
  }

  peek() {
    return this.tokens[this.i];
  }

  eat() {
    const token = this.tokens[this.i++];
    if (Number.isInteger(token.end)) this.lastEnd = token.end;
    return token;
  }

  fail(message, token, near) {
    const picked = token || this.peek();
    const at = Number.isInteger(picked?.at) ? picked.at : this.lastEnd;
    throw CalcError(message, at, near || picked?.value);
  }

  parse() {
    if (this.tokens.length === 0) throw CalcError(uiText("식을 입력하세요", "Enter an expression"));
    const value = this.parseOr();
    if (this.peek()) this.fail(uiText("표현식 오류", "Expression error"));
    return maskBits(value, this.bits);
  }

  parseBinary(minPrec, next) {
    let left = next.call(this);
    while (this.peek() && this.peek().type === "op" && INT_OPS[this.peek().value] >= minPrec && INT_OPS[this.peek().value] < minPrec + 1) {
      const token = this.eat();
      const right = next.call(this);
      try {
        left = applyIntOp(token.value, left, right, this.bits);
      } catch (err) {
        if (!Number.isInteger(err.at)) err.at = token.at;
        if (!err.near) err.near = token.value;
        throw err;
      }
    }
    return left;
  }

  parseOr() {
    return this.parseBinary(1, this.parseXor);
  }
  parseXor() {
    return this.parseBinary(2, this.parseAnd);
  }
  parseAnd() {
    return this.parseBinary(3, this.parseShift);
  }
  parseShift() {
    return this.parseBinary(4, this.parseAdd);
  }
  parseAdd() {
    return this.parseBinary(5, this.parseMul);
  }
  parseMul() {
    return this.parseBinary(6, this.parseUnary);
  }

  parseUnary() {
    const t = this.peek();
    if (t && t.type === "tilde") {
      this.eat();
      return maskBits(~this.parseUnary(), this.bits);
    }
    if (t && t.type === "op" && (t.value === "+" || t.value === "-")) {
      const op = this.eat().value;
      const v = this.parseUnary();
      return maskBits(op === "-" ? -v : v, this.bits);
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    const t = this.peek();
    if (!t) this.fail(uiText("표현식 오류", "Expression error"));
    if (t.type === "num") {
      this.eat();
      return maskBits(parseIntStr(t.value, this.base), this.bits);
    }
    if (t.type === "lparen") {
      this.eat();
      const v = this.parseOr();
      if (!this.peek() || this.peek().type !== "rparen") this.fail(uiText("괄호가 맞지 않습니다", "Parentheses do not match"), t, "(");
      this.eat();
      return v;
    }
    this.fail(uiText("표현식 오류", "Expression error"));
  }
}

function parseIntStr(text, base) {
  const digits = text.toUpperCase();
  let n = 0n;
  const b = BigInt(base);
  for (const ch of digits) {
    const d = ch >= "0" && ch <= "9" ? BigInt(ch.charCodeAt(0) - 48) : BigInt(ch.charCodeAt(0) - 55);
    if (d >= b) throw CalcError(uiText("표현식 오류", "Expression error"));
    n = n * b + d;
  }
  return n;
}

function applyIntOp(op, a, b, bits) {
  const width = BigInt(bits);
  switch (op) {
    case "+":
      return maskBits(a + b, bits);
    case "-":
      return maskBits(a - b, bits);
    case "*":
      return maskBits(a * b, bits);
    case "/":
      if (b === 0n) throw CalcError(uiText("0으로 나눌 수 없습니다", "Cannot divide by zero"));
      return maskBits(BigInt.asIntN(bits, a) / BigInt.asIntN(bits, b), bits);
    case "%":
      if (b === 0n) throw CalcError(uiText("0으로 나눌 수 없습니다", "Cannot divide by zero"));
      return maskBits(BigInt.asIntN(bits, a) % BigInt.asIntN(bits, b), bits);
    case "&":
      return maskBits(a & b, bits);
    case "|":
      return maskBits(a | b, bits);
    case "^":
      return maskBits(a ^ b, bits);
    case "<<": {
      const sh = BigInt.asIntN(bits, b);
      if (sh < 0n) return maskBits(a >> -sh, bits);
      if (sh >= width) return 0n;
      return maskBits(a << sh, bits);
    }
    case ">>": {
      const sh = BigInt.asIntN(bits, b);
      if (sh < 0n) return maskBits(a << -sh, bits);
      if (sh >= width) return a < 0n ? maskBits(-1n, bits) : 0n;
      return maskBits(BigInt.asIntN(bits, a) >> sh, bits);
    }
    default:
      throw CalcError(uiText("표현식 오류", "Expression error"));
  }
}

function evaluateInt(expression, base, bits) {
  const tokens = tokenizeInt(expression, base);
  return new IntParser(tokens, base, bits).parse();
}
