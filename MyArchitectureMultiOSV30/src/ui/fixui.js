// The model check's repairs in the UI (core/fixes.js): a "Fix" button on every
// problem (the repair is found and checked on a copy first, then applied as
// one undo step) and "Fix all". When no repair works, the advice for that
// problem is shown instead.

import { t } from "./i18n.js";
import { toast } from "./widgets.js";
import { findFix, fixAll, adviceFor } from "../core/fixes.js";

const later = () => new Promise((r) => setTimeout(r, 16));

/** Repairs one problem: true when it was repaired. */
export async function fixIssue(app, issue) {
  await later();
  const fx = findFix(app.store.project, issue);
  if (!fx) { toast(`${t("No automatic repair for this one.")} ${t(adviceFor(issue.code))}`, "info", 6000); return false; }
  const label = t(fx.key, fx.vars);
  app.store.edit(label, (p) => fx.apply(p));
  app.runCheck(false);
  toast(label, "ok");
  return true;
}

/** Repairs every problem that can be repaired, in one undo step: { fixed, left }. */
export async function fixEverything(app) {
  const n = (app.checkIssues || []).length;
  if (!n) { toast(t("No problems to repair."), "info"); return { fixed: [], left: [] }; }
  toast(t("Repairing {n} problems…", { n }), "info", 1500);
  await later();
  let res = { fixed: [], left: [] };
  app.store.edit(t("Repair the model check's problems"), (p) => { res = fixAll(p); });
  app.runCheck(false);
  toast(t("{a} problems repaired, {b} left (their advice is in the list).", { a: res.fixed.length, b: res.left.length }), res.left.length ? "warn" : "ok", 6000);
  return res;
}

export { adviceFor };
