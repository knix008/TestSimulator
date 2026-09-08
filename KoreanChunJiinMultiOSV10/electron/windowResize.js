/*
 * windowResize.js - 오른쪽 아래 손잡이로 창 크기 바꾸기
 *
 * 손잡이는 창 안쪽에 그려져 있어 OS 의 조절 테두리가 아니다.
 * 그래서 누른 순간의 크기를 기억해 두고, 끌린 거리만큼 더해 준다.
 * 최소 크기는 BrowserWindow 의 minWidth/minHeight 가 알아서 지켜 준다.
 *
 * main.js 에서 떼어 둔 것은 시험에서 이 부분만 따로 걸어 볼 수 있게 하려는 것이다.
 */

/*
 * getWindow 는 지금 대상이 되는 BrowserWindow 를 돌려주는 함수다.
 * (창은 닫혔다 다시 열릴 수 있으므로 값이 아니라 함수로 받는다)
 */
export function registerWindowResize(ipcMain, getWindow) {
  let from = null;

  ipcMain.on('win:resize-begin', () => {
    const win = getWindow();
    from = win ? win.getBounds() : null;
  });

  ipcMain.on('win:resize-by', (_e, dw, dh) => {
    const win = getWindow();
    if (!win || !from) return;

    win.setBounds({
      x: from.x,
      y: from.y,
      width: Math.round(from.width + dw),
      height: Math.round(from.height + dh),
    });
  });

  ipcMain.on('win:resize-end', () => { from = null; });
}
