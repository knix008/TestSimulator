// Every button in a pop-up window carries an icon (the user's rule): the shared
// dialog footer, the confirm / error dialogs, the editors, the print window and
// the start screen's controls. A button whose picture is a colour swatch counts.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { suite, test, expect } from '../helpers/runner.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const components = path.join(root, 'src/components');

const POPUP_FILES = [
  ...readdirSync(components).filter((f) => /Dialog\.tsx$|Dialogs\.tsx$/.test(f)),
  'PrintWindow.tsx',
  'StartScreen.tsx',
  'AboutDialog.tsx',
].filter((f, i, all) => all.indexOf(f) === i);

const HAS_ICON = /<Icons\.|<svg|<img|\{icon\}|Icon \/>|Icon\b[^>]*\/>|custom-theme-chip|theme-swatch|<AnimationIcon|\{p\.icon\}/;

suite('pop-up buttons have icons', () => {
  for (const file of POPUP_FILES) {
    test(file, () => {
      let source;
      try {
        source = readFileSync(path.join(components, file), 'utf8');
      } catch {
        return; // not every listed file exists in every build
      }
      const bare = [];
      for (const m of source.matchAll(/<button\b[\s\S]*?<\/button>/g)) {
        const block = m[0];
        if (HAS_ICON.test(block) || /className=\{?[`"'][^`"']*theme-swatch/.test(block)) continue;
        const line = source.slice(0, m.index).split('\n').length;
        bare.push(`${file}:${line} ${block.replace(/\s+/g, ' ').slice(0, 90)}`);
      }
      expect(bare.length).toBe(0, bare.join('\n'));
    });
  }

  test('the unsaved-changes prompt: Save, Don\'t save and Cancel each have their own icon', () => {
    const dialogs = readFileSync(path.join(components, 'SimpleDialogs.tsx'), 'utf8');
    expect(dialogs).toContain("okIcon={intent === 'save' ? <Icons.Save />");
    expect(dialogs).toContain('<Icons.Discard />');
    const app = readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
    expect((app.match(/confirmLabel: t\('ConfirmSave'\),\s*intent: 'save'/g) || []).length).toBe(3);
    expect((app.match(/intent: 'delete'/g) || []).length).toBe(3);
  });
});
