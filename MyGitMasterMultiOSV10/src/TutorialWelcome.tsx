/**
 * The tutorial offer: a small card in the bottom-right corner of the start screen —
 * never a modal, and never over the workspace (App mounts it only while the start
 * screen shows), so it cannot stand in the way of the work.
 *
 * Offered while settings.showTutorial is on, each time the start screen shows, until
 * it is answered or closed once in this launch. "Start tutorial" starts the
 * tour; "Later" only closes the card; "Don't show again" turns the setting off and
 * closes it. The "Show at startup" checkbox (here, on the tour card and in
 * Preferences › General) is that same setting, saved as soon as it is clicked.
 * Help › Tutorial starts the tour any time.
 */
import { useEffect, useState } from "react";
import { useDragCard } from "./dragCard";
import { StartIcon } from "./startIcons";
import { isTutorialRunning, startTutorial } from "./TutorialTour";
import "./tutorial.css";

let answeredThisLaunch = false;

/** The card was closed or answered: not offered again until the next launch. */
function answered(): void {
  answeredThisLaunch = true;
}

export function TutorialWelcome({
  t,
  showAtStart,
  onShowAtStart,
}: {
  t: (key: string) => string;
  /** settings.showTutorial */
  showAtStart: boolean;
  onShowAtStart: (value: boolean) => void;
}) {
  const [open, setOpenState] = useState(() => !answeredThisLaunch && !isTutorialRunning());
  const setOpen = (value: boolean) => {
    if (!value) answered();
    setOpenState(value);
  };
  const drag = useDragCard();

  // The tour started some other way (Help › Tutorial): the offer is moot.
  useEffect(() => {
    if (!open) return;
    const close = () => {
      answered();
      setOpenState(false);
    };
    window.addEventListener("mgm-tour-start", close);
    return () => window.removeEventListener("mgm-tour-start", close);
  }, [open]);

  if (!open || !showAtStart) return null;

  return (
    <aside
      className={`tour-welcome${drag.position ? " moved" : ""}`}
      role="dialog"
      aria-labelledby="tour-welcome-title"
      data-testid="tour-welcome"
      data-drag-card=""
      style={drag.position ? { ...drag.position, right: "auto", bottom: "auto" } : undefined}
      onPointerDown={drag.onPointerDown}
    >
      <div className="tour-welcome-icon" aria-hidden="true">
        <StartIcon name="tutorial" size={26} mono />
      </div>
      <div className="tour-welcome-main">
        <header>
          <h3 id="tour-welcome-title">{t("tourWelcomeTitle")}</h3>
          <button type="button" className="tour-close" title={t("tourWelcomeLater")} aria-label={t("tourWelcomeLater")}
            onClick={() => setOpen(false)}>
            <StartIcon name="close" size={14} mono />
          </button>
        </header>
        <p>{t("tourWelcomeText")}</p>
        <div className="tour-welcome-actions">
          <button type="button" className="tour-button primary" data-welcome="start"
            onClick={() => {
              setOpen(false);
              startTutorial();
            }}>
            <StartIcon name="tutorial" size={14} mono />
            <span>{t("tourWelcomeStart")}</span>
          </button>
          <button type="button" className="tour-button" data-welcome="later" onClick={() => setOpen(false)}>
            <span>{t("tourWelcomeLater")}</span>
          </button>
          <button type="button" className="tour-button ghost" data-welcome="never"
            onClick={() => {
              setOpen(false);
              onShowAtStart(false);
            }}>
            <span>{t("tourWelcomeNever")}</span>
          </button>
        </div>
        <div className="tour-welcome-foot">
          <label className="tour-startup">
            <input
              type="checkbox"
              data-field="welcomeShowAtStart"
              checked={showAtStart}
              onChange={(event) => onShowAtStart(event.target.checked)}
            />
            <span>{t("tourShowAtStart")}</span>
          </label>
          <small className="tour-welcome-hint">{t("tourWelcomeHint")}</small>
        </div>
      </div>
    </aside>
  );
}
