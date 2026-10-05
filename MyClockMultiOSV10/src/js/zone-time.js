'use strict';

/**
 * 시간대 변환 — 세계 시간 목록과 추가 시계 창이 함께 쓴다.
 * Intl 로 그 지역의 시각을 받아 Date 처럼 쓸 수 있는 값으로 바꾼다.
 */

/** 주어진 IANA 시간대의 현지 시각을 필드로 분해한다. */
function zonedParts(date, zone) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).formatToParts(date);
  } catch {
    // 모르는 시간대면 이 컴퓨터의 시각으로 돌려준다 — 시계가 멈추는 것보다 낫다.
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds()
    };
  }

  const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24, // Intl 은 자정을 24로 줄 수 있다
    minute: get('minute'),
    second: get('second')
  };
}

/** 그 지역의 "벽시계 시각"을 담은 Date — 그리기에만 쓴다. */
function zonedDate(date, zone) {
  const p = zonedParts(date, zone);
  return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

/** 이 컴퓨터의 날짜와 며칠 차이가 나는지 (+1일 / -1일). */
function zoneDayDiff(parts, now) {
  const there = new Date(parts.year, parts.month - 1, parts.day).getTime();
  const here = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((there - here) / 86400000);
  if (diff === 0) return '';
  return diff > 0 ? `+${diff}일` : `${diff}일`;
}

if (typeof module !== 'undefined') {
  module.exports = { zonedParts, zonedDate, zoneDayDiff };
}
