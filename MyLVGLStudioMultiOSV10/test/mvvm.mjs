// Tests of MVVM: ViewModels and bindings in the document, the generated C, the problems, and
// bindings in each design engine. The native builds (C = engine, logic in src/app) are in run.mjs.
import assert from "node:assert/strict";
import fs from "node:fs";
import { addNode, addScreen, createNode, findNode, newProject, parseProject, serializeProject } from "../src/lvgl/project.js";
import { bindableKeys, defaultMode } from "../src/lvgl/schema.js";
import { emit } from "../src/lvgl/emit.js";
import { generateCode, starterFiles } from "../src/lvgl/codegen.js";
import { applyCodeEdit, isEditableCode } from "../src/lvgl/codeparse.js";
import { findProblems } from "../src/lvgl/problems.js";
import { MVVM_FILES } from "../src/lvgl/mvvmSource.js";
import { mvvmModule } from "../scripts/generate-mvvm-source.mjs";
import { codeOnly, missingGlueNames } from "../src/lvgl/appcheck.js";
import { translator } from "../src/i18n.js";
import {
  addViewModel, addVmProp, bindNew, bindingOf, contextOf, editVmProp, fitValue, removeViewModel, removeVmProp,
  renameViewModel, renameVmProp, resolveBinding, setBinding, validVmName,
} from "../src/lvgl/viewmodel.js";

/** A project with ViewModel Main { speed 0..3000, running, status } and widgets bound to it. */
export function boundProject(version = "9.6.0") {
  const project = newProject("Bound");
  project.lvgl = version;
  const screen = project.screens[0];
  addViewModel(project, "Main");
  addVmProp(project, "Main", "int", "speed");
  editVmProp(project, "Main", "speed", { min: 0, max: 3000, value: 1500 });
  addVmProp(project, "Main", "bool", "running");
  addVmProp(project, "Main", "string", "status");
  editVmProp(project, "Main", "status", { value: "Ready" });
  const slider = addNode(project, screen.id, createNode(project, "slider", { x: 20, y: 40, width: 200, height: 12, min: 0, max: 100, value: 10 }));
  setBinding(project, slider.id, "value", { path: "speed", converter: "range" });
  const label = addNode(project, screen.id, createNode(project, "label", { x: 20, y: 80, text: "x" }));
  setBinding(project, label.id, "text", { path: "speed", format: "%d rpm" });
  const toggle = addNode(project, screen.id, createNode(project, "switch", { x: 20, y: 120, width: 50, height: 26 }));
  setBinding(project, toggle.id, "checked", { path: "running" });
  const lamp = addNode(project, screen.id, createNode(project, "led", { x: 100, y: 120, width: 20, height: 20 }));
  setBinding(project, lamp.id, "hidden", { path: "running", converter: "invert" });
  const status = addNode(project, screen.id, createNode(project, "label", { x: 20, y: 160, text: "y" }));
  setBinding(project, status.id, "text", { path: "status" });
  return { project, screen, slider, label, toggle, lamp, status };
}

export function registerMvvmTests({ category, test, engines }) {
  return (async () => {
    category("ViewModels (MVVM)");
    await test("New ViewModels and properties get names of their own", () => {
      const project = newProject();
      assert.equal(addViewModel(project).name, "Main");
      assert.equal(addViewModel(project).name, "Main2");
      assert.equal(addVmProp(project, "Main", "int").name, "value");
      assert.equal(addVmProp(project, "Main", "bool").name, "value2");
      assert.deepEqual(project.viewModels[0].props.map((prop) => [prop.type, prop.value]), [["int", 0], ["bool", false]]);
      assert.equal(addVmProp(project, "Nope", "int"), null);
      assert.equal(addVmProp(project, "Main", "float"), null);
    });
    await test("Names must be C names, and not C keywords", () => {
      for (const name of ["speed", "_x", "Motor2", "a_b"]) assert.ok(validVmName(name), name);
      for (const name of ["", "2x", "a-b", "int", "while", "true", "a b", "한글"]) assert.ok(!validVmName(name), name);
    });
    await test("Renaming a ViewModel keeps its bindings and data contexts", () => {
      const { project, slider } = boundProject();
      project.screens[0].dataContext = "Main";
      setBinding(project, slider.id, "hidden", { vm: "Main", path: "running" });
      assert.ok(renameViewModel(project, "Main", "Motor"));
      assert.equal(project.screens[0].dataContext, "Motor");
      assert.equal(bindingOf(slider, "hidden").vm, "Motor");
      assert.equal(resolveBinding(project, slider, bindingOf(slider, "value")).vm.name, "Motor");
      assert.ok(!renameViewModel(project, "Motor", "int"), "a keyword");
    });
    await test("Renaming a property moves the bindings that use it", () => {
      const { project, slider, label, status } = boundProject();
      assert.ok(renameVmProp(project, "Main", "speed", "rpm"));
      assert.equal(bindingOf(slider, "value").path, "rpm");
      assert.equal(bindingOf(label, "text").path, "rpm");
      assert.equal(bindingOf(status, "text").path, "status");
      assert.ok(!renameVmProp(project, "Main", "rpm", "STATUS"), "names differ even ignoring case");
    });
    await test("Removing a property or a ViewModel removes its bindings, and leaves nothing empty", () => {
      const { project, slider, label, status } = boundProject();
      assert.ok(removeVmProp(project, "Main", "speed"));
      assert.equal(slider.bindings, undefined);
      assert.equal(label.bindings, undefined);
      assert.equal(bindingOf(status, "text").path, "status");
      assert.ok(removeViewModel(project, "Main"));
      assert.equal(status.bindings, undefined);
      assert.equal(project.viewModels, undefined);
    });
    await test("Values fit their property: type and range", () => {
      const prop = { type: "int", min: 0, max: 10 };
      assert.equal(fitValue(prop, 99), 10);
      assert.equal(fitValue(prop, "4.7"), 4);
      assert.equal(fitValue({ type: "int" }, -5), -5);
      assert.equal(fitValue({ type: "bool" }, "true"), true);
      assert.equal(fitValue({ type: "string" }, 5), "5");
      const { project } = boundProject();
      editVmProp(project, "Main", "status", { type: "int" });
      const status = project.viewModels[0].props.find((item) => item.name === "status");
      assert.deepEqual([status.type, status.value, status.min, status.max], ["int", 0, 0, 100]);
      editVmProp(project, "Main", "status", { type: "bool" });
      assert.deepEqual([status.type, status.value, status.min], ["bool", false, undefined]);
    });
    await test("A screen's data context is the ViewModel its bindings use when they name none", () => {
      const { project, label } = boundProject();
      addViewModel(project, "Other");
      addVmProp(project, "Other", "int", "speed");
      assert.equal(contextOf(project, project.screens[0]), "Main");
      project.screens[0].dataContext = "Other";
      assert.equal(resolveBinding(project, label, bindingOf(label, "text")).vm.name, "Other");
      setBinding(project, label.id, "text", { vm: "Main", path: "speed" });
      assert.equal(resolveBinding(project, label, bindingOf(label, "text")).vm.name, "Main", "a named ViewModel wins");
      project.screens[0].dataContext = "Gone";
      assert.equal(contextOf(project, project.screens[0]), "Main");
    });
    await test("Only properties a widget can show can be bound; inputs bind both ways by default", () => {
      assert.deepEqual(bindableKeys("slider"), ["value", "hidden", "disabled"]);
      assert.deepEqual(bindableKeys("checkbox"), ["checked", "text", "hidden", "disabled"]);
      assert.deepEqual(bindableKeys("dropdown"), ["selected", "hidden", "disabled"]);
      assert.deepEqual(bindableKeys("screen"), []);
      assert.equal(defaultMode("slider", "value"), "twoWay");
      assert.equal(defaultMode("textarea", "text"), "twoWay");
      assert.equal(defaultMode("bar", "value"), "oneWay");
      assert.equal(defaultMode("label", "text"), "oneWay");
      const project = newProject();
      const label = addNode(project, project.screens[0].id, createNode(project, "label"));
      addViewModel(project);
      assert.ok(!setBinding(project, label.id, "value", { path: "x" }));
      assert.ok(setBinding(project, label.id, "text", { path: "x", mode: "default", converter: "none", format: "" }));
      assert.deepEqual(label.bindings, [{ prop: "text", path: "x" }], "defaults are not stored");
      assert.ok(setBinding(project, label.id, "text", null));
      assert.equal(label.bindings, undefined);
    });
    await test("Binding a property makes a ViewModel property that starts as the widget is", () => {
      const project = newProject();
      const screen = project.screens[0];
      const slider = addNode(project, screen.id, createNode(project, "slider", { min: 10, max: 50, value: 30 }));
      const label = addNode(project, screen.id, createNode(project, "label", { text: "Hello" }));
      const sw = addNode(project, screen.id, createNode(project, "switch", { checked: true }));
      assert.deepEqual(bindNew(project, slider.id, "value"), { vm: "Main", prop: "slider1_value" });
      bindNew(project, label.id, "text");
      bindNew(project, sw.id, "checked");
      assert.deepEqual(project.viewModels[0].props, [
        { name: "slider1_value", type: "int", value: 30, min: 10, max: 50 },
        { name: "label1_text", type: "string", value: "Hello" },
        { name: "switch1_checked", type: "bool", value: true },
      ]);
      assert.equal(bindNew(project, slider.id, "text"), null, "a slider has no text");
    });

    category("ViewModels: project file and code");
    await test("A project with ViewModels saves as format 2 and reads back the same", () => {
      const { project } = boundProject();
      const text = serializeProject(project);
      assert.equal(JSON.parse(text).formatVersion, 2);
      const read = parseProject(text);
      assert.deepEqual(read.viewModels, project.viewModels);
      assert.deepEqual(read.screens, project.screens);
      assert.equal(JSON.parse(serializeProject(newProject())).formatVersion, 1, "without ViewModels: format 1");
    });
    await test("Damaged ViewModels and bindings are refused", () => {
      const damaged = (change, pattern) => {
        const data = JSON.parse(serializeProject(boundProject().project));
        change(data);
        assert.throws(() => parseProject(JSON.stringify(data)), pattern);
      };
      damaged((data) => { data.viewModels = {}; }, /viewModels is not a list/);
      damaged((data) => { data.viewModels[0].name = "2bad"; }, /bad ViewModel name/);
      damaged((data) => { data.viewModels.push({ name: "MAIN", props: [] }); }, /duplicate ViewModel/);
      damaged((data) => { data.viewModels[0].props[0].type = "float"; }, /bad type/);
      damaged((data) => { data.viewModels[0].props[0].value = "x"; }, /bad value/);
      damaged((data) => { data.viewModels[0].props.push({ ...data.viewModels[0].props[0] }); }, /duplicate property/);
      damaged((data) => { data.screens[0].children[0].bindings[0].mode = "sideways"; }, /bad binding mode/);
      damaged((data) => { data.screens[0].children[0].bindings[0].converter = "magic"; }, /bad converter/);
      damaged((data) => { data.screens[0].children[0].bindings.push({ prop: "value", path: "running" }); }, /two bindings/);
      damaged((data) => { delete data.screens[0].children[0].bindings[0].path; }, /bad binding/);
    });
    await test("Properties come first in the operations, bindings after every object", () => {
      const { project, slider, label } = boundProject();
      const { ops, ids } = emit(project);
      assert.deepEqual(ops.slice(0, 3).map((op) => [op.op, op.name, op.index]), [["vmprop", "speed", 0], ["vmprop", "running", 1], ["vmprop", "status", 2]]);
      const lastCreate = ops.map((op) => op.op).lastIndexOf("create");
      const binds = ops.filter((op) => op.op === "bind");
      assert.ok(ops.indexOf(binds[0]) > lastCreate);
      assert.deepEqual(binds[0], { op: "bind", id: ids.get(slider.id), key: "value", attr: 0, index: 0, vm: "Main", path: "speed", mode: 1, conv: 2, viewMin: 0, viewMax: 100, format: null });
      assert.deepEqual([binds[1].id, binds[1].attr, binds[1].mode, binds[1].format], [ids.get(label.id), 1, 0, "%d rpm"]);
      assert.deepEqual([binds[3].attr, binds[3].conv], [3, 1], "hidden, inverted");
    });
    await test("A binding to nothing, or of a widget LVGL lacks, is left out", () => {
      const { project, slider } = boundProject("8.4.0");
      setBinding(project, slider.id, "value", { path: "gone" });
      const scale = addNode(project, project.screens[0].id, createNode(project, "scale"));
      setBinding(project, scale.id, "hidden", { path: "running" });
      const binds = emit(project).ops.filter((op) => op.op === "bind");
      assert.ok(!binds.some((op) => op.key === "value"));
      assert.equal(binds.length, 4);
    });
    await test("Each ViewModel is a C file of its own; ui_init starts them and binds the widgets", () => {
      const { project } = boundProject();
      const files = generateCode(project);
      for (const file of ["src/glue/glue.h", "src/glue/glue.c", "src/glue/vm_main.h", "src/glue/vm_main.c", "src/ui/ui_bindings.c", "lib/mvvm/mvvm.h", "lib/mvvm/mvvm.c", "lib/mvvm/mvvm_lvgl.h", "lib/mvvm/mvvm_lvgl.c"]) assert.ok(files[file], file);
      const header = files["src/glue/vm_main.h"];
      for (const line of ["int32_t vm_main_get_speed(void);", "void vm_main_set_speed(int32_t value);", "mv_prop_t * vm_main_prop_speed(void);", "bool vm_main_get_running(void);", "const char * vm_main_get_status(void);", "void vm_main_set_status(const char * value);"]) assert.ok(header.includes(line), line);
      assert.match(files["src/glue/vm_main.c"], /mv_prop_init_int\(&speed_prop, "speed", 1500, 0, 3000\);/);
      assert.match(files["src/glue/vm_main.c"], /mv_prop_init_string\(&status_prop, "status", "Ready"\);/);
      const ui = files["src/ui/ui.c"];
      assert.ok(ui.indexOf("glue_init();") < ui.indexOf("_create();"), "the ViewModels are ready before the screens");
      assert.ok(ui.indexOf("ui_bindings_init();") > ui.lastIndexOf("_create();"), "bindings once every object exists");
      assert.match(files["src/ui/ui_bindings.c"], /mv_bind\(ui_slider1, vm_main_prop_speed\(\), &\(mv_binding_desc_t\)\{ MV_ATTR_VALUE, MV_TWO_WAY, MV_CONV_RANGE, 0, 100, NULL, NULL, NULL, NULL \}\);/);
      assert.match(files["src/ui/ui_bindings.c"], /\/\* ui_slider1\.value <-> Main\.speed \*\//);
      assert.match(files["src/ui/ui_bindings.c"], /\/\* Main\.status -> ui_label2\.text \*\//);
      assert.match(files["src/main.c"], /ui_init\(\);\n\s+app_init\(\);/);
    });
    await test("The application's side never sees LVGL: glue.h and the ViewModels do not include it", () => {
      const files = generateCode(boundProject().project);
      for (const file of ["src/glue/glue.h", "src/glue/vm_main.h", "src/glue/vm_main.c", "src/glue/glue.c", "lib/mvvm/mvvm.h", "lib/mvvm/mvvm.c"]) {
        assert.doesNotMatch(files[file], /#include\s+"(lvgl|ui|mvvm_lvgl)\.h"/, file);
        assert.doesNotMatch(files[file].replace(/\/\*[\s\S]*?\*\//g, ""), /\blv_[a-z]/, file);
      }
      for (const [file, text] of Object.entries(starterFiles(boundProject().project))) assert.doesNotMatch(text, /#include "(lvgl|ui)\.h"/, file);
    });
    await test("Without ViewModels there are no binding files, and the code still has its glue", () => {
      const files = generateCode(newProject());
      assert.equal(files["src/ui/ui_bindings.c"], undefined);
      assert.ok(files["src/glue/glue.h"] && files["src/glue/glue.c"]);
      assert.ok(!Object.keys(files).some((file) => /src\/glue\/vm_/.test(file)));
    });
    await test("CMake builds the library, the glue and every C and C++ file of src/app", () => {
      const cmake = generateCode(boundProject().project)["CMakeLists.txt"];
      for (const file of ["lib/mvvm/mvvm.c", "lib/mvvm/mvvm_lvgl.c", "src/glue/glue.c", "src/glue/vm_main.c", "src/ui/ui_bindings.c"]) assert.ok(cmake.includes(`  ${file}\n`), file);
      assert.match(cmake, /file\(GLOB APP_SOURCES CONFIGURE_DEPENDS "\$\{CMAKE_CURRENT_SOURCE_DIR\}\/src\/app\/\*\.c"\)/);
      assert.match(cmake, /if\(APP_CXX_SOURCES\)\n\s+enable_language\(CXX\)/);
      assert.ok(!cmake.includes("src/app/app.c"), "the application's files are found, not listed");
    });
    await test("The starter application shows how to use the ViewModels it starts with", () => {
      const app = starterFiles(boundProject().project)["src/app/app.c"];
      assert.match(app, /vm_main_set_speed\(50\)/);
      assert.match(app, /void app_init\(void\)\n\{\n\}/);
      assert.match(starterFiles(newProject())["src/app/app.c"], /Add ViewModels in the studio/);
    });
    await test("The library in the generator is the one the engine is built from", () => {
      assert.equal(fs.readFileSync(new URL("../src/lvgl/mvvmSource.js", import.meta.url), "utf8").replace(/\r\n/g, "\n"), mvvmModule(), "run npm run mvvm-source");
      assert.deepEqual(Object.keys(MVVM_FILES), ["mvvm.h", "mvvm.c", "mvvm_lvgl.h", "mvvm_lvgl.c"]);
    });
    await test("Editing the code keeps the bindings: generated code reads back unchanged, renames keep them", () => {
      const { project, slider } = boundProject();
      const files = generateCode(project, { imageData: false });
      for (const file of Object.keys(files).filter(isEditableCode)) {
        const result = applyCodeEdit(project, file, files[file]);
        assert.deepEqual(result.errors, [], file);
        assert.equal(result.changed, false, file);
      }
      assert.ok(isEditableCode("src/ui/ui_bindings.c") && isEditableCode("src/glue/vm_main.c"), "bindings and ViewModels are edited in code too");
      for (const file of ["src/glue/vm_main.h", "src/glue/glue.c", "src/glue/glue.h", "lib/mvvm/mvvm.c"]) assert.ok(!isEditableCode(file), file);
      const file = "src/ui/screens/ui_Screen1.c";
      const renamed = applyCodeEdit(project, file, files[file].replaceAll("ui_slider1", "ui_throttle"));
      assert.deepEqual(renamed.errors, []);
      assert.deepEqual(findNode(renamed.project, slider.id).bindings, slider.bindings);
      assert.match(generateCode(renamed.project)["src/ui/ui_bindings.c"], /mv_bind\(ui_throttle, vm_main_prop_speed\(\)/);
    });

    category("ViewModels: edited as code");
    const edited = (project, file, change) => {
      const text = generateCode(project, { imageData: false })[file];
      const next = change(text);
      assert.notEqual(next, text, "the edit changed nothing");
      return applyCodeEdit(project, file, next);
    };
    await test("A binding's direction, converter and format change in ui_bindings.c", () => {
      const { project, slider, label } = boundProject();
      const result = edited(project, "src/ui/ui_bindings.c", (text) => text
        .replace("MV_ATTR_VALUE, MV_TWO_WAY, MV_CONV_RANGE", "MV_ATTR_VALUE, MV_ONE_WAY, MV_CONV_NONE")
        .replace('"%d rpm"', '"%d km/h"'));
      assert.deepEqual(result.errors, []);
      assert.deepEqual(findNode(result.project, slider.id).bindings, [{ prop: "value", path: "speed", mode: "oneWay" }]);
      assert.deepEqual(findNode(result.project, label.id).bindings, [{ prop: "text", path: "speed", format: "%d km/h" }]);
      assert.match(generateCode(result.project)["src/ui/ui_bindings.c"], /MV_ONE_WAY, MV_CONV_NONE, 0, 0, NULL/);
    });
    await test("Bindings are added and removed by adding and removing mv_bind lines", () => {
      const { project, lamp, status } = boundProject();
      const result = edited(project, "src/ui/ui_bindings.c", (text) => text
        .split("\n").filter((line) => !line.includes("mv_bind(ui_led1")).join("\n")
        .replace("void ui_bindings_init(void)\n{", 'void ui_bindings_init(void)\n{\n    mv_bind(ui_label2, vm_main_prop_running(), &(mv_binding_desc_t){ MV_ATTR_HIDDEN, MV_ONE_WAY, MV_CONV_INVERT, 0, 0, NULL, NULL, NULL, NULL });'));
      assert.deepEqual(result.errors, []);
      assert.equal(findNode(result.project, lamp.id).bindings, undefined);
      assert.deepEqual(findNode(result.project, status.id).bindings.find((item) => item.prop === "hidden"), { prop: "hidden", path: "running", converter: "invert" });
    });
    await test("A binding the design cannot have is an error with its line, and nothing changes", () => {
      const { project } = boundProject();
      const cases = [
        [(text) => text.replace("vm_main_prop_status()", "vm_main_prop_gone()"), "noVmProp"],
        [(text) => text.replace("mv_bind(ui_label2", "mv_bind(ui_nobody"), "noObject"],
        [(text) => text.replace("MV_ATTR_TEXT, MV_ONE_WAY, MV_CONV_NONE, 0, 0, NULL", "MV_ATTR_VALUE, MV_ONE_WAY, MV_CONV_NONE, 0, 0, NULL"), "bindNotHere"],
        [(text) => text.replace("MV_CONV_RANGE", "MV_CONV_RANGE | MV_CONV_INVERT"), "twoConverters"],
        [(text) => text.replace("MV_CONV_RANGE, 0, 100, NULL, NULL, NULL, NULL", "MV_CONV_RANGE, 0, 100, NULL"), "bindFields"],
        [(text) => text.replace("mv_bind(ui_slider1, vm_main_prop_speed(), &", "mv_bind(ui_slider1 vm_main_prop_speed(), &"), "unknown"],
      ];
      for (const [change, code] of cases) {
        const result = edited(project, "src/ui/ui_bindings.c", change);
        assert.equal(result.errors[0]?.code, code, code);
        assert.ok(result.errors[0].line > 1, code);
        assert.equal(result.project, project, code);
      }
    });
    await test("ViewModel properties change in vm_<name>.c: value, range, type, new and removed ones", () => {
      const { project } = boundProject();
      const result = edited(project, "src/glue/vm_main.c", (text) => text
        .replace('"speed", 1500, 0, 3000', '"speed", 70, 0, 100')
        .replace('mv_prop_init_bool(&running_prop, "running", false);', 'mv_prop_init_int(&running_prop, "running", 2, 0, 5);')
        .replace('mv_prop_init_string(&status_prop, "status", "Ready");', 'mv_prop_init_string(&title_prop, "title", "Motor \\"A\\"");'));
      assert.deepEqual(result.errors, []);
      const props = result.project.viewModels[0].props;
      assert.deepEqual(props.map((prop) => [prop.name, prop.type, prop.value]), [["speed", "int", 70], ["running", "int", 2], ["title", "string", 'Motor "A"']]);
      assert.deepEqual([props[0].min, props[0].max], [0, 100]);
    });
    await test("A property renamed in vm_<name>.c keeps its bindings, and the logic is told the new name", () => {
      const { project, slider, label } = boundProject();
      const result = edited(project, "src/glue/vm_main.c", (text) => text.replace('"speed", 1500, 0, 3000', '"rpm", 1500, 0, 3000').replace('mv_prop_init_string(&status_prop, "status", "Ready");', 'mv_prop_init_string(&status_prop, "status", "Ready");\n    mv_prop_init_int(&extra_prop, "extra", 0, 0, 0);'));
      assert.deepEqual(result.errors, []);
      assert.equal(findNode(result.project, slider.id).bindings[0].path, "rpm");
      assert.equal(findNode(result.project, label.id).bindings[0].path, "rpm");
      assert.deepEqual(result.project.viewModelRenames, [{ from: "Main.speed", to: "Main.rpm" }]);
      const extra = result.project.viewModels[0].props.find((prop) => prop.name === "extra");
      assert.deepEqual([extra.min, extra.max], [0, 0], "printed without a range");
    });
    await test("A ViewModel statement that cannot be read is an error with its line", () => {
      const { project } = boundProject();
      for (const [change, code] of [
        [(text) => text.replace('"speed", 1500, 0, 3000', '"speed", fast, 0, 3000'), "number"],
        [(text) => text.replace('"speed", 1500', '"2speed", 1500'), "vmName"],
        [(text) => text.replace('"running", false', '"speed", false'), "duplicate"],
        [(text) => text.replace('"status", "Ready"', '"status", Ready'), "string"],
      ]) {
        const result = edited(project, "src/glue/vm_main.c", change);
        assert.equal(result.errors[0]?.code, code, code);
        assert.equal(result.project, project, code);
      }
    });
    await test("Every error of the code view has words in both languages", () => {
      for (const code of ["noVmProp", "bindFields", "bindNotHere", "twoConverters", "bindTwice", "vmName", "unknown", "noObject", "string", "number", "duplicate", "noFile"]) {
        for (const language of ["ko", "en"]) assert.notEqual(translator(language)(`codeError.${code}`), `codeError.${code}`, `${language} ${code}`);
      }
    });

    category("ViewModels: problems");
    const codes = (project) => findProblems(project).map((problem) => problem.code);
    await test("A sound bound project has no binding problems", () => {
      assert.deepEqual(codes(boundProject().project).filter((code) => /^(bind|vm|context)/.test(code)), []);
    });
    await test("Bindings to nothing, or that a widget cannot have, are errors", () => {
      const { project, slider, label } = boundProject();
      setBinding(project, slider.id, "value", { path: "gone" });
      label.bindings.push({ prop: "selected", path: "speed" });
      project.screens[0].dataContext = "Nope";
      const found = codes(project);
      assert.ok(found.includes("bindMissing"));
      assert.ok(found.includes("bindNotHere"));
      assert.ok(found.includes("contextMissing"));
    });
    await test("Bindings that do nothing are warnings: back from a display, scaling without a range, inverting a number", () => {
      const { project, label, slider } = boundProject();
      setBinding(project, label.id, "text", { path: "status", mode: "twoWay" });
      editVmProp(project, "Main", "speed", { min: 0, max: 0 });
      setBinding(project, slider.id, "hidden", { path: "speed", converter: "invert" });
      const found = codes(project);
      assert.ok(found.includes("bindNoInput"));
      assert.ok(found.includes("bindNoRange"));
      assert.ok(found.includes("bindInvert"));
    });
    await test("Generated C names that clash are errors; an empty ViewModel is noted", () => {
      const project = newProject();
      addViewModel(project, "a");
      addVmProp(project, "a", "int", "prop_x");
      addViewModel(project, "a_get");
      addVmProp(project, "a_get", "int", "x");
      addViewModel(project, "a_prop");
      addVmProp(project, "a_prop", "int", "x");
      addViewModel(project, "Empty");
      const problems = findProblems(project);
      assert.ok(problems.some((problem) => problem.code === "vmClash" && problem.params.name === "vm_a_get_prop_x"));
      assert.ok(problems.some((problem) => problem.code === "vmEmpty" && problem.params.vm === "Empty"));
    });

    category("ViewModels: the application code");
    const logic = (body) => ({ "src/app/app.c": `#include "app.h"\n#include "glue.h"\n\nvoid app_init(void)\n{\n${body}\n}\n` });
    await test("Comments, strings and characters are blanked; lines and columns stay", () => {
      const text = 'a = "vm_x"; // vm_y\nb = \'"\'; /* vm_z\n */ c';
      const code = codeOnly(text);
      assert.equal(code.length, text.length);
      assert.equal(code.split("\n").length, text.split("\n").length);
      assert.doesNotMatch(code, /vm_/);
      assert.match(code, /^a = " {4}"; {8}\nb = ' '; {8}\n {3} c$/);
    });
    await test("Names the design generates are fine, wherever the logic uses them", () => {
      const { project } = boundProject();
      const app = logic("    vm_main_set_speed(1);\n    if(vm_main_get_running()) mv_observe(vm_main_prop_status(), 0, 0);\n    vm_main_init();");
      app["src/app/tests/test.c"] = '#include "vm_main.h"\nint main(void) { return vm_main_get_speed(); }\n';
      assert.deepEqual(missingGlueNames(project, app), []);
      assert.deepEqual(missingGlueNames(project, null), []);
    });
    await test("After a property is renamed, the logic's old name is found, with the new one", () => {
      const { project } = boundProject();
      const app = logic("    vm_main_set_speed(1);\n    int s = vm_main_get_speed();");
      renameVmProp(project, "Main", "speed", "rpm");
      assert.deepEqual(missingGlueNames(project, app), [
        { file: "src/app/app.c", line: 6, name: "vm_main_set_speed", header: false, suggest: "vm_main_set_rpm" },
        { file: "src/app/app.c", line: 7, name: "vm_main_get_speed", header: false, suggest: "vm_main_get_rpm" },
      ]);
    });
    await test("After a ViewModel is renamed, its names and its header are found", () => {
      const { project } = boundProject();
      const app = { "src/app/app.c": '#include "vm_main.h"\nvoid app_init(void) { vm_main_set_status("x"); }\n' };
      renameViewModel(project, "Main", "Motor");
      const found = missingGlueNames(project, app);
      assert.deepEqual(found.map((use) => [use.line, use.name, use.suggest]), [[1, "vm_main.h", "vm_motor.h"], [2, "vm_main_set_status", "vm_motor_set_status"]]);
      assert.equal(found[0].header, true);
    });
    await test("Renames are remembered in the project, through chains, undone with it, and checked on reading", () => {
      const { project } = boundProject();
      renameVmProp(project, "Main", "speed", "rpm");
      renameViewModel(project, "Main", "Motor");
      renameVmProp(project, "Motor", "rpm", "velocity");
      assert.deepEqual(project.viewModelRenames, [{ from: "Main.speed", to: "Main.rpm" }, { from: "Main", to: "Motor" }, { from: "Motor.rpm", to: "Motor.velocity" }]);
      const found = missingGlueNames(project, logic("    vm_main_set_speed(1);\n    vm_main_get_rpm();\n    vm_motor_prop_rpm();"));
      assert.deepEqual(found.map((use) => use.suggest), ["vm_motor_set_velocity", "vm_motor_get_velocity", "vm_motor_prop_velocity"]);
      const read = parseProject(serializeProject(project));
      assert.deepEqual(read.viewModelRenames, project.viewModelRenames, "kept in the file, so a later session still knows");
      const data = JSON.parse(serializeProject(project));
      data.viewModelRenames = [{ from: "Main.x", to: "Motor" }];
      assert.throws(() => parseProject(JSON.stringify(data)), /bad ViewModel rename/);
      removeViewModel(project, "Motor");
      assert.equal(project.viewModelRenames, undefined, "nothing to remember once no ViewModel is left");
    });
    await test("A swap of two names suggests each one's real new name, not a look-alike", () => {
      const { project } = boundProject();
      renameVmProp(project, "Main", "status", "message");
      renameVmProp(project, "Main", "speed", "status");
      const found = missingGlueNames(project, logic('    vm_main_set_speed(1);\n    vm_main_set_message("m");\n    vm_main_get_statu();'));
      assert.deepEqual(found.map((use) => [use.name, use.suggest]), [["vm_main_set_speed", "vm_main_set_status"], ["vm_main_get_statu", "vm_main_get_status"]], "speed is now status; message is fine; a typo is one letter off");
    });
    await test("A deleted property is found; nothing close is suggested for what is truly gone", () => {
      const { project } = boundProject();
      removeVmProp(project, "Main", "status");
      const found = missingGlueNames(project, logic('    vm_main_set_status("Ready");'));
      assert.deepEqual(found.map((use) => use.name), ["vm_main_set_status"]);
      assert.equal(found[0].suggest, null);
    });
    await test("Comments, strings and the logic's own vm_ functions are not reported", () => {
      const { project } = boundProject();
      const app = logic('    /* vm_main_set_gone(1); */\n    // vm_main_get_gone();\n    printf("vm_main_set_gone");\n    vm_main_get_twice();\n    vm_counter++;');
      app["src/app/helpers.c"] = "int vm_main_get_twice(void)\n{\n    return 2 * vm_main_get_speed();\n}\n";
      assert.deepEqual(missingGlueNames(project, app), []);
    });
    await test("Each name is reported once a line, in file and line order", () => {
      const { project } = boundProject();
      const app = { "src/app/b.c": "void b(void) { vm_main_set_x(1); vm_main_set_x(2); }\n", "src/app/a.c": "\nvoid a(void) { vm_main_get_y(); }\n" };
      assert.deepEqual(missingGlueNames(project, app).map((use) => `${use.file}:${use.line}:${use.name}`), ["src/app/a.c:2:vm_main_get_y", "src/app/b.c:1:vm_main_set_x"]);
    });
    await test("The problems view lists them as errors that lead to the line of the code", () => {
      const { project } = boundProject();
      renameVmProp(project, "Main", "speed", "rpm");
      const problems = findProblems(project, { appCode: logic("    vm_main_set_speed(1);\n    vm_other_get_x();") }).filter((problem) => problem.code.startsWith("app"));
      assert.deepEqual(problems.map((problem) => [problem.severity, problem.code, problem.file, problem.line, problem.hasCode, problem.params.suggest]), [
        ["error", "appNameSuggest", "src/app/app.c", 6, true, "vm_main_set_rpm"],
        ["error", "appName", "src/app/app.c", 7, true, ""],
      ]);
      assert.deepEqual(findProblems(boundProject().project, { appCode: logic("    vm_main_set_speed(1);") }).filter((problem) => problem.code.startsWith("app")), []);
    });
    await test("The MotorControl sample's logic uses only names its design has, and renaming breaks that visibly", () => {
      const read = (dir) => {
        const files = {};
        const walk = (sub) => {
          for (const entry of fs.readdirSync(new URL(`../samples/MotorControl/${sub}/`, import.meta.url), { withFileTypes: true })) {
            if (entry.isDirectory()) walk(`${sub}/${entry.name}`);
            else files[`${sub}/${entry.name}`] = fs.readFileSync(new URL(`../samples/MotorControl/${sub}/${entry.name}`, import.meta.url), "utf8");
          }
        };
        walk(dir);
        return files;
      };
      const project = parseProject(fs.readFileSync(new URL("../samples/MotorControl/MotorControl.mylvgl", import.meta.url), "utf8"));
      const app = read("src/app");
      assert.ok(app["src/app/app.c"] && app["src/app/tests/test_motor.c"]);
      assert.deepEqual(missingGlueNames(project, app), []);
      renameVmProp(project, "Motor", "target", "set_point");
      const names = missingGlueNames(project, app).map((use) => `${use.file}:${use.name}>${use.suggest}`);
      assert.ok(names.includes("src/app/app.c:vm_motor_get_target>vm_motor_get_set_point"), names.join("\n"));
      assert.ok(names.some((name) => name.startsWith("src/app/tests/test_motor.c:vm_motor_get_target")), names.join("\n"));
    });

    for (const [version, engine] of engines) {
      category(`ViewModels: engine ${version}`);
      const load = (project, events = true) => {
        engine.load(project, project.screens[0].id, { events });
        assert.deepEqual(engine.errors, []);
      };
      const ticks = (count) => {
        for (let i = 0; i < count; i++) engine.tick(20);
      };
      const drag = (box, fromX, toX) => {
        const y = box.y + box.h / 2;
        engine.pointer(box.x + fromX, y, false);
        ticks(3);
        engine.pointer(box.x + fromX, y, true);
        ticks(3);
        for (let i = 1; i <= 8; i++) {
          engine.pointer(box.x + fromX + ((toX - fromX) * i) / 8, y, true);
          ticks(2);
        }
        engine.pointer(box.x + toX, y, false);
        ticks(5);
      };
      /** The pixels of a widget's box: they differ when it shows and when it does not. */
      const pixelsOf = (box) => {
        const frame = engine.frame();
        const rows = [];
        for (let y = box.y; y < box.y + box.h; y++) rows.push(Buffer.from(frame.subarray((y * engine.width + box.x) * 4, (y * engine.width + box.x + box.w) * 4)));
        return Buffer.concat(rows);
      };
      const press = (box) => {
        const [x, y] = [box.x + box.w / 2, box.y + box.h / 2];
        engine.pointer(x, y, false);
        ticks(3);
        engine.pointer(x, y, true);
        ticks(4);
        engine.pointer(x, y, false);
        ticks(5);
      };
      await test("The design shows the ViewModel's values, not the widgets' own", () => {
        const { project, slider } = boundProject(version);
        load(project, false);
        assert.equal(engine.valueOf(slider.id), 50, "1500 of 0..3000 is 50 of 0..100");
        assert.deepEqual(engine.vmValues(), { "Main.speed": 1500, "Main.running": false, "Main.status": "Ready" });
        const plain = structuredClone(project);
        delete plain.screens[0].children[1].bindings;
        load(plain, false);
        const unbound = Buffer.from(engine.frame());
        load(project, false);
        assert.ok(!unbound.equals(Buffer.from(engine.frame())), "the label shows 1500 rpm, not x");
      });
      await test("Setting a property moves every widget bound to it", () => {
        const { project, slider, lamp } = boundProject(version);
        load(project);
        const before = Buffer.from(engine.frame());
        const box = engine.coords(lamp.id);
        const dark = pixelsOf(box);
        engine.setVm("Main.speed", 3000);
        engine.setVm("Main.running", true);
        ticks(3);
        assert.equal(engine.valueOf(slider.id), 100);
        assert.ok(!dark.equals(pixelsOf(box)), "the lamp shows when running");
        assert.ok(!before.equals(Buffer.from(engine.frame())));
        assert.equal(engine.setVm("Main.nothing", 1), false);
      });
      await test("Dragging a two-way slider sets the property; the label bound to it follows", () => {
        const { project, slider, label } = boundProject(version);
        load(project);
        const changes = engine.vmChanges();
        const text = () => Buffer.from(engine.frame());
        const before = text();
        drag(engine.coords(slider.id), 100, 20);
        assert.ok(engine.vmValues()["Main.speed"] < 1500, String(engine.vmValues()["Main.speed"]));
        assert.ok(engine.vmChanges() > changes);
        assert.ok(!before.equals(text()));
        void label;
      });
      await test("A one-way slider leaves the property alone; one-time does not follow later changes", () => {
        const { project, slider, label } = boundProject(version);
        setBinding(project, slider.id, "value", { path: "speed", converter: "range", mode: "oneWay" });
        setBinding(project, label.id, "text", { path: "speed", format: "%d", mode: "oneTime" });
        load(project);
        drag(engine.coords(slider.id), 100, 20);
        assert.equal(engine.vmValues()["Main.speed"], 1500);
        const labelBox = engine.coords(label.id);
        const shown = pixelsOf(labelBox);
        engine.setVm("Main.speed", 0);
        ticks(3);
        assert.equal(engine.valueOf(slider.id), 0, "one-way follows");
        assert.ok(shown.equals(pixelsOf(labelBox)), "the one-time label kept its first text");
      });
      await test("Screen to ViewModel starts from the widget's own value", () => {
        const { project, slider } = boundProject(version);
        setBinding(project, slider.id, "value", { path: "speed", mode: "oneWayToSource" });
        load(project);
        assert.equal(engine.vmValues()["Main.speed"], 10);
      });
      await test("A switch sets a true/false property; its inverted lamp follows", () => {
        const { project, toggle, lamp } = boundProject(version);
        load(project);
        const box = engine.coords(lamp.id);
        const dark = pixelsOf(box);
        press(engine.coords(toggle.id));
        assert.equal(engine.vmValues()["Main.running"], true);
        assert.ok(!dark.equals(pixelsOf(box)), "the lamp shows");
      });
      await test("Text bindings: a string shows as it is, a format places the number once", () => {
        const { project, status, label } = boundProject(version);
        setBinding(project, label.id, "text", { path: "speed", format: "%d%% of %d" });
        load(project);
        const frame = () => Buffer.from(engine.frame());
        const first = frame();
        engine.setVm("Main.status", "Running fast");
        ticks(2);
        assert.ok(!first.equals(frame()));
        assert.ok(engine.coords(status.id).w > 60, "the longer text is wider");
      });
      await test("Rebuilding hundreds of times leaves no binding behind", () => {
        const { project } = boundProject(version);
        for (let i = 0; i < 300; i++) load(project);
        assert.equal(engine.vmChanges(), 0, "nothing changed what was just built");
        engine.setVm("Main.speed", 1);
        assert.equal(engine.vmChanges(), 1, "one observer, not hundreds");
      });
    }
  })();
}
