/**
 * A very small FTP server, for testing the client against.
 *
 * It serves one in-memory tree and speaks only what the client speaks: the login,
 * PASV, LIST and MLSD, RETR, STOR, DELE and MKD. It exists so the client can be
 * tested for real — against sockets, replies and data channels — rather than
 * against a mock of itself, which would only prove the mock matches the code.
 *
 * `listStyle` switches between MLSD and a Unix `LIST`, so both of the client's
 * listing parsers get exercised against something that actually produced them.
 */
import net from "node:net";

/**
 * @param {Record<string, string>} files  path → contents, e.g. `{ "a/b.txt": "hi" }`
 * @param {{ listStyle?: "mlsd" | "list" }} options
 */
export function startFtpServer(files = {}, options = {}) {
  const tree = new Map(Object.entries(files).map(([name, body]) => [normalize(name), body]));
  const style = options.listStyle ?? "mlsd";
  // Everything the server ever opens, so shutting it down really does shut it
  // down: a lingering data socket or an unaccepted passive listener keeps the
  // event loop alive and the test process never exits.
  const sockets = new Set();
  const listeners = new Set();
  const track = (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    // A client that hangs up mid-transfer resets the socket. That is a normal end
    // to a conversation, not a fault, but with no listener Node makes it fatal.
    socket.on("error", () => {});
    return socket;
  };

  const server = net.createServer((socket) => {
    track(socket);
    socket.setEncoding("utf8");

    /** The pending passive transfer, if PASV has been issued. */
    let passive = null;
    let buffer = "";

    const reply = (text) => socket.write(`${text}\r\n`);

    socket.on("data", async (chunk) => {
      buffer += chunk;
      let at = buffer.indexOf("\r\n");
      while (at >= 0) {
        const line = buffer.slice(0, at);
        buffer = buffer.slice(at + 2);
        await handle(line);
        at = buffer.indexOf("\r\n");
      }
    });

    /**
     * Opens the data server PASV promised, and hands back one connection.
     *
     * The listening server is closed as soon as it has been used: one per transfer
     * left open would keep the event loop alive and the test process would never
     * exit, which is a far more confusing failure than a wrong reply.
     */
    const takeData = () => new Promise((resolve, reject) => {
      if (!passive) {
        reject(new Error("no PASV"));
        return;
      }
      const waiting = passive;
      passive = null;
      const done = (connection) => {
        waiting.server.close();
        resolve(connection);
      };
      if (waiting.socket) {
        done(waiting.socket);
        return;
      }
      const timer = setTimeout(() => {
        waiting.server.close();
        reject(new Error("no data connection"));
      }, 5000);
      // Unreferenced, so a server waiting for a connection that never comes does
      // not by itself keep the process alive.
      timer.unref?.();
      waiting.resolve = (connection) => {
        clearTimeout(timer);
        done(connection);
      };
    });

    const handle = async (line) => {
      const [command, ...rest] = line.split(" ");
      const argument = rest.join(" ");
      const verb = command.toUpperCase();

      if (verb === "USER") return reply("331 Password please");
      if (verb === "PASS") return reply("230 Logged in");
      if (verb === "TYPE") return reply("200 Binary");
      if (verb === "SYST") return reply("215 UNIX Type: L8");
      if (verb === "PWD") return reply('257 "/" is the current directory');
      if (verb === "CWD") return reply("250 Fine");
      if (verb === "QUIT") {
        reply("221 Bye");
        socket.end();
        return undefined;
      }

      if (verb === "PASV") {
        const data = net.createServer();
        listeners.add(data);
        data.on("close", () => listeners.delete(data));
        const pending = { server: data, socket: null, resolve: null };
        data.on("connection", (connection) => {
          track(connection);
          if (pending.resolve) pending.resolve(connection);
          else pending.socket = connection;
        });
        await new Promise((done) => data.listen(0, "127.0.0.1", done));
        const port = data.address().port;
        passive = pending;
        return reply(`227 Entering Passive Mode (127,0,0,1,${port >> 8},${port & 255})`);
      }

      if (verb === "MLSD" || verb === "LIST") {
        if (verb === "MLSD" && style !== "mlsd") return reply("500 Not understood");
        const body = render(tree, normalize(argument || "/"), verb === "MLSD" ? "mlsd" : "list");
        reply("150 Here it comes");
        const data = await takeData();
        data.end(body);
        return reply("226 Done");
      }

      if (verb === "RETR") {
        const body = tree.get(normalize(argument));
        if (body === undefined) return reply("550 No such file");
        reply("150 Here it comes");
        const data = await takeData();
        data.end(body);
        return reply("226 Done");
      }

      if (verb === "STOR") {
        reply("150 Send it");
        const data = await takeData();
        const chunks = [];
        data.on("data", (part) => chunks.push(part));
        await new Promise((done) => data.once("end", done));
        data.end();
        tree.set(normalize(argument), Buffer.concat(chunks).toString("utf8"));
        return reply("226 Stored");
      }

      if (verb === "DELE") {
        if (!tree.delete(normalize(argument))) return reply("550 No such file");
        return reply("250 Deleted");
      }

      if (verb === "MKD") return reply(`257 "${argument}" created`);

      return reply("500 Not understood");
    };

    reply("220 Test server ready");
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        port: server.address().port,
        /** What the server holds now — so a test can check an upload arrived. */
        files: () => Object.fromEntries(tree),
        close: () => new Promise((done) => {
          for (const listener of listeners) listener.close();
          for (const socket of sockets) socket.destroy();
          server.close(done);
        }),
      });
    });
  });
}

function normalize(name) {
  return `/${name}`.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

/** The entries directly inside `directory`, as the chosen listing format. */
function render(tree, directory, style) {
  const prefix = directory === "/" ? "/" : `${directory}/`;
  const names = new Map();

  for (const name of tree.keys()) {
    if (!name.startsWith(prefix)) continue;
    const rest = name.slice(prefix.length);
    if (!rest) continue;
    const slash = rest.indexOf("/");
    if (slash < 0) names.set(rest, { directory: false, size: tree.get(name).length });
    else names.set(rest.slice(0, slash), { directory: true, size: 0 });
  }

  const lines = [];
  for (const [name, entry] of names) {
    if (style === "mlsd") {
      lines.push(
        `type=${entry.directory ? "dir" : "file"};size=${entry.size};modify=20240115123000; ${name}`,
      );
    } else {
      const kind = entry.directory ? "d" : "-";
      const size = String(entry.size).padStart(8);
      lines.push(`${kind}rw-r--r--   1 owner group ${size} Jan 15 12:30 ${name}`);
    }
  }
  return `${lines.join("\r\n")}\r\n`;
}
