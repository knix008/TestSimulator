// A project using every static widget, with events between two screens. The spinner is left
// out of pixel comparisons because it animates.
import { addNode, createNode, addScreen, newProject } from "../src/lvgl/project.js";

export function sampleProject(version) {
  const project = newProject("Sample");
  project.lvgl = version;
  project.device = { w: 480, h: 320 };
  const home = project.screens[0];
  const add = (parent, type, props) => addNode(project, parent.id, createNode(project, type, props));

  const title = add(home, "label", { x: 12, y: 8, text: "Dashboard", font: 20, textColor: "#123456" });
  const panel = add(home, "container", { x: 12, y: 40, width: 220, height: 130, bgColor: "#eef5ff", radius: 12, borderWidth: 2, borderColor: "#2266cc" });
  add(panel, "checkbox", { x: 0, y: 0, text: "Enabled", checked: true });
  add(panel, "switch", { x: 110, y: 0, checked: true });
  add(panel, "slider", { x: 4, y: 44, width: 170, min: 0, max: 200, value: 120 });
  add(panel, "bar", { x: 0, y: 70, width: 180, value: 75, indicatorColor: "#22aa55" });
  add(home, "arc", { x: 250, y: 20, width: 100, height: 100, value: 70 });
  add(home, "dropdown", { x: 360, y: 20, width: 110, options: "One\nTwo\nThree", selected: 1 });
  add(home, "roller", { x: 250, y: 130, options: "A\nB\nC\nD", selected: 2 });
  add(home, "textarea", { x: 12, y: 180, width: 220, height: 56, placeholder: "Type here" });
  add(home, "led", { x: 360, y: 80, ledBright: 200 });
  const next = add(home, "button", { x: 12, y: 250, width: 130, height: 50, text: "Next", bgColor: "#cc3355", font: 16 });
  const hideTitle = add(home, "button", { x: 160, y: 250, width: 130, height: 50, text: "Toggle" });

  const second = addScreen(project);
  second.props.bgColor = "#203040";
  const message = add(second, "label", { align: "CENTER", y: -40, text: "Second", textColor: "#ffffff", font: 28 });
  const back = add(second, "button", { align: "BOTTOM_MID", y: -16, width: 140, height: 50, text: "Back" });

  next.events.push(
    { trigger: "CLICKED", action: "log", text: "going to second" },
    { trigger: "CLICKED", action: "screen", target: second.id },
  );
  hideTitle.events.push({ trigger: "CLICKED", action: "toggle", target: title.id });
  back.events.push(
    { trigger: "CLICKED", action: "setText", target: message.id, text: "Changed" },
    { trigger: "CLICKED", action: "screen", target: home.id },
  );
  return { project, home, second, title, next, hideTitle, back, message };
}
