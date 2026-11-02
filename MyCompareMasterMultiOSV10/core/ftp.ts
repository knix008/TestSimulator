/**
 * An FTP client, written out rather than brought in.
 *
 * FTP is a line protocol over one socket, with a second socket opened per transfer.
 * That is small enough to write, and writing it keeps the installer free of a
 * dependency tree for a feature most people will never switch on. FTPS — the same
 * protocol with `AUTH TLS` before the login — is the same code with the socket
 * upgraded, so both are here; SSH is a different thing entirely and SFTP is not.
 *
 * Only what a comparison needs: log in, list recursively, read a file, write one,
 * delete one, make a folder. No resuming, no ASCII mode — everything is binary,
 * because a comparison that silently rewrote line endings in transit would be
 * comparing something other than what is on the server.
 */
import net from "node:net";
import tls from "node:tls";
import { ApiError } from "./errors.js";

export type FtpConfig = {
  host: string;
  port?: number;
  user?: string;
  password?: string;
  /** Explicit TLS: connect in the clear, then `AUTH TLS` before logging in. */
  secure?: boolean;
  /** Accept a self-signed certificate, which most private servers have. */
  allowSelfSigned?: boolean;
  /** How long any one command may take. */
  timeoutMs?: number;
};

export type RemoteEntry = {
  name: string;
  directory: boolean;
  size: number;
  /** Milliseconds, or null when the listing did not say. */
  modified: number | null;
};

const DEFAULT_TIMEOUT = 20_000;

export class FtpClient {
  private socket: net.Socket | tls.TLSSocket | null = null;
  private buffer = "";
  private readonly config: FtpConfig;
  /** Resolves the command in flight; FTP allows exactly one at a time. */
  private pending: ((reply: Reply) => void) | null = null;
  private failed: ((error: Error) => void) | null = null;

  constructor(config: FtpConfig) {
    this.config = config;
  }

  get timeout(): number {
    return this.config.timeoutMs ?? DEFAULT_TIMEOUT;
  }

  /* ---------------------------------------------------- connecting */

  async connect(): Promise<void> {
    const port = this.config.port ?? 21;
    this.socket = await open(this.config.host, port, this.timeout);
    this.listen();

    const greeting = await this.read();
    expect(greeting, 220);

    if (this.config.secure) {
      expect(await this.send("AUTH TLS"), 234);
      this.socket = await upgrade(this.socket, this.config.host, this.config.allowSelfSigned === true);
      this.listen();
      // The data channel has to be protected too, or the listing crosses in clear.
      expect(await this.send("PBSZ 0"), 200);
      expect(await this.send("PROT P"), 200);
    }

    const user = await this.send(`USER ${this.config.user || "anonymous"}`);
    if (user.code === 331) {
      expect(await this.send(`PASS ${this.config.password ?? ""}`), 230);
    } else {
      expect(user, 230);
    }
    expect(await this.send("TYPE I"), 200);
  }

  close(): void {
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    try {
      socket.write("QUIT\r\n");
    } catch {
      /* already gone */
    }
    socket.destroy();
  }

  /* ------------------------------------------------------ commands */

  /** The current directory, which is how a connection's root is discovered. */
  async pwd(): Promise<string> {
    const reply = await this.send("PWD");
    const match = /"((?:[^"]|"")*)"/.exec(reply.text);
    return match ? match[1].replace(/""/g, '"') : "/";
  }

  async cwd(directory: string): Promise<void> {
    const reply = await this.send(`CWD ${directory}`);
    if (reply.code !== 250 && reply.code !== 200) {
      throw new ApiError(`Cannot open ${directory}: ${reply.text}`, "FTP", 400);
    }
  }

  /**
   * One directory's contents.
   *
   * `MLSD` is asked for first because its output is machine-readable and says
   * plainly what is a directory; `LIST` is the fallback, and its output is a Unix
   * `ls` that has to be read by shape.
   */
  async list(directory: string): Promise<RemoteEntry[]> {
    const mlsd = await this.transferText(`MLSD ${directory}`).catch(() => null);
    if (mlsd !== null) {
      const entries = parseMlsd(mlsd);
      if (entries.length > 0 || mlsd.trim() === "") return entries;
    }
    return parseList(await this.transferText(`LIST ${directory}`));
  }

  async download(file: string): Promise<Uint8Array> {
    return this.transfer(`RETR ${file}`);
  }

  async upload(file: string, data: Uint8Array): Promise<void> {
    await this.transfer(`STOR ${file}`, data);
  }

  async remove(file: string): Promise<void> {
    const reply = await this.send(`DELE ${file}`);
    if (reply.code !== 250) throw new ApiError(`Cannot delete ${file}: ${reply.text}`, "FTP", 400);
  }

  async removeDirectory(directory: string): Promise<void> {
    const reply = await this.send(`RMD ${directory}`);
    if (reply.code !== 250) throw new ApiError(`Cannot remove ${directory}: ${reply.text}`, "FTP", 400);
  }

  async makeDirectory(directory: string): Promise<void> {
    const reply = await this.send(`MKD ${directory}`);
    // 550 usually means it is already there, which is not a failure here.
    if (reply.code !== 257 && reply.code !== 550) {
      throw new ApiError(`Cannot create ${directory}: ${reply.text}`, "FTP", 400);
    }
  }

  /* ------------------------------------------------------ transfers */

  /**
   * A command with a data channel: open the second socket, send the command, read
   * the channel to its end, and only then wait for the completion reply.
   *
   * The order matters. The server may send its 226 before or after the data socket
   * closes, and waiting for the reply first deadlocks against servers that do not.
   */
  private async transfer(command: string, upload?: Uint8Array): Promise<Uint8Array> {
    const target = await this.passive();
    const data = await open(target.host, target.port, this.timeout);
    const secured = this.socket instanceof tls.TLSSocket
      ? await upgrade(data, this.config.host, this.config.allowSelfSigned === true)
      : data;

    // Only a download has anything to collect. An upload's data socket is closed by
    // us, and the server has no reason to send anything back on it — waiting for an
    // `end` that is never coming is a deadlock, not a slow transfer.
    const collected = upload ? null : collect(secured, this.timeout);
    // Whatever happens next, the collector must not be left pending: an abandoned
    // promise that rejects later surfaces as an unhandled rejection long after the
    // call that caused it has returned.
    collected?.catch(() => {});

    const reply = await this.send(command);
    if (reply.code !== 150 && reply.code !== 125) {
      secured.destroy();
      throw new ApiError(`${command.split(" ")[0]} refused: ${reply.text}`, "FTP", 400);
    }

    if (upload) {
      await new Promise<void>((resolve, reject) => {
        secured.end(Buffer.from(upload), () => resolve());
        secured.once("error", reject);
      });
    }

    const body = collected ? await collected : new Uint8Array(0);
    // The data socket has done its job. Leaving it half-open holds the event loop
    // open with it, which outlives the transfer and, in a short-lived process,
    // outlives the program.
    secured.destroy();

    const done = await this.read();
    if (done.code !== 226 && done.code !== 250) {
      throw new ApiError(`Transfer failed: ${done.text}`, "FTP", 400);
    }
    return body;
  }

  private async transferText(command: string): Promise<string> {
    return new TextDecoder("utf-8", { fatal: false }).decode(await this.transfer(command));
  }

  /** `PASV`, and the host and port its reply encodes. */
  private async passive(): Promise<{ host: string; port: number }> {
    const reply = await this.send("PASV");
    const match = /(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)/.exec(reply.text);
    if (!match) throw new ApiError(`The server refused a data connection: ${reply.text}`, "FTP", 502);
    const numbers = match.slice(1).map(Number);
    return {
      // The server's own idea of its address is often a private one; the host we
      // reached it on is the one that will work.
      host: this.config.host,
      port: numbers[4] * 256 + numbers[5],
    };
  }

  /* -------------------------------------------------- the protocol */

  private listen(): void {
    const socket = this.socket;
    if (!socket) return;
    socket.setEncoding("utf8");
    socket.removeAllListeners("data");
    socket.on("data", (chunk: string) => {
      this.buffer += chunk;
      const reply = takeReply(this.buffer);
      if (!reply) return;
      this.buffer = reply.rest;
      const resolve = this.pending;
      this.pending = null;
      this.failed = null;
      resolve?.(reply.value);
    });
    socket.on("error", (error) => {
      const fail = this.failed;
      this.pending = null;
      this.failed = null;
      // Only a command in flight cares. A reset arriving after the last reply is
      // the server hanging up, which is not something to throw about — but with no
      // listener at all Node would make it fatal.
      fail?.(error);
    });
  }

  private read(): Promise<Reply> {
    return new Promise<Reply>((resolve, reject) => {
      const existing = takeReply(this.buffer);
      if (existing) {
        this.buffer = existing.rest;
        resolve(existing.value);
        return;
      }
      const timer = setTimeout(() => {
        this.pending = null;
        this.failed = null;
        reject(new ApiError("The server did not answer in time.", "FTP_TIMEOUT", 504));
      }, this.timeout);

      this.pending = (reply) => {
        clearTimeout(timer);
        resolve(reply);
      };
      this.failed = (error) => {
        clearTimeout(timer);
        reject(error);
      };
    });
  }

  private async send(command: string): Promise<Reply> {
    if (!this.socket) throw new ApiError("Not connected.", "FTP", 400);
    const waiting = this.read();
    this.socket.write(`${command}\r\n`);
    return waiting;
  }
}

/* ------------------------------------------------------------------ *
 * Replies
 * ------------------------------------------------------------------ */

type Reply = { code: number; text: string };

function expect(reply: Reply, code: number): void {
  if (reply.code !== code) {
    throw new ApiError(`The server said: ${reply.code} ${reply.text}`, "FTP", 502);
  }
}

/**
 * One complete reply from the buffer.
 *
 * A reply is one line, or several: `220-` opens a multi-line reply and `220 ` — the
 * same code with a space — closes it. Reading line by line without this would take
 * a banner's second line as the answer to the next command.
 */
function takeReply(buffer: string): { value: Reply; rest: string } | null {
  const lines = buffer.split("\r\n");
  if (lines.length < 2) return null;

  const first = /^(\d{3})([ -])/.exec(lines[0]);
  if (!first) return null;
  const code = Number(first[1]);

  if (first[2] === " ") {
    return { value: { code, text: lines[0].slice(4) }, rest: lines.slice(1).join("\r\n") };
  }

  for (let index = 1; index < lines.length; index++) {
    if (lines[index].startsWith(`${first[1]} `)) {
      return {
        value: { code, text: lines.slice(0, index + 1).join("\n") },
        rest: lines.slice(index + 1).join("\r\n"),
      };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Listings
 * ------------------------------------------------------------------ */

/** `MLSD`: `fact=value;fact=value; name`. */
export function parseMlsd(text: string): RemoteEntry[] {
  const entries: RemoteEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const at = line.indexOf(" ");
    if (at < 0) continue;
    const name = line.slice(at + 1);
    if (name === "." || name === "..") continue;

    const facts = new Map<string, string>();
    for (const fact of line.slice(0, at).split(";")) {
      const equals = fact.indexOf("=");
      if (equals > 0) facts.set(fact.slice(0, equals).toLowerCase(), fact.slice(equals + 1));
    }

    const type = facts.get("type") ?? "";
    if (type === "cdir" || type === "pdir") continue;
    entries.push({
      name,
      directory: type === "dir",
      size: Number(facts.get("size") ?? 0) || 0,
      modified: parseMlsdTime(facts.get("modify")),
    });
  }
  return entries;
}

/** `20240115123000`, which is UTC. */
function parseMlsdTime(value: string | undefined): number | null {
  if (!value || value.length < 14) return null;
  const stamp = Date.UTC(
    Number(value.slice(0, 4)),
    Number(value.slice(4, 6)) - 1,
    Number(value.slice(6, 8)),
    Number(value.slice(8, 10)),
    Number(value.slice(10, 12)),
    Number(value.slice(12, 14)),
  );
  return Number.isFinite(stamp) ? stamp : null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * `LIST`, in the Unix form nearly every server produces:
 *
 *     -rw-r--r--   1 owner group     1234 Jan 15 12:30 name.txt
 *
 * The name is everything after the time, so names with spaces survive. A DOS-style
 * listing is recognised too, because IIS still produces it.
 */
export function parseList(text: string): RemoteEntry[] {
  const entries: RemoteEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || /^total\s/i.test(line)) continue;

    const dos = /^(\d{2}-\d{2}-\d{2,4})\s+(\d{2}:\d{2}(?:[AP]M)?)\s+(<DIR>|\d+)\s+(.+)$/i.exec(line);
    if (dos) {
      const name = dos[4].trim();
      if (name === "." || name === "..") continue;
      entries.push({
        name,
        directory: dos[3].toUpperCase() === "<DIR>",
        size: dos[3].toUpperCase() === "<DIR>" ? 0 : Number(dos[3]),
        modified: null,
      });
      continue;
    }

    const unix = /^([bcdlps-])\S*\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\w{3})\s+(\d{1,2})\s+([\d:]{4,5})\s+(.*)$/.exec(line);
    if (!unix) continue;
    let name = unix[6];
    if (unix[1] === "l") {
      // A symlink's name is given as `link -> target`.
      const arrow = name.indexOf(" -> ");
      if (arrow >= 0) name = name.slice(0, arrow);
    }
    if (name === "." || name === "..") continue;

    entries.push({
      name,
      directory: unix[1] === "d",
      size: Number(unix[2]),
      modified: parseListTime(unix[3], unix[4], unix[5]),
    });
  }
  return entries;
}

/** `Jan 15 12:30` is this year; `Jan 15 2023` is that one. */
function parseListTime(month: string, day: string, last: string): number | null {
  const index = MONTHS.indexOf(month.toLowerCase());
  if (index < 0) return null;
  const now = new Date();
  if (last.includes(":")) {
    const [hour, minute] = last.split(":").map(Number);
    const stamp = new Date(now.getFullYear(), index, Number(day), hour, minute).getTime();
    // A date in the future is last year's: `ls` drops the year for recent files.
    return stamp > now.getTime() + 86_400_000
      ? new Date(now.getFullYear() - 1, index, Number(day), hour, minute).getTime()
      : stamp;
  }
  return new Date(Number(last), index, Number(day)).getTime();
}

/* ------------------------------------------------------------------ *
 * Sockets
 * ------------------------------------------------------------------ */

function open(host: string, port: number, timeoutMs: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new ApiError(`Could not reach ${host}:${port}.`, "FTP_TIMEOUT", 504));
    }, timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function upgrade(socket: net.Socket, host: string, allowSelfSigned: boolean): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const secured = tls.connect({
      socket,
      servername: host,
      rejectUnauthorized: !allowSelfSigned,
    });
    secured.once("secureConnect", () => resolve(secured));
    secured.once("error", reject);
  });
}

/** Everything a socket produces before it closes. */
function collect(socket: net.Socket, timeoutMs: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      action();
    };

    const timer = setTimeout(() => {
      finish(() => {
        socket.destroy();
        reject(new ApiError("The transfer did not finish in time.", "FTP_TIMEOUT", 504));
      });
    }, timeoutMs);

    socket.on("data", (chunk: Buffer) => chunks.push(chunk));
    // `close` as well as `end`: a server that drops the data socket rather than
    // half-closing it has still finished sending, and waiting for an `end` that is
    // not coming would hold the transfer open until the timeout.
    socket.once("end", () => finish(() => resolve(new Uint8Array(Buffer.concat(chunks)))));
    socket.once("close", () => finish(() => resolve(new Uint8Array(Buffer.concat(chunks)))));
    socket.once("error", (error) => finish(() => reject(error)));
  });
}
