/** A yes/no question. Used before saving a merge that still has unresolved hunks. */
import type { DialogProps } from "../DialogHost.js";
import { Icon } from "../icons.js";
import { Button, Buttons } from "./parts.js";

export function ConfirmDialog({ payload, t, resolve, close }: DialogProps) {
  const data = (payload ?? {}) as { title?: string; message?: string };
  return (
    <>
      <div className="confirm-body">
        <Icon name="warning" size={26} />
        <p data-testid="confirm-message">{data.message ?? ""}</p>
      </div>
      <Buttons>
        <Button icon="close" name="no" onClick={close}>{t("dlg.no")}</Button>
        <Button icon="check" name="yes" primary onClick={() => resolve(true)}>{t("dlg.yes")}</Button>
      </Buttons>
    </>
  );
}
