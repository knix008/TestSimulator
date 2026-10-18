import { useEffect, useState } from "react";
import type { Messages } from "../domain/messages";
import { checkOnline } from "../domain/network";

/**
 * Tells once that the network is down, at start or when the connection drops later. The calendar keeps working
 * on saved or built-in holidays meanwhile; the notice closes by itself when the connection comes back.
 */
export function useNetworkNotice(): { open: boolean; dismiss: () => void } {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let controller = new AbortController();
    const check = () => {
      controller.abort();
      controller = new AbortController();
      const { signal } = controller;
      void checkOnline(signal)
        .then((online) => {
          if (!signal.aborted) setOpen(!online);
        })
        .catch(() => undefined);
    };
    const onOffline = () => {
      controller.abort();
      setOpen(true);
    };
    check();
    window.addEventListener("online", check);
    window.addEventListener("offline", onOffline);
    return () => {
      controller.abort();
      window.removeEventListener("online", check);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return { open, dismiss: () => setOpen(false) };
}

export function NetworkNotice({ t, onClose }: { t: Messages; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div
        className="modal notice-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="network-notice-title"
        aria-describedby="network-notice-body"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <section className="panel notice">
          <h2 id="network-notice-title">{t.offlineTitle}</h2>
          <p id="network-notice-body">{t.offlineBody}</p>
          <div className="sheet-actions">
            <button type="button" className="text-btn primary" autoFocus onClick={onClose}>
              {t.dismiss}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
