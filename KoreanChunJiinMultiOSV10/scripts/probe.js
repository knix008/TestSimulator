/*
 * probe.js - 창 안에서 돌려 볼 검사 목록
 *
 * smoke.cjs 가 이 파일을 글자 그대로 읽어 페이지 안에서 실행한다.
 * 따로 두는 까닭은, 문자열 안에 코드를 끼워 넣으면 따옴표와 줄바꿈
 * 이스케이프가 겹쳐 금방 문법이 깨지기 때문이다. 그냥 평범한 파일로 둔다.
 *
 * 마지막 식(즉시 실행 함수)의 결과가 그대로 돌아간다.
 */
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const click = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const keys = () => [...document.querySelectorAll('.keypad-grid .btn')];
  const fns = () => [...document.querySelectorAll('.keypad-fn .btn')];
  const tools = () => [...document.querySelectorAll('.toolbar .btn')];
  const text = () => document.querySelector('.editor-text').textContent.replace(/​/g, '');

  /* 툴바: 0 새로 1 열기 2 저장 3 복사 4 붙여넣기 5 지우기 6 모드 7 테마 8 설정 9 정보 */
  const TOOL = { clear: 5, mode: 6, theme: 7, settings: 8, about: 9 };
  const out = {};

  /* ---- 한글 조합: "한글" (연타가 겹치는 자리는 기다린다) ---- */
  for (const s of [7, 7, 0, 1, 4, 'W', 3, 2, 'W', 4, 4]) {
    if (s === 'W') { await wait(900); continue; }
    click(keys()[s]);
  }
  await wait(80);
  out.hangul = text();
  out.keyCount = keys().length;
  out.fnCount = fns().length;
  out.labels = keys().map((b) => b.querySelector('.key-label').textContent).join(' ');

  /* ---- 대화상자: 설정 · 프로그램 정보 ---- */
  for (const name of ['settings', 'about']) {
    click(tools()[TOOL[name]]);
    await wait(140);
    const box = document.querySelector('.modal');
    out[name] = box ? box.querySelector('.modal-title span').textContent : '(열리지 않음)';
    click(box && box.querySelector('.modal-x'));
    await wait(120);
  }

  /* ---- 사용법은 툴바에서 뺐다. 프로그램 정보 창의 버튼으로 열린다. ---- */
  click(tools()[TOOL.about]);
  await wait(140);
  click([...document.querySelectorAll('.modal-foot .btn')]
    .find((b) => b.textContent.indexOf('사용법') === 0));
  await wait(180);
  out.help = document.querySelector('.modal')
    ? document.querySelector('.modal-title span').textContent : '(열리지 않음)';
  click(document.querySelector('.modal-x'));
  await wait(120);
  out.dialogsClosed = document.querySelector('.modal') === null;

  /* ---- 오류 창: 붙잡지 못한 오류가 구체적으로 뜨고 복사할 수 있어야 한다 ---- */
  window.dispatchEvent(new ErrorEvent('error', {
    message: '시험용', error: new Error('시험용 오류입니다'),
  }));
  await wait(200);
  out.errorTitle = (document.querySelector('.modal-title span') || {}).textContent || '(열리지 않음)';
  out.errorHasCopyButton = [...document.querySelectorAll('.modal-foot .btn')]
    .some((b) => b.textContent.indexOf('복사') >= 0);
  const detail = document.querySelector('.err-detail');
  out.errorDetailLines = detail ? detail.textContent.split(String.fromCharCode(10)).length : 0;
  out.errorDetailSelectable = detail ? getComputedStyle(detail).userSelect : '(없음)';
  click(document.querySelector('.modal-x'));
  await wait(140);
  /* 창을 닫아도 상태줄에 자국이 남아 다시 열 수 있어야 한다 */
  out.errorNoteLeft = (document.querySelector('.st-note-error') || {}).textContent || '(없음)';

  /* ---- 툴바 · 상태줄 · 손잡이 ---- */
  const tb = document.querySelector('.toolbar');
  out.toolbarButtons = tools().length;
  out.toolbarClipped = tb.scrollWidth > tb.clientWidth;
  out.infoIsRightmost = (tb.querySelector('.tool-right .btn') || {}).getAttribute
    ? tb.querySelector('.tool-right .btn').getAttribute('aria-label') : '(없음)';
  out.statusRows = document.querySelectorAll('.statusbar .st-row').length;
  out.statusText = [...document.querySelectorAll('.statusbar .st-row')]
    .map((r) => r.textContent.trim().replace(/\s+/g, ' ')).join(' | ');
  out.hasResizeGrip = Boolean(document.querySelector('.resize-grip'));

  /* ---- 툴팁이 빠르게 뜨는지 ---- */
  const b = tools()[0];
  const r = b.getBoundingClientRect();
  b.dispatchEvent(new PointerEvent('pointerover', {
    bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
  }));
  await wait(220);                       /* 130ms 지연 + 여유 */
  const tip = document.querySelector('.tip');
  out.tooltipText = tip ? tip.textContent : '(안 뜸)';
  out.tooltipInsideWindow = tip
    ? (tip.getBoundingClientRect().left >= 0
       && tip.getBoundingClientRect().right <= window.innerWidth)
    : false;

  /* ---- 모드 다섯 가지 ---- */
  document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));  /* 툴팁 치우기 */
  const modes = [];
  for (let i = 0; i < 5; i++) {
    modes.push(`${document.querySelector('.st-mode').textContent} / ${keys()[0].querySelector('.key-label').textContent}`);
    click(tools()[TOOL.mode]);
    await wait(90);
  }
  out.modes = modes;

  /* ---- 영문 멀티탭: "hi" ---- */
  click(tools()[TOOL.clear]);
  await wait(60);
  click(tools()[TOOL.mode]);             /* 한글 -> 영문 abc */
  await wait(90);
  click(keys()[2]); click(keys()[2]);    /* h */
  await wait(900);
  click(keys()[2]); click(keys()[2]); click(keys()[2]);  /* i */
  await wait(80);
  out.english = text();
  out.mode = document.querySelector('.st-mode').textContent;

  return out;
})()
