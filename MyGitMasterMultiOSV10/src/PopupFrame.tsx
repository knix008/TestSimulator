/**
 * The chrome every popup dialog has, in its own OS window and in the browser's modal
 * alike: a title bar with the dialog's icon and title (drag it to move the window —
 * src/tauriBridge.ts treats `.popup-title` as a drag row), and a close button that turns
 * red under the pointer. Esc closes too.
 */
import { useEffect, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";

export function PopupFrame({
  icon,
  title,
  closeLabel,
  onClose,
  children,
  name,
}: {
  icon: IconName;
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  name?: string;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="popup-frame" data-popup={name}>
      <header className="popup-title">
        <span className="popup-title-icon"><Icon name={icon} /></span>
        <span className="popup-title-text">{title}</span>
        <button type="button" className="popup-close" title={closeLabel} aria-label={closeLabel} onClick={onClose}>
          <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M2 2l6 6M8 2L2 8" /></svg>
        </button>
      </header>
      <div className="popup-content">{children}</div>
    </div>
  );
}
