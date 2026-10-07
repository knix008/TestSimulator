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

  it("removes an existing Windows install first and asks before deleting user data", () => {
    const hooks = readProject("src-tauri/windows/hooks.nsh");
    const config = JSON.parse(readProject("src-tauri/tauri.conf.json"));
    const cargoName = /^name\s*=\s*"([^"]+)"/m.exec(readProject("src-tauri/Cargo.toml"))?.[1];
    // The hook spells these out because Tauri defines them after including it.
    expect(hooks).toContain(`!define MC_UNINSTKEY "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${config.productName}"`);
    expect(hooks).toContain(`!define MC_BUNDLEID "${config.identifier}"`);
    expect(hooks).toContain(`!define MC_MAINBINARY "${cargoName}.exe"`);
    // Korean text needs the BOM: NSIS reads files without one in the ANSI code page.
    expect(hooks.charCodeAt(0)).toBe(0xfeff);

    expect(hooks).toContain("Page custom MC_PageRemovePrevious");
    expect(hooks).toContain('${GetOptions} $R0 "/UPDATE" $R1');
    expect(hooks).toContain("MB_YESNOCANCEL|MB_ICONQUESTION|MB_DEFBUTTON2");
    expect(hooks).toContain("사용자 데이터도 삭제할까요?");
    expect(hooks).toContain("delete your user data");
    expect(hooks).toContain(`ExecWait '"$R2" /S _?=$R3' $R4`);
    expect(hooks).toMatch(/\$\{If\} \$R6 = 1[\s\S]*RMDir \/r "\$APPDATA\\\$\{MC_BUNDLEID\}"[\s\S]*RMDir \/r "\$LOCALAPPDATA\\\$\{MC_BUNDLEID\}"/);
    expect(hooks).toMatch(/!macro NSIS_HOOK_PREINSTALL[\s\S]*\$\{If\} \$\{Silent\}[\s\S]*Call MC_UninstallPrevious/);
    expect(hooks).toMatch(/!macro NSIS_HOOK_POSTUNINSTALL[\s\S]*Delete "\$INSTDIR\\install-language.txt"/);
  });

  it("removes an existing Linux or macOS install first and asks before deleting user data", () => {
    const linux = readProject("installer/linux/install.sh");
    const mac = readProject("installer/macos/install.command");
    for (const script of [linux, mac]) {
      expect(script).toContain("사용자 데이터도 삭제할까요? [y/N]");
      expect(script).toContain("delete your user data");
      expect(script).toContain("pkill -x my-calendar");
      expect(script).toMatch(/y\|Y\|yes\|YES\|예\|네\)\s+rm -rf "\$\{DATA_DIRS\[@\]\}"/);
      // Data goes before the new language file is written into the same folder.
      expect(script.indexOf('rm -rf "${DATA_DIRS[@]}"')).toBeLessThan(script.indexOf("> \"${CONFIG}/install-language.txt\""));
    }
    expect(linux).toContain("sudo dpkg --purge my-calendar");
    expect(linux).toContain("sudo rpm -e my-calendar");
    expect(linux).toContain('rm -f "$APPIMAGE"');
    expect(mac).toContain('"/Applications/My Calendar.app"');
    expect(mac).toContain("Library/WebKit/com.mycalendar.multios");
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
