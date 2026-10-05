// Exchange rates: live when the network allows, otherwise the last ones seen.
const RATE_STORE = "mycalc-rates";
const RATE_SOURCE = "https://open.er-api.com/v6/latest/USD";
const RATE_MAX_AGE = 1000 * 60 * 60 * 6;

const RATE_NAMES = {
  KRW: ["대한민국 원", "South Korean won"],
  USD: ["미국 달러", "US dollar"],
  EUR: ["유로", "Euro"],
  JPY: ["일본 엔", "Japanese yen"],
  CNY: ["중국 위안", "Chinese yuan"],
  GBP: ["영국 파운드", "British pound"],
  AUD: ["호주 달러", "Australian dollar"],
  CAD: ["캐나다 달러", "Canadian dollar"],
  CHF: ["스위스 프랑", "Swiss franc"],
  HKD: ["홍콩 달러", "Hong Kong dollar"],
  TWD: ["대만 달러", "New Taiwan dollar"],
  SGD: ["싱가포르 달러", "Singapore dollar"],
  THB: ["태국 바트", "Thai baht"],
  VND: ["베트남 동", "Vietnamese dong"],
  INR: ["인도 루피", "Indian rupee"],
  IDR: ["인도네시아 루피아", "Indonesian rupiah"],
  PHP: ["필리핀 페소", "Philippine peso"],
  MYR: ["말레이시아 링깃", "Malaysian ringgit"],
  RUB: ["러시아 루블", "Russian ruble"],
  BRL: ["브라질 헤알", "Brazilian real"],
  MXN: ["멕시코 페소", "Mexican peso"],
  TRY: ["튀르키예 리라", "Turkish lira"],
  SEK: ["스웨덴 크로나", "Swedish krona"],
  NOK: ["노르웨이 크로네", "Norwegian krone"],
  DKK: ["덴마크 크로네", "Danish krone"],
  PLN: ["폴란드 즈워티", "Polish zloty"],
  NZD: ["뉴질랜드 달러", "New Zealand dollar"],
  ZAR: ["남아프리카 랜드", "South African rand"],
  AED: ["아랍에미리트 디르함", "UAE dirham"],
  SAR: ["사우디 리얄", "Saudi riyal"],
};

const RATE_FAVOURITES = ["KRW", "USD", "EUR", "JPY", "CNY", "GBP"];

// The last resort when nothing has been fetched yet on this machine.
const RATE_FALLBACK = {
  base: "USD",
  stamp: "2025-01-02",
  live: false,
  rates: {
    USD: 1, KRW: 1470, EUR: 0.96, JPY: 157, CNY: 7.3, GBP: 0.8,
    AUD: 1.61, CAD: 1.44, CHF: 0.9, HKD: 7.78, TWD: 32.9, SGD: 1.37,
    THB: 34.4, VND: 25400, INR: 85.6, IDR: 16200, PHP: 58.1, MYR: 4.5,
    RUB: 110, BRL: 6.2, MXN: 20.5, TRY: 35.4, SEK: 11.1, NOK: 11.4,
    DKK: 7.17, PLN: 4.12, NZD: 1.78, ZAR: 18.9, AED: 3.67, SAR: 3.75,
  },
};

function rateName(code, lang) {
  const pair = RATE_NAMES[code];
  if (!pair) return code;
  return lang === "en" ? pair[1] : pair[0];
}

function validRates(value) {
  if (!value || typeof value !== "object") return null;
  const rates = value.rates;
  if (!rates || typeof rates !== "object") return null;
  const base = typeof value.base === "string" ? value.base : "USD";
  if (!Number.isFinite(rates[base]) || rates[base] <= 0) return null;
  let count = 0;
  for (const code of Object.keys(rates)) {
    if (Number.isFinite(rates[code]) && rates[code] > 0) count += 1;
  }
  if (count < 4) return null;
  return {
    base,
    rates,
    stamp: typeof value.stamp === "string" ? value.stamp : "",
    fetchedAt: Number.isFinite(value.fetchedAt) ? value.fetchedAt : 0,
    live: !!value.live,
  };
}

function readStoredRates() {
  try {
    return validRates(JSON.parse(localStorage.getItem(RATE_STORE)));
  } catch {
    return null;
  }
}

function storeRates(table) {
  try {
    localStorage.setItem(RATE_STORE, JSON.stringify(table));
  } catch {
    /* Private windows keep nothing; the table stays in memory. */
  }
}

function ratesStale(table) {
  if (!table || !table.live) return true;
  return Date.now() - (table.fetchedAt || 0) > RATE_MAX_AGE;
}

function readRatePayload(data) {
  if (!data || typeof data !== "object") return null;
  const rates = data.rates || data.conversion_rates;
  if (!rates || typeof rates !== "object") return null;
  const base = data.base_code || data.base || "USD";
  const clean = {};
  for (const [code, value] of Object.entries(rates)) {
    const amount = Number(value);
    if (/^[A-Z]{3}$/.test(code) && Number.isFinite(amount) && amount > 0) clean[code] = amount;
  }
  if (!clean[base]) clean[base] = 1;
  return validRates({
    base,
    rates: clean,
    stamp: data.time_last_update_utc || data.date || new Date().toISOString(),
    fetchedAt: Date.now(),
    live: true,
  });
}

async function fetchRates(wait = 8000) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), wait) : 0;
  try {
    const response = await fetch(RATE_SOURCE, {
      cache: "no-store",
      signal: controller ? controller.signal : undefined,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const table = readRatePayload(await response.json());
    if (!table) throw new Error("The rate feed was not understood.");
    return table;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function convertRate(amount, from, to, table) {
  const rates = (table && table.rates) || {};
  const start = rates[from];
  const end = rates[to];
  if (!Number.isFinite(amount) || !Number.isFinite(start) || !Number.isFinite(end)) return NaN;
  if (!(start > 0)) return NaN;
  return (amount / start) * end;
}

function rateCodes(table) {
  const codes = Object.keys((table && table.rates) || {}).filter((code) => /^[A-Z]{3}$/.test(code));
  codes.sort();
  const favourites = RATE_FAVOURITES.filter((code) => codes.includes(code));
  return [...favourites, ...codes.filter((code) => !favourites.includes(code))];
}

function formatMoney(value) {
  if (!Number.isFinite(value)) return String.fromCharCode(8212);
  // Three decimals keep the rate exact enough to check against a bank.
  return value.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}
