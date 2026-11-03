/**
 * The first-run offer of the tour: a small card in the bottom-right corner — never a
 * modal, so it cannot stand in the way of whatever the user opened the app to do.
 *
 * Shown once per launch while settings.showTutorial is on. "Start tutorial" starts the
 * tour; "Later" only closes the card; "Don't show again" turns the setting off and closes
 * it. The "Show at startup" checkbox (here, on the tour card and in Settings › General)
 * is that same setting, saved and published as soon as it is clicked. Finishing the tour
 * does not change it. Help › Tutorial starts the tour any time.
 */
import { useEffect, useState } from "react";
import { useDragCard } from "./dragCard.js";
import { Icon } from "./icons.js";
import { useApp } from "./state.js";
import { isTutorialRunning, startTutorial } from "./TutorialTour.js";
import { saveShowTutorial } from "./tutorialSetting.js";
import "./tutorial.css";

let offeredThisLaunch = false;

/**
 * `visible` is whether the start screen is in front. The card belongs to the start
 * screen: over a comparison it is hidden, not closed, so going back to the start
 * screen brings an offer that was never answered back with it.
 */
export function TutorialWelcome({ visible }: { visible: boolean }) {
  const app = useApp();
  const { t, settings } = app;
  const [open, setOpen] = useState(() => !offeredThisLaunch && settings.showTutorial && !isTutorialRunning());
  const drag = useDragCard();

  useEffect(() => {
    if (open) offeredThisLaunch = true;
  }, [open]);

  // The tour started some other way (Help › Tutorial): the offer is moot.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("mcm-tour-start", close);
    return () => window.removeEventListener("mcm-tour-start", close);
  }, [open]);

  if (!open || !visible) return null;

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
        <Icon name="graduation" size={26} />
      </div>
      <div className="tour-welcome-main">
        <header>
          <h3 id="tour-welcome-title">{t("tour.welcome.title")}</h3>
          <button type="button" className="tour-close" title={t("tour.welcome.later")} aria-label={t("tour.welcome.later")}
            onClick={() => setOpen(false)}>
            <Icon name="close" size={14} mono />
          </button>
        </header>
        <p>{t("tour.welcome.text")}</p>
        <div className="tour-welcome-actions">
          <button type="button" className="tour-button primary" data-welcome="start"
            onClick={() => {
              setOpen(false);
              startTutorial();
            }}>
            <Icon name="graduation" size={14} mono />
            <span>{t("tour.welcome.start")}</span>
          </button>
          <button type="button" className="tour-button" data-welcome="later" onClick={() => setOpen(false)}>
            <span>{t("tour.welcome.later")}</span>
          </button>
          <button type="button" className="tour-button ghost" data-welcome="never"
            onClick={() => {
              setOpen(false);
              void saveShowTutorial(false);
            }}>
            <span>{t("tour.welcome.never")}</span>
          </button>
        </div>
        <div className="tour-welcome-foot">
          <label className="tour-startup">
            <input
              type="checkbox"
              data-field="welcomeShowAtStart"
              checked={settings.showTutorial}
              onChange={(event) => void saveShowTutorial(event.target.checked)}
            />
            <span>{t("tour.showAtStart")}</span>
          </label>
          <small className="tour-welcome-hint">{t("tour.welcome.hint")}</small>
        </div>
      </div>
    </aside>
  );
}
