/**
 * About.
 *
 * One page, no tabs. What is this, who wrote it, what it opens, and — the part that
 * matters when a bug report comes in — one summary line of exactly what is running:
 * build stamp, platform, Tauri, the WebView and Node. The Copy button puts all of it
 * on the clipboard, which is what the person filing the report actually needs.
 */
import { useEffect, useState } from "react";
import {
  APP_NAME,
  APP_TITLE,
  APP_VERSION,
  AUTHOR,
  COPYRIGHT,
  DOC_DESCRIPTION,
  DOC_EXTENSION,
} from "../../core/appInfo.js";
import { APP_ICON_URL } from "../appIcon.js";
import type { DialogProps } from "../DialogHost.js";
import * as host from "../host.js";
import { Button, Buttons, Field } from "./parts.js";

const PLATFORM_NAMES: Record<string, string> = { win32: "Windows", darwin: "macOS", linux: "Linux" };

export function AboutDialog({ settings, t, close }: DialogProps) {
  const [versions, setVersions] = useState<Record<string, string>>({});
  const [platform, setPlatform] = useState(navigator.platform);
  const [packaged, setPackaged] = useState(false);

  useEffect(() => {
    window.mcm?.info()
      .then((info) => {
        setVersions(info.versions as unknown as Record<string, string>);
        setPlatform(info.platform);
        setPackaged(info.packaged);
      })
      .catch(() => {});
  }, []);

  const buildTime = typeof __MCM_BUILD__ === "string" ? __MCM_BUILD__ : "";
  const stamp = buildTime ? new Date(buildTime).toLocaleString() : "-";

  /**
   * The one line that answers "what exactly are you running?". Kept short enough to
   * show whole: the OS by name and the WebView by its major version.
   */
  const build = [
    `${PLATFORM_NAMES[platform] ?? platform}${packaged ? "" : " (dev)"}`,
    `Tauri ${versions.tauri ?? "-"}`,
    `WebView ${(versions.webview ?? "-").split(".")[0]}`,
    `Node ${versions.node ?? "-"}`,
  ].join(" · ");

  const report = [
    `${APP_NAME} V${APP_VERSION}`,
    `Author   ${AUTHOR}`,
    `Build    ${stamp}`,
    `Runtime  ${build}`,
    `Settings ${settings.settingsPath}`,
  ].join("\n");

  return (
    <>
      <div className="about-hero">
        <img className="about-icon" src={APP_ICON_URL} alt="" width={72} height={72} />
        <div>
          <h2>{APP_TITLE}</h2>
          <p>{t("about.description")}</p>
        </div>
      </div>

      <Field label={t("about.author")}><strong data-testid="about-author">{AUTHOR}</strong></Field>
      <Field label={t("about.version")}>{APP_VERSION}</Field>
      <Field label={t("about.documents")}>.{DOC_EXTENSION} — {DOC_DESCRIPTION}</Field>
      <Field label={t("about.buildTime")}>{stamp}</Field>
      <Field label={t("about.build")}>
        <span className="about-value" title={build}>{build}</span>
      </Field>
      <Field label={t("about.settingsPath")}>
        <span className="about-value about-path" title={settings.settingsPath}>{settings.settingsPath}</span>
      </Field>

      <p className="license-text">{COPYRIGHT}</p>

      <Buttons>
        <Button icon="copy" name="copy" onClick={() => void host.copyText(report)}>
          {t("dlg.copy")}
        </Button>
        <Button icon="check" name="close" primary onClick={close}>{t("dlg.close")}</Button>
      </Buttons>
    </>
  );
}
