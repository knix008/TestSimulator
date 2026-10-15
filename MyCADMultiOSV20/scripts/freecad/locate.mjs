// Finds FreeCAD's command-line program (FreeCADCmd) for the FreeCAD tests and
// the FreeCAD sample generator: FREECAD_CMD first, then the usual install folders.
import fs from 'node:fs';
import path from 'node:path';

export function findFreecad() {
  const fromEnv = process.env.FREECAD_CMD;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const candidates = [];
  if (process.platform === 'win32') {
    for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')].filter(Boolean)) {
      let entries = [];
      try { entries = fs.readdirSync(base).filter((name) => /^FreeCAD/i.test(name)); } catch { /* not there */ }
      for (const name of entries.sort().reverse()) candidates.push(path.join(base, name, 'bin', 'FreeCADCmd.exe'), path.join(base, name, 'bin', 'freecadcmd.exe'));
    }
    // Portable copies at the root of a drive (D:\FreeCAD, D:\fc11 …): a short
    // path keeps ifcopenshell's DLLs loadable.
    for (const drive of 'CDEFGH') {
      let entries = [];
      try { entries = fs.readdirSync(`${drive}:\\`).filter((name) => /^(freecad|fc)/i.test(name)); } catch { /* no such drive */ }
      for (const name of entries.sort().reverse()) candidates.push(path.join(`${drive}:\\`, name, 'bin', 'freecadcmd.exe'));
    }
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/FreeCAD.app/Contents/Resources/bin/freecadcmd', '/Applications/FreeCAD.app/Contents/MacOS/FreeCADCmd');
  } else {
    candidates.push('/usr/bin/freecadcmd', '/usr/bin/FreeCADCmd', '/usr/local/bin/freecadcmd', '/snap/bin/freecad.cmd');
  }
  return candidates.find((file) => fs.existsSync(file)) ?? null;
}
