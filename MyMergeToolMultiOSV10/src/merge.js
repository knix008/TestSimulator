(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.MergeEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DEFAULT_LABELS = { local: "LOCAL", base: "BASE", remote: "REMOTE" };

  function splitLines(text) {
    const norm = String(text == null ? "" : text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const trailing = norm.endsWith("\n");
    const body = trailing ? norm.slice(0, -1) : norm;
    return { lines: body === "" ? [] : body.split("\n"), trailing };
  }

  function joinLines(lines, trailing) {
    if (!lines.length) return trailing ? "\n" : "";
    return lines.join("\n") + (trailing ? "\n" : "");
  }

  function diffLines(a, b) {
    if (a.length * b.length > 2000000) return coarseDiff(a, b);
    return lcsDiff(a, b);
  }

  function coarseDiff(a, b) {
    let start = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
    let aEnd = a.length - 1;
    let bEnd = b.length - 1;
    const suffix = [];
    while (aEnd >= start && bEnd >= start && a[aEnd] === b[bEnd]) {
      suffix.push({ op: "equal", a: aEnd, b: bEnd, text: a[aEnd] });
      aEnd -= 1;
      bEnd -= 1;
    }
    const out = [];
    for (let i = 0; i < start; i += 1) out.push({ op: "equal", a: i, b: i, text: a[i] });
    for (let i = start; i <= aEnd; i += 1) out.push({ op: "delete", a: i, text: a[i] });
    for (let i = start; i <= bEnd; i += 1) out.push({ op: "insert", b: i, text: b[i] });
    suffix.reverse();
    return out.concat(suffix);
  }

  function lcsDiff(a, b) {
    const n = a.length;
    const m = b.length;
    const width = m + 1;
    const dp = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        if (a[i] === b[j]) dp[i * width + j] = dp[(i + 1) * width + j + 1] + 1;
        else dp[i * width + j] = Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
      }
    }
    const out = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        out.push({ op: "equal", a: i, b: j, text: a[i] });
        i += 1;
        j += 1;
      } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
        out.push({ op: "delete", a: i, text: a[i] });
        i += 1;
      } else {
        out.push({ op: "insert", b: j, text: b[j] });
        j += 1;
      }
    }
    while (i < n) {
      out.push({ op: "delete", a: i, text: a[i] });
      i += 1;
    }
    while (j < m) {
      out.push({ op: "insert", b: j, text: b[j] });
      j += 1;
    }
    return out;
  }

  function changeIntervals(base, side) {
    const edits = diffLines(base, side);
    const intervals = [];
    let pending = null;
    let nextBase = 0;
    const flush = () => {
      if (!pending) return;
      intervals.push(pending);
      pending = null;
    };
    edits.forEach((edit) => {
      if (edit.op === "equal") {
        flush();
        nextBase = edit.a + 1;
        return;
      }
      if (edit.op === "delete") {
        if (!pending) pending = { lo: edit.a, hi: edit.a + 1, lines: [] };
        else pending.hi = edit.a + 1;
        nextBase = edit.a + 1;
        return;
      }
      if (!pending) pending = { lo: nextBase, hi: nextBase, lines: [] };
      pending.lines.push(edit.text);
    });
    flush();
    return intervals;
  }

  function rangesOverlap(a, b) {
    if (a.lo === a.hi && b.lo === b.hi) return a.lo === b.lo;
    if (a.lo === a.hi) return a.lo >= b.lo && a.lo < b.hi;
    if (b.lo === b.hi) return b.lo >= a.lo && b.lo < a.hi;
    return a.lo < b.hi && b.lo < a.hi;
  }

  function unify(localIntervals, remoteIntervals) {
    const items = localIntervals.map((it) => ({ side: "L", it })).concat(remoteIntervals.map((it) => ({ side: "R", it })));
    items.sort((a, b) => a.it.lo - b.it.lo || a.it.hi - b.it.hi || (a.side === "L" ? -1 : 1));
    const regions = [];
    items.forEach((item) => {
      const last = regions[regions.length - 1];
      if (last && rangesOverlap(last, item.it)) {
        last.lo = Math.min(last.lo, item.it.lo);
        last.hi = Math.max(last.hi, item.it.hi);
        last[item.side].push(item.it);
      } else {
        regions.push({
          lo: item.it.lo,
          hi: item.it.hi,
          L: item.side === "L" ? [item.it] : [],
          R: item.side === "R" ? [item.it] : [],
        });
      }
    });
    return regions;
  }

  function materialize(intervals, lo, hi, base) {
    const relevant = intervals.filter((it) => {
      if (it.lo === it.hi) return it.lo >= lo && it.lo <= hi && (it.lo < hi || lo === hi);
      return it.lo < hi && it.hi > lo;
    }).sort((a, b) => a.lo - b.lo || a.hi - b.hi);
    const out = [];
    let cursor = lo;
    relevant.forEach((it) => {
      const from = Math.max(it.lo, lo);
      if (from > cursor) out.push.apply(out, base.slice(cursor, from));
      out.push.apply(out, it.lines);
      cursor = Math.max(cursor, Math.min(Math.max(it.hi, it.lo), hi));
    });
    if (cursor < hi) out.push.apply(out, base.slice(cursor, hi));
    return out;
  }

  function sameLines(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
    return true;
  }

  function markerLines(local, base, remote, labels) {
    return ["<<<<<<< " + labels.local]
      .concat(local)
      .concat(["||||||| " + labels.base])
      .concat(base)
      .concat(["======="])
      .concat(remote)
      .concat([">>>>>>> " + labels.remote]);
  }

  function mergeLines(base, local, remote, labels) {
    const names = Object.assign({}, DEFAULT_LABELS, labels || {});
    const regions = unify(changeIntervals(base, local), changeIntervals(base, remote));
    const hunks = [];
    let cursor = 0;
    regions.forEach((region) => {
      if (region.lo > cursor) {
        hunks.push({ type: "equal", lo: cursor, hi: region.lo, lines: base.slice(cursor, region.lo) });
      }
      const localLines = materialize(region.L, region.lo, region.hi, base);
      const remoteLines = materialize(region.R, region.lo, region.hi, base);
      const baseLines = base.slice(region.lo, region.hi);
      const localSame = sameLines(localLines, baseLines);
      const remoteSame = sameLines(remoteLines, baseLines);
      const bothSame = sameLines(localLines, remoteLines);
      let type = "conflict";
      let lines = null;
      if (localSame && remoteSame) type = "equal";
      else if (!localSame && remoteSame) type = "local";
      else if (localSame && !remoteSame) type = "remote";
      else if (bothSame) type = "both";
      if (type === "equal") lines = baseLines;
      else if (type === "local" || type === "both") lines = localLines;
      else if (type === "remote") lines = remoteLines;
      const hunk = {
        type: type,
        lo: region.lo,
        hi: region.hi,
        lines: lines,
        local: localLines,
        remote: remoteLines,
        base: baseLines,
      };
      if (type === "conflict") hunk.lines = markerLines(localLines, baseLines, remoteLines, names);
      hunks.push(hunk);
      cursor = region.hi;
    });
    if (cursor < base.length) {
      hunks.push({ type: "equal", lo: cursor, hi: base.length, lines: base.slice(cursor) });
    }
    return hunks;
  }

  function merge3(base, local, remote, labels) {
    const b = splitLines(base);
    const l = splitLines(local);
    const r = splitLines(remote);
    const names = Object.assign({}, DEFAULT_LABELS, labels || {});
    const hunks = mergeLines(b.lines, l.lines, r.lines, names);
    const lines = [];
    hunks.forEach((hunk) => lines.push.apply(lines, hunk.lines));
    const trailing = b.trailing || l.trailing || r.trailing;
    return {
      text: joinLines(lines, trailing),
      lines: lines,
      hunks: hunks,
      conflicts: hunks.filter((hunk) => hunk.type === "conflict").length,
      labels: names,
    };
  }

  function parseConflicts(text) {
    const split = splitLines(text);
    const lines = split.lines;
    const parts = [];
    const conflicts = [];
    let plain = [];
    let cursor = 0;
    const lineWidth = (line, index) => line.length + ((index < lines.length - 1 || split.trailing) ? 1 : 0);
    const flushPlain = () => {
      if (!plain.length) return;
      parts.push({ type: "text", lines: plain });
      plain = [];
    };
    let i = 0;
    while (i < lines.length) {
      if (lines[i].startsWith("<<<<<<<")) {
        flushPlain();
        const start = cursor;
        const localLabel = lines[i].slice(7).trim() || DEFAULT_LABELS.local;
        cursor += lineWidth(lines[i], i);
        i += 1;
        const local = [];
        const base = [];
        const remote = [];
        let mode = "local";
        while (i < lines.length && !lines[i].startsWith(">>>>>>>")) {
          if (mode === "local" && lines[i].startsWith("|||||||")) {
            mode = "base";
          } else if (lines[i] === "=======" || lines[i].startsWith("======= ")) {
            mode = "remote";
          } else if (mode === "local") local.push(lines[i]);
          else if (mode === "base") base.push(lines[i]);
          else remote.push(lines[i]);
          cursor += lineWidth(lines[i], i);
          i += 1;
        }
        const remoteLabel = i < lines.length ? (lines[i].slice(7).trim() || DEFAULT_LABELS.remote) : DEFAULT_LABELS.remote;
        if (i < lines.length) {
          cursor += lineWidth(lines[i], i);
          i += 1;
        }
        const conflict = { local: local, base: base, remote: remote, localLabel: localLabel, remoteLabel: remoteLabel, start: start, end: cursor };
        conflicts.push(conflict);
        parts.push({ type: "conflict", index: conflicts.length - 1, conflict: conflict });
      } else {
        plain.push(lines[i]);
        cursor += lineWidth(lines[i], i);
        i += 1;
      }
    }
    flushPlain();
    return { parts: parts, conflicts: conflicts, trailing: split.trailing, lines: lines };
  }

  function choiceLines(conflict, choice) {
    if (choice === "local") return conflict.local.slice();
    if (choice === "remote") return conflict.remote.slice();
    if (choice === "base") return conflict.base.slice();
    if (choice === "both") return conflict.local.concat(conflict.remote);
    throw new Error("Unknown choice: " + choice);
  }

  function serializeConflict(conflict) {
    return markerLines(conflict.local, conflict.base, conflict.remote, {
      local: conflict.localLabel || DEFAULT_LABELS.local,
      base: DEFAULT_LABELS.base,
      remote: conflict.remoteLabel || DEFAULT_LABELS.remote,
    });
  }

  function applyChoice(text, index, choice) {
    const parsed = parseConflicts(text);
    if (!parsed.conflicts[index]) {
      const error = new Error("Conflict index out of range: " + index);
      error.code = "CONFLICT_INDEX";
      throw error;
    }
    const lines = [];
    parsed.parts.forEach((part) => {
      if (part.type === "text") lines.push.apply(lines, part.lines);
      else if (part.index === index) lines.push.apply(lines, choiceLines(part.conflict, choice));
      else lines.push.apply(lines, serializeConflict(part.conflict));
    });
    return joinLines(lines, parsed.trailing);
  }

  function looksConflicted(text) {
    const value = String(text || "");
    return value.startsWith("<<<<<<<") || value.indexOf("\n<<<<<<<") >= 0;
  }

  return {
    DEFAULT_LABELS: DEFAULT_LABELS,
    splitLines: splitLines,
    joinLines: joinLines,
    diffLines: diffLines,
    changeIntervals: changeIntervals,
    merge3: merge3,
    parseConflicts: parseConflicts,
    applyChoice: applyChoice,
    looksConflicted: looksConflicted,
    choiceLines: choiceLines,
  };
});
