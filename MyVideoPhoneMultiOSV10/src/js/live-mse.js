/**
 * Live fMP4 via fetch + MediaSource (true streaming, not progressive VOD).
 */

function readU32(buf, offset) {
  return ((buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]) >>> 0;
}

function readType(buf, offset) {
  return String.fromCharCode(buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]);
}

function concatBytes(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function subcopy(buf, start, end) {
  return buf.subarray(start, end);
}

function findBoxData(buf, type, start = 0, end = buf.length) {
  let offset = start;
  while (offset + 8 <= end) {
    let size = readU32(buf, offset);
    const boxType = readType(buf, offset + 4);
    if (size === 1) break;
    if (size === 0) size = end - offset;
    if (size < 8 || offset + size > end) break;
    const dataStart = offset + 8;
    const dataEnd = offset + size;
    if (boxType === type) return buf.slice(dataStart, dataEnd);
    if (boxType !== 'mdat' && dataEnd - dataStart >= 8) {
      const found = findBoxData(buf, type, dataStart, dataEnd);
      if (found) return found;
    }
    offset += size;
  }
  return null;
}

function codecFromInit(init) {
  const avcC = findBoxData(init, 'avcC');
  if (avcC && avcC.length >= 4) {
    const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
    return `avc1.${hex(avcC[1])}${hex(avcC[2])}${hex(avcC[3])}`;
  }
  return 'avc1.42E01E';
}

function mimeFromInit(init) {
  const videoCodec = codecFromInit(init);
  const hasAudio = Boolean(findBoxData(init, 'mp4a') || findBoxData(init, 'esds'));
  if (hasAudio) return `video/mp4; codecs="${videoCodec}, mp4a.40.2"`;
  return `video/mp4; codecs="${videoCodec}"`;
}

function takeCompleteBoxes(buffer) {
  const boxes = [];
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    let size = readU32(buffer, offset);
    const type = readType(buffer, offset + 4);
    if (size === 1) break;
    if (size === 0) size = buffer.length - offset;
    if (size < 8 || offset + size > buffer.length) break;
    boxes.push({ type, bytes: buffer.slice(offset, offset + size) });
    offset += size;
  }
  return {
    boxes,
    rest: offset > 0 ? buffer.slice(offset) : buffer
  };
}

/**
 * Wait for an event once. Returns { promise, cancel } so callers can abandon
 * the wait without leaving an unhandledrejection (e.g. appendBuffer throws).
 * @returns {{ promise: Promise<void>, cancel: () => void }}
 */
function waitEvent(target, name, timeoutMs = 5000) {
  let settled = false;
  /** @type {ReturnType<typeof setTimeout> | 0} */
  let timer = 0;
  /** @type {(() => void) | null} */
  let onOk = null;
  /** @type {(() => void) | null} */
  let onErr = null;
  /** @type {(v?: void) => void} */
  let resolveFn = () => {};
  /** @type {(e: Error) => void} */
  let rejectFn = () => {};

  const cleanup = () => {
    if (timer) {
      clearTimeout(timer);
      timer = 0;
    }
    if (onOk) target.removeEventListener(name, onOk);
    if (onErr) target.removeEventListener('error', onErr);
    onOk = null;
    onErr = null;
  };

  const settle = (fn) => {
    if (settled) return;
    settled = true;
    cleanup();
    fn();
  };

  const promise = new Promise((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
    timer = setTimeout(() => {
      settle(() => reject(new Error(`${name} timeout`)));
    }, timeoutMs);
    onOk = () => settle(() => resolve());
    onErr = () => settle(() => reject(new Error(`${name} error`)));
    target.addEventListener(name, onOk);
    target.addEventListener('error', onErr);
  });

  return {
    promise,
    cancel() {
      // Resolve (not reject) so abandoned waits never surface as unhandledrejection.
      settle(() => resolveFn());
    }
  };
}

/** Wait until SourceBuffer is not updating (or give up quietly). */
async function waitSourceBufferIdle(sb, timeoutMs = 8000) {
  if (!sb || !sb.updating) return;
  const wait = waitEvent(sb, 'updateend', timeoutMs);
  try {
    // Updating may finish between the check and listener attach.
    if (!sb.updating) {
      wait.cancel();
      return;
    }
    await wait.promise;
  } catch {
    wait.cancel();
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {() => HTMLVideoElement | null | undefined} getVideo
 * @param {{ onStreamEnded?: () => void }} [options]
 */
export function createLiveMsePlayer(getVideo, options = {}) {
  /** @type {AbortController | null} */
  let abort = null;
  /** @type {MediaSource | null} */
  let mediaSource = null;
  /** @type {string | null} */
  let objectUrl = null;
  /** @type {SourceBuffer | null} */
  let sourceBuffer = null;
  /** @type {Uint8Array[]} */
  let queue = [];
  let stopped = true;
  let appendLoopRunning = false;
  let flushWaiters = [];
  let segmentCount = 0;
  let lastBufferEnd = 0;
  let stallTimer = 0;

  function video() {
    return getVideo?.() || null;
  }

  function wakeAppendLoop() {
    for (const w of flushWaiters) w();
    flushWaiters = [];
  }

  function waitForQueueWork() {
    if (queue.length || stopped) return Promise.resolve();
    return new Promise((resolve) => {
      flushWaiters.push(resolve);
    });
  }

  async function waitNotUpdating(sb) {
    while (sb && sb.updating && !stopped) {
      await waitSourceBufferIdle(sb, 8000);
      if (sb.updating && !stopped) await sleep(40);
    }
  }

  async function appendChunk(chunk) {
    const sb = sourceBuffer;
    if (!sb || stopped || !chunk?.length) return false;
    await waitNotUpdating(sb);
    if (stopped || !sourceBuffer) return false;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const wait = waitEvent(sb, 'updateend', 8000);
      try {
        sb.appendBuffer(chunk);
        // Append may complete before listener runs on some Chromium builds.
        if (!sb.updating) {
          wait.cancel();
          return true;
        }
        await wait.promise;
        return true;
      } catch {
        wait.cancel();
        // Quota / transient — trim then retry.
        try {
          await waitNotUpdating(sb);
          const v = video();
          if (v && v.buffered.length > 0 && !sb.updating) {
            const start = v.buffered.start(0);
            const end = v.buffered.end(v.buffered.length - 1);
            if (end - start > 1) {
              const trimTo = Math.max(start + 0.01, end - 0.8);
              const removeWait = waitEvent(sb, 'updateend', 8000);
              try {
                sb.remove(start, trimTo);
                if (!sb.updating) removeWait.cancel();
                else await removeWait.promise.catch(() => {});
              } catch {
                removeWait.cancel();
              }
            }
          }
        } catch {
          /* ignore */
        }
        await sleep(30);
      }
    }
    return false;
  }

  async function runAppendLoop() {
    if (appendLoopRunning) return;
    appendLoopRunning = true;
    try {
      while (!stopped) {
        await waitForQueueWork();
        if (stopped) break;
        const chunk = queue.shift();
        if (!chunk) continue;
        const ok = await appendChunk(chunk);
        if (ok) {
          segmentCount += 1;
          const v = video();
          if (v?.paused && segmentCount >= 1) {
            v.play().catch(() => {});
          }
          // Keep playback near the growing live edge without overseek.
          try {
            if (v && v.buffered.length) {
              const end = v.buffered.end(v.buffered.length - 1);
              lastBufferEnd = end;
              if (end - v.currentTime > 0.75) {
                v.currentTime = Math.max(0, end - 0.15);
              }
            }
          } catch {
            /* ignore */
          }
        }
      }
    } finally {
      appendLoopRunning = false;
    }
  }

  function enqueue(chunk) {
    if (stopped || !chunk?.length) return;
    queue.push(chunk);
    // Bound queue — prefer live over backlog.
    while (queue.length > 40) queue.shift();
    wakeAppendLoop();
  }

  function clearStallWatch() {
    if (stallTimer) {
      clearInterval(stallTimer);
      stallTimer = 0;
    }
  }

  function armStallWatch() {
    clearStallWatch();
    let frozenAt = 0;
    let lastEnd = -1;
    stallTimer = window.setInterval(() => {
      if (stopped) return;
      const v = video();
      if (!v || v.buffered.length === 0) return;
      let end = 0;
      try {
        end = v.buffered.end(v.buffered.length - 1);
      } catch {
        return;
      }
      if (end <= lastEnd + 0.01) {
        frozenAt += 1;
      } else {
        frozenAt = 0;
        lastEnd = end;
      }
      // Buffer not growing → peer stream died / stalled (also when frozen on frame 0).
      if (frozenAt >= 6 && segmentCount > 0) {
        try {
          options.onStreamEnded?.();
        } catch {
          /* ignore */
        }
      }
    }, 500);
  }

  async function stop() {
    stopped = true;
    clearStallWatch();
    wakeAppendLoop();
    try {
      abort?.abort();
    } catch {
      /* ignore */
    }
    abort = null;
    queue = [];
    segmentCount = 0;
    lastBufferEnd = 0;

    const v = video();
    const sb = sourceBuffer;
    if (sb && mediaSource?.readyState === 'open') {
      try {
        await waitNotUpdating(sb);
        mediaSource.removeSourceBuffer(sb);
      } catch {
        /* ignore */
      }
    }
    sourceBuffer = null;

    if (mediaSource && mediaSource.readyState === 'open') {
      try {
        mediaSource.endOfStream();
      } catch {
        /* ignore */
      }
    }
    mediaSource = null;

    if (objectUrl) {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        /* ignore */
      }
      objectUrl = null;
    }

    if (v) {
      try {
        v.pause();
      } catch {
        /* ignore */
      }
      try {
        v.removeAttribute('src');
        v.load();
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * @param {string} url
   */
  async function start(url) {
    await stop();
    const v = video();
    if (!v) throw new Error('No video element');
    if (typeof MediaSource === 'undefined') {
      throw new Error('MediaSource is not available');
    }

    stopped = false;
    abort = new AbortController();
    mediaSource = new MediaSource();
    objectUrl = URL.createObjectURL(mediaSource);
    v.src = objectUrl;

    {
      const openWait = waitEvent(mediaSource, 'sourceopen', 8000);
      try {
        if (mediaSource.readyState === 'open') openWait.cancel();
        else await openWait.promise;
      } catch (err) {
        openWait.cancel();
        throw err;
      }
    }
    if (stopped) return;

    const resp = await fetch(String(url), {
      signal: abort.signal,
      cache: 'no-store',
      headers: { Accept: 'video/mp4,*/*' }
    });
    if (!resp.ok) throw new Error(`Live stream HTTP ${resp.status}`);
    if (!resp.body) throw new Error('Live stream has no body');

    const reader = resp.body.getReader();
    let pending = new Uint8Array(0);
    /** @type {Uint8Array[]} */
    let initParts = [];
    let haveInit = false;
    /** @type {Uint8Array | null} */
    let pendingMoof = null;
    let ready = false;

    /** @type {() => void} */
    let resolveReady = () => {};
    /** @type {(e: Error) => void} */
    let rejectReady = () => {};
    const readyPromise = new Promise((resolve, reject) => {
      resolveReady = () => {
        if (ready) return;
        ready = true;
        resolve();
      };
      rejectReady = reject;
    });

    void runAppendLoop();
    armStallWatch();

    const ensureSourceBuffer = (initBytes) => {
      if (sourceBuffer || !mediaSource || mediaSource.readyState !== 'open') return;
      const preferred = mimeFromInit(initBytes);
      const codec = codecFromInit(initBytes);
      const candidates = [
        preferred,
        `video/mp4; codecs="${codec}, mp4a.40.2"`,
        `video/mp4; codecs="${codec}"`,
        'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
        'video/mp4; codecs="avc1.42E01E"',
        'video/mp4; codecs="avc1.4D401F, mp4a.40.2"',
        'video/mp4; codecs="avc1.4D401F"',
        'video/mp4; codecs="avc1.64001F, mp4a.40.2"',
        'video/mp4; codecs="avc1.64001F"',
        'video/mp4; codecs="avc1.640028"'
      ];
      const mime = candidates.find((m) => MediaSource.isTypeSupported(m));
      if (!mime) throw new Error(`Unsupported live codec: ${preferred}`);
      sourceBuffer = mediaSource.addSourceBuffer(mime);
      // sequence: ignore TFDT gaps from live restart / partial GOPs
      try {
        sourceBuffer.mode = 'sequence';
      } catch {
        /* ignore */
      }
    };

    const onBoxes = (boxes) => {
      for (const box of boxes) {
        if (!haveInit) {
          if (box.type === 'ftyp' || box.type === 'moov') {
            initParts.push(box.bytes);
          }
          if (box.type === 'moov') {
            let total = 0;
            for (const p of initParts) total += p.length;
            const init = new Uint8Array(total);
            let o = 0;
            for (const p of initParts) {
              init.set(p, o);
              o += p.length;
            }
            ensureSourceBuffer(init);
            enqueue(init);
            haveInit = true;
            initParts = [];
          }
          continue;
        }

        if (box.type === 'moof') {
          pendingMoof = box.bytes;
          continue;
        }
        if (box.type === 'mdat' && pendingMoof) {
          enqueue(concatBytes(pendingMoof, box.bytes));
          pendingMoof = null;
          resolveReady();
        }
      }
    };

    void (async () => {
      try {
        while (!stopped) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value?.byteLength) continue;
          pending = concatBytes(pending, value);
          const { boxes, rest } = takeCompleteBoxes(pending);
          pending = rest;
          if (boxes.length) onBoxes(boxes);
        }
        if (!stopped) {
          try {
            options.onStreamEnded?.();
          } catch {
            /* ignore */
          }
        }
      } catch (err) {
        if (!stopped && !abort?.signal.aborted) {
          rejectReady(err instanceof Error ? err : new Error(String(err)));
          try {
            options.onStreamEnded?.();
          } catch {
            /* ignore */
          }
        }
      }
    })();

    const timeout = sleep(8000).then(() => {
      if (!ready) throw new Error('Live stream start timeout');
    });
    await Promise.race([readyPromise, timeout]);
    if (!haveInit) throw new Error('Live stream missing init segment');

    try {
      await v.play();
    } catch {
      /* autoplay may be blocked briefly */
    }
  }

  return {
    start,
    stop,
    get active() {
      return !stopped && Boolean(mediaSource);
    },
    get segments() {
      return segmentCount;
    }
  };
}
