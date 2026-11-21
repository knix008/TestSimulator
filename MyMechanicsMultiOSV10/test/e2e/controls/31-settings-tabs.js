//@step {"name": "settings: general tab — every control changes the app's settings and what the main window shows", "expect": "^ok "}
window.__settingsTab('general')
//@step {"name": "settings: start tab — every control changes the app's settings and what the main window shows", "expect": "^ok "}
window.__settingsTab('start')
//@step {"name": "settings: appearance tab — every control changes the app's settings and what the main window shows", "expect": "^ok "}
window.__settingsTab('appearance')
//@step {"name": "settings: font tab — every control changes the app's settings and what the main window shows", "expect": "^ok "}
window.__settingsTab('font')
//@step {"name": "settings: background tab — every control changes the app's settings and what the main window shows", "expect": "^ok "}
window.__settingsTab('background')
//@step {"name": "settings: cad tab — every control changes the app's settings and what the main window shows", "expect": "^ok "}
window.__settingsTab('cad')
//@step {"name": "settings: recent tab — every control changes the app's settings and what the main window shows", "expect": "^ok "}
window.__settingsTab('recent')
//@step {"name": "settings: shortcuts tab — every control changes the app's settings and what the main window shows", "expect": "^ok "}
window.__settingsTab('shortcuts')
//@step {"name": "settings: tabs added later are covered too", "expect": "^ok"}
return (async () => { const known = ['general', 'start', 'appearance', 'font', 'background', 'cad', 'recent', 'shortcuts']; const out = []; for (const t of window.__settingsTabs.filter((x) => !known.includes(x))) out.push(await window.__settingsTab(t)); const bad = out.filter((x) => !x.startsWith('ok')); return bad.length ? bad.join(' || ') : `ok ${out.length} more tabs`; })()
//@step {"name": "settings: Reset puts every setting back to its default; the start settings are restored afterwards", "expect": "^ok$"}
return (async () => {
  const m = window.__mymechanics;
  const { defaultSettings } = await import('/src/domain/settings.js');
  const win = await window.__settingsWin('general');
  m.actions.updateSettings({ showGrid: !m.state.settings.showGrid, decimals: 5 }, { quiet: true });
  await new Promise((r) => setTimeout(r, 150));
  const btn = [...win.document.querySelectorAll('[data-action="reset-settings"]')][0] ?? null;
  let tab = null;
  if (!btn) for (const t of window.__settingsTabs) { const w = await window.__settingsWin(t); if (w.document.querySelector('[data-action="reset-settings"]')) { tab = t; break; } }
  const w2 = await window.__settingsWin(tab);
  const reset = w2.document.querySelector('[data-action="reset-settings"]');
  if (!reset) return 'no reset button';
  reset.click(); await new Promise((r) => setTimeout(r, 300));
  const def = defaultSettings(m.state.settings.language);
  const off = Object.keys(def).filter((k) => !['backgroundImage', 'backgroundName', 'lastDirectory', 'language', 'tutorialOffered', 'tutorialDone'].includes(k) && JSON.stringify(def[k]) !== JSON.stringify(m.state.settings[k])).map((k) => `${k} = ${JSON.stringify(m.state.settings[k])} (default ${JSON.stringify(def[k])})`);
  m.popups.closeAll();
  m.actions.updateSettings(JSON.parse(window.__settingsStart), { quiet: true });
  await new Promise((r) => setTimeout(r, 150));
  if (JSON.stringify(m.state.settings) !== window.__settingsStart) return 'the start settings did not come back';
  return off.length ? `not reset: ${off.join(', ')}` : 'ok';
})()
