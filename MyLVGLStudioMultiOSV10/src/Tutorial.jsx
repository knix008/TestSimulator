// The tutorial: a smart watch for a round LCD, made by the user. Each step lights what it talks about
// and lists what to do; doing it by hand ticks it off, and "do it for me" is one press away. The
// window stays usable underneath, and the card can be dragged out of the way.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Dialog } from "./dialogs.jsx";
import { Toggle } from "./controls.jsx";
import { Icon } from "./icons.jsx";
import { TUTORIAL_STEPS, tasksOf, taskStates } from "./lvgl/tutorial.js";

const CARD_WIDTH = 400;
const EDGE = 12;

const touches = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** The first place at the window's edges that leaves what is lit alone, else the first of them. */
function cardPosition(rects, height) {
  const { innerWidth: width, innerHeight: windowHeight } = window;
  const bottom = windowHeight - height - EDGE;
  const middle = (width - CARD_WIDTH) / 2;
  const places = [
    { left: middle, top: bottom },
    { left: width - CARD_WIDTH - EDGE, top: bottom },
    { left: EDGE, top: bottom },
    { left: middle, top: EDGE + 40 },
  ].map((place) => ({ left: Math.max(EDGE, place.left), top: Math.max(EDGE, place.top) }));
  if (!rects.length) return { left: Math.max(EDGE, middle), top: Math.max(EDGE, (windowHeight - height) / 2) };
  return places.find((place) => !rects.some((rect) => touches({ ...place, right: place.left + CARD_WIDTH, bottom: place.top + height }, rect))) ?? places[0];
}

const keepInWindow = ({ left, top }, height) => ({
  left: Math.max(EDGE, Math.min(window.innerWidth - CARD_WIDTH - EDGE, left)),
  top: Math.max(EDGE, Math.min(window.innerHeight - height - EDGE, top)),
});

export function Tutorial({ t, project, ran, onPrepare, onFinishStep, onClose }) {
  const [index, setIndex] = useState(0);
  const [rects, setRects] = useState([]);
  const [auto, setAuto] = useState({ left: EDGE, top: EDGE });
  const [dragged, setDragged] = useState(null);
  const card = useRef(null);
  const step = TUTORIAL_STEPS[index];
  const last = index === TUTORIAL_STEPS.length - 1;
  const tasks = taskStates(project, step, { ran });
  const done = tasks.every((task) => task.done);
  const hands = tasksOf(step).length > 0;

  const measure = useCallback(() => {
    const found = (step.selectors ?? []).map((selector) => document.querySelector(selector)?.getBoundingClientRect()).filter((box) => box?.width && box.height);
    const next = found.map((box) => ({ left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height }));
    setRects((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
    const place = cardPosition(next, card.current?.offsetHeight ?? 240);
    setAuto((current) => (current.left === place.left && current.top === place.top ? current : place));
  }, [step]);

  useEffect(() => {
    onPrepare(step);
    for (const selector of step.selectors ?? []) document.querySelector(selector)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    // Panels change and the step may have just changed what is on the screen.
    const timer = setInterval(measure, 300);
    const first = setTimeout(measure, 60);
    return () => {
      clearInterval(timer);
      clearTimeout(first);
    };
    // onPrepare changes with every render of the app; a step prepares once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, measure]);

  useLayoutEffect(measure, [measure, tasks.length]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  useEffect(() => {
    const key = (event) => {
      if (event.key !== "Escape") return;
      // Escape also ends typing and closes menus; only otherwise does it end the tutorial.
      if (event.target.closest?.("input, textarea, select, .icon-select, .menu, .popup-host")) return;
      if (document.querySelector(".menu-pop, .icon-select-list")) return;
      onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  // The card moves by its title, and stays where it is put from then on.
  const moveCard = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const box = card.current.getBoundingClientRect();
    const [dx, dy] = [event.clientX - box.left, event.clientY - box.top];
    const move = (next) => setDragged(keepInWindow({ left: next.clientX - dx, top: next.clientY - dy }, box.height));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const height = card.current?.offsetHeight ?? 240;
  const position = keepInWindow(dragged ?? auto, height);
  const empty = !step.selectors?.length;

  return (
    <div className={empty ? "tutorial dim" : "tutorial"} data-tutorial={step.id} data-tutorial-done={done ? "" : undefined} role="dialog" aria-label={t("tutorial.title")}>
      {rects.map((rect, number) => (
        <div
          key={number}
          className={hands ? "tutorial-spot ring" : "tutorial-spot"}
          data-tutorial-spot=""
          style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8 }}
        />
      ))}
      <div className={dragged ? "tutorial-card moved" : "tutorial-card"} ref={card} style={{ ...position, width: CARD_WIDTH }}>
        <header onPointerDown={moveCard}>
          <Icon name="tutorial" />
          <strong data-tutorial-title="">{t(`tutorial.${step.id}.title`)}</strong>
          <span className="tutorial-count" data-tutorial-count="">{index + 1} / {TUTORIAL_STEPS.length}</span>
        </header>
        <p data-tutorial-text="">{t(`tutorial.${step.id}.text`)}</p>
        {hands && (
          <ul className="tutorial-tasks" data-tutorial-tasks="">
            {tasks.map((task) => (
              <li key={task.id} className={task.done ? "done" : undefined} data-tutorial-task={task.id} data-done={task.done ? "" : undefined}>
                <Icon name={task.done ? "check" : "caretRight"} size={14} />
                <span>{t(`tutorial.${step.id}.task.${task.id}`)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="tutorial-progress"><i style={{ width: `${((index + 1) / TUTORIAL_STEPS.length) * 100}%` }} /></div>
        <footer>
          <button type="button" data-command="tutorial-skip" onClick={onClose}><Icon name="close" size={14} /> {t(last ? "dialog.close" : "tutorial.skip")}</button>
          <span />
          <button type="button" data-command="tutorial-prev" disabled={index === 0} onClick={() => setIndex(index - 1)}><Icon name="collapseLeft" size={14} /> {t("tutorial.prev")}</button>
          {hands && !done && <button type="button" data-command="tutorial-do" onClick={() => onFinishStep(step)}><Icon name="check" size={14} /> {t("tutorial.doIt")}</button>}
          {!last && <button type="button" className="primary" data-command="tutorial-next" disabled={!done} title={done ? undefined : t("tutorial.notYet")} onClick={() => setIndex(index + 1)}>{t("tutorial.next")} <Icon name="collapseRight" size={14} /></button>}
          {last && <button type="button" className="primary" data-command="tutorial-done" onClick={onClose}><Icon name="check" size={14} /> {t("tutorial.done")}</button>}
        </footer>
      </div>
    </div>
  );
}

/** Asked at the start. Whether it is asked again is decided here, and in the General settings. */
export function TutorialAsk({ t, ask, onAsk, onStart, onLater }) {
  return (
    <Dialog
      title={t("tutorial.askTitle")}
      icon="tutorial"
      onClose={onLater}
      id="tutorial-ask"
      width={480}
      footer={(
        <>
          <button type="button" className="primary" data-command="tutorial-start" onClick={onStart}><Icon name="run" /> {t("tutorial.start")}</button>
          <button type="button" data-command="tutorial-later" onClick={onLater}><Icon name="clock" size={14} /> {t("tutorial.later")}</button>
        </>
      )}
    >
      <p className="dialog-message">{t("tutorial.askText")}</p>
      <div className="tutorial-again">
        <Toggle id="tutorialAskAgain" label={t("pref.askTutorial")} checked={ask} onChange={onAsk} />
        <span>{t("pref.askTutorial")}</span>
      </div>
    </Dialog>
  );
}
