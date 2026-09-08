/*
 * smoke.cjs - 창을 실제로 띄워 화면이 도는지 확인한다
 *
 *   npm run test:app
 *
 * 검사 목록은 scripts/probe.js 에 평범한 파일로 두고 여기서 읽어 실행한다.
 * (문자열 안에 코드를 끼워 넣으면 이스케이프가 겹쳐 금방 깨진다)
 */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const errors = [];
const probe = fs.readFileSync(path.join(__dirname, 'probe.js'), 'utf8');

/* 어떤 일이 있어도 매달려 있지 않는다 */
const guard = setTimeout(() => {
  console.error('시간이 너무 걸려 중단합니다 (60초).');
  app.exit(1);
}, 60_000);

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 460,
    height: 820,
    minWidth: 420,
    minHeight: 560,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.webContents.on('console-message', (e) => {
    /* 개발 중에만 뜨는 Electron 보안 안내는 건너뛴다 */
    const text = e.message || '';
    if (e.level >= 2 && !text.includes('Electron Security Warning')) errors.push(text);
  });
  win.webContents.on('render-process-gone', (_e, d) => errors.push(`renderer gone: ${d.reason}`));

  await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  await new Promise((r) => setTimeout(r, 900));

  let result;
  try {
    result = await win.webContents.executeJavaScript(probe);
  } catch (e) {
    console.error('probe.js 실행 실패:', e.message);
    clearTimeout(guard);
    app.exit(1);
    return;
  }

  console.log('SMOKE', JSON.stringify(result, null, 2));
  if (errors.length) console.log('ERRORS', JSON.stringify(errors, null, 2));

  /* 눈으로 볼 것 없이 기대와 다르면 실패로 끝낸다 */
  const checks = {
    '한글 조합': result.hangul === '한글',
    '영문 멀티탭': result.english === 'hi',
    '키패드 12키': result.keyCount === 12,
    '기능 버튼 6개': result.fnCount === 6,
    '대화상자 열고 닫기': result.dialogsClosed === true,
    '오류 창': result.errorTitle === '오류',
    '오류 복사 버튼': result.errorHasCopyButton === true,
    '오류 본문 선택 가능': result.errorDetailSelectable === 'text',
    '오류 자국 남음': result.errorNoteLeft !== '(없음)',
    '툴바 안 잘림': result.toolbarClipped === false,
    '정보 버튼 오른쪽': result.infoIsRightmost === '프로그램 정보',
    '사용법 버튼 없음': result.toolbarButtons === 10,
    '상태줄 두 줄': result.statusRows === 2,
    '크기 손잡이': result.hasResizeGrip === true,
    '툴팁 뜸': result.tooltipText !== '(안 뜸)',
    '툴팁 화면 안': result.tooltipInsideWindow === true,
    '콘솔 오류 없음': errors.length === 0,
  };

  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);

  console.log('\nCHECKS');
  for (const [name, ok] of Object.entries(checks)) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  }
  console.log(failed.length ? `\n실패 ${failed.length}개: ${failed.join(', ')}` : '\n모두 통과');

  clearTimeout(guard);
  app.exit(failed.length ? 1 : 0);
});
