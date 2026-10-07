import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { userDataDir } from "../src/core/paths.js";
import { INSTALL_STRINGS, programIconFor, runInstaller } from "./plan.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

export function createIo() {
  return {
    async chooseLanguage() {
      const preset = process.env.MYWEATHER_LANG;
      if (preset === "en" || preset === "ko") return preset;
      const answer = await ask(`${INSTALL_STRINGS.en.languagePrompt}\n${INSTALL_STRINGS.ko.languagePrompt}\n> `);
      const text = answer.trim().toLowerCase();
      if (text === "2" || text.startsWith("k") || text.includes("한국")) return "ko";
      if (text === "1" || text.startsWith("e")) return "en";
      throw new Error("A language must be selected.");
    },
    async confirm(message) {
      const answer = await ask(`${message} [y/n] `);
      const text = answer.trim().toLowerCase();
      return text === "y" || text === "yes" || text === "예";
    },
    async notify(message) {
      console.log(message);
    },
  };
}

function shortcutPaths() {
  const home = os.homedir();
  const desktop = path.join(home, "Desktop", "MyWeather.desktop");
  const start = process.platform === "darwin"
    ? path.join(home, "Applications", "MyWeather.desktop")
    : path.join(home, ".local", "share", "applications", "MyWeather.desktop");
  return [desktop, start];
}

function writeDesktopShortcut(file, dest, icon) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const desktop = fs.readFileSync(path.join(root, "installer/linux/myweather.desktop"), "utf8").replace("Icon=myweather", `Icon=${icon}`);
  fs.writeFileSync(file, desktop);
}

export function createFsEnv(dest) {
  const dataPath = userDataDir(process.platform, os.homedir());
  const links = shortcutPaths();
  return {
    async detectExisting() {
      return {
        installed: fs.existsSync(dest),
        userDataExists: fs.existsSync(path.join(dataPath, "settings.json")),
        installPath: dest,
        userDataPath: dataPath,
        shortcuts: links,
        programIcon: programIconFor(process.platform),
        platform: process.platform,
      };
    },
    async exec(step) {
      if (step.action === "delete-user-data") fs.rmSync(step.path, { recursive: true, force: true });
      if (step.action === "uninstall-existing") {
        fs.rmSync(step.path, { recursive: true, force: true });
        for (const link of step.shortcuts || []) fs.rmSync(link, { force: true });
      }
      if (step.action === "install") {
        fs.mkdirSync(dest, { recursive: true });
        for (const name of ["package.json", "src", "electron", "assets", "installer"]) {
          fs.cpSync(path.join(root, name), path.join(dest, name), { recursive: true });
        }
        const icon = path.join(dest, step.icon || programIconFor(process.platform));
        fs.writeFileSync(
          path.join(dest, "file-association.txt"),
          `ext=.myweather\nicon=${path.join(dest, "assets/file.ico")}\nappIcon=${icon}\nlanguage=${step.language}\n`,
        );
      }
      if (step.action === "shortcut-desktop") writeDesktopShortcut(links[0], dest, path.join(dest, step.icon));
      if (step.action === "shortcut-start-menu") writeDesktopShortcut(links[1], dest, path.join(dest, step.icon));
    },
  };
}

const invokedDirectly = process.argv[1] && path.basename(process.argv[1]) === "cli.js";
if (invokedDirectly) {
  const destFlag = process.argv.indexOf("--dest");
  const dest = destFlag >= 0 ? process.argv[destFlag + 1] : path.join(os.homedir(), "MyWeather");
  runInstaller(createIo(), createFsEnv(dest))
    .then((plan) => {
      console.log(`Installed (${plan.language}).`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
