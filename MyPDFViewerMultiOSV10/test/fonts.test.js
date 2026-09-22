import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('FALLBACK_FONTS', () => {
  it('lists cross-platform families including Korean faces', async () => {
    const { FALLBACK_FONTS } = await import('../src/lib/fonts.js');
    expect(FALLBACK_FONTS).toContain('Arial');
    expect(FALLBACK_FONTS).toContain('Malgun Gothic');
    expect(FALLBACK_FONTS).toContain('Noto Sans KR');
    expect(FALLBACK_FONTS).toContain('Apple SD Gothic Neo');
    expect(FALLBACK_FONTS).toContain('DejaVu Sans');
    expect(new Set(FALLBACK_FONTS).size).toBe(FALLBACK_FONTS.length);
  });
});

describe('getSystemFonts', () => {
  beforeEach(() => {
    vi.resetModules();
    delete window.queryLocalFonts;
  });

  it('returns a sorted fallback list when the Local Font Access API is missing', async () => {
    const { getSystemFonts, FALLBACK_FONTS } = await import('../src/lib/fonts.js');
    const fonts = await getSystemFonts();
    expect(fonts).toEqual([...FALLBACK_FONTS].sort((a, b) => a.localeCompare(b)));
  });

  it('uses unique family names from queryLocalFonts', async () => {
    window.queryLocalFonts = vi.fn(async () => [
      { family: 'Zapfino' },
      { family: 'Arial' },
      { family: 'Arial' },
      { family: 'Malgun Gothic' },
    ]);
    const { getSystemFonts } = await import('../src/lib/fonts.js');
    const fonts = await getSystemFonts();
    expect(fonts).toEqual(['Arial', 'Malgun Gothic', 'Zapfino']);
  });

  it('falls back when queryLocalFonts throws (permission denied)', async () => {
    window.queryLocalFonts = vi.fn(async () => { throw new Error('denied'); });
    const { getSystemFonts, FALLBACK_FONTS } = await import('../src/lib/fonts.js');
    const fonts = await getSystemFonts();
    expect(fonts).toEqual([...FALLBACK_FONTS].sort((a, b) => a.localeCompare(b)));
  });

  it('falls back when the API returns no families', async () => {
    window.queryLocalFonts = vi.fn(async () => []);
    const { getSystemFonts, FALLBACK_FONTS } = await import('../src/lib/fonts.js');
    const fonts = await getSystemFonts();
    expect(fonts).toEqual([...FALLBACK_FONTS].sort((a, b) => a.localeCompare(b)));
  });

  it('caches the first successful result', async () => {
    window.queryLocalFonts = vi.fn(async () => [{ family: 'Cached' }]);
    const { getSystemFonts } = await import('../src/lib/fonts.js');
    const first = await getSystemFonts();
    window.queryLocalFonts = vi.fn(async () => [{ family: 'Other' }]);
    const second = await getSystemFonts();
    expect(first).toEqual(['Cached']);
    expect(second).toEqual(['Cached']);
  });
});
