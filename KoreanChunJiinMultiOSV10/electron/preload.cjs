/*
 * electron/preload.cjs - 렌더러에 놓아 주는 좁은 다리
 *
 * 렌더러는 Node 를 못 쓴다. 파일 대화상자와 창 크기 조절만 여기로 오간다.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chunjiin', {
  isElectron: true,
  platform: process.platform,

  /* 텍스트 파일 열기. { text, name } 또는 취소하면 null */
  openFile: () => ipcRenderer.invoke('file:open'),

  /* 텍스트 파일 저장. 저장한 파일 이름 또는 취소하면 null */
  saveFile: (text, suggestedName) => ipcRenderer.invoke('file:save', text, suggestedName),

  /* 오른쪽 아래 손잡이로 창 크기를 바꾼다 (누른 순간의 크기를 기준으로 잡는다) */
  beginResize: () => ipcRenderer.send('win:resize-begin'),
  resizeBy: (dw, dh) => ipcRenderer.send('win:resize-by', dw, dh),
  endResize: () => ipcRenderer.send('win:resize-end'),
});
