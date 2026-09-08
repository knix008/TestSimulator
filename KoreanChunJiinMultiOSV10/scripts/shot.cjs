/*
 * shot.cjs - 화면을 찍는다 (눈으로 확인용)
 *   node scripts/run-electron.mjs scripts/shot.cjs <저장폴더>
 */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

const outDir = process.argv[2] || '.';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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

  const shot = async (name) => {
    await wait(650);
    const img = await win.webContents.capturePage();
    await fs.writeFile(path.join(outDir, `${name}.png`), img.toPNG());
    console.log('saved', `${name}.png`);
  };

  await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  await wait(800);

  // 안녕하세요 반갑습니다 를 쳐 넣는다 (연타가 겹치는 자리는 기다린다)
  await win.webContents.executeJavaScript(`(async () => {
    const keys = [...document.querySelectorAll('.keypad-grid .btn')];
    const fns  = [...document.querySelectorAll('.keypad-fn .btn')];
    const SPACE = 2;
    const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const seq = ['a',0,1,4,'W',4,1,1,0,'a',7,7,0,1,7,1,0,0,'W','a',1,1,2,
                 'S', 6,0,1,4,3,0,1,6,7,2,6,4,0,5,0,1];
    for (const s of seq) {
      if (s === 'W') { await new Promise((r) => setTimeout(r, 900)); continue; }
      if (s === 'S') { click(fns[SPACE]); continue; }
      click(keys[s === 'a' ? 10 : s]);
    }
    await new Promise((r) => setTimeout(r, 80));
  })()`);

  const PALETTE = 7;   // 툴바에서 팔레트(테마 전환) 버튼 자리
  const NAMES = { '라이트': 'light', '다크': 'dark', '세피아': 'sepia', '고대비': 'contrast' };

  for (let i = 0; i < 4; i++) {
    await wait(700);
    const title = await win.webContents.executeJavaScript('document.title');
    await shot(NAMES[title.split(' - ')[1]] || `theme-${i}`);
    await win.webContents.executeJavaScript(
      `[...document.querySelectorAll('.toolbar .btn')][${PALETTE}].click()`,
    );
  }

  // 툴팁: 툴바 첫 버튼 위에 마우스를 올린 모습
  await wait(700);
  await win.webContents.executeJavaScript(`(async () => {
    const b = document.querySelector('.toolbar .btn');
    const r = b.getBoundingClientRect();
    b.dispatchEvent(new PointerEvent('pointerover', {
      bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  })()`);
  await shot('tooltip');

  // 오류 창: 일부러 실패시켜 본다
  await win.webContents.executeJavaScript(
    `window.dispatchEvent(new ErrorEvent('error', {
       message: '보기용 오류입니다',
       error: new Error('클립보드 쓰기를 브라우저가 막았습니다. 주소가 https 인지 확인해 보세요.') }))`,
  );
  await shot('error');

  app.exit(0);
});
