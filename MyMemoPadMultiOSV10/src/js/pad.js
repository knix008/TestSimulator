import { t } from './i18n.js';
import {
  applyThemeVars,
  ensureReadableFore,
  fileToHtml,
  htmlToPlain,
  lookFromSettings,
  saveMemo,
  storedToHtml,
  transparencyToOpacity,
  tryDelete
} from './shared.js';
import { showAlert, showConfirm } from './dialogs.js';

export function initPad({
  isElectron,
  isWeb,
  api,
  getMemos,
  setMemos,
  getSettings,
  setSettings,
  getLook,
  setLook,
  removeLook,
  showList,
  openSettings,
  onWebNew,
  onWebBack
}) {
  const editor = document.getElementById('memo-editor');
  const view = document.getElementById('view-pad');
  let sourceIndex = -1;
  let sourceMemo = null;
  let look = lookFromSettings(getSettings());
  let skipSave = false;

  function applyLook(next, { persistOpacity = true } = {}) {
    look = { ...look, ...next };
    const back = look.editorBackColor;
    const fore = ensureReadableFore(back, look.foreColor);
    look.foreColor = fore;
    applyThemeVars(back);
    editor.style.fontFamily = look.fontName;
    editor.style.fontSize = `${look.fontSize}px`;
    editor.style.color = fore;
    editor.style.background = back;
    if (look.fontStyle?.toLowerCase().includes('bold')) editor.style.fontWeight = '700';
    else editor.style.fontWeight = '';
    if (look.fontStyle?.toLowerCase().includes('italic')) editor.style.fontStyle = 'italic';
    else editor.style.fontStyle = '';
    if (persistOpacity && isElectron && api?.setWindowOpacity) {
      api.setWindowOpacity(transparencyToOpacity(look.transparencyPercent));
    }
    notifyState();
  }

  function currentHtml() {
    return editor.innerHTML;
  }

  function isEmpty() {
    return !htmlToPlain(currentHtml()).trim();
  }

  function notifyState() {
    api?.notifyPadState?.({
      sourceIndex,
      sourceMemo,
      empty: isEmpty(),
      html: currentHtml(),
      look
    });
  }

  function loadPayload(payload) {
    if (!payload) return;
    sourceIndex = Number.isInteger(payload.sourceIndex) ? payload.sourceIndex : -1;
    if (payload.file) {
      editor.innerHTML = fileToHtml(payload.file.ext, payload.file.content);
      sourceMemo = null;
      sourceIndex = -1;
    } else if (payload.html != null) {
      editor.innerHTML = storedToHtml(payload.html);
      sourceMemo = payload.html || null;
    }
    if (payload.look) applyLook(payload.look);
    else if (payload.settings) applyLook(lookFromSettings(payload.settings));
    notifyState();
    editor.focus();
  }

  async function persistCurrent(showResult) {
    if (isEmpty()) {
      if (showResult) await showAlert(t('memo.empty'));
      return false;
    }
    const html = currentHtml();
    const result = saveMemo(getMemos(), sourceIndex, sourceMemo, html);
    setMemos(result.items);
    sourceIndex = result.sourceIndex;
    sourceMemo = result.sourceMemo;
    if (sourceIndex >= 0) setLook(sourceIndex, look);
    notifyState();
    if (showResult) {
      await showAlert(t(result.updated ? 'memo.updated' : 'memo.added'), t('common.done'));
    }
    return true;
  }

  async function deleteCurrent() {
    const result = tryDelete(getMemos(), sourceIndex, sourceMemo, currentHtml());
    if (!result) {
      await showAlert(t('memo.nothingToDelete'));
      return;
    }
    const ok = await showConfirm(t('memo.confirmDelete'), t('memo.confirmDelete.title'));
    if (!ok) return;
    removeLook(result.removedIndex);
    setMemos(result.items);
    sourceIndex = -1;
    sourceMemo = null;
    skipSave = true;
    if (isWeb) {
      editor.innerHTML = '';
      onWebBack?.();
      return;
    }
    if (api?.closePad) api.closePad();
    else editor.innerHTML = '';
  }

  let savedRange = null;

  function rememberSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && editor.contains(sel.anchorNode)) {
      savedRange = sel.getRangeAt(0).cloneRange();
    }
  }

  function restoreSelection() {
    if (!savedRange) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
  }

  function applyFont({ family, size, color, whole }) {
    editor.focus();
    restoreSelection();
    if (whole || !window.getSelection()?.toString()) {
      applyLook({
        ...look,
        fontName: family || look.fontName,
        fontSize: size || look.fontSize,
        foreColor: color || look.foreColor
      });
      return;
    }
    document.execCommand('fontName', false, family);
    document.execCommand('foreColor', false, color);
    document.execCommand('fontSize', false, '4');
    editor.querySelectorAll('font[size="4"]').forEach((el) => {
      el.removeAttribute('size');
      el.style.fontSize = `${size || look.fontSize}px`;
      el.style.fontFamily = family;
    });
    rememberSelection();
    notifyState();
  }

  function toggleStyle(command, whole) {
    editor.focus();
    restoreSelection();
    if (whole) document.execCommand('selectAll', false);
    document.execCommand(command, false);
    rememberSelection();
    notifyState();
  }

  function handleSettingsCommand(cmd) {
    if (!cmd) return;
    if (cmd.type === 'previewColor' && cmd.color) {
      applyLook({ editorBackColor: cmd.color, formBackColor: cmd.color }, { persistOpacity: false });
      return;
    }
    if (cmd.type === 'applyFont') {
      applyFont(cmd);
      return;
    }
    if (cmd.type === 'toggleStyle') {
      toggleStyle(cmd.command, cmd.whole);
      return;
    }
    if (cmd.type === 'opacity') {
      applyLook({ transparencyPercent: cmd.transparencyPercent });
      return;
    }
    if (cmd.type === 'cancel' && cmd.snapshot) {
      if (cmd.snapshot.html != null) editor.innerHTML = cmd.snapshot.html;
      if (cmd.snapshot.look) applyLook(cmd.snapshot.look);
      return;
    }
    if (cmd.type === 'commit' && cmd.look) {
      applyLook(cmd.look);
    }
  }

  function wireToolbar() {
    document.getElementById('btn-add').addEventListener('click', async () => {
      if (!isEmpty()) await persistCurrent(false);
      if (isWeb) {
        onWebNew?.();
        return;
      }
      api?.openNewMemo?.();
    });
    document.getElementById('btn-delete').addEventListener('click', () => deleteCurrent());
    document.getElementById('btn-settings').addEventListener('click', () => openSettings());
    document.getElementById('btn-list').addEventListener('click', () => {
      if (isWeb) onWebBack?.();
      else showList();
    });
    document.getElementById('btn-close').addEventListener('click', async () => {
      await persistCurrent(false);
      if (isWeb) onWebBack?.();
      else api?.close?.();
    });
  }

  editor.addEventListener('keydown', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    const key = e.key.toLowerCase();
    if (key === 'b') {
      e.preventDefault();
      document.execCommand('bold');
    } else if (key === 'i') {
      e.preventDefault();
      document.execCommand('italic');
    } else if (key === 'u') {
      e.preventDefault();
      document.execCommand('underline');
    } else if (key === 's' && e.shiftKey) {
      e.preventDefault();
      document.execCommand('strikeThrough');
    }
  });

  editor.addEventListener('input', notifyState);
  editor.addEventListener('mouseup', rememberSelection);
  editor.addEventListener('keyup', rememberSelection);
  editor.addEventListener('blur', rememberSelection);

  window.addEventListener('beforeunload', () => {
    if (!skipSave) persistCurrent(false);
  });

  wireToolbar();
  applyLook(look);

  if (isElectron && api?.onPadLoad) {
    api.onPadLoad((payload) => loadPayload(payload));
  }

  return {
    view,
    editor,
    getLook: () => look,
    applyLook,
    loadPayload,
    persistCurrent,
    handleSettingsCommand,
    getSourceIndex: () => sourceIndex,
    getHtml: () => currentHtml(),
    setSourceIndex: (n) => {
      sourceIndex = n;
      notifyState();
    }
  };
}
