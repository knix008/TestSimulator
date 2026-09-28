'use strict';

/**
 * Whether the recycle bin / trash holds anything, emptying it, and watching it.
 *
 * Every platform keeps this somewhere different, so each one gets its own
 * probe. The probes are deliberately plain filesystem reads: the dock repaints
 * its Trash icon from the answer, so it has to come back in a millisecond, not
 * after a PowerShell process has started. A failure always reports "unknown but
 * not empty" rather than throwing - the dock would rather show a full bin it
 * cannot verify than crash a menu.
 *
 * `watch()` turns those probes into a live feed: the OS tells us the moment
 * anything lands in the bin or leaves it, so the icon changes as fast as the
 * file does, and a slow timer sits behind it purely as a safety net.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const POWERSHELL = ['-NoProfile', '-NonInteractive', '-Command'];

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    execFile(command, args, { windowsHide: true, maxBuffer: 4 << 20, ...options }, (err, stdout) => {
      resolve({ err, stdout: String(stdout || '') });
    });
  });
}

/* ------------------------------ scanning -------------------------------- */

/**
 * Does `dir` hold at least one entry that `accept` recognises?
 *
 * `opendir` rather than `readdir`, and it stops at the first hit: a bin with
 * fifty thousand files in it then costs one directory read, not fifty thousand
 * strings. The dock only ever asks "empty or not", so there is no reason to
 * walk past the answer.
 *
 * @returns {'yes'|'no'|'missing'|'denied'}
 */
function holdsItem(dir, accept) {
  let handle;
  try {
    handle = fs.opendirSync(dir);
  } catch (err) {
    return err.code === 'ENOENT' ? 'missing' : 'denied';
  }
  try {
    for (let entry = handle.readSync(); entry; entry = handle.readSync()) {
      if (accept(entry.name)) return 'yes';
    }
  } catch {
    return 'denied';
  } finally {
    try { handle.closeSync(); } catch { /* already closed */ }
  }
  return 'no';
}

/** Turn one directory's verdict into the shape the dock expects. */
function fromVerdict(verdict) {
  if (verdict === 'yes') return { empty: false, known: true };
  if (verdict === 'no') return { empty: true, known: true };
  // The folder is only created by the first delete, so "not there" is a
  // genuine empty. "There but refused" is not.
  if (verdict === 'missing') return { empty: true, known: true };
  return { empty: false, known: false };
}

/* ------------------------------- Windows -------------------------------- */

/**
 * A deleted item is the `$R…` copy of the data. `$I…` is only its metadata
 * record, and orphaned `$I` files outlive an emptied bin - so counting those
 * reports a full bin long after the user emptied it.
 */
function isDeletedItem(name) {
  return name.length > 2 && name[0] === '$' && (name[1] === 'R' || name[1] === 'r');
}

/**
 * Every mounted volume keeps its own bin, and the contents of all of them
 * together are what Explorer shows as "the" recycle bin.
 *
 * Probing the drive letters costs two dozen stat calls, so the answer is kept
 * and only refreshed on the slow sweep - volumes do not come and go anywhere
 * near often enough to pay for that on every probe.
 */
let rootsCache = null;

function windowsRoots(rescan) {
  if (rootsCache && !rescan) return rootsCache;
  const roots = [];
  for (let i = 2; i < 26; i += 1) {   // C: upwards; A:/B: are floppy letters
    const dir = path.join(`${String.fromCharCode(65 + i)}:\\`, '$Recycle.Bin');
    try {
      if (fs.statSync(dir).isDirectory()) roots.push(dir);
    } catch { /* drive absent, offline, or not ours to read */ }
  }
  rootsCache = roots;
  return roots;
}

let sidPromise = null;

/**
 * The current user's SID, which names their folder inside each bin.
 *
 * One process, once per run, and only on the first probe. The full path is
 * spelled out because a `whoami` earlier on PATH - Git for Windows ships a
 * Unix one - does not understand `/user`.
 */
function currentSid() {
  if (!sidPromise) {
    const exe = path.join(process.env.SystemRoot || 'C:\Windows', 'System32', 'whoami.exe');
    sidPromise = run(exe, ['/user', '/fo', 'csv', '/nh']).then(({ err, stdout }) => {
      if (err) return null;
      const match = /S-1-[0-9-]+/.exec(stdout);
      return match ? match[0] : null;
    });
  }
  return sidPromise;
}

async function windowsBins(rescan) {
  const sid = await currentSid();
  const bins = [];
  for (const root of windowsRoots(rescan)) {
    if (sid) { bins.push(path.join(root, sid)); continue; }
    // Without a SID, fall back to every folder we are allowed to read. Another
    // account's bin is normally denied us, so this stays close to the truth.
    try {
      for (const entry of fs.readdirSync(root)) {
        if (entry.startsWith('S-1-')) bins.push(path.join(root, entry));
      }
    } catch { /* root unreadable */ }
  }
  return bins;
}

async function windowsState(rescan) {
  let answered = false;

  for (const bin of await windowsBins(rescan)) {
    const verdict = holdsItem(bin, isDeletedItem);
    // One full volume is enough; the rest cannot change the answer.
    if (verdict === 'yes') return { empty: false, known: true };
    // `missing` is a genuine empty: the per-user folder is only created by the
    // first delete on that volume. `denied` is not ours to read - which is
    // exactly what another account's folder looks like - so it only decides
    // the answer when no volume answered at all.
    if (verdict !== 'denied') answered = true;
  }

  return answered ? { empty: true, known: true } : { empty: false, known: false };
}

/**
 * How Windows is asked to empty the bin.
 *
 * `Clear-RecycleBin -Force` calls SHEmptyRecycleBin with SHERB_NOPROGRESSUI,
 * so the bin disappears with nothing on screen. The menu click is already the
 * confirmation (SHERB_NOCONFIRMATION = 1); the progress window and the sound
 * stay on, which is the dialog Explorer shows while the bin actually empties.
 *
 * The dock is often always-on-top, so the dialog is owned by the dock window
 * and stacks above it. A non-numeric handle is ignored rather than interpolated
 * into the script.
 *
 * `windowsHide` stays off: hiding the process also hides the progress window.
 *
 * @param {string|null} ownerHwnd decimal HWND, or null for the desktop
 * @returns {{command:string, args:string[], windowsHide:boolean}}
 */
function windowsEmptyLaunch(ownerHwnd) {
  const hwnd = /^-?\d+$/.test(String(ownerHwnd || '')) ? String(ownerHwnd) : '0';
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -Namespace MyDockBar -Name Recycle -MemberDefinition '" +
      '[DllImport("shell32.dll", CharSet = CharSet.Unicode)] ' +
      'public static extern int SHEmptyRecycleBin(System.IntPtr hwnd, string pszRootPath, uint dwFlags);' +
      "'",
    `$code = [MyDockBar.Recycle]::SHEmptyRecycleBin([IntPtr]([int64]${hwnd}), $null, 1)`,
    // The progress dialog has a Cancel button. ERROR_CANCELLED (0x800704C7)
    // means the user stopped it, which is not a failure.
    'if ($code -ne 0 -and $code -ne -2147023673) { Write-Error ([string]$code); exit 1 }',
  ].join('; ');
  return {
    command: 'powershell.exe',
    args: ['-NoProfile', '-STA', '-WindowStyle', 'Hidden', '-Command', script],
    windowsHide: false,
  };
}

async function windowsEmpty(ownerHwnd) {
  const launch = windowsEmptyLaunch(ownerHwnd);
  const { err } = await run(launch.command, launch.args, { windowsHide: launch.windowsHide });
  if (err) return { ok: false, error: err.message };
  return { ok: true };
}

/* -------------------------------- macOS --------------------------------- */

function macTrashDir() {
  return path.join(os.homedir(), '.Trash');
}

// Finder's own bookkeeping files live in ~/.Trash and are not deleted items.
const MAC_IGNORED = new Set(['.DS_Store', '.localized']);

async function macState() {
  return fromVerdict(holdsItem(macTrashDir(), (name) => !MAC_IGNORED.has(name)));
}

async function macEmpty() {
  const { err } = await run('osascript', ['-e', 'tell application "Finder" to empty trash']);
  if (err) return { ok: false, error: err.message };
  return { ok: true };
}

/* -------------------------------- Linux --------------------------------- */

function linuxTrashDir() {
  const base = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(base, 'Trash');
}

async function linuxState() {
  return fromVerdict(holdsItem(path.join(linuxTrashDir(), 'files'), () => true));
}

async function linuxEmpty() {
  const root = linuxTrashDir();
  try {
    for (const sub of ['files', 'info']) {
      const dir = path.join(root, sub);
      for (const entry of fs.readdirSync(dir)) {
        fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
      }
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/* -------------------------------- public -------------------------------- */

/**
 * Is the bin empty? `known` is false only when every probe was refused.
 *
 * @returns {Promise<{empty:boolean, known:boolean}>}
 */
function state() {
  if (process.platform === 'win32') return windowsState();
  if (process.platform === 'darwin') return macState();
  return linuxState();
}

/**
 * Empty the bin. On Windows, `ownerHwnd` is the dock's HWND as a decimal
 * string so the progress dialog stacks above an always-on-top dock.
 *
 * @param {string|null} [ownerHwnd]
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
function empty(ownerHwnd) {
  if (process.platform === 'win32') return windowsEmpty(ownerHwnd);
  if (process.platform === 'darwin') return macEmpty();
  return linuxEmpty();
}

/**
 * The directories to put a watch on.
 *
 * One directory each, never a recursive subtree: on Windows the deleted items
 * sit directly inside the current user's own folder, so watching that folder
 * alone is both the cheapest watch the OS offers and the quietest - nothing
 * another account does can wake us. Until the first delete on a volume that
 * folder does not exist, so the volume's bin stands in for it and its creation
 * is itself the event that swaps the watch over.
 */
async function watchTargets(rescan) {
  if (process.platform === 'win32') {
    const sid = await currentSid();
    return windowsRoots(rescan).map((root) => {
      if (!sid) return root;
      const bin = path.join(root, sid);
      return fs.existsSync(bin) ? bin : root;
    });
  }
  if (process.platform === 'darwin') return [macTrashDir()];
  return [path.join(linuxTrashDir(), 'files')];
}

/** How long to let a burst of filesystem events settle before re-probing. */
const SETTLE_MS = 120;
/**
 * Backstop sweep. The watches carry the work; this only re-checks the things
 * no watch can report - a volume being mounted, or a watch the OS dropped - so
 * it is deliberately slow. A minute of lag on a USB stick's bin is a far better
 * trade than a timer firing in the background all day.
 */
const SWEEP_MS = 60000;

/**
 * Report the bin's state whenever it changes, starting with its state now.
 *
 * Idle cost is meant to be nil: no polling loop, one directory watch per
 * volume, and a probe only when the OS says something moved. Each probe stops
 * at the first deleted item it finds.
 *
 * @param {(info:{empty:boolean,known:boolean}) => void} onChange
 * @returns {{stop:() => void}}
 */
function watch(onChange) {
  const watchers = new Map();   // dir -> FSWatcher
  let settle = null;
  let sweep = null;
  let busy = false;
  let again = false;
  let last = null;              // last reported `empty`, null until first probe
  let stopped = false;

  const probe = async (rescan) => {
    if (stopped) return;
    if (busy) { again = true; return; }
    busy = true;
    let info = null;
    try {
      info = process.platform === 'win32' ? await windowsState(rescan) : await state();
    } catch { /* keep the last known answer */ }
    busy = false;

    if (info && !stopped && info.empty !== last) {
      last = info.empty;
      onChange(info);
    }
    if (again) { again = false; probe(); }
  };

  const arm = async (rescan) => {
    if (stopped) return;
    const wanted = await watchTargets(rescan);
    if (stopped) return;

    // Drop anything no longer wanted - the per-user folder appearing retires
    // the stand-in watch on the volume's bin above it.
    const keep = new Set(wanted);
    for (const [dir, watcher] of watchers) {
      if (keep.has(dir)) continue;
      try { watcher.close(); } catch { /* already gone */ }
      watchers.delete(dir);
    }

    for (const dir of wanted) {
      if (watchers.has(dir)) continue;
      try {
        const watcher = fs.watch(dir, { persistent: false }, bump);
        // A watched folder can be removed or a drive pulled out; drop it and
        // let the next sweep put the watch back if it returns.
        watcher.on('error', () => {
          try { watcher.close(); } catch { /* already gone */ }
          watchers.delete(dir);
        });
        watchers.set(dir, watcher);
      } catch { /* not there yet, or not ours to watch */ }
    }
  };

  function bump() {
    clearTimeout(settle);
    settle = setTimeout(async () => {
      await probe();
      // Cheap, and it is the moment the per-user folder may have just been
      // created: re-point the watch at it rather than waiting for the sweep.
      arm();
    }, SETTLE_MS);
  }

  arm();
  probe();
  sweep = setInterval(() => { arm(true); probe(true); }, SWEEP_MS);
  if (sweep.unref) sweep.unref();

  return {
    stop() {
      stopped = true;
      clearTimeout(settle);
      clearInterval(sweep);
      for (const watcher of watchers.values()) {
        try { watcher.close(); } catch { /* already gone */ }
      }
      watchers.clear();
    },
  };
}

module.exports = {
  state,
  empty,
  watch,
  // Exposed for the tests: the two pieces that decide "empty or not", and the
  // one trap in the whole module - `$I` metadata outliving an emptied bin.
  holdsItem,
  isDeletedItem,
  MAC_IGNORED,
  windowsEmptyLaunch,
};
