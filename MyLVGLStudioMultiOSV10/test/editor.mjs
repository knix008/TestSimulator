// Tests of the code editor's pieces that run without a window: spelling (words, dictionaries,
// the user's own words, word lists) and the clean-up of its settings.
import assert from "node:assert/strict";
import fs from "node:fs";
import { LANGUAGES, languageOf, misspelled, sanitizeSpell, spellerFor, wordsFromList, wordsOf } from "../src/editor/spell.js";
import { EditorSelection, Transaction } from "@codemirror/state";
import { indentLess } from "@codemirror/commands";
import { autoIndent, createState, indentFor, indentPart, insertSpaces } from "../src/editor/codemirror.js";

/** A view without a window: enough for commands, which read the state and dispatch. */
const fakeView = (text, { tabSize = 4, from = text.length, to = from } = {}) => {
  const view = {
    state: createState(text, { tabSize, items: () => [], actions: {}, onUpdate: () => {} }),
    dispatch(...specs) {
      const tr = specs[0] instanceof Transaction ? specs[0] : view.state.update(...specs);
      view.state = tr.state;
    },
  };
  view.dispatch({ selection: EditorSelection.single(from, to) });
  return view;
};

const dictionary = (language) => ({
  aff: fs.readFileSync(new URL(`../node_modules/dictionary-${language}/index.aff`, import.meta.url)),
  dic: fs.readFileSync(new URL(`../node_modules/dictionary-${language}/index.dic`, import.meta.url)),
});

export function registerEditorTests({ category, test }) {
  return (async () => {
    category("Code editor: indenting");
    await test("The Tab key types spaces up to the next tab stop, never a tab character", () => {
      const view = fakeView("int a;", { from: 0 });
      insertSpaces(view);
      assert.equal(view.state.doc.toString(), "    int a;");
      assert.equal(view.state.selection.main.head, 4);
      const mid = fakeView("ab", { from: 2 });
      insertSpaces(mid);
      assert.equal(mid.state.doc.toString(), "ab  ", "from column 2 to 4");
      const two = fakeView("x", { tabSize: 2, from: 1 });
      insertSpaces(two);
      assert.equal(two.state.doc.toString(), "x ");
      const typedOver = fakeView("abcd", { from: 1, to: 3 });
      insertSpaces(typedOver);
      assert.equal(typedOver.state.doc.toString(), "a   d", "a selection on one line is typed over");
      assert.ok(!view.state.doc.toString().includes("\t"));
    });
    await test("Tab on several lines indents them with spaces; Shift+Tab takes it back", () => {
      const view = fakeView("a;\nb;", { from: 0, to: 5 });
      insertSpaces(view);
      assert.equal(view.state.doc.toString(), "    a;\n    b;");
      indentLess(view);
      assert.equal(view.state.doc.toString(), "a;\nb;");
    });
    await test("Auto indent lays out the whole file as C, with spaces of the tab width", () => {
      const messy = "void f(void)\n{\nif (x) {\n\t\ty = 1;\n   }\n  \t\nreturn;\n}\n";
      const view = fakeView(messy, { from: 0 });
      autoIndent(view);
      assert.equal(view.state.doc.toString(), "void f(void)\n{\n    if (x) {\n        y = 1;\n    }\n\n    return;\n}\n");
      const two = fakeView(messy, { tabSize: 2, from: 0 });
      autoIndent(two);
      assert.equal(two.state.doc.toString(), "void f(void)\n{\n  if (x) {\n    y = 1;\n  }\n\n  return;\n}\n");
    });
    await test("Auto indent with a selection touches only the selected lines", () => {
      const text = "void f(void)\n{\nint a;\nint b;\n}\n";
      const view = fakeView(text, { from: text.indexOf("int b"), to: text.indexOf("int b") + 2 });
      autoIndent(view);
      assert.equal(view.state.doc.toString(), "void f(void)\n{\nint a;\n    int b;\n}\n");
    });
    await test("The tab width changes while the file is open", () => {
      const view = fakeView("", { from: 0 });
      view.dispatch({ effects: indentPart.reconfigure(indentFor(8)) });
      assert.equal(view.state.tabSize, 8);
      insertSpaces(view);
      assert.equal(view.state.doc.toString(), " ".repeat(8));
      view.dispatch({ effects: indentPart.reconfigure(indentFor(99)) });
      assert.equal(view.state.tabSize, 8, "kept within 2 to 8");
    });

    category("Code editor: spelling");
    await test("Only words people read are taken: identifiers, escapes and short letters are not", () => {
      const text = "Turn the motor_speed to 10rpm; camelCase \\nHello LVGL a 모터를 켜고 돌립니다";
      assert.deepEqual(wordsOf(text).map((item) => item.word), ["Turn", "the", "to", "LVGL", "모터를", "켜고", "돌립니다"]);
      const [first] = wordsOf("  hello", 100);
      assert.deepEqual([first.from, first.to], [102, 107], "places are in the document");
      assert.deepEqual(wordsOf("don't 'quoted'").map((item) => item.word), ["don't", "quoted"]);
    });
    await test("Hangul is Korean, Latin English", () => {
      assert.equal(languageOf("모터"), "ko");
      assert.equal(languageOf("motor"), "en");
    });
    await test("Unknown words are found; the user's words and switched-off languages pass", () => {
      const words = wordsOf("hello wrold 안녕 갑니닿 LVGL");
      const known = (word) => ["hello", "안녕"].includes(word);
      assert.deepEqual(misspelled(words, { known, languages: ["ko", "en"], userWords: [] }).map((item) => item.word), ["wrold", "갑니닿", "LVGL"]);
      assert.deepEqual(misspelled(words, { known, languages: ["en"], userWords: ["LVGL"] }).map((item) => item.word), ["wrold"]);
    });
    await test("Settings are made valid: on by default, both languages, words unique and sorted", () => {
      assert.deepEqual(sanitizeSpell(undefined), { enabled: true, languages: LANGUAGES, words: [] });
      assert.deepEqual(sanitizeSpell({ enabled: false, languages: ["en", "fr"], words: ["b", "a", "a", " c ", "two words", 5, ""] }), { enabled: false, languages: ["en"], words: ["a", "b", "c"] });
    });
    await test("Word lists: one word a line, Hunspell .dic files too", () => {
      assert.deepEqual(wordsFromList("LVGL\nmvvm\n\n# a comment\nrpm\n"), ["LVGL", "mvvm", "rpm"]);
      assert.deepEqual(wordsFromList("3\nmotor/S\nspeed/SM\n모터\n"), ["motor", "speed", "모터"]);
    });
    for (const language of LANGUAGES) {
      await test(`The ${language === "ko" ? "Korean" : "English"} dictionary (Hunspell) knows words, rejects typos and suggests`, async () => {
        const speller = await spellerFor(language, async (name) => dictionary(name));
        const [good, bad, wanted] = language === "ko" ? [["모터가", "돌아갑니다", "속도를", "설정합니다", "안녕하세요"], "갑니닿", "갑니다"] : [["motor", "running", "speed", "display"], "speling", "spelling"];
        for (const word of good) assert.ok(speller.spell(word), word);
        assert.equal(speller.spell(bad), false);
        assert.ok(speller.suggest(bad).includes(wanted), speller.suggest(bad).join(","));
      });
    }
    await test("The app bundles the dictionaries and builds the spell checker's CommonJS code", () => {
      const config = fs.readFileSync(new URL("../vite.config.js", import.meta.url), "utf8");
      assert.match(config, /emscripten-wasm-loader\/dist\/cjs\/index\.js/);
      const files = fs.readFileSync(new URL("../src/editor/dictionaries.js", import.meta.url), "utf8");
      for (const language of LANGUAGES) for (const kind of ["aff", "dic"]) assert.ok(files.includes(`dictionary-${language}/index.${kind}?url`), `${language}.${kind}`);
    });
  })();
}
