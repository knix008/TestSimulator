'use strict';

/** 세계 시간 — 도시 목록과 검색, 시간대 변환. */

const test = require('node:test');
const assert = require('node:assert/strict');
const { CITIES, searchCities } = require('../src/js/data/cities');
const { WIN_TO_IANA } = require('../electron/win-timezones');

test('도시 목록이 넉넉하고 항목마다 시간대가 있다', () => {
  assert.ok(CITIES.length >= 200, `도시 수: ${CITIES.length}`);
  for (const city of CITIES) {
    assert.ok(city.city, '한글 이름이 없다');
    assert.ok(city.en, `${city.city}: 영문 이름이 없다`);
    assert.ok(city.country, `${city.city}: 국가가 없다`);
    assert.match(city.zone, /^[A-Za-z_]+\/[A-Za-z_+-]+(\/[A-Za-z_+-]+)?$/, `${city.city}: 시간대가 이상하다 (${city.zone})`);
  }
});

test('모든 도시의 시간대로 실제 시각을 낼 수 있다', () => {
  const now = new Date(2026, 9, 2, 12, 0, 0);
  const zones = [...new Set(CITIES.map((c) => c.zone))];
  for (const zone of zones) {
    const text = now.toLocaleTimeString('ko-KR', { timeZone: zone, hour: '2-digit', minute: '2-digit' });
    assert.ok(text.length > 0, `${zone}: 시각을 낼 수 없다`);
  }
});

test('도시 검색 — 한글·영문·국가로 찾는다', () => {
  assert.ok(searchCities('서울').some((c) => c.zone === 'Asia/Seoul'));
  assert.ok(searchCities('Tokyo').some((c) => c.zone === 'Asia/Tokyo'));
  assert.ok(searchCities('뉴욕').some((c) => c.zone === 'America/New_York'));
  assert.ok(searchCities('paris').some((c) => c.en === 'Paris'), '대소문자를 가리지 않는다');
  assert.ok(searchCities('프랑스').length > 0, '국가 이름으로도 찾는다');
});

test('도시 검색 — 앞에서 맞는 것을 먼저 보여 준다', () => {
  const hits = searchCities('런던');
  assert.ok(hits.length > 0);
  assert.equal(hits[0].city, '런던');
});

test('도시 검색 — 빈 말은 아무것도 내지 않고, 개수를 넘기지 않는다', () => {
  assert.deepEqual(searchCities(''), []);
  assert.deepEqual(searchCities('   '), []);
  assert.deepEqual(searchCities(null), []);
  assert.deepEqual(searchCities('없는도시이름입니다'), []);
  assert.ok(searchCities('a', 5).length <= 5);
  assert.ok(searchCities('서', 12).length <= 12);
});

test('윈도 시간대 이름을 IANA 이름으로 바꾼다 (WPF 판 설정 가져오기)', () => {
  assert.equal(WIN_TO_IANA['Korea Standard Time'], 'Asia/Seoul');
  assert.equal(WIN_TO_IANA['Tokyo Standard Time'], 'Asia/Tokyo');
  assert.equal(WIN_TO_IANA['Eastern Standard Time'], 'America/New_York');
  assert.ok(Object.keys(WIN_TO_IANA).length >= 30);
  for (const [win, iana] of Object.entries(WIN_TO_IANA)) {
    assert.match(iana, /^[A-Za-z_]+\/[A-Za-z_+-]+(\/[A-Za-z_+-]+)?$/, `${win} → ${iana}`);
  }
});
