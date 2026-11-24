// Waiting on a pdf.js loading task that may need a password.
//
// pdf.js calls `task.onPassword(retry, reason)` for an encrypted document and
// then waits — forever — until `retry(password)` is called. So the caller must
// (1) get a password in front of the user without anything covering the
// prompt, and (2) end the task when the user cancels, or the open never
// finishes. This keeps both rules in one place.
//
//   ask(reason)      → Promise<string | null>; reason 1 = needed, 2 = wrong.
//                      null means the user cancelled.
//   knownPassword    → tried once, silently, before asking (reload after Save).
//   pause / resume   → hide / show whatever progress UI is up while asking.
//
// Resolves { doc, password } (password = the one that worked, or null when
// none was needed) or null when the user cancelled. Other errors reject.
export const PASSWORD_NEEDED = 1;
export const PASSWORD_INCORRECT = 2;

export async function awaitPdfPassword(task, {
  ask, knownPassword = null, pause = () => {}, resume = () => {},
} = {}) {
  let used = null;
  let triedKnown = false;
  let cancelled = false;
  task.onPassword = (retry, reason) => {
    if (knownPassword != null && !triedKnown) {
      triedKnown = true;
      used = knownPassword;
      retry(knownPassword);
      return;
    }
    pause();
    Promise.resolve()
      .then(() => ask(reason))
      .then((pw) => {
        if (pw == null) {
          cancelled = true;
          task.destroy().catch(() => {});
          return;
        }
        used = String(pw);
        resume();
        retry(used);
      }, (err) => {
        cancelled = true;
        task.destroy().catch(() => {});
        console.warn('Password prompt failed:', err);
      });
  };
  try {
    const doc = await task.promise;
    return { doc, password: used };
  } catch (err) {
    if (cancelled) return null;
    throw err;
  }
}
