import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { setLanguage } from '../src/i18n.js';
import SettingsDialog from '../src/components/SettingsDialog.jsx';
import { DEFAULT_SETTINGS } from '../src/lib/settings.js';
import { THEME_IDS } from '../src/lib/themes.js';

async function renderSettings(overrides = {}) {
  await setLanguage('en');
  const onChange = vi.fn();
  const onReset = vi.fn();
  const onPickOpenDir = overrides.onPickOpenDir || vi.fn();
  render(
    <SettingsDialog
      open
      settings={{ ...DEFAULT_SETTINGS, ...overrides.settings }}
      onChange={onChange}
      onClose={() => {}}
      onPickOpenDir={onPickOpenDir}
      onClearDirs={() => {}}
      onReset={onReset}
    />,
  );
  return { onChange, onReset, onPickOpenDir };
}

describe('SettingsDialog', () => {
  it('lists every theme and applies the one that is clicked', async () => {
    const { onChange } = await renderSettings();
    for (const id of THEME_IDS) expect(screen.getByTitle(id)).toBeTruthy();
    expect(screen.getAllByText('Dark').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Light').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTitle('nord'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ theme: 'nord' }));
    fireEvent.click(screen.getByTitle('frost'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ theme: 'frost' }));
  });

  it('steps the font size down and up with the side buttons', async () => {
    const { onChange } = await renderSettings({ settings: { fontSize: 14 } });
    fireEvent.click(screen.getByRole('button', { name: 'Smaller font' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ fontSize: 13 }));
    fireEvent.click(screen.getByRole('button', { name: 'Larger font' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ fontSize: 15 }));
  });

  it('switches language', async () => {
    const { onChange } = await renderSettings();
    fireEvent.click(screen.getByTitle('English'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ lang: 'en' }));
  });

  it('opens the viewer tab and toggles continuous layout', async () => {
    const { onChange } = await renderSettings();
    fireEvent.click(screen.getByTitle('Viewer'));
    fireEvent.click(screen.getByText('Single page'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ pageLayout: 'single', zoomMode: 'fit-page' }));
    fireEvent.click(screen.getByText('Two pages'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ pageLayout: 'spread', zoomMode: 'fit-page' }));
    fireEvent.click(screen.getByText('Continuous'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ pageLayout: 'continuous' }));
    fireEvent.click(screen.getByText('Fit Height'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ zoomMode: 'fit-height' }));
    fireEvent.click(screen.getByText('Fit Window'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ zoomMode: 'fit-page' }));
    fireEvent.click(screen.getByTitle('Fade'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ pageEffect: 'fade' }));
    fireEvent.click(screen.getByTitle('Flip'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ pageEffect: 'flip' }));
  });

  it('keeps every tab mounted so switching tabs does not resize the window', async () => {
    await renderSettings();
    expect(document.querySelectorAll('.settings-panel')).toHaveLength(4);
    expect(screen.getByTitle('nord')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Viewer'));
    expect(screen.getByTitle('nord')).toBeTruthy();
    expect(document.querySelector('.settings-panel.on')).toBeTruthy();
    expect(document.querySelectorAll('.settings-panel.on')).toHaveLength(1);
  });

  it('lets the user turn on auto-copy for text, images and regions', async () => {
    const { onChange } = await renderSettings();
    fireEvent.click(screen.getByTitle('Copying'));
    fireEvent.click(screen.getByText('Copy text as soon as it is selected'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ autoCopyText: true }));
    fireEvent.click(screen.getByText('Copy a picture as soon as it is selected'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ autoCopyImage: true }));
    fireEvent.click(screen.getByText('Copy a dragged area as soon as it is selected'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      autoCopyRegion: true,
      captureAction: 'copy',
    }));
  });

  it('lets the user add a custom theme', async () => {
    const { onChange } = await renderSettings();
    fireEvent.click(screen.getByTitle('Add'));
    fireEvent.change(screen.getByDisplayValue('My theme'), { target: { value: 'Lake' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)[0];
    expect(last.customThemes).toHaveLength(1);
    expect(last.customThemes[0].name).toBe('Lake');
    expect(last.customThemes[0].id).toMatch(/^custom-/);
    expect(last.theme).toBe(last.customThemes[0].id);
  });

  it('applies and deletes a saved custom theme', async () => {
    const custom = {
      id: 'custom-lake',
      name: 'Lake',
      kind: 'dark',
      colors: { bg: '#102030', panel: '#1a3040', text: '#e8f0f8', accent: '#3aa0d8' },
    };
    const { onChange } = await renderSettings({
      settings: { theme: 'dark', customThemes: [custom] },
    });
    fireEvent.click(screen.getByTitle('Lake'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ theme: 'custom-lake' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      customThemes: [],
      theme: 'dark',
    }));
  });

  it('does not list recent files on the Files tab', async () => {
    await renderSettings({
      settings: {
        recentFiles: [{ path: 'C:/docs/a.pdf', name: 'a.pdf', dir: 'C:/docs' }],
        recentDirs: ['C:/docs'],
      },
    });
    fireEvent.click(screen.getByTitle('Files'));
    expect(screen.queryByText('Recent Files')).toBeNull();
    expect(screen.queryByText('Clear recent files')).toBeNull();
    expect(screen.queryByText('a.pdf')).toBeNull();
    expect(screen.getByText('Recent folders')).toBeTruthy();
    expect(screen.getByText('C:/docs')).toBeTruthy();
  });

  it('lets the user set and clear the default Open folder', async () => {
    const onPickOpenDir = vi.fn().mockResolvedValue('D:/Pdf');
    const { onChange } = await renderSettings({
      settings: { defaultOpenDir: 'C:/Old' },
      onPickOpenDir,
    });
    fireEvent.click(screen.getByTitle('Files'));
    expect(screen.getByText('Default folder for Open')).toBeTruthy();
    expect(screen.getByText('C:/Old')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Choose folder'));
    expect(onPickOpenDir).toHaveBeenCalledWith('C:/Old');
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ defaultOpenDir: 'D:/Pdf' }));
    });
    fireEvent.click(screen.getByTitle('Clear'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ defaultOpenDir: '' }));
  });

  it('asks before resetting', async () => {
    const { onReset } = await renderSettings();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByText('Reset all settings'));
    expect(onReset).toHaveBeenCalled();
  });

  it('does not reset when the confirm is cancelled', async () => {
    const { onReset } = await renderSettings();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByText('Reset all settings'));
    expect(onReset).not.toHaveBeenCalled();
  });
});
