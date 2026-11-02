/**
 * "You have unsaved changes" on the way out.
 *
 * Three answers, not two: save and go, go without saving, or stay. Closing the window
 * means "stay", which is the only safe reading of a dismissed warning.
 */
import type { DialogProps } from "../DialogHost.js";
import { Icon } from "../icons.js";
import { Button, Buttons } from "./parts.js";

export function UnsavedDialog({ t, resolve, close }: DialogProps) {
  return (
    <>
      <div className="confirm-body">
        <Icon name="warning" size={26} />
        <p data-testid="unsaved-message">{t("unsaved.message")}</p>
      </div>
      <Buttons>
        <Button icon="close" name="cancel" onClick={close}>{t("dlg.cancel")}</Button>
        <Button icon="exit" name="discard" onClick={() => resolve("discard")}>{t("unsaved.discard")}</Button>
        <Button icon="save" name="save" primary onClick={() => resolve("save")}>{t("unsaved.save")}</Button>
      </Buttons>
    </>
  );
}
