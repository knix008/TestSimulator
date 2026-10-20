import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { setLanguage } from '../src/i18n.js';
import InfoPanel from '../src/components/InfoPanel.jsx';

describe('InfoPanel', () => {
  it('renders nothing when closed', async () => {
    await setLanguage('en');
    const { container } = render(<InfoPanel open={false} width={260} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows document fields and can be closed', async () => {
    await setLanguage('en');
    const onClose = vi.fn();
    render(
      <InfoPanel
        open
        width={260}
        onClose={onClose}
        file={{ name: 'report.pdf', path: '/docs/report.pdf', size: 2048 }}
        numPages={12}
        pageNumber={3}
        scale={1}
        zoomMode='actual'
        layout='single'
        rotation={90}
        info={{ title: 'Annual', author: 'Ada', encrypted: false }}
        bookmarkCount={2}
        commentCount={4}
        attachmentCount={1}
        outlineCount={7}
      />,
    );
    expect(screen.getByLabelText('Document info')).toBeTruthy();
    expect(screen.getByText('report.pdf')).toBeTruthy();
    expect(screen.getByText('Annual')).toBeTruthy();
    expect(screen.getByText('Ada')).toBeTruthy();
    expect(screen.getByText('3 / 12')).toBeTruthy();
    expect(screen.getByText('100%')).toBeTruthy();
    expect(screen.getByText('Single page')).toBeTruthy();
    expect(screen.getByText('90°')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
