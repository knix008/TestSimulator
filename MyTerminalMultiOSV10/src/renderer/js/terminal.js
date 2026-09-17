import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SerializeAddon } from '@xterm/addon-serialize';
import { CanvasAddon } from '@xterm/addon-canvas';
import { WebglAddon } from '@xterm/addon-webgl';
import { toXtermTheme, isLightColor } from './themes.js';
import { WebShell } from './web-shell.js';
import { reportError } from './error-dialog.js';

/** Inline SVG glyphs for the terminal context menu (stroke inherits currentColor via CSS). */
const CTX_ICONS = {
  copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 15V5h10"/>',
  copyAll: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 15V5h10"/><path d="M11 13h5M11 16h5"/>',
  paste: '<path d="M8 5h8v3H8zM9 8h6v12H9z"/>',
  selectAll:
    '<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 2.5"/><path d="M9 12l2 2 4-4"/>',
  clear: '<path d="M4 7h16M9 7V5h6v2M6 7l1 12h10l1-12"/>',
  fontInc: '<path d="M4 18l4-11 4 11M5.5 14h5"/><path d="M16 10v6M13 13h6"/>',
  fontDec: '<path d="M4 18l4-11 4 11M5.5 14h5"/><path d="M13 13h6"/>',
  reset: '<path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4"/>',
  scrollBottom: '<path d="M12 4v14M6 12l6 6 6-6"/>',
};

/** @type {HTMLElement | null} */
let sharedContextMenu = null;
/** @type {(() => void) | null} */
let sharedContextMenuCloser = null;

function closeTerminalContextMenu() {
  if (sharedContextMenuCloser) {
    sharedContextMenuCloser();
    sharedContextMenuCloser = null;
  }
  if (sharedContextMenu) {
    sharedContextMenu.remove();
    sharedContextMenu = null;
  }
}

export class TerminalPane {
  constructor({
    sessionId,
    host,
    api,
    i18n,
    getTheme,
    getHasBackgroundImage,
    getPromptConfig,
    getPromptGitMode,
    getStartDirectory,
    getLsColors,
    title = '',
    shellId = '',
    onTitle = null,
  }) {
    this.sessionId = sessionId;
    this.host = host;
    this.api = api;
    this.i18n = i18n;
    this.getTheme = getTheme;
    this.getHasBackgroundImage = getHasBackgroundImage || (() => false);
    this.getPromptConfig = getPromptConfig || (() => null);
    this.getPromptGitMode = getPromptGitMode || (() => 'status');
    this.getStartDirectory = getStartDirectory || (() => '');
    this.getLsColors = getLsColors || (() => ({}));
    this.title = title;
    /** Command shell chosen for this tab ('' = the default from settings). */
    this.shellId = shellId;
    /** { id, label, short } of the shell the session runs (from main). */
    this.shellInfo = null;
    /** Called when the tab title changes (the shell name arrives with ptyStart). */
    this.onTitle = onTitle;
    this.mode = 'local';
    this.fontSize = 13;
    this.fontFamily = 'Consolas, "Courier New", monospace';
    this.scrollback = 10000;
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
      // Needed so wallpaper can show through rgba(0,0,0,0) terminal background.
      allowTransparency: true,
      // On: xterm draws Powerline  as a filled triangle (no tofu / private-use junk).
      customGlyphs: true,
      lineHeight: 1,
      letterSpacing: 0,
      // Avoid contrast tweaks that darken powerline tip edges into a black fringe.
      minimumContrastRatio: 1,
      // Keep mouse drag selection enabled (not application mouse mode).
      rightClickSelectsWord: false,
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
    // Renderer priority: WebGL → Canvas → DOM. The DOM renderer cannot draw
    // powerline custom glyphs, and the Canvas renderer leaves a 1px unpainted
    // strip at the bottom of colored cells (fractional device cell height) plus
    // dark fringes on transparent powerline tips. WebGL paints exact cell-height
    // background quads and composites transparency correctly, so agnoster
    // segments keep a uniform height and the tip taper shows the wallpaper.
    this.loadPreferredRenderer();
    this.term.onData((data) => this.writeInput(data));
    this.term.attachCustomKeyEventHandler((ev) => this.handleClipboardKeys(ev));
    this.term.onScroll(() => this.syncScrollbarVisibility());
    this.term.onWriteParsed(() => this.syncScrollbarVisibility());
    this.term.onResize(() => this.syncScrollbarVisibility());
    this.syncScrollbarVisibility();

    // Capture phase so we override xterm's default contextmenu/textarea hop.
    const onContextMenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.openContextMenu(e.clientX, e.clientY);
    };
    host.addEventListener('contextmenu', onContextMenu, true);
    this.disposers.push(() => host.removeEventListener('contextmenu', onContextMenu, true));
  }

  /**
   * Load the best available GPU/canvas renderer. WebGL first (uniform cell-height
   * backgrounds + correct transparency for powerline tips); fall back to Canvas
   * if the WebGL context is unavailable or lost, and to the built-in DOM renderer
   * if even Canvas fails. Loading a renderer addon is a no-op-safe try/catch.
   */
  loadPreferredRenderer() {
    try {
      const webgl = new WebglAddon();
      // A lost GPU context would otherwise freeze rendering — drop to Canvas.
      webgl.onContextLoss(() => {
        try {
          webgl.dispose();
        } catch (_) {
          /* already gone */
        }
        this.loadCanvasRenderer();
      });
      this.term.loadAddon(webgl);
      this.setRendererKind('webgl');
      return;
    } catch (_) {
      /* WebGL unavailable (blocklisted GPU, headless) — fall back. */
    }
    this.loadCanvasRenderer();
  }

  /** Canvas fallback renderer (still draws powerline custom glyphs). */
  loadCanvasRenderer() {
    try {
      this.term.loadAddon(new CanvasAddon());
      this.setRendererKind('canvas');
    } catch (_) {
      // Keep the DOM renderer; powerline glyphs may show as tofu but text works.
      this.setRendererKind('dom');
    }
  }

  /** Record the active renderer (inspectable via the host's data-renderer). */
  setRendererKind(kind) {
    this.rendererKind = kind;
    try {
      this.host.dataset.renderer = kind;
    } catch (_) {
      /* host not ready */
    }
  }

  /** Show the vertical scrollbar only when the buffer has scrollable history. */
  syncScrollbarVisibility() {
    try {
      const buf = this.term.buffer.active;
      const canScroll = buf.baseY > 0;
      this.host.classList.toggle('has-vscroll', canScroll);
    } catch (_) {
      this.host.classList.remove('has-vscroll');
    }
  }

  handleClipboardKeys(ev) {
    if (ev.type !== 'keydown') return true;
    const key = ev.key;
    const mod = ev.ctrlKey || ev.metaKey;

    // Copy: Ctrl/Cmd+Shift+C, Ctrl+Insert, or Ctrl/Cmd+C when text is selected
    if (
      (mod && ev.shiftKey && (key === 'C' || key === 'c')) ||
      (ev.ctrlKey && !ev.altKey && !ev.metaKey && key === 'Insert') ||
      (mod && !ev.shiftKey && !ev.altKey && (key === 'C' || key === 'c') && this.term.hasSelection())
    ) {
      ev.preventDefault();
      this.copy();
      return false;
    }

    // Paste: Ctrl/Cmd+Shift+V, Ctrl/Cmd+V, Shift+Insert
    if (
      (mod && ev.shiftKey && (key === 'V' || key === 'v')) ||
      (mod && !ev.shiftKey && !ev.altKey && (key === 'V' || key === 'v')) ||
      (ev.shiftKey && !mod && !ev.altKey && key === 'Insert')
    ) {
      ev.preventDefault();
      this.paste();
      return false;
    }

    return true;
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
        promptConfig: this.getPromptConfig(),
        promptGitMode: this.getPromptGitMode(),
        cwd: this.getStartDirectory(),
        shellId: this.shellId,
      });
      if (!result?.ok) {
        this.term.writeln(`\r\nFailed to start shell: ${result?.error || 'unknown'}`);
        reportError({ message: result?.error || 'Failed to start shell', details: `[pty:start]\nsession ${this.sessionId}\n${result?.error || 'unknown'}` }, { context: 'shell' });
      } else {
        this.mode = 'local';
        if (result.shell) {
          this.shellInfo = result.shell;
          // Tabs are named after the shell they run: "cmd 1", "PowerShell 2" …
          this.title = `${result.shell.short || result.shell.label} ${this.sessionId}`;
          this.onTitle?.(this);
        }
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
      getPromptConfig: this.getPromptConfig,
      getPromptGitMode: this.getPromptGitMode,
      getTheme: this.getTheme,
      lsColors: this.getLsColors(),
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
    this.term.write(data, () => this.syncScrollbarVisibility());
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

  /** Pixel size of one cell and of the host, for "terminal size" profiles. */
  cellMetrics() {
    const screen = this.host.querySelector('.xterm-screen');
    const cols = this.term.cols || 1;
    const rows = this.term.rows || 1;
    const w = screen?.clientWidth || this.host.clientWidth || 0;
    const h = screen?.clientHeight || this.host.clientHeight || 0;
    return { cellWidth: w / cols, cellHeight: h / rows, hostWidth: this.host.clientWidth, hostHeight: this.host.clientHeight, cols, rows };
  }

  fit() {
    try {
      this.fitAddon.fit();
      if (this.api?.isElectron) {
        this.api.ptyResize(this.sessionId, this.term.cols, this.term.rows);
      } else {
        this.webShell?.resize(this.term.cols, this.term.rows);
      }
      this.syncScrollbarVisibility();
      this.onFit?.(this);
    } catch (_) {
      /* ignore */
    }
  }

  applyTheme(theme) {
    this.term.options.theme = toXtermTheme(theme, !!this.getHasBackgroundImage());
    this.term.options.customGlyphs = true;
    // Dark text on a light background reads thin at small sizes: weight it up a
    // little (the colours themselves are contrast-checked in themes.js).
    const light = isLightColor(theme?.background || '#000');
    this.term.options.fontWeight = light ? '600' : 'normal';
    this.term.options.fontWeightBold = light ? '800' : 'bold';
  }

  clear() {
    // Route through shell (Ctrl+L) so scrollback is wiped and the prompt is redrawn.
    if (this.api?.isElectron) {
      this.writeInput('\u000c');
      queueMicrotask(() => this.syncScrollbarVisibility());
      return;
    }
    if (this.webShell) {
      this.webShell.write('\u000c');
      queueMicrotask(() => this.syncScrollbarVisibility());
      return;
    }
    // Fallback: xterm.clear() drops scrollback; CSI also resets the viewport.
    this.term.clear();
    this.term.write('\x1b[3J\x1b[2J\x1b[H');
    this.syncScrollbarVisibility();
  }

  async copy() {
    const sel = this.term.getSelection();
    if (!sel) return false;
    try {
      if (this.api?.clipboardWriteText) {
        await this.api.clipboardWriteText(sel);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(sel);
      } else {
        return false;
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  async paste() {
    try {
      let text = '';
      if (this.api?.clipboardReadText) {
        const result = await this.api.clipboardReadText();
        text = result?.text || '';
      } else if (navigator.clipboard?.readText) {
        text = await navigator.clipboard.readText();
      }
      if (!text) return false;
      // Line-oriented shell: don't auto-submit on paste; keep as one editable line.
      text = String(text)
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\n+$/g, '')
        .replace(/\n/g, ' ');
      if (text) this.writeInput(text);
      return !!text;
    } catch (_) {
      return false;
    }
  }

  selectAll() {
    try {
      this.term.selectAll();
      return true;
    } catch (_) {
      return false;
    }
  }

  async copyAll() {
    try {
      const hadSelection = this.term.hasSelection();
      this.term.selectAll();
      const ok = await this.copy();
      if (!hadSelection) this.term.clearSelection();
      return ok;
    } catch (_) {
      return false;
    }
  }

  scrollToBottom() {
    try {
      this.term.scrollToBottom();
      return true;
    } catch (_) {
      return false;
    }
  }

  openContextMenu(clientX, clientY) {
    closeTerminalContextMenu();
    this.term.focus();

    const menu = document.createElement('div');
    menu.className = 'term-context-menu';
    menu.setAttribute('role', 'menu');

    const hasSelection = this.term.hasSelection();
    const items = [
      {
        id: 'copy',
        icon: CTX_ICONS.copy,
        label: this.i18n.t('contextMenu.copy', this.i18n.t('toolbar.copy')),
        shortcut: 'Ctrl+Shift+C',
        disabled: !hasSelection,
        action: () => this.copy(),
      },
      {
        id: 'copyAll',
        icon: CTX_ICONS.copyAll,
        label: this.i18n.t('contextMenu.copyAll', 'Copy All'),
        action: () => this.copyAll(),
      },
      {
        id: 'paste',
        icon: CTX_ICONS.paste,
        label: this.i18n.t('contextMenu.paste', this.i18n.t('toolbar.paste')),
        shortcut: 'Ctrl+Shift+V',
        action: () => this.paste(),
      },
      { type: 'sep' },
      {
        id: 'selectAll',
        icon: CTX_ICONS.selectAll,
        label: this.i18n.t('contextMenu.selectAll', 'Select All'),
        shortcut: 'Ctrl+Shift+A',
        action: () => this.selectAll(),
      },
      {
        id: 'clear',
        icon: CTX_ICONS.clear,
        label: this.i18n.t('contextMenu.clear', this.i18n.t('toolbar.clear')),
        shortcut: 'Ctrl+L',
        action: () => this.clear(),
      },
      { type: 'sep' },
      {
        id: 'fontInc',
        icon: CTX_ICONS.fontInc,
        label: this.i18n.t('contextMenu.fontIncrease', this.i18n.t('toolbar.fontIncrease', 'Increase Font')),
        action: () => this.changeFont(1),
      },
      {
        id: 'fontDec',
        icon: CTX_ICONS.fontDec,
        label: this.i18n.t('contextMenu.fontDecrease', this.i18n.t('toolbar.fontDecrease', 'Decrease Font')),
        action: () => this.changeFont(-1),
      },
      { type: 'sep' },
      {
        id: 'scrollBottom',
        icon: CTX_ICONS.scrollBottom,
        label: this.i18n.t('contextMenu.scrollToBottom', 'Scroll to Bottom'),
        action: () => this.scrollToBottom(),
      },
    ];

    for (const item of items) {
      if (item.type === 'sep') {
        const sep = document.createElement('div');
        sep.className = 'term-context-sep';
        sep.setAttribute('role', 'separator');
        menu.appendChild(sep);
        continue;
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'menu-item term-context-item';
      btn.setAttribute('role', 'menuitem');

      const icon = document.createElement('span');
      icon.className = 'ctx-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = item.icon
        ? `<svg viewBox="0 0 24 24">${item.icon}</svg>`
        : '';
      btn.appendChild(icon);

      const label = document.createElement('span');
      label.className = 'ctx-label';
      label.textContent = item.label;
      btn.appendChild(label);

      if (item.shortcut) {
        const kbd = document.createElement('span');
        kbd.className = 'ctx-shortcut';
        kbd.textContent = item.shortcut;
        btn.appendChild(kbd);
      }

      if (item.disabled) {
        btn.disabled = true;
        btn.classList.add('disabled');
      } else {
        btn.addEventListener('click', async () => {
          closeTerminalContextMenu();
          await item.action();
          this.term.focus();
        });
      }
      menu.appendChild(btn);
    }

    document.body.appendChild(menu);
    sharedContextMenu = menu;

    const pad = 8;
    const rect = menu.getBoundingClientRect();
    let left = clientX;
    let top = clientY;
    if (left + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    const onDoc = (ev) => {
      if (menu.contains(ev.target)) return;
      closeTerminalContextMenu();
    };
    const onKey = (ev) => {
      if (ev.key === 'Escape') closeTerminalContextMenu();
    };
    // Next tick so the opening click/contextmenu does not immediately close it.
    queueMicrotask(() => {
      document.addEventListener('mousedown', onDoc, true);
      document.addEventListener('keydown', onKey, true);
      window.addEventListener('blur', closeTerminalContextMenu);
      window.addEventListener('resize', closeTerminalContextMenu);
    });
    sharedContextMenuCloser = () => {
      document.removeEventListener('mousedown', onDoc, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', closeTerminalContextMenu);
      window.removeEventListener('resize', closeTerminalContextMenu);
    };
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

  setLsColors(colors) {
    this.webShell?.setLsColors?.(colors);
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
    // Each step is isolated: a throw in one (notably xterm's term.dispose(), which
    // can hit "_isDisposed of undefined" when the WebGL/canvas renderer is already
    // torn down) must not abort the caller (close()), or the tab never closes and
    // the app never quits.
    const safely = (fn) => {
      try {
        fn();
      } catch (_) {
        /* keep tearing down */
      }
    };
    safely(() => closeTerminalContextMenu());
    for (const d of this.disposers) safely(() => d());
    this.disposers = [];
    if (killBackend) {
      safely(() => this.api?.ptyKill?.(this.sessionId));
      safely(() => this.webShell?.kill());
    }
    safely(() => this.term.dispose());
    safely(() => this.host.remove());
  }
}
