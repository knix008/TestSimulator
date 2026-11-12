// Tests of the code editor's pieces that run without a window: spelling (words, dictionaries,
// the user's own words, word lists) and the clean-up of its settings.
import assert from "node:assert/strict";
import fs from "node:fs";
import { LANGUAGES, languageOf, misspelled, sanitizeSpell, spellerFor, wordsFromList, wordsOf } from "../src/editor/spell.js";

const dictionary = (language) => ({
  aff: fs.readFileSync(new URL(`../node_modules/dictionary-${language}/index.aff`, import.meta.url)),
  dic: fs.readFileSync(new URL(`../node_modules/dictionary-${language}/index.dic`, import.meta.url)),
});

export function registerEditorTests({ category, test }) {
  return (async () => {
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
