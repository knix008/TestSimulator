import type { MouseEvent, ReactNode } from "react";
import { CloseIcon } from "./icons";

export function WindowChrome({
  icon,
  title,
  closeLabel,
  onClose,
  onMouseDown,
}: {
  icon: ReactNode;
  title: string;
  closeLabel: string;
  onClose: () => void;
  onMouseDown: (event: MouseEvent) => void;
}) {
  return (
    <header className="chrome" onMouseDown={onMouseDown}>
      <span className="chrome-title">
        <span className="chrome-icon">{icon}</span>
        <h1 id="dialog-title">{title}</h1>
      </span>
      <button type="button" className="icon-btn close-btn chrome-close" aria-label={closeLabel} onClick={onClose}>
        <CloseIcon />
      </button>
    </header>
  );
}
