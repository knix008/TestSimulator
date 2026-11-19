// The installer's language window, tested without installing anything: a stub installer is compiled from the real
// src-tauri/windows/hooks.nsh with Tauri's own makensis, the program icon and the version of tauri.conf.json. Its
// .onInit shows the language window (the template's MUI_LANGDLL_DISPLAY, which the hooks replace), writes the
// chosen $LANGUAGE to a file in a temp folder and quits — no page, no file copied, no registry written.
// installer-window.ps1 reads the window (title, icons) and answers it through the task dialog's own messages.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const makensis = path.join(process.env.LOCALAPPDATA ?? '', 'tauri', 'NSIS', 'makensis.exe');

/** Whether the stub can be built here (Windows with Tauri's NSIS, which `npm run build:win` downloads). */
export const installerTestable = () => process.platform === 'win32' && fs.existsSync(makensis);

/** The version Tauri gives the installer: tauri.conf.json's, or the package.json it points at. */
export function appVersion() {
  const conf = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8')).version;
  if (conf && !String(conf).endsWith('.json')) return conf;
  return JSON.parse(fs.readFileSync(path.resolve(root, 'src-tauri', conf ?? '../package.json'), 'utf8')).version;
}

/** Compiles the stub into a fresh temp folder; returns { exe, result, dir }. */
export function buildStub() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mychartmaster-installer-'));
  const result = path.join(dir, 'language.txt');
  const nsi = `Unicode true
ManifestDPIAware true
!include MUI2.nsh
!include LogicLib.nsh
!include FileFunc.nsh
!include "Win\\RestartManager.nsh"
; Every place the hooks could touch points into the temp folder (only the language window runs anyway).
!define MUM_ROAMING "${dir}\\roaming"
!define MUM_LOCAL "${dir}\\local"
!define MUM_DESKTOP "${dir}\\desktop"
!define MUM_SMPROGRAMS "${dir}\\start"
!include "${path.join(root, 'src-tauri', 'windows', 'hooks.nsh')}"
!define PRODUCTNAME "MyChartMaster"
!define VERSION "${appVersion()}"
!define MUI_ICON "${path.join(root, 'src-tauri', 'icons', 'icon.ico')}"
Var PassiveMode
Name "\${PRODUCTNAME}"
OutFile "${path.join(dir, 'language-stub.exe')}"
RequestExecutionLevel user
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "Korean"
Function .onInit
  StrCpy $PassiveMode 0
  !insertmacro MUI_LANGDLL_DISPLAY
  FileOpen $0 "${result}" w
  FileWrite $0 "$LANGUAGE"
  FileClose $0
  Quit
FunctionEnd
; The uninstaller expands the same macro (MUI_UNGETLANGUAGE): it must compile there too, and ask nothing.
Function un.onInit
  !insertmacro MUI_UNGETLANGUAGE
FunctionEnd
Section
SectionEnd
Section "Uninstall"
SectionEnd
`;
  fs.writeFileSync(path.join(dir, 'stub.nsi'), `﻿${nsi}`);
  execFileSync(makensis, ['-V1', path.join(dir, 'stub.nsi')], { encoding: 'utf8' });
  return { exe: path.join(dir, 'language-stub.exe'), result, dir };
}

/** Runs the stub: lang 1033 / 1042 chooses that language and presses OK, 0 presses Cancel. */
export function runStub(stub, lang, capture = '') {
  try { fs.unlinkSync(stub.result); } catch { /* not there */ }
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'test', 'e2e', 'installer-window.ps1'), '-Exe', stub.exe, '-Lang', String(lang), ...(capture ? ['-Capture', capture] : [])], { encoding: 'utf8', timeout: 30000 });
  const line = String(r.stdout ?? '').trim().split(/\r?\n/).pop() ?? '';
  let window;
  try { window = JSON.parse(line); } catch { throw new Error(`installer-window.ps1: ${r.stdout}\n${r.stderr}`); }
  const chosen = fs.existsSync(stub.result) ? fs.readFileSync(stub.result, 'utf8').trim() : null;
  return { ...window, chosen };
}
