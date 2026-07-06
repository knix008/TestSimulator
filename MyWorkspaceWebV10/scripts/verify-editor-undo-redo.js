const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { app, BrowserWindow } = require('electron');

const templatePath = path.join(__dirname, '..', 'src', 'renderer', 'editor', 'win-editor-template.html');

async function runChecks() {
  const template = fs.readFileSync(templatePath, 'utf8');
  const body = '<p id="test-line">alpha</p>';
  const html = template.replace('/*EDITOR_BODY*/', body);
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: false
    }
  });

  const results = [];

  function record(name, passed, detail = '') {
    results.push({ name, passed, detail });
  }

  try {
    await win.loadURL(dataUrl);
    await win.webContents.executeJavaScript(`
      new Promise((resolve) => {
        if (document.readyState === 'complete' && window.editorApi) {
          resolve();
          return;
        }
        window.addEventListener('load', () => resolve(), { once: true });
      })
    `);

    const typingUndoRedo = await win.webContents.executeJavaScript(`
      (() => {
        const editor = document.getElementById('editor');
        const line = document.getElementById('test-line');
        editor.focus();
        const range = document.createRange();
        range.selectNodeContents(line);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('insertText', false, ' beta');
        const afterType = editor.textContent.trim();
        const undoOk = window.editorApi.undo();
        const afterUndo = editor.textContent.trim();
        const redoOk = window.editorApi.redo();
        const afterRedo = editor.textContent.trim();
        return {
          afterType,
          undoOk,
          afterUndo,
          redoOk,
          afterRedo
        };
      })()
    `);

    record(
      'typing undo restores previous text',
      typingUndoRedo.undoOk && typingUndoRedo.afterUndo === 'alpha',
      JSON.stringify(typingUndoRedo)
    );
    record(
      'typing redo restores typed text',
      typingUndoRedo.redoOk && typingUndoRedo.afterRedo === 'alpha beta',
      JSON.stringify(typingUndoRedo)
    );

    const apiUndoRedo = await win.webContents.executeJavaScript(`
      (() => {
        const editor = document.getElementById('editor');
        editor.innerHTML = '<p><br></p>';
        editor.focus();
        window.editorApi.insertHtml('<p>one</p>');
        const afterInsert = editor.textContent.trim();
        const undoOk = window.editorApi.undo();
        const afterUndo = editor.textContent.trim();
        const redoOk = window.editorApi.redo();
        const afterRedo = editor.textContent.trim();
        return { afterInsert, undoOk, afterUndo, redoOk, afterRedo };
      })()
    `);

    record(
      'insertHtml undo removes inserted block',
      apiUndoRedo.undoOk && apiUndoRedo.afterUndo === '',
      JSON.stringify(apiUndoRedo)
    );
    record(
      'insertHtml redo restores inserted block',
      apiUndoRedo.redoOk && apiUndoRedo.afterRedo === 'one',
      JSON.stringify(apiUndoRedo)
    );

    const shortcutUndo = await win.webContents.executeJavaScript(`
      (() => {
        const editor = document.getElementById('editor');
        editor.innerHTML = '<p>base</p>';
        editor.focus();
        document.execCommand('insertText', false, ' extra');
        const event = new KeyboardEvent('keydown', {
          key: 'z',
          ctrlKey: true,
          bubbles: true,
          cancelable: true
        });
        editor.dispatchEvent(event);
        return {
          defaultPrevented: event.defaultPrevented,
          text: editor.textContent.trim()
        };
      })()
    `);

    record(
      'Ctrl+Z shortcut triggers undo',
      shortcutUndo.defaultPrevented && shortcutUndo.text === 'base',
      JSON.stringify(shortcutUndo)
    );

    const shortcutRedo = await win.webContents.executeJavaScript(`
      (() => {
        const editor = document.getElementById('editor');
        function placeCaretEnd() {
          editor.focus();
          const p = editor.querySelector('p');
          const range = document.createRange();
          range.selectNodeContents(p);
          range.collapse(false);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
        editor.innerHTML = '<p>base</p>';
        placeCaretEnd();
        document.execCommand('insertText', false, ' extra');
        placeCaretEnd();
        window.editorApi.undo();
        placeCaretEnd();
        const event = new KeyboardEvent('keydown', {
          key: 'y',
          ctrlKey: true,
          bubbles: true,
          cancelable: true
        });
        editor.dispatchEvent(event);
        return {
          defaultPrevented: event.defaultPrevented,
          text: editor.textContent.trim()
        };
      })()
    `);

    record(
      'Ctrl+Y shortcut triggers redo',
      shortcutRedo.defaultPrevented && shortcutRedo.text === 'base extra',
      JSON.stringify(shortcutRedo)
    );

    const shortcutShiftZ = await win.webContents.executeJavaScript(`
      (() => {
        const editor = document.getElementById('editor');
        function placeCaretEnd() {
          editor.focus();
          const p = editor.querySelector('p');
          const range = document.createRange();
          range.selectNodeContents(p);
          range.collapse(false);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
        editor.innerHTML = '<p>base</p>';
        placeCaretEnd();
        document.execCommand('insertText', false, ' extra');
        window.editorApi.undo();
        placeCaretEnd();
        const event = new KeyboardEvent('keydown', {
          key: 'Z',
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true
        });
        editor.dispatchEvent(event);
        return {
          defaultPrevented: event.defaultPrevented,
          text: editor.textContent.trim()
        };
      })()
    `);

    record(
      'Ctrl+Shift+Z shortcut triggers redo',
      shortcutShiftZ.defaultPrevented && shortcutShiftZ.text === 'base extra',
      JSON.stringify(shortcutShiftZ)
    );
  } finally {
    win.destroy();
  }

  return results;
}

app.whenReady().then(async () => {
  try {
    const results = await runChecks();
    let failed = 0;
    for (const result of results) {
      const status = result.passed ? 'PASS' : 'FAIL';
      if (!result.passed) {
        failed += 1;
      }
      console.log(`${status} ${result.name}${result.detail ? ` :: ${result.detail}` : ''}`);
    }
    app.exit(failed === 0 ? 0 : 1);
  } catch (error) {
    console.error('VERIFY_ERROR', error);
    app.exit(1);
  }
});
