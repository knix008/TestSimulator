const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const root = path.resolve(__dirname, "..");
const arch = process.argv.includes("--arm64") ? "arm64" : "x64";
const electronVersion = require("electron/package.json").version;

if (process.platform === "darwin") {
  const args = ["electron-builder", "--mac", arch === "arm64" ? "--arm64" : "--x64"];
  const result = spawnSync("npx", args, {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: process.env.CSC_IDENTITY_AUTO_DISCOVERY || "false" },
  });
  process.exit(result.status == null ? 1 : result.status);
}

function walk(rel) {
  const abs = path.join(root, rel);
  if (fs.statSync(abs).isFile()) return [rel];
  return fs.readdirSync(abs).flatMap((name) => walk(path.join(rel, name)));
}

const APP_FILES = ["index.html", ...walk("style"), ...walk("src"), ...walk("electron"), ...walk("assets")];

const HELPERS = [
  ["Electron Helper", "MyCalc Helper", "MyCalc", "local.mycalc.desktop.helper"],
  ["Electron Helper (GPU)", "MyCalc Helper (GPU)", "MyCalc Helper (GPU)", "local.mycalc.desktop.helper"],
  ["Electron Helper (Renderer)", "MyCalc Helper (Renderer)", "MyCalc Helper (Renderer)", "local.mycalc.desktop.helper"],
  ["Electron Helper (Plugin)", "MyCalc Helper (Plugin)", "MyCalc Helper (Plugin)", "local.mycalc.desktop.helper"],
  ["Electron Helper EH", "MyCalc Helper EH", "MyCalc Helper EH", "local.mycalc.desktop.helper.EH"],
  ["Electron Helper NP", "MyCalc Helper NP", "MyCalc Helper NP", "local.mycalc.desktop.helper.NP"],
];

function findEocd(buf) {
  const min = Math.max(0, buf.length - 22 - 65535);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error("ZIP 중앙 디렉터리를 찾지 못했습니다.");
}

function unzip(zipPath, dest) {
  const buf = fs.readFileSync(zipPath);
  const eocd = findEocd(buf);
  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  if (offset === 0xffffffff) throw new Error("ZIP64 아카이브는 지원하지 않습니다.");
  const links = [];
  fs.mkdirSync(dest, { recursive: true });

  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) throw new Error("ZIP 중앙 디렉터리 항목이 잘못되었습니다.");
    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const mode = buf.readUInt32LE(offset + 38) >>> 16;
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString("utf8", offset + 46, offset + 46 + nameLen);
    offset += 46 + nameLen + extraLen + commentLen;
    if (!name || name.includes("..")) throw new Error(`ZIP 경로가 잘못되었습니다: ${name}`);

    const outPath = path.join(dest, name);
    if (name.endsWith("/")) {
      fs.mkdirSync(outPath, { recursive: true });
      continue;
    }
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const data = buf.subarray(dataStart, dataStart + compressedSize);
    const bytes = method === 0 ? data : zlib.inflateRawSync(data);
    if ((mode & 0o170000) === 0o120000) {
      links.push({ outPath, target: bytes.toString("utf8") });
      continue;
    }
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, bytes);
  }
  return links;
}

function materializeLinks(rootDir, links) {
  const pending = links.slice();
  let guard = pending.length + 2;
  while (pending.length && guard-- > 0) {
    let moved = false;
    for (let i = pending.length - 1; i >= 0; i--) {
      const link = pending[i];
      const abs = path.resolve(path.dirname(link.outPath), link.target);
      const rel = path.relative(rootDir, abs);
      if (!rel || rel.startsWith("..") || path.isAbsolute(rel) || !fs.existsSync(abs)) continue;
      fs.cpSync(abs, link.outPath, { recursive: true, force: true });
      pending.splice(i, 1);
      moved = true;
    }
    if (!moved) break;
  }
  if (pending.length) {
    throw new Error(`심볼릭 링크 ${pending.length}개를 복사로 풀지 못했습니다.`);
  }
}

function setPlist(xml, values) {
  let next = xml;
  for (const [key, value] of Object.entries(values)) {
    const pattern = new RegExp(`(<key>${key}</key>\\s*<string>)[\\s\\S]*?(</string>)`);
    if (pattern.test(next)) {
      next = next.replace(pattern, `$1${value}$2`);
      continue;
    }
    const at = next.lastIndexOf("</dict>");
    next = `${next.slice(0, at)}\t<key>${key}</key>\n\t<string>${value}</string>\n${next.slice(at)}`;
  }
  return next;
}

function patchPlist(file, values) {
  if (!fs.existsSync(file)) return;
  fs.writeFileSync(file, setPlist(fs.readFileSync(file, "utf8"), values));
}

function stripPlistKey(file, key) {
  const xml = fs.readFileSync(file, "utf8");
  const token = `<key>${key}</key>`;
  const start = xml.indexOf(token);
  if (start < 0) return;
  const dictAt = xml.indexOf("<dict>", start);
  let depth = 0;
  for (let i = dictAt; i < xml.length; ) {
    if (xml.startsWith("<dict>", i)) {
      depth += 1;
      i += 6;
      continue;
    }
    if (xml.startsWith("</dict>", i)) {
      depth -= 1;
      i += 7;
      if (depth === 0) {
        fs.writeFileSync(file, xml.slice(0, start) + xml.slice(i));
        return;
      }
      continue;
    }
    i += 1;
  }
}

function renameBundle(dir, from, to) {
  const app = path.join(dir, `${from}.app`);
  if (!fs.existsSync(app)) return;
  const binaryDir = path.join(app, "Contents", "MacOS");
  fs.renameSync(path.join(binaryDir, from), path.join(binaryDir, to));
  fs.renameSync(app, path.join(dir, `${to}.app`));
}

function installSources(resourcesDir) {
  for (const name of ["default_app.asar", "default_app"]) {
    fs.rmSync(path.join(resourcesDir, name), { recursive: true, force: true });
  }
  const appDir = path.join(resourcesDir, "app");
  for (const rel of APP_FILES) {
    const dest = path.join(appDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(root, rel), dest);
  }
  fs.writeFileSync(
    path.join(appDir, "package.json"),
    JSON.stringify({ name: "mycalc", version: "10.0.0", main: "electron/main.js" }, null, 2)
  );
}

async function main() {
  const { downloadArtifact } = require("@electron/get");
  const zipSource = await downloadArtifact({
    version: electronVersion,
    platform: "darwin",
    arch,
    artifactName: "electron",
  });
  const stage = path.join(root, "release", `macos-${arch}-stage`);
  const bundleParent = path.join(root, "release", `MyCalc-darwin-${arch}`);
  fs.rmSync(stage, { recursive: true, force: true });
  fs.rmSync(bundleParent, { recursive: true, force: true });
  const links = unzip(zipSource, stage);
  materializeLinks(stage, links);

  const electronApp = path.join(stage, "Electron.app");
  const contents = path.join(electronApp, "Contents");
  const frameworks = path.join(contents, "Frameworks");
  patchPlist(path.join(contents, "Info.plist"), {
    CFBundleDisplayName: "MyCalc",
    CFBundleExecutable: "MyCalc",
    CFBundleIdentifier: "local.mycalc.desktop",
    CFBundleName: "MyCalc",
    CFBundleIconFile: "icon.icns",
    CFBundleShortVersionString: "10.0.0",
    CFBundleVersion: "10.0.0",
  });
  fs.copyFileSync(path.join(root, "assets", "icon.icns"), path.join(contents, "Resources", "icon.icns"));
  stripPlistKey(path.join(contents, "Info.plist"), "ElectronAsarIntegrity");
  fs.renameSync(path.join(contents, "MacOS", "Electron"), path.join(contents, "MacOS", "MyCalc"));
  for (const [from, to, bundleName, bundleId] of HELPERS) {
    const plist = path.join(frameworks, `${from}.app`, "Contents", "Info.plist");
    patchPlist(plist, {
      CFBundleDisplayName: to,
      CFBundleExecutable: to,
      CFBundleIdentifier: bundleId,
      CFBundleName: bundleName,
      CFBundleShortVersionString: "10.0.0",
      CFBundleVersion: "10.0.0",
    });
    renameBundle(frameworks, from, to);
  }
  const loginDir = path.join(contents, "Library", "LoginItems");
  patchPlist(path.join(loginDir, "Electron Login Helper.app", "Contents", "Info.plist"), {
    CFBundleDisplayName: "MyCalc Login Helper",
    CFBundleExecutable: "MyCalc Login Helper",
    CFBundleIdentifier: "local.mycalc.desktop.loginhelper",
    CFBundleName: "MyCalc Login Helper",
  });
  renameBundle(loginDir, "Electron Login Helper", "MyCalc Login Helper");
  installSources(path.join(contents, "Resources"));

  fs.mkdirSync(bundleParent, { recursive: true });
  const bundle = path.join(bundleParent, "MyCalc.app");
  fs.renameSync(electronApp, bundle);
  fs.rmSync(stage, { recursive: true, force: true });

  const binary = path.join(bundle, "Contents", "MacOS", "MyCalc");
  const magic = fs.readFileSync(binary).subarray(0, 4).toString("hex");
  if (magic !== "cffaedfe" && magic !== "feedfacf" && magic !== "cafebabe") {
    throw new Error(`macOS 실행 파일 형식이 아닙니다: ${magic}`);
  }

  const zipPath = path.join(root, "release", `MyCalc-10.0.0-macos-${arch}.zip`);
  fs.rmSync(zipPath, { force: true });
  const packed = spawnSync("tar", ["-a", "-c", "-f", zipPath, "-C", bundleParent, "MyCalc.app"], { stdio: "inherit" });
  if (packed.status !== 0) throw new Error("macOS zip 생성에 실패했습니다.");
  console.log(`\x1b[32mmacOS\x1b[0m  release/MyCalc-10.0.0-macos-${arch}.zip  ${fs.statSync(zipPath).size} bytes`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
