// Test cases for popup windows (menus, dialogs, print preview) and the user's guide
// window; test/cases.ts runs them with the rest.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DIALOG_SPECS, dialogSpec } from "../../src/dialogSpecs.js";
import { parseGuide } from "../../src/guideDoc.js";
import { translate } from "../../src/i18n.js";
import { popupRoute } from "../../src/popupRoute.js";
import { dialogEntry, dialogIcon as entryIcon, registerDialog, registeredDialogs } from "../../src/popupRegistry.js";
import { APP_DIALOG_TYPES, dialogIcon, dialogPayload, dialogTitle, type DialogState } from "../../src/dialogs/appDialogTypes.js";
import { closeDialog, inlineDialogs, isDialogOpen, updateDialog } from "../../src/host.js";
import { actionOf, chosenTheme, listItems, THEME_MENU_SETTINGS, themeMenuChoice, type ActionItem } from "../../src/menuPopup.js";
import { assert, type AddCase, type FeatureCtx } from "./types";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(ROOT, ...parts), "utf8");

export function windowsCases(_ctx: FeatureCtx, add: AddCase): void {
  add("Guide", "The Korean and English guides have the same sections in the same order", async () => {
    const ko = parseGuide(read("doc", "UsersGuide.md"));
    const en = parseGuide(read("doc", "UsersGuide.en.md"));
    assert(ko.title.includes("My Git Master") && en.title.includes("My Git Master"), `${ko.title} / ${en.title}`);
    assert(ko.sections.length >= 30, `ko sections ${ko.sections.length}`);
    assert(ko.sections.length === en.sections.length, `${ko.sections.length} vs ${en.sections.length}`);
    for (let index = 0; index < ko.sections.length; index++) {
      const a = ko.sections[index];
      const b = en.sections[index];
      assert(a.id === b.id && a.level === b.level && a.parent === b.parent, `${a.id} (${a.title}) vs ${b.id} (${b.title})`);
      // A `##` may hold only its `###` subsections.
      const hasChildren = ko.sections.some((item) => item.parent === a.id && item.id !== a.id);
      assert(hasChildren || (a.blocks.length > 0 && b.blocks.length > 0), `${a.id} is empty`);
    }
    assert(new Set(ko.sections.map((item) => item.id)).size === ko.sections.length, "section ids are unique");
    assert(!ko.sections.some((item) => item.title === "목차") && !en.sections.some((item) => item.title === "Contents"), "the contents are not a section");
  });

  add("Guide", "Each guide shows its own language's pictures, and every picture exists", async () => {
    const pictures = (file: string) => [...read("doc", file).matchAll(/^!\[[^\]]*\]\(([^)]+)\)\s*$/gm)].map((match) => match[1]);
    const ko = pictures("UsersGuide.md");
    const en = pictures("UsersGuide.en.md");
    assert(ko.length >= 20, `the Korean guide has pictures (${ko.length})`);
    for (const [lang, list] of [["ko", ko], ["en", en]] as const) {
      for (const src of list) {
        assert(src.startsWith(`images/${lang}/`), `${lang} guide names ${src}: only images/${lang}/ pictures, never the other language's`);
        const file = path.join(ROOT, "doc", src);
        assert(fs.existsSync(file) && fs.readFileSync(file).readUInt32BE(0) === 0x89504e47, `${src} is a PNG in doc/`);
      }
    }
    const names = (list: string[]) => list.map((src) => path.basename(src)).join(",");
    assert(names(ko) === names(en), "both guides show the same pictures in the same places");
    const folder = (lang: string) => fs.readdirSync(path.join(ROOT, "doc", "images", lang)).filter((name) => name.endsWith(".png")).sort().join(",");
    assert(folder("ko") === folder("en"), `doc/images/ko and doc/images/en hold the same pictures: ${folder("ko")} | ${folder("en")}`);
    assert(!fs.existsSync(path.join(ROOT, "assets", "guide")), "the guide's pictures live in doc/images, not assets/guide");
  });

  add("Guide", "The guide window finds every picture the documents name, per language", async () => {
    const source = read("src", "GuideWindow.tsx");
    assert(source.includes(`import.meta.glob<string>("../doc/images/**/*.png"`), "pictures are bundled from doc/images");
    // The window's key for a picture: its path relative to doc/, exactly as the Markdown names it.
    const key = (file: string) => file.replace(/^\.\.\/doc\//, "");
    assert(source.includes("file.replace(/^\\.\\.\\/doc\\//, \"\")"), "keys are paths relative to doc/");
    const bundled = new Set(["ko", "en"].flatMap((lang) =>
      fs.readdirSync(path.join(ROOT, "doc", "images", lang)).map((name) => key(`../doc/images/${lang}/${name}`))));
    for (const [file, lang] of [["UsersGuide.md", "ko"], ["UsersGuide.en.md", "en"]] as const) {
      const doc = parseGuide(read("doc", file));
      const sources = doc.sections.flatMap((section) => section.blocks.flatMap((block) => (block.kind === "image" ? [block.src] : [])));
      assert(sources.length >= 20, `${file}: the parser sees the pictures (${sources.length})`);
      for (const src of sources) {
        assert(bundled.has(src.replace(/^(\.\/)+/, "")), `${file}: ${src} resolves to a bundled picture`);
        assert(src.includes(`/${lang}/`), `${file}: ${src} is a ${lang} picture`);
      }
    }
  });

  add("Guide", "The language button names the language it switches to, with its flag", async () => {
    const guide = read("src", "GuideWindow.tsx");
    assert(guide.includes(`<Flag country={language === "ko" ? "gb" : "kr"} />`), "Korean guide shows the UK flag, English guide the Korean flag");
    assert(guide.includes(`{language === "ko" ? "영어" : "한국어"}`), "label: 영어 on the Korean guide, 한국어 on the English one");
  });

  add("Guide", "Every in-guide link points at a section that exists, in both languages", async () => {
    for (const file of ["UsersGuide.md", "UsersGuide.en.md"]) {
      const text = read("doc", file);
      const ids = new Set(parseGuide(text).sections.map((item) => item.id));
      const links = [...text.matchAll(/\]\(#([^)]+)\)/g)].map((match) => match[1]);
      assert(links.length >= 14, `${file}: ${links.length} links`);
      for (const link of links) assert(ids.has(link), `${file}: #${link} has no section`);
    }
  });

  add("Guide", "Both guides keep CRLF line endings and the window strings exist in both languages", async () => {
    for (const file of ["UsersGuide.md", "UsersGuide.en.md"]) {
      const text = read("doc", file);
      assert(!/[^\r]\n/.test(text), `${file} has a bare LF`);
    }
    for (const key of ["userGuide", "guideTitle", "guideSearch", "guideContents", "guideNoMatch", "guideSwitchLanguage"]) {
      assert(translate("ko", key) !== key && translate("en", key) !== key, key);
      assert(translate("ko", key) !== translate("en", key), `${key} is not translated`);
    }
  });

  add("Windows", "Every popup command is defined, registered, listed in build.rs and granted", async () => {
    const popups = read("src-tauri", "src", "popups.rs");
    const main = read("src-tauri", "src", "main.rs");
    const build = read("src-tauri", "build.rs");
    const caps = JSON.parse(read("src-tauri", "capabilities", "default.json")) as { permissions: string[] };
    const commands = [...popups.matchAll(/#\[tauri::command\]\s*pub async fn ([a-z_]+)\(/g)].map((match) => match[1]);
    for (const expected of ["menu_open", "menu_choose", "dialog_open", "dialog_result", "dialog_size", "guide_open"]) {
      assert(commands.includes(expected), `${expected} missing from popups.rs`);
    }
    for (const command of [...commands, "window_background", "settings_broadcast", "window_min_size"]) {
      assert(build.includes(`"${command}",`), `${command} is not in build.rs`);
      assert(caps.permissions.includes(`allow-${command.replaceAll("_", "-")}`), `${command} is not granted`);
    }
    for (const command of commands) assert(main.includes(`popups::${command},`), `${command} is not in generate_handler`);
    assert(main.includes("popups::close_all(app)"), "popups close with the app");
    assert(/Focused\(focused\) if window\.label\(\) == popups::MENU/.test(main), "the menu closes when it loses focus");
  });

  add("Windows", "Popup routes are told apart from the main window", async () => {
    assert(popupRoute("#menu=")?.kind === "menu", "menu");
    assert(popupRoute("#dialog=")?.kind === "dialog", "dialog");
    const guide = popupRoute("#guide=conflicts");
    assert(guide?.kind === "guide" && guide.section === "conflicts", JSON.stringify(guide));
    const plain = popupRoute("#guide");
    assert(plain?.kind === "guide" && plain.section === "", JSON.stringify(plain));
    assert(popupRoute("") === null && popupRoute("#tool?kind=diff&file=a") === null, "main and tool windows");
  });

  add("Windows", "The popup table registers every dialog and menu; every dialog has a size", async () => {
    const table = read("src", "popupRegistrations.ts");
    assert(table.includes('registerMenu("list"'), "the generic list menu");
    assert(/for \(const type of APP_DIALOG_TYPES\)\s*\{\s*registerDialog\(type,/.test(table), "every app dialog");
    assert(table.includes('registerDialog("print"'), "the print preview");
    for (const name of [...APP_DIALOG_TYPES, "print"]) assert(name in DIALOG_SPECS, `${name} has no size in dialogSpecs.ts`);
    for (const [name, spec] of Object.entries(DIALOG_SPECS)) {
      assert(spec.width >= 320 && spec.height >= 120, `${name} ${spec.width}×${spec.height}`);
    }
    assert(dialogSpec("print").resizable === true, "print preview is a resizable window");
    assert(dialogSpec("no-such-dialog").width > 0, "a default size");
    // The registry: names are unique (a second registration replaces the first), icons may depend on the payload.
    const before = registeredDialogs().length;
    registerDialog("test-probe", { component: () => null, icon: (payload) => (payload ? "trash" : "help"), title: () => "Probe" });
    registerDialog("test-probe", { component: () => null, icon: (payload) => (payload ? "trash" : "help"), title: () => "Probe" });
    assert(registeredDialogs().length === before + 1, "one entry per name");
    const entry = dialogEntry("test-probe")!;
    assert(entryIcon(entry, {}, (key) => key) === "trash" && entryIcon(entry, null, (key) => key) === "help", "payload icons");
  });

  add("Windows", "Every app dialog has a size, an icon and a title, and travels as plain data", async () => {
    const ko = (key: string) => translate("ko", key);
    const samples: DialogState[] = [
      { type: "open", path: "" },
      { type: "clone", url: "", destination: "", username: "", password: "" },
      { type: "browse", url: "", username: "", password: "" },
      { type: "auth", username: "", password: "", remember: true, resolve: () => undefined },
      { type: "commit", category: "", subject: "", body: "" },
      { type: "categories", text: "" },
      { type: "prefs", language: "ko", theme: "light-classic", tool: "", args: "", mergeTool: "", mergeArgs: "", shell: "" },
      { type: "confirm", title: ko("delete"), message: "a.txt", resolve: () => undefined },
      { type: "prompt", title: ko("newFolder"), label: "", value: "", resolve: () => undefined },
      { type: "text", title: "status", text: "", save: true },
      { type: "report", report: { title: "Summary", filename: "s", generatedAt: "", summary: [], tables: [] } },
      { type: "about" },
      { type: "error", message: "m", detail: "d" },
      { type: "export", sha: "abc", path: "" },
    ];
    assert(samples.map((item) => item.type).sort().join() === [...APP_DIALOG_TYPES].sort().join(), "a sample for every type");
    for (const sample of samples) {
      assert(sample.type in DIALOG_SPECS, `${sample.type} has no size`);
      const payload = dialogPayload(sample);
      assert(!("resolve" in payload), `${sample.type}: the callback stays with the opener`);
      assert(JSON.parse(JSON.stringify(payload)).type === sample.type, `${sample.type} payload is plain data`);
      assert(dialogTitle(payload, ko).length > 0, `${sample.type} title`);
      assert(dialogIcon(payload, ko).length > 0, `${sample.type} icon`);
    }
    assert(dialogIcon(dialogPayload(samples[7]), ko) === "trash", "a delete question shows the trash can");
    assert(dialogIcon(dialogPayload(samples[8]), ko) === "folderPlus", "a new folder question shows the folder icon");
    const prefs = dialogSpec("prefs");
    assert(prefs.resizable === true && prefs.width === 900 && prefs.height === 600 && prefs.minWidth === 640 && prefs.minHeight === 420, JSON.stringify(prefs));
  });

  add("Menus", "Menus with callbacks travel as ids and come back as the chosen callback", async () => {
    const calls: string[] = [];
    const items: ActionItem[] = [
      { icon: "open", label: "Open", shortcut: "Ctrl+O", action: () => calls.push("open") },
      { kind: "separator" },
      { kind: "header", label: "Recent" },
      { icon: "clock", label: "C:/repo", action: () => calls.push("recent"), secondary: { icon: "trash", label: "Remove", action: () => calls.push("remove") } },
      { icon: "commit", label: "Commit", disabled: true, action: () => calls.push("commit") },
    ];
    const rows = listItems(items);
    assert(JSON.parse(JSON.stringify(rows)).length === items.length, "plain data, one row per item");
    const first = rows[0] as { id: string; icon: string; shortcut?: string };
    assert(first.id === "0" && first.icon === "open" && first.shortcut === "Ctrl+O", JSON.stringify(first));
    assert(rows[1].kind === "separator" && rows[2].kind === "header", "separator and header kept");
    assert((rows[3] as { secondary?: { id: string } }).secondary?.id === "3:2", "the second button has its own id");
    for (const row of rows) {
      if (!row.kind || row.kind === "item") assert(Boolean((row as { icon?: string }).icon), "every row has an icon");
    }
    actionOf(items, "0")?.();
    actionOf(items, "3")?.();
    actionOf(items, "3:2")?.();
    assert(actionOf(items, "4") === null, "a disabled row does nothing");
    assert(actionOf(items, null) === null && actionOf(items, "1") === null && actionOf(items, "99") === null, "dismissed / separator / unknown");
    assert(calls.join() === "open,recent,remove", calls.join());
  });

  add("Menus", "The theme drop-down answers with a theme or with the settings button", async () => {
    assert(chosenTheme(themeMenuChoice("dark-ink")) === "dark-ink", "theme");
    assert(chosenTheme(themeMenuChoice("custom-3")) === "custom-3", "a user theme");
    assert(chosenTheme(THEME_MENU_SETTINGS) === null && chosenTheme(null) === null, "settings / dismissed");
    const table = read("src", "popupRegistrations.ts");
    assert(table.includes('registerMenu("theme", { component: ThemeMenuPopup })'), "the theme menu is registered");
    assert(read("src", "ThemeMenuPopup.tsx").includes("onSettings={() => choose(THEME_MENU_SETTINGS)}"), "the gear answers settings");
  });

  add("Windows", "The progress popup is a dialog window kept in step without taking the focus", async () => {
    assert(read("src", "popupRegistrations.ts").includes('registerDialog("progress"'), "registered");
    const spec = dialogSpec("progress");
    assert(spec.noFocus === true && spec.fixed === true, JSON.stringify(spec));
    assert(/pub async fn dialog_update\(/.test(read("src-tauri", "src", "popups.rs")), "the shell updates a dialog without showing it");
    // The browser path (no desktop shell under Node): one dialog, its payload replaced.
    assert(!isDialogOpen("progress"), "closed at first");
    updateDialog("progress", { label: "Clone", detail: "1%" });
    updateDialog("progress", { label: "Clone", detail: "42%" });
    const open = inlineDialogs.get().filter((item) => item.name === "progress");
    assert(open.length === 1 && (open[0].payload as { detail: string }).detail === "42%", JSON.stringify(open.map((item) => item.payload)));
    assert(isDialogOpen("progress"), "open");
    closeDialog("progress");
    assert(!isDialogOpen("progress"), "closed when the operation ends");
  });

  add("Windows", "The main window opens its menus, theme drop-down and progress as popup windows", async () => {
    const app = read("src", "App.tsx");
    assert(!app.includes('className="menu-pop"') && !app.includes('className="context"'), "no in-page drop-down or context menu");
    assert(!app.includes('className="tool-pop theme"') && !app.includes("<ThemeMenu "), "no in-page theme drop-down");
    assert(app.includes("openActionMenu(items, anchorForPoint(event.clientX, event.clientY))"), "right-click menus open at the pointer");
    assert(app.includes("openActionMenu(rows, button.current)"), "menubar drop-downs open below their button");
    assert(app.includes('openMenu("theme", null, anchorFor(themeCaret.current))'), "the theme drop-down");
    assert(app.includes('updateDialog("progress", state)') && app.includes('closeDialog("progress")'), "the progress popup follows the store");
    assert(!/<ProgressPopup\b/.test(app), "no in-page progress popup");
    const css = read("src", "styles.css");
    assert(!/^\.overlay \{/m.test(css) && !/^\.context \{/m.test(css) && !/^\.tool-pop \{/m.test(css), "the old in-page popup CSS is gone");
  });

  add("Windows", "Windows open in the saved theme's colour, a user theme included", async () => {
    const main = read("src-tauri", "src", "main.rs");
    assert(main.includes('settings["customThemes"]') && main.includes('["colors"]["bg"]'), "Rust reads the user theme's background");
    assert(main.includes("fn user_themes_open_in_their_own_background()"), "covered by cargo test");
    const boot = read("src", "main.tsx");
    assert(boot.includes('root.addEventListener("mygit-theme", update)') && boot.includes("host.onSettingsPublished(() => requestAnimationFrame(update))"), "the renderer reports colour changes, edits of a user theme included");
  });

  add("Windows", "The main window no longer draws dialogs inside itself", async () => {
    const app = read("src", "App.tsx");
    assert(!app.includes("DialogHost") && !app.includes('className="overlay"'), "App.tsx still renders an in-page dialog");
    assert(!/type: "print"/.test(app), "the print preview opens as its own window");
    assert(app.includes("openDialog<AppDialogResult>(current.type, dialogPayload(current))"), "dialog state opens as a popup");
    assert(app.includes("onSettingsPublished("), "the main window follows settings changed in Preferences");
  });
}
