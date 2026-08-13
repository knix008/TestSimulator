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
    getLsColors,
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
    this.getLsColors = getLsColors || (() => ({}));
    this.getNewSessionOptions = getNewSessionOptions || (() => ({}));
    this.onActiveChange = onActiveChange || (() => {});
    this.onPaneFit = onPaneFit || (() => {});
    this.panes = new Map();
    this.activeId = null;
    this.nextLocalNum = 1;
    this.disposers = [];
    this.dragState = null;
    this.suppressClickUntil = 0;
    this.mergeGhost = null;
    this.mergeDropSlots = null;
    this._previewSeq = 0;

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
          await this.detachLocalUi(payload?.sessionId, {
            closeIfEmpty: Boolean(payload?.closeIfEmpty),
          });
        })
      );
    }
    if (api?.onSessionAdopt) {
      this.disposers.push(
        api.onSessionAdopt(async (payload) => {
          await this.adoptIncoming(payload);
        })
      );
    }
    if (api?.onMergePreview) {
      this.disposers.push(
        api.onMergePreview((payload) => this.showMergeGhost(payload || {}))
      );
    }
    if (api?.onMergePreviewClear) {
      this.disposers.push(api.onMergePreviewClear(() => this.clearMergeGhost()));
    }

    this.tabBar.addEventListener('click', (e) => {
      const closeBtn = e.target.closest('[data-close-tab]');
      if (closeBtn) {
        e.stopPropagation();
        this.close(closeBtn.dataset.closeTab);
        return;
      }
      if (Date.now() < this.suppressClickUntil) return;
      const newBtn = e.target.closest('[data-new-tab]');
      if (newBtn) {
        e.stopPropagation();
        this.create(this.getNewSessionOptions()).then(() => {
          this.onActiveChange(this.active);
        });
        return;
      }
      const tab = e.target.closest('[data-tab-id]');
      if (tab) this.activate(tab.dataset.tabId);
    });

    this.tabBar.addEventListener('pointerdown', (e) => this.onTabPointerDown(e));
    const onUp = (e) => this.onTabPointerUp(e);
    window.addEventListener('pointermove', (e) => this.onTabPointerMove(e), true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);

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
      getLsColors: this.getLsColors,
      title,
    });

    if (options.fontSize) pane.setFontSize(options.fontSize);
    if (options.fontFamily) pane.setFontFamily(options.fontFamily);
    if (options.scrollback != null) pane.setScrollback(options.scrollback);
    pane.onFit = () => this.onPaneFit(pane);

    this.placePaneInOrder(sessionId, pane, options.insertIndex);

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
    if (this.mergeGhost) this.clearMergeGhost();
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
  async detachLocalUi(sessionId, options = {}) {
    const id = String(sessionId);
    const pane = this.panes.get(id);
    if (!pane) return;

    const ids = [...this.panes.keys()];
    const idx = ids.indexOf(id);
    pane.dispose({ killBackend: false });
    this.panes.delete(id);

    if (this.panes.size === 0) {
      if (this.api.destroyEmptyWindow) {
        await this.api.destroyEmptyWindow();
        return;
      }
      if (options.closeIfEmpty) return;
      await this.create();
      return;
    }

    const nextId = ids[idx - 1] || ids[idx + 1];
    if (this.activeId === id) this.activate(nextId);
    else this.renderTabs();
    this.onActiveChange(this.active);
  }

  /** Accept a session moved from another window (merge). */
  async adoptIncoming(payload = {}) {
    const sessionId = String(payload.sessionId || '');
    if (!sessionId) return;
    if (this.panes.has(sessionId)) {
      this.clearMergeGhost();
      this.activate(sessionId);
      return;
    }

    let meta = {
      title: payload.title,
      mode: payload.mode,
      serialized: payload.serialized,
      fontSize: payload.fontSize,
      fontFamily: payload.fontFamily,
    };
    if (!meta.serialized && this.api.takeAdopt) {
      const stashed = await this.api.takeAdopt(sessionId);
      if (stashed) meta = { ...meta, ...stashed };
    } else if (this.api.takeAdopt) {
      // Clear stash so a later boot adopt cannot double-load.
      await this.api.takeAdopt(sessionId);
    }

    const insertIndex = this.resolveAdoptInsertIndex(payload);
    this.clearMergeGhost();

    await this.create({
      sessionId,
      title: meta.title,
      insertIndex,
      adopt: {
        title: meta.title,
        mode: meta.mode || 'local',
        serialized: meta.serialized || '',
        fontSize: meta.fontSize,
        fontFamily: meta.fontFamily,
      },
    });
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
    if (this.mergeGhost) this.mountMergeGhost();
  }

  placePaneInOrder(sessionId, pane, insertIndex) {
    const id = String(sessionId);
    if (insertIndex == null || !Number.isFinite(insertIndex)) {
      this.panes.set(id, pane);
      return;
    }
    const entries = [...this.panes.entries()].filter(([pid]) => pid !== id);
    const idx = Math.max(0, Math.min(Math.round(insertIndex), entries.length));
    entries.splice(idx, 0, [id, pane]);
    this.panes = new Map(entries);
  }

  resolveAdoptInsertIndex(payload = {}) {
    if (Number.isFinite(payload.screenX)) {
      return this.getInsertIndexFromScreenX(payload.screenX);
    }
    if (
      this.mergeGhost &&
      this.mergeGhost.sessionId === String(payload.sessionId || '')
    ) {
      return this.mergeGhost.insertIndex;
    }
    if (Number.isFinite(payload.insertIndex)) return payload.insertIndex;
    return this.panes.size;
  }

  viewportXFromScreen(screenX) {
    const dip = Number(screenX);
    if (!Number.isFinite(dip)) return 0;
    return dip - window.screenX;
  }

  measureDropSlots() {
    const items = [
      ...this.tabBar.querySelectorAll('.tab-item:not(.tab-new):not(.tab-ghost)'),
    ];
    return items.map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, mid: r.left + r.width / 2, right: r.right };
    });
  }

  getInsertIndexFromScreenX(screenX) {
    const slots = this.mergeDropSlots || this.measureDropSlots();
    const x = this.viewportXFromScreen(screenX);
    for (let i = 0; i < slots.length; i++) {
      if (x < slots[i].mid) return i;
    }
    return slots.length;
  }

  showMergeGhost(payload = {}) {
    const sessionId = String(payload.sessionId || '');
    if (this.panes.has(sessionId)) {
      this.clearMergeGhost();
      return;
    }
    const title =
      payload.title || `${this.i18n.t('tabs.session')} ${sessionId}`.trim();
    if (!this.mergeDropSlots) this.mergeDropSlots = this.measureDropSlots();
    const insertIndex = this.getInsertIndexFromScreenX(payload.screenX);
    const next = {
      sessionId,
      title,
      mode: payload.mode || 'local',
      insertIndex,
    };
    const same =
      this.mergeGhost &&
      this.mergeGhost.sessionId === next.sessionId &&
      this.mergeGhost.title === next.title &&
      this.mergeGhost.mode === next.mode &&
      this.mergeGhost.insertIndex === next.insertIndex;
    this.mergeGhost = next;
    if (same && this.tabBar.querySelector('.tab-ghost')) return;
    this.mountMergeGhost();
  }

  mountMergeGhost() {
    const ghost = this.mergeGhost;
    if (!ghost) return;
    this.tabBar.classList.add('merge-drop-target');
    document.body.classList.add('tab-merge-target');
    document.body.dataset.mergeHint = this.i18n.t('tabs.mergePreviewHint');

    let el = this.tabBar.querySelector('.tab-ghost');
    const created = !el;
    if (!el) {
      el = document.createElement('button');
      el.type = 'button';
      el.className = 'tab-item tab-ghost';
      el.disabled = true;
      el.tabIndex = -1;
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = '<span class="tab-label"></span>';
    }
    el.classList.toggle('remote', ghost.mode === 'ssh');
    el.querySelector('.tab-label').textContent =
      ghost.title || this.i18n.t('tabs.session');
    el.title = this.i18n.t('tabs.mergePreviewHint');

    const items = [
      ...this.tabBar.querySelectorAll('.tab-item:not(.tab-new):not(.tab-ghost)'),
    ];
    const newBtn = this.tabBar.querySelector('[data-new-tab]');
    const idx = Math.max(0, Math.min(ghost.insertIndex, items.length));
    const ref = items[idx] || newBtn;
    if (el.parentNode !== this.tabBar || el.nextSibling !== ref) {
      this.tabBar.insertBefore(el, ref || null);
    }
    if (created) {
      el.classList.add('tab-ghost-enter');
      el.addEventListener(
        'animationend',
        () => el.classList.remove('tab-ghost-enter'),
        { once: true }
      );
    }
  }

  clearMergeGhost() {
    this.mergeGhost = null;
    this.mergeDropSlots = null;
    this.tabBar?.classList.remove('merge-drop-target');
    document.body.classList.remove('tab-merge-target');
    delete document.body.dataset.mergeHint;
    this.tabBar?.querySelector('.tab-ghost')?.remove();
  }

  detachPreviewSize(bounds) {
    return {
      width: Math.max(800, (bounds?.width || 1000) - 40),
      height: Math.max(500, (bounds?.height || 680) - 40),
    };
  }

  isDetachZone(screenX, screenY, bounds) {
    if (!bounds) return false;
    const pulledOut = screenY > bounds.y + 80;
    return this.isOutsideWindow(screenX, screenY, bounds) || pulledOut;
  }

  isOutsideWindow(screenX, screenY, bounds) {
    if (!bounds) return false;
    return (
      screenX < bounds.x - 8 ||
      screenY < bounds.y - 8 ||
      screenX > bounds.x + bounds.width + 8 ||
      screenY > bounds.y + bounds.height + 8
    );
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
    const seq = ++this._previewSeq;

    const mergeTarget =
      (this.api.findWindowAtPoint &&
        (await this.api.findWindowAtPoint({ x: screenX, y: screenY }))) ||
      null;
    if (!this.dragState || seq !== this._previewSeq) return;

    drag.mergeTargetId = mergeTarget?.id || null;

    if (mergeTarget) {
      document.body.classList.remove('tab-detach-ready');
      document.body.classList.add('tab-merge-ready');
      document.body.dataset.detachHint = this.i18n.t('tabs.mergePreviewHint');
      if (drag.previewShown) {
        drag.previewShown = false;
        this.api.hideDetachPreview?.();
      }
      this.sendMergePreview(mergeTarget, screenX, screenY);
      return;
    }

    if (drag.mergePreviewTargetId) {
      drag.mergePreviewTargetId = null;
      this.api.clearMergePreview?.();
    }
    document.body.classList.remove('tab-merge-ready');

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

  sendMergePreview(mergeTarget, screenX, screenY) {
    const drag = this.dragState;
    if (!drag || !mergeTarget || !this.api.showMergePreview) return;
    const pane = this.panes.get(String(drag.sessionId));
    const now = Date.now();
    const sameTarget = drag.mergePreviewTargetId === mergeTarget.id;
    if (sameTarget && now - (drag.lastMergePreviewAt || 0) < 32) return;
    drag.mergePreviewTargetId = mergeTarget.id;
    drag.lastMergePreviewAt = now;
    this.api.showMergePreview({
      targetWindowId: mergeTarget.id,
      sessionId: drag.sessionId,
      title: pane?.title || '',
      mode: pane?.mode || 'local',
      screenX,
      screenY,
    });
  }

  clearDetachPreview(options = {}) {
    document.body.classList.remove('tab-detach-ready');
    document.body.classList.remove('tab-merge-ready');
    delete document.body.dataset.detachHint;
    if (this.dragState?.previewShown) {
      this.dragState.previewShown = false;
    }
    this.api.hideDetachPreview?.();
    if (!options.keepMergeGhost) {
      if (this.dragState) this.dragState.mergePreviewTargetId = null;
      this.api.clearMergePreview?.();
    }
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
      mergeTargetId: null,
      mergePreviewTargetId: null,
      lastMergePreviewAt: 0,
    };
    tab.classList.add('dragging');
    tab.setPointerCapture?.(e.pointerId);
  }

  onTabPointerMove(e) {
    if (!this.dragState) return;
    this.dragState.lastScreenX = e.screenX;
    this.dragState.lastScreenY = e.screenY;
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
    // pointerup + pointercancel can both fire; finish only once.
    this.dragState = null;

    const tabEl = drag.tabEl;
    tabEl?.classList.remove('dragging');
    document.body.classList.remove('tab-dragging');

    const screenX = Number.isFinite(e?.screenX) ? e.screenX : drag.lastScreenX;
    const screenY = Number.isFinite(e?.screenY) ? e.screenY : drag.lastScreenY;

    let mergeTarget = drag.moved && drag.mergeTargetId
      ? { id: drag.mergeTargetId }
      : null;
    if (!mergeTarget && drag.moved && this.api.findWindowAtPoint) {
      mergeTarget =
        (await this.api.findWindowAtPoint({
          x: screenX,
          y: screenY,
        })) || null;
    }
    const canDetach =
      !mergeTarget &&
      drag.moved &&
      this.isDetachZone(screenX, screenY, drag.bounds);
    const movedFar =
      drag.moved &&
      (Math.abs(screenX - drag.startX) > 24 ||
        Math.abs(screenY - drag.startY) > 24);

    const merging = Boolean(mergeTarget && this.api.attachSession);
    this.clearDetachPreview({ keepMergeGhost: merging });
    if (movedFar && !merging) this.suppressClickUntil = Date.now() + 400;

    const pane = this.panes.get(String(drag.sessionId));
    if (!pane) {
      if (merging) this.api.clearMergePreview?.();
      return;
    }

    if (merging) {
      const result = await this.api.attachSession({
        sessionId: pane.sessionId,
        title: pane.title,
        mode: pane.mode,
        serialized: pane.serialize(),
        fontSize: pane.fontSize,
        fontFamily: pane.fontFamily,
        targetWindowId: mergeTarget.id,
        screenX,
        screenY,
      });
      if (!result?.ok) {
        this.api.clearMergePreview?.();
        return;
      }
      await this.detachLocalUi(pane.sessionId, { closeIfEmpty: true });
      return;
    }

    if (!canDetach || !this.api?.detachSession) return;

    const bounds = drag.bounds || (await this.api.getWindowBounds?.());
    if (!bounds) return;

    const size = this.detachPreviewSize(bounds);
    const detached = await this.api.detachSession({
      sessionId: pane.sessionId,
      title: pane.title,
      mode: pane.mode,
      serialized: pane.serialize(),
      fontSize: pane.fontSize,
      fontFamily: pane.fontFamily,
      width: size.width,
      height: size.height,
    });
    // Remove the tab here as well — do not wait only on session:detached.
    if (detached?.ok) {
      await this.detachLocalUi(pane.sessionId, { closeIfEmpty: true });
    }
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

  setLsColors(colors) {
    for (const pane of this.panes.values()) pane.setLsColors?.(colors);
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
    this.clearMergeGhost();
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
