const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('IS_ELECTRON', true);

contextBridge.exposeInMainWorld('electron', {
  // 앱 시작 시 열어야 할 .kprj 파일 경로 가져오기
  getOpenFile: () => ipcRenderer.invoke('get-open-file'),

  // .kprj 파일을 저장 다이얼로그로 저장
  saveKprj: (defaultName, jsonContent) =>
    ipcRenderer.invoke('save-kprj-dialog', defaultName, jsonContent),

  // .kprj 파일 열기 다이얼로그
  openKprjDialog: () => ipcRenderer.invoke('open-kprj-dialog'),

  // 파일 열기 이벤트 리스너 (더블클릭으로 .kprj 열 때)
  onOpenKprj: (callback) => {
    ipcRenderer.on('open-kprj', (event, filePath) => callback(filePath));
  }
});
