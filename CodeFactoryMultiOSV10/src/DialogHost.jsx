// The entry point for a dialog that runs in its own OS window.
//
// The same bundle serves both roles: `#dialog=<name>` in the URL selects this
// host instead of the main App, and it renders exactly one dialog filling the
// window. The dialog components are unchanged — AppDialog simply drops its
// backdrop and its own title-bar drag when it is already a window (see
// `standalone`), because the OS window is doing that job.

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { platform } from './platform/adapter.js';
import { applyTheme, DEFAULT_THEME } from './themes.js';
import { normalizeSettings } from './core/settings.js';
import { SettingsDialog, AboutDialog, ReportDialog, DiagramExportDialog } from './views/Dialogs.jsx';

/** Reads `#dialog=settings` from the URL. */
export function dialogNameFromLocation() {
  const match = /[#&?]dialog=([\w-]+)/.exec(window.location.hash + window.location.search);
  return match ? match[1] : null;
}

export default function DialogHost({ name }) {
  const { i18n } = useTranslation();
  const [payload, setPayload] = useState(null);
  const [busy, setBusy] = useState(false);
  const dialogs = platform.dialogWindows;

  // The payload carries whatever the opener wants this dialog to know, plus the
  // appearance so the window does not flash the wrong theme on the way up.
  const applyAppearance = useCallback(
    (appearance) => {
      if (!appearance) return;
      applyTheme(appearance.theme || DEFAULT_THEME);
      if (appearance.uiLanguage && appearance.uiLanguage !== i18n.language) i18n.changeLanguage(appearance.uiLanguage);
    },
    [i18n],
  );

  useEffect(() => {
    let alive = true;
    dialogs.getPayload().then((value) => {
      if (!alive) return;
      setPayload(value);
      applyAppearance(value && value.appearance);
    });

    const offPayload = dialogs.onPayload((value) => {
      setPayload(value);
      applyAppearance(value && value.appearance);
    });
    // The opener can change theme or language while this window is open.
    const offAppearance = dialogs.onAppearance(applyAppearance);

    return () => {
      alive = false;
      offPayload();
      offAppearance();
    };
  }, [dialogs, applyAppearance]);

  const close = useCallback(() => dialogs.closeSelf(), [dialogs]);

  const submit = useCallback(
    (data, { keepOpen } = {}) => {
      dialogs.submit(name, data);
      if (!keepOpen) close();
    },
    [dialogs, name, close],
  );

  if (!payload) return <div className="dialog-window-loading" />;

  const common = { standalone: true, onClose: close };

  switch (name) {
    case 'settings':
      return (
        <SettingsDialog
          {...common}
          settings={normalizeSettings(payload.settings)}
          onApply={(next) => submit({ settings: next })}
        />
      );
    case 'about':
      return (
        <AboutDialog
          {...common}
          platformInfo={payload.platformInfo}
          onOpenExternal={(url) => platform.openExternal(url)}
        />
      );
    case 'report':
      return (
        <ReportDialog
          {...common}
          busy={busy}
          onGenerate={(format, sections) => {
            // The opener owns the analysis result, so it does the writing; this
            // window stays open until it reports back.
            setBusy(true);
            submit({ format, sections }, { keepOpen: true });
          }}
        />
      );
    case 'diagram':
      return (
        <DiagramExportDialog
          {...common}
          busy={busy}
          onExport={(format) => {
            setBusy(true);
            submit({ format }, { keepOpen: true });
          }}
        />
      );
    default:
      return <div className="dialog-window-loading">Unknown dialog: {name}</div>;
  }
}
