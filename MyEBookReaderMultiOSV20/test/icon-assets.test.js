// The icons are MyEBookReader's own (an open book, and an eBook sheet for the
// .ebkvw workspace) — not the PDF sheet this app started from.
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

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

describe('no PDF left on the icons', () => {
  it('does not say PDF on either icon', () => {
    expect(appSvg).not.toMatch(/>\s*PDF\s*</);
    expect(fileSvg).not.toMatch(/>\s*PDF\s*</);
  });
});
