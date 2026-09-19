/* Popup window page (Electron): renders one dialog from js/dialogs.js in its own BrowserWindow.
 * The main window opens it with { kind, payload, theme, lang }; messages travel through main.js
 * (popup → main window: 'popup-event', main window → popup: 'popup-send').
 */
(async function () {
  const api = window.electronAPI;
  const params = new URLSearchParams(location.search);
  const kind = params.get('kind') || 'about';
  await window.Platform.init();

  const box = document.getElementById('popupBox');
  const handlers = [];
  const ctx = {
    isPopup: true,
    send: (event, data) => api.popupEmit({ kind, event, data }),
    close: () => window.close(),
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
    document.title = name ? `${name} — DCM Viewer` : 'DCM Viewer';
  }
  document.addEventListener('langchange', setTitle);

  api.onPopupInit(({ payload, theme, lang }) => {
    window.Themes.apply(theme || 'midnight');
    payloadTitle = (payload && payload.title) || '';
    window.I18n.setLang(lang || 'ko');
    setTitle();
    box.innerHTML = '';
    window.Dialogs.render(kind, box, payload, ctx);
    window.Icons.decorate(box);
    fitToContent();
    // wrapped labels / theme grid may settle after fonts load
    setTimeout(fitToContent, 120);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitToContent);
  });
  api.onPopupSend(({ event, data }) => {
    if (event === 'theme') { window.Themes.apply(data); return; }
    if (event === 'lang') { window.I18n.setLang(data); return; }
    handlers.forEach((fn) => fn(event, data));
    scheduleResize();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.close(); });
  api.popupReady({ kind });
})();
