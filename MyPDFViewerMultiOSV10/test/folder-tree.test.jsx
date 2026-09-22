import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import '../src/i18n.js';
import { setLanguage } from '../src/i18n.js';
import FolderTree from '../src/components/FolderTree.jsx';

describe('FolderTree', () => {
  it('does not announce that a nested folder has no PDFs', async () => {
    await setLanguage('en');
    const loadFolder = vi.fn(async (dir) => {
      if (dir === '/docs') return [{ name: 'empty', path: '/docs/empty', kind: 'dir' }];
      return [];
    });
    const { getByText, queryByText } = render(
      <FolderTree root="/docs" desktop currentPath="" loadFolder={loadFolder} />,
    );
    await waitFor(() => expect(getByText('empty')).toBeTruthy());
    fireEvent.click(getByText('empty'));
    await waitFor(() => expect(loadFolder).toHaveBeenCalledWith('/docs/empty'));
    expect(queryByText(/No subfolders or PDF/i)).toBeNull();
    expect(queryByText(/없습니다/)).toBeNull();
  });

  it('lists a PDF that lives inside a folder', async () => {
    await setLanguage('en');
    const onOpenFile = vi.fn();
    const loadFolder = vi.fn(async (dir) => {
      if (dir === '/docs') return [{ name: 'invoices', path: '/docs/invoices', kind: 'dir' }];
      if (dir === '/docs/invoices') {
        return [{ name: 'jan.pdf', path: '/docs/invoices/jan.pdf', kind: 'pdf', size: 8 }];
      }
      return [];
    });
    const { getByText, getByTitle } = render(
      <FolderTree root="/docs" desktop currentPath="" loadFolder={loadFolder} onOpenFile={onOpenFile} />,
    );
    await waitFor(() => expect(getByText('jan.pdf')).toBeTruthy());
    fireEvent.click(getByTitle('/docs/invoices/jan.pdf'));
    expect(onOpenFile).toHaveBeenCalledWith('/docs/invoices/jan.pdf');
  });
});
