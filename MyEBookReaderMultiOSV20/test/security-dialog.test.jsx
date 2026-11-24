// The password dialog (File ▸ Password…) for each kind of book, the menu entry
// that opens it, and the password prompt keeping input exactly as typed.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '../src/i18n.js';
import { setLanguage } from '../src/i18n.js';
import { SecurityDialog, PromptDialog } from '../src/components/Dialogs.jsx';
import { HomeFileButtons } from '../src/components/Toolbar.jsx';
import { DEFAULT_SETTINGS } from '../src/lib/settings.js';

beforeEach(async () => { await setLanguage('en'); });

const radios = () => [...document.querySelectorAll('input[name="file-security"]')];
const radioLabels = () => radios().map((r) => r.closest('label').querySelector('.security-option-label').textContent);
const fill = (container, pw, confirm = pw) => {
  const [a, b] = container.querySelectorAll('input[type="password"]');
  fireEvent.change(a, { target: { value: pw } });
  fireEvent.change(b, { target: { value: confirm } });
};

describe('SecurityDialog for a PDF', () => {
  it('offers keep / remove / change for an encrypted PDF, starting on keep', () => {
    render(<SecurityDialog open kind="pdf" encrypted protection={{ mode: 'keep' }} onApply={() => {}} onClose={() => {}} />);
    expect(screen.getByText('PDF Password')).toBeTruthy();
    expect(screen.getByText('This PDF is password protected.')).toBeTruthy();
    expect(radioLabels()).toEqual(['Keep the current password', 'Remove the password', 'Change to a new password']);
    expect(radios()[0].checked).toBe(true);
    expect(screen.getByText('Apply')).toBeTruthy();
  });

  it('offers no-password / protect for a plain PDF', () => {
    render(<SecurityDialog open kind="pdf" encrypted={false} protection={{ mode: 'keep' }} onApply={() => {}} onClose={() => {}} />);
    expect(radioLabels()).toEqual(['Save without a password', 'Protect with a password']);
  });

  it('remove applies mode "none"', () => {
    const onApply = vi.fn();
    render(<SecurityDialog open kind="pdf" encrypted protection={{ mode: 'keep' }} onApply={onApply} onClose={() => {}} />);
    fireEvent.click(radios()[1]);
    fireEvent.click(screen.getByText('Apply'));
    expect(onApply).toHaveBeenCalledWith({ mode: 'none' });
  });

  it('protect needs a password, typed the same twice; no ZIP choice for a PDF', () => {
    const onApply = vi.fn();
    const { container } = render(<SecurityDialog open kind="pdf" encrypted={false} protection={{ mode: 'keep' }} onApply={onApply} onClose={() => {}} />);
    fireEvent.click(radios()[1]);
    expect(container.querySelector('input[name="zip-encryption"]')).toBe(null);
    fireEvent.click(screen.getByText('Apply'));
    expect(screen.getByRole('alert').textContent).toBe('Enter a password.');
    fill(container, 'secret 1', 'secret 2');
    fireEvent.click(screen.getByText('Apply'));
    expect(screen.getByRole('alert').textContent).toBe('The two passwords do not match.');
    expect(onApply).not.toHaveBeenCalled();
    fill(container, 'secret 1');
    fireEvent.click(screen.getByText('Apply'));
    expect(onApply).toHaveBeenCalledWith({ mode: 'set', password: 'secret 1' });
  });

  it('reopens on the choice already made', () => {
    const { container } = render(
      <SecurityDialog open kind="pdf" encrypted protection={{ mode: 'set', password: 'abc' }} onApply={() => {}} onClose={() => {}} />,
    );
    expect(radios()[2].checked).toBe(true);
    expect([...container.querySelectorAll('input[type="password"]')].map((i) => i.value)).toEqual(['abc', 'abc']);
  });

  it('Cancel closes without applying', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(<SecurityDialog open kind="pdf" encrypted protection={{ mode: 'keep' }} onApply={onApply} onClose={onClose} />);
    fireEvent.click(screen.getAllByText('Cancel').find((el) => el.tagName === 'BUTTON'));
    expect(onClose).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });
});

describe('SecurityDialog for other books', () => {
  it('an encrypted EPUB / CBZ: remove the password, saved right away', () => {
    const onApply = vi.fn();
    render(<SecurityDialog open kind="archive" encrypted onApply={onApply} onClose={() => {}} />);
    expect(screen.getByText('File Password')).toBeTruthy();
    expect(screen.getByText('This file (a ZIP container) is password protected.')).toBeTruthy();
    expect(radioLabels()).toEqual(['Keep the current password', 'Remove the password', 'Change to a new password']);
    fireEvent.click(radios()[1]);
    fireEvent.click(screen.getByText('Save…'));
    expect(onApply).toHaveBeenCalledWith({ mode: 'none' });
  });

  it('a plain archive: protect with AES-256 by default, or ZipCrypto', () => {
    const onApply = vi.fn();
    const { container } = render(<SecurityDialog open kind="archive" encrypted={false} onApply={onApply} onClose={() => {}} />);
    fireEvent.click(radios()[1]);
    const enc = [...container.querySelectorAll('input[name="zip-encryption"]')];
    expect(enc.map((r) => r.value)).toEqual(['aes256', 'zipcrypto']);
    expect(enc[0].checked).toBe(true);
    fill(container, 'pw');
    fireEvent.click(screen.getByText('Save…'));
    expect(onApply).toHaveBeenLastCalledWith({ mode: 'set', password: 'pw', encryption: 'aes256' });
    fireEvent.click(enc[1]);
    fireEvent.click(screen.getByText('Save…'));
    expect(onApply).toHaveBeenLastCalledWith({ mode: 'set', password: 'pw', encryption: 'zipcrypto' });
  });

  it('a format without passwords says it goes into a protected ZIP', () => {
    render(<SecurityDialog open kind="file" encrypted={false} zipName="novel.txt.zip" onApply={() => {}} onClose={() => {}} />);
    expect(screen.getByText(/password-protected ZIP file \(novel\.txt\.zip\)/)).toBeTruthy();
    expect(radioLabels()).toEqual(['Save without a password', 'Protect with a password']);
  });

  it('is in Korean too', async () => {
    await setLanguage('ko');
    render(<SecurityDialog open kind="archive" encrypted onApply={() => {}} onClose={() => {}} />);
    expect(radioLabels()).toEqual(['지금 암호 그대로 저장', '암호를 풀어서 저장', '새 암호로 바꿔 저장']);
    expect(screen.getByText('저장…')).toBeTruthy();
  });
});

describe('File menu', () => {
  it('has a "Password…" entry that calls onSecurity', () => {
    const onSecurity = vi.fn();
    const noop = () => {};
    const { container } = render(
      <HomeFileButtons
        settings={DEFAULT_SETTINGS}
        doc={{ numPages: 1 }}
        onHome={noop}
        onOpen={noop} onOpenUrl={noop} onSave={noop} onSaveAs={noop}
        onSecurity={onSecurity}
        onExportText={noop} onPrint={noop}
        onOpenRecent={noop} onRemoveRecent={noop} onClearRecent={noop}
        isFavoritePath={() => false}
      />,
    );
    fireEvent.click(container.querySelector('button[aria-label="File"]'));
    fireEvent.click(screen.getByText('Password…'));
    expect(onSecurity).toHaveBeenCalled();
  });
});

describe('Password prompt', () => {
  it('submits the password exactly as typed (spaces kept)', () => {
    const onSubmit = vi.fn();
    const { container } = render(<PromptDialog open kind="password" error="" onSubmit={onSubmit} onClose={() => {}} />);
    const input = container.querySelector('input[type="password"]');
    fireEvent.change(input, { target: { value: '  pass word ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('  pass word ');
  });

  it('names the archive it asks for, and shows the "wrong password" message', () => {
    render(<PromptDialog open kind="password" label="Password for comic.cbz" error="That password is not correct." onSubmit={() => {}} onClose={() => {}} />);
    expect(screen.getByText('Password for comic.cbz')).toBeTruthy();
    expect(screen.getByText('That password is not correct.')).toBeTruthy();
  });
});
