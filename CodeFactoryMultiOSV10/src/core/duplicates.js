// Duplicate code detection.
//
// Two-phase, the same shape as the Windows build: normalize every line, index
// every window of `minDuplicateLines` consecutive significant lines by hash,
// then grow each repeated window into the longest block that still matches
// everywhere it occurs.

const LIMITS = {
  maxGroups: 2000,
  maxWindowMapEntries: 200_000,
  maxWindowsPerFile: 12_000,
  maxLinesPerFile: 8000,
  maxBlockLines: 300,
  maxCandidates: 4000,
};

/**
 * Normalizes a line so that formatting and identifier renames do not hide a
 * copy: whitespace collapses, string and numeric literals become placeholders.
 */
export function normalizeLine(line) {
  return line
    .replace(/\r$/, '')
    .replace(/\/\/.*$/, '')
    .replace(/#.*$/, '')
    .replace(/"(?:[^"\\]|\\.)*"/g, '"§"')
    .replace(/'(?:[^'\\]|\\.)*'/g, "'§'")
    .replace(/\b\d+(?:\.\d+)?\b/g, '§n')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lines too trivial to anchor a duplicate group (braces, `end`, blank). */
export function isSignificantLine(normalized) {
  if (!normalized) return false;
  if (normalized.length < 4) return false;
  if (/^[{}()\[\];,.]+$/.test(normalized)) return false;
  if (/^(?:end|else|break|continue|return|pass|fi|done|\}\s*else\s*\{)$/i.test(normalized)) return false;
  return true;
}

/**
 * @param {Array<{path:string, languageId:string, text:string}>} files
 * @param {number} minDuplicateLines
 * @returns {{minDuplicateLines:number, groups:object[], totalDuplicateLines:number, byFile:Map}}
 */
export function findDuplicates(files, minDuplicateLines, onProgress) {
  const minLines = Math.min(200, Math.max(2, Number(minDuplicateLines) || 10));

  const prepared = [];
  for (const file of files) {
    if (!file.text) continue;
    const raw = file.text.split('\n');
    if (raw.length > LIMITS.maxLinesPerFile) continue;
    const normalized = raw.map(normalizeLine);
    prepared.push({ path: file.path, languageId: file.languageId, raw, normalized });
  }
  if (prepared.length === 0) return emptyResult(minLines);

  if (onProgress) onProgress('중복 코드: 윈도우 인덱싱 중...');

  /** @type {Map<string, Array<{fileIndex:number, start:number}>>} */
  const windowMap = new Map();
  let mapFull = false;

  for (let fileIndex = 0; fileIndex < prepared.length && !mapFull; fileIndex++) {
    const file = prepared[fileIndex];
    if (file.normalized.length < minLines) continue;

    let windows = 0;
    for (let start = 0; start + minLines <= file.normalized.length; start++) {
      if (!isSignificantLine(file.normalized[start])) continue;

      const key = windowKey(file.normalized, start, minLines);
      if (!key) continue;

      let list = windowMap.get(key);
      if (!list) {
        if (windowMap.size >= LIMITS.maxWindowMapEntries) {
          mapFull = true;
          break;
        }
        list = [];
        windowMap.set(key, list);
      }
      list.push({ fileIndex, start });

      if (++windows >= LIMITS.maxWindowsPerFile) break;
    }
  }

  if (onProgress) onProgress('중복 코드: 그룹을 구성하는 중...');

  const candidates = [...windowMap.entries()]
    .filter(([, occurrences]) => occurrences.length > 1)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, LIMITS.maxCandidates);

  const claimed = prepared.map((file) => new Uint8Array(file.normalized.length));
  const groups = [];

  for (const [, occurrences] of candidates) {
    if (groups.length >= LIMITS.maxGroups) break;

    // Skip windows already absorbed by a longer group.
    const fresh = occurrences.filter((occ) => !claimed[occ.fileIndex][occ.start]);
    if (fresh.length < 2) continue;

    const length = growBlock(prepared, fresh, minLines);
    if (length < minLines) continue;

    // A block that repeats inside one file still counts, but two occurrences
    // that overlap each other do not.
    const accepted = [];
    for (const occ of fresh) {
      if (accepted.some((a) => a.fileIndex === occ.fileIndex && Math.abs(a.start - occ.start) < length)) continue;
      accepted.push(occ);
    }
    if (accepted.length < 2) continue;

    for (const occ of accepted) {
      for (let i = 0; i < length; i++) claimed[occ.fileIndex][occ.start + i] = 1;
    }

    const first = prepared[accepted[0].fileIndex];
    groups.push({
      id: 'dup-' + groups.length,
      lineCount: length,
      occurrenceCount: accepted.length,
      duplicateLines: first.raw.slice(accepted[0].start, accepted[0].start + length),
      sampleLines: first.raw.slice(accepted[0].start, accepted[0].start + Math.min(8, length)),
      fragments: accepted.map((occ) => ({
        filePath: prepared[occ.fileIndex].path,
        languageId: prepared[occ.fileIndex].languageId,
        startLine: occ.start + 1,
        endLine: occ.start + length,
      })),
    });
  }

  groups.sort((a, b) => b.lineCount * b.occurrenceCount - a.lineCount * a.occurrenceCount);

  // Duplicate line counts per file — every occurrence beyond the first is waste.
  const byFile = new Map();
  let totalDuplicateLines = 0;
  for (const group of groups) {
    group.fragments.forEach((fragment, index) => {
      if (index === 0) return;
      byFile.set(fragment.filePath, (byFile.get(fragment.filePath) || 0) + group.lineCount);
      totalDuplicateLines += group.lineCount;
    });
  }

  return { minDuplicateLines: minLines, groups, totalDuplicateLines, byFile };
}

function emptyResult(minLines) {
  return { minDuplicateLines: minLines, groups: [], totalDuplicateLines: 0, byFile: new Map() };
}

function windowKey(normalized, start, length) {
  let significant = 0;
  const parts = [];
  for (let i = 0; i < length; i++) {
    const line = normalized[start + i];
    if (isSignificantLine(line)) significant++;
    parts.push(line);
  }
  // A window of mostly braces is noise, not a duplicate.
  if (significant < Math.max(2, Math.ceil(length / 2))) return '';
  return parts.join('\n');
}

/** Extends a matching window as far as every occurrence keeps agreeing. */
function growBlock(prepared, occurrences, minLines) {
  let length = minLines;
  while (length < LIMITS.maxBlockLines) {
    const base = prepared[occurrences[0].fileIndex];
    const nextIndex = occurrences[0].start + length;
    if (nextIndex >= base.normalized.length) break;
    const nextLine = base.normalized[nextIndex];

    let allMatch = true;
    for (let i = 1; i < occurrences.length; i++) {
      const other = prepared[occurrences[i].fileIndex];
      const idx = occurrences[i].start + length;
      if (idx >= other.normalized.length || other.normalized[idx] !== nextLine) {
        allMatch = false;
        break;
      }
    }
    if (!allMatch) break;
    length++;
  }
  return length;
}
