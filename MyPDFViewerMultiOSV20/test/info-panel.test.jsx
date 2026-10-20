import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { setLanguage } from '../src/i18n.js';
import InfoPanel from '../src/components/InfoPanel.jsx';

describe('InfoPanel', () => {
  it('collapses to a strip that still shows its icon and title, and expands on a click', async () => {
    await setLanguage('en');
    const onOpen = vi.fn();
    const { container } = render(<InfoPanel open={false} width={260} onOpen={onOpen} />);
    const strip = container.querySelector('.info-panel.collapsed .info-strip');
    expect(strip).toBeTruthy();
    expect(strip.querySelectorAll('svg').length).toBe(2);
    expect(strip.textContent).toContain('Document info');
    expect(container.querySelector('.info-body')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Expand the document info panel' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('shows document fields, with icon and title in its head, and can be collapsed', async () => {
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
    const head = document.querySelector('.info-panel .side-head');
    expect(head.querySelector('.side-head-icon')).toBeTruthy();
    expect(head.querySelector('.side-head-title').textContent).toBe('Document info');
    fireEvent.click(screen.getByRole('button', { name: 'Collapse the document info panel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
