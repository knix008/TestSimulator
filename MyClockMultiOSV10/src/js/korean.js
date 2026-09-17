'use strict';

/** 시각을 한글로 표기 — MyClockWinV10/Models/KoreanTimeText.cs 이식. */

const SINO_ONES = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
const NATIVE_HOURS = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열', '열한', '열두'];
const TENS = { 2: '이십', 3: '삼십', 4: '사십', 5: '오십', 6: '육십', 7: '칠십', 8: '팔십', 9: '구십' };

/** 0–99 사이의 한자어 수사 (영, 일, …, 오십구). */
function toSino(n) {
  if (!Number.isInteger(n) || n < 0 || n > 99) return String(n);
  if (n === 0) return '영';
  if (n < 10) return SINO_ONES[n];
  if (n < 20) return n === 10 ? '십' : `십${SINO_ONES[n % 10]}`;
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  const tensStr = TENS[tens] || `${SINO_ONES[tens]}십`;
  return ones === 0 ? tensStr : tensStr + SINO_ONES[ones];
}

function formatKoreanClock(date, use24h, showSeconds) {
  let hour12 = date.getHours() % 12;
  if (hour12 === 0) hour12 = 12;

  const h = use24h ? date.getHours() : hour12;
  const hourPart = use24h ? `${toSino(h)}시` : `${NATIVE_HOURS[h]}시`;
  const minPart = `${toSino(date.getMinutes())}분`;

  if (!showSeconds) return `${hourPart}:${minPart}`;
  return `${hourPart}:${minPart}:${toSino(date.getSeconds())}초`;
}

/** 남은 시간(ms)을 한글 카운트다운으로. */
function formatKoreanCountdown(remainingMs, showSeconds) {
  const total = Math.max(0, Math.floor(remainingMs / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  const hourPart = h > 0 ? `${toSino(h)}시간` : '';
  const minPart = `${toSino(m)}분`;

  if (!showSeconds) return hourPart ? `${hourPart}:${minPart}` : minPart;

  const secPart = `${toSino(s)}초`;
  return hourPart ? `${hourPart}:${minPart}:${secPart}` : `${minPart}:${secPart}`;
}

if (typeof module !== 'undefined') {
  module.exports = { toSino, formatKoreanClock, formatKoreanCountdown };
}
