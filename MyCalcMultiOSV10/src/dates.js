// Civil dates on the proleptic Gregorian calendar. A difference is the
// calendar span (years, then months, then days) plus the exact day count.
// Adding months lands on the last real day when the target month is shorter.

const DATE_WEEKDAYS = [
  ["일요일", "Sunday"],
  ["월요일", "Monday"],
  ["화요일", "Tuesday"],
  ["수요일", "Wednesday"],
  ["목요일", "Thursday"],
  ["금요일", "Friday"],
  ["토요일", "Saturday"],
];

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function validDate(year, month, day) {
  return Number.isInteger(year) && year >= 1 && year <= 9999
    && Number.isInteger(month) && month >= 1 && month <= 12
    && Number.isInteger(day) && day >= 1 && day <= daysInMonth(year, month);
}

function parseIsoDate(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || ""));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!validDate(year, month, day)) return null;
  return { y: year, m: month, d: day };
}

function formatIsoDate(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${String(date.y).padStart(4, "0")}-${pad(date.m)}-${pad(date.d)}`;
}

function todayIso() {
  const now = new Date();
  return formatIsoDate({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() });
}

// Days since 1970-01-01. Howard Hinnant's civil algorithm, so a date never
// depends on the local timezone or on Date's leap-year rules.
function toSerial(year, month, day) {
  const shifted = month <= 2 ? year - 1 : year;
  const era = Math.floor(shifted / 400);
  const yearOfEra = shifted - era * 400;
  const monthIndex = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * monthIndex + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

function fromSerial(serial) {
  if (!Number.isInteger(serial)) return null;
  let z = serial + 719468;
  const era = Math.floor(z / 146097);
  const dayOfEra = z - era * 146097;
  const yearOfEra = Math.floor((dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365);
  const yearBase = yearOfEra + era * 400;
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthIndex = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthIndex + 2) / 5) + 1;
  const month = monthIndex + (monthIndex < 10 ? 3 : -9);
  const year = yearBase + (month <= 2 ? 1 : 0);
  if (!validDate(year, month, day)) return null;
  return { y: year, m: month, d: day };
}

function dateWeekday(date) {
  return ((toSerial(date.y, date.m, date.d) + 4) % 7 + 7) % 7;
}

function weekdayName(date, lang) {
  return DATE_WEEKDAYS[dateWeekday(date)][lang === "en" ? 1 : 0];
}

function addMonths(date, delta) {
  if (!Number.isInteger(delta)) return null;
  const index = date.y * 12 + (date.m - 1) + delta;
  if (index < 12) return null;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  if (!validDate(year, month, 1)) return null;
  return { y: year, m: month, d: Math.min(date.d, daysInMonth(year, month)) };
}

function dateDiff(fromIso, toIso) {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  if (!from || !to) return null;
  const totalDays = toSerial(to.y, to.m, to.d) - toSerial(from.y, from.m, from.d);
  let later = to;
  let earlier = from;
  if (totalDays < 0) {
    later = from;
    earlier = to;
  }
  let year = later.y;
  let month = later.m;
  let years = year - earlier.y;
  let months = month - earlier.m;
  let days = later.d - earlier.d;
  while (days < 0) {
    months -= 1;
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    days += daysInMonth(year, month);
  }
  while (months < 0) {
    years -= 1;
    months += 12;
  }
  return { negative: totalDays < 0, years, months, days, totalDays };
}

function spanNumber(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 999999) return null;
  return number;
}

function shiftDate(iso, span) {
  const start = parseIsoDate(iso);
  const years = spanNumber(span.years);
  const months = spanNumber(span.months);
  const weeks = spanNumber(span.weeks);
  const days = spanNumber(span.days);
  if (!start || years == null || months == null || weeks == null || days == null) return null;
  const sign = span.negative ? -1 : 1;
  const moved = addMonths(start, sign * (years * 12 + months));
  if (!moved) return null;
  return fromSerial(toSerial(moved.y, moved.m, moved.d) + sign * (weeks * 7 + days));
}

function formatDateDiff(diff, lang) {
  if (!diff) return lang === "en" ? "Out of range" : "범위를 벗어났습니다";
  const english = lang === "en";
  const parts = [];
  if (diff.years) parts.push(english ? `${diff.years} ${diff.years === 1 ? "year" : "years"}` : `${diff.years}년`);
  if (diff.months) parts.push(english ? `${diff.months} ${diff.months === 1 ? "month" : "months"}` : `${diff.months}개월`);
  if (diff.days) parts.push(english ? `${diff.days} ${diff.days === 1 ? "day" : "days"}` : `${diff.days}일`);
  if (!parts.length) return english ? "Same day" : "같은 날";
  const text = english ? parts.join(", ") : parts.join(" ");
  return diff.negative ? `−${text}` : text;
}

function formatDateTotal(totalDays, lang) {
  const english = lang === "en";
  const sign = totalDays < 0 ? "−" : "";
  const abs = Math.abs(totalDays);
  const weeks = Math.floor(abs / 7);
  const days = abs % 7;
  if (english) {
    const all = `${abs} ${abs === 1 ? "day" : "days"}`;
    if (!weeks) return `${sign}${all}`;
    return `${sign}${all} · ${weeks} ${weeks === 1 ? "week" : "weeks"}, ${days} ${days === 1 ? "day" : "days"}`;
  }
  if (!weeks) return `${sign}총 ${abs}일`;
  return `${sign}총 ${abs}일 · ${weeks}주 ${days}일`;
}

function formatDateShift(date, lang) {
  if (!date) return lang === "en" ? "Out of range" : "범위를 벗어났습니다";
  return `${formatIsoDate(date)} · ${weekdayName(date, lang)}`;
}
