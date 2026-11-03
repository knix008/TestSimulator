// Regression checks for problems found in the running app: each one failed there before
// its fix. They read the source, because the behaviour lives in layout and window code
// that Node cannot run.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assert, type AddCase, type FeatureCtx } from "./types";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(ROOT, ...parts), "utf8");

export function fixesCases(_ctx: FeatureCtx, add: AddCase): void {
  add("Window", "The main window snaps back to its minimum after any resize, not only mouse sizing", async () => {
    const main = read("src-tauri", "src", "main.rs");
    assert(/fn enforce_min_size\(window: &tauri::Window\)/.test(main), "enforce_min_size exists");
    assert(/enforce_min_size\(window\);\s*track\(window\);/.test(main), "it runs on every Resized of the main window");
    assert(/is_maximized\(\)[^\n]*is_minimized\(\)/.test(main), "a maximized or minimized window is left alone");
  });

  add("Window", "The minimum width comes from the real layout of the toolbar, up to its last button", async () => {
    const app = read("src", "App.tsx");
    assert(app.includes("const minCorrection = useRef(0);"), "a layout-based correction");
    assert(app.includes(`bar?.querySelector<HTMLElement>(".toolbar-end")`) && app.includes("end.getBoundingClientRect().width"), "measures the right-hand group itself");
    assert(app.includes("+ minCorrection.current;"), "the correction is part of the reported minimum");
  });

  add("Toolbar", "Toolbar buttons are flat, show a border on hover and look pressed while held", async () => {
    const css = read("src", "styles.css");
    const base = /\.toolbar button \{[^}]*\}/.exec(css)?.[0] ?? "";
    assert(/border-color: transparent/.test(base) && /background: transparent/.test(base), "no border or fill at rest");
    assert(/\.toolbar button:hover:not\(:disabled\) \{[^}]*border-color/.test(css), "border on hover");
    assert(/\.toolbar button:active:not\(:disabled\) \{[^}]*transform: translateY\(1px\)/.test(css), "pressed effect");
    assert(/\.toolbar-end > button, \.toolbar-end \.split-tool > button:first-child \{ width: 32px; height: 30px;/.test(css), "right-hand buttons share one size");
  });

  add("Theme", "The theme drop-down has no viewport height limit (its window sizes itself to it)", async () => {
    const block = /\.theme-menu \{[^}]*\}/.exec(read("src", "themeMenu.css"))?.[0] ?? "";
    assert(block && !/max-height/.test(block) && !/100vh/.test(block), "a vh-based limit made the menu window 36px tall");
  });

  add("Diff", "Both sides of the built-in Diff scroll together, vertically and horizontally", async () => {
    const tools = read("src", "BuiltinTools.tsx");
    assert(tools.includes("to.scrollTop = from.scrollTop;") && tools.includes("to.scrollLeft = from.scrollLeft;"), "both axes synced");
  });

  add("History", "Commit History shows the commit time in its own column", async () => {
    const history = read("src", "CommitHistory.tsx");
    assert(/time: 84/.test(history) && history.includes(`resize(event, "time")`), "a resizable time column");
    assert(history.includes("commit.date.slice(11, 19)"), "HH:MM:SS from git's ISO date");
    assert(read("src", "App.tsx").includes(`time: t("commitTime")`), "labelled");
  });

  add("Tools", "The program picker opens in the current tool's folder or the system program folder", async () => {
    const main = read("src-tauri", "src", "main.rs");
    assert(/async fn pick_program\(app: AppHandle, window: WebviewWindow, current: Option<String>\)/.test(main), "takes the current tool");
    assert(main.includes(`std::env::var("ProgramFiles")`), "Program Files on Windows");
    assert(read("src", "dialogs", "AppDialogs.tsx").includes("window.mgm.pickFile(isBuiltinMergeTool(current) ? \"\" : current)"), "Preferences passes the current tool");
  });

  add("Terminal", "Terminal tab controls are large, always shown with the terminal, coloured per theme mode", async () => {
    const css = read("src", "terminalTabs.css");
    assert(/:root \{[^}]*--term-step-bg/.test(css) && /:root\[data-mode="dark"\] \{[^}]*--term-step-bg/.test(css), "separate light and dark colours");
    assert(/\.terminal-tab-close svg \{ width: 16px; height: 16px;/.test(css), "a 16px close cross");
    assert(/button\.terminal-step svg \{\s*width: 14px;/.test(css), "14px arrows");
  });

  add("Terminal", "The terminal draws powerline glyphs with the WebGL renderer", async () => {
    const pane = read("src", "TerminalPane.tsx");
    assert(pane.includes(`import { WebglAddon } from "@xterm/addon-webgl";`) && pane.includes("terminal.loadAddon(webgl);"), "WebGL renderer loaded");
    assert(pane.includes("webgl.onContextLoss(() => webgl.dispose());"), "falls back when the GPU context is lost");
  });

  add("Window", "The error popup is sized to its content (no gap above the buttons)", async () => {
    const specs = read("src", "dialogSpecs.ts");
    assert(specs.includes("error: { width: 660, height: 260 },"), "not a fixed-size window");
    assert(read("src", "dialogs", "AppDialogs.tsx").includes("rows={Math.min(14, Math.max(3,"), "the detail box has as many rows as the text");
    const block = /\.error-detail \{[^}]*\}/.exec(read("src", "styles.css"))?.[0] ?? "";
    assert(/min-height: 0/.test(block) && /max-height: 320px/.test(block) && !/vh/.test(block), "no fixed minimum, a pixel cap");
  });

  add("Window", "The resize grip is large and high-contrast in light and dark themes", async () => {
    const css = read("src", "styles.css");
    assert(css.includes(":root { --grip-color: #4b5563; }") && css.includes(`:root[data-mode="dark"] { --grip-color: #cbd5e1; }`), "grip colours per mode");
    assert(css.includes(".resize-grip svg { display: block; width: 16px; height: 16px; }"), "16px grip");
  });

  add("Diff", "Double-clicking a changed file opens the configured diff tool directly", async () => {
    const app = read("src", "App.tsx");
    assert(/onDoubleClick=\{\(\) => \{\s*if \(selectedSha\) openDiffTool\(selectedSha, file\.path\);/.test(app), "double-click → openDiffTool");
    assert(/if \(usesBuiltinMerge\(settings\?\.externalDiffToolPath\)\) openBuiltinDiff\(sha, file\);\s*else openExternalDiff\(sha, file\);/.test(app), "external tool when one is set, built-in otherwise");
  });

  add("Terminal", "PowerShell gets its prompt hook without -EncodedCommand (blocked as error 5 in the release build)", async () => {
    const hook = read("core", "promptHook.ts");
    assert(!hook.includes(`"-EncodedCommand",`), "no encoded command");
    assert(hook.includes(`"-Command", "Invoke-Expression $env:MGM_PROMPT_HOOK"`) && hook.includes("MGM_PROMPT_HOOK: script"), "the script travels in an environment variable");
  });

  add("Diff", "Row colours reach the end of long lines in the Diff and Merge windows", async () => {
    const css = read("src", "styles.css");
    const pane = /\.side-pane-scroll \{[^}]*\}/.exec(css)?.[0] ?? "";
    const lines = /\.code-lines \{[^}]*\}/.exec(css)?.[0] ?? "";
    // minmax(100%, max-content) looked right but stayed at the pane width.
    assert(pane.includes("grid-template-columns: minmax(max-content, 1fr);"), "diff rows as wide as the longest line");
    assert(lines.includes("grid-template-columns: minmax(max-content, 1fr);") && lines.includes("overflow-x: auto;"), "merge rows too");
  });

  add("Diff", "Prev / Next difference reach every block, even a lone one, and centre it", async () => {
    const tools = read("src", "BuiltinTools.tsx");
    assert(tools.includes("const [block, setBlock] = useState(-1);"), "Next starts at the first difference, not the second");
    assert(!tools.includes("blocks.length < 2"), "a single difference is still jumped to");
    const scroll = tools.slice(tools.indexOf("const scrollToRow = "), tools.indexOf("const jump = "));
    assert(scroll.includes("getBoundingClientRect") && !scroll.includes(".offsetTop"),"measured against the pane, not offsetTop's outer ancestor");
    assert(tools.includes(`" current" : ""`) && read("src", "styles.css").includes(".side-line.current {"), "the current difference is marked");
  });

  add("Guide", "The guide follows the main window's language when opened and when it changes", async () => {
    const guide = read("src", "GuideWindow.tsx");
    assert(guide.includes("useState<Lang | null>(null)") && !guide.includes("LANGUAGE_KEY"), "no remembered guide language overriding the app's");
    const follow = guide.slice(guide.indexOf("if (!appLanguage) return;"), guide.indexOf("}, [appLanguage]);"));
    assert(follow.includes("setChosen(null);"), "follows the app's language changes");
    const reopen = guide.slice(guide.indexOf("window.mgm?.onGuideSection?.((id) => {"), guide.indexOf("}), [jump]);"));
    assert(reopen.includes("setChosen(null);"), "resets on every open");
    assert(read("src-tauri", "src", "popups.rs").includes(`app.emit_to(GUIDE, "guide:section", section.unwrap_or_default());`), "the shell announces every open");
  });

  add("Guide", "The guide's language button names the language it switches to", async () => {
    const guide = read("src", "GuideWindow.tsx");
    assert(guide.includes(`<Flag country={language === "ko" ? "gb" : "kr"} />`), "the other language's flag");
  });

  add("Menus", "Dismissing a menu window tells its opener, matched by openId", async () => {
    const popups = read("src-tauri", "src", "popups.rs");
    assert(/pub fn hide_menu\(app: &AppHandle\) \{\s*if let Some\(\(opener, open_id\)\) = take_menu\(app\) \{\s*let _ = app\.emit_to\(opener\.as_str\(\), "menu:chosen", json!\(\{ "openId": open_id, "id": Value::Null \}\)\);/.test(popups),
      "Escape / blur / close resolve the opener's openMenu with null");
    assert(popups.includes(`json!({ "openId": open_id, "id": command_id })`), "a choice carries the openId too");
    const host = read("src", "host.ts");
    assert(host.includes("else if (answer.openId === openId) finish(answer.id ?? null);"), "answers for an older menu are ignored");
  });

  add("Menus", "A stale close or size for a replaced menu cannot empty or show the new one", async () => {
    const popups = read("src-tauri", "src", "popups.rs");
    assert(popups.includes("pub async fn menu_close(app: AppHandle, open_id: Option<u64>)") && popups.includes("open_id.map_or(true, |id| id == 0 || id == current)"), "menu_close only closes the menu it names");
    assert(popups.includes(`if open_id.is_some_and(|id| Some(id) != message["openId"].as_u64()) {`), "menu_size ignores sizes measured for an older payload");
    const host = read("src", "host.ts");
    const open = host.slice(host.indexOf("export function openMenu("), host.indexOf("export function closeMenu("));
    assert(!/\n\s*closeMenu\(\);/.test(open), "opening a menu does not send a separate close (it raced the open)");
    assert(read("src", "popupWindow.tsx").includes("openId: message.openId }).catch"), "the menu window reports its size with the openId it rendered");
  });

  add("Theme", "Windows opened or reused later take the current theme", async () => {
    const popup = read("src", "popupWindow.tsx");
    assert(popup.includes("export function usePopupSettings(openId = 0)") && popup.includes("}, [openId]);"), "pooled popups re-read settings for every open");
    assert(popup.includes("usePopupSettings(message?.openId ?? 0)"), "menu and dialog windows pass their openId");
    const main = read("src", "main.tsx");
    assert(main.includes("function followSettings()") && main.includes(`if (route.kind === "guide") followSettings();`) && main.includes("if (readToolRequest()) followSettings();"), "guide and tool windows follow theme changes");
    assert(read("src-tauri", "src", "popups.rs").includes(`labels.extend(["tool-diff".to_string(), "tool-merge".to_string()]);`), "tool windows are recoloured natively too");
  });
}
