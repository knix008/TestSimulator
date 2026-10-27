const fs = require('fs');
const { Client } = require('ssh2');

class SshSession {
  constructor(win, options = {}) {
    this.win = win;
    this.sessionId = options.sessionId || '1';
    this.options = options;
    this.conn = null;
    this.stream = null;
    this.alive = false;
    this.cols = options.cols || 80;
    this.rows = options.rows || 24;
    this.host = options.host || '';
    this.username = options.username || '';
  }

  emit(channel, payload) {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send(channel, payload);
    }
  }

  send(text) {
    this.emit('pty:data', { sessionId: this.sessionId, data: text });
  }

  connect() {
    return new Promise((resolve, reject) => {
      const {
        host,
        port = 22,
        username,
        password,
        privateKey,
        passphrase,
      } = this.options;

      if (!host || !username) {
        reject(new Error('host and username are required'));
        return;
      }

      const config = {
        host,
        port: Number(port) || 22,
        username,
        readyTimeout: 20000,
        tryKeyboard: true,
      };

      if (privateKey) {
        try {
          config.privateKey = fs.existsSync(privateKey)
            ? fs.readFileSync(privateKey)
            : privateKey;
          if (passphrase) config.passphrase = passphrase;
        } catch (err) {
          reject(new Error(`private key error: ${err.message}`));
          return;
        }
      } else if (password != null && password !== '') {
        config.password = password;
      } else {
        reject(new Error('password or privateKey is required'));
        return;
      }

      const conn = new Client();
      this.conn = conn;
      this.host = host;
      this.username = username;

      conn
        .on('ready', () => {
          this.send(
            `\r\n\x1b[32m[ssh]\x1b[0m connected to ${username}@${host}:${config.port}\r\n`
          );
          conn.shell(
            {
              term: 'xterm-256color',
              cols: this.cols,
              rows: this.rows,
            },
            (err, stream) => {
              if (err) {
                conn.end();
                reject(err);
                return;
              }
              this.stream = stream;
              this.alive = true;

              stream.on('data', (data) => {
                this.send(data.toString('utf8'));
              });
              stream.stderr.on('data', (data) => {
                this.send(data.toString('utf8'));
              });
              stream.on('close', () => {
                this.alive = false;
                this.stream = null;
                this.send('\r\n\x1b[33m[ssh]\x1b[0m session closed\r\n');
                try {
                  conn.end();
                } catch (_) {
                  /* ignore */
                }
                this.emit('ssh:disconnected', { sessionId: this.sessionId });
                this.emit('pty:exit', { sessionId: this.sessionId, code: 0 });
              });

              resolve({
                ok: true,
                sessionId: this.sessionId,
                host,
                port: config.port,
                username,
              });
            }
          );
        })
        .on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) => {
          const responses = prompts.map((p) =>
            /password/i.test(p.prompt) ? password || '' : ''
          );
          finish(responses);
        })
        .on('error', (err) => {
          this.alive = false;
          reject(err);
        })
        .on('end', () => {
          this.alive = false;
        })
        .connect(config);
    });
  }

  write(data) {
    if (this.stream && this.alive) {
      this.stream.write(data);
    }
  }

  resize(cols, rows) {
    if (cols > 0) this.cols = cols;
    if (rows > 0) this.rows = rows;
    if (this.stream && this.alive && typeof this.stream.setWindow === 'function') {
      try {
        this.stream.setWindow(this.rows, this.cols, 0, 0);
      } catch (_) {
        /* ignore */
      }
    }
  }

  disconnect() {
    this.alive = false;
    try {
      if (this.stream) this.stream.close();
    } catch (_) {
      /* ignore */
    }
    try {
      if (this.conn) this.conn.end();
    } catch (_) {
      /* ignore */
    }
    this.stream = null;
    this.conn = null;
  }
}

module.exports = { SshSession };
