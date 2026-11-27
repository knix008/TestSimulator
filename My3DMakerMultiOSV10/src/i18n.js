// UI text in Korean and English. `t(key, params, fallback)` fills {name}
// placeholders. The shell's dictionaries live in i18n/ko.js and i18n/en.js (+ the 3D view's), the CAD
// app's own in i18n/mech.js (it wins where a key is in both).
import ko from './i18n/ko.js';
import en from './i18n/en.js';
import ko3d from './i18n/ko3d.js';
import en3d from './i18n/en3d.js';
import { ko as koExtra, en as enExtra } from './i18n/extra3d.js';
import { ko as koMech, en as enMech } from './i18n/mech.js';
import { ko as koMech2, en as enMech2 } from './i18n/mech2.js';
import { ko as koMechSheet, en as enMechSheet } from './i18n/mech-sheet.js';
import { ko as koMechAsm, en as enMechAsm } from './i18n/mech-asm.js';
import { ko as koMechPart, en as enMechPart } from './i18n/mech-part.js';
import { ko as koMechCore, en as enMechCore } from './i18n/mech-core.js';
import { ko as koMechStd, en as enMechStd } from './i18n/mech-std.js';
import { ko as koBackgrounds, en as enBackgrounds } from './i18n/backgrounds.js';
import { ko as koPrint, en as enPrint } from './i18n/print.js';
import { ko as koDocs, en as enDocs } from './i18n/docs.js';
import { ko as koMechSim, en as enMechSim } from './i18n/mech-sim.js';
import { ko as koMechFem, en as enMechFem } from './i18n/mech-fem.js';
import { ko as koMechDrw, en as enMechDrw } from './i18n/mech-drw.js';
import { ko as koMechPdm, en as enMechPdm } from './i18n/mech-pdm.js';
import { ko as koMechCam, en as enMechCam } from './i18n/mech-cam.js';
import { ko as koMechIll, en as enMechIll } from './i18n/mech-illustration.js';
import { ko as koMechSch, en as enMechSch } from './i18n/mech-schematic.js';
import { ko as koMechDc, en as enMechDc } from './i18n/mech-designcheck.js';
import { ko as koMechTasks, en as enMechTasks } from './i18n/mech-tasks.js';
import { ko as koMechMacros, en as enMechMacros } from './i18n/mech-macros.js';
import { ko as koMechFat, en as enMechFat } from './i18n/mech-fatigue.js';
import { ko as koMechDyn, en as enMechDyn } from './i18n/mech-dynamic.js';
import { ko as koMechDs, en as enMechDs } from './i18n/mech-designstudy.js';
import { ko as koMechDf, en as enMechDf } from './i18n/mech-defeature.js';
import { ko as koMechMk, en as enMechMk } from './i18n/mech-markup.js';
import { ko as koMechHl, en as enMechHl } from './i18n/mech-harnesslink.js';
import { ko as koMechPl2, en as enMechPl2 } from './i18n/mech-plastics2.js';
import { ko as koMechApi, en as enMechApi } from './i18n/mech-api.js';
import { ko as koMechEl, en as enMechEl } from './i18n/mech-electronics.js';
import { ko as koMechFs, en as enMechFs } from './i18n/mech-freesurface.js';
import { ko as koMechPlastics, en as enMechPlastics } from './i18n/mech-plastics.js';
import { ko as koMechInspection, en as enMechInspection } from './i18n/mech-inspection.js';

export const DICTIONARIES = { ko: { ...ko, ...ko3d, ...koExtra, ...koMech, ...koMech2, ...koMechSheet, ...koMechAsm,...koMechPart, ...koMechCore, ...koMechStd,...koBackgrounds, ...koPrint, ...koDocs, ...koMechDrw, ...koMechSim, ...koMechPdm, ...koMechFem }, en: { ...en, ...en3d, ...enExtra, ...enMech, ...enMech2, ...enMechSheet, ...enMechAsm,...enMechPart, ...enMechCore, ...enMechStd,...enBackgrounds, ...enPrint, ...enDocs, ...enMechDrw, ...enMechSim, ...enMechPdm, ...enMechFem } };
// The manufacturing add-ins (CAM, plastics flow, inspection).
Object.assign(DICTIONARIES.ko, koMechCam, koMechPlastics, koMechInspection, koMechIll, koMechSch, koMechDc, koMechTasks, koMechMacros, koMechFat, koMechDyn, koMechDs, koMechDf, koMechMk, koMechHl, koMechPl2, koMechApi, koMechEl, koMechFs);
Object.assign(DICTIONARIES.en, enMechCam, enMechPlastics, enMechInspection, enMechIll, enMechSch, enMechDc, enMechTasks, enMechMacros, enMechFat, enMechDyn, enMechDs, enMechDf, enMechMk, enMechHl, enMechPl2, enMechApi, enMechEl, enMechFs);
import { ko as koSim, en as enSim } from './i18n/sim.js';
// The simulation app's own texts win over the shell's.
Object.assign(DICTIONARIES.ko, koSim);
Object.assign(DICTIONARIES.en, enSim);
let language = 'ko';

export function setLanguage(value) {
  language = value === 'en' ? 'en' : 'ko';
  if (globalThis.document?.documentElement) document.documentElement.lang = language;
}

export const getLanguage = () => language;

export function t(key, params = null, fallback = undefined) {
  let text = DICTIONARIES[language][key] ?? DICTIONARIES.ko[key];
  if (text == null) return fallback ?? key;
  if (params) text = text.replace(/\{(\w+)\}/g, (match, name) => (params[name] ?? match));
  return text;
}

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}
