/**
 * Where to connect, for a comparison against a server.
 *
 * Everything but the password goes into the remote path, which is what gets saved
 * with the session and shown in the pane's title bar. The password is kept only
 * for as long as the connection lasts: a session file that carried one would be a
 * credential in a file somebody might share.
 */
import { useState } from "react";
import type { DialogProps } from "../DialogHost.js";
import { Button, Buttons, CheckField, Field } from "./parts.js";

export type RemotePayload = { local?: string };

export function RemoteDialog({ payload, t, resolve, close }: DialogProps) {
  const options = (payload ?? {}) as RemotePayload;
  const [host, setHost] = useState("");
  const [port, setPort] = useState("21");
  const [user, setUser] = useState("anonymous");
  const [password, setPassword] = useState("");
  const [folder, setFolder] = useState("/");
  const [secure, setSecure] = useState(false);

  const ready = host.trim().length > 0;
  const commit = () => {
    if (!ready) return;
    const scheme = secure ? "ftps" : "ftp";
    const account = user.trim() && user.trim() !== "anonymous" ? `${encodeURIComponent(user.trim())}@` : "";
    const where = port.trim() && port.trim() !== "21" ? `:${port.trim()}` : "";
    const path = `/${folder.trim()}`.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
    resolve({ remote: `${scheme}://${account}${host.trim()}${where}${path}`, password });
  };

  const text = (
    label: string,
    name: string,
    value: string,
    onChange: (next: string) => void,
    type = "text",
  ) => (
    <Field label={label}>
      <input
        className="text-input"
        data-field={name}
        type={type}
        value={value}
        spellCheck={false}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
      />
    </Field>
  );

  return (
    <>
      {options.local ? (
        <Field label={t("pane.left")}>
          <span className="path" title={options.local}>{options.local}</span>
        </Field>
      ) : null}

      {text(t("remote.host"), "host", host, setHost)}
      {text(t("remote.port"), "port", port, setPort)}
      {text(t("remote.user"), "user", user, setUser)}
      {text(t("remote.password"), "password", password, setPassword, "password")}
      {text(t("remote.folder"), "folder", folder, setFolder)}

      <CheckField
        label={t("remote.secure")}
        name="secure"
        icon="lock"
        checked={secure}
        onChange={(value) => {
          setSecure(value);
          // The usual port for explicit FTPS is still 21; only the handshake
          // differs. Nothing to change but the scheme.
        }}
      />

      <p className="field-note">{t("remote.note")}</p>

      <Buttons>
        <Button icon="close" name="cancel" onClick={close}>{t("dlg.cancel")}</Button>
        <Button icon="check" name="connect" primary disabled={!ready} onClick={commit}>
          {t("remote.connect")}
        </Button>
      </Buttons>
    </>
  );
}
