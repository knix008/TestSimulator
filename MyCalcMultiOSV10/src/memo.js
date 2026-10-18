// The notepad keeps formulas and graph inputs as separate items. It lives in
// its own window (?pop=memo); every other window only appends to it. The list
// is one localStorage key, so all windows see the same items, and a change is
// announced on the UI channel as well as through the storage event.
const MEMO_KEY = "mycalc-memo";
const MEMO_MAX = 1000;
const MEMO_TEXT_MAX = 4000;
const MEMO_KINDS = ["calc", "stats", "prog", "graph2d", "graph3d", "note"];
const MEMO_MIN_WIDTH = 600;
const MEMO_MIN_HEIGHT = 440;

// What the program itself offers: one example for every function the engine
// knows, a few everyday formulas, and every graph preset. They are seeded once
// and from then on are ordinary items; a deleted one comes back through
// "Restore built-in items".
const MEMO_BUILTINS = [
  ["calc", "sin(30)", "사인", "Sine"],
  ["calc", "cos(60)", "코사인", "Cosine"],
  ["calc", "tan(45)", "탄젠트", "Tangent"],
  ["calc", "asin(0.5)", "아크사인", "Arcsine"],
  ["calc", "acos(0.5)", "아크코사인", "Arccosine"],
  ["calc", "atan(1)", "아크탄젠트", "Arctangent"],
  ["calc", "sinh(1)", "쌍곡사인", "Hyperbolic sine"],
  ["calc", "cosh(1)", "쌍곡코사인", "Hyperbolic cosine"],
  ["calc", "tanh(1)", "쌍곡탄젠트", "Hyperbolic tangent"],
  ["calc", "asinh(1)", "역쌍곡사인", "Inverse hyperbolic sine"],
  ["calc", "acosh(2)", "역쌍곡코사인", "Inverse hyperbolic cosine"],
  ["calc", "atanh(0.5)", "역쌍곡탄젠트", "Inverse hyperbolic tangent"],
  ["calc", "log(100)", "상용로그", "Common logarithm"],
  ["calc", "ln(e)", "자연로그", "Natural logarithm"],
  ["calc", "log2(8)", "이진로그", "Binary logarithm"],
  ["calc", "log10(1000)", "상용로그 (log10)", "Base-10 logarithm"],
  ["calc", "sqrt(2)", "제곱근", "Square root"],
  ["calc", "cbrt(27)", "세제곱근", "Cube root"],
  ["calc", "abs(-5)", "절댓값", "Absolute value"],
  ["calc", "exp(1)", "지수함수", "Exponential"],
  ["calc", "fact(5)", "계승", "Factorial"],
  ["calc", "5!", "계승 (!)", "Factorial (!)"],
  ["calc", "floor(2.7)", "내림", "Floor"],
  ["calc", "ceil(2.1)", "올림", "Ceiling"],
  ["calc", "round(2.5)", "반올림", "Round"],
  ["calc", "mod(17, 5)", "나머지", "Remainder"],
  ["calc", "ncr(5, 2)", "조합", "Combinations"],
  ["calc", "npr(5, 2)", "순열", "Permutations"],
  ["calc", "min(3, 7)", "최솟값", "Minimum"],
  ["calc", "max(3, 7)", "최댓값", "Maximum"],
  ["calc", "sum(k, 1, 10, k)", "합 Σ", "Sum Σ"],
  ["calc", "sum(k, 1, 10, k^2)", "제곱의 합", "Sum of squares"],
  ["calc", "2^10", "거듭제곱", "Power"],
  ["calc", "15%", "백분율", "Percent"],
  ["calc", "pi*3^2", "원의 넓이 (r=3)", "Circle area (r=3)"],
  ["calc", "2*pi*3", "원의 둘레 (r=3)", "Circumference (r=3)"],
  ["calc", "4/3*pi*3^3", "구의 부피 (r=3)", "Sphere volume (r=3)"],
  ["calc", "sqrt(3^2+4^2)", "피타고라스 정리", "Pythagorean theorem"],
  ["calc", "(-5+sqrt(5^2-4*1*6))/(2*1)", "근의 공식 (x²+5x+6)", "Quadratic formula (x²+5x+6)"],
  ["calc", "1000*(1+0.05)^10", "복리 (5%, 10년)", "Compound interest (5%, 10 years)"],
  ["stats", "total(2, 4, 4, 5, 7)", "합계", "Total"],
  ["stats", "count(2, 4, 4, 5, 7)", "개수", "Count"],
  ["stats", "mean(2, 4, 4, 5, 7)", "평균", "Mean"],
  ["stats", "median(2, 4, 4, 5, 7)", "중앙값", "Median"],
  ["stats", "stdev(2, 4, 4, 5, 7)", "표본 표준편차", "Sample standard deviation"],
  ["stats", "variance(2, 4, 4, 5, 7)", "표본 분산", "Sample variance"],
  ["stats", "stdevp(2, 4, 4, 5, 7)", "모표준편차", "Population standard deviation"],
  ["stats", "variancep(2, 4, 4, 5, 7)", "모분산", "Population variance"],
  ["stats", "normalpdf(0)", "정규분포 밀도", "Normal density"],
  ["stats", "normalcdf(1.96)", "정규분포 누적", "Normal cumulative"],
  ["stats", "invnorm(0.975)", "정규분포 역누적", "Inverse normal"],
  ["graph2d", "sin(x)", "사인 곡선", "Sine wave"],
  ["graph2d", "cos(x)", "코사인 곡선", "Cosine wave"],
  ["graph2d", "tan(x)", "탄젠트 곡선", "Tangent curve"],
  ["graph2d", "x^2", "포물선", "Parabola"],
  ["graph2d", "1/x", "쌍곡선", "Hyperbola"],
  ["graph2d", "ln(x)", "로그 곡선", "Logarithm curve"],
  ["graph2d", "e^(-x^2)", "가우스 곡선", "Gaussian curve"],
  ["graph2d", "normalpdf(x)", "표준정규분포", "Standard normal"],
  ["graph2d", "normalcdf(x)", "정규분포 누적", "Normal cumulative"],
  ["graph2d", "normalpdf(x,0,2)", "넓은 정규분포 (σ=2)", "Wide normal (σ=2)"],
  ["graph2d", "normalpdf(x,0,0.5)", "좁은 정규분포 (σ=0.5)", "Narrow normal (σ=0.5)"],
  ["graph3d", "sin(x)*cos(y)", "물결 곡면", "Wave surface"],
  ["graph3d", "x^2+y^2", "포물면", "Paraboloid"],
  ["graph3d", "x^2-y^2", "안장면", "Saddle"],
  ["graph3d", "sin(sqrt(x^2+y^2))", "동심원 물결", "Ripple"],
  ["graph3d", "e^(-(x^2+y^2))", "가우스 곡면", "Gaussian surface"],
  ["graph3d", "cos(x)+sin(y)", "격자 물결", "Egg crate"],
].map(([kind, text, ko, en]) => ({ id: `b:${kind}:${text}`, kind, text, ko, en }));

const MEMO_BUILTIN_BY_ID = new Map(MEMO_BUILTINS.map((entry) => [entry.id, entry]));

function memoId() {
  return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function memoBuiltinItem(entry) {
  return { id: entry.id, kind: entry.kind, text: entry.text, title: "", builtin: true };
}

function cleanMemoItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const text = String(raw.text ?? "").slice(0, MEMO_TEXT_MAX);
  if (!text.trim()) return null;
  const kind = MEMO_KINDS.includes(raw.kind) ? raw.kind : "note";
  const id = typeof raw.id === "string" && raw.id ? raw.id.slice(0, 200) : memoId();
  return {
    id,
    kind,
    text,
    title: String(raw.title ?? "").slice(0, 80),
    builtin: !!raw.builtin && MEMO_BUILTIN_BY_ID.has(id),
  };
}

function readMemo() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(MEMO_KEY));
  } catch {
    saved = null;
  }
  // The first time the notepad is read, it starts with the built-in items.
  if (!saved || !Array.isArray(saved.items)) return MEMO_BUILTINS.map(memoBuiltinItem);
  const seen = new Set();
  const items = [];
  for (const raw of saved.items) {
    const item = cleanMemoItem(raw);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
    if (items.length >= MEMO_MAX) break;
  }
  return items;
}

function writeMemo(items) {
  try {
    localStorage.setItem(MEMO_KEY, JSON.stringify({ v: 1, items: items.slice(0, MEMO_MAX) }));
  } catch {
    /* A full or blocked storage keeps the list in this window only. */
  }
  if (typeof publishUi === "function") publishUi({ type: "memo" });
}

function memoTitle(item) {
  if (item.title) return item.title;
  const entry = item.builtin ? MEMO_BUILTIN_BY_ID.get(item.id) : null;
  if (entry) return uiLang === "en" ? entry.en : entry.ko;
  return "";
}

function memoKindLabel(kind) {
  return t(`memoKind.${kind}`);
}

// Guesses what a pasted or typed line is for: a formula in x is a curve, one
// in x and y a surface, anything the calculator can work out a calculation,
// and the rest a note.
// The guess has its own engine, so it never touches the calculator's Ans, and
// it only parses: a curve such as sqrt(x-5) is still a curve where x=1 fails.
const memoGuessEngine = new CalcEngine();
const MEMO_STATS_CALL = /\b(total|count|mean|median|stdev|variance|stdevp|variancep|normalpdf|normalcdf|invnorm)\s*\(/i;

function guessMemoKind(text) {
  const value = String(text || "").trim().replace(/^[yz]\s*=\s*/i, "");
  if (!value) return "note";
  try {
    memoGuessEngine.parse(value);
  } catch {
    return "note";
  }
  const names = new Set((value.replace(/\b[A-Za-z_][A-Za-z0-9_]*\s*\(/g, "(").match(/[A-Za-z_][A-Za-z0-9_]*/g) || []).map((name) => name.toLowerCase()));
  if (names.has("x") && names.has("y")) return "graph3d";
  if (names.has("x")) return "graph2d";
  for (const name of names) if (!["pi", "e", "ans"].includes(name)) return "note";
  return MEMO_STATS_CALL.test(value) ? "stats" : "calc";
}

// Appends from any window. An item that is already there is not doubled, so
// pressing the button twice, or adding every graph formula again, is harmless.
function memoAppend(entries) {
  const items = readMemo();
  let added = 0;
  const fresh = [];
  for (const entry of entries) {
    const text = String(entry.text || "").trim().slice(0, MEMO_TEXT_MAX);
    if (!text) continue;
    const kind = MEMO_KINDS.includes(entry.kind) ? entry.kind : guessMemoKind(text);
    if (items.some((item) => item.kind === kind && item.text.trim() === text) || fresh.some((item) => item.kind === kind && item.text === text)) continue;
    fresh.push({ id: memoId(), kind, text, title: String(entry.title || "").slice(0, 80), builtin: false });
    added++;
  }
  if (added) writeMemo(fresh.concat(items));
  return added;
}

function memoCopyText(text) {
  const value = String(text || "");
  if (!value) return Promise.resolve(false);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(value).then(() => true, () => memoCopyFallback(value));
  }
  return Promise.resolve(memoCopyFallback(value));
}

function memoCopyFallback(value) {
  const area = document.createElement("textarea");
  area.value = value;
  area.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";
  document.body.append(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

async function memoReadClipboard() {
  if (!navigator.clipboard || !navigator.clipboard.readText) throw new Error("clipboard");
  return navigator.clipboard.readText();
}

// A short note at the bottom of a window that did not open the notepad, so a
// press of "Add to notepad" is seen to have done something.
let memoToastTimer = 0;
function memoToast(text) {
  let toast = document.getElementById("memoToast");
  if (!toast) {
    toast = el("div", "memo-toast");
    toast.id = "memoToast";
    toast.setAttribute("role", "status");
    document.body.append(toast);
  }
  toast.textContent = text;
  toast.hidden = false;
  toast.classList.add("is-shown");
  clearTimeout(memoToastTimer);
  memoToastTimer = setTimeout(() => {
    toast.classList.remove("is-shown");
    toast.hidden = true;
  }, 1600);
}

function openMemoWindow() {
  openChildWindow("memo");
}

function addToMemoFromWindow(entries) {
  const list = entries.filter((entry) => String(entry.text || "").trim());
  if (!list.length) {
    memoToast(t("memoEmptyInput"));
    return 0;
  }
  const added = memoAppend(list);
  memoToast(added ? `${t("memoAdded")} (${added})` : t("memoAdded"));
  return added;
}

function addMainExprToMemo() {
  const programmer = state.mode === "programmer";
  const text = (programmer ? progExprEl.value : exprEl.value).trim();
  const kind = programmer ? "prog" : MEMO_STATS_CALL.test(text) ? "stats" : "calc";
  return addToMemoFromWindow([{ kind, text }]);
}

function addGraphToMemo() {
  const dim = board.dimension === "3d" ? "graph3d" : "graph2d";
  const typed = graphExprEl.value.trim();
  if (typed) return addToMemoFromWindow([{ kind: dim, text: typed }]);
  // An empty input means the formulas already on the graph.
  return addToMemoFromWindow(board.functions.map((fn) => ({ kind: dim, text: fn.expr, title: fn.label || "" })));
}

// ----- What the other windows do with an item sent from the notepad -----

// Kept apart from the copy button's pending formula, so a plotted item is not
// also left behind in the graph input.
let pendingGraphPlot = null;
const plottedTokens = new Set();

function useMemoInMain(message) {
  if (message.target === "prog") {
    if (state.mode !== "programmer") setMode("programmer");
    progExprEl.value = message.text;
    progExprEl.dispatchEvent(new Event("input", { bubbles: true }));
    progExprEl.focus();
  } else if (message.target === "calc") {
    if (state.mode !== "basic" && state.mode !== "scientific") setMode(/[a-z]{2,}\(|\^|!|%/i.test(message.text) ? "scientific" : "basic");
    exprEl.value = message.text;
    state.replaceOnNext = false;
    exprEl.focus();
    exprEl.setSelectionRange(exprEl.value.length, exprEl.value.length);
    preview();
  } else if (message.target === "graph") {
    // A graph window opened by the notepad says hello to this window, which
    // hands it the formula along with the picture.
    pendingGraphPlot = message.token ? { text: message.text, dim: message.dim || "", token: message.token } : null;
    return;
  }
  try {
    window.focus();
  } catch {
    /* Focus is a courtesy. */
  }
}

function plotFromMemo(message) {
  if (!graphPopup || !message.token || plottedTokens.has(message.token)) return;
  plottedTokens.add(message.token);
  useCopiedExpr(message.text, message.dim);
  addGraph(message.text);
  if (graphChannel) graphChannel.postMessage({ type: "memo-plotted", id: graphWindowId, token: message.token });
}

if (uiChannel) {
  uiChannel.addEventListener("message", (event) => {
    const message = event.data;
    if (!message) return;
    if (message.type === "memo" && pageKind === "memo") renderMemo(true);
    if (message.type === "memo-use" && !pageKind && typeof message.text === "string") useMemoInMain(message);
  });
}

if (graphChannel) {
  graphChannel.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || message.id === graphWindowId) return;
    if (message.type === "memo-plot") plotFromMemo(message);
    else if (message.type === "hello" && !pageKind && pendingGraphPlot) {
      // app.js has just sent the picture into the new window; this asks for the item on top.
      graphChannel.postMessage({ type: "memo-plot", id: graphWindowId, ...pendingGraphPlot });
    } else if (message.type === "memo-plotted" && !pageKind && pendingGraphPlot && message.token === pendingGraphPlot.token) {
      pendingGraphPlot = null;
    }
  });
}

window.addEventListener("storage", (ev) => {
  if (ev.key === MEMO_KEY && pageKind === "memo") renderMemo(true);
});

if (!pageKind || graphPopup) {
  document.getElementById("memoBtn").addEventListener("click", openMemoWindow);
  document.getElementById("memoGraph").addEventListener("click", openMemoWindow);
  document.getElementById("memoAddExpr").addEventListener("click", addMainExprToMemo);
  document.getElementById("memoAddProg").addEventListener("click", addMainExprToMemo);
  document.getElementById("memoAddGraph").addEventListener("click", addGraphToMemo);
}

// ----- The notepad window -----

const memoView = {
  filter: "all",
  query: "",
  selected: new Set(),
  editing: "",
  items: [],
};

function memoStatus(text) {
  const status = document.getElementById("memoStatus");
  if (!status) return;
  status.textContent = text;
  clearTimeout(memoStatus.timer);
  memoStatus.timer = setTimeout(() => {
    status.textContent = "";
  }, 2400);
}

function memoVisible() {
  const query = memoView.query.trim().toLowerCase();
  return memoView.items.filter((item) => {
    if (memoView.filter !== "all" && item.kind !== memoView.filter) return false;
    if (!query) return true;
    return item.text.toLowerCase().includes(query)
      || memoTitle(item).toLowerCase().includes(query)
      || memoKindLabel(item.kind).toLowerCase().includes(query);
  });
}

function memoSave(items, keepView) {
  memoView.items = items;
  writeMemo(items);
  renderMemo(keepView);
}

function memoIconButton(icon, label, onClick, className = "") {
  const button = el("button", `tool-icon memo-act ${className}`.trim());
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.dataset.tooltip = label;
  button.append(el("span", `icon icon-${icon}`));
  button.addEventListener("click", onClick);
  return button;
}

function memoKindOptions(select, current, withAuto) {
  select.replaceChildren();
  if (withAuto) {
    const auto = el("option", "", uiText("자동 판별", "Detect"));
    auto.value = "auto";
    select.append(auto);
  }
  for (const kind of MEMO_KINDS) {
    const option = el("option", "", memoKindLabel(kind));
    option.value = kind;
    select.append(option);
  }
  select.value = current;
}

function memoUseLabel(kind) {
  if (kind === "graph2d" || kind === "graph3d") return t("memoUseGraph");
  if (kind === "prog") return t("memoUseProg");
  if (kind === "note") return t("memoCopy");
  return t("memoUseCalc");
}

function useMemoItem(item) {
  if (item.kind === "note") {
    memoCopyText(item.text).then((ok) => memoStatus(ok ? t("memoCopied") : t("memoPasteBlocked")));
    return;
  }
  const text = item.text.trim().replace(/^[yz]\s*=\s*/i, "");
  if (item.kind === "graph2d" || item.kind === "graph3d") {
    const dim = item.kind === "graph3d" ? "3d" : "2d";
    const token = memoId();
    publishUi({ type: "memo-use", target: "graph", text, dim, token });
    openChildWindow("graph");
    // A graph window that is already open draws it now; a new one gets it
    // from the calculator window when it says hello.
    if (graphChannel) graphChannel.postMessage({ type: "memo-plot", id: graphWindowId, text, dim, token });
  } else {
    publishUi({ type: "memo-use", target: item.kind === "prog" ? "prog" : "calc", text });
  }
  memoStatus(`${t("memoSent")}: ${memoUseLabel(item.kind)}`);
}

function moveMemoItem(item, step) {
  const visible = memoVisible();
  const at = visible.indexOf(item);
  const neighbour = visible[at + step];
  if (!neighbour) return;
  const items = memoView.items.slice();
  const a = items.indexOf(item);
  const b = items.indexOf(neighbour);
  [items[a], items[b]] = [items[b], items[a]];
  memoSave(items, true);
  requestAnimationFrame(() => {
    const row = document.querySelector(`.memo-item[data-id="${CSS.escape(item.id)}"] .memo-act-${step < 0 ? "up" : "down"}`);
    if (row && !row.disabled) row.focus();
  });
}

function deleteMemoItems(ids) {
  if (!ids.size) return;
  const items = memoView.items.filter((item) => !ids.has(item.id));
  for (const id of ids) memoView.selected.delete(id);
  if (ids.has(memoView.editing)) memoView.editing = "";
  memoSave(items, true);
  memoStatus(`${t("memoDeleted")} (${ids.size})`);
}

function memoEditRow(item) {
  const form = el("form", "memo-edit");
  form.autocomplete = "off";
  const top = el("div", "memo-compose-row");
  const kind = document.createElement("select");
  kind.setAttribute("aria-label", t("memoKind"));
  memoKindOptions(kind, item.kind, false);
  const title = document.createElement("input");
  title.className = "memo-title-input";
  title.maxLength = 80;
  title.spellcheck = false;
  title.value = memoTitle(item);
  title.placeholder = t("memoTitleHint");
  title.setAttribute("aria-label", t("memoItemTitle"));
  top.append(kind, title);
  const text = document.createElement("textarea");
  text.className = "memo-text-input";
  text.rows = Math.min(8, Math.max(2, item.text.split("\n").length));
  text.spellcheck = false;
  text.value = item.text;
  text.setAttribute("aria-label", t("memoItemText"));
  const actions = el("div", "memo-edit-actions");
  const save = el("button", "memo-primary", t("memoSave"));
  save.type = "submit";
  const cancel = el("button", "", t("memoCancel"));
  cancel.type = "button";
  actions.append(save, cancel);
  form.append(top, text, actions);
  const close = () => {
    memoView.editing = "";
    renderMemo(true);
  };
  cancel.addEventListener("click", close);
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const value = text.value.slice(0, MEMO_TEXT_MAX);
    if (!value.trim()) {
      memoStatus(t("memoNeedText"));
      text.focus();
      return;
    }
    const builtinTitle = item.builtin ? memoTitle({ ...item, title: "" }) : "";
    const next = {
      ...item,
      kind: kind.value,
      text: value,
      title: title.value.trim() === builtinTitle ? "" : title.value.trim(),
    };
    memoView.editing = "";
    memoSave(memoView.items.map((entry) => (entry.id === item.id ? next : entry)), true);
  });
  form.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      close();
    } else if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey || ev.target !== text)) {
      ev.preventDefault();
      form.requestSubmit();
    }
  });
  requestAnimationFrame(() => {
    text.focus();
    text.setSelectionRange(text.value.length, text.value.length);
  });
  return form;
}

function memoRow(item, index, visible) {
  const row = el("li", "memo-item");
  row.dataset.id = item.id;
  row.dataset.kind = item.kind;
  if (memoView.selected.has(item.id)) row.classList.add("is-selected");
  const check = document.createElement("input");
  check.type = "checkbox";
  check.className = "memo-check";
  check.checked = memoView.selected.has(item.id);
  check.setAttribute("aria-label", memoTitle(item) || item.text);
  check.addEventListener("change", () => {
    if (check.checked) memoView.selected.add(item.id);
    else memoView.selected.delete(item.id);
    renderMemo(true);
  });
  row.append(check);
  if (memoView.editing === item.id) {
    row.classList.add("is-editing");
    row.append(memoEditRow(item));
    return row;
  }
  const main = el("div", "memo-main");
  const meta = el("div", "memo-meta");
  meta.append(el("span", `memo-badge memo-badge-${item.kind}`, memoKindLabel(item.kind)));
  const title = memoTitle(item);
  if (title) meta.append(el("span", "memo-name", title));
  if (item.builtin) meta.append(el("span", "memo-builtin", t("memoBuiltin")));
  const prefix = item.kind === "graph2d" ? "y = " : item.kind === "graph3d" ? "z = " : "";
  const expr = el("pre", "memo-expr");
  if (prefix && !/^[yz]\s*=/i.test(item.text.trim())) expr.append(el("span", "memo-prefix", prefix));
  expr.append(document.createTextNode(item.text));
  expr.addEventListener("dblclick", () => {
    memoView.editing = item.id;
    renderMemo(true);
  });
  main.append(meta, expr);
  const actions = el("div", "memo-actions");
  const use = memoIconButton(item.kind === "note" ? "copy" : "send", memoUseLabel(item.kind), () => useMemoItem(item), "memo-act-use");
  const copy = memoIconButton("copy", t("memoCopy"), () => {
    memoCopyText(item.text).then((ok) => memoStatus(ok ? t("memoCopied") : t("memoPasteBlocked")));
  }, "memo-act-copy");
  const edit = memoIconButton("edit", t("memoEdit"), () => {
    memoView.editing = item.id;
    renderMemo(true);
  }, "memo-act-edit");
  const up = memoIconButton("arrow-up", t("memoUp"), () => moveMemoItem(item, -1), "memo-act-up");
  const down = memoIconButton("arrow-down", t("memoDown"), () => moveMemoItem(item, 1), "memo-act-down");
  up.disabled = index === 0;
  down.disabled = index === visible.length - 1;
  const remove = memoIconButton("trash", t("memoDelete"), () => deleteMemoItems(new Set([item.id])), "memo-act-delete");
  if (item.kind === "note") actions.append(copy, edit, up, down, remove);
  else actions.append(use, copy, edit, up, down, remove);
  row.append(main, actions);
  return row;
}

function renderMemoFilters() {
  const host = document.getElementById("memoFilters");
  if (!host) return;
  host.replaceChildren();
  for (const kind of ["all", ...MEMO_KINDS]) {
    const count = kind === "all" ? memoView.items.length : memoView.items.filter((item) => item.kind === kind).length;
    const chip = el("button", "memo-filter");
    chip.type = "button";
    chip.setAttribute("role", "tab");
    chip.dataset.kind = kind;
    chip.setAttribute("aria-selected", String(memoView.filter === kind));
    chip.append(el("span", "", memoKindLabel(kind)), el("span", "memo-filter-n", String(count)));
    chip.addEventListener("click", () => {
      memoView.filter = kind;
      renderMemo(true);
    });
    host.append(chip);
  }
}

function renderMemo(keepView) {
  if (pageKind !== "memo") return;
  if (keepView !== true || !memoView.items.length) memoView.items = readMemo();
  else if (keepView === true) {
    const fresh = readMemo();
    // Another window may have added items; reading again keeps them.
    if (JSON.stringify(fresh) !== JSON.stringify(memoView.items)) memoView.items = fresh;
  }
  const ids = new Set(memoView.items.map((item) => item.id));
  for (const id of memoView.selected) if (!ids.has(id)) memoView.selected.delete(id);
  if (memoView.editing && !ids.has(memoView.editing)) memoView.editing = "";
  const list = document.getElementById("memoList");
  const scroll = list.scrollTop;
  const visible = memoVisible();
  list.replaceChildren();
  if (!visible.length) {
    list.append(el("li", "memo-empty", memoView.items.length ? t("memoNoMatch") : t("memoNone")));
  }
  visible.forEach((item, index) => list.append(memoRow(item, index, visible)));
  list.scrollTop = scroll;
  renderMemoFilters();
  const count = document.getElementById("memoCount");
  count.textContent = memoView.selected.size ? `${memoView.selected.size} / ${memoView.items.length}` : String(memoView.items.length);
  const all = document.getElementById("memoSelectAll");
  const picked = visible.filter((item) => memoView.selected.has(item.id)).length;
  all.checked = visible.length > 0 && picked === visible.length;
  all.indeterminate = picked > 0 && picked < visible.length;
  document.getElementById("memoDeleteSel").disabled = memoView.selected.size === 0;
  const kindSelect = document.getElementById("memoKind");
  memoKindOptions(kindSelect, kindSelect.value || (memoView.filter !== "all" ? memoView.filter : "auto"), true);
}

function memoSelectedItems() {
  const chosen = memoView.items.filter((item) => memoView.selected.has(item.id));
  return chosen.length ? chosen : memoVisible();
}

function copyMemoSelection() {
  const items = memoSelectedItems();
  if (!items.length) return;
  memoCopyText(items.map((item) => item.text).join("\n"))
    .then((ok) => memoStatus(ok ? `${t("memoCopied")} (${items.length})` : t("memoPasteBlocked")));
}

function memoKindFor(text) {
  const choice = document.getElementById("memoKind").value;
  return MEMO_KINDS.includes(choice) ? choice : guessMemoKind(text);
}

function addComposedMemo() {
  const textEl = document.getElementById("memoNewText");
  const titleEl = document.getElementById("memoNewTitle");
  const text = textEl.value.trim();
  if (!text) {
    memoStatus(t("memoNeedText"));
    textEl.focus();
    return;
  }
  const item = { id: memoId(), kind: memoKindFor(text), text: text.slice(0, MEMO_TEXT_MAX), title: titleEl.value.trim().slice(0, 80), builtin: false };
  memoView.items = readMemo();
  // The new item goes where it can be seen: the top, under a filter that shows it.
  if (memoView.filter !== "all" && memoView.filter !== item.kind) memoView.filter = "all";
  memoSave([item, ...memoView.items], true);
  textEl.value = "";
  titleEl.value = "";
  textEl.focus();
  document.getElementById("memoList").scrollTop = 0;
  memoStatus(t("memoAdded"));
}

async function pasteMemoItems() {
  let text = "";
  try {
    text = await memoReadClipboard();
  } catch {
    memoStatus(t("memoPasteBlocked"));
    return;
  }
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) {
    memoStatus(t("memoPasteEmpty"));
    return;
  }
  const choice = document.getElementById("memoKind").value;
  const added = memoAppend(lines.map((line) => ({ kind: MEMO_KINDS.includes(choice) ? choice : guessMemoKind(line), text: line })));
  memoView.items = readMemo();
  renderMemo(true);
  memoStatus(`${t("memoPasted")} (${added})`);
}

function restoreMemoBuiltins() {
  const items = readMemo();
  const have = new Set(items.map((item) => item.id));
  const missing = MEMO_BUILTINS.filter((entry) => !have.has(entry.id)).map(memoBuiltinItem);
  if (!missing.length) {
    memoStatus(t("memoNothingRestored"));
    return;
  }
  memoSave(items.concat(missing), true);
  memoStatus(`${t("memoRestored")} (${missing.length})`);
}

function bindMemoResize(maxButton) {
  const grip = document.getElementById("graphResize");
  const edges = { graphEdgeN: "n", graphEdgeS: "s", graphEdgeW: "w", graphEdgeE: "e" };
  const bind = (node, sides) => {
    node.hidden = false;
    node.addEventListener("pointerdown", (ev) => {
      if (maxButton.classList.contains("is-restore")) return;
      ev.preventDefault();
      node.setPointerCapture(ev.pointerId);
      const start = { x: ev.screenX, y: ev.screenY, w: window.outerWidth, h: window.outerHeight, left: window.screenX, top: window.screenY };
      const move = (e) => {
        if (e.pointerId !== ev.pointerId) return;
        const dx = e.screenX - start.x;
        const dy = e.screenY - start.y;
        let { w: width, h: height, left, top } = start;
        if (sides.includes("e")) width = Math.max(MEMO_MIN_WIDTH, start.w + dx);
        if (sides.includes("s")) height = Math.max(MEMO_MIN_HEIGHT, start.h + dy);
        if (sides.includes("w")) {
          width = Math.max(MEMO_MIN_WIDTH, start.w - dx);
          left = start.left + (start.w - width);
        }
        if (sides.includes("n")) {
          height = Math.max(MEMO_MIN_HEIGHT, start.h - dy);
          top = start.top + (start.h - height);
        }
        const bounds = { x: Math.round(left), y: Math.round(top), width: Math.round(width), height: Math.round(height) };
        if (window.mycalcDesktop && window.mycalcDesktop.setBounds) window.mycalcDesktop.setBounds(bounds);
        else {
          window.resizeTo(bounds.width, bounds.height);
          if (sides.includes("w") || sides.includes("n")) window.moveTo(bounds.x, bounds.y);
        }
      };
      const up = (e) => {
        if (e.pointerId !== ev.pointerId) return;
        node.removeEventListener("pointermove", move);
        node.removeEventListener("pointerup", up);
      };
      node.addEventListener("pointermove", move);
      node.addEventListener("pointerup", up);
    });
  };
  bind(grip, "se");
  for (const [id, side] of Object.entries(edges)) bind(document.getElementById(id), side);
  const sync = () => {
    const maximized = maxButton.classList.contains("is-restore");
    grip.hidden = maximized;
    for (const id of Object.keys(edges)) document.getElementById(id).hidden = maximized;
  };
  new MutationObserver(sync).observe(maxButton, { attributes: true, attributeFilter: ["class"] });
}

function bindMemoWindow() {
  document.getElementById("memoSheet").hidden = false;
  const desktop = !!(window.mycalcDesktop && window.mycalcDesktop.windowControl);
  bindWindowButtons(desktop ? "memoMin" : null, desktop ? "memoMax" : null, null);
  document.getElementById("memoClose").addEventListener("click", () => closeThisWindow());
  if (desktop && window.mycalcDesktop.setBounds) bindMemoResize(document.getElementById("memoMax"));
  const compose = document.getElementById("memoCompose");
  const textEl = document.getElementById("memoNewText");
  compose.addEventListener("submit", (ev) => {
    ev.preventDefault();
    addComposedMemo();
  });
  textEl.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      addComposedMemo();
    }
  });
  document.getElementById("memoNewTitle").addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      addComposedMemo();
    }
  });
  document.getElementById("memoPasteNew").addEventListener("click", async () => {
    try {
      const text = await memoReadClipboard();
      if (!text) {
        memoStatus(t("memoPasteEmpty"));
        return;
      }
      const start = textEl.selectionStart ?? textEl.value.length;
      const end = textEl.selectionEnd ?? start;
      textEl.value = textEl.value.slice(0, start) + text + textEl.value.slice(end);
      textEl.focus();
      textEl.setSelectionRange(start + text.length, start + text.length);
      memoStatus(t("memoPasted"));
    } catch {
      textEl.focus();
      memoStatus(t("memoPasteBlocked"));
    }
  });
  document.getElementById("memoSearch").addEventListener("input", (ev) => {
    memoView.query = ev.target.value;
    renderMemo(true);
  });
  document.getElementById("memoSelectAll").addEventListener("change", (ev) => {
    const visible = memoVisible();
    for (const item of visible) {
      if (ev.target.checked) memoView.selected.add(item.id);
      else memoView.selected.delete(item.id);
    }
    renderMemo(true);
  });
  document.getElementById("memoCopySel").addEventListener("click", copyMemoSelection);
  document.getElementById("memoPasteItems").addEventListener("click", pasteMemoItems);
  document.getElementById("memoDeleteSel").addEventListener("click", () => {
    if (!memoView.selected.size) return;
    if (!window.confirm(`${t("memoConfirmDelete")} (${memoView.selected.size})`)) return;
    deleteMemoItems(new Set(memoView.selected));
  });
  document.getElementById("memoRestore").addEventListener("click", restoreMemoBuiltins);
  // Outside the text fields the list itself answers the clipboard keys:
  // Ctrl+C copies the chosen items, Ctrl+V adds a line per item, Delete removes.
  document.addEventListener("keydown", (ev) => {
    const active = document.activeElement;
    const typing = active && (active.tagName === "INPUT" && active.type !== "checkbox" || active.tagName === "TEXTAREA" || active.tagName === "SELECT");
    if (typing) return;
    const text = window.getSelection ? String(window.getSelection()) : "";
    const mod = ev.ctrlKey || ev.metaKey;
    if (mod && ev.key.toLowerCase() === "c" && !text) {
      ev.preventDefault();
      copyMemoSelection();
    } else if (mod && ev.key.toLowerCase() === "v") {
      ev.preventDefault();
      pasteMemoItems();
    } else if (mod && ev.key.toLowerCase() === "a") {
      ev.preventDefault();
      for (const item of memoVisible()) memoView.selected.add(item.id);
      renderMemo(true);
    } else if (ev.key === "Delete" && memoView.selected.size) {
      ev.preventDefault();
      if (window.confirm(`${t("memoConfirmDelete")} (${memoView.selected.size})`)) deleteMemoItems(new Set(memoView.selected));
    } else if (ev.key === "Escape" && memoView.selected.size) {
      ev.preventDefault();
      memoView.selected.clear();
      renderMemo(true);
    }
  });
  applyLanguage(uiLang);
  renderMemo();
  // The first opening stores the seeded built-ins, so the other windows add
  // to the same list rather than to an empty one.
  try {
    if (!localStorage.getItem(MEMO_KEY)) writeMemo(memoView.items);
  } catch {
    /* Storage can be unavailable. */
  }
  textEl.focus();
}

if (pageKind === "memo") {
  document.documentElement.classList.add("memo-pop");
  bindMemoWindow();
}
