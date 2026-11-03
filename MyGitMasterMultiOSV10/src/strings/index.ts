// Each feature keeps its own Korean / English strings in this folder, so features can
// be worked on without touching the same lines of src/i18n.ts.
import { generalStrings } from "./general";
import { guideStrings } from "./guide";
import { iconsStrings } from "./icons";
import { promptStrings } from "./prompt";
import { startStrings } from "./start";
import { terminalStrings } from "./terminal";
import { themeStrings } from "./theme";

export type FeatureStrings = { ko: Record<string, string>; en: Record<string, string> };

export const FEATURE_STRINGS: FeatureStrings[] = [generalStrings, startStrings, promptStrings, themeStrings, guideStrings, iconsStrings, terminalStrings];
