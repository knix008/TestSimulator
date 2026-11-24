// Every class name a component uses has a rule in some stylesheet. The theme
// drop-down once lost all of its CSS to a patch that replaced a range of
// shell.css; the panel then spilled into the menu bar as a row of bare buttons.
// Names that are only hooks for tests or prefixes for composed names are listed.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { suite, test, expect } from '../helpers/runner.mjs';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');

/** Classes used without a rule of their own: hooks, or the first half of `${prefix}${x}`. */
const UNSTYLED = new Set([
  'about-card-text', 'analysis-group', 'analysis-list', 'backdrop-option', 'bottom-sev', 'fold-ic-', 'log-',
  'panel-', 'property-category', 'ruler', 'ruler-', 'splitter-', 'start-hero-text', 'status-message',
  'status-schema', 'tb-dropdown', 'theme-dialog-catalogue', 'tree-relation', 'tree-table',
]);

function files(dir, ext, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files(p, ext, out);
    else if (p.endsWith(ext)) out.push(p);
  }
  return out;
}

suite('stylesheets cover the components', () => {
  test('every class a component uses has a CSS rule', () => {
    const css = files(src, '.css').map((f) => readFileSync(f, 'utf8')).join('\n');
    const missing = [];
    for (const f of files(src, '.tsx')) {
      const s = readFileSync(f, 'utf8');
      for (const m of s.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g)) {
        const raw = (m[1] ?? m[2] ?? m[3]).replace(/\$\{[^}]*\}/g, ' ');
        for (const cls of raw.split(/\s+/)) {
          if (!/^[a-z][a-z0-9-]*$/.test(cls) || UNSTYLED.has(cls)) continue;
          if (!new RegExp(`\\.${cls}(?![a-z0-9-])`).test(css)) missing.push(`${cls} (${path.basename(f)})`);
        }
      }
    }
    expect([...new Set(missing)].length).toBe(0, [...new Set(missing)].join(', '));
  });

  test('the theme drop-down floats as a panel under its button', () => {
    const shell = readFileSync(path.join(src, 'styles/shell.css'), 'utf8');
    const panel = shell.match(/^\.theme-drop-panel \{[^}]*\}/m)?.[0] ?? '';
    expect(panel).toContain('position: absolute');
    expect(panel).toContain('overflow-y: auto');
    expect(/^\.theme-dropdown \{[^}]*position: relative/m.test(shell)).toBeTruthy('the button is the anchor');
  });
});
