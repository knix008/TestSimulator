// A big ZIP takes a while to extract: the progress window shows bytes and
// files, and Cancel stops the extraction. Reading the pictures afterwards is
// counted in pictures, and a ZIP's cover is read without extracting it.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../src/i18n.js';
import { setLanguage } from '../src/i18n.js';
import { ProgressDialog } from '../src/components/Dialogs.jsx';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('the progress window', () => {
  it('shows the bytes unpacked and the files written of an archive', async () => {
    await setLanguage('en');
    const { getByText } = render(
      <ProgressDialog task={{ kind: 'unzipping', name: 'comic.zip', done: 512, total: 2048, files: 3, filesTotal: 12 }} />,
    );
    expect(getByText('Unpacking the archive')).toBeTruthy();
    expect(getByText('25%')).toBeTruthy();
    expect(getByText('Files 3 / 12')).toBeTruthy();
  });

  it('counts pictures, not bytes, while reading them', async () => {
    await setLanguage('ko');
    const { getByText, queryByText } = render(
      <ProgressDialog task={{ kind: 'opening', name: 'comic', done: 30, total: 120, unit: 'count' }} />,
    );
    expect(getByText('30 / 120장')).toBeTruthy();
    expect(queryByText(/B \//)).toBeNull();
  });

  it('has a Cancel button that turns into "Cancelling…" once pressed', async () => {
    await setLanguage('en');
    const onCancel = vi.fn();
    const { getByText, rerender } = render(
      <ProgressDialog task={{ kind: 'unzipping', name: 'a.zip', done: 1, total: 9 }} onCancel={onCancel} />,
    );
    fireEvent.click(getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
    rerender(<ProgressDialog task={{ kind: 'unzipping', name: 'a.zip', done: 1, total: 9, cancelling: true }} onCancel={onCancel} />);
    expect(getByText('Cancelling…').closest('button').disabled).toBe(true);
  });
});

describe('extracting through the desktop host', () => {
  let platform;
  const progressListeners = [];
  const api = {
    isDesktop: true,
    onProgress: (cb) => { progressListeners.push(cb); return () => {}; },
    extractZip: vi.fn(),
    cancelTask: vi.fn(async () => true),
    zipNames: vi.fn(async () => ['ch2/001.jpg', 'notes.txt', 'ch1/010.jpg', 'ch1/002.jpg']),
    zipRead: vi.fn(async () => new Uint8Array([1, 2, 3])),
  };

  beforeAll(async () => {
    window.desktopAPI = api;
    vi.resetModules();
    platform = await import('../src/lib/platform.js');
  });
  afterAll(() => { delete window.desktopAPI; vi.resetModules(); });

  it('passes the host progress on, with the file counts', async () => {
    api.extractZip.mockImplementation(async (p, id) => {
      for (const cb of progressListeners) cb({ id, done: 10, total: 20, files: 1, filesTotal: 2 });
      return 'C:\\tmp\\comic-1';
    });
    const seen = [];
    const dir = await platform.extractZip('C:\\b\\comic.zip', { onProgress: (p) => seen.push(p) });
    expect(dir).toBe('C:\\tmp\\comic-1');
    expect(api.extractZip).toHaveBeenCalledWith('C:\\b\\comic.zip', expect.stringMatching(/^t\d+$/));
    expect(seen).toEqual([{ done: 10, total: 20, files: 1, filesTotal: 2 }]);
  });

  it('asks the host to stop when the reader cancels, and ends as cancelled', async () => {
    let fail;
    api.extractZip.mockImplementation(() => new Promise((_, reject) => { fail = reject; }));
    const controller = new AbortController();
    const running = platform.extractZip('C:\\b\\big.zip', { signal: controller.signal });
    controller.abort();
    const id = api.extractZip.mock.calls.at(-1)[1];
    expect(api.cancelTask).toHaveBeenCalledWith(id);
    fail('Cancelled');
    const err = await running.catch((e) => e);
    expect(platform.isCancelled(err)).toBe(true);
    expect(platform.isCancelled(new Error('disk full'))).toBe(false);
  });

  it('reads a ZIP cover — its first picture — without extracting', async () => {
    api.extractZip.mockClear();
    const cover = await platform.pictureBookCover('C:\\b\\comic.zip', 'zip');
    expect(cover).toEqual({ name: 'ch1/002.jpg', bytes: new Uint8Array([1, 2, 3]) });
    expect(api.zipRead).toHaveBeenCalledWith('C:\\b\\comic.zip', 'ch1/002.jpg');
    expect(api.extractZip).not.toHaveBeenCalled();
  });
});

describe('the host commands', () => {
  it('are registered and called by the bridge', () => {
    const lib = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'lib.rs'), 'utf8');
    const bridge = fs.readFileSync(path.join(root, 'src', 'lib', 'desktop-bridge.js'), 'utf8');
    for (const cmd of ['task_cancel', 'fs_zip_names', 'fs_zip_read']) {
      expect(bridge).toContain(`'${cmd}'`);
      expect(lib).toMatch(new RegExp(`^      ${cmd},$`, 'm'));
    }
    expect(lib).toContain('"files": s.files, "filesTotal": s.total_files');
  });
});
