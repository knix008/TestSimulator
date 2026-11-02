/**
 * The FTP client, against a real server.
 *
 * The server in `helpers/ftpServer.mjs` speaks the protocol over real sockets, so
 * these exercise the parts that mocks hide: the two-socket transfer, the order of
 * the 150 and the 226, multi-line replies, and both listing formats.
 */
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { FtpClient, parseList, parseMlsd } from "../core/ftp.ts";
import {
  formatRemotePath,
  isRemotePath,
  joinRemote,
  normalizeRemote,
  parseRemotePath,
  RemoteSession,
} from "../core/remote.ts";
import { startFtpServer } from "./helpers/ftpServer.mjs";

const TREE = {
  "readme.txt": "the readme",
  "src/a.txt": "alpha",
  "src/b.txt": "beta",
  "src/deep/c.txt": "gamma",
};

let server;
let listServer;

before(async () => {
  server = await startFtpServer(TREE);
  listServer = await startFtpServer(TREE, { listStyle: "list" });
});

after(async () => {
  await server?.close();
  await listServer?.close();
});

function client(port = server.port) {
  return new FtpClient({ host: "127.0.0.1", port, user: "me", password: "secret", timeoutMs: 5000 });
}

/* ------------------------------------------------------------------ *
 * Parsing listings
 * ------------------------------------------------------------------ */

test("ftp › an MLSD listing is read with its types and sizes", () => {
  const entries = parseMlsd([
    "type=cdir;modify=20240101000000; .",
    "type=dir;modify=20240115123000; src",
    "type=file;size=1234;modify=20240115123000; readme.txt",
  ].join("\r\n"));

  assert.equal(entries.length, 2, "the . entry is not a file");
  assert.deepEqual(entries[0], { name: "src", directory: true, size: 0, modified: Date.UTC(2024, 0, 15, 12, 30, 0) });
  assert.equal(entries[1].size, 1234);
});

test("ftp › a Unix LIST is read, including names with spaces", () => {
  const entries = parseList([
    "total 8",
    "drwxr-xr-x   2 me  staff      4096 Jan 15 12:30 src",
    "-rw-r--r--   1 me  staff      1234 Jan 15 12:30 my notes.txt",
    "lrwxrwxrwx   1 me  staff         7 Jan 15 12:30 link -> target",
  ].join("\r\n"));

  assert.deepEqual(entries.map((entry) => entry.name), ["src", "my notes.txt", "link"]);
  assert.equal(entries[0].directory, true);
  assert.equal(entries[1].size, 1234);
  assert.equal(entries[2].directory, false, "a symlink is not a directory");
});

test("ftp › a DOS LIST is read too", () => {
  const entries = parseList([
    "01-15-24  12:30PM       <DIR>          src",
    "01-15-24  12:30PM                 1234 readme.txt",
  ].join("\r\n"));
  assert.equal(entries[0].directory, true);
  assert.equal(entries[1].size, 1234);
});

/* ------------------------------------------------------------------ *
 * Talking to a server
 * ------------------------------------------------------------------ */

test("ftp › connecting logs in and lists a folder", async () => {
  const ftp = client();
  await ftp.connect();
  try {
    assert.equal(await ftp.pwd(), "/");
    const entries = await ftp.list("/");
    const names = entries.map((entry) => entry.name).sort();
    assert.deepEqual(names, ["readme.txt", "src"]);
    assert.equal(entries.find((entry) => entry.name === "src").directory, true);
  } finally {
    ftp.close();
  }
});

test("ftp › a file comes back byte for byte", async () => {
  const ftp = client();
  await ftp.connect();
  try {
    const data = await ftp.download("/src/a.txt");
    assert.equal(Buffer.from(data).toString("utf8"), "alpha");
  } finally {
    ftp.close();
  }
});

test("ftp › several commands in a row keep in step", async () => {
  // The replies arrive on one socket; losing track by one would show up here.
  const ftp = client();
  await ftp.connect();
  try {
    for (const [name, expected] of [["/src/a.txt", "alpha"], ["/src/b.txt", "beta"], ["/readme.txt", "the readme"]]) {
      assert.equal(Buffer.from(await ftp.download(name)).toString("utf8"), expected);
    }
  } finally {
    ftp.close();
  }
});

test("ftp › a missing file is an error, and the connection survives it", async () => {
  const ftp = client();
  await ftp.connect();
  try {
    await assert.rejects(() => ftp.download("/nope.txt"), /refused|No such/i);
    // Still usable afterwards, which is the part that matters.
    assert.equal(Buffer.from(await ftp.download("/readme.txt")).toString("utf8"), "the readme");
  } finally {
    ftp.close();
  }
});

test("ftp › a server that only speaks LIST is handled", async () => {
  const ftp = client(listServer.port);
  await ftp.connect();
  try {
    const names = (await ftp.list("/src")).map((entry) => entry.name).sort();
    assert.deepEqual(names, ["a.txt", "b.txt", "deep"]);
  } finally {
    ftp.close();
  }
});

/* ------------------------------------------------------------------ *
 * Remote roots
 * ------------------------------------------------------------------ */

test("remote › a remote path is recognised and taken apart", () => {
  assert.equal(isRemotePath("ftp://host/pub"), true);
  assert.equal(isRemotePath("C:\\local\\folder"), false);

  assert.deepEqual(parseRemotePath("ftp://me@host:2121/pub/project"), {
    protocol: "ftp",
    host: "host",
    port: 2121,
    user: "me",
    path: "/pub/project",
  });

  const anonymous = parseRemotePath("ftps://host");
  assert.equal(anonymous.user, "anonymous");
  assert.equal(anonymous.port, 21);
  assert.equal(anonymous.path, "/");
});

test("remote › formatting a root round-trips it, without a password", () => {
  const root = parseRemotePath("ftp://me@host:2121/pub");
  assert.equal(formatRemotePath(root), "ftp://me@host:2121/pub");
  assert.equal(formatRemotePath(parseRemotePath("ftp://host/pub")), "ftp://host/pub");
});

test("remote › paths are normalised rather than left as typed", () => {
  assert.equal(normalizeRemote("//a//b/"), "/a/b");
  assert.equal(normalizeRemote(""), "/");
  assert.equal(joinRemote("/a", "b"), "/a/b");
  assert.equal(joinRemote("/", "b"), "/b");
});

test("remote › a walk finds every file under the root", async () => {
  const session = new RemoteSession(
    parseRemotePath(`ftp://me@127.0.0.1:${server.port}/`),
    "secret",
    { timeoutMs: 5000 },
  );
  try {
    const files = await session.walk();
    const names = [...files.values()].map((file) => file.rel).sort();
    assert.deepEqual(names, ["readme.txt", "src/a.txt", "src/b.txt", "src/deep/c.txt"]);
    assert.equal(files.get("src/a.txt").size, 5);
  } finally {
    session.close();
  }
});

test("remote › a walk can start below the root and apply the masks", async () => {
  const session = new RemoteSession(
    parseRemotePath(`ftp://me@127.0.0.1:${server.port}/src`),
    "secret",
    { timeoutMs: 5000 },
  );
  try {
    const all = await session.walk();
    assert.deepEqual([...all.values()].map((file) => file.rel).sort(), ["a.txt", "b.txt", "deep/c.txt"]);

    const filtered = await session.walk(new Set(["deep"]), (name) => name.startsWith("a"));
    assert.deepEqual([...filtered.values()].map((file) => file.rel), ["a.txt"]);
  } finally {
    session.close();
  }
});

test("remote › a file can be read, written and deleted", async () => {
  const live = await startFtpServer({ "a.txt": "before" });
  const session = new RemoteSession(
    parseRemotePath(`ftp://me@127.0.0.1:${live.port}/`),
    "secret",
    { timeoutMs: 5000 },
  );
  try {
    assert.equal(Buffer.from(await session.read("a.txt")).toString("utf8"), "before");

    await session.write("a.txt", new TextEncoder().encode("after"));
    assert.equal(live.files()["/a.txt"], "after");

    await session.remove("a.txt");
    assert.equal(live.files()["/a.txt"], undefined);
  } finally {
    session.close();
    await live.close();
  }
});
