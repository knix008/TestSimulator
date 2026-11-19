// Gives every labelled item an icon: field labels, check boxes and section headings that the screen
// code did not give one get an icon chosen from what their text says (Korean or English).
import { icon } from '../icons.js';

/** Keyword → icon. The first match wins, so the more specific words come first. */
const WORDS = [
  [/데이터 서비스|data service/i, 'globe'],
  [/데이터베이스|database/i, 'database'],
  [/작업 공간 암호|workspace password/i, 'lock'],
  [/암호|비밀번호|password|비밀|secret/i, 'key'],
  [/로그인|sign[- ]?in|issuer|발급자/i, 'login'],
  [/계정|account|클라이언트|client/i, 'idCard'],
  [/부팅|system starts|launch/i, 'play'],
  [/배경|background/i, 'spark'],
  [/속도|speed/i, 'clock'],
  [/자동|automatic/i, 'bolt'],
  [/종류|engine|유형|type/i, 'layers'],
  [/호스트|host|서버|server/i, 'globe'],
  [/포트|port/i, 'link'],
  [/보안|security|tls|ssl/i, 'lock'],
  [/보내는|받는|메일|mail|from|to\b/i, 'comment'],
  [/웹훅|webhook/i, 'link'],
  [/외부 api|\bapi\b|토큰|token/i, 'code'],
  [/지식|페이지|pages?\b|knowledge/i, 'book'],
  [/소식|news/i, 'spark'],
  [/근무 달력|달력|휴일|calendar|holiday/i, 'calendar'],
  [/고객 포털|portal/i, 'request'],
  [/승인|approval/i, 'check'],
  [/교차 계획|계획|plan/i, 'roadmap'],
  [/문서|document/i, 'file'],
  [/관찰|watch/i, 'eye'],
  [/새 이슈|이슈|issue/i, 'issues'],
  [/담당|assignee|사람|people|사용자|user/i, 'user'],
  [/의견|comment/i, 'comment'],
  [/상태|status|전이|transition/i, 'workflow'],
  [/수정|edit|편집/i, 'pencil'],
  [/설명|description/i, 'pencil'],
  [/우선순위|priority/i, 'flag'],
  [/에픽|epic/i, 'epic'],
  [/스프린트|sprint/i, 'backlog'],
  [/포인트|point|추정|estimate/i, 'chart'],
  [/상위|parent/i, 'subtask'],
  [/첨부|attach|파일|file/i, 'paperclip'],
  [/보드|board/i, 'board'],
  [/프로젝트|과제|project/i, 'folder'],
  [/활동|activity/i, 'bolt'],
  [/만들기 화면|create screen|화면|screen/i, 'layers'],
  [/글자|text size|font/i, 'file'],
  [/팀|team/i, 'team'],
  [/모듈|module/i, 'layers'],
  [/이름|name|제목|title/i, 'tag'],
  [/라벨|label|태그|tag/i, 'tag'],
  [/기간|날짜|date|due|start|end/i, 'calendar'],
];

function glyphFor(text) {
  for (const [pattern, glyph] of WORDS) if (pattern.test(text)) return glyph;
  return '';
}

function add(el, glyph) {
  el.insertAdjacentHTML('afterbegin', icon(glyph));
  el.classList.add('auto-icon');
}

/** Adds the missing icons under `root`. Safe to call after every paint (already-iconed items are skipped). */
export function decorateIcons(root) {
  if (!root?.querySelectorAll) return;
  for (const el of root.querySelectorAll('.form-row > span:first-child, h2, h3, label.check')) {
    if (el.querySelector('svg') || el.closest('.bg-grid, .about-table, .reader, .md, .pl-filters, .plan-table, .plan-settings')) continue;
    const text = (el.textContent || '').trim();
    if (!text) continue;
    const glyph = glyphFor(text);
    if (glyph) add(el, glyph);
    else if (!el.matches('label.check')) add(el, el.matches('h2, h3') ? 'layers' : 'tag');
  }
}
