import { TIME_OPTIONS, TIME_RE, isValidTime, timeToMinutes, isEndBeforeStart } from '../../src/lib/time.js';
import { nowRounded } from '../../src/components/TimeCombo.jsx';
import { eq, ok, deepEq } from '../assert.js';

export const title = '시간';

export default async function suite(test) {
  await test('시간 목록은 15분 간격으로 하루를 채운다', () => {
    eq(TIME_OPTIONS.length, 96);
    eq(TIME_OPTIONS[0], '00:00');
    eq(TIME_OPTIONS[1], '00:15');
    eq(TIME_OPTIONS[TIME_OPTIONS.length - 1], '23:45');
    eq(new Set(TIME_OPTIONS).size, 96);
  });

  await test('직접 입력은 HH:MM만 받고 분 단위로 바꾼다', () => {
    ok(isValidTime('14:00'));
    ok(isValidTime('09:30'));
    ok(isValidTime('9:05'));
    ok(TIME_RE.test('23:59'));
    ok(!isValidTime(''));
    ok(!isValidTime('24:00'));
    ok(!isValidTime('14:60'));
    ok(!isValidTime('오후 2시'));
    eq(timeToMinutes('14:00'), 14 * 60);
    eq(timeToMinutes(' 9:05 '), 9 * 60 + 5);
    eq(timeToMinutes('24:00'), null);
    eq(timeToMinutes(''), null);
  });

  await test('종료 시각이 시작보다 이르면 알려 준다', () => {
    ok(isEndBeforeStart('15:00', '14:00'));
    ok(!isEndBeforeStart('14:00', '15:30'));
    ok(!isEndBeforeStart('14:00', '14:00'));
    ok(!isEndBeforeStart('', '14:00'));
    ok(!isEndBeforeStart('soon', 'later'));
  });

  await test('지금 시각은 고른 간격으로 반올림한 HH:MM이다', () => {
    for (const step of [5, 10, 15, 30]) {
      const value = nowRounded(step);
      ok(/^\d{2}:\d{2}$/.test(value), value);
      const [hh, mm] = value.split(':').map(Number);
      ok(hh >= 0 && hh <= 23, value);
      ok(mm >= 0 && mm < 60 && mm % step === 0, value);
    }
    deepEq(nowRounded(15).split(':').length, 2);
  });
}
