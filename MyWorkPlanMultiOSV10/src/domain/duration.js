// Durations as MS Project writes them: "5d", "2.5 days", "2w", "4h", "30m",
// "1mo", elapsed "3ed", milestones "0d", estimated "5d?". Stored as minutes of
// working time plus the unit the user typed (shown back in that unit).
//
// Unit sizes follow the project options: hours per day, hours per week, days
// per month (MS Project defaults: 8, 40, 20).

export const UNITS = ['m', 'h', 'd', 'w', 'mo', 'em', 'eh', 'ed', 'ew', 'emo'];
export const DEFAULT_OPTIONS = { hoursPerDay: 8, hoursPerWeek: 40, daysPerMonth: 20 };

/** Minutes in one of `unit` (elapsed units use the clock: a day is 24 h). */
export function unitMinutes(unit, options = DEFAULT_OPTIONS) {
  const o = { ...DEFAULT_OPTIONS, ...options };
  switch (unit) {
    case 'm': return 1;
    case 'h': return 60;
    case 'd': return o.hoursPerDay * 60;
    case 'w': return o.hoursPerWeek * 60;
    case 'mo': return o.daysPerMonth * o.hoursPerDay * 60;
    case 'em': return 1;
    case 'eh': return 60;
    case 'ed': return 1440;
    case 'ew': return 10080;
    case 'emo': return 43200;
    default: return o.hoursPerDay * 60;
  }
}

export const isElapsed = (unit) => String(unit).startsWith('e');

const WORDS = [
  [/^(?:m|min|mins|minute|minutes|분)$/i, 'm'],
  [/^(?:h|hr|hrs|hour|hours|시간)$/i, 'h'],
  [/^(?:d|dy|day|days|일)$/i, 'd'],
  [/^(?:w|wk|wks|week|weeks|주)$/i, 'w'],
  [/^(?:mo|mon|mons|month|months|개월|달)$/i, 'mo'],
  [/^(?:em|emin|emins)$/i, 'em'],
  [/^(?:eh|ehr|ehrs|ehour|ehours)$/i, 'eh'],
  [/^(?:ed|eday|edays)$/i, 'ed'],
  [/^(?:ew|ewk|ewks|eweek|eweeks)$/i, 'ew'],
  [/^(?:emo|emon|emonth|emonths)$/i, 'emo'],
];

/**
 * "5d" → { minutes: 2400, unit: 'd', estimated: false }. A bare number uses
 * `defaultUnit`. Returns null when the text is not a duration.
 */
export function parseDuration(text, options = DEFAULT_OPTIONS, defaultUnit = 'd', { allowNegative = false } = {}) {
  const value = String(text ?? '').trim().replace(',', '.');
  const match = /^([-+]?\d*\.?\d+)\s*([a-zA-Z가-힣]*)\s*(\?)?$/.exec(value);
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isFinite(number) || (!allowNegative && number < 0)) return null;
  let unit = defaultUnit;
  if (match[2]) {
    const found = WORDS.find(([pattern]) => pattern.test(match[2]));
    if (!found) return null;
    unit = found[1];
  }
  return { minutes: Math.round(number * unitMinutes(unit, options)), unit, estimated: Boolean(match[3]) };
}

const trim = (number) => {
  const rounded = Math.round(number * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
};

/** Short label of a unit in the language (MS Project style: "일", "days"). */
export function unitLabel(unit, language = 'ko', amount = 2) {
  const ko = { m: '분', h: '시간', d: '일', w: '주', mo: '개월', em: '경과 분', eh: '경과 시간', ed: '경과 일', ew: '경과 주', emo: '경과 개월' };
  const en = { m: 'min', h: 'hr', d: 'day', w: 'wk', mo: 'mon', em: 'emin', eh: 'ehr', ed: 'eday', ew: 'ewk', emo: 'emon' };
  if (language === 'en') return en[unit] + (amount === 1 ? '' : 's');
  return ko[unit];
}

/** 2400 minutes in days → "5일" / "5 days" (estimated: "5일?"). */
export function formatDuration(minutes, unit = 'd', options = DEFAULT_OPTIONS, language = 'ko', estimated = false) {
  const size = unitMinutes(unit, options);
  const amount = (minutes ?? 0) / size;
  const label = unitLabel(unit, language, Math.abs(amount));
  return `${trim(amount)}${language === 'en' ? ' ' : ''}${label}${estimated ? '?' : ''}`;
}

/** Compact form for links and files: "5d", "-1.5d", "4h". */
export const compactDuration = (minutes, unit = 'd', options = DEFAULT_OPTIONS) => `${trim((minutes ?? 0) / unitMinutes(unit, options))}${unit}`;

/** Lag: a duration (may be negative) or a percentage of the predecessor's duration ("50%"). */
export function parseLag(text, options = DEFAULT_OPTIONS) {
  const value = String(text ?? '').trim();
  if (!value) return { lag: 0, lagUnit: 'd' };
  const percent = /^([-+]?\d*\.?\d+)\s*%$/.exec(value);
  if (percent) return { lag: Number(percent[1]), lagUnit: '%' };
  const parsed = parseDuration(value, options, 'd', { allowNegative: true });
  return parsed ? { lag: parsed.minutes, lagUnit: parsed.unit } : null;
}

export function formatLag(lag, lagUnit = 'd', options = DEFAULT_OPTIONS) {
  if (!lag) return '';
  if (lagUnit === '%') return `${lag > 0 ? '+' : ''}${lag}%`;
  const text = compactDuration(lag, lagUnit, options);
  return lag > 0 ? `+${text}` : text;
}

export const LINK_TYPES = ['FS', 'SS', 'FF', 'SF'];
/** Korean names MS Project uses for the link types. */
export const LINK_TYPES_KO = { FS: 'FS', SS: 'SS', FF: 'FF', SF: 'SF' };

/**
 * Predecessors as typed in the table: "3, 5SS+2d, 7FF-1d, 9SF+50%".
 * `idOf` maps a row number (task ID) to the task's uid. Returns
 * { links: [{ taskId, type, lag, lagUnit }], errors: [text] }.
 */
export function parsePredecessors(text, idOf, options = DEFAULT_OPTIONS) {
  const links = [];
  const errors = [];
  for (const raw of String(text ?? '').split(/[,;]/).map((part) => part.trim()).filter(Boolean)) {
    const match = /^(\d+)\s*(FS|SS|FF|SF|완료-시작|시작-시작|완료-완료|시작-완료)?\s*(?:([+-])\s*(.+))?$/i.exec(raw);
    if (!match) { errors.push(raw); continue; }
    const taskId = idOf(Number(match[1]));
    if (!taskId) { errors.push(raw); continue; }
    const typeText = (match[2] ?? 'FS').toUpperCase();
    const type = { '완료-시작': 'FS', '시작-시작': 'SS', '완료-완료': 'FF', '시작-완료': 'SF' }[match[2]] ?? typeText;
    let lag = { lag: 0, lagUnit: 'd' };
    if (match[3]) {
      lag = parseLag(`${match[3]}${match[4]}`, options);
      if (!lag) { errors.push(raw); continue; }
    }
    links.push({ taskId, type, lag: lag.lag, lagUnit: lag.lagUnit });
  }
  return { links, errors };
}

export function formatPredecessors(links, rowOf, options = DEFAULT_OPTIONS) {
  return (links ?? []).map((link) => {
    const row = rowOf(link.taskId);
    if (!row) return null;
    const lag = formatLag(link.lag, link.lagUnit, options);
    return link.type === 'FS' && !lag ? String(row) : `${row}${link.type}${lag}`;
  }).filter(Boolean).join(',');
}

/** Money: "₩1,234,500" / "$1,234.50". */
export function formatMoney(value, currency = '₩') {
  const number = Number(value) || 0;
  const decimals = currency === '₩' || currency === '¥' ? 0 : 2;
  const text = Math.abs(number).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${number < 0 ? '-' : ''}${currency}${text}`;
}

export function parseMoney(text) {
  const value = Number(String(text ?? '').replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(value) ? value : null;
}

/** Work: minutes → "40시간" / "40 hrs". */
export function formatWork(minutes, language = 'ko', unit = 'h', options = DEFAULT_OPTIONS) {
  return formatDuration(minutes ?? 0, unit, options, language);
}
