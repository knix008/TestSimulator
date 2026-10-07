const ZERO_DECIMAL = new Set(["KRW", "JPY", "TWD", "CLP", "VND", "IDR"]);

export function decimalsFor(currency) {
  return ZERO_DECIMAL.has(String(currency || "").toUpperCase()) ? 0 : 2;
}

export function formatMoney(value, currency, language = "ko") {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const digits = decimalsFor(currency);
  const amount = groupDigits(Number(value), digits, language);
  const code = String(currency || "").toUpperCase();
  return code ? `${amount} ${code}` : amount;
}

/** A price with no currency code, for tight columns where the column header carries it. */
export function formatPrice(value, currency, language = "ko") {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return groupDigits(Number(value), decimalsFor(currency), language);
}

export function formatRate(value, language = "ko") {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const number = Math.abs(Number(value));
  const digits = number >= 1000 ? 2 : number >= 1 ? 4 : 6;
  return groupDigits(Number(value), digits, language);
}

/**
 * A rate table quoted against one base holds the reciprocal for every stronger
 * currency, and 0.000749 is not how anyone reads the won. Quote the side that
 * is at least one, so KRW against the dollar reads "USD/KRW 1,335.11".
 */
export function quotePair(base, code, rate) {
  if (rate == null || !Number.isFinite(Number(rate)) || Number(rate) <= 0) {
    return { pair: `${base}/${code}`, value: null };
  }
  const value = Number(rate);
  if (value >= 1) return { pair: `${base}/${code}`, value };
  return { pair: `${code}/${base}`, value: 1 / value };
}

export function formatSigned(value, currency, language = "ko") {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const number = Number(value);
  const sign = number > 0 ? "+" : number < 0 ? "-" : "";
  return `${sign}${groupDigits(Math.abs(number), decimalsFor(currency), language)}`;
}

export function formatPercent(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const number = Number(value);
  const sign = number > 0 ? "+" : number < 0 ? "-" : "";
  return `${sign}${(Math.round(Math.abs(number) * 100) / 100).toFixed(2)}%`;
}

export function formatVolume(value, language = "ko") {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const number = Math.abs(Number(value));
  if (language === "ko") {
    if (number >= 100_000_000) return `${round1(number / 100_000_000)}억`;
    if (number >= 10_000) return `${round1(number / 10_000)}만`;
    return groupDigits(number, 0, language);
  }
  if (number >= 1_000_000_000) return `${round1(number / 1_000_000_000)}B`;
  if (number >= 1_000_000) return `${round1(number / 1_000_000)}M`;
  if (number >= 1_000) return `${round1(number / 1_000)}K`;
  return groupDigits(number, 0, language);
}

export function isoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "2026-10-07T08:12:00Z" rendered in the reader's language, short enough for a list row. */
export function formatWhen(iso, language = "ko") {
  const text = String(iso || "");
  if (!text) return "";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text.slice(0, 16).replace("T", " ");
  const pad = (value) => String(value).padStart(2, "0");
  const day = `${date.getMonth() + 1}/${date.getDate()}`;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return language === "ko" ? `${day} ${time}` : `${day} ${time}`;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function groupDigits(value, digits) {
  const fixed = Math.abs(Number(value)).toFixed(digits);
  const [whole, fraction] = fixed.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sign = Number(value) < 0 ? "-" : "";
  return `${sign}${fraction ? `${grouped}.${fraction}` : grouped}`;
}
