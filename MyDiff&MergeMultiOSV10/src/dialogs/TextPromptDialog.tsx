/**
 * A one-line question: a name to type, and OK or Cancel.
 *
 * The file picker is a different thing — it browses, and it is the wrong shape for
 * "what should this be called?". This is the small dialog for the handful of places
 * that need a word back: renaming an entry in a folder comparison, naming a saved
 * session.
 *
 * The box starts selected, so the common case — accept the suggestion, or type over
 * it — costs no extra clicks, and Enter commits.
 */
import { useEffect, useRef, useState } from "react";
import type { DialogProps } from "../DialogHost.js";
import { Button, Buttons, Field } from "./parts.js";

type TextPromptPayload = {
  title?: string;
  label?: string;
  value?: string;
  placeholder?: string;
  /** Shown under the box: what the value is for, or what it may not be. */
  hint?: string;
};

export function TextPromptDialog({ payload, t, resolve, close }: DialogProps) {
  const options = (payload ?? {}) as TextPromptPayload;
  const [value, setValue] = useState(options.value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    resolve(trimmed);
  };

  return (
    <>
      <Field label={options.label ?? t("session.name")} hint={options.hint}>
        <input
          ref={inputRef}
          className="text-input"
          data-field="text"
          value={value}
          spellCheck={false}
          placeholder={options.placeholder}
          aria-label={options.label ?? t("session.name")}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              close();
            }
          }}
        />
      </Field>

      <Buttons>
        <Button icon="close" name="cancel" onClick={close}>{t("dlg.cancel")}</Button>
        <Button icon="check" name="ok" primary disabled={!value.trim()} onClick={commit}>
          {t("dlg.ok")}
        </Button>
      </Buttons>
    </>
  );
}
