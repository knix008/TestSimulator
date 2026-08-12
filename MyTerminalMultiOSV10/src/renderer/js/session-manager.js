import { TerminalPane } from './terminal.js';

export class SessionManager {
  constructor({
    tabBar,
    panesHost,
    api,
    i18n,
    getTheme,
    getHasBackgroundImage,
    getPromptTemplate,
    getPromptGitMode,
    getStartDirectory,
    getNewSessionOptions,
    onActiveChange,
    onPaneFit,
  }) {
    this.tabBar = tabBar;
    this.panesHost = panesHost;
    this.api = api;
    this.i18n = i18n;
    this.getTheme = getTheme;
    this.getHasBackgroundImage = getHasBackgroundImage || (() => false);
    this.getPromptTemplate = getPromptTemplate;
    this.getPromptGitMode = getPromptGitMode || (() => 'status');
    this.getStartDirectory = getStartDirectory || (() => '');
    this.getNewSessionOptions = getNewSessionOptions || (() => ({}));
    this.onActiveChange = onActiveChange || (() => {});
    this.onPaneFit = onPaneFit || (() => {});
    this.panes = new Map();
    this.activeId = null;
    this.nextLocalNum = 1;
    this.disposers = [];
    this.dragState = null;
    this.suppressClickUntil = 0;

    if (api?.onPtyData) {
      this.disposers.push(
        api.onPtyData((payload) => {
          const sessionId = String(payload?.sessionId ?? '');
          const data = payload?.data ?? payload;
          const pane = this.panes.get(sessionId);
          if (pane && typeof data === 'string') pane.handleData(data);
        })
      );
    }
    if (api?.onPtyExit) {
      this.disposers.push(
        api.onPtyExit((payload) => {
          const sessionId = String(payload?.sessionId ?? payload ?? '');
          const pane = this.panes.get(sessionId);
          if (pane) pane.handleExit();
          this.renderTabs();
        })
      );
    }
    if (api?.onSessionDetached) {
      this.disposers.push(
        api.onSessionDetached(async (payload) => {
          await this.detachLocalUi(payload?.sessionId);
        })
      );
    }

    this.tabBar.addEventListener('click', (e) => {
      if (Date.now() < this.suppressClickUntil) return;
      const newBtn = e.target.closest('[data-new-tab]');
      if (newBtn) {
        e.stopPropagation();
        this.create(this.getNewSessionOptions()).then(() => {
          this.onActiveChange(this.active);
        });
        return;
      }
      const closeBtn = e.target.closest('[data-close-tab]');
      if (closeBtn) {
        e.stopPropagation();
        this.close(closeBtn.dataset.closeTab);
        return;
      }
      const tab = e.target.closest('[data-tab-id]');
      if (tab) this.activate(tab.dataset.tabId);
    });

    this.tabBar.addEventListener('pointerdown', (e) => this.onTabPointerDown(e));
    window.addEventListener('pointermove', (e) => this.onTabPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onTabPointerUp(e));
    window.addEventListener('pointercancel', () => this.resetDrag());

    window.addEventListener('resize', () => this.active?.fit());
  }

  get active() {
    return this.panes.get(this.activeId) || null;
  }

  get size() {
    return this.panes.size;
  }

  async create(options = {}) {
    const preferredId = options.sessionId ? String(options.sessionId) : null;
    const sessionId = preferredId || String(this.nextLocalNum++);
    if (!preferredId) {
      const n = Number(sessionId);
      if (!Number.isNaN(n) && n >= this.nextLocalNum) this.nextLocalNum = n + 1;
    } else {
      const n = Number(sessionId);
      if (!Number.isNaN(n) && n >= this.nextLocalNum) this.nextLocalNum = n + 1;
    }

    const host = document.createElement('div');
    host.className = 'terminal-pane';
    host.dataset.sessionId = sessionId;
    this.panesHost.appendChild(host);

    const title =
      options.title || `${this.i18n.t('tabs.session')} ${sessionId}`;
    const pane = new TerminalPane({
      sessionId,
      host,
      api: this.api,
      i18n: this.i18n,
      getTheme: this.getTheme,
      getHasBackgroundImage: this.getHasBackgroundImage,
      getPromptTemplate: this.getPromptTemplate,
      getPromptGitMode: this.getPromptGitMode,
      getStartDirectory: this.getStartDirectory,
      title,
    });

    if (options.fontSize) pane.setFontSize(options.fontSize);
    if (options.fontFamily) pane.setFontFamily(options.fontFamily);
    if (options.scrollback != null) pane.setScrollback(options.scrollback);
    pane.onFit = () => this.onPaneFit(pane);

    this.panes.set(sessionId, pane);

    if (options.adopt) {
      await pane.adopt(options.adopt);
    } else {
      await pane.start();
    }

    this.activate(sessionId);
    this.renderTabs();
    return pane;
  }

  activate(sessionId) {
    const id = String(sessionId);
    if (!this.panes.has(id)) return;
    this.activeId = id;
    for (const [pid, pane] of this.panes) {
      pane.setActive(pid === id);
    }
    this.renderTabs();
    this.onActiveChange(this.active);
  }

  async close(sessionId) {
    const id = String(sessionId);
    const pane = this.panes.get(id);
    if (!pane) return;
    if (this.panes.size <= 1) {
      await pane.start();
      this.renderTabs();
      return;
    }

    const ids = [...this.panes.keys()];
    const idx = ids.indexOf(id);
    pane.dispose({ killBackend: true });
    this.panes.delete(id);

    const nextId = ids[idx - 1] || ids[idx + 1];
    if (this.activeId === id) this.activate(nextId);
    else this.renderTabs();
  }

  /** Remove tab UI after backend was moved to another window. */
  async detachLocalUi(sessionId) {
    const id = String(sessionId);
    const pane = this.panes.get(id);
    if (!pane) return;

    const ids = [...this.panes.keys()];
    const idx = ids.indexOf(id);
    pane.dispose({ killBackend: false });
    this.panes.delete(id);

    if (this.panes.size === 0) {
      // Keep the source window usable with a fresh session.
      await this.create();
      return;
    }

    const nextId = ids[idx - 1] || ids[idx + 1];
    if (this.activeId === id) this.activate(nextId);
    else this.renderTabs();
    this.onActiveChange(this.active);
  }

  renderTabs() {
    const tabs = [...this.panes.values()]
      .map((pane) => {
        const active = pane.sessionId === this.activeId ? ' active' : '';
        const remote = pane.mode === 'ssh' ? ' remote' : '';
        const label = pane.title || `${this.i18n.t('tabs.session')} ${pane.sessionId}`;
        return `
          <button type="button" class="tab-item${active}${remote}" data-tab-id="${
            pane.sessionId
          }" title="${escapeAttr(label)} — ${escapeAttr(this.i18n.t('tabs.dragHint'))}">
            <span class="tab-label">${escapeHtml(label)}</span>
            <span class="tab-close" data-close-tab="${pane.sessionId}" title="${escapeAttr(
              this.i18n.t('tabs.close')
            )}">×</span>
          </button>
        `;
      })
      .join('');
    const newLabel = this.i18n.t('tabs.new', this.i18n.t('toolbar.newSession', 'New Session'));
    const newTab = `
      <button
        type="button"
        class="tab-item tab-new"
        data-new-tab="1"
        title="${escapeAttr(newLabel)}"
        aria-label="${escapeAttr(newLabel)}"
      >
        <span class="tab-new-icon" aria-hidden="true">+</span>
      </button>
    `;
    this.tabBar.innerHTML = tabs + newTab;
  }

  detachPreviewSize(bounds) {
    return {
      width: Math.max(800, (bounds?.width || 1000) - 40),
      height: Math.max(500, (bounds?.height || 680) - 40),
    };
  }

  isDetachZone(screenX, screenY, bounds) {
    if (!bounds) return false;
    const outside =
      screenX < bounds.x - 8 ||
      screenY < bounds.y - 8 ||
      screenX > bounds.x + bounds.width + 8 ||
      screenY > bounds.y + bounds.height + 8;
    const pulledOut = screenY > bounds.y + 80;
    return outside || pulledOut;
  }

  previewPosition(screenX, screenY) {
    return {
      x: Math.round(screenX - 80),
      y: Math.round(screenY - 20),
    };
  }

  async updateDetachPreview(screenX, screenY) {
    const drag = this.dragState;
    if (!drag?.moved || !drag.bounds) return;

    const canDetach = this.isDetachZone(screenX, screenY, drag.bounds);
    const hint = this.i18n.t('tabs.detachPreviewHint');
    document.body.dataset.detachHint = hint;

    if (canDetach) {
      document.body.classList.add('tab-detach-ready');
      const size = this.detachPreviewSize(drag.bounds);
      const pos = this.previewPosition(screenX, screenY);
      if (!drag.previewShown && this.api.showDetachPreview) {
        await this.api.showDetachPreview({
          ...size,
          ...pos,
          hint,
        });
        drag.previewShown = true;
      } else if (drag.previewShown && this.api.moveDetachPreview) {
        this.api.moveDetachPreview(pos);
      }
    } else {
      document.body.classList.remove('tab-detach-ready');
      if (drag.previewShown) {
        drag.previewShown = false;
        this.api.hideDetachPreview?.();
      }
    }
  }

  clearDetachPreview() {
    document.body.classList.remove('tab-detach-ready');
    delete document.body.dataset.detachHint;
    if (this.dragState?.previewShown) {
      this.dragState.previewShown = false;
    }
    this.api.hideDetachPreview?.();
  }

  async onTabPointerDown(e) {
    if (e.button !== 0) return;
    if (e.target.closest('[data-close-tab]')) return;
    if (e.target.closest('[data-new-tab]')) return;
    if (!this.api?.isElectron || !this.api.detachSession) return;
    const tab = e.target.closest('[data-tab-id]');
    if (!tab) return;

    const bounds = (await this.api.getWindowBounds?.()) || null;
    this.dragState = {
      sessionId: tab.dataset.tabId,
      startX: e.screenX,
      startY: e.screenY,
      moved: false,
      tabEl: tab,
      bounds,
      previewShown: false,
    };
    tab.classList.add('dragging');
    tab.setPointerCapture?.(e.pointerId);
  }

  onTabPointerMove(e) {
    if (!this.dragState) return;
    const dx = e.screenX - this.dragState.startX;
    const dy = e.screenY - this.dragState.startY;
    if (!this.dragState.moved && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
      this.dragState.moved = true;
      document.body.classList.add('tab-dragging');
    }
    if (this.dragState.moved) {
      this.updateDetachPreview(e.screenX, e.screenY);
    }
  }

  async onTabPointerUp(e) {
    const drag = this.dragState;
    if (!drag) return;

    const tabEl = drag.tabEl;
    tabEl?.classList.remove('dragging');
    document.body.classList.remove('tab-dragging');

    const canDetach =
      drag.moved && this.isDetachZone(e.screenX, e.screenY, drag.bounds);
    const movedFar =
      drag.moved &&
      (Math.abs(e.screenX - drag.startX) > 24 || Math.abs(e.screenY - drag.startY) > 24);

    this.clearDetachPreview();
    this.dragState = null;
    if (movedFar) this.suppressClickUntil = Date.now() + 400;

    if (!canDetach || !this.api?.detachSession) return;

    const bounds = drag.bounds || (await this.api.getWindowBounds?.());
    if (!bounds) return;

    const pane = this.panes.get(String(drag.sessionId));
    if (!pane) return;

    const size = this.detachPreviewSize(bounds);
    await this.api.detachSession({
      sessionId: pane.sessionId,
      title: pane.title,
      mode: pane.mode,
      serialized: pane.serialize(),
      fontSize: pane.fontSize,
      fontFamily: pane.fontFamily,
      width: size.width,
      height: size.height,
    });
    // Source UI removal is handled by session:detached event.
  }

  resetDrag() {
    if (this.dragState?.tabEl) this.dragState.tabEl.classList.remove('dragging');
    document.body.classList.remove('tab-dragging');
    this.clearDetachPreview();
    this.dragState = null;
  }

  applyTheme(theme) {
    for (const pane of this.panes.values()) pane.applyTheme(theme);
  }

  setFontSize(size) {
    for (const pane of this.panes.values()) pane.setFontSize(size);
  }

  changeFont(delta) {
    const pane = this.active;
    if (!pane) return;
    pane.changeFont(delta);
    const size = pane.fontSize;
    for (const p of this.panes.values()) {
      if (p !== pane) p.setFontSize(size);
    }
    return size;
  }

  setFontFamily(family) {
    for (const pane of this.panes.values()) pane.setFontFamily(family);
  }

  setScrollback(lines) {
    for (const pane of this.panes.values()) pane.setScrollback(lines);
  }

  dispose() {
    this.disposers.forEach((d) => d());
    for (const pane of this.panes.values()) pane.dispose({ killBackend: true });
    this.panes.clear();
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/'/g, '&#39;');
}
