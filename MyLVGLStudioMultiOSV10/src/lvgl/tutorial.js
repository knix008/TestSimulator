// The tutorial: a smart watch GUI for a round LCD, built by the user step by step. Plain data, so
// the tests can check every step: it has words, it starts undone, and "do it for me" finishes it.
//
// A step's tasks look at the project, so doing the work by hand ticks them off. Widgets are found by
// their place among those of their type on a screen, so their names are up to the user.
import { addNode, addScreen, createNode, newProject } from "./project.js";

export const TUTORIAL_PROJECT = "MyWatch";

const FACE = 0;
const WORKOUT = 1;
const WHITE = "#ffffff";
const BLACK = "#000000";

const role = (screen, type, nth = 0) => ({ screen, type, nth });
const OUTER = role(FACE, "arc", 0);
const INNER = role(FACE, "arc", 1);
const TIME = role(FACE, "label", 0);
const DATE = role(FACE, "label", 1);
const GOAL = role(FACE, "label", 2);
const BATTERY = role(FACE, "bar", 0);
const GO = role(FACE, "button", 0);
const HEART = role(WORKOUT, "arc", 0);
const BPM = role(WORKOUT, "label", 0);
const UNIT = role(WORKOUT, "label", 1);
const BACK = role(WORKOUT, "button", 0);

export function findRole(project, { screen, type, nth }) {
  return project.screens[screen]?.children.filter((node) => node.type === type)[nth] ?? null;
}

function ensure(project, wanted) {
  const screen = ensureScreen(project, wanted.screen);
  for (let count = screen.children.filter((node) => node.type === wanted.type).length; count <= wanted.nth; count++) {
    addNode(project, screen.id, createNode(project, wanted.type));
  }
  return findRole(project, wanted);
}

function ensureScreen(project, index) {
  while (project.screens.length <= index) addScreen(project);
  return project.screens[index];
}

/** Numbers as numbers (nothing set is 0), colours in any case, text without the spaces around it. */
function same(value, expected) {
  if (typeof expected === "boolean") return value === expected;
  if (typeof expected === "number") return Number(value ?? 0) === expected;
  return String(value ?? "").trim().toLowerCase() === expected.toLowerCase();
}

const placed = (id, wanted) => ({
  id,
  check: (project) => !!findRole(project, wanted),
  apply: (project) => ensure(project, wanted),
});

const setProps = (id, wanted, props) => ({
  id,
  check: (project) => {
    const node = findRole(project, wanted);
    return !!node && Object.entries(props).every(([key, value]) => same(node.props[key], value));
  },
  apply: (project) => Object.assign(ensure(project, wanted).props, props),
});

const screenProps = (id, index, props) => ({
  id,
  check: (project) => {
    const screen = project.screens[index];
    return !!screen && Object.entries(props).every(([key, value]) => same(screen.props[key], value));
  },
  apply: (project) => Object.assign(ensureScreen(project, index).props, props),
});

const screenName = (id, index, name) => ({
  id,
  check: (project) => project.screens[index]?.name === name,
  apply: (project) => {
    ensureScreen(project, index).name = name;
  },
});

const showsValue = (id, from, to, text) => ({
  id,
  check: (project) => {
    const [source, target] = [findRole(project, from), findRole(project, to)];
    return !!source && !!target && source.events.some((event) => event.action === "showValue" && event.target === target.id && (event.text ?? "").includes("%d"));
  },
  apply: (project) => {
    const target = ensure(project, to);
    ensure(project, from).events.push({ trigger: "VALUE_CHANGED", action: "showValue", target: target.id, text });
  },
});

const loadsScreen = (id, from, index) => ({
  id,
  check: (project) => {
    const [source, screen] = [findRole(project, from), project.screens[index]];
    return !!source && !!screen && source.events.some((event) => event.action === "screen" && event.target === screen.id && event.trigger === "CLICKED");
  },
  apply: (project) => {
    const screen = ensureScreen(project, index);
    ensure(project, from).events.push({ trigger: "CLICKED", action: "screen", target: screen.id });
  },
});

const DESIGN = (type) => [`[data-palette="${type}"]`, ".device-screen", '[data-panel="attributes"]'];
const EVENTS = ['[data-group="attr:events"]'];

/**
 * selectors: what the step points at (none: the middle of the window)
 * view:      "design" or "split", the view the step needs
 * screen:    the screen to show, by index
 * focus:     the widget to select if it is there yet
 * tasks:     what has to be done before going on; steps without them only explain
 */
export const TUTORIAL_STEPS = [
  { id: "welcome", view: "design", screen: FACE },
  {
    id: "round",
    view: "design",
    screen: FACE,
    selectors: ['[data-command="device-chip"]'],
    tasks: [{
      id: "device",
      check: (project) => project.device.shape === "round" && project.device.w === 360 && project.device.h === 360,
      apply: (project) => {
        project.device = { w: 360, h: 360, shape: "round" };
      },
    }],
  },
  {
    id: "theme",
    view: "design",
    screen: FACE,
    selectors: ['[data-command="settings"]', '[data-panel="attributes"]'],
    tasks: [
      {
        id: "dark",
        check: (project) => project.theme.dark === true,
        apply: (project) => {
          project.theme.dark = true;
        },
      },
      screenProps("background", FACE, { bgColor: BLACK }),
      screenName("name", FACE, "Face"),
    ],
  },
  {
    id: "outer",
    view: "design",
    screen: FACE,
    focus: OUTER,
    selectors: DESIGN("arc"),
    tasks: [
      placed("place", OUTER),
      setProps("size", OUTER, { width: 340, height: 340, align: "CENTER", x: 0, y: 0 }),
      setProps("value", OUTER, { value: 68 }),
      setProps("color", OUTER, { indicatorColor: "#66bb6a" }),
    ],
  },
  {
    id: "inner",
    view: "design",
    screen: FACE,
    focus: INNER,
    selectors: DESIGN("arc"),
    tasks: [
      placed("place", INNER),
      setProps("size", INNER, { width: 290, height: 290, align: "CENTER", x: 0, y: 0 }),
      setProps("value", INNER, { value: 45 }),
      setProps("color", INNER, { indicatorColor: "#ff7043" }),
    ],
  },
  {
    id: "time",
    view: "design",
    screen: FACE,
    focus: TIME,
    selectors: DESIGN("label"),
    tasks: [
      placed("place", TIME),
      setProps("text", TIME, { text: "10:24" }),
      setProps("font", TIME, { font: 48, textColor: WHITE }),
      setProps("position", TIME, { align: "CENTER", x: 0, y: -34 }),
    ],
  },
  {
    id: "date",
    view: "design",
    screen: FACE,
    focus: DATE,
    selectors: DESIGN("label"),
    tasks: [
      placed("place", DATE),
      setProps("text", DATE, { text: "THU 5 NOV" }),
      setProps("font", DATE, { font: 18, textColor: "#9e9e9e" }),
      setProps("position", DATE, { align: "CENTER", x: 0, y: 12 }),
    ],
  },
  {
    id: "goal",
    view: "design",
    screen: FACE,
    focus: GOAL,
    selectors: DESIGN("label"),
    tasks: [
      placed("place", GOAL),
      setProps("text", GOAL, { text: "68 % of goal", textColor: "#a5d6a7" }),
      setProps("position", GOAL, { align: "CENTER", x: 0, y: 44 }),
    ],
  },
  {
    id: "battery",
    view: "design",
    screen: FACE,
    focus: BATTERY,
    selectors: DESIGN("bar"),
    tasks: [
      placed("place", BATTERY),
      setProps("size", BATTERY, { width: 60, height: 8, align: "CENTER", x: 0, y: -88 }),
      setProps("value", BATTERY, { value: 80, indicatorColor: "#66bb6a" }),
    ],
  },
  {
    id: "link",
    view: "design",
    screen: FACE,
    focus: OUTER,
    selectors: EVENTS,
    tasks: [showsValue("event", OUTER, GOAL, "%d %% of goal")],
  },
  {
    id: "sweep",
    view: "design",
    screen: FACE,
    focus: INNER,
    selectors: ['[data-panel="attributes"]'],
    tasks: [setProps("animate", INNER, { animate: 8000 })],
  },
  {
    id: "workout",
    view: "design",
    selectors: ['[data-command="add-screen"]', '[data-panel="attributes"]'],
    tasks: [
      {
        id: "add",
        check: (project) => project.screens.length > WORKOUT,
        apply: (project) => {
          ensureScreen(project, WORKOUT);
        },
      },
      screenName("name", WORKOUT, "Workout"),
      screenProps("background", WORKOUT, { bgColor: BLACK }),
    ],
  },
  {
    id: "heart",
    view: "design",
    screen: WORKOUT,
    focus: HEART,
    selectors: DESIGN("arc"),
    tasks: [
      placed("place", HEART),
      setProps("size", HEART, { width: 320, height: 320, align: "CENTER", x: 0, y: 0 }),
      setProps("range", HEART, { min: 60, max: 200, value: 120 }),
      setProps("color", HEART, { indicatorColor: "#ef5350" }),
    ],
  },
  {
    id: "bpm",
    view: "design",
    screen: WORKOUT,
    focus: BPM,
    selectors: DESIGN("label"),
    tasks: [
      placed("place", BPM),
      setProps("number", BPM, { text: "120", font: 48, textColor: WHITE }),
      setProps("position", BPM, { align: "CENTER", x: 0, y: -20 }),
      placed("unit", UNIT),
      setProps("unitProps", UNIT, { text: "BPM", align: "CENTER", x: 0, y: 28, textColor: "#ef9a9a" }),
      showsValue("event", HEART, BPM, "%d"),
    ],
  },
  {
    id: "back",
    view: "design",
    screen: WORKOUT,
    focus: BACK,
    selectors: DESIGN("button"),
    tasks: [
      placed("place", BACK),
      setProps("props", BACK, { text: "Back", width: 110, height: 44, align: "CENTER", x: 0, y: 90 }),
      loadsScreen("event", BACK, FACE),
    ],
  },
  {
    id: "go",
    view: "design",
    screen: FACE,
    focus: GO,
    selectors: DESIGN("button"),
    tasks: [
      placed("place", GO),
      setProps("props", GO, { text: "Workout", width: 110, height: 40, align: "CENTER", x: 0, y: 88 }),
      loadsScreen("event", GO, WORKOUT),
    ],
  },
  {
    id: "run",
    view: "design",
    screen: FACE,
    selectors: ['[data-command="run"]'],
    tasks: [{ id: "start", check: (_project, { ran }) => ran, run: true }],
  },
  {
    id: "code",
    view: "split",
    screen: FACE,
    focus: TIME,
    selectors: [".code-view"],
    tasks: [{
      id: "edit",
      check: (project) => {
        const text = findRole(project, TIME)?.props.text;
        return !!text && text !== "10:24";
      },
      apply: (project) => {
        ensure(project, TIME).props.text = "10:30";
      },
    }],
  },
  { id: "problems", view: "design", screen: FACE, selectors: ['[data-bottom="problems"]'] },
  { id: "fonts", view: "design", screen: FACE, selectors: ['[data-command="fonts"]'] },
  { id: "conf", view: "design", screen: FACE, selectors: ['[data-command="lvconf"]'] },
  { id: "firmware", view: "design", screen: FACE },
  { id: "finish", view: "design", screen: FACE },
];

export function tutorialProject() {
  const project = newProject(TUTORIAL_PROJECT);
  project.device = { w: 320, h: 240 };
  return project;
}

const NOT_YET = { ran: false };

export const tasksOf = (step) => step.tasks ?? [];

/** The tasks of a step with whether each is done. */
export function taskStates(project, step, context = NOT_YET) {
  return tasksOf(step).map((task) => ({ id: task.id, done: !!task.check(project, context) }));
}

export const stepDone = (project, step, context = NOT_YET) => tasksOf(step).every((task) => task.check(project, context));

/** Does what is left of a step in the project. Starting the program is for the app to do. */
export function finishStep(project, step, context = NOT_YET) {
  for (const task of tasksOf(step)) {
    if (task.apply && !task.check(project, context)) task.apply(project);
  }
}

/** What a step should have selected when it opens: its widget once there, else its screen. */
export function stepSelection(project, step) {
  const node = step.focus ? findRole(project, step.focus) : null;
  if (node) return node.id;
  return (project.screens[step.screen] ?? project.screens[0]).id;
}
