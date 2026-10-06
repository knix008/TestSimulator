/**
 * The session catalogue.
 *
 * A session is a kind of comparison — two folders, two files, three files being
 * merged, two pictures — together with the paths it was opened on. Naming the kinds
 * in one table is what lets the start screen, the session panel, the recent list and
 * the saved-session store all speak about the same things: add a kind here and all
 * four learn it at once.
 *
 * `inputs` is how many paths the kind takes, and `command` is the action that opens
 * one, so the start screen needs no table of its own.
 */

export type SessionKind =
  | "folder-compare"
  | "folder-sync"
  | "text-compare"
  | "text-merge"
  | "conflict"
  | "image-compare"
  | "hex-compare"
  | "table-compare"
  | "audio-compare"
  | "version-compare"
  | "registry-compare"
  | "ftp-compare"
  | "repository";

export type SessionType = {
  kind: SessionKind;
  /** Korean and English names, as everywhere else in the app. */
  ko: string;
  en: string;
  koHint: string;
  enHint: string;
  icon: string;
  /** How many paths the session is opened on. */
  inputs: number;
  /** The command that opens one. */
  command: string;
};

export const SESSION_TYPES: SessionType[] = [
  {
    kind: "folder-compare",
    ko: "폴더 비교",
    en: "Folder Compare",
    koHint: "두 폴더의 내용을 트리로 나란히 비교합니다",
    enHint: "Compare two folders side by side as trees",
    icon: "folders",
    inputs: 2,
    command: "file.compareDirectories",
  },
  {
    kind: "folder-sync",
    ko: "폴더 동기화",
    en: "Folder Sync",
    koHint: "두 폴더를 미러 · 업데이트 · 양방향으로 맞춥니다",
    enHint: "Mirror, update or two-way sync a pair of folders",
    icon: "sync",
    inputs: 2,
    command: "file.syncDirectories",
  },
  {
    kind: "text-compare",
    ko: "텍스트 비교",
    en: "Text Compare",
    koHint: "두 파일을 줄 단위 · 단어 단위로 비교합니다",
    enHint: "Compare two files line by line and word by word",
    icon: "compareFiles",
    inputs: 2,
    command: "file.compareFiles",
  },
  {
    kind: "text-merge",
    ko: "텍스트 병합",
    en: "Text Merge",
    koHint: "Base · 내 것 · 상대 것을 3-way로 병합합니다",
    enHint: "Merge base, local and remote three ways",
    icon: "merge",
    inputs: 4,
    command: "file.openThreeWay",
  },
  {
    kind: "conflict",
    ko: "충돌 파일",
    en: "Conflict File",
    koHint: "충돌 표시가 들어 있는 파일을 풀어서 엽니다",
    enHint: "Open a file that already carries conflict markers",
    icon: "conflict",
    inputs: 1,
    command: "file.openConflict",
  },
  {
    kind: "image-compare",
    ko: "이미지 비교",
    en: "Picture Compare",
    koHint: "두 그림을 나란히 · 겹쳐서 · 차이만 보기로 비교합니다",
    enHint: "Compare two pictures side by side, blended or as a difference map",
    icon: "image",
    inputs: 2,
    command: "file.compareImages",
  },
  {
    kind: "hex-compare",
    ko: "16진수 비교",
    en: "Hex Compare",
    koHint: "두 파일을 바이트 단위로 비교합니다",
    enHint: "Compare two files byte by byte",
    icon: "hex",
    inputs: 2,
    command: "file.compareHex",
  },
  {
    kind: "table-compare",
    ko: "표 비교",
    en: "Table Compare",
    koHint: "CSV · TSV 를 셀 단위로 맞춰서 비교합니다",
    enHint: "Compare CSV and TSV cell by cell, with the columns lined up",
    icon: "grid",
    inputs: 2,
    command: "file.compareTable",
  },
  {
    kind: "audio-compare",
    ko: "오디오 태그 비교",
    en: "Audio Tag Compare",
    koHint: "MP3 의 제목 · 아티스트 · 비트레이트를 비교합니다",
    enHint: "Compare the title, artist and bit rate of two MP3s",
    icon: "music",
    inputs: 2,
    command: "file.compareAudio",
  },
  {
    kind: "version-compare",
    ko: "버전 정보 비교",
    en: "Version Compare",
    koHint: "실행 파일 · package.json 의 버전 정보를 비교합니다",
    enHint: "Compare the version information of two executables or manifests",
    icon: "about",
    inputs: 2,
    command: "file.compareVersion",
  },
  {
    kind: "registry-compare",
    ko: "레지스트리 비교",
    en: "Registry Compare",
    koHint: ".reg 내보내기 파일을 키 단위로 비교합니다",
    enHint: "Compare two .reg exports key by key",
    icon: "settings",
    inputs: 2,
    command: "file.compareRegistry",
  },
  {
    kind: "ftp-compare",
    ko: "FTP 비교",
    en: "FTP Compare",
    koHint: "내 폴더와 FTP · FTPS 서버의 폴더를 비교합니다",
    enHint: "Compare a folder here with one on an FTP or FTPS server",
    icon: "cloud",
    inputs: 2,
    command: "file.compareRemote",
  },
  {
    kind: "repository",
    ko: "Git 저장소",
    en: "Git Repository",
    koHint: "작업 트리의 변경과 이력을 엽니다",
    enHint: "Open a working tree's changes and history",
    icon: "repository",
    inputs: 1,
    command: "file.openRepository",
  },
];

const BY_KIND = new Map(SESSION_TYPES.map((type) => [type.kind, type]));

export function sessionType(kind: unknown): SessionType | null {
  return typeof kind === "string" ? BY_KIND.get(kind as SessionKind) ?? null : null;
}

/** A session the user named and kept. */
export type SavedSession = {
  id: string;
  name: string;
  kind: SessionKind;
  paths: string[];
  /** When it was last opened, so the list can be most-recent-first. */
  at: number;
};

export const MAX_SAVED_SESSIONS = 100;

/** Drops anything that is not a session we could actually reopen. */
export function sanitizeSessions(value: unknown): SavedSession[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: SavedSession[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Partial<SavedSession>;
    const type = sessionType(entry.kind);
    if (!type) continue;
    const paths = Array.isArray(entry.paths) ? entry.paths.filter((p): p is string => typeof p === "string") : [];
    if (paths.length < type.inputs) continue;
    const id = typeof entry.id === "string" && entry.id ? entry.id : `${entry.kind}:${paths.join("|")}`;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push({
      id,
      name: typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : defaultSessionName(paths),
      kind: type.kind,
      paths,
      at: Number.isFinite(Number(entry.at)) ? Number(entry.at) : 0,
    });
  }
  return result.sort((a, b) => b.at - a.at).slice(0, MAX_SAVED_SESSIONS);
}

/** "left.txt ↔ right.txt" — what a session is called when nobody named it. */
export function defaultSessionName(paths: string[]): string {
  const names = paths.slice(0, 2).map((item) => item.split(/[\\/]/).filter(Boolean).pop() ?? item);
  return names.length > 1 ? `${names[0]} ↔ ${names[1]}` : names[0] ?? "";
}
