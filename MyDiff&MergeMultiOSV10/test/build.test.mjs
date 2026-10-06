/**
 * The things that are only true of a built, packaged app: the icons, the installer
 * script and the packaging configuration.
 *
 * The icon tests decode the real PNG and look at its pixels, because "transparent
 * outside, lit at the top-left" is a visual requirement that a file-exists check
 * would pass while the icon was a black square.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import zlib from "node:zlib";
import { INSTALLER, chooseInstaller } from "../scripts/copy-installer.mjs";

const root = path.resolve(".");
const read = (relative) => fs.readFileSync(path.join(root, relative));
const readText = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

/* --------------------------------------------------- a tiny PNG reader */

/** Decodes a non-interlaced 8-bit RGBA PNG — which is all this project writes. */
function decodePng(buffer) {
  assert.deepEqual(
    [...buffer.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    "PNG signature",
  );
  let offset = 8;
  let width = 0;
  let height = 0;
  const parts = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      assert.equal(body[8], 8, "bit depth");
      assert.equal(body[9], 6, "colour type RGBA");
      assert.equal(body[12], 0, "not interlaced");
    } else if (type === "IDAT") {
      parts.push(body);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }

  const raw = zlib.inflateSync(Buffer.concat(parts));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = x >= 4 && y > 0 ? pixels[(y - 1) * stride + x - 4] : 0;
      let value = line[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += Math.floor((left + up) / 2);
      else if (filter === 4) value += paeth(left, up, upLeft);
      pixels[y * stride + x] = value & 0xff;
    }
  }
  const at = (x, y) => {
    const index = y * stride + x * 4;
    return { r: pixels[index], g: pixels[index + 1], b: pixels[index + 2], a: pixels[index + 3] };
  };
  return { width, height, at };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

const brightness = ({ r, g, b }) => (r * 0.2126 + g * 0.7152 + b * 0.0722);

/* ----------------------------------------------------------- the icons */

test("icons › every file the installers need exists", () => {
  for (const file of ["build/icon.ico", "build/icon.png", "build/document.ico", "build/document.png"]) {
    assert.ok(fs.existsSync(path.join(root, file)), `missing ${file}`);
  }
  for (const size of [16, 24, 32, 48, 64, 128, 256, 512]) {
    assert.ok(fs.existsSync(path.join(root, "build", "icons", `${size}x${size}.png`)), `missing ${size}px`);
  }
  assert.ok(fs.existsSync(path.join(root, "public", "icon.png")), "the web build's icon");
});

test("icons › the .ico carries every size Windows asks for", () => {
  const ico = read("build/icon.ico");
  assert.equal(ico.readUInt16LE(0), 0, "reserved");
  assert.equal(ico.readUInt16LE(2), 1, "type: icon");
  const count = ico.readUInt16LE(4);
  assert.equal(count, 7);
  const sizes = [];
  for (let index = 0; index < count; index++) {
    const at = 6 + index * 16;
    sizes.push(ico[at] === 0 ? 256 : ico[at]);
  }
  assert.deepEqual(sizes, [16, 24, 32, 48, 64, 128, 256]);
});

test("icons › the window, the installer and the file all use the same app icon", () => {
  // Identical bytes at the shared size is the only check that cannot drift.
  const fromIco = read("build/icon.ico");
  const png256 = read("build/icons/256x256.png");
  assert.ok(fromIco.includes(png256), "the 256px app icon is embedded in icon.ico");
  assert.deepEqual(read("public/icon.png"), png256, "the web build uses the same image");
});

test("icons › the app icon's border is fully transparent", () => {
  const icon = decodePng(read("build/icons/256x256.png"));
  for (const [x, y] of [[0, 0], [255, 0], [0, 255], [255, 255], [2, 2], [253, 253]]) {
    assert.equal(icon.at(x, y).a, 0, `corner (${x}, ${y}) is not transparent`);
  }
  assert.ok(icon.at(128, 128).a > 250, "the middle is opaque");
});

test("icons › the app icon is lit from the top-left", () => {
  const icon = decodePng(read("build/icons/256x256.png"));
  // Compare the same inset point on each diagonal of the slab, away from the mark.
  const topLeft = brightness(icon.at(46, 40));
  const bottomRight = brightness(icon.at(214, 214));
  assert.ok(
    topLeft > bottomRight + 25,
    `top-left ${topLeft.toFixed(1)} is not clearly brighter than bottom-right ${bottomRight.toFixed(1)}`,
  );
});

test("icons › the app icon has depth rather than one flat colour", () => {
  const icon = decodePng(read("build/icons/256x256.png"));
  const samples = [];
  for (let y = 30; y < 230; y += 10) for (let x = 30; x < 230; x += 10) samples.push(brightness(icon.at(x, y)));
  const spread = Math.max(...samples) - Math.min(...samples);
  assert.ok(spread > 60, `the icon is nearly flat (brightness spread ${spread.toFixed(1)})`);
});

test("icons › the document icon is a different image from the app icon", () => {
  assert.notDeepEqual(read("build/document.ico"), read("build/icon.ico"));
  const document = decodePng(read("build/document.png"));
  assert.equal(document.at(4, 4).a, 0, "the page floats on transparency");
  assert.ok(document.at(256, 256).a > 250, "the page itself is opaque");
});

/* ------------------------------------------------------- the installer */

test("installer › a previous installation is removed before installing", () => {
  const nsh = readText("build/installer.nsh");
  assert.match(nsh, /!macro customInit/);
  assert.match(nsh, /UninstallString/);
  assert.match(nsh, /ExecWait/);
  assert.match(nsh, /RMDir \/r "\$INSTDIR"/);
});

test("installer › uninstalling asks before deleting the user's data", () => {
  const nsh = readText("build/installer.nsh");
  assert.match(nsh, /!macro customUnInstall/);
  assert.match(nsh, /MB_YESNO/);
  assert.match(nsh, /RMDir \/r "\$MDM_DataDir"/);
  assert.match(nsh, /\$\{IfNot\} \$\{Silent\}/, "a silent upgrade must not prompt");
});

test("installer › both prompts exist in Korean and English", () => {
  const nsh = readText("build/installer.nsh");
  assert.match(nsh, /\$LANGUAGE == 1042/, "Korean is chosen by language id");
  assert.ok(nsh.includes("이전 버전이 설치되어"), "Korean upgrade prompt");
  assert.ok(nsh.includes("A previous version is installed"), "English upgrade prompt");
  assert.ok(nsh.includes("삭제하시겠습니까"), "Korean data prompt");
  assert.ok(nsh.includes("Delete them as well?"), "English data prompt");
});

/*
 * What `npm run installer` copies to the project root. electron-builder fills
 * release/ with more .exe files than the one a person wants handed to them, and
 * two of them look a lot like the installer.
 */

test("installer › the uninstaller is never mistaken for the installer", () => {
  // Written in this order by a real build: the uninstaller comes first, and it
  // carries the architecture in its name too, so ranking on "matches this arch,
  // then newest" alone could pick either one.
  const release = [
    { name: "MyDiffMerge-1.0.0-win-x64.__uninstaller.exe", mtimeMs: 2_000 },
    { name: "MyDiffMerge-1.0.0-win-x64.exe", mtimeMs: 1_000 },
    { name: "MyDiffMerge-1.0.0-win-x64.exe.blockmap", mtimeMs: 3_000 },
  ];
  assert.equal(chooseInstaller(release, "x64", ".exe"), "MyDiffMerge-1.0.0-win-x64.exe");
});

test("installer › a portable build is not offered as the installer", () => {
  const release = [
    { name: "MyDiffMerge-1.0.0-win-x64-portable.exe", mtimeMs: 2_000 },
    { name: "MyDiffMerge-1.0.0-win-x64.exe", mtimeMs: 1_000 },
  ];
  assert.equal(chooseInstaller(release, "x64", ".exe"), "MyDiffMerge-1.0.0-win-x64.exe");
  // With nothing else to copy, there is no installer rather than a portable one.
  assert.equal(chooseInstaller(release.slice(0, 1), "x64", ".exe"), null);
});

test("installer › this machine's architecture wins over a newer one", () => {
  const release = [
    { name: "MyDiffMerge-1.0.0-win-arm64.exe", mtimeMs: 9_000 },
    { name: "MyDiffMerge-1.0.0-win-x64.exe", mtimeMs: 1_000 },
  ];
  assert.equal(chooseInstaller(release, "x64", ".exe"), "MyDiffMerge-1.0.0-win-x64.exe");
  assert.equal(chooseInstaller(release, "arm64", ".exe"), "MyDiffMerge-1.0.0-win-arm64.exe");
  // An installer that names no architecture still answers for any machine.
  const universal = [{ name: "My Diff & Merge-1.0.0.dmg", mtimeMs: 1 }];
  assert.equal(chooseInstaller(universal, "arm64", ".dmg"), "My Diff & Merge-1.0.0.dmg");
});

test("installer › each desktop platform's installer extension is the one it ships", () => {
  assert.deepEqual(INSTALLER, { win32: ".exe", darwin: ".dmg", linux: ".AppImage" });
  // The zip/deb/rpm/tar.gz targets are archives, not something to double-click.
  const linux = [
    { name: "MyDiffMerge-1.0.0-linux-x64.tar.gz", mtimeMs: 3_000 },
    { name: "MyDiffMerge-1.0.0-linux-x64.AppImage", mtimeMs: 1_000 },
  ];
  assert.equal(chooseInstaller(linux, "x64", ".AppImage"), "MyDiffMerge-1.0.0-linux-x64.AppImage");
});

/* --------------------------------------------------------- packaging */

test("packaging › the installer offers Korean and English", () => {
  const yml = readText("electron-builder.yml");
  assert.match(yml, /installerLanguages:/);
  assert.match(yml, /- en_US/);
  assert.match(yml, /- ko_KR/);
  assert.match(yml, /multiLanguageInstaller: true/);
  assert.match(yml, /displayLanguageSelector: true/);
});

test("packaging › the app, installer and uninstaller share one icon", () => {
  const yml = readText("electron-builder.yml");
  assert.match(yml, /icon: build\/icon\.ico/);
  assert.match(yml, /installerIcon: build\/icon\.ico/);
  assert.match(yml, /uninstallerIcon: build\/icon\.ico/);
  assert.match(yml, /installerHeaderIcon: build\/icon\.ico/);
});

test("packaging › the .dmrg document type is registered with its own icon", () => {
  const yml = readText("electron-builder.yml");
  assert.match(yml, /fileAssociations:/);
  assert.match(yml, /ext: dmrg/);
  assert.match(yml, /icon: build\/document\.ico/);
  assert.match(yml, /mimeType: application\/x-mydiffmerge-session/);
});

test("packaging › every desktop platform has a target", () => {
  const yml = readText("electron-builder.yml");
  for (const target of ["nsis", "portable", "dmg", "zip", "AppImage", "deb", "rpm", "tar.gz"]) {
    assert.ok(yml.includes(`target: ${target}`), `missing target ${target}`);
  }
});

test("packaging › the custom installer script is included", () => {
  assert.match(readText("electron-builder.yml"), /include: build\/installer\.nsh/);
});

test("packaging › npm scripts do not rely on PATH-resolved binaries", () => {
  // The project folder contains "&", which Windows' shell splits a PATH entry on;
  // every tool is therefore launched by its script path instead of its bin name.
  const scripts = JSON.parse(readText("package.json")).scripts;
  for (const [name, command] of Object.entries(scripts)) {
    assert.ok(
      !/(^|&&\s*)(vite|tsc|electron-builder|electron)\b/.test(command),
      `${name} calls a bare binary: ${command}`,
    );
  }
  assert.match(scripts.typecheck, /node_modules\/typescript\/bin\/tsc/);
  assert.match(scripts["build:ui"], /node_modules\/vite\/bin\/vite\.js/);
});

test("packaging › the built UI and server exist after a build", () => {
  assert.ok(fs.existsSync(path.join(root, "dist", "index.html")), "run `npm run build` first");
  assert.ok(fs.existsSync(path.join(root, "dist-server", "index.cjs")));
  assert.ok(fs.existsSync(path.join(root, "dist-server", "cli.mjs")));
});

test("packaging › the shipped bundle has no Node built-ins stubbed into it", () => {
  const assets = fs.readdirSync(path.join(root, "dist", "assets")).filter((name) => name.endsWith(".js"));
  assert.ok(assets.length > 0);
  for (const name of assets) {
    const text = fs.readFileSync(path.join(root, "dist", "assets", name), "utf8");
    assert.ok(
      !text.includes("__vite-browser-external"),
      `${name} contains a stubbed Node built-in; a node: import leaked into the renderer`,
    );
  }
});
