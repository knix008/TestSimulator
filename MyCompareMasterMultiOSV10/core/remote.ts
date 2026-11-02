/**
 * A folder on an FTP server, as something a comparison can walk.
 *
 * A remote comparison is deliberately not a download. Walking the tree costs one
 * listing per folder and nothing else: sizes and timestamps come from the listing,
 * and that is what the two sides are matched on. A file is only fetched when
 * somebody opens it — or when they ask for the contents to be compared, which is
 * the slow, honest option rather than the default.
 *
 * A remote root is written as a URL: `ftp://user@host:21/pub/project`. The password
 * never goes in it; it comes from the saved connection.
 */
import { FtpClient, type FtpConfig, type RemoteEntry } from "./ftp.js";
import { ApiError } from "./errors.js";

export type RemoteRoot = {
  protocol: "ftp" | "ftps";
  host: string;
  port: number;
  user: string;
  /** The folder on the server, always starting with a slash. */
  path: string;
};

export type RemoteFile = {
  /** Path relative to the root, forward slashes. */
  rel: string;
  size: number;
  modified: number | null;
};

/** True when this looks like a remote root rather than a path on disk. */
export function isRemotePath(target: string): boolean {
  return /^ftps?:\/\//i.test(target.trim());
}

/**
 * `ftp://user@host:2121/pub` taken apart.
 *
 * The user is optional and defaults to anonymous, which is what a public server
 * expects, and the port defaults to 21.
 */
export function parseRemotePath(target: string): RemoteRoot {
  const match = /^(ftps?):\/\/(?:([^@/]+)@)?([^:/]+)(?::(\d+))?(\/.*)?$/i.exec(target.trim());
  if (!match) throw new ApiError(`Not a remote folder: ${target}`, "BAD_REMOTE", 400);
  const [, protocol, user, host, port, path] = match;
  return {
    protocol: protocol.toLowerCase() as "ftp" | "ftps",
    host,
    port: port ? Number(port) : 21,
    user: user ? decodeURIComponent(user) : "anonymous",
    path: normalizeRemote(path ?? "/"),
  };
}

export function formatRemotePath(root: RemoteRoot): string {
  const user = root.user && root.user !== "anonymous" ? `${encodeURIComponent(root.user)}@` : "";
  const port = root.port === 21 ? "" : `:${root.port}`;
  return `${root.protocol}://${user}${root.host}${port}${root.path}`;
}

/** No trailing slash, no doubled ones, always a leading one. */
export function normalizeRemote(path: string): string {
  const cleaned = `/${path}`.replace(/\/+/g, "/").replace(/\/$/, "");
  return cleaned === "" ? "/" : cleaned;
}

export function joinRemote(base: string, name: string): string {
  return normalizeRemote(`${base}/${name}`);
}

/** How deep a walk will go, so a symlink loop cannot run forever. */
const MAX_DEPTH = 24;
/** And how many files, matching the local walker's own ceiling. */
const MAX_FILES = 50_000;

/**
 * An open connection to one server, which several operations share.
 *
 * Connecting is the expensive part of FTP, so a walk, the files it then opens and
 * any copying all go through the same session rather than reconnecting each time.
 */
export class RemoteSession {
  readonly root: RemoteRoot;
  private readonly client: FtpClient;
  private connected = false;

  constructor(root: RemoteRoot, password: string, options: Partial<FtpConfig> = {}) {
    this.root = root;
    this.client = new FtpClient({
      host: root.host,
      port: root.port,
      user: root.user,
      password,
      secure: root.protocol === "ftps",
      ...options,
    });
  }

  async open(): Promise<void> {
    if (this.connected) return;
    await this.client.connect();
    this.connected = true;
  }

  close(): void {
    if (!this.connected) return;
    this.client.close();
    this.connected = false;
  }

  /** One folder's entries, as the server reports them. */
  async list(relative = ""): Promise<RemoteEntry[]> {
    await this.open();
    return this.client.list(joinRemote(this.root.path, relative));
  }

  /**
   * Every file under the root, depth first.
   *
   * Folders that cannot be listed are skipped rather than failing the walk: one
   * unreadable folder on a server is not a reason to refuse the comparison.
   */
  async walk(
    skip: ReadonlySet<string> = new Set(),
    keep: (name: string) => boolean = () => true,
  ): Promise<Map<string, RemoteFile>> {
    await this.open();
    const files = new Map<string, RemoteFile>();
    const stack: { rel: string; depth: number }[] = [{ rel: "", depth: 0 }];

    while (stack.length > 0) {
      const { rel, depth } = stack.pop() as { rel: string; depth: number };
      if (depth > MAX_DEPTH) continue;

      let entries: RemoteEntry[];
      try {
        entries = await this.client.list(joinRemote(this.root.path, rel));
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (skip.has(entry.name.toLowerCase())) continue;
        const childRel = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.directory) {
          stack.push({ rel: childRel, depth: depth + 1 });
          continue;
        }
        if (!keep(entry.name)) continue;
        files.set(childRel.toLowerCase(), { rel: childRel, size: entry.size, modified: entry.modified });
        if (files.size >= MAX_FILES) return files;
      }
    }

    return files;
  }

  async read(relative: string): Promise<Uint8Array> {
    await this.open();
    return this.client.download(joinRemote(this.root.path, relative));
  }

  async write(relative: string, data: Uint8Array): Promise<void> {
    await this.open();
    await this.makeParents(relative);
    await this.client.upload(joinRemote(this.root.path, relative), data);
  }

  async remove(relative: string): Promise<void> {
    await this.open();
    await this.client.remove(joinRemote(this.root.path, relative));
  }

  /** Creates each folder on the way to a file, which FTP has no single command for. */
  private async makeParents(relative: string): Promise<void> {
    const parts = relative.split("/").slice(0, -1);
    let walked = "";
    for (const part of parts) {
      walked = walked ? `${walked}/${part}` : part;
      await this.client.makeDirectory(joinRemote(this.root.path, walked)).catch(() => {});
    }
  }
}
