import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SerializeAddon } from '@xterm/addon-serialize';
import { toXtermTheme } from './themes.js';
import { WebShell } from './web-shell.js';

export class TerminalPane {
  constructor({
    sessionId,
    host,
    api,
    i18n,
    getTheme,
    getHasBackgroundImage,
    getPromptTemplate,
    title = '',
  }) {
    this.sessionId = sessionId;
    this.host = host;
    this.api = api;
    this.i18n = i18n;
    this.getTheme = getTheme;
    this.getHasBackgroundImage = getHasBackgroundImage || (() => false);
    this.getPromptTemplate = getPromptTemplate || (() => null);
    this.title = title;
    this.mode = 'local';
    this.fontSize = 14;
    this.fontFamily = 'Consolas, "Courier New", monospace';
    this.scrollback = 1000;
    this.webShell = null;
    this.disposers = [];
    this.active = false;

    this.term = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: this.fontFamily,
      fontSize: this.fontSize,
      scrollback: this.scrollback,
      allowProposedApi: true,
      theme: toXtermTheme(getTheme(), !!this.getHasBackgroundImage()),
    });

    this.fitAddon = new FitAddon();
    this.serializeAddon = new SerializeAddon();
    this.term.loadAddon(this.fitAddon);
    this.term.loadAddon(this.serializeAddon);
    this.term.loadAddon(
      new WebLinksAddon((_event, uri) => {
        if (api?.openExternal) api.openExternal(uri);
        else window.open(uri, '_blank');
      })
    );

    this.term.open(host);
    this.term.onData((data) => this.writeInput(data));
  }

  setActive(active) {
    this.active = active;
    this.host.classList.toggle('active', active);
    this.host.hidden = !active;
    if (active) {
      this.fit();
      this.term.focus();
    }
  }

  async start() {
    this.applyTheme(this.getTheme());
    this.fit();

    if (this.api?.isElectron) {
      const { cols, rows } = this.term;
      const result = await this.api.ptyStart({
        sessionId: this.sessionId,
        cols,
        rows,
        promptTemplate: this.getPromptTemplate(),
      });
      if (!result?.ok) {
        this.term.writeln(`\r\nFailed to start shell: ${result?.error || 'unknown'}`);
      } else {
        this.mode = 'local';
        this.title = this.title || `${this.i18n.t('tabs.session')} ${this.sessionId}`;
      }
      return result;
    }

    this.webShell = new WebShell({
      onData: (d) => this.term.write(d),
      onExit: () => {
        this.term.writeln('');
        this.term.writeln(this.i18n.t('terminal.restarted'));
        this.start();
      },
      promptTemplate: this.getPromptTemplate(),
    });
    this.term.clear();
    this.webShell.start([
      this.i18n.t('terminal.welcome'),
      this.i18n.t('terminal.webNotice'),
      '',
    ]);
    this.mode = 'local';
    return { ok: true, sessionId: this.sessionId };
  }

  /** Attach UI to an existing backend session (after window detach). */
  async adopt({ title, mode, serialized, fontSize, fontFamily }) {
    this.title = title || `${this.i18n.t('tabs.session')} ${this.sessionId}`;
    this.mode = mode === 'ssh' ? 'ssh' : 'local';
    if (fontSize) this.setFontSize(fontSize);
    if (fontFamily) this.setFontFamily(fontFamily);
    this.applyTheme(this.getTheme());
    this.fit();
    if (serialized) {
      this.term.write(serialized);
    } else {
      this.term.writeln(this.i18n.t('tabs.detachedNotice'));
    }
    this.term.focus();
    return { ok: true, sessionId: this.sessionId };
  }

  serialize() {
    try {
      return this.serializeAddon.serialize();
    } catch (_) {
      return '';
    }
  }

  handleData(data) {
    this.term.write(data);
  }

  handleExit() {
    if (this.mode === 'ssh') {
      this.mode = 'local';
      this.title = `${this.i18n.t('tabs.session')} ${this.sessionId}`;
    }
    this.term.writeln('');
    this.term.writeln(this.i18n.t('terminal.restarted'));
    this.start();
  }

  writeInput(data) {
    if (this.api?.isElectron) this.api.ptyWrite(this.sessionId, data);
    else this.webShell?.write(data);
  }

  fit() {
    try {
      this.fitAddon.fit();
      if (this.api?.isElectron) {
        this.api.ptyResize(this.sessionId, this.term.cols, this.term.rows);
      } else {
        this.webShell?.resize(this.term.cols, this.term.rows);
      }
      this.onFit?.(this);
    } catch (_) {
      /* ignore */
    }
  }

  applyTheme(theme) {
    this.term.options.theme = toXtermTheme(theme, !!this.getHasBackgroundImage());
  }

  clear() {
    // Route through shell (Ctrl+L) so the configured prompt is redrawn.
    if (this.api?.isElectron) {
      this.writeInput('\u000c');
      return;
    }
    if (this.webShell) {
      this.webShell.write('\u000c');
      return;
    }
    this.term.clear();
    this.term.write('\x1b[2J\x1b[H');
  }

  async copy() {
    const sel = this.term.getSelection();
    if (!sel) return;
    await navigator.clipboard.writeText(sel);
  }

  async paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) this.writeInput(text);
    } catch (_) {
      /* clipboard denied */
    }
  }

  setFontSize(size) {
    this.fontSize = Math.max(10, Math.min(28, size));
    this.term.options.fontSize = this.fontSize;
    this.host.dataset.fontSize = String(this.fontSize);
    this.fit();
  }

  changeFont(delta) {
    this.setFontSize(this.fontSize + delta);
  }

  setFontFamily(family) {
    if (!family) return;
    this.fontFamily = family;
    this.term.options.fontFamily = family;
    this.host.dataset.fontFamily = family;
    try {
      // Force glyph metrics refresh after family change.
      this.term.refresh(0, Math.max(0, this.term.rows - 1));
    } catch (_) {
      /* ignore */
    }
    this.fit();
  }

  setScrollback(lines) {
    const n = Math.max(100, Math.min(100000, Number.parseInt(lines, 10) || 1000));
    this.scrollback = n;
    this.term.options.scrollback = n;
  }

  markRemote(title) {
    this.mode = 'ssh';
    this.title = title || this.title;
  }

  markLocal() {
    this.mode = 'local';
    this.title = `${this.i18n.t('tabs.session')} ${this.sessionId}`;
  }

  dispose({ killBackend = true } = {}) {
    this.disposers.forEach((d) => d());
    if (killBackend && this.api?.ptyKill) this.api.ptyKill(this.sessionId);
    if (killBackend) this.webShell?.kill();
    this.term.dispose();
    this.host.remove();
  }
}
