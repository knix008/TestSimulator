import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const assets = path.resolve(import.meta.dirname, '..', 'assets');
const icon = fs.readFileSync(path.join(assets, 'icon.svg'), 'utf8');
const fileIcon = fs.readFileSync(path.join(assets, 'file-icon.svg'), 'utf8');

describe('app icons', () => {
  it('draws a 3D block on a transparent canvas', () => {
    expect(icon).toMatch(/<svg[^>]*viewBox="0 0 1024 1024"/);
    expect(icon).toMatch(/3D rounded block|3D block/i);
    expect(icon).toMatch(/transparent/i);
    expect(icon).toMatch(/id="top"/);
    expect(icon).toMatch(/id="front"/);
    expect(icon).toMatch(/id="right"/);
    expect(icon).toMatch(/fill="url\(#front\)"/);
    expect(icon).toMatch(/fill="url\(#right\)"/);
    expect(icon).toMatch(/fill="url\(#top\)"/);
    expect(icon).not.toMatch(/<rect[^>]*width="1024"[^>]*height="1024"/);
  });

  it('keeps the file-icon sheet 3D with no opaque rim', () => {
    expect(fileIcon).toMatch(/<svg[^>]*viewBox="0 0 1024 1024"/);
    expect(fileIcon).toMatch(/3D sheet/i);
    expect(fileIcon).toMatch(/transparent/i);
    expect(fileIcon).toMatch(/fill="url\(#pageFront\)"/);
    expect(fileIcon).toMatch(/fill="url\(#pageRight\)"/);
    expect(fileIcon).not.toMatch(/<rect[^>]*width="1024"[^>]*height="1024"/);
  });
});
