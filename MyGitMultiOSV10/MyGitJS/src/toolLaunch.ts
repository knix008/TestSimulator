export type ToolRequest =
  | { kind: "diff"; sha: string; file: string }
  | { kind: "merge"; file: string };

export function parseToolHash(hash: string): ToolRequest | null {
  if (!hash.startsWith("#tool?")) return null;
  const params = new URLSearchParams(hash.slice("#tool?".length));
  const file = params.get("file") ?? "";
  if (!file) return null;
  if (params.get("kind") === "diff") {
    const sha = params.get("sha") ?? "";
    return sha ? { kind: "diff", sha, file } : null;
  }
  if (params.get("kind") === "merge") return { kind: "merge", file };
  return null;
}

export function toolHash(request: ToolRequest): string {
  const params = new URLSearchParams();
  params.set("kind", request.kind);
  params.set("file", request.file);
  if (request.kind === "diff") params.set("sha", request.sha);
  return `#tool?${params.toString()}`;
}

export function readToolRequest(): ToolRequest | null {
  return parseToolHash(location.hash);
}

const openedTools = new Map<string, Window>();

export function openToolWindow(request: ToolRequest): boolean {
  const url = `${location.origin}${location.pathname}${location.search}${toolHash(request)}`;
  if (window.mygit?.openTool) {
    void window.mygit.openTool(url, request.kind);
    return true;
  }
  const name = request.kind === "merge" ? "mygit-merge" : "mygit-diff";
  const opened = window.open(url, name, "popup=yes,width=1100,height=760");
  if (!opened) return false;
  openedTools.set(name, opened);
  opened.focus();
  return true;
}

function closeOpenedTools(): void {
  for (const opened of openedTools.values()) {
    if (!opened.closed) opened.close();
  }
  openedTools.clear();
}

if (typeof window !== "undefined" && !readToolRequest()) {
  window.addEventListener("pagehide", closeOpenedTools);
}
