import { TEMPLATES, templateName, templateMeeting } from '../../src/lib/templates.js';
import { createEmptyMeeting } from '../../src/lib/meeting.js';
import { eq, ok } from '../assert.js';

export const title = '양식';

const MEETING_KEYS = Object.keys(createEmptyMeeting());

export default async function suite(test) {
  await test('기본 양식 8개를 순서대로 불러온다', () => {
    eq(TEMPLATES.length, 8);
    eq(TEMPLATES[0].id, 'sample');
    eq(TEMPLATES[TEMPLATES.length - 1].id, 'client');
    const orders = TEMPLATES.map((tpl) => tpl.order);
    eq(JSON.stringify(orders), JSON.stringify([...orders].sort((a, b) => a - b)));
    eq(new Set(TEMPLATES.map((tpl) => tpl.id)).size, 8);
  });

  await test('양식마다 한국어와 영어 이름과 회의록 본문이 있다', () => {
    for (const tpl of TEMPLATES) {
      ok(tpl.name.ko, tpl.id);
      ok(tpl.name.en, tpl.id);
      ok(tpl.ko && tpl.ko.title, tpl.id);
      ok(tpl.en && tpl.en.title, tpl.id);
      eq(templateName(tpl, 'ko'), tpl.name.ko);
      eq(templateName(tpl, 'en'), tpl.name.en);
    }
  });

  await test('양식을 회의록 객체로 만들면 빈 회의록의 모든 칸을 채운다', () => {
    for (const lang of ['ko', 'en']) {
      for (const tpl of TEMPLATES) {
        const meeting = templateMeeting(tpl, lang);
        for (const key of MEETING_KEYS) ok(Object.prototype.hasOwnProperty.call(meeting, key), `${tpl.id} ${key}`);
        eq(meeting.title, tpl[lang].title);
      }
    }
  });

  await test('없는 언어는 영어 본문으로 대체한다', () => {
    const tpl = TEMPLATES[0];
    eq(templateName({ id: 'x' }, 'ko'), 'x');
    eq(templateMeeting(tpl, 'fr').title, tpl.en.title);
  });
}
