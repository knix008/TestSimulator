import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { setLanguage } from '../src/i18n.js';
import PrintDialog from '../src/components/PrintDialog.jsx';
import { DEFAULT_SETTINGS } from '../src/lib/settings.js';

beforeAll(() => {
  if (typeof HTMLCanvasElement !== 'undefined') {
    HTMLCanvasElement.prototype.getContext = () => ({});
  }
});

function mockDoc() {
  return {
    getPage: vi.fn(async () => ({
      rotate: 0,
      getViewport: ({ scale = 1 } = {}) => ({ width: 80 * scale, height: 110 * scale, scale }),
      render: () => ({ promise: Promise.resolve() }),
      cleanup: vi.fn(),
    })),
  };
}

async function renderPrint(overrides = {}) {
  await setLanguage('en');
  const onPrint = vi.fn();
  const onChange = vi.fn();
  render(
    <PrintDialog
      open
      doc={mockDoc()}
      numPages={12}
      pageNumber={3}
      settings={{ ...DEFAULT_SETTINGS, printScope: 'all' }}
      onChange={onChange}
      onPrint={onPrint}
      onClose={() => {}}
      busy={false}
      {...overrides}
    />,
  );
  return { onPrint, onChange };
}

describe('PrintDialog', () => {
  it('shows how many pages the all-pages scope will print', async () => {
    await renderPrint();
    expect(screen.getByText('Print 12 page(s)')).toBeTruthy();
  });

  it('prints only the current page', async () => {
    const { onPrint } = await renderPrint();
    fireEvent.click(screen.getByRole('radio', { name: /Current page/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(onPrint).toHaveBeenCalledWith({ pages: [3], scope: 'current' });
  });

  it('disables Print for an invalid custom range', async () => {
    const { onPrint } = await renderPrint();
    fireEvent.click(screen.getByRole('radio', { name: /Custom range/i }));
    const input = screen.getByPlaceholderText(/1-5/);
    fireEvent.change(input, { target: { value: '99' } });
    expect(screen.getByText(/only has 12 pages/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(onPrint).not.toHaveBeenCalled();
  });

  it('accepts a custom range like 1-3, 8', async () => {
    const { onPrint } = await renderPrint();
    fireEvent.click(screen.getByRole('radio', { name: /Custom range/i }));
    fireEvent.change(screen.getByPlaceholderText(/1-5/), { target: { value: '1-3, 8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(onPrint).toHaveBeenCalledWith({ pages: [1, 2, 3, 8], scope: 'custom' });
  });

  it('shows a preview of the first selected page and steps through the range', async () => {
    await renderPrint();
    expect(screen.getByLabelText('Preview')).toBeTruthy();
    expect(screen.getByText('Page 1 · 1 / 12')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next Page' }));
    await waitFor(() => {
      expect(screen.getByText('Page 2 · 2 / 12')).toBeTruthy();
    });
  });

  it('previews the current page when that scope is chosen', async () => {
    await renderPrint();
    fireEvent.click(screen.getByRole('radio', { name: /Current page/i }));
    await waitFor(() => {
      expect(screen.getByText('Page 3 · 1 / 1')).toBeTruthy();
    });
  });

  it('shows an empty preview when the custom range is blank', async () => {
    await renderPrint();
    fireEvent.click(screen.getByRole('radio', { name: /Custom range/i }));
    fireEvent.change(screen.getByPlaceholderText(/1-5/), { target: { value: '' } });
    expect(screen.getByText('Nothing to preview.')).toBeTruthy();
  });
});
