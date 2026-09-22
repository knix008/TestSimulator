import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { setLanguage } from '../src/i18n.js';
import SettingsDialog from '../src/components/SettingsDialog.jsx';
import { DEFAULT_SETTINGS } from '../src/lib/settings.js';
import { THEME_IDS } from '../src/lib/themes.js';

async function renderSettings(overrides = {}) {
  await setLanguage('en');
  const onChange = vi.fn();
  const onReset = vi.fn();
  render(
    <SettingsDialog
      open
      settings={{ ...DEFAULT_SETTINGS, ...overrides.settings }}
      onChange={onChange}
      onClose={() => {}}
      onClearRecent={() => {}}
      onRemoveRecent={() => {}}
      onClearDirs={() => {}}
      onReset={onReset}
    />,
  );
  return { onChange, onReset };
}

describe('SettingsDialog', () => {
  it('lists every theme and applies the one that is clicked', async () => {
    const { onChange } = await renderSettings();
    for (const id of THEME_IDS) expect(screen.getByTitle(id)).toBeTruthy();
    fireEvent.click(screen.getByTitle('nord'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ theme: 'nord' }));
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
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ pageLayout: 'single' }));
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
