import {
  createEmptyMeeting, createSampleMeeting, lines, isMeetingEmpty,
  numberSections, meetingBaseName, meetingToMarkdown, meetingToPlainText,
  buildStructure,
} from '../../src/lib/meeting.js';
import { getOutline } from '../../src/lib/markdown.js';
import { eq, ok, includes, deepEq } from '../assert.js';

export const title = '회의록';

const KO = {
  date: '날짜', time: '시간', location: '장소', organizer: '주관자', recorder: '작성자',
  attendees: '참석자', agenda: '안건', notes: '회의 내용', decisions: '결정 사항',
  actions: '실행 항목', field: '항목', value: '내용', untitled: '제목 없는 회의',
  info: '회의 정보',
};

export default async function suite(test) {
  await test('빈 회의록은 모든 칸이 비어 있고 내보내기 대상이 아니다', () => {
    const m = createEmptyMeeting();
    deepEq(Object.keys(m), [
      'title', 'date', 'startTime', 'endTime', 'location', 'organizer', 'recorder',
      'attendees', 'agenda', 'body', 'decisions', 'actionItems',
    ]);
    ok(isMeetingEmpty(m));
    ok(isMeetingEmpty(null));
    eq(meetingBaseName(m), 'meeting');
  });

  await test('한 줄에 하나씩 적힌 목록은 빈 줄을 빼고 읽는다', () => {
    deepEq(lines('  김수호 \n\n이영희\n  '), ['김수호', '이영희']);
    deepEq(lines(''), []);
    deepEq(lines(null), []);
  });

  await test('한국어와 영어 예시 회의록을 불러온다', () => {
    const ko = createSampleMeeting('ko');
    const en = createSampleMeeting('en');
    eq(ko.title, '2026년 3분기 제품 기획 회의');
    eq(en.title, 'Q3 2026 Product Planning Meeting');
    ok(!isMeetingEmpty(ko));
    ok(lines(ko.attendees).length >= 2);
    eq(meetingBaseName(ko, 'meeting'), ko.title);
  });

  await test('제목은 번호를 붙이지 않고 본문 제목은 회의 내용 아래로 내린다', () => {
    const m = {
      ...createEmptyMeeting(),
      title: '기획',
      date: '2026-09-04',
      startTime: '14:00',
      endTime: '15:30',
      location: 'A|B',
      attendees: '김수호\n이영희',
      agenda: '로드맵',
      body: '## 검토\n\n**합의**',
      decisions: '확정',
      actionItems: '설계',
    };
    const md = meetingToMarkdown(m, KO);
    includes(md, '# 기획');
    ok(!md.includes('# 1 기획'));
    includes(md, '## 1 안건');
    includes(md, '## 2 회의 내용');
    includes(md, '### 2.1 검토');
    includes(md, '## 3 결정 사항');
    includes(md, '## 4 실행 항목');
    includes(md, '- [ ] 설계');
    includes(md, '14:00 – 15:30');
    includes(md, 'A\\|B');
    const plain = meetingToPlainText(m, KO);
    includes(plain, '기획');
    includes(plain, '[ ] 설계');
    ok(!plain.includes('**합의**'));
    includes(plain, '합의');
  });

  await test('번호 붙이기를 끄면 구역 제목에 번호가 없다', () => {
    const m = { ...createEmptyMeeting(), title: '기획', agenda: '하나' };
    const md = meetingToMarkdown(m, KO, { number: false });
    includes(md, '## 안건');
    ok(!md.includes('## 1 안건'));
  });

  await test('구역 번호는 코드 블록 안의 제목을 건너뛴다', () => {
    const md = numberSections('# 제목\n\n## 안건\n\n```\n## 코드\n```\n\n## 결정');
    includes(md, '# 제목');
    includes(md, '## 1 안건');
    includes(md, '## 코드');
    includes(md, '## 2 결정');
    ok(!md.includes('## 1 코드'));
  });

  await test('구조 보기는 회의 정보와 목록 항목을 트리로 펼친다', () => {
    const m = {
      ...createEmptyMeeting(),
      title: '기획',
      date: '2026-09-04',
      attendees: '김수호\n이영희',
      agenda: '로드맵',
      decisions: '확정',
      actionItems: '설계',
    };
    const md = meetingToMarkdown(m, KO);
    const tree = buildStructure(m, KO, getOutline(md));
    ok(tree.some((n) => n.kind === 'heading' && n.level === 1));
    ok(tree.some((n) => n.kind === 'group' && n.text === '회의 정보'));
    ok(tree.some((n) => n.kind === 'field' && n.field === 'date' && n.text.includes('2026-09-04')));
    ok(tree.some((n) => n.field === 'attendees' && n.kind === 'item' && n.text === '이영희'));
    ok(tree.some((n) => n.field === 'agenda' && n.text === '로드맵'));
    ok(tree.some((n) => n.field === 'actionItems' && n.text === '설계'));
  });
}
