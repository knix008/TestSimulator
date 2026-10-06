const engine = new CalcEngine();
const appEl = document.getElementById("app");
const exprEl = document.getElementById("expr");
const resultEl = document.getElementById("result");
const historyEl = document.getElementById("history");
const keysEl = document.getElementById("keys");
const screenCalc = document.getElementById("screenCalc");
const screenProg = document.getElementById("screenProg");
const screenGraph = document.getElementById("screenGraph");
const screenRates = document.getElementById("screenRates");
const screenUnit = document.getElementById("screenUnit");
const angleBtn = document.getElementById("angleBtn");
const notationBtn = document.getElementById("notationBtn");
const memFlag = document.getElementById("memFlag");
const progExprEl = document.getElementById("progExpr");
const progErrorEl = document.getElementById("progError");
const graphExprEl = document.getElementById("graphExpr");
const fnListEl = document.getElementById("fnList");
const readoutEl = document.getElementById("readout");

const HISTORY_KEPT = 10;

// The graph window never goes narrower than its toolbar on one line.
const GRAPH_MIN_WIDTH = 790;
const GRAPH_MIN_HEIGHT = 520;

// Digit rows run 7-8-9 first or 1-2-3 first. Zero keeps the middle column
// below them either way, so only the three rows above it change places.
const KEYPAD_KEY = "mycalc-keypad";
const KEYPAD_ORDERS = ["789", "123"];

function readStoredKeypad() {
  try {
    const saved = localStorage.getItem(KEYPAD_KEY);
    return KEYPAD_ORDERS.includes(saved) ? saved : KEYPAD_ORDERS[0];
  } catch {
    return KEYPAD_ORDERS[0];
  }
}

function digitRows() {
  const rows = [["7", "8", "9"], ["4", "5", "6"], ["1", "2", "3"]];
  return state.keypad === "123" ? rows.slice().reverse() : rows;
}

const state = {
  mode: "basic",
  notation: "norm",
  memory: 0,
  replaceOnNext: false,
  second: false,
  history: [],
  base: 10,
  bits: 32,
  lastGood: 0,
  currency: { amount: "1", from: "USD", to: "KRW" },
  keypad: readStoredKeypad(),
  unit: readStoredUnit() || { group: "length", from: "cm", to: "in", amount: "1" },
};

let rateTable = readStoredRates() || RATE_FALLBACK;
let rateBusy = false;
let rateAsked = false;

const board = new GraphBoard(document.getElementById("plot"), engine);
board.onChange = () => {
  renderFunctions();
  if (typeof syncSidePanel === "function") syncSidePanel();
  if (!applyingGraph) publishGraph();
};
board.onView = syncViewFields;
board.onDimension = syncGraphChrome;
board.onDraw = () => {
  const moving = board.drag?.mode === "rotate" || board.fastPaint;
  if (!moving) schedulePublish();
};

const pageKind = new URLSearchParams(location.search).get("pop");
const graphPopup = pageKind === "graph";
board.autoSquare = graphPopup || !document.documentElement.classList.contains("desktop");
const graphWindowId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
let graphChannel = null;
let uiChannel = null;
let applyingGraph = false;
let graphReady = !graphPopup;
let rememberedGraph = null;
let graphRevision = 0;
let pendingGraphExpr = "";
try {
  graphChannel = new BroadcastChannel("mycalc-graph");
} catch {
  graphChannel = null;
}
try {
  uiChannel = new BroadcastChannel("mycalc-ui");
} catch {
  uiChannel = null;
}
board.hoverLabel = "";

const PRESETS = {
  "2d": ["sin(x)", "cos(x)", "tan(x)", "x^2", "1/x", "ln(x)", "e^(-x^2)"],
  "3d": ["sin(x)*cos(y)", "x^2+y^2", "x^2-y^2", "sin(sqrt(x^2+y^2))", "e^(-(x^2+y^2))", "cos(x)+sin(y)"],
};

function basicKeys() {
  const ops = ["×", "−", "+"];
  const rows = [
    [
      { label: "AC", type: "clear", className: "util" },
      { label: "⌫", type: "back", className: "util" },
      { label: "%", type: "insert", value: "%", className: "util", title: t("percent") },
      { label: "÷", type: "op", value: "÷", className: "op" },
    ],
  ];
  digitRows().forEach((trio, index) => {
    rows.push([
      ...trio.map((digit) => ({ label: digit, type: "insert", value: digit })),
      { label: ops[index], type: "op", value: ops[index], className: "op" },
    ]);
  });
  rows.push([
    { label: "±", type: "sign", className: "util" },
    { label: "0", type: "insert", value: "0" },
    { label: ".", type: "dot" },
    { label: "=", type: "equals", className: "eq" },
  ]);
  return rows;
}

function sciKeys() {
  const fn = (label, value, altLabel, altValue, altType = "fn") => ({
    label,
    type: "fn",
    value,
    altLabel,
    altValue,
    altType,
    className: "fn",
  });
  return [
    [
      { label: "2nd", type: "second", className: "util" },
      { label: "(", type: "insert", value: "(", className: "fn" },
      { label: ")", type: "insert", value: ")", className: "fn" },
      { label: "%", type: "insert", value: "%", className: "fn", title: t("percent") },
      { label: "x!", type: "insert", value: "!", className: "fn" },
    ],
    [
      fn("sin", "sin", "sin⁻¹", "asin"),
      fn("cos", "cos", "cos⁻¹", "acos"),
      fn("tan", "tan", "tan⁻¹", "atan"),
      fn("ln", "ln", "eˣ", "exp"),
      fn("log", "log", "10ˣ", "10^(", "insert"),
    ],
    [
      { label: "π", type: "insert", value: "π", className: "fn" },
      { label: "e", type: "insert", value: "e", className: "fn" },
      { label: "√", type: "insert", value: "√(", altLabel: "∛", altValue: "cbrt()", altType: "insert", className: "fn" },
      { label: "x²", type: "insert", value: "^(2)", altLabel: "x³", altValue: "^(3)", altType: "insert", className: "fn" },
      { label: "xʸ", type: "insert", value: "^(", className: "fn" },
    ],
    [
      fn("sinh", "sinh", "sinh⁻¹", "asinh"),
      fn("cosh", "cosh", "cosh⁻¹", "acosh"),
      fn("tanh", "tanh", "tanh⁻¹", "atanh"),
      { label: "|x|", type: "fn", value: "abs", className: "fn" },
      { label: "1/x", type: "insert", value: "^(-1)", className: "fn" },
    ],
    [
      { label: "nCr", type: "fn", value: "nCr", className: "fn" },
      { label: "nPr", type: "fn", value: "nPr", className: "fn" },
      { label: "mod", type: "fn", value: "mod", className: "fn" },
      { label: "Ans", type: "insert", value: "Ans", className: "fn" },
      { label: "EXP", type: "insert", value: "×10^(", className: "fn" },
    ],
  ];
}

function programmerKeys() {
  const digit = (label, span) => ({ label, type: "pdigit", value: label, span });
  const op = (label, value) => ({ label, type: "pins", value, className: "op" });
  const bit = (label, value) => ({ label, type: "pins", value, className: "fn" });
  const util = (label, type, value) => ({ label, type, value, className: "util" });
  const hex = [["A", "B"], ["C", "D"], ["E", "F"]];
  const ops = [["÷", "/"], ["×", "*"], ["−", "-"]];
  const rows = [
    [
      util("AC", "pclear"),
      util("⌫", "pback"),
      util("(", "pins", "("),
      util(")", "pins", ")"),
      bit("≪", "<<"),
      bit("≫", ">>"),
    ],
  ];
  digitRows().forEach((trio, index) => {
    rows.push([
      ...hex[index].map((label) => digit(label)),
      ...trio.map((label) => digit(label)),
      op(ops[index][0], ops[index][1]),
    ]);
  });
  rows.push([
    bit("NOT", "~"),
    bit("AND", "&"),
    bit("OR", "|"),
    bit("XOR", "^"),
    op("%", "%"),
    op("+", "+"),
  ]);
  // The sign key takes the two hex columns so 0 lands under the 2, 5, 8 column.
  rows.push([
    { label: "±", type: "psign", className: "util", span: 2 },
    digit("0", 3),
    { label: "=", type: "pequals", className: "eq" },
  ]);
  return rows;
}

function currencyKeys() {
  const digit = (label, span) => ({ label, type: "cdigit", value: label, span });
  const sides = [
    { label: "00", type: "cdigit", value: "00" },
    { label: "000", type: "cdigit", value: "000" },
    { label: ".", type: "cdot" },
  ];
  const rows = [
    [
      { label: "AC", type: "cclear", className: "util" },
      { label: "\u232b", type: "cback", className: "util" },
      { label: "\u27f3", type: "crefresh", className: "util", title: t("rateRefresh") },
      { label: "\u21c5", type: "cswap", className: "op", title: t("rateSwap") },
    ],
  ];
  digitRows().forEach((trio, index) => {
    rows.push([...trio.map((label) => digit(label)), sides[index]]);
  });
  rows.push([digit("0", 3), { label: t("copyKey"), type: "ccopy", className: "eq", title: t("copyResult") }]);
  return rows;
}

function unitKeys() {
  const digit = (label, span) => ({ label, type: "udigit", value: label, span });
  const sides = [
    { label: "00", type: "udigit", value: "00" },
    { label: "000", type: "udigit", value: "000" },
    { label: ".", type: "udot" },
  ];
  const rows = [
    [
      { label: "AC", type: "uclear", className: "util" },
      { label: "\u232b", type: "uback", className: "util" },
      { label: "\u00b1", type: "usign", className: "util" },
      { label: "\u21c5", type: "uswap", className: "op", title: t("unitSwap") },
    ],
  ];
  digitRows().forEach((trio, index) => {
    rows.push([...trio.map((label) => digit(label)), sides[index]]);
  });
  rows.push([digit("0", 3), { label: t("copyKey"), type: "ucopy", className: "eq", title: t("copyResult") }]);
  return rows;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function renderKeys() {
  keysEl.replaceChildren();
  if (state.mode === "graph") {
    keysEl.hidden = true;
    return;
  }
  keysEl.hidden = false;
  if (state.mode === "programmer") {
    keysEl.append(renderGrid(programmerKeys(), 6));
    return;
  }
  if (state.mode === "currency") {
    keysEl.append(renderGrid(currencyKeys(), 4));
    return;
  }
  if (state.mode === "unit") {
    keysEl.append(renderGrid(unitKeys(), 4));
    return;
  }
  if (state.mode === "scientific") {
    const wrap = el("div", "sci-layout");
    wrap.append(renderGrid(sciKeys(), 5));
    wrap.append(renderGrid(basicKeys(), 4));
    keysEl.append(wrap);
    return;
  }
  keysEl.append(renderGrid(basicKeys(), 4));
}

function renderGrid(rows, columns) {
  const grid = el("div", "keygrid");
  grid.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
  const flat = rows.flat();
  for (const key of flat) {
    const second = state.second && (key.altLabel || key.altValue);
    const button = el("button", "key " + (key.className || ""));
    button.type = "button";
    button.textContent = second ? key.altLabel || key.altValue : key.label;
    if (key.title) button.title = key.title;
    if (key.type === "second" && state.second) button.classList.add("active");
    if (key.type === "pdigit" && digitValue(key.value) >= state.base) button.disabled = true;
    if (key.span > 1) button.style.gridColumn = `span ${key.span}`;
    button.addEventListener("click", () => onKey(key, second));
    grid.append(button);
  }
  return grid;
}

function digitValue(ch) {
  if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48;
  if (ch >= "A" && ch <= "F") return ch.charCodeAt(0) - 55;
  return 99;
}

function onKey(key, second) {
  const type = second && key.altType ? key.altType : key.type;
  const value = second && key.altValue !== undefined ? key.altValue : key.value;
  if (type === "insert") insertText(value);
  else if (type === "fn") insertFunction(value);
  else if (type === "op") insertOperator(value);
  else if (type === "dot") insertDot();
  else if (type === "clear") clearCalc();
  else if (type === "back") backspace(exprEl);
  else if (type === "sign") toggleSign();
  else if (type === "equals") equals();
  else if (type === "second") {
    state.second = !state.second;
    renderKeys();
  } else if (type === "pdigit" || type === "pins") insertProg(value);
  else if (type === "pback") backspace(progExprEl, updateProg);
  else if (type === "pclear") {
    progExprEl.value = "";
    updateProg();
  } else if (type === "psign") toggleProgSign();
  else if (type === "pequals") commitProg();
  else if (type === "cdigit") typeCurrency(value);
  else if (type === "cdot") typeCurrency(".");
  else if (type === "cclear") setCurrencyAmount("0");
  else if (type === "cback") setCurrencyAmount(state.currency.amount.slice(0, -1) || "0");
  else if (type === "cswap") swapCurrency();
  else if (type === "crefresh") refreshRates(true);
  else if (type === "udigit") typeUnit(value);
  else if (type === "udot") typeUnit(".");
  else if (type === "uclear") setUnitAmount("0");
  else if (type === "uback") setUnitAmount(state.unit.amount.slice(0, -1) || "0");
  else if (type === "usign") toggleUnitSign();
  else if (type === "uswap") swapUnit();
  else if (type === "ucopy") copyToClipboard(document.getElementById("unitResult").textContent);
  else if (type === "ccopy") copyToClipboard(document.getElementById("rateResult").textContent);
}

// The converter screens have no history, so the result goes out by hand.
function copyToClipboard(text) {
  const value = String(text || "").trim();
  if (!value) return;
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(value).catch(() => {});
}

function insertText(text, cursorBack = 0) {
  if (state.replaceOnNext) {
    exprEl.value = "";
    state.replaceOnNext = false;
  }
  const start = exprEl.selectionStart ?? exprEl.value.length;
  const end = exprEl.selectionEnd ?? start;
  exprEl.value = exprEl.value.slice(0, start) + text + exprEl.value.slice(end);
  const pos = start + text.length - cursorBack;
  exprEl.focus();
  exprEl.setSelectionRange(pos, pos);
  preview();
}

function insertFunction(name) {
  if (name === "√(") {
    insertText("√(");
    return;
  }
  insertText(name + "()", 1);
}

function insertOperator(symbol) {
  if (state.replaceOnNext) {
    exprEl.value = formatForChain(engine.ans);
    const end = exprEl.value.length;
    exprEl.setSelectionRange(end, end);
    state.replaceOnNext = false;
  }
  insertText(symbol);
}

function insertDot() {
  if (state.replaceOnNext) {
    exprEl.value = "";
    state.replaceOnNext = false;
  }
  const start = exprEl.selectionStart ?? exprEl.value.length;
  const left = exprEl.value.slice(0, start);
  const fragment = left.match(/(\d*\.?\d*)$/)?.[1] || "";
  if (fragment.includes(".")) return;
  insertText(".");
}

function backspace(input, after = preview) {
  if (input === exprEl && state.replaceOnNext) {
    clearCalc();
    return;
  }
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  if (start !== end) {
    input.value = input.value.slice(0, start) + input.value.slice(end);
    input.setSelectionRange(start, start);
  } else if (start > 0) {
    input.value = input.value.slice(0, start - 1) + input.value.slice(start);
    input.setSelectionRange(start - 1, start - 1);
  }
  after();
  input.focus();
}

function clearCalc() {
  exprEl.value = "";
  state.replaceOnNext = false;
  showResult(0);
}

function toggleSign() {
  if (state.replaceOnNext) {
    engine.ans = -engine.ans;
    exprEl.value = formatForChain(engine.ans);
    showResult(engine.ans);
    state.replaceOnNext = true;
    return;
  }
  const value = exprEl.value;
  const cursor = exprEl.selectionEnd ?? value.length;
  if (!value.trim()) {
    exprEl.value = "-";
    exprEl.setSelectionRange(1, 1);
    preview();
    return;
  }
  const left = value.slice(0, cursor);
  const right = value.slice(cursor);
  const match = left.match(/(\d*\.?\d+(?:e[+-]?\d+)?)$/i);
  if (!match || match[1] === "") {
    exprEl.value = value.startsWith("-(") && value.endsWith(")") ? value.slice(2, -1) : `-(${value})`;
    preview();
    return;
  }
  const num = match[1];
  const head = left.slice(0, -num.length);
  if (head.endsWith("(-") && right.startsWith(")")) {
    exprEl.value = head.slice(0, -2) + num + right.slice(1);
  } else if (head.endsWith("-") && (head.length === 1 || /[+\-×÷*/^(,]$/.test(head.slice(0, -1)))) {
    exprEl.value = head.slice(0, -1) + num + right;
  } else {
    exprEl.value = head + "(-" + num + ")" + right;
  }
  preview();
  exprEl.focus();
}

function closeParens(expr) {
  let depth = 0;
  for (let i = 0; i < expr.length; i++) {
    if (expr[i] === "(") depth++;
    else if (expr[i] === ")") {
      depth--;
      if (depth < 0) throw CalcError(uiText("괄호가 맞지 않습니다", "Parentheses do not match"), i, ")");
    }
  }
  return expr + ")".repeat(depth);
}

function errorSpot(expr, at, near) {
  const text = String(expr || "");
  if (!Number.isInteger(at) || at < 0 || !text) return "";
  const index = Math.min(at, text.length);
  const start = Math.max(0, index - 18);
  const end = Math.min(text.length, Math.max(index + 1, index + 18));
  const lead = start > 0 ? "…" : "";
  const tail = end < text.length ? "…" : "";
  const caret = " ".repeat(lead.length + index - start) + "^";
  const token = near || text[index] || "";
  const where = token
    ? uiText(`잘못된 위치: ${token}`, `Problem at: ${token}`)
    : uiText("식의 끝", "End of the expression");
  return `${lead}${text.slice(start, end)}${tail}\n${caret}\n${where}`;
}

function showResult(value) {
  closeInputNotice();
  state.lastGood = value;
  resultEl.textContent = formatNumber(value, state.notation);
}

const INPUT_GUIDE = {
  "표현식 오류": ["식을 계산할 수 없습니다.", "괄호, 연산자, 함수 이름을 확인하세요. 예: sin(30), 2*(3+4)"],
  "Expression error": ["The expression cannot be evaluated.", "Check parentheses, operators, and function names. Example: sin(30), 2*(3+4)"],
  "정의되지 않음": ["계산 결과가 정의되지 않습니다.", "제곱근은 0 이상, 로그는 양수, 역삼각함수는 -1에서 1 사이여야 합니다."],
  "Undefined": ["The result is undefined.", "Square roots need 0 or more, logarithms need a positive value, and inverse trig functions need a value from -1 to 1."],
  "0으로 나눌 수 없습니다": ["0으로 나누었습니다.", "나누는 수를 0이 아닌 값으로 바꾸세요."],
  "Cannot divide by zero": ["Division by zero.", "Change the divisor to a value other than 0."],
  "범위 오류": ["값이 허용 범위를 벗어났습니다.", "nCr과 nPr에서 n과 r은 0 이상이고, r은 n보다 클 수 없습니다."],
  "Out of range": ["The value is out of range.", "For nCr and nPr, n and r must be at least 0, and r cannot be greater than n."],
  "괄호가 맞지 않습니다": ["괄호가 맞지 않습니다.", "여는 괄호와 닫는 괄호의 개수를 맞추세요."],
  "Parentheses do not match": ["The parentheses do not match.", "Use the same number of opening and closing parentheses."],
  "인수 개수가 맞지 않습니다": ["함수의 인수 개수가 맞지 않습니다.", "함수에 필요한 개수만큼 값을 넣으세요. 예: sin(30), mod(7, 3)"],
  "Wrong number of arguments": ["The function has the wrong number of arguments.", "Pass the number of values the function expects. Example: sin(30), mod(7, 3)"],
  "알 수 없는 함수": ["알 수 없는 함수입니다.", "sin, cos, log, ln, sqrt처럼 계산기가 제공하는 함수 이름을 사용하세요."],
  "Unknown function": ["Unknown function.", "Use a function the calculator provides, such as sin, cos, log, ln, or sqrt."],
  "정의되지 않은 변수": ["정의되지 않은 변수가 있습니다.", "계산에서는 Ans를, 2D 그래프에서는 x를, 3D 그래프에서는 x와 y를 사용하세요."],
  "Undefined variable": ["The expression uses an undefined variable.", "Use Ans in calculations, x in 2D graphs, and x and y in 3D graphs."],
  "식을 입력하세요": ["식이 비어 있습니다.", "입력칸에 식을 쓴 뒤 다시 실행하세요."],
  "Enter an expression": ["The expression is empty.", "Type an expression, then try again."],
  "함수는 최대 8개까지 추가할 수 있습니다": ["함수는 8개까지 추가할 수 있습니다.", "목록에서 식을 지운 뒤 새 식을 추가하세요."],
  "You can add at most 8 functions": ["You can add at most 8 functions.", "Delete an expression from the list, then add a new one."],
  "범위가 올바르지 않습니다": ["범위가 올바르지 않습니다.", "최소값은 최대값보다 작아야 합니다."],
  "The range is not valid": ["The range is not valid.", "Each minimum must be smaller than its maximum."],
  "내보내지 못했습니다.": ["그래프를 저장하지 못했습니다.", "다른 파일 이름이나 폴더를 선택한 뒤 다시 저장하세요."],
  "Could not export the graph.": ["The graph could not be saved.", "Choose another file name or folder, then save again."],
  "인쇄하지 못했습니다.": ["인쇄하지 못했습니다.", "프린터 연결을 확인한 뒤 다시 인쇄하세요."],
  "Printing failed.": ["Printing failed.", "Check the printer connection, then print again."],
};

function inputGuide(message) {
  return INPUT_GUIDE[message] || null;
}

let noticeKind = "";

function openNotice({ kind, title, detail, fix, copyText, spot }) {
  const notice = document.getElementById("notice");
  if (!notice) return;
  noticeKind = kind;
  document.getElementById("noticeTitle").textContent = title;
  document.getElementById("noticeDetail").textContent = detail;
  document.getElementById("noticeFix").textContent = fix;
  const place = document.getElementById("noticeSpot");
  if (place) {
    place.hidden = !spot;
    place.textContent = spot || "";
  }
  const field = document.getElementById("noticeCopyField");
  const copy = document.getElementById("noticeCopy");
  const text = document.getElementById("noticeText");
  const program = kind === "program";
  field.hidden = !program;
  copy.hidden = !program;
  text.value = program ? copyText || "" : "";
  notice.hidden = false;
}

function closeNotice() {
  const notice = document.getElementById("notice");
  if (notice) notice.hidden = true;
  noticeKind = "";
}

function closeInputNotice() {
  if (noticeKind === "input") closeNotice();
}

function reportInput(message, spot) {
  const guide = inputGuide(message);
  openNotice({
    kind: "input",
    title: t("inputError"),
    detail: guide ? guide[0] : message,
    fix: guide ? guide[1] : t("inputFixGeneric"),
    spot: spot || "",
  });
}

function reportProgram(err) {
  const message = err && err.message ? err.message : uiText("오류", "Error");
  const copyText = err && err.stack ? err.stack : message;
  openNotice({
    kind: "program",
    title: t("programError"),
    detail: t("programErrorLead"),
    fix: t("programErrorFix"),
    copyText,
  });
}

function preview() {
  const expr = exprEl.value.trim();
  if (!expr) {
    showResult(0);
    return;
  }
  try {
    const value = engine.evalAst(engine.parse(expr), {});
    if (!Number.isFinite(value)) return;
    showResult(value);
  } catch {
    /* 입력 중에는 오류 창을 열지 않는다. = 를 누르면 위치를 알려 준다. */
  }
}

function equals() {
  const expr = exprEl.value.trim();
  if (!expr) return;
  let prepared = expr;
  try {
    prepared = closeParens(expr);
    const value = engine.evaluate(prepared);
    state.history.unshift({ expr: prepared, value });
    state.history = state.history.slice(0, HISTORY_KEPT);
    exprEl.value = prepared;
    showResult(value);
    state.replaceOnNext = true;
    renderHistory();
  } catch (err) {
    reportInput(err.message || uiText("오류", "Error"), errorSpot(prepared, err.at, err.near));
  }
}

function renderHistory() {
  historyEl.replaceChildren();
  if (state.history.length) {
    // The sweep sits at the head so it stays in reach however long the strip grows.
    const clear = el("button", "history-clear");
    clear.type = "button";
    clear.append(el("span", "icon icon-trash"));
    clear.setAttribute("aria-label", t("historyClear"));
    clear.dataset.tooltip = t("historyClear");
    clear.addEventListener("click", () => {
      state.history = [];
      renderHistory();
    });
    historyEl.append(clear);
  }
  state.history.forEach((item, index) => {
    const chip = el("span", "history-chip");
    const recall = el("button", "history-recall", `${item.expr} = ${formatNumber(item.value, state.notation)}`);
    recall.type = "button";
    recall.addEventListener("click", () => {
      exprEl.value = item.expr;
      state.replaceOnNext = false;
      preview();
      exprEl.focus();
    });
    const drop = el("button", "history-drop", "\u00d7");
    drop.type = "button";
    drop.setAttribute("aria-label", t("historyRemove"));
    drop.dataset.tooltip = t("historyRemove");
    drop.addEventListener("click", () => {
      state.history.splice(index, 1);
      renderHistory();
    });
    chip.append(recall, drop);
    historyEl.append(chip);
  });
}

function currentValue() {
  const expr = exprEl.value.trim();
  if (!expr) return engine.ans;
  return engine.evalAst(engine.parse(closeParens(expr)), {});
}

function setMemory(next) {
  state.memory = next;
  memFlag.hidden = next === 0;
}

function setMode(mode) {
  // The graph keeps its own window. Asking for it from the calculator opens
  // that window and leaves the screen on the mode it was already showing.
  if (mode === "graph" && !graphPopup) {
    openGraphWindow();
    return;
  }
  state.mode = mode;
  state.second = false;
  appEl.dataset.mode = mode;
  fitModeWindow(mode);
  for (const tab of document.querySelectorAll(".modes button")) {
    tab.setAttribute("aria-selected", String(tab.dataset.mode === mode));
  }
  screenCalc.hidden = mode === "programmer" || mode === "graph" || mode === "currency" || mode === "unit";
  screenProg.hidden = mode !== "programmer";
  // The off-screen plot keeps drawing in the calculator window so a graph
  // window opened later starts with the picture already in hand.
  screenGraph.hidden = graphPopup && mode !== "graph";
  screenRates.hidden = mode !== "currency";
  screenUnit.hidden = mode !== "unit";
  renderKeys();
  if (mode === "currency") openCurrency();
  if (mode === "unit") openUnit();
  if (mode === "graph") {
    requestAnimationFrame(() => requestAnimationFrame(() => board.resize()));
  }
  if (mode === "programmer") updateProg();
}

function fitModeWindow(mode) {
  if (pageKind || !window.mycalcDesktop) return;
  const sized = ["basic", "scientific", "programmer", "currency", "unit"];
  if (!sized.includes(mode)) return;
  window.mycalcDesktop.setContentSize(mode);
}

function setAngle(mode) {
  engine.angleMode = mode;
  const label = mode === "deg" ? "DEG" : "RAD";
  angleBtn.textContent = label;
  angleBtn.setAttribute("aria-pressed", String(mode === "rad"));
  if (state.mode !== "programmer") preview();
  if (state.mode === "graph") board.redraw();
}

function setNotation(notation) {
  state.notation = notation;
  notationBtn.textContent = notation === "norm" ? "NORM" : notation === "sci" ? "SCI" : "ENG";
  if (state.replaceOnNext) showResult(engine.ans);
  else preview();
  renderHistory();
}

function insertProg(text) {
  if (/^[0-9A-F]$/.test(text) && progExprEl.value === "0") {
    progExprEl.value = "";
    progExprEl.setSelectionRange(0, 0);
  }
  const start = progExprEl.selectionStart ?? progExprEl.value.length;
  const end = progExprEl.selectionEnd ?? start;
  progExprEl.value = progExprEl.value.slice(0, start) + text + progExprEl.value.slice(end);
  const pos = start + text.length;
  progExprEl.focus();
  progExprEl.setSelectionRange(pos, pos);
  updateProg();
}

function currentProgValue() {
  const expr = progExprEl.value.trim();
  if (!expr) return 0n;
  return evaluateInt(expr, state.base, state.bits);
}

function updateProg() {
  for (const base of [16, 10, 8, 2]) {
    document.querySelector(`#bases button[data-base="${base}"]`).setAttribute("aria-pressed", String(base === state.base));
  }
  for (const bits of [64, 32, 16, 8]) {
    document.querySelector(`#bitRow button[data-bits="${bits}"]`).setAttribute("aria-pressed", String(bits === state.bits));
  }
  const expr = progExprEl.value.trim();
  const incomplete = /[+\-*/%&|^~<>]$/.test(expr) || (expr.match(/\(/g) || []).length > (expr.match(/\)/g) || []).length;
  try {
    const value = currentProgValue();
    progErrorEl.textContent = "";
    closeInputNotice();
    for (const base of [16, 10, 8, 2]) {
      document.getElementById("val" + base).textContent = formatInt(value, base, state.bits);
    }
  } catch {
    /* 입력 중에는 오류 창을 열지 않는다. = 를 누르면 위치를 알려 준다. */
  }
  for (const button of keysEl.querySelectorAll("button")) {
    if (button.textContent.length === 1 && /[0-9A-F]/.test(button.textContent)) {
      button.disabled = digitValue(button.textContent) >= state.base;
    }
  }
}

function formatEntry(value) {
  const text = formatInt(value, state.base, state.bits).replace(/\s/g, "");
  return text.replace(/^0+/, "") || "0";
}

function setBase(base) {
  if (base === state.base) return;
  try {
    const value = currentProgValue();
    state.base = base;
    progExprEl.value = formatEntry(value);
  } catch {
    state.base = base;
  }
  renderKeys();
  updateProg();
}

function setBits(bits) {
  try {
    const value = currentProgValue();
    state.bits = bits;
    progExprEl.value = formatEntry(value);
  } catch {
    state.bits = bits;
  }
  updateProg();
}

function toggleProgSign() {
  try {
    const value = currentProgValue();
    const signed = BigInt.asIntN(state.bits, value);
    const neg = BigInt.asUintN(state.bits, -signed);
    progExprEl.value = formatEntry(neg);
    updateProg();
  } catch {
    /* 부호 변경은 계산이 되는 식에서만 적용한다. */
  }
}

function commitProg() {
  try {
    const value = currentProgValue();
    progExprEl.value = formatEntry(value);
    updateProg();
  } catch (err) {
    reportInput(err.message || uiText("오류", "Error"), errorSpot(progExprEl.value, err.at, err.near));
  }
}

function placeLegendEditor(hit) {
  const editor = document.getElementById("legendEditor");
  if (!hit) {
    editor.style.left = "auto";
    editor.style.right = "12px";
    editor.style.top = "12px";
    return;
  }
  const canvas = board.canvas;
  const rect = canvas.getBoundingClientRect();
  const wrap = canvas.parentElement.getBoundingClientRect();
  const left = rect.left - wrap.left + (hit.x / canvas.width) * rect.width;
  const top = rect.top - wrap.top + (hit.y / canvas.height) * rect.height;
  editor.style.right = "auto";
  editor.style.left = `${Math.max(8, left)}px`;
  editor.style.top = `${Math.max(8, top)}px`;
}

function placeOverCanvas(el, spot) {
  const canvas = board.canvas;
  const rect = canvas.getBoundingClientRect();
  const wrap = canvas.parentElement.getBoundingClientRect();
  const left = rect.left - wrap.left + (spot.x / canvas.width) * rect.width;
  const top = rect.top - wrap.top + (spot.y / canvas.height) * rect.height;
  el.style.right = "auto";
  el.style.left = `${Math.max(8, left)}px`;
  el.style.top = `${Math.max(8, top)}px`;
}

function openLegendColor(hit, trusted) {
  const fn = board.functions.find((item) => item.id === hit.id);
  if (!fn) return;
  const picker = document.getElementById("legendColor");
  board.selectedId = fn.id;
  picker.dataset.fn = String(fn.id);
  picker.value = fn.color;
  picker.hidden = false;
  placeOverCanvas(picker, hit.chip);
  renderFunctions();
  board.draw();
  // A real click opens the system picker; a scripted one only shows the swatch.
  if (trusted) picker.click();
}

function openLegendEditor(id, hit) {
  const fn = board.functions.find((item) => item.id === id);
  if (!fn) return;
  board.selectedId = id;
  const editor = document.getElementById("legendEditor");
  const prefix = board.dimension === "3d" ? "z = " : "y = ";
  editor.value = fn.legendText || "";
  editor.placeholder = prefix + fn.expr;
  editor.hidden = false;
  placeLegendEditor(hit);
  renderFunctions();
  board.draw();
  editor.focus();
  editor.select();
}

function renderFunctions() {
  fnListEl.replaceChildren();
  if (board.functions.length === 0) {
    const empty = board.dimension === "3d" ? t("empty3d") : t("empty2d");
    fnListEl.append(el("li", "empty-note", empty));
    return;
  }
  if (!board.functions.some((fn) => fn.id === board.selectedId)) board.selectedId = null;
  const prefix = board.dimension === "3d" ? "z = " : "y = ";
  for (const fn of board.functions) {
    const item = document.createElement("li");
    if (fn.id === board.selectedId) item.classList.add("is-selected");
    item.addEventListener("click", (ev) => {
      if (ev.target.closest("button, input")) return;
      board.selectedId = fn.id;
      renderFunctions();
      board.draw();
    });
    const color = document.createElement("input");
    color.type = "color";
    color.className = "fn-color";
    color.value = fn.color;
    color.setAttribute("aria-label", t("fnColor"));
    color.dataset.tooltip = t("fnColor");
    color.addEventListener("input", () => board.setFunctionColor(fn.id, color.value));
    const expr = el("span", "fn-expr", prefix + fn.expr);
    expr.style.opacity = fn.visible ? "1" : "0.4";
    const main = el("div", "fn-main");
    main.append(expr);
    const actions = el("span", "fn-actions");
    const hideLabel = fn.visible ? t("hide") : t("show");
    const hide = el("button", "icon-btn");
    hide.type = "button";
    hide.setAttribute("aria-label", hideLabel);
    hide.dataset.tooltip = hideLabel;
    hide.append(el("span", fn.visible ? "icon icon-eye-off" : "icon icon-eye"));
    hide.addEventListener("click", () => board.toggleFunction(fn.id));
    const del = el("button", "icon-btn");
    del.type = "button";
    del.setAttribute("aria-label", t("del"));
    del.dataset.tooltip = t("del");
    del.append(el("span", "icon icon-trash"));
    del.addEventListener("click", () => board.removeFunction(fn.id));
    actions.append(hide, del);
    item.append(color, main, actions);
    fnListEl.append(item);
  }
}

function syncViewFields() {
  // Panning and zooming set the whole range; nothing here is typed in.
  if (board.dimension === "2d" && board.hover && !board.drag) {
    readoutEl.textContent = board.hoverLabel || readoutEl.textContent;
  }
  syncAxisSpans();
}

// A number the reader can edit: short enough to fit the box, and written so
// that typing it back gives the same number.
function spanText(value) {
  if (!Number.isFinite(value)) return "";
  if (value === 0) return "0";
  const size = Math.abs(value);
  if (size >= 1e5 || size < 1e-3) return value.toExponential(3).replace("e+", "e");
  return String(Number(value.toPrecision(8)));
}

function syncAxisSpans() {
  const is3d = board.dimension === "3d";
  for (const axis of ["x", "y", "z"]) {
    const upper = axis.toUpperCase();
    const group = document.querySelector(`.axis-span[data-axis="${axis}"]`);
    if (group) group.hidden = axis === "z" && !is3d;
    for (const end of ["Min", "Max"]) {
      const input = document.getElementById(`axis${end}${upper}`);
      // Whoever is typing keeps their text until they are done with it.
      if (!input || document.activeElement === input) continue;
      input.value = spanText(board.view[`${axis}${end}`]);
      input.classList.remove("is-wrong");
    }
  }
  const sep = document.getElementById("lightSep");
  const lamp = document.getElementById("lightSpan");
  if (sep) sep.hidden = !is3d;
  if (lamp) lamp.hidden = !is3d;
  if (!is3d) return;
  const place = board.lightPlace();
  for (const [id, value] of [["lightAtX", place.x], ["lightAtY", place.y], ["lightAtZ", place.z]]) {
    const input = document.getElementById(id);
    if (!input || document.activeElement === input) continue;
    input.value = spanText(Math.round(value * 100) / 100);
  }
}

function readNumberField(input) {
  const text = String(input.value).trim();
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function bindAxisSpans() {
  for (const axis of ["x", "y", "z"]) {
    const upper = axis.toUpperCase();
    const low = document.getElementById(`axisMin${upper}`);
    const high = document.getElementById(`axisMax${upper}`);
    if (!low || !high) continue;
    const apply = () => {
      const from = readNumberField(low);
      const to = readNumberField(high);
      let ok = from !== null && to !== null && to > from;
      if (ok) {
        try {
          board.setView({ [`${axis}Min`]: from, [`${axis}Max`]: to });
        } catch {
          ok = false;
        }
      }
      low.classList.toggle("is-wrong", !ok);
      high.classList.toggle("is-wrong", !ok);
      if (!ok) return;
      syncGraphChrome();
      publishGraph();
    };
    for (const input of [low, high]) {
      input.addEventListener("change", apply);
      // A range that was never accepted goes back to the one being drawn.
      input.addEventListener("blur", () => {
        if (!input.classList.contains("is-wrong")) return;
        input.value = spanText(board.view[`${axis}${input === low ? "Min" : "Max"}`]);
        low.classList.remove("is-wrong");
        high.classList.remove("is-wrong");
      });
    }
  }
  const lamp = ["lightAtX", "lightAtY", "lightAtZ"].map((id) => document.getElementById(id));
  if (lamp.some((input) => !input)) return;
  const place = () => {
    const [x, y, z] = lamp.map(readNumberField);
    const wrong = lamp.some((input) => readNumberField(input) === null);
    for (const input of lamp) input.classList.toggle("is-wrong", wrong);
    if (wrong) return;
    board.setLightPlace({ x, y, z });
    // The lamp is kept as a turn and a rise, so what it took may not be what
    // was typed; the fields are written back from where it actually hangs.
    syncAxisSpans();
    syncGraphChrome();
    publishGraph();
  };
  for (const input of lamp) {
    input.addEventListener("change", place);
    input.addEventListener("blur", () => {
      if (!input.classList.contains("is-wrong")) return;
      syncAxisSpans();
      for (const field of lamp) field.classList.remove("is-wrong");
    });
  }
}

function graphHelp() {
  return board.dimension === "3d" ? t("help3d") : t("help2d");
}

function syncGraphChrome() {
  const is3d = board.dimension === "3d";
  document.getElementById("dim2d").setAttribute("aria-pressed", String(!is3d));
  document.getElementById("dim3d").setAttribute("aria-pressed", String(is3d));
  graphExprEl.placeholder = is3d ? "sin(x)*cos(y)" : "sin(x)";
  const gridToggle = document.getElementById("gridToggle");
  const axisToggle = document.getElementById("axisToggle");
  const axesToggle = document.getElementById("axesToggle");
  gridToggle.hidden = false;
  axisToggle.hidden = !is3d;
  axesToggle.hidden = !is3d;
  const lightToggle = document.getElementById("lightToggle");
  lightToggle.hidden = !is3d;
  lightToggle.setAttribute("aria-pressed", String(board.light.on));
  gridToggle.setAttribute("aria-pressed", String(board.showGrid));
  axisToggle.setAttribute("aria-pressed", String(board.showAxisValues));
  const axesOn = board.axes.x.visible || board.axes.y.visible || board.axes.z.visible;
  axesToggle.setAttribute("aria-pressed", String(axesOn));
  const legendToggle = document.getElementById("legendToggle");
  if (legendToggle) legendToggle.setAttribute("aria-pressed", String(board.showLegend));
  readoutEl.textContent = graphHelp();
  syncAxisFields();
  renderPresets();
}

function syncAxisFields() {
  for (const axis of ["x", "y", "z"]) {
    const field = document.querySelector(`.axis-field[data-axis="${axis}"]`);
    const color = document.getElementById(`axisColor${axis.toUpperCase()}`);
    const show = document.getElementById(`axisShow${axis.toUpperCase()}`);
    const state = board.axes[axis];
    if (field) field.hidden = axis === "z" && board.dimension !== "3d";
    if (color && document.activeElement !== color) color.value = state.color;
    document.documentElement.style.setProperty(`--axis-${axis}`, state.color);
    if (!show) continue;
    show.setAttribute("aria-pressed", String(state.visible));
  }
  const axesToggle = document.getElementById("axesToggle");
  if (axesToggle) {
    const on = board.axes.x.visible || board.axes.y.visible || board.axes.z.visible;
    axesToggle.setAttribute("aria-pressed", String(on));
  }
  syncAxisSpans();
}

function renderPresets() {
  const presets = document.getElementById("presets");
  presets.replaceChildren();
  for (const expr of PRESETS[board.dimension]) {
    const button = el("button", "", expr);
    button.type = "button";
    button.addEventListener("click", () => addGraph(expr));
    presets.append(button);
  }
}

function addGraph(expr) {
  try {
    board.addFunction(expr);
    graphExprEl.value = "";
    readoutEl.textContent = graphHelp();
    closeInputNotice();
  } catch (err) {
    const message = err.message || uiText("오류", "Error");
    if (err && err.name !== "CalcError" && !inputGuide(message)) reportProgram(err);
    else reportInput(message);
  }
}

function bind() {
  document.querySelectorAll(".modes button").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });
  angleBtn.addEventListener("click", () => setAngle(engine.angleMode === "deg" ? "rad" : "deg"));
  notationBtn.addEventListener("click", () => {
    const order = ["norm", "sci", "eng"];
    setNotation(order[(order.indexOf(state.notation) + 1) % order.length]);
  });
  document.getElementById("memClear").addEventListener("click", () => setMemory(0));
  document.getElementById("memRecall").addEventListener("click", () => insertText(formatForChain(state.memory)));
  document.getElementById("memAdd").addEventListener("click", () => {
    try { setMemory(state.memory + currentValue()); } catch (err) { reportInput(err.message, errorSpot(exprEl.value, err.at, err.near)); }
  });
  document.getElementById("memSub").addEventListener("click", () => {
    try { setMemory(state.memory - currentValue()); } catch (err) { reportInput(err.message, errorSpot(exprEl.value, err.at, err.near)); }
  });
  document.getElementById("copyExpr").addEventListener("click", copyMainExpr);
  document.getElementById("copyProg").addEventListener("click", copyMainExpr);
  exprEl.addEventListener("input", () => {
    state.replaceOnNext = false;
    preview();
  });
  exprEl.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === "=") {
      ev.preventDefault();
      equals();
      return;
    }
    if (ev.key === "Escape") {
      ev.preventDefault();
      clearCalc();
      return;
    }
    if (ev.key === "Backspace" && state.replaceOnNext) {
      ev.preventDefault();
      clearCalc();
      return;
    }
    if (state.replaceOnNext && ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      ev.preventDefault();
      const op = /[+\-*/^%]/.test(ev.key);
      state.replaceOnNext = false;
      if (op) {
        exprEl.value = formatForChain(engine.ans);
        exprEl.setSelectionRange(exprEl.value.length, exprEl.value.length);
        insertText(ev.key);
      } else {
        exprEl.value = "";
        insertText(ev.key);
      }
    }
  });
  progExprEl.addEventListener("input", updateProg);
  progExprEl.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === "=") {
      ev.preventDefault();
      commitProg();
      return;
    }
    if (/^[0-9a-fA-F]$/.test(ev.key) && progExprEl.value === "0") {
      progExprEl.value = "";
    }
  });
  document.getElementById("bases").addEventListener("click", (ev) => {
    const button = ev.target.closest("button[data-base]");
    if (button) setBase(Number(button.dataset.base));
  });
  document.getElementById("bitRow").addEventListener("click", (ev) => {
    const button = ev.target.closest("button[data-bits]");
    if (button) setBits(Number(button.dataset.bits));
  });
  document.getElementById("addFn").addEventListener("click", () => addGraph(graphExprEl.value));
  graphExprEl.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      addGraph(graphExprEl.value);
    }
  });
  document.getElementById("zoomIn").addEventListener("click", () => board.zoom(0.75));
  document.getElementById("zoomOut").addEventListener("click", () => board.zoom(1.3333));
  document.getElementById("resetView").addEventListener("click", () => board.resetView());
  document.getElementById("dim2d").addEventListener("click", () => board.setDimension("2d"));
  document.getElementById("dim3d").addEventListener("click", () => board.setDimension("3d"));
  document.getElementById("gridToggle").addEventListener("click", () => {
    board.toggleGrid();
    syncGraphChrome();
  });
  document.getElementById("lightToggle").addEventListener("click", () => {
    board.toggleLight();
    syncGraphChrome();
  });
  document.getElementById("legendToggle").addEventListener("click", () => {
    board.toggleLegend();
    syncGraphChrome();
  });
  document.getElementById("plot").addEventListener("dblclick", (ev) => {
    const point = board.eventPoint(ev);
    const hit = board.legendAt(point.px, point.py);
    if (hit) openLegendEditor(hit.id, hit);
  });
  document.getElementById("plot").addEventListener("click", (ev) => {
    if (ev.detail > 1) return;
    const point = board.eventPoint(ev);
    const chip = board.legendChipAt(point.px, point.py);
    if (chip) openLegendColor(chip, ev.isTrusted);
  });
  const legendColor = document.getElementById("legendColor");
  legendColor.addEventListener("input", () => {
    const id = Number(legendColor.dataset.fn);
    if (!Number.isFinite(id)) return;
    board.setFunctionColor(id, legendColor.value);
    renderFunctions();
  });
  legendColor.addEventListener("change", () => {
    legendColor.hidden = true;
  });
  legendColor.addEventListener("blur", () => {
    legendColor.hidden = true;
  });
  const legendEditor = document.getElementById("legendEditor");
  let legendCancel = false;
  legendEditor.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      legendEditor.blur();
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      legendCancel = true;
      legendEditor.hidden = true;
      legendEditor.blur();
      board.draw();
    }
  });
  legendEditor.addEventListener("blur", () => {
    if (legendCancel) {
      legendCancel = false;
      legendEditor.hidden = true;
      return;
    }
    if (legendEditor.hidden || board.selectedId == null) return;
    board.setLegendText(board.selectedId, legendEditor.value);
    legendEditor.hidden = true;
  });
  document.getElementById("axisToggle").addEventListener("click", () => {
    board.toggleAxisValues();
    syncGraphChrome();
  });
  document.getElementById("axesToggle").addEventListener("click", () => {
    board.toggleAxes();
    syncGraphChrome();
  });
  for (const axis of ["x", "y", "z"]) {
    const color = document.getElementById(`axisColor${axis.toUpperCase()}`);
    const show = document.getElementById(`axisShow${axis.toUpperCase()}`);
    color.addEventListener("input", () => board.setAxisColor(axis, color.value));
    show.addEventListener("click", () => {
      board.toggleAxis(axis);
      syncAxisFields();
    });
  }
  bindAxisSpans();
  document.getElementById("helpGraph").addEventListener("click", () => openChildWindow("help"));
  renderPresets();
  document.getElementById("plot").addEventListener("pointermove", () => {
    if (board.hoverLabel) readoutEl.textContent = board.hoverLabel;
  });
  document.addEventListener("keydown", (ev) => {
    if (state.mode === "graph") return;
    const active = document.activeElement;
    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
    if (state.mode === "programmer") {
      if (ev.key === "Enter" || ev.key === "=") commitProg();
      else if (ev.key === "Escape") {
        progExprEl.value = "";
        updateProg();
      } else if (ev.key === "Backspace") backspace(progExprEl, updateProg);
      else if (/^[0-9a-fA-F+\-*/%()&|^~<>]$/.test(ev.key)) insertProg(ev.key.toUpperCase());
      return;
    }
    if (state.mode === "currency" || state.mode === "unit") {
      typeConverterKey(ev.key);
      return;
    }
    if (ev.key === "Enter") equals();
    else if (ev.key === "Escape") clearCalc();
    else if (ev.key === "Backspace") backspace(exprEl);
    else if (/^[0-9.+\-*/%^()!]$/.test(ev.key)) insertText(ev.key);
  });
}

// The converter screens have no expression, so the keyboard edits the amount.
function typeConverterKey(key) {
  const unitMode = state.mode === "unit";
  const amount = unitMode ? state.unit.amount : state.currency.amount;
  const setAmount = unitMode ? setUnitAmount : setCurrencyAmount;
  if (key === "Escape") setAmount("0");
  else if (key === "Backspace") setAmount(amount.slice(0, -1) || "0");
  else if (/^[0-9.]$/.test(key)) {
    if (unitMode) typeUnit(key);
    else typeCurrency(key);
  } else if (key === "-" && unitMode) toggleUnitSign();
}

const infoSheet = document.getElementById("infoSheet");
const settingsSheet = document.getElementById("settingsSheet");
let activeThemeId = "dark-1";

function renderThemeGroups() {
  for (const group of ["dark", "light"]) {
    const host = document.getElementById(group === "dark" ? "darkThemes" : "lightThemes");
    host.replaceChildren();
    for (const theme of THEMES.filter((item) => item.group === group)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "theme-chip";
      button.setAttribute("aria-pressed", String(theme.id === activeThemeId));
      const dots = document.createElement("span");
      dots.className = "theme-dots";
      for (const color of [theme.vars["--bg"], theme.vars["--op"], theme.vars["--eq"]]) {
        const dot = document.createElement("i");
        dot.style.background = color;
        dots.append(dot);
      }
      button.append(dots, el("span", "theme-name", themeLabel(theme)));
      button.addEventListener("click", () => selectPreset(theme));
      host.append(button);
    }
  }
}

function publishUi(message) {
  if (uiChannel) uiChannel.postMessage(message);
}

// Both keypad choices show a small preview, so the 0 position is plain to see.
function renderPadChoices() {
  const host = document.getElementById("padChoices");
  if (!host) return;
  host.replaceChildren();
  for (const order of KEYPAD_ORDERS) {
    const button = el("button", "pad-chip");
    button.type = "button";
    button.dataset.order = order;
    button.setAttribute("aria-pressed", String(order === state.keypad));
    const label = t(order === "123" ? "keypad123" : "keypad789");
    button.setAttribute("aria-label", label);
    button.dataset.tooltip = label;
    const view = el("div", "pad-view");
    const rows = order === "123"
      ? [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"]]
      : [["7", "8", "9"], ["4", "5", "6"], ["1", "2", "3"]];
    for (const trio of rows) {
      for (const digit of trio) view.append(el("i", "", digit));
    }
    view.append(el("i", "pad-blank"), el("i", "pad-zero", "0"), el("i", "pad-blank"));
    button.append(view, el("span", "pad-name", order === "123" ? "1 2 3" : "7 8 9"));
    button.addEventListener("click", () => setKeypad(order));
    host.append(button);
  }
}

function setKeypad(order) {
  if (!KEYPAD_ORDERS.includes(order)) return;
  state.keypad = order;
  try {
    localStorage.setItem(KEYPAD_KEY, order);
  } catch {
    /* The arrangement then lasts only as long as this window. */
  }
  renderKeys();
  renderPadChoices();
  publishUi({ type: "keypad", order });
}

function applyStoredKeypad() {
  const order = readStoredKeypad();
  if (order === state.keypad) return;
  state.keypad = order;
  renderKeys();
  renderPadChoices();
}

function applyStoredTheme() {
  const stored = loadTheme();
  activeThemeId = stored?.id || "dark-1";
  if (!settingsSheet.hidden) {
    renderCustomFields(stored?.picks);
    renderThemeGroups();
  }
}

function syncWindowTitle() {
  const root = document.documentElement;
  if (root.classList.contains("settings-pop")) document.title = `${t("settingsTitle")} — MyCalc 10.0`;
  else if (root.classList.contains("info-pop")) document.title = `${t("infoTitle")} — MyCalc 10.0`;
  else if (root.classList.contains("graph-pop")) document.title = "MyCalc 10.0 Graph";
  else if (root.classList.contains("print-pop")) document.title = `${t("printTitle")} — MyCalc 10.0`;
}

function resetSettings() {
  const theme = themeById("dark-1") || THEMES[0];
  activeThemeId = theme.id;
  applyTheme(theme);
  storeTheme({ id: theme.id });
  renderCustomFields();
  renderThemeGroups();
  publishUi({ type: "theme" });
  setKeypad(KEYPAD_ORDERS[0]);
}

function selectPreset(theme) {
  activeThemeId = theme.id;
  applyTheme(theme);
  storeTheme({ id: theme.id });
  renderThemeGroups();
  publishUi({ type: "theme" });
}

function customPicks() {
  const picks = {};
  for (const input of document.querySelectorAll("#customFields input[data-custom]")) {
    picks[input.dataset.custom] = input.value;
  }
  return picks;
}

function renderCustomFields(picks) {
  const host = document.getElementById("customFields");
  host.replaceChildren();
  const defaults = {
    bg: "#100e0c",
    card: "#1c1917",
    screen: "#0c0a09",
    ink: "#fafaf9",
    key: "#292524",
    op: "#9a3412",
    eq: "#ea580c",
  };
  for (const [key] of CUSTOM_FIELDS) {
    const field = document.createElement("label");
    field.textContent = t("field." + key);
    const input = document.createElement("input");
    input.type = "color";
    input.dataset.custom = key;
    input.value = picks?.[key] || defaults[key];
    field.append(input);
    host.append(field);
  }
}

function applyCustomTheme() {
  const next = customPicks();
  activeThemeId = "custom";
  applyTheme(themeFromCustom(next));
  storeTheme({ id: "custom", picks: next });
  renderThemeGroups();
  publishUi({ type: "theme" });
}

// ---- currency ----

function currencyStore() {
  try {
    const saved = JSON.parse(localStorage.getItem("mycalc-currency"));
    if (saved && typeof saved.from === "string" && typeof saved.to === "string") {
      state.currency.from = saved.from;
      state.currency.to = saved.to;
      if (typeof saved.amount === "string") state.currency.amount = saved.amount;
    }
  } catch {
    /* The defaults are fine when storage is unavailable. */
  }
}

function rememberCurrency() {
  try {
    localStorage.setItem("mycalc-currency", JSON.stringify(state.currency));
  } catch {
    /* Nothing to remember in a private window. */
  }
}

function renderCurrencyOptions() {
  const codes = rateCodes(rateTable);
  if (!codes.includes(state.currency.from)) state.currency.from = codes[0] || "USD";
  if (!codes.includes(state.currency.to)) state.currency.to = codes[1] || "USD";
  for (const [id, picked] of [["rateFrom", state.currency.from], ["rateTo", state.currency.to]]) {
    const select = document.getElementById(id);
    select.replaceChildren();
    for (const code of codes) {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = `${code} \u00b7 ${rateName(code, uiLang)}`;
      select.append(option);
    }
    select.value = picked;
  }
}

function currencyAmount() {
  const value = Number(state.currency.amount);
  return Number.isFinite(value) ? value : 0;
}

function renderCurrency() {
  const { from, to } = state.currency;
  const amountEl = document.getElementById("rateAmount");
  if (document.activeElement !== amountEl) amountEl.value = state.currency.amount;
  const converted = convertRate(currencyAmount(), from, to, rateTable);
  document.getElementById("rateResult").textContent = formatMoney(converted, to);
  const unit = convertRate(1, from, to, rateTable);
  const note = document.getElementById("rateNote");
  note.textContent = Number.isFinite(unit) ? `1 ${from} = ${formatMoney(unit, to)} ${to}` : "";
  const state_ = document.getElementById("rateState");
  const stamp = rateTable.stamp ? ` \u00b7 ${rateTable.stamp}` : "";
  if (rateBusy) {
    state_.textContent = `${t("rateLoading")}\u2026`;
    state_.dataset.live = "wait";
  } else if (rateTable.live) {
    state_.textContent = `${t("rateLive")}${stamp}`;
    state_.dataset.live = "yes";
  } else {
    state_.textContent = `${t("rateOffline")}${stamp}`;
    state_.dataset.live = "no";
  }
  document.getElementById("rateRefresh").dataset.busy = rateBusy ? "yes" : "no";
}

function setCurrencyAmount(text) {
  state.currency.amount = text;
  rememberCurrency();
  renderCurrency();
}

function typeCurrency(text) {
  const current = state.currency.amount === "0" && text !== "." ? "" : state.currency.amount;
  if (text === "." && current.includes(".")) return;
  const next = (current + text).slice(0, 15);
  setCurrencyAmount(next || "0");
}

function swapCurrency() {
  const { from, to } = state.currency;
  state.currency.from = to;
  state.currency.to = from;
  rememberCurrency();
  renderCurrencyOptions();
  renderCurrency();
}

async function refreshRates(asked) {
  if (rateBusy) return;
  if (!asked && !ratesStale(rateTable)) {
    renderCurrency();
    return;
  }
  rateBusy = true;
  renderCurrency();
  try {
    const table = await fetchRates();
    rateTable = table;
    storeRates(table);
  } catch {
    // The last rates stay in use until the network comes back.
    if (rateTable.live) rateTable = { ...rateTable, live: false };
  } finally {
    rateBusy = false;
    renderCurrencyOptions();
    renderCurrency();
  }
}

function openCurrency() {
  renderCurrencyOptions();
  renderCurrency();
  if (!rateAsked) {
    rateAsked = true;
    refreshRates(false);
  }
}

// ---- units ----

function rememberUnit() {
  storeUnitPick(state.unit);
}

function renderUnitOptions() {
  const groupSelect = document.getElementById("unitGroup");
  if (!groupSelect) return;
  groupSelect.replaceChildren();
  for (const group of UNIT_GROUPS) {
    const option = document.createElement("option");
    option.value = group.id;
    option.textContent = unitGroupLabel(group, uiLang);
    groupSelect.append(option);
  }
  groupSelect.value = state.unit.group;
  const group = unitGroupById(state.unit.group);
  for (const [id, picked] of [["unitFrom", state.unit.from], ["unitTo", state.unit.to]]) {
    const select = document.getElementById(id);
    select.replaceChildren();
    for (const unit of group.units) {
      const option = document.createElement("option");
      option.value = unit.id;
      option.textContent = `${unit.symbol} \u00b7 ${unitLabel(unit, uiLang)}`;
      select.append(option);
    }
    select.value = picked;
  }
}

function unitAmount() {
  const value = Number(state.unit.amount);
  return Number.isFinite(value) ? value : 0;
}

function renderUnit() {
  const amountEl = document.getElementById("unitAmount");
  if (!amountEl) return;
  const { group, from, to } = state.unit;
  if (document.activeElement !== amountEl) amountEl.value = state.unit.amount;
  const converted = convertUnit(unitAmount(), group, from, to);
  document.getElementById("unitResult").textContent = formatUnit(converted);
  const pack = unitGroupById(group);
  const fromUnit = unitById(pack, from);
  const toUnit = unitById(pack, to);
  const note = document.getElementById("unitNote");
  if (!fromUnit || !toUnit || !Number.isFinite(converted)) {
    note.textContent = "";
    return;
  }
  // Temperature carries an offset, so a one-unit rate would read as wrong.
  if (pack.id === "temperature") {
    note.textContent = `${formatUnit(unitAmount())} ${fromUnit.symbol} = ${formatUnit(converted)} ${toUnit.symbol}`;
  } else {
    note.textContent = `1 ${fromUnit.symbol} = ${formatUnit(convertUnit(1, group, from, to))} ${toUnit.symbol}`;
  }
}

function setUnitAmount(text) {
  state.unit.amount = text;
  rememberUnit();
  renderUnit();
}

function typeUnit(text) {
  const sign = state.unit.amount.startsWith("-") ? "-" : "";
  const body = sign ? state.unit.amount.slice(1) : state.unit.amount;
  const current = body === "0" && text !== "." ? "" : body;
  if (text === "." && current.includes(".")) return;
  const next = (current + text).slice(0, 18);
  setUnitAmount(sign + (next || "0"));
}

function toggleUnitSign() {
  const amount = state.unit.amount;
  setUnitAmount(amount.startsWith("-") ? amount.slice(1) : `-${amount}`);
}

function swapUnit() {
  const { from, to } = state.unit;
  state.unit.from = to;
  state.unit.to = from;
  rememberUnit();
  renderUnitOptions();
  renderUnit();
}

function setUnitGroup(id) {
  const group = unitGroupById(id);
  if (!group) return;
  const [from, to] = unitDefaultPair(group.id);
  state.unit.group = group.id;
  state.unit.from = from;
  state.unit.to = to;
  rememberUnit();
  renderUnitOptions();
  renderUnit();
}

function openUnit() {
  renderUnitOptions();
  renderUnit();
}

function bindUnit() {
  const amount = document.getElementById("unitAmount");
  amount.addEventListener("input", () => {
    const cleaned = amount.value
      .replace(/[^0-9.-]/g, "")
      .replace(/(?!^)-/g, "")
      .replace(/(\..*)\./g, "$1");
    if (cleaned !== amount.value) amount.value = cleaned;
    state.unit.amount = cleaned || "0";
    rememberUnit();
    renderUnit();
  });
  document.getElementById("unitGroup").addEventListener("change", (ev) => setUnitGroup(ev.target.value));
  for (const [id, key] of [["unitFrom", "from"], ["unitTo", "to"]]) {
    document.getElementById(id).addEventListener("change", (ev) => {
      state.unit[key] = ev.target.value;
      rememberUnit();
      renderUnit();
    });
  }
  document.getElementById("unitSwap").addEventListener("click", swapUnit);
  renderUnitOptions();
  renderUnit();
}

// The expression panel can be widened with the bar beside it.
function bindGraphPanel() {
  const split = document.getElementById("graphSplit");
  if (!split) return;
  const least = 150;
  const most = () => Math.max(least, Math.round(window.innerWidth * 0.6));
  const setPanel = (width) => {
    const value = Math.round(Math.min(most(), Math.max(least, width)));
    document.documentElement.style.setProperty("--panel", `${value}px`);
    try {
      localStorage.setItem("mycalc-graph-panel", String(value));
    } catch {
      /* The width simply starts over next time. */
    }
    board.resize();
  };
  let saved = 0;
  try {
    saved = Number(localStorage.getItem("mycalc-graph-panel"));
  } catch {
    saved = 0;
  }
  if (Number.isFinite(saved) && saved >= least) setPanel(saved);
  split.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    try {
      split.setPointerCapture(ev.pointerId);
    } catch {
      /* Synthetic pointers cannot be captured. */
    }
    const startX = ev.clientX;
    const startWidth = document.getElementById("fnList").getBoundingClientRect().width;
    const move = (event) => {
      if (event.pointerId !== ev.pointerId) return;
      setPanel(startWidth + (event.clientX - startX));
    };
    const up = (event) => {
      if (event.pointerId !== ev.pointerId) return;
      split.removeEventListener("pointermove", move);
      split.removeEventListener("pointerup", up);
    };
    split.addEventListener("pointermove", move);
    split.addEventListener("pointerup", up);
  });
}

// The graph window carries a list on the left and settings on the right.
function layoutGraphPanels() {
  const body = document.querySelector("#screenGraph .graph-body");
  if (!body || !graphPopup) return;
  const list = document.getElementById("fnList");
  const split = document.getElementById("graphSplit");
  const side = document.getElementById("graphSide");
  const left = !list.hidden;
  const right = !side.hidden;
  const columns = [];
  if (left) columns.push("var(--panel, 210px)", "10px");
  columns.push("minmax(0, 1fr)");
  if (right) columns.push("240px");
  body.style.gridTemplateColumns = columns.join(" ");
  split.hidden = !left;
  document.getElementById("panelLeft").setAttribute("aria-pressed", String(left));
  document.getElementById("panelRight").setAttribute("aria-pressed", String(right));
  syncSidePanel();
  requestAnimationFrame(() => board.resize());
}

function toggleGraphPanel(which) {
  const panel = document.getElementById(which === "left" ? "fnList" : "graphSide");
  panel.hidden = !panel.hidden;
  try {
    localStorage.setItem(`mycalc-panel-${which}`, panel.hidden ? "off" : "on");
  } catch {
    /* The choice simply starts over next time. */
  }
  layoutGraphPanels();
}

function syncSidePanel() {
  const side = document.getElementById("graphSide");
  if (!side || side.hidden) return;
  const degrees = (value) => Math.round((value * 180) / Math.PI);
  const set = (id, value, label) => {
    const input = document.getElementById(id);
    if (document.activeElement !== input) input.value = String(value);
    document.getElementById(`${id}Out`).textContent = label;
  };
  document.getElementById("sideLightOn").checked = board.light.on;
  set("sideLightTurn", degrees(board.light.azimuth), `${degrees(board.light.azimuth)}\u00b0`);
  set("sideLightRise", degrees(board.light.elevation), `${degrees(board.light.elevation)}\u00b0`);
  const far = Math.round(board.lightReach() * 100);
  set("sideLightFar", far, (far / 100).toFixed(2));
}

function bindSidePanel() {
  const side = document.getElementById("graphSide");
  if (!side) return;
  const turn = document.getElementById("sideLightTurn");
  const rise = document.getElementById("sideLightRise");
  const far = document.getElementById("sideLightFar");
  const lit = document.getElementById("sideLightOn");
  const apply = () => {
    board.setLight({
      on: lit.checked,
      azimuth: (Number(turn.value) * Math.PI) / 180,
      elevation: (Number(rise.value) * Math.PI) / 180,
      reach: Number(far.value) / 100,
    });
    syncGraphChrome();
    syncSidePanel();
    publishGraph();
  };
  for (const input of [turn, rise, far]) input.addEventListener("input", apply);
  lit.addEventListener("change", apply);
}

function bindCurrency() {
  currencyStore();
  const amount = document.getElementById("rateAmount");
  amount.addEventListener("input", () => {
    const cleaned = amount.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
    if (cleaned !== amount.value) amount.value = cleaned;
    state.currency.amount = cleaned || "0";
    rememberCurrency();
    renderCurrency();
  });
  for (const [id, key] of [["rateFrom", "from"], ["rateTo", "to"]]) {
    document.getElementById(id).addEventListener("change", (ev) => {
      state.currency[key] = ev.target.value;
      rememberCurrency();
      renderCurrency();
    });
  }
  document.getElementById("rateSwap").addEventListener("click", swapCurrency);
  document.getElementById("rateRefresh").addEventListener("click", () => refreshRates(true));
  window.addEventListener("online", () => refreshRates(true));
  window.addEventListener("offline", () => {
    if (rateTable.live) rateTable = { ...rateTable, live: false };
    renderCurrency();
  });
  renderCurrencyOptions();
  renderCurrency();
}

function openSheet(sheet) {
  infoSheet.hidden = sheet !== infoSheet;
  settingsSheet.hidden = sheet !== settingsSheet;
}

function closeSheets() {
  infoSheet.hidden = true;
  settingsSheet.hidden = true;
}

// The settings are either their own window or a sheet over the pad, so closing
// means two different things and every exit from them goes through here.
function closeSettingsView() {
  if (pageKind === "settings") window.close();
  else closeSheets();
}

// The help is written once in i18n and laid out here, so a section reads the
// same in both languages and nothing has to be kept in step by hand.
function renderHelp() {
  const doc = document.getElementById("helpDoc");
  if (!doc || typeof graphHelpDoc !== "function") return;
  doc.replaceChildren();
  for (const section of graphHelpDoc()) {
    const block = el("section", "help-part");
    block.append(el("h3", "", section.title));
    for (const note of section.notes || []) block.append(el("p", "help-note", note));
    if (section.rows && section.rows.length) {
      const list = el("dl", "help-rows");
      for (const [typed, means] of section.rows) {
        list.append(el("dt", "", typed), el("dd", "", means));
      }
      block.append(list);
    }
    doc.append(block);
  }
}

function packFunctions(list) {
  return list.map((fn) => ({
    expr: fn.expr,
    visible: fn.visible,
    color: fn.color,
    legend: fn.legend !== false,
    legendText: fn.legendText || "",
  }));
}

function sameFunctions(list, incoming) {
  return list.length === incoming.length && incoming.every((item, index) => list[index].expr === item.expr && list[index].visible === item.visible);
}

function rebuildFunctions(list, incoming) {
  const dim = list === board.fns3d ? "3d" : "2d";
  list.splice(0, list.length);
  const saved = board.dimension;
  board.dimension = dim;
  for (const item of incoming) {
    try {
      board.addFunction(item.expr);
      const fn = board.functions[board.functions.length - 1];
      if (fn) {
        fn.visible = item.visible !== false;
        if (item.color) fn.color = item.color;
        fn.legend = item.legend !== false;
        fn.legendText = typeof item.legendText === "string" ? item.legendText : "";
      }
    } catch {
      /* Skip an expression the other window could not share. */
    }
  }
  board.dimension = saved;
  board.view = board.views[saved];
  board.meshKey = "";
}

function applyFunctionList(list, incoming) {
  if (!sameFunctions(list, incoming)) rebuildFunctions(list, incoming);
  incoming.forEach((item, index) => {
    const fn = list[index];
    if (!fn) return;
    if (item.color) fn.color = item.color;
    fn.legend = item.legend !== false;
    fn.legendText = typeof item.legendText === "string" ? item.legendText : "";
  });
}

function snapshotGraph() {
  return {
    dimension: board.dimension,
    showGrid: board.showGrid,
    showAxisValues: board.showAxisValues,
    showLegend: board.showLegend,
    legendPos: board.legendPos ? { ...board.legendPos } : null,
    views: {
      "2d": { ...board.views["2d"] },
      "3d": { ...board.views["3d"] },
    },
    camera: { ...board.camera },
    light: { ...board.light },
    floorZ: Number.isFinite(board.floorZ) ? board.floorZ : null,
    zAuto: board.zAuto !== false,
    stretched: board.stretched === true,
    axes: {
      x: { ...board.axes.x },
      y: { ...board.axes.y },
      z: { ...board.axes.z },
    },
    fns2d: packFunctions(board.fns2d),
    fns3d: packFunctions(board.fns3d),
  };
}

let publishTimer = 0;
let publishAgain = false;

// Repainting is cheap, broadcasting is not, so sharing waits its turn.
function schedulePublish() {
  if (publishTimer) {
    publishAgain = true;
    return;
  }
  publishGraph();
  publishTimer = setTimeout(() => {
    publishTimer = 0;
    if (!publishAgain) return;
    publishAgain = false;
    schedulePublish();
  }, 120);
}

let lastGraphText = "";

function publishGraph() {
  if (!graphChannel || applyingGraph || !graphReady || (pageKind && !graphPopup)) return;
  const state = snapshotGraph();
  const text = JSON.stringify(state);
  if (text === lastGraphText) return;
  lastGraphText = text;
  graphRevision = Math.max(Date.now(), graphRevision + 1);
  rememberedGraph = state;
  graphChannel.postMessage({ type: "state", id: graphWindowId, revision: graphRevision, state });
}

function applyGraphState(state) {
  if (!state || !state.views) return;
  graphReady = true;
  applyingGraph = true;
  // What we were just told is not news worth repeating.
  lastGraphText = JSON.stringify(state);
  try {
    board.showGrid = !!state.showGrid;
    board.showAxisValues = state.showAxisValues !== false;
    board.showLegend = state.showLegend !== false;
    if ("legendPos" in state) board.legendPos = state.legendPos ? { ...state.legendPos } : null;
    if (state.axes) {
      for (const axis of ["x", "y", "z"]) {
        if (!state.axes[axis]) continue;
        if (state.axes[axis].color) board.axes[axis].color = state.axes[axis].color;
        if (typeof state.axes[axis].visible === "boolean") board.axes[axis].visible = state.axes[axis].visible;
      }
    }
    applyFunctionList(board.fns2d, state.fns2d || []);
    applyFunctionList(board.fns3d, state.fns3d || []);
    Object.assign(board.views["2d"], state.views["2d"]);
    Object.assign(board.views["3d"], state.views["3d"]);
    const dim = state.dimension === "3d" ? "3d" : "2d";
    board.dimension = dim;
    board.view = board.views[dim];
    board.canvas.classList.toggle("is-3d", dim === "3d");
    Object.assign(board.camera, state.camera || {});
    if (state.light) Object.assign(board.light, state.light);
    board.floorZ = Number.isFinite(state.floorZ) ? state.floorZ : null;
    board.zAuto = state.zAuto !== false;
    board.stretched = state.stretched === true;
    board.meshKey = "";
    board.draw();
    syncGraphChrome();
    renderFunctions();
    syncViewFields();
    syncSidePanel();
  } finally {
    applyingGraph = false;
  }
}

function bindTooltips() {
  const tip = document.createElement("div");
  tip.className = "tooltip";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  document.body.append(tip);
  let current = null;

  function hide() {
    current = null;
    tip.hidden = true;
  }

  function place(el) {
    const text = el.dataset.tooltip;
    if (!text) return;
    current = el;
    tip.textContent = text;
    tip.hidden = false;
    const rect = el.getBoundingClientRect();
    const box = tip.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - box.width / 2;
    let top = rect.top - box.height - 8;
    if (top < 6) top = rect.bottom + 8;
    left = Math.max(6, Math.min(left, window.innerWidth - box.width - 6));
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
  }

  document.addEventListener("pointerover", (ev) => {
    const el = ev.target.closest && ev.target.closest("[data-tooltip]");
    if (el && el.dataset.tooltip) place(el);
  });
  document.addEventListener("pointerout", (ev) => {
    if (!current) return;
    const next = ev.relatedTarget && ev.relatedTarget.closest && ev.relatedTarget.closest("[data-tooltip]");
    if (next !== current) hide();
  });
  document.addEventListener("focusin", (ev) => {
    const el = ev.target.closest && ev.target.closest("[data-tooltip]");
    if (el && el.dataset.tooltip) place(el);
  });
  document.addEventListener("focusout", hide);
  document.addEventListener("pointerdown", hide);
  window.addEventListener("scroll", hide, true);
}

const PRINT_PAPERS = {
  A4: [210, 297],
  A3: [297, 420],
  A5: [148, 210],
  Letter: [216, 279],
  Legal: [216, 356],
  B5: [182, 257],
};
let printImageUrl = "";

function capturePrintImage() {
  const canvas = document.getElementById("plot");
  if (!canvas) return "";
  const previous = board.paintBackdrop;
  board.paintBackdrop = true;
  board.draw();
  try {
    printImageUrl = canvas.toDataURL("image/png");
  } catch {
    printImageUrl = "";
  } finally {
    board.paintBackdrop = previous;
    board.draw();
  }
  return printImageUrl;
}

function sendPrintImage() {
  if (!printImageUrl) capturePrintImage();
  if (graphChannel && printImageUrl) graphChannel.postMessage({ type: "print-image", id: graphWindowId, image: printImageUrl });
}

const HEADING_FONTS = {
  malgun: '"Malgun Gothic", "맑은 고딕", sans-serif',
  gulim: 'Gulim, "굴림", sans-serif',
  dotum: 'Dotum, "돋움", sans-serif',
  batang: 'Batang, "바탕", serif',
  gungsuh: 'Gungsuh, "궁서", serif',
  segoe: '"Segoe UI", sans-serif',
  arial: "Arial, sans-serif",
  times: '"Times New Roman", Times, serif',
  georgia: "Georgia, serif",
  consolas: 'Consolas, "Cascadia Mono", monospace',
};

function headingFontFamily(id) {
  return HEADING_FONTS[id] || HEADING_FONTS.malgun;
}

function headingSizePt() {
  const value = Number(document.getElementById("printHeadingSize").value);
  return Math.min(72, Math.max(6, Math.round(Number.isFinite(value) ? value : 13)));
}

function marginMm(id) {
  const el = document.getElementById(id);
  return Math.min(40, Math.max(0, Number(el && el.value) || 0));
}

function printSetup() {
  const paperName = document.getElementById("printPaper").value;
  const paper = PRINT_PAPERS[paperName] || PRINT_PAPERS.A4;
  const landscape = document.getElementById("printOrient").value === "landscape";
  const width = landscape ? paper[1] : paper[0];
  const height = landscape ? paper[0] : paper[1];
  const cap = Math.min(width, height) / 4;
  const side = (id) => Math.min(cap, marginMm(id));
  const copies = Math.min(99, Math.max(1, Math.round(Number(document.getElementById("printCopies").value) || 1)));
  const clip = (id) => {
    const el = document.getElementById(id);
    return el ? el.value.trim().slice(0, 80) : "";
  };
  const align = document.getElementById("printHeadingAlign").value;
  const border = document.getElementById("printBorderStyle").value;
  const scale = Math.min(200, Math.max(50, Math.round(Number(document.getElementById("printScale").value) || 100)));
  return {
    paper: PRINT_PAPERS[paperName] ? paperName : "A4",
    landscape,
    width,
    height,
    marginTop: side("printMargin"),
    marginRight: side("printMarginRight"),
    marginBottom: side("printMarginBottom"),
    marginLeft: side("printMarginLeft"),
    copies,
    heading: clip("printHeadingText"),
    align: align === "left" || align === "right" ? align : "center",
    headingFont: headingFontFamily(document.getElementById("printHeadingFont").value),
    headingPt: headingSizePt(),
    footer: clip("printFooterText"),
    borderOn: document.getElementById("printBorder").checked,
    border: border === "dashed" || border === "double" ? border : "solid",
    scale,
    color: document.getElementById("printColor").value !== "gray",
    pageNumber: document.getElementById("printPageNumber").checked,
    showDate: document.getElementById("printDate").checked,
  };
}

function printFooterLine(setup) {
  const parts = [];
  if (setup.footer) parts.push(setup.footer);
  if (setup.showDate) parts.push(new Date().toLocaleDateString(uiLang === "en" ? "en-US" : "ko-KR"));
  if (setup.pageNumber) parts.push(t("pageMark"));
  return parts.join("   ");
}

function layoutPrintPreview() {
  const preview = document.getElementById("printPreview");
  const page = document.getElementById("printPage");
  const style = document.getElementById("printPageStyle");
  if (!preview || !page) return;
  const setup = printSetup();
  const box = preview.getBoundingClientRect();
  const scale = Math.min((box.width - 36) / setup.width, (box.height - 36) / setup.height);
  const px = Math.max(0.2, scale);
  page.style.width = `${setup.width * px}px`;
  page.style.height = `${setup.height * px}px`;
  page.style.padding = `${setup.marginTop * px}px ${setup.marginRight * px}px ${setup.marginBottom * px}px ${setup.marginLeft * px}px`;
  const heading = document.getElementById("printHeading");
  const footer = document.getElementById("printFooter");
  const frame = document.getElementById("printFrame");
  const image = document.getElementById("printImage");
  const borderStyle = document.getElementById("printBorderStyle");
  if (borderStyle) borderStyle.disabled = !setup.borderOn;
  if (heading) {
    heading.hidden = !setup.heading;
    heading.textContent = setup.heading;
    heading.style.textAlign = setup.align;
    heading.style.fontFamily = setup.headingFont;
    heading.style.fontSize = `${(setup.headingPt * 25.4 / 72) * px}px`;
    heading.style.marginBottom = setup.heading ? `${1.5 * px}px` : "0";
  }
  if (footer) {
    const line = printFooterLine(setup);
    footer.hidden = !line;
    footer.textContent = line;
    footer.style.textAlign = setup.align;
    footer.style.fontSize = `${3.2 * px}px`;
    footer.style.marginTop = line ? `${1.5 * px}px` : "0";
  }
  if (frame) {
    const borderMm = setup.border === "double" ? 1.1 : 0.35;
    frame.style.borderStyle = setup.borderOn ? setup.border : "none";
    frame.style.borderWidth = setup.borderOn ? `${borderMm * px}px` : "0";
    frame.style.borderColor = "#1c1917";
    frame.style.padding = setup.borderOn ? `${1.2 * px}px` : "0";
  }
  if (image) {
    image.style.setProperty("--graph-scale", `${setup.scale}%`);
    image.style.filter = setup.color ? "none" : "grayscale(1)";
  }
  if (style) {
    const padding = window.mycalcPrint
      ? "0"
      : `${setup.marginTop}mm ${setup.marginRight}mm ${setup.marginBottom}mm ${setup.marginLeft}mm`;
    const borderMm = setup.borderOn ? (setup.border === "double" ? 1.1 : 0.35) : 0;
    const headingMm = (setup.headingPt * 25.4 / 72).toFixed(2);
    style.textContent = `@page { size: ${setup.width}mm ${setup.height}mm; margin: 0; } @media print { html.print-pop #printPage { width: ${setup.width}mm !important; height: ${setup.height}mm !important; padding: ${padding} !important; } html.print-pop #printHeading { font-family: ${setup.headingFont} !important; font-size: ${headingMm}mm !important; } html.print-pop #printFooter { font-size: 3.2mm !important; } html.print-pop #printFrame { border-width: ${borderMm}mm !important; padding: ${setup.borderOn ? 1.2 : 0}mm !important; } }`;
  }
}

function showPrintImage(image) {
  const page = document.getElementById("printPage");
  const img = document.getElementById("printImage");
  const wait = document.getElementById("printWait");
  const button = document.getElementById("printNow");
  if (!page || !img || !image) return;
  img.src = image;
  page.classList.add("has-graph");
  if (wait) wait.hidden = true;
  if (button) button.disabled = false;
  layoutPrintPreview();
}

async function loadPrinters() {
  const field = document.getElementById("printPrinterField");
  const select = document.getElementById("printPrinter");
  if (!field || !select || !window.mycalcPrint) return;
  const printers = await window.mycalcPrint.printers();
  select.replaceChildren();
  for (const printer of printers) {
    const option = document.createElement("option");
    option.value = printer.name;
    option.textContent = printer.displayName;
    if (printer.isDefault) option.selected = true;
    select.append(option);
  }
  field.hidden = printers.length === 0;
}

async function printGraphPage() {
  const error = document.getElementById("printError");
  if (error) error.textContent = "";
  layoutPrintPreview();
  const setup = printSetup();
  if (window.mycalcPrint) {
    const result = await window.mycalcPrint.print({
      deviceName: document.getElementById("printPrinter").value,
      copies: setup.copies,
      paper: setup.paper,
      landscape: setup.landscape,
      width: Math.round(setup.width * 1000),
      height: Math.round(setup.height * 1000),
      margins: {
        top: Math.round(setup.marginTop * 1000),
        right: Math.round(setup.marginRight * 1000),
        bottom: Math.round(setup.marginBottom * 1000),
        left: Math.round(setup.marginLeft * 1000),
      },
      color: setup.color,
    });
    const reason = result.failureReason || "";
    if (!result.success && reason && !/cancel/i.test(reason)) reportInput(t("printFailed"));
    return;
  }
  window.print();
}

function stepNumber(input, direction) {
  const step = Number(input.step) || 1;
  const min = input.min === "" ? -Infinity : Number(input.min);
  const max = input.max === "" ? Infinity : Number(input.max);
  const current = Number(input.value);
  const base = Number.isFinite(current) ? current : (Number.isFinite(min) ? min : 0);
  const next = Math.min(max, Math.max(min, base + direction * step));
  input.value = String(next);
  syncStepButtons(input);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function syncStepButtons(input) {
  const wrap = input.closest(".num-step");
  if (!wrap) return;
  const value = Number(input.value);
  const min = input.min === "" ? -Infinity : Number(input.min);
  const max = input.max === "" ? Infinity : Number(input.max);
  wrap.querySelector(".step-down").disabled = !(value > min);
  wrap.querySelector(".step-up").disabled = !(value < max);
}

function syncExportAlpha() {
  const format = document.getElementById("exportFormat");
  const field = document.getElementById("exportAlphaField");
  if (!format || !field) return;
  const spec = IMAGE_FORMATS[format.value];
  field.hidden = !spec || !spec.alpha;
}

async function saveGraphImage() {
  const error = document.getElementById("exportError");
  if (error) error.textContent = "";
  const format = document.getElementById("exportFormat").value;
  const spec = IMAGE_FORMATS[format] || IMAGE_FORMATS.png;
  const transparent = !!(spec.alpha && document.getElementById("exportTransparent").checked);
  board.exportTransparent = transparent;
  board.paintBackdrop = !transparent;
  board.draw();
  try {
    const blob = await encodeCanvas(board.canvas, format, transparent);
    const name = `MyCalc-10.0.${spec.ext}`;
    if (window.mycalcDesktop && window.mycalcDesktop.saveFile) {
      const result = await window.mycalcDesktop.saveFile({
        name,
        bytes: new Uint8Array(await blob.arrayBuffer()),
      });
      if (result && result.error) throw new Error(result.error);
    } else {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    }
  } catch (err) {
    if (!err || err.name === "AbortError") return;
    if (inputGuide(err.message)) reportInput(err.message);
    else reportProgram(err);
  } finally {
    board.exportTransparent = false;
    board.paintBackdrop = false;
    board.draw();
  }
}

function bindExport() {
  const button = document.getElementById("exportGraph");
  const sheet = document.getElementById("exportSheet");
  const format = document.getElementById("exportFormat");
  if (!button || !sheet || !format) return;
  button.addEventListener("click", () => {
    sheet.hidden = !sheet.hidden;
    syncExportAlpha();
  });
  format.addEventListener("change", syncExportAlpha);
  document.getElementById("exportCancel").addEventListener("click", () => {
    sheet.hidden = true;
  });
  document.getElementById("exportSave").addEventListener("click", () => {
    saveGraphImage();
  });
  sheet.addEventListener("submit", (ev) => ev.preventDefault());
}

function bindPrintWindow() {
  const form = document.getElementById("printSetup");
  form.addEventListener("submit", (ev) => ev.preventDefault());
  for (const wrap of form.querySelectorAll(".num-step")) {
    const input = wrap.querySelector("input");
    wrap.querySelector(".step-down").addEventListener("click", () => stepNumber(input, -1));
    wrap.querySelector(".step-up").addEventListener("click", () => stepNumber(input, 1));
    input.addEventListener("input", () => syncStepButtons(input));
    syncStepButtons(input);
  }
  for (const id of ["printPaper", "printOrient", "printMargin", "printMarginRight", "printMarginBottom", "printMarginLeft", "printHeadingText", "printHeadingAlign", "printHeadingFont", "printHeadingSize", "printFooterText", "printBorder", "printBorderStyle", "printScale", "printColor", "printPageNumber", "printDate", "printCopies"]) {
    document.getElementById(id).addEventListener("input", () => {
      const error = document.getElementById("printError");
      if (error) error.textContent = "";
      layoutPrintPreview();
    });
  }
  document.getElementById("printNow").addEventListener("click", () => {
    printGraphPage();
  });
  document.getElementById("printCancel").addEventListener("click", () => window.close());
  window.addEventListener("resize", layoutPrintPreview);
  loadPrinters();
  requestAnimationFrame(() => layoutPrintPreview());
  if (graphChannel) graphChannel.postMessage({ type: "print-hello", id: graphWindowId });
}

function openChildWindow(kind) {
  const url = new URL("index.html", location.href);
  url.searchParams.set("pop", kind);
  url.hash = kind;
  const size = kind === "graph" ? "width=1140,height=700" : kind === "print" ? "width=920,height=680" : kind === "settings" ? "width=820,height=560" : kind === "help" ? "width=720,height=640" : "width=560,height=420";
  const resizable = kind === "settings" || kind === "info" ? "resizable=no" : "resizable=yes";
  const child = window.open(url.href, `mycalc-${kind}`, `popup=yes,${size},${resizable}`);
  if (child) child.focus();
  return child;
}

function openPrintWindow() {
  capturePrintImage();
  sendPrintImage();
  openChildWindow("print");
}

function openGraphWindow() {
  openChildWindow("graph");
  publishGraph();
}

function copyMainExpr() {
  const text = (state.mode === "programmer" ? progExprEl.value : exprEl.value).trim();
  if (!text) {
    reportInput(uiText("식을 입력하세요", "Enter an expression"));
    return;
  }
  pendingGraphExpr = text;
  if (graphChannel) graphChannel.postMessage({ type: "expr", id: graphWindowId, text });
  if (graphPopup) useCopiedExpr(text);
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(() => {});
}

function useCopiedExpr(text) {
  const next = String(text || "").trim();
  if (!next) return;
  graphExprEl.value = next;
  graphExprEl.focus();
  graphExprEl.setSelectionRange(next.length, next.length);
}

function openSettingsWindow() {
  openChildWindow("settings");
}

function openInfoWindow() {
  openChildWindow("info");
}

if (graphChannel) {
  graphChannel.onmessage = (event) => {
    const message = event.data;
    if (!message || message.id === graphWindowId) return;
    if (message.type === "hello" && !graphPopup && !pageKind) {
      // A window that just opened needs the whole picture, new or not.
      lastGraphText = "";
      publishGraph();
      if (pendingGraphExpr) graphChannel.postMessage({ type: "expr", id: graphWindowId, text: pendingGraphExpr });
    } else if (message.type === "expr" && graphPopup) {
      useCopiedExpr(message.text);
    } else if (message.type === "state" && pageKind !== "print") {
      if (!Number.isSafeInteger(message.revision) || message.revision <= graphRevision) return;
      graphRevision = message.revision;
      if (!graphPopup) rememberedGraph = message.state;
      applyGraphState(message.state);
      if (graphPopup) graphReady = true;
    }
    else if (message.type === "print-hello" && graphPopup) sendPrintImage();
    else if (message.type === "print-image" && pageKind === "print") showPrintImage(message.image);
  };
}

bind();
bindExport();
bindCurrency();
bindUnit();
bindTooltips();
renderKeys();
renderFunctions();
syncViewFields();
setMode("basic");
const storedTheme = loadTheme();
activeThemeId = storedTheme?.id || "dark-1";
renderCustomFields(storedTheme?.picks);
renderThemeGroups();
renderPadChoices();
document.getElementById("infoBtn").addEventListener("click", openInfoWindow);
document.getElementById("settingsBtn").addEventListener("click", openSettingsWindow);
document.getElementById("langBtn").addEventListener("click", () => {
  applyLanguage(uiLang === "ko" ? "en" : "ko");
  publishUi({ type: "lang", lang: uiLang });
});
document.getElementById("closeSettings").addEventListener("click", closeSettingsView);
document.getElementById("infoOk").addEventListener("click", () => {
  if (pageKind === "info") window.close();
  else closeSheets();
});
document.getElementById("resetSettings").addEventListener("click", resetSettings);
document.getElementById("applyCustom").addEventListener("click", () => {
  applyCustomTheme();
  closeSettingsView();
});
infoSheet.addEventListener("click", (ev) => {
  if (pageKind === "info") return;
  if (ev.target === infoSheet) closeSheets();
});
document.addEventListener("keydown", (ev) => {
  if (ev.key !== "Escape") return;
  const notice = document.getElementById("notice");
  if (notice && !notice.hidden) {
    closeNotice();
    ev.preventDefault();
    ev.stopPropagation();
    return;
  }
  const exportSheet = document.getElementById("exportSheet");
  if (exportSheet && !exportSheet.hidden) {
    exportSheet.hidden = true;
    ev.preventDefault();
    ev.stopPropagation();
    return;
  }
  if (pageKind === "settings" || pageKind === "info" || pageKind === "print") {
    ev.preventDefault();
    ev.stopPropagation();
    window.close();
    return;
  }
  if (!infoSheet.hidden || !settingsSheet.hidden) {
    ev.preventDefault();
    ev.stopPropagation();
    closeSheets();
  }
}, true);
window.addEventListener("storage", (ev) => {
  if (ev.key === "mycalc-theme") applyStoredTheme();
  if (ev.key === KEYPAD_KEY) applyStoredKeypad();
  if (ev.key === "mycalc-lang" && (ev.newValue === "ko" || ev.newValue === "en") && ev.newValue !== uiLang) applyLanguage(ev.newValue);
});
if (uiChannel) {
  uiChannel.onmessage = (event) => {
    const message = event.data;
    if (!message) return;
    if (message.type === "theme") applyStoredTheme();
    if (message.type === "keypad") applyStoredKeypad();
    if (message.type === "lang" && (message.lang === "ko" || message.lang === "en") && message.lang !== uiLang) applyLanguage(message.lang);
  };
}
document.getElementById("noticeClose").addEventListener("click", closeNotice);
document.getElementById("noticeCopy").addEventListener("click", async () => {
  const text = document.getElementById("noticeText").value;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.getElementById("noticeText");
    area.focus();
    area.select();
  }
});
window.addEventListener("error", (ev) => {
  if (/ResizeObserver|Script error/.test(ev.message || "")) return;
  reportProgram(ev.error || new Error(ev.message || "Error"));
});
window.addEventListener("unhandledrejection", (ev) => {
  const reason = ev.reason;
  reportProgram(reason instanceof Error ? reason : new Error(String(reason)));
});
if (!pageKind) exprEl.focus();
const winClose = document.getElementById("winClose");
if (document.documentElement.classList.contains("desktop") && !pageKind && winClose) {
  winClose.hidden = false;
  winClose.addEventListener("click", () => window.close());
}
if (pageKind === "settings" || pageKind === "info") {
  (pageKind === "settings" ? settingsSheet : infoSheet).hidden = false;
  applyLanguage(uiLang);
}

if (pageKind === "help") {
  document.getElementById("helpSheet").hidden = false;
  renderHelp();
  applyLanguage(uiLang);
}

function bindWindowButtons(minId, maxId, closeId) {
  const minButton = minId ? document.getElementById(minId) : null;
  const maxButton = maxId ? document.getElementById(maxId) : null;
  const closeButton = closeId ? document.getElementById(closeId) : null;
  const control = (action) => {
    if (!window.mycalcDesktop || !window.mycalcDesktop.windowControl) return;
    window.mycalcDesktop.windowControl(action).then((state) => {
      if (state && maxButton) setMaximized(maxButton, !!state.maximized);
    });
  };
  if (minButton) {
    minButton.hidden = false;
    minButton.addEventListener("click", () => control("minimize"));
  }
  if (maxButton) {
    maxButton.hidden = false;
    maxButton.addEventListener("click", () => control("maximize"));
  }
  if (closeButton) {
    closeButton.hidden = false;
    closeButton.addEventListener("click", () => window.close());
  }
  if (window.mycalcDesktop && window.mycalcDesktop.onWindowState && maxButton) {
    window.mycalcDesktop.onWindowState((state) => setMaximized(maxButton, !!state.maximized));
  }
}

function setMaximized(button, maximized) {
  button.classList.toggle("is-restore", maximized);
  const label = t(maximized ? "restore" : "maximize");
  button.setAttribute("aria-label", label);
  button.dataset.tooltip = label;
}

if (pageKind === "info") {
  document.getElementById("infoChrome").hidden = false;
  bindWindowButtons(null, null, "closeInfo");
}

if (pageKind === "help") {
  document.getElementById("helpChrome").hidden = false;
  bindWindowButtons(null, null, "closeHelp");
}

if (pageKind === "print") {
  document.getElementById("printChrome").hidden = false;
  bindWindowButtons("printMin", "printMax", "printClose");
}

if (pageKind === "settings") {
  const settingsMin = document.getElementById("settingsMin");
  const settingsMax = document.getElementById("settingsMax");
  settingsMin.hidden = false;
  settingsMax.hidden = false;
  const setSettingsMaximized = (maximized) => {
    settingsMax.classList.toggle("is-restore", maximized);
    const label = t(maximized ? "restore" : "maximize");
    settingsMax.setAttribute("aria-label", label);
    settingsMax.dataset.tooltip = label;
  };
  const controlSettingsWindow = (action) => {
    if (!window.mycalcDesktop || !window.mycalcDesktop.windowControl) return;
    window.mycalcDesktop.windowControl(action).then((state) => {
      if (state) setSettingsMaximized(!!state.maximized);
    });
  };
  if (window.mycalcDesktop && window.mycalcDesktop.onWindowState) {
    window.mycalcDesktop.onWindowState((state) => setSettingsMaximized(!!state.maximized));
  }
  settingsMin.addEventListener("click", () => controlSettingsWindow("minimize"));
  settingsMax.addEventListener("click", () => controlSettingsWindow("maximize"));
}
if (pageKind === "print") {
  document.documentElement.classList.add("print-pop");
  applyLanguage(uiLang);
  bindPrintWindow();
}
if (graphPopup) {
  document.documentElement.classList.add("graph-pop");
  syncWindowTitle();
  const graphClose = document.getElementById("graphClose");
  const graphMin = document.getElementById("graphMin");
  const graphMax = document.getElementById("graphMax");
  const graphResize = document.getElementById("graphResize");
  const printGraphBtn = document.getElementById("printGraph");
  const exportGraphBtn = document.getElementById("exportGraph");
  const graphSettingsBtn = document.getElementById("graphSettings");
  graphClose.hidden = false;
  graphMin.hidden = false;
  graphMax.hidden = false;
  graphResize.hidden = false;
  for (const id of ["graphEdgeN", "graphEdgeS", "graphEdgeW", "graphEdgeE"]) {
    document.getElementById(id).hidden = false;
  }
  printGraphBtn.hidden = false;
  exportGraphBtn.hidden = false;
  graphSettingsBtn.hidden = true;
  const setGraphMaximized = (maximized) => {
    graphMax.classList.toggle("is-restore", maximized);
    const label = t(maximized ? "restore" : "maximize");
    graphMax.setAttribute("aria-label", label);
    graphMax.dataset.tooltip = label;
    graphResize.hidden = maximized;
    for (const id of ["graphEdgeN", "graphEdgeS", "graphEdgeW", "graphEdgeE"]) {
      document.getElementById(id).hidden = maximized;
    }
  };
  const controlGraphWindow = (action) => {
    if (!window.mycalcDesktop || !window.mycalcDesktop.windowControl) return;
    window.mycalcDesktop.windowControl(action).then((state) => {
      if (state) setGraphMaximized(!!state.maximized);
    });
  };
  if (window.mycalcDesktop && window.mycalcDesktop.onWindowState) {
    window.mycalcDesktop.onWindowState((state) => setGraphMaximized(!!state.maximized));
  }
  graphMin.addEventListener("click", () => controlGraphWindow("minimize"));
  graphMax.addEventListener("click", () => controlGraphWindow("maximize"));
  graphClose.addEventListener("click", () => window.close());
  printGraphBtn.addEventListener("click", openPrintWindow);
  const bindGraphResize = (el, edges) => {
    el.addEventListener("pointerdown", (ev) => {
      if (graphMax.classList.contains("is-restore")) return;
      ev.preventDefault();
      el.setPointerCapture(ev.pointerId);
      const startX = ev.screenX;
      const startY = ev.screenY;
      const startW = window.outerWidth;
      const startH = window.outerHeight;
      const startLeft = window.screenX;
      const startTop = window.screenY;
      const move = (e) => {
        if (e.pointerId !== ev.pointerId) return;
        const dx = e.screenX - startX;
        const dy = e.screenY - startY;
        let width = startW;
        let height = startH;
        let left = startLeft;
        let top = startTop;
        if (edges.includes("e")) width = Math.max(GRAPH_MIN_WIDTH, startW + dx);
        if (edges.includes("s")) height = Math.max(GRAPH_MIN_HEIGHT, startH + dy);
        if (edges.includes("w")) {
          width = Math.max(GRAPH_MIN_WIDTH, startW - dx);
          left = startLeft + (startW - width);
        }
        if (edges.includes("n")) {
          height = Math.max(GRAPH_MIN_HEIGHT, startH - dy);
          top = startTop + (startH - height);
        }
        const bounds = {
          x: Math.round(left),
          y: Math.round(top),
          width: Math.round(width),
          height: Math.round(height),
        };
        if (window.mycalcDesktop && window.mycalcDesktop.setBounds) window.mycalcDesktop.setBounds(bounds);
        else {
          window.resizeTo(bounds.width, bounds.height);
          if (edges.includes("w") || edges.includes("n")) window.moveTo(bounds.x, bounds.y);
        }
      };
      const up = (e) => {
        if (e.pointerId !== ev.pointerId) return;
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
    });
  };
  bindGraphPanel();
  bindSidePanel();
  const panelLeftBtn = document.getElementById("panelLeft");
  const panelRightBtn = document.getElementById("panelRight");
  panelLeftBtn.hidden = false;
  panelRightBtn.hidden = false;
  const remembered = (which, fallback) => {
    try {
      const saved = localStorage.getItem(`mycalc-panel-${which}`);
      if (saved === "on") return false;
      if (saved === "off") return true;
    } catch {
      /* Fall through to the default. */
    }
    return fallback;
  };
  document.getElementById("fnList").hidden = remembered("left", false);
  document.getElementById("graphSide").hidden = remembered("right", true);
  panelLeftBtn.addEventListener("click", () => toggleGraphPanel("left"));
  panelRightBtn.addEventListener("click", () => toggleGraphPanel("right"));
  layoutGraphPanels();
  bindGraphResize(graphResize, "se");
  bindGraphResize(document.getElementById("graphEdgeN"), "n");
  bindGraphResize(document.getElementById("graphEdgeS"), "s");
  bindGraphResize(document.getElementById("graphEdgeW"), "w");
  bindGraphResize(document.getElementById("graphEdgeE"), "e");
  setMode("graph");
  if (graphChannel) graphChannel.postMessage({ type: "hello", id: graphWindowId });
  setTimeout(() => {
    graphReady = true;
  }, 500);
}
