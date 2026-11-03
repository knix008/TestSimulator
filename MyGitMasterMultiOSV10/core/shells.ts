import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type InstalledShell = {
  id: string;
  label: string;
  command: string;
  args: string[];
};

export function installedShells(): InstalledShell[] {
  const found: InstalledShell[] = process.platform === "win32" ? windowsShells() : unixShells();
  const counts = new Map<string, number>();
  for (const shell of found) counts.set(shell.label, (counts.get(shell.label) ?? 0) + 1);
  return found.map((shell) => (
    (counts.get(shell.label) ?? 0) > 1
      ? { ...shell, label: `${shell.label} (${path.dirname(shell.command)})` }
      : shell
  ));
}

export function resolveShell(shells: InstalledShell[], selected: string): InstalledShell | null {
  const match = shells.find((shell) => sameShell(shell.id, selected));
  return match ?? defaultShell(shells);
}

export function sameShell(left: string, right: string): boolean {
  if (!left || !right) return false;
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function defaultShell(shells: InstalledShell[]): InstalledShell | null {
  if (shells.length === 0) return null;
  if (process.platform === "win32") {
    return shells.find((shell) => /[\\/]powershell\.exe$/i.test(shell.command)) ?? shells[0];
  }
  const preferred = process.env.SHELL;
  if (preferred) {
    const match = shells.find((shell) => shell.command === preferred);
    if (match) return match;
  }
  return shells[0];
}

function windowsShells(): InstalledShell[] {
  const root = process.env.SystemRoot || "C:\\Windows";
  const shells: InstalledShell[] = [];
  const add = (label: string, command: string, args: string[]) => {
    if (!command || !existsFile(command)) return;
    const key = command.toLowerCase();
    if (shells.some((shell) => shell.command.toLowerCase() === key)) return;
    shells.push({ id: command, label, command, args });
  };

  for (const command of lookup("pwsh")) {
    if (/pwsh\.exe$/i.test(command)) add("PowerShell", command, []);
  }
  add("Windows PowerShell", path.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"), []);
  add("Command Prompt", path.join(root, "System32", "cmd.exe"), []);

  const bash = lookup("bash").filter((command) => !isStoreBash(command));
  const gitBash = bash.find((command) => /[\\/]git[\\/]bin[\\/]bash\.exe$/i.test(command));
  const programRoots = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]].filter((item): item is string => Boolean(item));
  for (const folder of programRoots) {
    const candidate = path.join(folder, "Git", "bin", "bash.exe");
    if (!gitBash && existsFile(candidate)) bash.push(candidate);
  }
  for (const command of bash) {
    if (gitBash && /[\\/]git[\\/]usr[\\/]bin[\\/]bash\.exe$/i.test(command)) continue;
    const git = /[\\/]git[\\/]bin[\\/]bash\.exe$/i.test(command);
    add(git ? "Git Bash" : "Bash", command, git ? ["--login", "-i"] : ["-i"]);
  }

  const wsl = lookup("wsl").find((command) => /wsl\.exe$/i.test(command));
  if (wsl) add("WSL", wsl, []);

  const rank = (command: string) => {
    const value = command.toLowerCase();
    if (value.endsWith("pwsh.exe")) return 0;
    if (value.endsWith("powershell.exe")) return 1;
    if (value.endsWith("cmd.exe")) return 2;
    if (value.includes(`${path.sep}git${path.sep}`) && value.endsWith("bash.exe")) return 3;
    if (value.endsWith("bash.exe")) return 4;
    if (value.endsWith("wsl.exe")) return 5;
    return 6;
  };
  return shells.sort((left, right) => rank(left.command) - rank(right.command) || left.label.localeCompare(right.label));
}

function unixShells(): InstalledShell[] {
  const shells: InstalledShell[] = [];
  const add = (command: string) => {
    if (!command || !existsFile(command)) return;
    if (/\/(nologin|false)$/.test(command)) return;
    if (shells.some((shell) => shell.command === command)) return;
    const base = path.basename(command);
    shells.push({
      id: command,
      label: base.charAt(0).toUpperCase() + base.slice(1),
      command,
      args: ["bash", "zsh", "sh", "dash", "fish"].includes(base) ? ["-i"] : [],
    });
  };
  try {
    for (const line of fs.readFileSync("/etc/shells", "utf8").split("\n")) {
      const command = line.trim();
      if (command && !command.startsWith("#")) add(command);
    }
  } catch {
    /* /etc/shells is not present on every Unix */
  }
  if (process.env.SHELL) add(process.env.SHELL);
  for (const command of ["/bin/bash", "/bin/zsh", "/bin/sh"]) add(command);
  return shells;
}

function lookup(name: string): string[] {
  const command = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(command, [name], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0 || !result.stdout) return [];
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => existsFile(line));
}

function isStoreBash(command: string): boolean {
  return /\\windows\\(system32|sysnative)\\bash\.exe$/i.test(command);
}

function existsFile(command: string): boolean {
  try {
    return fs.statSync(command).isFile();
  } catch {
    return false;
  }
}
