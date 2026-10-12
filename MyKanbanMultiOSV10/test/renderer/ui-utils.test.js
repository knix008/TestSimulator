const assert = require('node:assert/strict');
const { describe, it } = require('../lib/framework');
const { createBrowser } = require('../lib/browser');

function load(fetchHandler) {
  return createBrowser({ scripts: ['lang.js', 'api.js'], lang: 'en', fetch: fetchHandler });
}

describe('UI utilities, API client and dialogs', () => {
  it('escapes HTML and attribute values', () => {
    const b = load();
    assert.equal(b.eval('escHtml')('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
    assert.equal(b.eval('escAttr')(`it's "ok" & fine`), 'it&#39;s &quot;ok&quot; &amp; fine');
    assert.equal(b.eval('escHtml')(''), '');
    assert.equal(b.eval('escAttr')(null), '');
  });

  it('formats file sizes in B, KB and MB', () => {
    const fileSize = load().eval('fileSize');
    assert.equal(fileSize(0), '');
    assert.equal(fileSize(512), '512B');
    assert.equal(fileSize(2048), '2.0KB');
    assert.equal(fileSize(5 * 1024 * 1024), '5.0MB');
  });

  it('classifies due dates as overdue, soon or ok', () => {
    const dueDateClass = load().eval('dueDateClass');
    const day = (offset) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T12:00:00`;
    };
    assert.equal(dueDateClass(''), '');
    assert.equal(dueDateClass(day(-2)), 'overdue');
    assert.equal(dueDateClass(day(0)), 'soon');
    assert.equal(dueDateClass(day(3)), 'soon');
    assert.equal(dueDateClass(day(10)), 'ok');
  });

  it('formats dates according to the UI language', () => {
    const b = load();
    assert.equal(b.eval('formatDate')(''), '');
    assert.match(b.eval('formatDate')('2026-03-05T12:00:00'), /Mar\s+5/);
  });

  it('renders theme-aware SVG icons', () => {
    const icon = load().eval('icon');
    for (const name of ['user', 'users', 'userCog', 'chart', 'export']) {
      const svg = icon(name, 'menubar');
      assert.match(svg, /^<svg class="ui-icon ui-icon-menubar"/, `icon "${name}"`);
      assert.match(svg, /stroke="currentColor"/);
    }
    assert.match(icon('user'), /class="ui-icon"/);
    assert.equal(icon('does-not-exist'), '');
  });

  it('API client returns JSON for successful requests', async () => {
    const b = load((url) => ({ status: 200, body: { url } }));
    const data = await b.eval('API').get('/boards');
    assert.equal(data.url, '/api/boards');
    assert.equal(b.fetchCalls[0].method, 'GET');
  });

  it('API client sends JSON bodies for POST / PUT / PATCH', async () => {
    const b = load(() => ({ status: 200, body: {} }));
    const API = b.eval('API');
    await API.post('/a', { x: 1 });
    await API.put('/b', { y: 2 });
    await API.patch('/c', { z: 3 });
    await API.delete('/d');
    assert.deepEqual(b.fetchCalls.map((c) => [c.method, c.url, c.body]), [
      ['POST', '/api/a', { x: 1 }],
      ['PUT', '/api/b', { y: 2 }],
      ['PATCH', '/api/c', { z: 3 }],
      ['DELETE', '/api/d', undefined],
    ]);
  });

  it('API client throws the server message for 4xx errors', async () => {
    const b = load(() => ({ status: 403, body: { error: 'Forbidden here' } }));
    await assert.rejects(() => b.eval('API').get('/x'), /Forbidden here/);
    assert.ok(b.elements['modal-overlay'].classList.contains('hidden'), 'no dialog for client errors');
  });

  it('API client opens a copyable error dialog for 5xx errors', async () => {
    const b = load(() => ({ status: 500, body: { error: 'Database exploded' } }));
    await assert.rejects(() => b.eval('API').get('/x'), /Database exploded/);
    const html = b.elements['modal-box'].innerHTML;
    assert.ok(!b.elements['modal-overlay'].classList.contains('hidden'));
    assert.match(html, /modal-error/);
    assert.match(html, /id="err-detail-text"/);
    assert.match(html, /Database exploded/);
  });

  it('builds error dialog text from title and details', () => {
    const build = load().eval('buildErrorDialogText');
    assert.equal(build('Save failed', 'Disk full'), 'Save failed\n\nDisk full');
  });

  it('shows toast notifications', () => {
    const b = load();
    b.eval('showToast')('Saved!', 'success', 10);
    assert.deepEqual(b.toasts(), [{ type: 'success', text: 'Saved!' }]);
  });

  it('renders modal dialogs with escaped titles and closes them', async () => {
    const b = load();
    const Modal = b.eval('Modal');
    Modal.dialog({ title: '<Edit>', body: '<p>Body</p>', footer: 'F', size: 'lg' });
    const html = b.elements['modal-box'].innerHTML;
    assert.match(html, /modal-lg/);
    assert.match(html, /&lt;Edit&gt;/);
    assert.match(html, /<p>Body<\/p>/);
    assert.ok(!b.elements['modal-overlay'].classList.contains('hidden'));
    await Modal.close();
    assert.ok(b.elements['modal-overlay'].classList.contains('hidden'));
    assert.equal(b.elements['modal-box'].innerHTML, '');
  });

  it('keeps a modal open when the before-close hook returns false', async () => {
    const b = load();
    const Modal = b.eval('Modal');
    Modal.dialog({ title: 'Card' });
    Modal.setBeforeClose(async () => false);
    await Modal.close();
    assert.ok(!b.elements['modal-overlay'].classList.contains('hidden'));
    Modal.forceClose();
    assert.ok(b.elements['modal-overlay'].classList.contains('hidden'));
  });

  it('resolves confirm dialogs with the chosen answer', async () => {
    const b = load();
    const Modal = b.eval('Modal');
    const yes = Modal.confirm({ message: 'Delete?' });
    assert.match(b.elements['modal-box'].innerHTML, /modal-confirm/);
    Modal.resolveConfirm(true);
    assert.equal(await yes, true);

    const no = Modal.confirm({ message: 'Delete?' });
    Modal.resolveConfirm(false);
    assert.equal(await no, false);
  });

  it('closes dialogs with the Escape key', () => {
    const b = load();
    b.eval('Modal').dialog({ title: 'Esc' });
    b.document.dispatch('keydown', { key: 'Escape' });
    return new Promise((resolve) => setTimeout(() => {
      assert.ok(b.elements['modal-overlay'].classList.contains('hidden'));
      resolve();
    }, 0));
  });

  it('renders buttons with variant, icon and escaped label', () => {
    const btn = load().eval('Modal').btn({ label: 'A&B', icon: '✓', variant: 'danger', extraClass: 'btn-sm', onclick: 'go()' });
    assert.match(btn, /class="btn btn-danger btn-sm"/);
    assert.match(btn, /onclick="go\(\)"/);
    assert.match(btn, /A&amp;B/);
    assert.match(btn, /btn-icon-label/);
  });
});
