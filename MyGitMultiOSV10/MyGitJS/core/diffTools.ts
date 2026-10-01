import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type DiffTool = {
  id: string;
  label: string;
  args: string;
};

const PAIR = "\"{left}\" \"{right}\"";
const CODE = "--diff \"{left}\" \"{right}\"";
const TORTOISE = "/base:\"{left}\" /mine:\"{right}\"";

type Candidate = {
  label: string;
  names: string[];
  paths: string[];
  args: string;
  accept?: (command: string) => boolean;
};

export function installedDiffTools(): DiffTool[] {
  return collectDiffTools({
    exists: existsFile,
    lookup: lookupCommand,
  });
}

export function collectDiffTools(probe: {
  exists: (command: string) => boolean;
  lookup: (name: string) => string[];
}): DiffTool[] {
  const found: DiffTool[] = [];
  for (const candidate of candidates()) {
    const paths = new Set<string>(candidate.paths);
    for (const name of candidate.names) {
      for (const command of probe.lookup(name)) paths.add(command);
    }
    const command = [...paths].find((item) => probe.exists(item) && (candidate.accept?.(item) ?? true));
    if (!command || found.some((tool) => sameTool(tool.id, command))) continue;
    found.push({ id: command, label: candidate.label, args: candidate.args });
  }
  return found.sort((left, right) => left.label.localeCompare(right.label));
}

export function sameTool(left: string, right: string): boolean {
  if (!left || !right) return false;
  return process.platform === "win32" || /[\\]/.test(left) || /[\\]/.test(right)
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

function candidates(): Candidate[] {
  return process.platform === "win32" ? windowsCandidates() : unixCandidates();
}

function windowsCandidates(): Candidate[] {
  const programs = process.env.ProgramFiles || "C:\\Program Files";
  const programs86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const local = process.env.LOCALAPPDATA || "";
  const both = (relative: string) => [path.join(programs, relative), path.join(programs86, relative)];
  return [
    { label: "WinMerge", names: ["WinMergeU"], paths: both("WinMerge\\WinMergeU.exe"), args: PAIR },
    {
      label: "Beyond Compare",
      names: ["BCompare"],
      paths: [5, 4, 3].flatMap((version) => both(`Beyond Compare ${version}\\BCompare.exe`)),
      args: PAIR,
    },
    { label: "Meld", names: ["meld"], paths: [...both("Meld\\Meld.exe"), ...both("Meld\\meld.exe")], args: PAIR },
    { label: "KDiff3", names: ["kdiff3"], paths: [...both("KDiff3\\kdiff3.exe"), ...both("KDiff3\\bin\\kdiff3.exe")], args: PAIR },
    {
      label: "Visual Studio Code",
      names: ["code"],
      paths: [
        path.join(local, "Programs", "Microsoft VS Code", "Code.exe"),
        path.join(programs, "Microsoft VS Code", "Code.exe"),
      ],
      args: CODE,
      accept: (command) => /microsoft vs code/i.test(command),
    },
    { label: "TortoiseGit Merge", names: ["TortoiseGitMerge"], paths: both("TortoiseGit\\bin\\TortoiseGitMerge.exe"), args: TORTOISE },
    { label: "TortoiseMerge", names: ["TortoiseMerge"], paths: both("TortoiseSVN\\bin\\TortoiseMerge.exe"), args: TORTOISE },
    { label: "P4Merge", names: ["p4merge"], paths: both("Perforce\\p4merge.exe"), args: PAIR },
    { label: "Araxis Merge", names: [], paths: both("Araxis\\Araxis Merge\\Compare.exe"), args: PAIR },
    { label: "DiffMerge", names: ["sgdm"], paths: both("SourceGear\\Common\\DiffMerge\\sgdm.exe"), args: PAIR },
  ];
}

function unixCandidates(): Candidate[] {
  const apps = [
    ["/Applications/Meld.app/Contents/MacOS/Meld", "Meld"],
    ["/Applications/Beyond Compare.app/Contents/MacOS/bcomp", "Beyond Compare"],
    ["/Applications/kdiff3.app/Contents/MacOS/kdiff3", "KDiff3"],
  ] as const;
  return [
    { label: "Meld", names: ["meld"], paths: ["/usr/bin/meld", "/usr/local/bin/meld", apps[0][0]], args: PAIR },
    { label: "KDiff3", names: ["kdiff3"], paths: ["/usr/bin/kdiff3", "/usr/local/bin/kdiff3", apps[2][0]], args: PAIR },
    { label: "Beyond Compare", names: ["bcompare", "bcomp"], paths: ["/usr/bin/bcompare", apps[1][0]], args: PAIR },
    {
      label: "Visual Studio Code",
      names: ["code"],
      paths: ["/usr/bin/code", "/usr/local/bin/code", "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"],
      args: CODE,
    },
    { label: "FileMerge", names: ["opendiff"], paths: ["/usr/bin/opendiff"], args: PAIR },
  ];
}

function lookupCommand(name: string): string[] {
  const command = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(command, [name], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0 || !result.stdout) return [];
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function existsFile(command: string): boolean {
  try {
    return fs.statSync(command).isFile();
  } catch {
    return false;
  }
}
