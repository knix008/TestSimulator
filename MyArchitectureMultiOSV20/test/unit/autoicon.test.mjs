// Every text button gets an icon picked from its label (src/ui/autoicon.js).
import test from "node:test";
import assert from "node:assert/strict";
import { iconForLabel, iconForTab } from "../../src/ui/autoicon.js";
import { KO } from "../../src/ui/i18n-ko.js";
import { ICON_NAMES } from "../../src/ui/icons.js";
const ICONS = Object.fromEntries(ICON_NAMES.map((n) => [n, true]));

test("common button labels get a fitting icon in both languages", () => {
  const want = { "Delete": "trash", "Cancel": "close", "OK": "check", "Apply to the selection": "check", "Duplicate": "copy", "Rotate": "rotate", "Mirror": "mirror",
    "Group": "group", "Scale…": "scale", "Reset to defaults": "refresh", "Show in 3D": "cube", "Edit component": "wand", "Select instances": "select", "Site location…": "globe" };
  for (const [en, ic] of Object.entries(want)) {
    assert.equal(iconForLabel(en), ic, en);
    if (KO[en]) assert.equal(iconForLabel(KO[en]), ic, `${en} → ${KO[en]}`);
  }
});

test("tabs get their own icon, also when two keys share a Korean word", () => {
  assert.equal(iconForTab("General"), "settings");
  assert.equal(iconForTab(KO["Appearance"]), "palette");
  assert.equal(iconForTab(KO["Units & grid"]), "ruler");
});

test("every icon the rules can pick exists", async () => {
  const src = (await import("node:fs")).readFileSync(new URL("../../src/ui/autoicon.js", import.meta.url), "utf8");
  const names = new Set([...src.matchAll(/"([a-zA-Z0-9]+)"\]/g)].map((m) => m[1]).concat([...src.matchAll(/: "([a-zA-Z0-9]+)"/g)].map((m) => m[1])));
  for (const n of names) assert.ok(ICONS[n], `icon ${n}`);
});
