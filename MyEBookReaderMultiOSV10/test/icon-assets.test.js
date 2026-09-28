import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { encodeIco, encodeIcns } from '../src/lib/ico.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSvg = fs.readFileSync(path.join(root, 'assets', 'icon.svg'), 'utf-8');
const fileSvg = fs.readFileSync(path.join(root, 'assets', 'file-icon.svg'), 'utf-8');

function describeIcon(name, svg) {
  describe(`${name} icon`, () => {
    it('is a square SVG drawn at icon resolution', () => {
      expect(svg).toContain('viewBox="0 0 1024 1024"');
      expect(svg).toContain('width="1024"');
    });

    it('looks three-dimensional: gradients for its faces', () => {
      expect((svg.match(/<linearGradient/g) || []).length).toBeGreaterThanOrEqual(4);
      expect(svg).toMatch(/<radialGradient/);
    });

    it('is lit from the top left', () => {
      // The specular highlight is a radial gradient centred in the upper-left
      // quadrant — cx and cy below the middle of the icon.
      const speculars = [...svg.matchAll(/<radialGradient[^>]*cx="([\d.]+)"[^>]*cy="([\d.]+)"/g)];
      expect(speculars.length).toBeGreaterThan(0);
      const topLeft = speculars.filter(([, cx, cy]) => Number(cx) < 0.5 && Number(cy) < 0.5);
      expect(topLeft.length).toBeGreaterThan(0);
    });

    it('leaves the canvas around it transparent — nothing is full-bleed', () => {
      const fullBleed = /<rect[^>]*\bx="0"[^>]*\by="0"[^>]*width="1024"[^>]*height="1024"/.test(svg);
      expect(fullBleed).toBe(false);
      expect(svg).not.toContain('<rect width="1024" height="1024"');
    });

    it('casts a shadow, so it reads as a solid object', () => {
      expect(svg).toMatch(/[Ss]hadow|feGaussianBlur|[Gg]round/);
    });

    it('says what it is: the word is drawn on it', () => {
      expect(svg.toLowerCase()).toMatch(/<text[^>]*>[\s\S]*ebook/i);
    });
  });
}

describeIcon('application', appSvg);
describeIcon('document', fileSvg);

describe('the two icons are different', () => {
  it('are not the same drawing', () => {
    expect(appSvg).not.toBe(fileSvg);
  });

  it('give the document type its own look', () => {
    // The app icon is a book on a plate; the document icon is a sheet.
    expect(appSvg).toContain('ribbon');
    expect(fileSvg).toContain('fold');
  });
});

describe('the application icon', () => {
  it('stands on one background plate', () => {
    // A single rounded shape behind the book — not a collage of pieces.
    const plates = appSvg.match(/<rect[^>]*rx="150"[^>]*fill="url\(#plate\)"/g) || [];
    expect(plates).toHaveLength(1);
  });

  it('casts its shadow down and to the right', () => {
    const shadow = /<rect x="(\d+)" y="(\d+)"[^>]*fill="url\(#plateShadow\)"/.exec(appSvg);
    const plate = /<rect x="(\d+)" y="(\d+)"[^>]*fill="url\(#plate\)"/.exec(appSvg);
    expect(shadow).toBeTruthy();
    expect(Number(shadow[1])).toBeGreaterThan(Number(plate[1]));
    expect(Number(shadow[2])).toBeGreaterThan(Number(plate[2]));
  });

  it('draws a book: a cover, a spine and a page block', () => {
    expect(appSvg).toContain('id="cover"');
    expect(appSvg).toContain('id="spine"');
    expect(appSvg).toContain('id="pages"');
  });

  it('carries the word EBook', () => {
    expect(appSvg).toMatch(/>EBook</);
  });
});

describe('the document icon', () => {
  it('carries the word eBook', () => {
    expect(fileSvg).toMatch(/>eBook</);
  });
});

describe('public copies', () => {
  it('are in sync with the sources, so the UI can load them by URL', () => {
    for (const name of ['icon.svg', 'file-icon.svg']) {
      const copy = path.join(root, 'public', name);
      expect(fs.existsSync(copy), name).toBe(true);
      const source = path.join(root, 'assets', name);
      expect(fs.readFileSync(copy, 'utf-8'), name).toBe(fs.readFileSync(source, 'utf-8'));
    }
  });
});

describe('the icon encoders', () => {
  // A 1×1 PNG, enough to check the container each encoder writes.
  const png = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  ]);

  it('writes an ICO directory with one entry per size', () => {
    const ico = encodeIco([{ size: 16, png }, { size: 32, png }, { size: 256, png }]);
    const view = new DataView(ico.buffer, ico.byteOffset, ico.byteLength);
    expect(view.getUint16(0, true)).toBe(0);      // reserved
    expect(view.getUint16(2, true)).toBe(1);      // type: icon
    expect(view.getUint16(4, true)).toBe(3);      // three images
    expect(ico[6]).toBe(16);                      // first entry is 16×16
    expect(ico[6 + 32]).toBe(0);                  // 256 is stored as 0
  });

  it('refuses an ICO with no usable size', () => {
    expect(() => encodeIco([{ size: 1024, png }])).toThrow(/at least one/i);
  });

  it('writes an ICNS container', () => {
    const icns = encodeIcns([{ size: 16, png }, { size: 512, png }]);
    expect(String.fromCharCode(...icns.subarray(0, 4))).toBe('icns');
    const view = new DataView(icns.buffer, icns.byteOffset, icns.byteLength);
    expect(view.getUint32(4)).toBe(icns.length);
  });
});

describe('the icon generator', () => {
  const script = fs.readFileSync(path.join(root, 'scripts', 'generate-icons.mjs'), 'utf-8');

  it('produces every format the installers need from the same SVG', () => {
    expect(script).toContain("'icon.ico'");
    expect(script).toContain("'icon.icns'");
    expect(script).toContain("'icon.png'");
    expect(script).toContain('LINUX_SIZES');
  });

  it('produces the document icon from the document SVG', () => {
    expect(script).toContain('file-icon.svg');
    expect(script).toContain("'file.ico'");
    expect(script).toContain("'file.icns'");
  });
});
