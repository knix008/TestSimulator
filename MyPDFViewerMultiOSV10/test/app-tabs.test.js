import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const appSrc = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
const platformSrc = fs.readFileSync(path.join(root, 'src', 'lib', 'platform.js'), 'utf8');
const mainSrc = fs.readFileSync(path.join(root, 'electron', 'main.js'), 'utf8');

describe('App.jsx document tabs', () => {
  it('mounts the tab strip on the viewer, not over the left panel', () => {
    expect(appSrc).toMatch(/import TabBar from '\.\/components\/TabBar\.jsx'/);
    expect(appSrc).toMatch(/<main className=\{`viewer[\s\S]*?<TabBar[\s\S]*?<PdfView/);
    expect(appSrc).toMatch(/onSelect=\{switchToTab\}/);
    expect(appSrc).toMatch(/onClose=\{closeTab\}/);
    expect(appSrc).not.toMatch(/<Toolbar[\s\S]*?\/>\s*<TabBar/);
    expect(appSrc).not.toMatch(/<TitleBar title=\{titleText\} \/>\s*<TabBar/);
  });

  it('opens a new file as its own tab unless save-reload replaces the current one', () => {
    expect(appSrc).toMatch(/replace = false/);
    expect(appSrc).toMatch(/findTabByFile\(tabsRef\.current/);
    expect(appSrc).toMatch(/parkCurrentTab\(\)/);
    expect(appSrc).toContain('replace: true');
  });

  it('lets the open dialog and file drops add several documents at once', () => {
    expect(appSrc).toMatch(/openFileDialog\(\{ multi: true \}\)/);
    expect(appSrc).toMatch(/openPdfDialog\(\{ defaultDir: settings\.lastDir, multi: true \}\)/);
    expect(appSrc).toMatch(/const dropped = \[\.\.\.\(e\.dataTransfer\?\.files/);
    expect(mainSrc).toMatch(/if \(multi\) props\.push\('multiSelections'\)/);
    expect(platformSrc).toMatch(/multiple: !!multi/);
  });

  it('does not ask to save when opening another document', () => {
    const openVia = appSrc.slice(appSrc.indexOf('const openViaDialog'), appSrc.indexOf('const openByPath'));
    const openFromUrl = appSrc.slice(appSrc.indexOf('const openFromUrl'), appSrc.indexOf('// Files handed over'));
    const onDrop = appSrc.slice(appSrc.indexOf('const onDrop'), appSrc.indexOf('// ── Context menu'));
    expect(openVia).not.toMatch(/leaveOrCancelRef/);
    expect(openFromUrl).not.toMatch(/leaveOrCancelRef/);
    expect(onDrop).not.toMatch(/leaveOrCancelRef/);
  });

  it('closes and cycles tabs from the keyboard and asks before quitting dirty tabs', () => {
    expect(appSrc).toMatch(/e\.key\.toLowerCase\(\) === 'w'/);
    expect(appSrc).toMatch(/closeTab\(activeTabIdRef\.current\)/);
    expect(appSrc).toMatch(/e\.key === 'Tab'/);
    expect(appSrc).toMatch(/nextTabId\(tabsRef\.current/);
    expect(appSrc).toMatch(/anyTabDirty\(tabsRef\.current/);
  });

  it('keeps each tab\'s pdf.js document alive until that tab closes', () => {
    expect(appSrc).toMatch(/sessionsRef\.current\.set/);
    expect(appSrc).toMatch(/history\.exportSnapshot\(\)/);
    expect(appSrc).toMatch(/history\.restoreSnapshot/);
    expect(appSrc).toMatch(/snap\?\.doc/);
    expect(appSrc).toMatch(/snap\.doc\.destroy/);
  });
});
