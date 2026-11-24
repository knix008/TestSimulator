// The PDF password dialog (how Save protects the file), the File-menu entry
// that opens it, and the password prompt keeping input exactly as typed.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '../src/i18n.js';
import { setLanguage } from '../src/i18n.js';
import { SecurityDialog, PromptDialog } from '../src/components/Dialogs.jsx';
import Toolbar from '../src/components/Toolbar.jsx';
import { DEFAULT_SETTINGS } from '../src/lib/settings.js';

beforeEach(async () => { await setLanguage('en'); });

const radios = () => screen.getAllByRole('radio');
const radioLabels = () => radios().map((r) => r.closest('label').querySelector('.security-option-label').textContent);

describe('SecurityDialog', () => {
  it('for an encrypted PDF offers keep / remove / change, starting on keep', () => {
    render(<SecurityDialog open encrypted protection={{ mode: 'keep' }} onApply={() => {}} onClose={() => {}} />);
    expect(screen.getByText('This PDF is password protected.')).toBeTruthy();
    expect(radioLabels()).toEqual(['Keep the current password', 'Remove the password', 'Change to a new password']);
    expect(radios()[0].checked).toBe(true);
  });

  it('for a plain PDF offers no-password / protect (no "remove")', () => {
    render(<SecurityDialog open encrypted={false} protection={{ mode: 'keep' }} onApply={() => {}} onClose={() => {}} />);
    expect(screen.getByText('This PDF has no password.')).toBeTruthy();
    expect(radioLabels()).toEqual(['Save without a password', 'Protect with a password']);
  });

  it('remove: applies mode "none"', () => {
    const onApply = vi.fn();
    render(<SecurityDialog open encrypted protection={{ mode: 'keep' }} onApply={onApply} onClose={() => {}} />);
    fireEvent.click(radios()[1]);
    fireEvent.click(screen.getByText('Apply'));
    expect(onApply).toHaveBeenCalledWith({ mode: 'none' });
  });

  it('protect: needs a password, both fields equal', () => {
    const onApply = vi.fn();
    const { container } = render(<SecurityDialog open encrypted={false} protection={{ mode: 'keep' }} onApply={onApply} onClose={() => {}} />);
    fireEvent.click(radios()[1]);
    const [pw, confirm] = container.querySelectorAll('input[type="password"]');
    expect(pw && confirm).toBeTruthy();

    fireEvent.click(screen.getByText('Apply'));
    expect(screen.getByRole('alert').textContent).toBe('Enter a password.');

    fireEvent.change(pw, { target: { value: 'secret 1' } });
    fireEvent.change(confirm, { target: { value: 'secret 2' } });
    fireEvent.click(screen.getByText('Apply'));
    expect(screen.getByRole('alert').textContent).toBe('The two passwords do not match.');
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.change(confirm, { target: { value: 'secret 1' } });
    fireEvent.keyDown(confirm, { key: 'Enter' });
    expect(onApply).toHaveBeenCalledWith({ mode: 'set', password: 'secret 1' });
  });

  it('reopens showing the choice already made', () => {
    const { container } = render(
      <SecurityDialog open encrypted protection={{ mode: 'set', password: 'abc' }} onApply={() => {}} onClose={() => {}} />,
    );
    expect(radios()[2].checked).toBe(true);
    const [pw, confirm] = container.querySelectorAll('input[type="password"]');
    expect(pw.value).toBe('abc');
    expect(confirm.value).toBe('abc');
  });

  it('Cancel closes without applying', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(<SecurityDialog open encrypted protection={{ mode: 'keep' }} onApply={onApply} onClose={onClose} />);
    fireEvent.click(screen.getAllByText('Cancel').find((el) => el.tagName === 'BUTTON'));
    expect(onClose).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('is labelled in Korean too', async () => {
    await setLanguage('ko');
    render(<SecurityDialog open encrypted protection={{ mode: 'keep' }} onApply={() => {}} onClose={() => {}} />);
    expect(radioLabels()).toEqual(['지금 암호 그대로 저장', '암호를 풀어서 저장', '새 암호로 바꿔 저장']);
  });
});

describe('File menu', () => {
  it('has a "PDF Password…" entry that calls onSecurity', () => {
    const onSecurity = vi.fn();
    const noop = () => {};
    render(
      <Toolbar
        settings={DEFAULT_SETTINGS}
        doc={{ numPages: 1 }}
        pageNumber={1}
        numPages={1}
        scale={1}
        history={{ canUndo: false, canRedo: false }}
        tool="select"
        onTool={noop}
        panel="none"
        onSecurity={onSecurity}
        onOpen={noop} onOpenUrl={noop} onSave={noop} onSaveAs={noop}
        onTheme={noop} onLang={noop}
        isFavoritePath={() => false}
      />,
    );
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent.includes('File') || b.getAttribute('aria-label') === 'File'));
    fireEvent.click(screen.getByText('PDF Password…'));
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

  it('shows the "wrong password" message it is given', () => {
    render(<PromptDialog open kind="password" error="That password is not correct." onSubmit={() => {}} onClose={() => {}} />);
    expect(screen.getByText('That password is not correct.')).toBeTruthy();
  });
});
