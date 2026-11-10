// Web addresses inside engine messages are links that open in the system's
// web browser (lib/links.js, components/LinkText.jsx).
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';

vi.mock('../src/lib/platform.js', () => ({ openExternal: vi.fn(() => Promise.resolve(true)) }));

const { splitLinks, hasLinks } = await import('../src/lib/links.js');
const { default: LinkText } = await import('../src/components/LinkText.jsx');
const { openExternal } = await import('../src/lib/platform.js');

const TOKEN_MSG = 'SPAR3D needs a Hugging Face token: accept the license at https://huggingface.co/stabilityai/stable-point-aware-3d and enter a token in Settings → Engine.';

describe('splitLinks', () => {
  it('finds the license page in the engine\'s token message', () => {
    const parts = splitLinks(TOKEN_MSG);
    expect(parts.filter((p) => p.url)).toEqual([{ url: 'https://huggingface.co/stabilityai/stable-point-aware-3d' }]);
    expect(parts.map((p) => p.url || p.text).join('')).toBe(TOKEN_MSG);
  });

  it('leaves sentence punctuation outside the address', () => {
    expect(splitLinks('see https://a.example/x.').filter((p) => p.url)[0].url).toBe('https://a.example/x');
    expect(splitLinks('(https://a.example/y), then').filter((p) => p.url)[0].url).toBe('https://a.example/y');
    expect(splitLinks('https://en.wikipedia.org/wiki/Foo_(bar)').filter((p) => p.url)[0].url).toBe('https://en.wikipedia.org/wiki/Foo_(bar)');
  });

  it('handles several addresses, none, and empty input', () => {
    expect(splitLinks('a http://x.example b https://y.example/z').filter((p) => p.url)).toHaveLength(2);
    expect(hasLinks('no address here')).toBe(false);
    expect(splitLinks(null)).toEqual([]);
    expect(hasLinks('ftp://x.example')).toBe(false);
  });
});

describe('LinkText', () => {
  it('shows the address as a link that opens in the browser, not in the app', () => {
    const { container } = render(<p><LinkText text={TOKEN_MSG} /></p>);
    const a = container.querySelector('a[data-external-link]');
    expect(a.textContent).toBe('https://huggingface.co/stabilityai/stable-point-aware-3d');
    expect(container.textContent).toBe(TOKEN_MSG);
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    a.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true); // the app window does not navigate
    expect(openExternal).toHaveBeenCalledWith('https://huggingface.co/stabilityai/stable-point-aware-3d');
    fireEvent.click(a);
    expect(openExternal).toHaveBeenCalledTimes(2);
  });
});
