// On the desktop the theme menu is a window of its own, which can only answer
// the main window with "theme picked". Its Settings button answers with
// THEME_OPEN_SETTINGS, and the title bar's buttons turn that into Settings.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render } from '@testing-library/react';

let picked = null;

beforeAll(() => {
  // platform.js reads window.desktopAPI when it is first imported.
  window.desktopAPI = {
    isDesktop: true,
    win: { onThemePicked: (cb) => { picked = cb; return () => { picked = null; }; } },
  };
});

describe('answers from the detached theme menu', () => {
  it('opens Settings for the Settings button and applies any other answer as a theme', async () => {
    vi.resetModules();
    await import('../src/i18n.js');
    const { AppButtons } = await import('../src/components/Toolbar.jsx');
    const { THEME_OPEN_SETTINGS } = await import('../src/lib/themes.js');
    const { DEFAULT_SETTINGS } = await import('../src/lib/settings.js');
    const onTheme = vi.fn();
    const onSettings = vi.fn();
    render(
      <AppButtons settings={DEFAULT_SETTINGS} onTheme={onTheme} onLang={() => {}} onSettings={onSettings} onAbout={() => {}} />,
    );
    expect(typeof picked).toBe('function');
    picked(THEME_OPEN_SETTINGS);
    expect(onSettings).toHaveBeenCalledTimes(1);
    expect(onTheme).not.toHaveBeenCalled();
    picked('paper');
    expect(onTheme).toHaveBeenCalledWith('paper');
  });
});
