// The entry point for a dialog that runs in its own OS window.
//
// The same bundle serves both roles: `#dialog=<name>` in the URL selects this
// host instead of the main App, and it renders exactly one dialog filling the
// window. On the web the same components are rendered by InPageDialogs inside
// a modal layer, so a dialog never knows which of the two it is in — except
// through `standalone`, which adds the draggable title bar.

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { platform } from './lib/platform.js';
import { dialogBus } from './lib/dialogBus.js';
import { applyTheme, applyFont, DEFAULT_THEME } from './themes.js';
import { TooltipLayer } from './components/common.jsx';
import { SettingsDialog } from './dialogs/SettingsDialog.jsx';
import { AboutDialog, ErrorDialog, ProgressDialog, ConfirmDialog, PromptDialog } from './dialogs/SimpleDialogs.jsx';
import { PrintDialog, SourcesDialog, RecorderDialog, RegionDialog } from './dialogs/CaptureDialogs.jsx';

const COMPONENTS = {
  settings: SettingsDialog,
  about: AboutDialog,
  error: ErrorDialog,
  progress: ProgressDialog,
  confirm: ConfirmDialog,
  prompt: PromptDialog,
  print: PrintDialog,
  sources: SourcesDialog,
  recorder: RecorderDialog,
  region: RegionDialog,
};

/** Modal sizes for the in-page fallback (Electron sizes live in electron/dialogs.js). */
const MODAL_SIZES = {
  settings: [820, 640], about: [600, 540], error: [660, 460], progress: [480, 170], confirm: [520, 210], prompt: [560, 210],
  print: [640, 560], sources: [900, 640], recorder: [320, 90], region: [0, 0],
};

export function dialogNameFromLocation() {
  const match = /[#&?]dialog=([^&]+)/.exec(window.location.hash + window.location.search);
  return match ? decodeURIComponent(match[1]) : null;
}

export function baseName(name) { return String(name).split('#')[0]; }

function useAppearance() {
  const { i18n } = useTranslation();
  return useCallback((appearance) => {
    if (!appearance) return;
    applyTheme(appearance.theme || DEFAULT_THEME);
    if (appearance.font) applyFont(appearance.font);
    if (appearance.language && appearance.language !== i18n.language) i18n.changeLanguage(appearance.language);
  }, [i18n]);
}

export default function DialogHost({ name }) {
  const [payload, setPayload] = useState(null);
  const [ready, setReady] = useState(false);
  const applyAppearance = useAppearance();
  const dialogs = platform.dialogs;

  useEffect(() => {
    let alive = true;
    dialogs.getPayload().then((value) => {
      if (!alive) return;
      const p = value ? value.payload : null;
      setPayload(p);
      applyAppearance(p && p.appearance);
      setReady(true);
    });
    const offPayload = dialogs.onPayload((value) => { setPayload(value); applyAppearance(value && value.appearance); });
    const offAppearance = dialogs.onAppearance(applyAppearance);
    return () => { alive = false; offPayload(); offAppearance(); };
  }, [dialogs, applyAppearance]);

  useEffect(() => {
    if (payload && payload.title) document.title = `${payload.title} — CaptureMaster`;
  }, [payload]);

  // Tell the main process the first paint with real content is done; it
  // shows the window then (a region overlay waits for its screenshot).
  useEffect(() => {
    if (!ready) return undefined;
    let cancelled = false;
    const img = document.querySelector('.region img');
    const done = () => { if (!cancelled) requestAnimationFrame(() => requestAnimationFrame(() => dialogs.ready())); };
    if (img && !img.complete) { img.addEventListener('load', done, { once: true }); img.addEventListener('error', done, { once: true }); }
    else done();
    return () => { cancelled = true; };
  }, [ready, dialogs]);

  const onSubmit = useCallback((data, keepOpen) => {
    dialogs.submit(name, data, keepOpen);
    if (!keepOpen) dialogs.closeSelf();
  }, [dialogs, name]);
  const onClose = useCallback(() => dialogs.closeSelf(), [dialogs]);

  const Comp = COMPONENTS[baseName(name)];
  if (!Comp) return <div className="dlg-body">Unknown dialog: {name}</div>;
  if (!ready) return null;
  return (
    <>
      <Comp payload={payload} onSubmit={onSubmit} onClose={onClose} standalone />
      <TooltipLayer />
    </>
  );
}

/** Web fallback: renders every dialog the bus has open as an in-page modal. */
export function InPageDialogs() {
  const [list, setList] = useState(() => dialogBus.list());
  useEffect(() => dialogBus.onChange(setList), []);
  if (!list.length) return null;
  return (
    <>
      {list.map(({ name, payload }) => {
        const base = baseName(name);
        const Comp = COMPONENTS[base];
        if (!Comp) return null;
        const [w, h] = MODAL_SIZES[base] || [640, 520];
        const full = base === 'region';
        return (
          <div key={name} className="modal-backdrop" style={full ? { background: 'transparent' } : undefined}>
            <div className="modal" style={full ? { width: '100vw', height: '100vh', borderRadius: 0 } : { '--modal-w': `${w}px`, '--modal-h': `${h}px` }}>
              <Comp
                payload={payload}
                onSubmit={(data, keepOpen) => dialogBus.submit(name, data, keepOpen)}
                onClose={() => dialogBus.close(name)}
                standalone={false}
              />
            </div>
          </div>
        );
      })}
    </>
  );
}
