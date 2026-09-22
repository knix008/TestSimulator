import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { THEME_IDS } from '../src/lib/themes.js';

const css = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'src', 'App.css'), 'utf8');

describe('App.css theme palettes', () => {
  it('defines a :root[data-theme] block for every non-default theme', () => {
    // `dark` is the unscoped :root palette; every other id has its own block.
    expect(css).toMatch(/:root\s*\{/);
    for (const id of THEME_IDS.filter((id) => id !== 'dark')) {
      expect(css, id).toMatch(new RegExp(`:root\\[data-theme=['"]${id}['"]\\]`));
    }
  });

  it('sets the core tokens used by the chrome', () => {
    for (const token of ['--bg', '--panel', '--text', '--accent']) {
      expect(css.split(token).length).toBeGreaterThan(THEME_IDS.length);
    }
  });
});

describe('dialog windows do not scroll or clip their chrome', () => {
  it('sizes modals to the viewport and keeps the body free of scrollbars', () => {
    expect(css).toMatch(/\.modal\s*\{[^}]*max-height:\s*calc\(100vh - 32px\)/s);
    expect(css).toMatch(/\.modal-body\s*\{[^}]*overflow:\s*hidden/s);
    expect(css).not.toMatch(/\.modal-body\s*\{[^}]*overflow:\s*auto/s);
    expect(css).toMatch(/\.settings-pane\s*\{[^}]*display:\s*grid/s);
    expect(css).toMatch(/\.settings-panel\s*\{[^}]*grid-area:\s*1\s*\/\s*1/s);
    expect(css).toMatch(/\.settings-split\s*\{[^}]*grid-template-columns:/s);
    expect(css).toMatch(/\.settings-modal \.modal-body\s*\{[^}]*overflow:\s*visible/s);
  });

  it('fits the capture preview and settings files without an inner scroller', () => {
    expect(css).toMatch(/\.capture-preview\s*\{[^}]*overflow:\s*hidden/s);
    expect(css).toMatch(/\.settings-files\s*\{[^}]*grid-template-columns:\s*1fr 1fr/s);
    expect(css).toMatch(/\.toolbar-scroll\s*\{[^}]*overflow:\s*hidden/s);
    expect(css).toMatch(/\.dropdown\s*\{[^}]*overflow:\s*visible/s);
    expect(css).toMatch(/\.dd-list\.themes\s*\{[^}]*overflow:\s*visible/s);
    expect(css).not.toMatch(/\.dd-list\.themes\s*\{[^}]*overflow-y:\s*auto/s);
    expect(css).toMatch(/\.ctxmenu\s*\{[^}]*user-select:\s*none/s);
    expect(css).toMatch(/\.search-layer\s*\{[^}]*pointer-events:\s*none/s);
    expect(css).toMatch(/\.search-block\s*\{[^}]*background:/s);
    expect(css).toMatch(/\.bm-layer\s*\{[^}]*pointer-events:\s*none/s);
    expect(css).toMatch(/\.bm-block\s*\{[^}]*background:/s);
    expect(css).not.toMatch(/\.bm-pin\s*\{/s);
    expect(css).toMatch(/\.comment-layer\s*\{[^}]*pointer-events:\s*none/s);
    expect(css).toMatch(/\.comment-mark\s*\{[^}]*border:\s*none/s);
    expect(css).toMatch(/\.comment-card\s*\{/s);
    expect(css).toMatch(/\.side-splitter\s*\{[^}]*cursor:\s*col-resize/s);
    expect(css).toMatch(/\.outline-tree \.tree-row\.current\s*\{[^}]*background:/s);
    expect(css).toMatch(/\.folder-tree\s*\{[^}]*--tree-line:/s);
    expect(css).toMatch(/\.tree \.tree > li::before/);
    expect(css).toMatch(/\.tree \.tree > li::after/);
  });

  it('keeps the page viewer as a scrollport so zoom can show scrollbars', () => {
    expect(css).toMatch(/\.viewer\s*\{[^}]*min-height:\s*0/s);
    expect(css).toMatch(/\.viewer\s*\{[^}]*flex-direction:\s*column/s);
    expect(css).toMatch(/\.viewer\s*\{[^}]*overflow:\s*hidden/s);
    expect(css).toMatch(/\.pageview\s*\{[^}]*min-width:\s*0/s);
    expect(css).toMatch(/\.pageview\s*\{[^}]*min-height:\s*0/s);
    expect(css).toMatch(/\.pageview\s*\{[^}]*overflow:\s*auto/s);
    expect(css).toMatch(/\.pagestack\s*\{[^}]*width:\s*max-content/s);
    expect(css).toMatch(/\.pagestack\s*\{[^}]*min-width:\s*100%/s);
    expect(css).toMatch(/\.pageview::-webkit-scrollbar\s*\{[^}]*width:\s*12px/s);
    expect(css).toMatch(/\.pageview\.empty\s*\{[^}]*overflow:\s*hidden/s);
  });

  it('pins overflow < > buttons on the right of the document tab strip', () => {
    expect(css).toMatch(/\.tabbar\s*\{[^}]*display:\s*flex/s);
    expect(css).toMatch(/\.tabbar-scroll\s*\{[^}]*overflow-x:\s*auto/s);
    expect(css).toMatch(/\.tabbar-scroll\s*\{[^}]*scrollbar-width:\s*none/s);
    expect(css).toMatch(/\.tabbar-nav\s*\{[^}]*flex:\s*none/s);
    expect(css).toMatch(/\.tabbar-nav\s*\{[^}]*border-left:/s);
    expect(css).toMatch(/\.tabbar-nav-btn\s*\{[^}]*width:\s*22px/s);
  });
});
