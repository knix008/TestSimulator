import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readProject(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

describe("Installer", () => {
  it("writes Korean or English from the Windows language selector", () => {
    const hooks = readProject("src-tauri/windows/hooks.nsh");
    const config = readProject("src-tauri/tauri.conf.json");
    expect(hooks).toContain("$LANGUAGE = 1042");
    expect(hooks).toContain('FileWrite $0 "ko');
    expect(hooks).toContain('FileWrite $0 "en');
    expect(hooks).toContain("install-language.txt");
    expect(config).toContain('"displayLanguageSelector": true');
    expect(config).toContain("Korean");
    expect(config).toContain("English");
  });

  it("asks Linux and macOS installers to choose Korean or English", () => {
    for (const path of ["installer/linux/install.sh", "installer/macos/install.command"]) {
      const script = readProject(path);
      expect(script).toContain("1) English");
      expect(script).toContain("2) 한국어");
      expect(script).toMatch(/2\|ko\|KO\|한국어\) LANG_CODE="ko"/);
      expect(script).toMatch(/1\|en\|EN\|English\) LANG_CODE="en"/);
      expect(script).toContain("install-language.txt");
    }
    expect(readProject("installer/linux/install.sh")).toContain(".config/my-calendar");
    expect(readProject("installer/macos/install.command")).toContain("Library/Application Support/com.mycalendar.multios");
  });

  it("reads the same install-language file on Windows, Linux, and macOS", () => {
    const rust = readProject("src-tauri/src/lib.rs");
    expect(rust).toContain("install-language.txt");
    expect(rust).toContain("AppData/Roaming/com.mycalendar.multios/install-language.txt");
    expect(rust).toContain(".config/my-calendar/install-language.txt");
    expect(rust).toContain("Library/Application Support/com.mycalendar.multios/install-language.txt");
    expect(rust).toContain('value.starts_with("ko")');
    expect(rust).toContain('value.starts_with("en")');
  });
});
