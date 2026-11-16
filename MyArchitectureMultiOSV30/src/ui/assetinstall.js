// The asset library download in the UI (src/io/assetlib.js, src/io/assetstore.js):
// started by itself on the first start (and whenever files are missing), in the
// background with a progress popup (files, megabytes, the file now loading);
// when something fails, a popup says so and offers Retry (nothing is retried by
// itself). Settings → Asset library shows the state and reinstalls it.

import { t } from "./i18n.js";
import { h, modal, toast, progressPopup, confirmDialog } from "./widgets.js";
import { installLibrary, libraryStatus, megabytes } from "../io/assetlib.js";
import { assetStore, libraryChanged } from "../io/assetstore.js";

let running = null; // the download in progress (a promise), so it never runs twice

export const isInstalling = () => !!running;

/** { total, installed, missing, complete, bytes, dir, kind } of this computer's library. */
export async function libraryState() {
  const store = assetStore();
  const info = await store.info();
  return { ...libraryStatus(info.files || []), bytes: info.bytes || 0, dir: info.dir || "", kind: store.kind };
}

/** At start: download what is missing, unless switched off (GUI tests: MYARCH_NO_LIBRARY_DOWNLOAD). */
export async function ensureLibrary(app) {
  const desktop = typeof window !== "undefined" ? window.myarch : null;
  if (desktop && desktop.libraryAuto === false) return null;
  if (app.settings.libraryAuto === false) return null;
  let st;
  try { st = await libraryState(); } catch (e) { console.warn("asset library", e); return null; }
  if (st.complete) return st;
  return installAssets(app);
}

/**
 * Downloads the missing files (all of them when `force`: the library is deleted first). Runs in the background;
 * resolves to installLibrary's result. `fetchImpl` / `ask` let tests stand in for the network and the popup.
 */
export function installAssets(app, { force = false, fetchImpl = null, ask = true } = {}) {
  if (running) return running;
  running = (async () => {
    const store = assetStore();
    const pp = progressPopup("asset-library", { title: t("Downloading the asset library"), icon: "import" });
    pp.set(0, 1, t("Asking Poly Haven for the files…"));
    let res;
    try {
      if (force) await store.clear();
      res = await installLibrary({
        store, fetch: fetchImpl || ((url, o) => fetch(url, o)), force,
        onProgress: ({ done, total, bytes, totalBytes, file }) => pp.set(done, total, `${megabytes(bytes)} / ${megabytes(totalBytes)}${file ? ` · ${file.split("/").slice(-2).join("/")}` : ""}`),
      });
    } catch (e) {
      res = { ok: false, downloaded: 0, failed: [{ rel: "", error: e.message || String(e) }], bytes: 0 };
    }
    if (res.downloaded) libraryChanged(); // the views load the new pictures
    app.settings.libraryCheckedAt = new Date().toISOString();
    if (app.saveSettings) app.saveSettings();
    if (res.ok) {
      pp.finish(res.downloaded ? t("Asset library installed ({mb})", { mb: megabytes(res.bytes) }) : t("The asset library is complete"));
    } else {
      pp.finish(t("Download incomplete"));
      if (ask) setTimeout(() => failedPopup(app, res), 0);
    }
    return res;
  })().finally(() => { running = null; });
  return running;
}

/** The popup after a failed download: what failed, Retry or Later. */
export async function failedPopup(app, res) {
  const n = res.failed.length;
  const list = h("ul", { class: "lib-fail-list" }, ...res.failed.slice(0, 6).map((f) => h("li", {}, f.rel ? `${f.rel}: ${f.error}` : f.error)), n > 6 ? h("li", {}, t("… and {n} more", { n: n - 6 })) : null);
  const body = h("div", {},
    h("p", {}, t("{n} files of the asset library (material pictures, HDRI skies) could not be downloaded. Check the internet connection and try again. Until then those materials show their plain colour.", { n })),
    list,
    h("p", { class: "field-hint" }, t("You can also download it later: Settings → General → Asset library.")));
  const again = await modal({ icon: "warning", title: t("Asset library download failed"), width: 560, body, buttons: [{ label: t("Later"), value: false }, { label: t("Retry"), value: true, primary: true }] });
  if (again) return installAssets(app);
  return null;
}

/** Settings → Reinstall: asks, deletes the library and downloads it all again. */
export async function reinstallAssets(app) {
  if (running) { toast(t("The asset library is being downloaded already."), "info"); return running; }
  if (!(await confirmDialog(t("Delete the asset library on this computer and download it all again (about 270 MB)?"), { title: t("Reinstall the asset library"), ok: t("Reinstall") }))) return null;
  return installAssets(app, { force: true });
}
