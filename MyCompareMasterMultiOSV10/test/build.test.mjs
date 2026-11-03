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
import { installersIn } from "../scripts/copy-installer.mjs";

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

test("icons › every icon the program uses lives in assets/", () => {
  for (const file of ["icon.png", "icon.ico", "icon.icns", "document.png", "document.ico"]) {
    assert.ok(fs.existsSync(path.join(root, "assets", file)), `missing assets/${file}`);
  }
  for (const size of [16, 24, 32, 48, 64, 128, 256, 512]) {
    assert.ok(fs.existsSync(path.join(root, "assets", "icons", `${size}x${size}.png`)), `missing ${size}px`);
  }
  assert.ok(fs.existsSync(path.join(root, "assets", "icons", "128x128@2x.png")));
  // Nothing is left in the old places.
  for (const old of ["build", "public"]) assert.ok(!fs.existsSync(path.join(root, old)), `${old}/ should be gone`);
});

test("icons › the .icns holds the macOS sizes as PNG", () => {
  const icns = read("assets/icon.icns");
  assert.equal(icns.toString("ascii", 0, 4), "icns");
  assert.equal(icns.readUInt32BE(4), icns.length);
  for (const type of ["ic07", "ic08", "ic09", "ic10"]) assert.ok(icns.includes(Buffer.from(type)), `missing ${type}`);
});

test("icons › the .ico carries every size Windows asks for", () => {
  const ico = read("assets/icon.ico");
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
  const fromIco = read("assets/icon.ico");
  const png256 = read("assets/icons/256x256.png");
  assert.ok(fromIco.includes(png256), "the 256px app icon is embedded in icon.ico");
  assert.deepEqual(read("assets/icons/128x128@2x.png"), png256, "the bundle's @2x icon is the same image");
  assert.ok(read("assets/icon.icns").includes(png256), "the macOS icon carries the same image");
});

test("icons › the app icon's border is fully transparent", () => {
  const icon = decodePng(read("assets/icons/256x256.png"));
  for (const [x, y] of [[0, 0], [255, 0], [0, 255], [255, 255], [2, 2], [253, 253]]) {
    assert.equal(icon.at(x, y).a, 0, `corner (${x}, ${y}) is not transparent`);
  }
  assert.ok(icon.at(128, 128).a > 250, "the middle is opaque");
});

test("icons › the app icon is lit from the top-left", () => {
  const icon = decodePng(read("assets/icons/256x256.png"));
  // Compare the same inset point on each diagonal of the slab, away from the mark.
  const topLeft = brightness(icon.at(46, 40));
  const bottomRight = brightness(icon.at(214, 214));
  assert.ok(
    topLeft > bottomRight + 25,
    `top-left ${topLeft.toFixed(1)} is not clearly brighter than bottom-right ${bottomRight.toFixed(1)}`,
  );
});

test("icons › the app icon carries both arrows: compare across, merge down", () => {
  const icon = decodePng(read("assets/icons/256x256.png"));
  // The two-way arrow lies between the columns, across their middle; the slab just
  // above it is the control, so this cannot pass on a generally pale icon.
  const across = brightness(icon.at(128, 104));
  const slab = brightness(icon.at(128, 70));
  assert.ok(across > 200, `nothing bright between the columns (${across.toFixed(1)})`);
  assert.ok(across > slab + 100, `the two-way arrow does not stand out (${across.toFixed(1)} vs ${slab.toFixed(1)})`);
  // Both heads, not one: a single-headed arrow would leave one of these dark.
  assert.ok(brightness(icon.at(106, 104)) > 200, "the left head is missing");
  assert.ok(brightness(icon.at(150, 104)) > 200, "the right head is missing");
  // And the merge arrow still runs down into the point below them.
  const merge = icon.at(128, 200);
  assert.ok(merge.r > 200 && merge.g > 150 && merge.b < 110, `the merge arrow is not yellow (${JSON.stringify(merge)})`);
});

test("icons › the app icon's edge is lit on one side and shaded on the other", () => {
  // A slab with a thickness, rather than a flat shape: the top edge catches the
  // lamp and the bottom falls away. An even rim all round would fail this.
  const icon = decodePng(read("assets/icons/256x256.png"));
  const topEdge = brightness(icon.at(128, 20));
  const bottomEdge = brightness(icon.at(128, 236));
  const middle = brightness(icon.at(96, 128));
  assert.ok(topEdge > middle + 15, `the top edge (${topEdge.toFixed(1)}) is not lit against ${middle.toFixed(1)}`);
  assert.ok(bottomEdge < middle - 15, `the bottom edge (${bottomEdge.toFixed(1)}) is not shaded against ${middle.toFixed(1)}`);
});

test("icons › the app icon has depth rather than one flat colour", () => {
  const icon = decodePng(read("assets/icons/256x256.png"));
  const samples = [];
  for (let y = 30; y < 230; y += 10) for (let x = 30; x < 230; x += 10) samples.push(brightness(icon.at(x, y)));
  const spread = Math.max(...samples) - Math.min(...samples);
  assert.ok(spread > 60, `the icon is nearly flat (brightness spread ${spread.toFixed(1)})`);
});

test("icons › the document icon is a different image from the app icon", () => {
  assert.notDeepEqual(read("assets/document.ico"), read("assets/icon.ico"));
  const document = decodePng(read("assets/document.png"));
  assert.equal(document.at(4, 4).a, 0, "the page floats on transparency");
  assert.ok(document.at(256, 256).a > 250, "the page itself is opaque");
});

/* ------------------------------------------------------- the installer */

const conf = () => JSON.parse(readText("src-tauri/tauri.conf.json"));
const hooks = () => readText("src-tauri/windows/hooks.nsh");

test("installer › the .dmrg file gets the document icon", () => {
  const nsh = hooks();
  assert.match(nsh, /!macro NSIS_HOOK_POSTINSTALL/);
  assert.ok(nsh.includes('DefaultIcon" "" "$INSTDIR\\document.ico"'));
  const [association] = conf().bundle.fileAssociations;
  // The hook writes under the class Tauri names after the association.
  assert.ok(nsh.includes(`!define MCM_DOC_CLASS "${association.name}"`));
  assert.equal(conf().bundle.resources["../assets/document.ico"], "document.ico");
});

test("installer › uninstalling asks before deleting the user's data", () => {
  const nsh = hooks();
  assert.match(nsh, /!macro NSIS_HOOK_POSTUNINSTALL/);
  assert.match(nsh, /MB_YESNO/);
  assert.ok(nsh.includes('RMDir /r "$APPDATA\\${MCM_DATA_FOLDER}"'));
  assert.ok(nsh.includes("${IfNot} ${Silent}"), "a silent upgrade must not prompt");
  // The folder core/settingsStore.ts writes to.
  assert.ok(nsh.includes('!define MCM_DATA_FOLDER "MyCompareMaster"'));
});

test("installer › the prompt exists in Korean and English", () => {
  const nsh = hooks();
  assert.equal(read("src-tauri/windows/hooks.nsh").subarray(0, 3).toString("hex"), "efbbbf", "UTF-8 BOM, or NSIS garbles the Korean");
  assert.ok(nsh.includes("$LANGUAGE = 1042"));
  assert.ok(nsh.includes("삭제하시겠습니까"), "Korean data prompt");
  assert.ok(nsh.includes("Delete them as well?"), "English data prompt");
});

test("installer › the language picked on its first page becomes the app's language", () => {
  const nsh = hooks();
  // Asked on every interactive install, not only the first one.
  assert.match(nsh, /^!define MUI_LANGDLL_ALWAYSSHOW\r?$/m);
  // The file core/settingsStore.ts reads, applies and deletes on the next start.
  const store = readText("core/settingsStore.ts");
  const [, file] = store.match(/export const INSTALL_LANGUAGE_FILE = "([^"]+)"/);
  assert.ok(nsh.includes(`!define MCM_INSTALL_LANGUAGE_FILE "${file}"`));
  assert.ok(nsh.includes('FileOpen $0 "$APPDATA\\${MCM_DATA_FOLDER}\\${MCM_INSTALL_LANGUAGE_FILE}" w'));
  assert.ok(nsh.includes('FileWrite $0 "ko"') && nsh.includes('FileWrite $0 "en"'));
  // An upgrade runs silently and must keep the language the user chose in the app.
  const postInstall = nsh.slice(nsh.indexOf("!macro NSIS_HOOK_POSTINSTALL"), nsh.indexOf("!macroend"));
  assert.ok(postInstall.indexOf("${IfNot} ${Silent}") < postInstall.indexOf("FileOpen"));
});

test("installer › only installers are copied to the project root", () => {
  assert.deepEqual(
    installersIn(["My Compare Master_1.0.0_x64-setup.exe", "uninstall.exe", "notes.txt", "x.msi", "a.AppImage"]),
    ["My Compare Master_1.0.0_x64-setup.exe", "x.msi", "a.AppImage"],
  );
});

/* --------------------------------------------------------- packaging */

test("packaging › the installer offers Korean and English", () => {
  const nsis = conf().bundle.windows.nsis;
  assert.equal(nsis.displayLanguageSelector, true);
  assert.deepEqual(nsis.languages, ["Korean", "English"]);
  assert.equal(nsis.installerHooks, "windows/hooks.nsh");
});

test("packaging › the bundle and installer icons come from assets/", () => {
  const bundle = conf().bundle;
  for (const icon of bundle.icon) {
    assert.ok(icon.startsWith("../assets/"), icon);
    assert.ok(fs.existsSync(path.join(root, "src-tauri", icon)), `missing ${icon}`);
  }
  assert.equal(bundle.windows.nsis.installerIcon, "../assets/icon.ico");
});

test("packaging › the .dmrg document type is registered", () => {
  const [association] = conf().bundle.fileAssociations;
  assert.deepEqual(association.ext, ["dmrg"]);
  assert.equal(association.mimeType, "application/x-mycomparemaster-session");
});

test("packaging › every desktop platform has a target", () => {
  for (const target of ["nsis", "dmg", "appimage", "deb"]) assert.ok(conf().bundle.targets.includes(target), target);
});

test("packaging › the installed app carries its own Node and core", () => {
  assert.equal(conf().bundle.resources["runtime/"], "runtime/");
  const stage = readText("scripts/stage-runtime.mjs");
  for (const piece of ["desktop.cjs", "dist", "process.execPath"]) assert.ok(stage.includes(piece), piece);
  assert.match(readText("scripts/tauri-before-build.mjs"), /stage-runtime\.mjs/);
});

test("packaging › no Electron is left", () => {
  const pkg = JSON.parse(readText("package.json"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  assert.ok(!("electron" in deps) && !("electron-builder" in deps));
  assert.ok(!pkg.main, "no Electron main entry");
  for (const gone of ["electron", "electron-builder.yml"]) assert.ok(!fs.existsSync(path.join(root, gone)), `${gone} should be gone`);
});

test("packaging › npm scripts do not rely on PATH-resolved binaries", () => {
  // Every tool is launched by its script path, so no shell PATH lookup can pick a
  // different copy (or trip over a folder name with "&" in it).
  const scripts = JSON.parse(readText("package.json")).scripts;
  for (const [name, command] of Object.entries(scripts)) {
    assert.ok(!/(^|&&\s*)(vite|tsc|tauri)\b/.test(command), `${name} calls a bare binary: ${command}`);
  }
  assert.match(scripts.typecheck, /node_modules\/typescript\/bin\/tsc/);
  assert.match(scripts["build:ui"], /node_modules\/vite\/bin\/vite\.js/);
  assert.match(scripts["build:win"], /node_modules\/@tauri-apps\/cli\/tauri\.js build/);
});

test("packaging › the built UI and server exist after a build", () => {
  assert.ok(fs.existsSync(path.join(root, "dist", "index.html")), "run `npm run build` first");
  for (const name of ["index.cjs", "cli.mjs", "desktop.cjs"]) {
    assert.ok(fs.existsSync(path.join(root, "dist-server", name)), name);
  }
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
