// How far the compiler's installation is and how long it will still take. Plain data, so the tests
// can feed it events and a clock.
//
// Downloading depends on the connection and is timed as it goes. Unpacking is timed once it has
// begun; until then it is estimated from the size of the archive.
const MB = 1000000;
/** How much of an archive's work unpacking is, next to downloading it. */
const UNPACK_WEIGHT = 0.25;
const UNPACK_SECONDS_PER_MB = 0.06;
/** The speed is that of the last few seconds, and means nothing before the first of them. */
const SPEED_WINDOW = 5000;
const SPEED_MINIMUM = 1500;
/** Nothing new for this long is said out loud, so that waiting never looks like a hang. */
const QUIET = 5000;

/** `info` is what the backend says it will install: { dir, installedMegabytes, items }. */
export function startJob(info, now) {
  const job = {
    status: "running",
    error: null,
    dir: info.dir,
    installedMegabytes: info.installedMegabytes,
    items: info.items.map((item) => ({ ...item, state: "waiting", bytes: item.megabytes * MB, received: 0, unpacked: 0, unpackStarted: null })),
    started: now,
    lastEvent: now,
    cancelling: false,
    stalled: false,
    elapsed: 0,
    rate: null,
    samples: [{ at: now, received: 0 }],
    percent: 0,
    received: 0,
    bytes: 0,
    speed: null,
    seconds: null,
  };
  return measure(job, now);
}

function measure(job, now) {
  const { items } = job;
  const received = items.reduce((sum, item) => sum + item.received, 0);
  const bytes = items.reduce((sum, item) => sum + item.bytes, 0);
  const work = items.reduce((sum, item) => sum + item.received + item.unpacked * item.bytes * UNPACK_WEIGHT, 0);
  // The newest old sample stays too: a long silence is a speed of nothing, not a lack of samples.
  const recent = job.samples.filter((sample) => now - sample.at <= SPEED_WINDOW);
  const samples = [...(recent.length ? recent : job.samples.slice(-1)), { at: now, received }];
  const first = samples[0];
  const elapsed = now - first.at;
  const speed = elapsed >= SPEED_MINIMUM ? ((received - first.received) / elapsed) * 1000 : job.speed;
  // While an archive is being unpacked nothing is downloaded, and the speed of the last seconds runs
  // down to nothing: the time left goes by the speed there was while it was downloading.
  const rate = speed > 0 && items.some((item) => item.state === "download") ? speed : job.rate;
  const downloading = bytes - received;
  let seconds = null;
  if (downloading === 0 || rate > 0) {
    seconds = downloading === 0 ? 0 : downloading / rate;
    for (const item of items) {
      const left = 1 - item.unpacked;
      const measured = item.unpackStarted !== null && item.unpacked > 0.02;
      seconds += measured ? (((now - item.unpackStarted) / 1000) / item.unpacked) * left : (item.bytes / MB) * UNPACK_SECONDS_PER_MB * left;
    }
  }
  return {
    ...job,
    samples,
    received,
    bytes,
    speed,
    rate,
    seconds,
    elapsed: (now - job.started) / 1000,
    stalled: now - job.lastEvent >= QUIET,
    percent: Math.min(100, Math.floor((work / (bytes * (1 + UNPACK_WEIGHT))) * 100)),
  };
}

/** One event of the backend: { item, phase: "download" | "unpack" | "done", done, total }. */
export function advance(job, event, now) {
  const items = job.items.map((item, index) => {
    if (index !== event.item) return item;
    if (event.phase === "download") {
      // The server knows the exact size; the plan only has it in round numbers.
      return { ...item, state: "download", received: event.done, bytes: event.total > 0 ? event.total : item.bytes };
    }
    if (event.phase === "unpack") {
      return { ...item, state: "unpack", received: item.bytes, unpacked: event.total > 0 ? event.done / event.total : 0, unpackStarted: item.unpackStarted ?? now };
    }
    return { ...item, state: "done", received: item.bytes, unpacked: 1 };
  });
  return measure({ ...job, items, lastEvent: now }, now);
}

/** Time passing without news: the clock moves on, and the speed falls if nothing is arriving. */
export const tick = (job, now) => measure(job, now);

/** A clock for the time gone by. */
export function clockWords(seconds) {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** The time as the words of the current language; null while it cannot be known yet. */
export function timeWords(t, seconds) {
  if (seconds === null || !Number.isFinite(seconds)) return null;
  // Round up to five seconds: anything finer only flickers.
  const rounded = Math.max(5, Math.ceil(seconds / 5) * 5);
  const minutes = Math.floor(rounded / 60);
  const rest = rounded % 60;
  if (!minutes) return t("tools.seconds", { seconds: rest });
  return rest ? t("tools.minutes", { minutes, seconds: rest }) : t("tools.minutesOnly", { minutes });
}

export const megabytes = (bytes) => Math.round(bytes / MB);
