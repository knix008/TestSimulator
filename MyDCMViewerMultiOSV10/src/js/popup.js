/* Popup window page (desktop): renders one dialog from js/dialogs.js in a window of its own.
 * The main window opens it with { kind, payload, theme, lang }; messages travel through the host
 * (popup → main window: 'popup-event', main window → popup: 'popup-send'). See src-tauri/src/lib.rs.
 */
(async function () {
  const api = window.desktopAPI;
  const params = new URLSearchParams(location.search);
  const kind = params.get('kind') || 'about';
  await window.Platform.init();
  // saving from a dialog window: the progress popup is the main window's
  window.Platform.progress = {
    start: async (title) => { await api.popupEmit({ kind: '__progress', event: 'start', data: title }); },
    finish: async () => { await api.popupEmit({ kind: '__progress', event: 'finish', data: null }); },
  };

  const box = document.getElementById('popupBox');
  // resizable dialog windows show a grip in the bottom-right corner (same list as lib.rs resizable_popup)
  if (['mpr', 'document', 'tageditor', 'waveform', 'dicomdir', 'volume', 'pacs', 'help'].includes(kind) && api.startResize) {
    const grip = document.getElementById('resizeGrip');
    grip.hidden = false;
    grip.title = window.I18n ? window.I18n.t('status.resize') : '';
    grip.addEventListener('pointerdown', (e) => { if (e.button === 0) { e.preventDefault(); api.startResize(); } });
  }
  let handlers = [];
  const close = () => api.closeWindow();
  const ctx = {
    isPopup: true,
    send: (event, data) => api.popupEmit({ kind, event, data: data === undefined ? null : data }),
    close,
    onMessage: (fn) => handlers.push(fn),
    resize: () => scheduleResize(),
  };

  let resizeTimer = null;
  let lockedHeight = 0;
  function scheduleResize() { clearTimeout(resizeTimer); resizeTimer = setTimeout(fitToContent, 30); }
  function fitToContent() {
    const hint = window.Dialogs.size(kind);
    const w = hint.width || 520;
    // measure at the target width so wrapped text is accounted for
    box.style.width = `${w}px`;
    let h = hint.height || Math.ceil(box.getBoundingClientRect().height) + 2;
    if (kind === 'settings') { if (lockedHeight) h = lockedHeight; else lockedHeight = h; }   // fixed size, whatever tab is shown
    api.popupResize({ width: w, height: Math.min(h, screen.availHeight - 60) });
  }

  // window title: translated popup name, or the payload's title (error / prompt); re-done whenever the language changes
  let payloadTitle = '';
  function setTitle() {
    const name = window.I18n.t(`popup.${kind}`) !== `popup.${kind}` ? window.I18n.t(`popup.${kind}`) : payloadTitle;
    const title = name ? `${name} — MyDCMViewer` : 'MyDCMViewer';
    document.title = title;
    window.Platform.setTitle(title);
  }
  document.addEventListener('langchange', setTitle);

  function show(init) {
    if (!init) return;
    const { payload, theme, lang } = init;
    window.Themes.apply(theme || 'midnight');
    payloadTitle = (payload && payload.title) || '';
    window.I18n.setLang(lang || 'ko');
    setTitle();
    handlers = [];
    box.innerHTML = '';
    window.Dialogs.render(kind, box, payload, ctx);
    window.Icons.decorate(box);
    fitToContent();
    // wrapped labels / theme grid may settle after fonts load
    setTimeout(fitToContent, 120);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitToContent);
  }
  // A second open of the same kind re-uses this window with new content.
  api.onPopupInit(show);
  api.onPopupSend(({ event, data }) => {
    if (event === 'theme') { window.Themes.apply(data); return; }
    if (event === 'lang') { window.I18n.setLang(data); setTitle(); return; }
    if (event === 'close') { close(); return; }
    handlers.forEach((fn) => fn(event, data));
    scheduleResize();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && kind !== 'progress') close(); });
  show(await api.popupReady());
})();
