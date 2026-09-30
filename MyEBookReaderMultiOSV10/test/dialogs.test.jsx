import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  DialogBody, DialogFrame, dialogIcon, dialogTitle, keepsWindowOpen, FIXED_SIZE_DIALOGS,
} from '../src/components/dialogs.jsx';
import DialogModal from '../src/components/DialogModal.jsx';
import { DEFAULT_SETTINGS } from '../src/lib/settings.js';
import { THEMES, isDarkTheme } from '../src/lib/themes.js';
import { translate } from '../src/i18n.js';

const t = (key, args) => translate('ko', key, args);

function renderBody(name, extra = {}) {
  const onResult = vi.fn();
  const payload = { language: 'ko', theme: 'dark', settings: DEFAULT_SETTINGS, ...extra };
  const view = render(<DialogBody name={name} payload={payload} onResult={onResult} />);
  return { ...view, onResult, payload };
}

describe('dialog metadata', () => {
  it('gives every dialog an icon and a title', () => {
    for (const name of ['settings', 'about', 'error', 'progress', 'unsaved', 'print', 'prompt', 'note', 'properties', 'shortcuts']) {
      expect(typeof dialogIcon(name), name).toBe('function');
      expect(dialogTitle(name, t, { prompt: { kind: 'url' }, progress: { kind: 'saving' } }), name).toBeTruthy();
    }
  });

  it('keeps the window open for a live edit, and closes it for an answer', () => {
    expect(keepsWindowOpen('settings')).toBe(true);
    expect(keepsWindowOpen('preview')).toBe(true);
    expect(keepsWindowOpen('print')).toBe(false);
    expect(keepsWindowOpen('close')).toBe(false);
  });

  it('fixes the size of the dialogs with tabs or a preview', () => {
    expect([...FIXED_SIZE_DIALOGS].sort()).toEqual(['print', 'properties', 'settings', 'shortcuts']);
  });
});

describe('Settings dialog', () => {
  it('shows every settings tab', () => {
    renderBody('settings');
    const tabs = [...document.querySelectorAll('.tabs .tab')].map((tab) => tab.textContent);
    expect(tabs).toEqual(['appearance', 'reading', 'view', 'window'].map((id) => t(`settings.tabs.${id}`)));
  });

  it('keeps every tab in the layout so the window never resizes', () => {
    renderBody('settings');
    expect(document.querySelectorAll('.settings-panel')).toHaveLength(4);
    expect(document.querySelectorAll('.settings-panel.on')).toHaveLength(1);
  });

  it('switches tab without closing', () => {
    renderBody('settings');
    fireEvent.click(screen.getByText(t('settings.tabs.reading')));
    const panel = document.querySelector('.settings-panel.on');
    expect(panel.textContent).toContain(t('reading.font'));
    const size = [...panel.querySelectorAll('.field.inline .field-label')].map((el) => el.textContent);
    expect(size).toContain(t('reading.size'));
  });

  it('offers every theme, and reports the chosen one', () => {
    const { onResult } = renderBody('settings');
    expect(document.querySelectorAll('.theme-chip').length).toBeGreaterThanOrEqual(20);
    fireEvent.click(screen.getByTitle('sepia'));
    expect(onResult).toHaveBeenCalledWith({ action: 'settings', settings: expect.objectContaining({ theme: 'sepia' }) });
  });

  it('sorts the themes into a dark and a light family', () => {
    renderBody('settings');
    const families = [...document.querySelectorAll('.theme-family')];
    expect(families).toHaveLength(2);

    const names = families.map((f) => f.querySelector('.theme-family-name').textContent);
    expect(names[0]).toContain(t('settings.themeFamily.dark'));
    expect(names[1]).toContain(t('settings.themeFamily.light'));

    // Each chip sits under the heading that matches it, and none goes missing.
    let seen = 0;
    families.forEach((family, i) => {
      const chips = [...family.querySelectorAll('.theme-chip')];
      expect(chips.length).toBeGreaterThan(0);
      seen += chips.length;
      for (const chip of chips) expect(isDarkTheme(chip.title)).toBe(i === 0);
      expect(family.querySelector('.theme-family-count').textContent).toBe(String(chips.length));
    });
    expect(seen).toBe(THEMES.length);
  });

  it('offers both languages', () => {
    const { onResult } = renderBody('settings');
    fireEvent.click(screen.getByTitle('English'));
    expect(onResult).toHaveBeenCalledWith({ action: 'settings', settings: expect.objectContaining({ lang: 'en' }) });
  });

  it('changes the UI font size with the stepper', () => {
    const { onResult } = renderBody('settings');
    const larger = screen.getByTitle(t('settings.fontLarger'));
    expect(larger.closest('.field').classList.contains('inline')).toBe(true);
    fireEvent.click(larger);
    expect(onResult).toHaveBeenCalledWith({ action: 'settings', settings: expect.objectContaining({ fontSize: 15 }) });
  });

  it('changes the UI font style', () => {
    const { onResult } = renderBody('settings');
    fireEvent.click(screen.getByTitle(t('settings.bold')));
    expect(onResult).toHaveBeenCalledWith({ action: 'settings', settings: expect.objectContaining({ fontWeight: 'bold' }) });
  });

  it('changes the reading layout', () => {
    const { onResult } = renderBody('settings');
    fireEvent.click(screen.getByText(t('settings.tabs.reading')));
    fireEvent.click(screen.getByTitle(t('cmd.viewSingle')));
    expect(onResult).toHaveBeenCalledWith({ action: 'settings', settings: expect.objectContaining({
      viewLayout: 'single', pageMode: 'paged', pageFlow: 'paged', spread: 'single',
    }) });
  });

  it('asks for a background image and can clear it', () => {
    const { onResult } = renderBody('settings', { settings: { ...DEFAULT_SETTINGS, backgroundImage: 'data:image/png;base64,AA' } });
    fireEvent.click(document.querySelectorAll('.tabs .tab')[2]);
    fireEvent.click(screen.getByTitle(t('settings.backgroundPick')));
    expect(onResult).toHaveBeenCalledWith({ action: 'pickBackground' });
    fireEvent.click(screen.getByTitle(t('settings.backgroundClear')));
    expect(onResult).toHaveBeenCalledWith({ action: 'clearBackground' });
    expect(document.querySelector('.bg-preview')).toBeTruthy();
  });

  it('shows where the settings are stored', () => {
    renderBody('settings', { storagePath: 'C:\\Users\\me\\AppData' });
    fireEvent.click(document.querySelectorAll('.tabs .tab')[3]);
    expect(screen.getByText('C:\\Users\\me\\AppData')).toBeTruthy();
  });

  it('resets everything on request, from the window own buttons', () => {
    const { onResult } = renderBody('settings');
    // The reset is not inside any one tab: it applies to the whole of the
    // settings, so it sits along the foot of the window with "done".
    fireEvent.click(screen.getByTitle(t('settings.resetAllTip')));
    expect(onResult).toHaveBeenCalledWith({ action: 'reset' });
  });

  it('closes when the reader says it is done', () => {
    const { onResult } = renderBody('settings');
    fireEvent.click(screen.getByTitle(t('common.ok')));
    expect(onResult).toHaveBeenCalledWith({ action: 'close' });
  });

  it('offers both buttons whichever tab is showing', () => {
    renderBody('settings');
    for (const tab of [...document.querySelectorAll('.tabs .tab')]) {
      fireEvent.click(tab);
      expect(screen.getByTitle(t('settings.resetAllTip'))).toBeTruthy();
      expect(screen.getByTitle(t('common.ok'))).toBeTruthy();
    }
  });

  it('chooses the page layout and the page-turning effect', () => {
    const { onResult, rerender } = renderBody('settings');
    fireEvent.click(document.querySelectorAll('.tabs .tab')[1]);
    fireEvent.click(screen.getByTitle(t('cmd.viewDouble')));
    const laid = onResult.mock.calls.at(-1)[0];
    expect(laid).toEqual({ action: 'settings', settings: expect.objectContaining({
      viewLayout: 'double', spread: 'double', pageFlow: 'paged',
    }) });
    // A continuous run has no page to turn. Choosing two pages is what makes
    // the effect available, which the window learns when the settings come back.
    rerender(
      <DialogBody
        name="settings"
        payload={{ language: 'ko', theme: 'dark', settings: laid.settings }}
        onResult={onResult}
      />,
    );
    fireEvent.click(document.querySelectorAll('.tabs .tab')[1]);
    fireEvent.click(screen.getByTitle(t('reading.turnFlip')));
    expect(onResult).toHaveBeenLastCalledWith({ action: 'settings', settings: expect.objectContaining({
      pageTurn: 'flip', viewLayout: 'double',
    }) });
  });
});

describe('About dialog', () => {
  const build = { version: '1.0.0', buildTime: '2026-01-01T00:00:00.000Z', gitCommit: 'abc1234', gitBranch: 'main', license: 'MIT' };

  it('shows the build information', () => {
    renderBody('about', { info: { platform: 'win32', arch: 'x64', electron: '31.0.0', chrome: '126', node: '20' }, build });
    expect(screen.getByText('1.0.0')).toBeTruthy();
    expect(screen.getByText('abc1234')).toBeTruthy();
    expect(screen.getByText('main')).toBeTruthy();
    expect(screen.getByText(/Electron 31\.0\.0/)).toBeTruthy();
    expect(screen.getByText('win32 x64')).toBeTruthy();
  });

  it('names the author, and the document type the app owns', () => {
    renderBody('about', { info: {}, build });
    expect(screen.getByText('SHKWON(knix008@naver.com)')).toBeTruthy();
    expect(screen.getByText(/\.ebkr/)).toBeTruthy();
    // The formats are named in the table as well as in the description line.
    expect(screen.getAllByText(/EPUB · PDF · MOBI/).length).toBeGreaterThan(0);
  });

  it('copies the information as text', () => {
    const { onResult } = renderBody('about', { info: {}, build });
    fireEvent.click(screen.getByTitle(t('about.copy')));
    expect(onResult).toHaveBeenCalledWith({ action: 'copyText', text: expect.stringContaining('MyEBookReader') });
    expect(onResult.mock.calls[0][0].text).toContain('SHKWON(knix008@naver.com)');
  });

  it('opens the author’s mail address', () => {
    const { onResult } = renderBody('about', { info: {}, build });
    fireEvent.click(screen.getByText('SHKWON(knix008@naver.com)'));
    expect(onResult).toHaveBeenCalledWith({ action: 'openExternal', url: 'mailto:knix008@naver.com' });
  });
});

describe('Error dialog', () => {
  const error = {
    context: 'open',
    message: '파일을 열 수 없습니다',
    details: 'Error: ENOENT\n  at open()',
    file: 'C:\\books\\gone.epub',
    at: 0,
  };

  it('shows what failed, where and why', () => {
    renderBody('error', { error });
    expect(screen.getByText('파일을 열 수 없습니다')).toBeTruthy();
    expect(screen.getByText('C:\\books\\gone.epub')).toBeTruthy();
    expect(screen.getByText(t('error.ctx.open'))).toBeTruthy();
  });

  it('shows and hides the technical detail', () => {
    renderBody('error', { error });
    fireEvent.click(screen.getByText(t('error.showDetails')));
    expect(document.querySelector('.err-details').textContent).toContain('ENOENT');
    fireEvent.click(screen.getByText(t('error.hideDetails')));
    expect(document.querySelector('.err-details')).toBeNull();
  });

  it('copies the whole report', () => {
    const { onResult } = renderBody('error', { error });
    fireEvent.click(screen.getByTitle(t('error.copy')));
    const { text } = onResult.mock.calls[0][0];
    expect(text).toContain('파일을 열 수 없습니다');
    expect(text).toContain('ENOENT');
    expect(text).toContain('gone.epub');
  });

  it('always keeps the report selectable, for when the clipboard is refused', () => {
    renderBody('error', { error });
    const fallback = document.querySelector('.err-fallback');
    expect(fallback.value).toContain('파일을 열 수 없습니다');
    expect(fallback).toHaveAttribute('readonly');
  });
});

describe('Progress dialog', () => {
  it('shows a percentage when the total is known', () => {
    renderBody('progress', { progress: { kind: 'opening', name: 'book.epub', done: 50, total: 200 } });
    expect(screen.getByText('25%')).toBeTruthy();
    expect(screen.getByText('book.epub')).toBeTruthy();
    expect(document.querySelector('.progbar-fill').style.width).toBe('25%');
  });

  it('runs an indeterminate bar when the total is unknown', () => {
    renderBody('progress', { progress: { kind: 'parsing', name: 'x', done: 10, total: 0 } });
    expect(document.querySelector('.progbar.indeterminate')).toBeTruthy();
  });
});

describe('Unsaved changes dialog', () => {
  it('offers save, discard and cancel', () => {
    const { onResult } = renderBody('unsaved');
    expect(screen.getByText(t('unsaved.message'))).toBeTruthy();
    fireEvent.click(screen.getByText(t('common.save')));
    fireEvent.click(screen.getByText(t('unsaved.discard')));
    fireEvent.click(screen.getByText(t('common.cancel')));
    expect(onResult.mock.calls.map((c) => c[0].action)).toEqual(['save', 'discard', 'cancel']);
  });
});

describe('Prompt dialog', () => {
  it('refuses an address that is not http(s)', () => {
    const { onResult } = renderBody('prompt', { prompt: { kind: 'url', error: '' } });
    fireEvent.change(document.querySelector('input'), { target: { value: 'ftp://x' } });
    fireEvent.click(screen.getByText(t('url.open')));
    expect(onResult).not.toHaveBeenCalled();
    expect(screen.getByText(t('url.invalid'))).toBeTruthy();
  });

  it('accepts a web address', () => {
    const { onResult } = renderBody('prompt', { prompt: { kind: 'url', error: '' } });
    fireEvent.change(document.querySelector('input'), { target: { value: 'https://example.com/b.epub' } });
    fireEvent.keyDown(document.querySelector('input'), { key: 'Enter' });
    expect(onResult).toHaveBeenCalledWith({ action: 'submit', value: 'https://example.com/b.epub', kind: 'url' });
  });

  it('asks for a password as a password field', () => {
    const { onResult } = renderBody('prompt', { prompt: { kind: 'password', error: '틀렸습니다' } });
    expect(document.querySelector('input').type).toBe('password');
    expect(screen.getByText('틀렸습니다')).toBeTruthy();
    fireEvent.change(document.querySelector('input'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByText(t('password.ok')));
    expect(onResult).toHaveBeenCalledWith({ action: 'submit', value: 'secret', kind: 'password' });
  });
});

describe('Note dialog', () => {
  it('quotes the selected passage and saves the note', () => {
    const { onResult } = renderBody('note', { note: { text: '', selection: '선택한 문장' } });
    expect(screen.getByText(/선택한 문장/)).toBeTruthy();
    fireEvent.change(document.querySelector('textarea'), { target: { value: '내 메모' } });
    fireEvent.click(screen.getByText(t('note.ok')));
    expect(onResult).toHaveBeenCalledWith({ action: 'submit', value: '내 메모' });
  });

  it('cannot save an empty note', () => {
    renderBody('note', { note: {} });
    expect(screen.getByText(t('note.ok'))).toBeDisabled();
  });
});

describe('Properties dialog', () => {
  it('lists what is known about the book, one row each', () => {
    renderBody('properties', {
      bookInfo: {
        meta: { title: '샘플 책', author: 'SHKWON', description: '소개' },
        formatLabel: 'EPUB',
        reflowable: true,
        sectionCount: 3,
        fileName: 'sample.epub',
        filePath: 'C:\\books\\sample.epub',
        fileSize: 66779,
        libraryPath: '',
      },
    });
    expect(screen.getByText('샘플 책')).toBeTruthy();
    expect(screen.getByText('65.2 KB')).toBeTruthy();
    expect(screen.getByText('EPUB')).toBeTruthy();
    expect(screen.getByText(t('props.notSaved'))).toBeTruthy();
    expect(screen.getByText('소개')).toBeTruthy();
  });
});

describe('Shortcuts dialog', () => {
  it('lists the keyboard shortcuts', () => {
    renderBody('shortcuts');
    expect(screen.getByText('Ctrl+O')).toBeTruthy();
    expect(screen.getByText('Ctrl+P')).toBeTruthy();
    expect(document.querySelectorAll('.shortcuts tbody tr').length).toBeGreaterThan(10);
  });
});

describe('Print dialog', () => {
  const print = { count: 12, current: 3, scope: 'all', reflowable: true, paper: 'A4', landscape: false, marginMm: 14 };

  it('offers the three ranges with a hint each', () => {
    renderBody('print', { print });
    expect(screen.getByText(t('print.allHint', { n: 12 }))).toBeTruthy();
    expect(screen.getByText(t('print.currentHint', { n: 3 }))).toBeTruthy();
    expect(screen.getByText(t('print.customHint'))).toBeTruthy();
  });

  it('counts what will be printed, and prints it', () => {
    const { onResult } = renderBody('print', { print });
    expect(screen.getByText(t('print.willPrint', { n: 12 }))).toBeTruthy();
    fireEvent.click(screen.getByText(t('print.print')));
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({
      action: 'print', scope: 'all', paper: 'A4', pages: expect.arrayContaining([1, 12]),
    }));
  });

  it('prints only the current chapter when that is chosen', () => {
    const { onResult } = renderBody('print', { print });
    fireEvent.click(screen.getByText(t('print.current')));
    fireEvent.click(screen.getByText(t('print.print')));
    expect(onResult.mock.calls.at(-1)[0].pages).toEqual([3]);
  });

  it('takes a typed range, and refuses a bad one', () => {
    const { onResult } = renderBody('print', { print });
    fireEvent.click(screen.getByText(t('print.custom')));
    const input = screen.getByPlaceholderText(t('print.rangePlaceholder'));
    fireEvent.change(input, { target: { value: '2-4' } });
    fireEvent.click(screen.getByText(t('print.print')));
    expect(onResult.mock.calls.at(-1)[0].pages).toEqual([2, 3, 4]);

    fireEvent.change(input, { target: { value: '99-200' } });
    expect(screen.getByText(t('print.rangeOutside', { max: 12 }))).toBeTruthy();
    expect(screen.getByText(t('print.print'))).toBeDisabled();
  });

  it('offers the page setup: paper, orientation and margin', () => {
    const { onResult } = renderBody('print', { print });
    fireEvent.change(screen.getByDisplayValue('A4'), { target: { value: 'A5' } });
    fireEvent.click(screen.getByText(t('print.landscape')));
    fireEvent.click(screen.getByText(t('print.print')));
    expect(onResult.mock.calls.at(-1)[0]).toMatchObject({ paper: 'A5', landscape: true, marginMm: 14 });
  });

  it('asks the application to render a preview of the page shown', () => {
    const { onResult } = renderBody('print', { print });
    expect(onResult.mock.calls[0][0]).toMatchObject({ action: 'preview', page: 1 });
  });

  it('shows the preview it is given, and walks through the pages', () => {
    const { onResult } = renderBody('print', { print: { ...print, previewHtml: '<p>본문 미리보기</p>' } });
    expect(document.querySelector('.print-preview-page').textContent).toBe('본문 미리보기');
    fireEvent.click(screen.getByTitle(t('cmd.nextSection')));
    expect(onResult.mock.calls.at(-1)[0]).toMatchObject({ action: 'preview', page: 2 });
  });

  it('shows a rendered page image when there is one', () => {
    renderBody('print', { print: { ...print, previewImage: 'data:image/jpeg;base64,AA' } });
    expect(document.querySelector('.print-preview-image')).toBeTruthy();
  });
});

describe('DialogFrame and the web modal', () => {
  it('frames a dialog with its icon, title and close button', () => {
    const onClose = vi.fn();
    render(
      <DialogFrame name="about" payload={{ language: 'ko' }} onClose={onClose}>
        <p>내용</p>
      </DialogFrame>
    );
    expect(screen.getByText(t('about.title'))).toBeTruthy();
    expect(document.querySelector('.dialog-head-icon svg')).toBeTruthy();
    fireEvent.click(screen.getByTitle(t('common.close')));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders the same body inside an in-page modal on the web', () => {
    const onResult = vi.fn();
    render(
      <DialogModal
        name="unsaved"
        payload={{ language: 'ko', theme: 'dark', settings: DEFAULT_SETTINGS }}
        onResult={onResult}
        onClose={vi.fn()}
      />
    );
    expect(document.querySelector('.modal.dialog-unsaved')).toBeTruthy();
    fireEvent.click(screen.getByText(t('common.save')));
    expect(onResult).toHaveBeenCalledWith({ action: 'save' });
  });
});
