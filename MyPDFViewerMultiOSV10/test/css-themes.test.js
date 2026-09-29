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
    expect(css).not.toMatch(/\.settings-files\s*\{/);
    expect(css).toMatch(/\.toolbar-scroll\s*\{[^}]*overflow:\s*hidden/s);
    expect(css).toMatch(/\.dropdown\s*\{[^}]*overflow:\s*visible/s);
    expect(css).toMatch(/\.dd-list\.themes\s*\{[^}]*overflow:\s*visible/s);
    expect(css).not.toMatch(/\.dd-list\.themes\s*\{[^}]*overflow-y:\s*auto/s);
    expect(css).toMatch(/\.theme-cols\s*\{[^}]*grid-template-columns:\s*1fr 1fr/s);
    expect(css).toMatch(/\.theme-groups\s*\{[^}]*grid-template-columns:\s*1fr 1fr/s);
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
    expect(css).toMatch(/\.side-rail\s*\{[^}]*overflow-y:\s*auto/s);
    expect(css).toMatch(/\.outline-tree \.tree-row\.current\s*\{[^}]*background:/s);
    expect(css).toMatch(/\.folder-tree\s*\{[^}]*--tree-line:/s);
    expect(css).toMatch(/\.tree \.tree > li::before/);
    expect(css).toMatch(/\.tree \.tree > li::after/);
    expect(css).toMatch(/\.side-head\s*\{[^}]*font-weight:\s*700/s);
    expect(css).toMatch(/\.side-head-title\.side-drives\s*\{/s);
    expect(css).toMatch(/\.drive-chip\.on\s*\{/s);
    expect(css).toMatch(/\.side-head-actions\s*\{[^}]*margin-left:\s*auto/s);
    expect(css).toMatch(/\.marquee,\s*\n\.marquee\.picked\s*\{[^}]*border:\s*2px dashed var\(--accent\)/s);
    expect(css).toMatch(/\.marquee,\s*\n\.marquee\.picked\s*\{[^}]*color-mix\(in srgb, var\(--accent\) 18%/s);
    expect(css).toMatch(/\.sel-layer\s*\{[^}]*mix-blend-mode:\s*difference/s);
    expect(css).toMatch(/\.sel-block\s*\{[^}]*background:\s*#fff/s);
    expect(css).toMatch(/\.img-region\.hot,\s*\n\.img-region\.picked\s*\{[^}]*border:\s*2px dashed var\(--accent\)/s);
    expect(css).toMatch(/\.textLayer ::selection[\s\S]*text-shadow:\s*none/);
    expect(css).toMatch(/\.textLayer :is\(span, br\)[\s\S]*-webkit-text-fill-color:\s*transparent/);
    expect(css).toMatch(/\.textLayer\s*\{[^}]*opacity:\s*0/s);
    expect(css).toMatch(/\.sel-block\s*\{[^}]*box-shadow:\s*none/s);
  });

  it('keeps the page viewer as a scrollport so zoom can show scrollbars', () => {
    expect(css).toMatch(/\.info-panel\s*\{[^}]*width:\s*var\(--info-width/s);
    expect(css).toMatch(/\.viewer\s*\{[^}]*min-height:\s*0/s);
    expect(css).toMatch(/\.viewer\s*\{[^}]*flex-direction:\s*column/s);
    expect(css).toMatch(/\.viewer\s*\{[^}]*overflow:\s*hidden/s);
    expect(css).toMatch(/\.page-stage\s*\{[^}]*position:\s*relative/s);
    expect(css).toMatch(/\.page-nav\.prev\s*\{[^}]*left:\s*12px/s);
    expect(css).toMatch(/\.page-stage\.turning \.page-nav\s*\{[^}]*pointer-events:\s*none/s);
    expect(css).toMatch(/\.page-stage\s*\{[^}]*overflow:\s*hidden/s);
    expect(css).toMatch(/\.pageview\s*\{[^}]*min-width:\s*0/s);
    expect(css).toMatch(/\.pageview\s*\{[^}]*min-height:\s*0/s);
    expect(css).toMatch(/\.pageview\s*\{[^}]*overflow:\s*auto/s);
    expect(css).toMatch(/\.pagestack\s*\{[^}]*width:\s*max-content/s);
    expect(css).toMatch(/\.pagestack\s*\{[^}]*margin-inline:\s*auto/s);
    expect(css).toMatch(/\.pageview\.center-sheet \.pagestack:not\(\.doc-scroll\)\s*\{[^}]*min-height:\s*100%/s);
    expect(css).toMatch(/\.pagestack\.doc-scroll(?:\.spread)?,\s*\.pagestack\.doc-scroll\.spread\s*\{[^}]*gap:\s*0/s);
    expect(css).toMatch(/\.doc-spacer/);
    expect(css).toMatch(/\.pageview\s*\{[^}]*scrollbar-gutter:\s*stable both-edges/s);
    expect(css).toMatch(/\.pagestack\.doc-scroll\.spread\s*\{[^}]*flex-direction:\s*column/s);
    expect(css).toMatch(/\.pagestack \.turn-sheet\.doc-slot\s*\{[^}]*flex-direction:\s*row/s);
    expect(css).toMatch(/\.turn-cover\s*\{[^}]*background:\s*transparent/s);
    expect(css).toMatch(/@keyframes leaf-over-forward/);
    expect(css).toMatch(/@keyframes leaf-over-back/);
    expect(css).toMatch(/\.turn-leaf\.forward/);
    expect(css).toMatch(/\.turn-leaf\.half/);
    expect(css).toMatch(/\.turn-stay\.left/);
    expect(css).toMatch(/\.turn-stay\.right/);
    expect(css).toMatch(/\.turn-stay\.blank\s*\{[^}]*background:\s*var\(--page-bg\)/s);
    expect(css).toMatch(/\.turn-leaf\.whole\s*\{[^}]*backface-visibility:\s*hidden/s);
    expect(css).toMatch(/\.leaf-face\.back/);
    expect(css).toMatch(/\.page-spread\s*\{[^}]*perspective:\s*2000px/s);
    expect(css).toMatch(/\.page-spread\.two-up\.lonely\s*\{[^}]*justify-content:\s*flex-start/s);
    expect(css).toMatch(/@keyframes leaf-over-forward\s*\{[^}]*perspective\(2000px\)/s);
    expect(css).toMatch(/\.flip-overlay\s*\{[^}]*overflow:\s*visible/s);
    expect(css).toMatch(/\.page-stage\.turning\.flip-turn\s*\{[^}]*overflow:\s*hidden/s);
    expect(css).toMatch(/@keyframes turn-slide-in-next/);
    expect(css).toMatch(/@keyframes turn-fade-out/);
    expect(css).toMatch(/\.turn-sheet\.incoming\.turn-in/);
    expect(css).toMatch(/overflow-anchor:\s*none/);
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
