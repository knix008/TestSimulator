// npm test: the document model, the code generator, the WebAssembly engines, and a pixel
// comparison between each engine and the generated C compiled natively.
//   --no-native    skips the gcc builds (they need the sources in third_party/)
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FILE_EXTENSION, FORMAT_VERSION, addNode, addScreen, cloneNode, createNode, findNode, isInside, joinPath, moveNode, newProject, parseProject, removeNode, sanitizeName, serializeProject, setProp, uniqueName, validProjectName } from "../src/lvgl/project.js";
import { BUNDLED_ENGINES, apiFor, engineFor, isSupported, sortReleases } from "../src/lvgl/versions.js";
import { ALIGNS, FONT_SIZES, PALETTE, PROP_IDS, STR_IDS, TYPE_IDS, WIDGETS } from "../src/lvgl/schema.js";
import { cNames, emit } from "../src/lvgl/emit.js";
import { GENERATED_DIRS, cString, generateCode, projectFiles } from "../src/lvgl/codegen.js";
import { Engine } from "../src/lvgl/engine.js";
import { STRING_TABLES, translator } from "../src/i18n.js";
import lvConfText from "../src/lvgl/lvConfText.js";
import { createReporter, displayWidth, fit, formatTime } from "./reporter.mjs";
import { everythingProject, registerFeatureTests } from "./features.mjs";
import { sampleProject } from "./sample.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skipNative = process.argv.includes("--no-native");
const { category, note, test, summary } = createReporter({
  title: "My LVGL Studio tests",
  reportFile: path.join(root, "test-results", "report.json"),
});

const loadEngine = async (version) => {
  const url = pathToFileURL(path.join(root, "public", "engine", `lvgl-${version}.js`)).href;
  const { default: create } = await import(url);
  return new Engine(await create(), version);
};

const allCode = (project) => Object.values(generateCode(project)).join("\n");

category("Test report");
await test("Wide characters count as two columns", () => {
  assert.equal(displayWidth("abc"), 3);
  assert.equal(displayWidth("한글"), 4);
});
await test("Names keep their column, long or short", () => {
  assert.equal(displayWidth(fit("short", 12)), 12);
  assert.equal(displayWidth(fit("a very long test name indeed", 12)), 12);
  assert.equal(displayWidth(fit("한글한글한글한글", 7)), 7);
});
await test("Times are readable at every size", () => {
  assert.equal(formatTime(12.4), "12 ms");
  assert.equal(formatTime(1500), "1.50 s");
  assert.equal(formatTime(61500), "1 m 1.5 s");
});

/* ------------------------------------------------------------------ model */
category("Document model");
await test("A new project has one empty screen and the default version", () => {
  const project = newProject();
  assert.equal(project.screens.length, 1);
  assert.equal(project.screens[0].children.length, 0);
  assert.equal(project.lvgl, "9.6.0");
});
await test("Save and load return the same project", () => {
  const { project } = sampleProject("9.6.0");
  assert.deepEqual(parseProject(serializeProject(project)), project);
});
await test("The file format is mylvgl, and its text says so", () => {
  assert.equal(FILE_EXTENSION, "mylvgl");
  const data = JSON.parse(serializeProject(newProject()));
  assert.equal(data.format, "mylvgl");
  assert.equal(data.formatVersion, FORMAT_VERSION);
});
await test("Loading something else is refused", () => {
  assert.throws(() => parseProject("not json"), /not JSON/);
  assert.throws(() => parseProject('{"a":1}'), /not a My LVGL Studio/);
});
await test("A file from a newer format is refused with a clear message", () => {
  const data = newProject();
  data.formatVersion = FORMAT_VERSION + 1;
  assert.throws(() => parseProject(JSON.stringify(data)), /newer My LVGL Studio/);
});
await test("Damaged project files are refused", () => {
  const damaged = (change) => {
    const data = sampleProject("9.6.0").project;
    change(data);
    return JSON.stringify(data);
  };
  assert.throws(() => parseProject(damaged((d) => { d.screens = []; })), /no screens/);
  assert.throws(() => parseProject(damaged((d) => { d.lvgl = "7.0.0"; })), /unsupported LVGL/);
  assert.throws(() => parseProject(damaged((d) => { d.device.w = 0; })), /device size/);
  assert.throws(() => parseProject(damaged((d) => { d.theme.primary = "red"; })), /bad theme/);
  assert.throws(() => parseProject(damaged((d) => { d.screens[0].children[0].type = "rocket"; })), /unknown widget/);
  assert.throws(() => parseProject(damaged((d) => { d.screens[0].children[1].id = d.screens[0].children[0].id; })), /duplicate id/);
  assert.throws(() => parseProject(damaged((d) => { d.screens[0].children[0].children = [d.screens[1]]; })), /children|screen inside/);
});
await test("A low nextId cannot make new ids collide", () => {
  const data = sampleProject("9.6.0").project;
  data.nextId = 1;
  const loaded = parseProject(JSON.stringify(data));
  const node = createNode(loaded, "label");
  assert.equal(findNode(loaded, node.id), null);
});
await test("A file with a byte order mark still loads", () => {
  assert.ok(parseProject(`\uFEFF${serializeProject(newProject())}`));
});
await test("Project names must work as folder names", () => {
  for (const good of ["MyApp", "내 프로젝트", "a.b-c_d"]) assert.ok(validProjectName(good), good);
  for (const bad of ["", "a/b", "a\\b", "a:b", "con", "x.", " x", "a?"]) assert.ok(!validProjectName(bad), bad);
});
await test("The project folder is joined with the location's separator", () => {
  assert.equal(joinPath("C:\\work", "App"), "C:\\work\\App");
  assert.equal(joinPath("C:\\work\\", "App"), "C:\\work\\App");
  assert.equal(joinPath("/home/me", "App"), "/home/me/App");
});
await test("Widgets get unique names", () => {
  const project = newProject();
  const a = addNode(project, project.screens[0].id, createNode(project, "button"));
  const b = addNode(project, project.screens[0].id, createNode(project, "button"));
  assert.equal(a.name, "button1");
  assert.equal(b.name, "button2");
  assert.equal(uniqueName(project, "button"), "button3");
});
await test("Only containers can hold children", () => {
  const project = newProject();
  const label = addNode(project, project.screens[0].id, createNode(project, "label"));
  assert.throws(() => addNode(project, label.id, createNode(project, "button")));
});
await test("Removing a widget removes the events aimed at it", () => {
  const { project, title, hideTitle } = sampleProject("9.6.0");
  removeNode(project, title.id);
  assert.equal(findNode(project, hideTitle.id).events.length, 0);
});
await test("The last screen cannot be removed", () => {
  const project = newProject();
  assert.equal(removeNode(project, project.screens[0].id), false);
  assert.equal(project.screens.length, 1);
});
await test("A node cannot move into itself or its children", () => {
  const project = newProject();
  const outer = addNode(project, project.screens[0].id, createNode(project, "container"));
  const inner = addNode(project, outer.id, createNode(project, "container"));
  assert.equal(moveNode(project, outer.id, inner.id), false);
  assert.ok(isInside(project, inner.id, outer.id));
});
await test("Moving changes the parent", () => {
  const project = newProject();
  const box = addNode(project, project.screens[0].id, createNode(project, "container"));
  const label = addNode(project, project.screens[0].id, createNode(project, "label"));
  assert.equal(moveNode(project, label.id, box.id), true);
  assert.equal(box.children[0].id, label.id);
  assert.equal(project.screens[0].children.length, 1);
});
await test("Copies get new ids and names, children included", () => {
  const project = newProject();
  const box = addNode(project, project.screens[0].id, createNode(project, "container"));
  addNode(project, box.id, createNode(project, "label"));
  const copy = cloneNode(project, box);
  assert.notEqual(copy.id, box.id);
  assert.notEqual(copy.children[0].id, box.children[0].id);
  assert.notEqual(copy.name, box.name);
});
await test("Clearing a property removes it", () => {
  const node = { props: { x: 1 } };
  setProp(node, "x", undefined);
  assert.ok(!("x" in node.props));
});
await test("Names become valid C identifiers", () => {
  assert.equal(sanitizeName("my button"), "my_button");
  assert.equal(sanitizeName("1st"), "_1st");
});

/* --------------------------------------------------------------- versions */
category("LVGL versions");
await test("Releases are filtered and sorted, newest first", () => {
  assert.deepEqual(sortReleases(["v8.2.0", "v9.2.2", "v9.10.0", "v8.3.11", "v7.11.0", "v9.0.0-dev", "v9.2.2"]), ["9.10.0", "9.2.2", "8.3.11"]);
});
await test("v8.3 and v9 are supported; others are not", () => {
  assert.ok(isSupported("8.3.0"));
  assert.ok(isSupported("9.6.0"));
  assert.ok(!isSupported("8.2.0"));
  assert.ok(!isSupported("7.11.0"));
});
await test("A bundled version uses its own engine", () => {
  assert.deepEqual(engineFor("9.2.2"), { engine: "9.2.2", exact: true });
});
await test("Another version uses the nearest engine of its major version", () => {
  assert.deepEqual(engineFor("9.5.0"), { engine: "9.6.0", exact: false });
  assert.deepEqual(engineFor("8.3.11"), { engine: "8.4.0", exact: false });
});
await test("The API names follow the major version", () => {
  assert.equal(apiFor("8.4.0").button, "lv_btn_create");
  assert.equal(apiFor("9.2.2").button, "lv_button_create");
});

/* ----------------------------------------------------------------- schema */
category("Widget table");
await test("Every widget has an engine type id", () => {
  for (const type of Object.keys(WIDGETS)) assert.ok(type in TYPE_IDS, type);
});
await test("Every palette entry is a widget", () => {
  for (const { items } of PALETTE) for (const type of items) assert.ok(WIDGETS[type], type);
});
await test("Every property can reach the engine", () => {
  const extra = new Set(["min", "max", "src", "target", "year", "month", "day", "digits", "separator"]);
  for (const [type, definition] of Object.entries(WIDGETS)) {
    for (const prop of definition.props) {
      if (extra.has(prop.key) || prop.key in STR_IDS || prop.kind === "size") continue;
      assert.ok(prop.key in PROP_IDS, `${type}.${prop.key}`);
    }
  }
});
await test("Every string exists in both languages", () => {
  const ko = Object.keys(STRING_TABLES.ko).sort();
  const en = Object.keys(STRING_TABLES.en).sort();
  assert.deepEqual(ko, en);
});
await test("Every widget and property has a label", () => {
  const t = translator("ko");
  for (const [type, definition] of Object.entries(WIDGETS)) {
    assert.notEqual(t(`widget.${type}`), `widget.${type}`);
    for (const prop of definition.props) assert.notEqual(t(`prop.${prop.key}`), `prop.${prop.key}`, prop.key);
  }
});

/* ---------------------------------------------------------------- codegen */
category("Code generator");
await test("v9 projects use the v9 API", () => {
  const c = allCode(sampleProject("9.6.0").project);
  assert.match(c, /lv_button_create\(/);
  assert.match(c, /lv_screen_load\(/);
  assert.doesNotMatch(c, /lv_btn_create|lv_scr_load/);
});
await test("v8 projects use the v8 API", () => {
  const c = allCode(sampleProject("8.4.0").project);
  assert.match(c, /lv_btn_create\(/);
  assert.match(c, /lv_scr_load\(/);
  assert.doesNotMatch(c, /lv_button_create|lv_screen_load/);
});
await test("A project folder has the project file and structured code", () => {
  const { project, second } = sampleProject("9.6.0");
  assert.deepEqual(Object.keys(projectFiles(project, "App")).sort(), [
    "App.mylvgl", "CMakeLists.txt", "config/lv_conf.h", "src/main.c", "src/ui/screens/ui_Screen1.c", `src/ui/screens/ui_${second.name}.c`,
    "src/ui/ui.c", "src/ui/ui.h", "src/ui/ui_events.c", "src/ui/ui_events.h",
  ].sort());
});
await test("The project file in the folder reloads as the same project", () => {
  const { project } = sampleProject("9.6.0");
  assert.deepEqual(parseProject(projectFiles(project, "App")["App.mylvgl"]), project);
});
await test("CMake builds every generated C file, and no others", () => {
  const { project } = sampleProject("9.6.0");
  const files = generateCode(project);
  for (const file of Object.keys(files).filter((name) => name.endsWith(".c"))) assert.ok(files["CMakeLists.txt"].includes(`  ${file}\n`), file);
});
await test("A removed screen's file is not generated", () => {
  const { project, second } = sampleProject("9.6.0");
  removeNode(project, second.id);
  assert.ok(!Object.keys(generateCode(project)).some((file) => file.includes(second.name)));
});
await test("Only the generated code folders are cleaned on save", () => {
  assert.deepEqual(GENERATED_DIRS, ["src/ui/screens", "src/ui/images"]);
});
await test("Screens differing only by case get different files", () => {
  const project = newProject();
  const other = addScreen(project);
  other.name = project.screens[0].name.toLowerCase();
  assert.equal(new Set(Object.keys(generateCode(project)).map((file) => file.toLowerCase())).size, Object.keys(generateCode(project)).length);
});
await test("Strings are escaped for C", () => {
  assert.equal(cString('a"b\\c\nd'), '"a\\"b\\\\c\\nd"');
  assert.equal(cString("한글"), '"한글"');
});
await test("Every object is declared in the header", () => {
  const { project } = sampleProject("9.6.0");
  const h = generateCode(project)["src/ui/ui.h"];
  for (const name of cNames(project).values()) assert.ok(h.includes(`extern lv_obj_t * ${name};`), name);
});
await test("Clashing names stay distinct in C", () => {
  const project = newProject();
  const a = addNode(project, project.screens[0].id, createNode(project, "label"));
  const b = addNode(project, project.screens[0].id, createNode(project, "label"));
  b.name = a.name;
  const names = cNames(project);
  assert.notEqual(names.get(a.id), names.get(b.id));
});
await test("The event functions call what the design says", () => {
  const c = allCode(sampleProject("9.6.0").project);
  assert.match(c, /printf\("%s\\n", "going to second"\)/);
  assert.match(c, /lv_obj_add_event_cb\(ui_button1, ui_event_0, LV_EVENT_CLICKED, NULL\)/);
});
await test("An event aimed at a removed object is left out", () => {
  const project = newProject();
  const button = addNode(project, project.screens[0].id, createNode(project, "button"));
  button.events.push({ trigger: "CLICKED", action: "toggle", target: "n999" });
  assert.equal(emit(project).ops.filter((op) => op.op === "event").length, 0);
});
await test("The range is set before the value", () => {
  const { ops } = emit(sampleProject("9.6.0").project);
  const range = ops.findIndex((op) => op.op === "range");
  const value = ops.findIndex((op) => op.op === "int" && op.prop === "value");
  assert.ok(range >= 0 && range < value);
});
await test("Generated lv_conf.h is the engine's lv_conf.h", () => {
  const engineConf = fs.readFileSync(path.join(root, "engine", "lv_conf.h"), "utf8").replace(/\r\n/g, "\n");
  assert.equal(lvConfText, engineConf);
});
await test("Every align and font is known to the C side", () => {
  const runtime = fs.readFileSync(path.join(root, "engine", "runtime.c"), "utf8");
  for (const align of ALIGNS) assert.ok(runtime.includes(`LV_ALIGN_${align}`), align);
  for (const size of FONT_SIZES) {
    assert.ok(runtime.includes(`lv_font_montserrat_${size}`), String(size));
    assert.ok(lvConfText.includes(`LV_FONT_MONTSERRAT_${size} 1`), String(size));
  }
});

/* ---------------------------------------------------------------- engines */
const engines = new Map();
for (const version of BUNDLED_ENGINES) {
  category(`Engine ${version}`);
  await test("It loads and reports its LVGL version", async () => {
    const engine = await loadEngine(version);
    engines.set(version, engine);
    assert.equal(engine.runtimeVersion(), version);
  });
  const engine = engines.get(version);
  if (!engine) continue;
  const sample = sampleProject(version);
  await test("It accepts every operation of the sample project", () => {
    engine.load(sample.project, sample.home.id, { events: true });
    assert.deepEqual(engine.errors, []);
  });
  await test("It draws in the project's colours", () => {
    const { x, y, w, h } = engine.coords(sample.next.id);
    const frame = engine.frame();
    const at = ((y + Math.floor(h / 2)) * engine.width + x + 8) * 4;
    assert.deepEqual([frame[at + 2], frame[at + 1], frame[at]], [0xcc, 0x33, 0x55]);
    assert.ok(w === 130 && h === 50);
  });
  await test("Objects are where the document puts them", () => {
    const box = engine.coords(sample.title.id);
    assert.equal(box.x, 12);
    assert.equal(box.y, 8);
  });
  const click = (box) => {
    const x = box.x + box.w / 2;
    const y = box.y + box.h / 2;
    engine.pointer(x, y, false);
    for (let i = 0; i < 4; i++) engine.tick(20);
    engine.pointer(x, y, true);
    for (let i = 0; i < 6; i++) engine.tick(20);
    engine.pointer(x, y, false);
    for (let i = 0; i < 6; i++) engine.tick(20);
  };
  const screenColor = () => {
    const frame = engine.frame();
    const at = (2 * engine.width + 2) * 4;
    return [frame[at + 2], frame[at + 1], frame[at]];
  };
  await test("A click runs the log and screen actions", () => {
    click(engine.coords(sample.next.id));
    for (let i = 0; i < 10; i++) engine.tick(20);
    assert.deepEqual(engine.drainLog(), ["going to second"]);
    assert.deepEqual(screenColor(), [0x20, 0x30, 0x40]);
  });
  await test("A click on the second screen goes back", () => {
    click(engine.coords(sample.back.id));
    for (let i = 0; i < 10; i++) engine.tick(20);
    assert.notDeepEqual(screenColor(), [0x20, 0x30, 0x40]);
  });
  await test("Design mode ignores events", () => {
    engine.load(sample.project, sample.home.id, { events: false });
    click(engine.coords(sample.next.id));
    assert.deepEqual(engine.drainLog(), []);
    assert.notDeepEqual(screenColor(), [0x20, 0x30, 0x40]);
  });
  await test("A new device size gives a new frame", () => {
    const project = structuredClone(sample.project);
    project.device = { w: 320, h: 240 };
    engine.load(project, project.screens[0].id);
    assert.equal(engine.frame().length, 320 * 240 * 4);
  });
  await test("Hundreds of rebuilds keep working", () => {
    for (let i = 0; i < 300; i++) engine.load(sample.project, sample.home.id, { events: true });
    assert.deepEqual(engine.errors, []);
    assert.equal(engine.coords(sample.title.id).x, 12);
  });
}

await registerFeatureTests({ category, test, engines, versions: BUNDLED_ENGINES });

/* ----------------------------------------------------------------- parity */
const toolPath = process.platform === "win32" && fs.existsSync("C:/Msys64/ucrt64/bin") ? `C:\\Msys64\\ucrt64\\bin;${process.env.PATH}` : process.env.PATH;
const env = { ...process.env, PATH: toolPath, Path: toolPath };

function nativeFrame(version, project) {
  const dir = path.join(root, "build", "parity", version);
  const source = path.join(dir, "project");
  const build = path.join(dir, "build");
  for (const [name, text] of Object.entries(generateCode(project))) {
    const file = path.join(source, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== text) fs.writeFileSync(file, text);
  }
  const lvgl = path.join(root, "third_party", `lvgl-${version}`).replaceAll("\\", "/");
  execFileSync("cmake", ["-S", source, "-B", build, "-G", "Ninja", "-DCMAKE_BUILD_TYPE=Release", "-DCMAKE_C_COMPILER=gcc", "-DML_HEADLESS=ON", `-DLVGL_DIR=${lvgl}`], { env, stdio: "pipe" });
  execFileSync("cmake", ["--build", build], { env, stdio: "pipe", maxBuffer: 1 << 28 });
  const output = path.join(dir, "frame.bin");
  execFileSync(path.join(build, process.platform === "win32" ? "app.exe" : "app"), [output], { env, stdio: "pipe" });
  return fs.readFileSync(output);
}

for (const version of BUNDLED_ENGINES) {
  category(`Generated C = engine, LVGL ${version}`);
  if (skipNative) {
    note("skipped: --no-native");
    continue;
  }
  const hasSources = fs.existsSync(path.join(root, "third_party", `lvgl-${version}`, "lvgl.h"));
  await test("The sources for the native build are present", () => assert.ok(hasSources, "run npm run fetch:lvgl"));
  const engine = engines.get(version);
  if (!hasSources || !engine) continue;
  const { project, home } = sampleProject(version);
  let native = null;
  await test("The generated code compiles and runs with gcc", () => {
    try {
      native = nativeFrame(version, project);
    } catch (error) {
      const output = String(error.stderr ?? "") + String(error.stdout ?? "");
      throw new Error(output.split("\n").filter((line) => /error|Error/.test(line)).slice(0, 12).join("\n") || error.message);
    }
  });
  if (!native) continue;
  const comparePixels = (nativePixels, startId, source) => {
    engine.load(source, startId);
    const frame = engine.frame();
    assert.equal(nativePixels.length, frame.length);
    let different = 0;
    let first = null;
    for (let i = 0; i < frame.length; i += 4) {
      if (nativePixels[i] !== frame[i] || nativePixels[i + 1] !== frame[i + 1] || nativePixels[i + 2] !== frame[i + 2]) {
        different++;
        first ??= { x: (i / 4) % engine.width, y: Math.floor(i / 4 / engine.width), native: [nativePixels[i + 2], nativePixels[i + 1], nativePixels[i]], engine: [frame[i + 2], frame[i + 1], frame[i]] };
      }
    }
    assert.equal(different, 0, `${different} pixels differ, first: ${JSON.stringify(first)}`);
  };
  await test("Every pixel of the sample matches the design surface", () => comparePixels(native, home.id, project));
  // Each screen of the everything-project goes first in turn, because ui_init loads the first.
  const everything = everythingProject(version);
  const names = ["all widgets and properties", "flex and size forms", "every align", "image and data widgets", "every font"];
  for (let index = 0; index < everything.screens.length; index++) {
    await test(`Generated C matches the surface: ${names[index]}`, () => {
      const variant = structuredClone(everything);
      const [screen] = variant.screens.splice(index, 1);
      variant.screens.unshift(screen);
      comparePixels(nativeFrame(version, variant), screen.id, variant);
    });
  }
}

process.exitCode = summary();
