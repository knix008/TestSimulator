import type { ReactNode } from "react";
import { dragWindow } from "../platform/desktop";
import { CloseIcon } from "./icons";

export function WindowChrome({
  title,
  closeLabel,
  onClose,
  children,
}: {
  title: string;
  closeLabel: string;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <header className="toolbar chrome" onMouseDown={(event) => void dragWindow(event)}>
      <h1 id="dialog-title">{title}</h1>
      <span className="grow" />
      {children}
      <button type="button" className="icon-btn" aria-label={closeLabel} onClick={onClose}>
        <CloseIcon />
      </button>
    </header>
  );
}
