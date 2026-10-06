import { en } from "./en";
import { ko } from "./ko";
import type { Language, Messages } from "./messages";

export const messages: Record<Language, Messages> = { en, ko };

export function formatMessage(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ""));
}
