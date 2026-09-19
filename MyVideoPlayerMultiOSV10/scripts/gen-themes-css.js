import { writeFileSync } from 'fs';
import { BUILTIN_THEMES } from '../src/js/themes.js';

const fixed = `:root {
  /* Play / stop stay identical in every theme */
  --ctrl-play: #3d8bfd;
  --ctrl-play-hover: #5a9dff;
  --ctrl-stop: #e85d5d;
  --ctrl-stop-hover: #f07070;
}
`;

function block(theme) {
  const lines = Object.entries(theme.vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  const scheme = theme.scheme === 'light' ? 'light' : 'dark';
  const sel =
    theme.id === 'dark'
      ? `:root,\n[data-theme="dark"]`
      : `[data-theme="${theme.id}"]`;
  return `${sel} {
${lines}
  color-scheme: ${scheme};
}`;
}

const custom = `
/* Custom themes start from dark; inline CSS variables override values */
[data-theme="custom"] {
  color-scheme: dark;
}

[data-theme="custom"][data-color-scheme="light"] {
  color-scheme: light;
}
`;

const css = [fixed, ...BUILTIN_THEMES.map(block), custom].join('\n');
writeFileSync(new URL('../src/styles/themes.css', import.meta.url), css);
console.log(`Wrote themes.css (${BUILTIN_THEMES.length} themes)`);
