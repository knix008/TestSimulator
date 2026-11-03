/* Copies the Windows setup that `tauri build --bundles nsis` made next to the project, under
 * the name the earlier builds used: MyPaint-<version>-windows-x64-setup.exe. */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const version = require(path.join(root, "package.json")).version;
const bundle = path.join(root, "src-tauri", "target", "release", "bundle", "nsis");

if (!fs.existsSync(bundle)) {
  console.log("no NSIS bundle at " + path.relative(root, bundle));
  process.exit(0);
}
const setups = fs.readdirSync(bundle)
  .filter((name) => /setup\.exe$/i.test(name) && name.indexOf(version) >= 0)
  .map((name) => ({ name: name, time: fs.statSync(path.join(bundle, name)).mtimeMs }))
  .sort((a, b) => b.time - a.time);
if (!setups.length) {
  console.log("no setup for version " + version + " in " + path.relative(root, bundle));
  process.exit(0);
}
const arch = /arm64/i.test(setups[0].name) ? "arm64" : "x64";
const target = "MyPaint-" + version + "-windows-" + arch + "-setup.exe";
fs.copyFileSync(path.join(bundle, setups[0].name), path.join(root, target));
console.log("copied", setups[0].name, "->", target);
