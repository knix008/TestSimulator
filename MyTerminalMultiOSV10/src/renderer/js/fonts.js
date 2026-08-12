/** Curated monospace fonts for the terminal (with safe fallbacks). */
export const FONTS = [
  {
    id: 'cascadia',
    label: 'Cascadia Mono',
    family: '"Cascadia Mono", "Cascadia Code", Consolas, monospace',
  },
  {
    id: 'consolas',
    label: 'Consolas',
    family: 'Consolas, "Courier New", monospace',
  },
  {
    id: 'jetbrains',
    label: 'JetBrains Mono',
    family: '"JetBrains Mono", Consolas, monospace',
  },
  {
    id: 'fira',
    label: 'Fira Code',
    family: '"Fira Code", Consolas, monospace',
  },
  {
    id: 'sourcecode',
    label: 'Source Code Pro',
    family: '"Source Code Pro", Consolas, monospace',
  },
  {
    id: 'menlo',
    label: 'Menlo',
    family: 'Menlo, Monaco, monospace',
  },
  {
    id: 'monaco',
    label: 'Monaco',
    family: 'Monaco, Menlo, monospace',
  },
  {
    id: 'ubuntu',
    label: 'Ubuntu Mono',
    family: '"Ubuntu Mono", "Courier New", monospace',
  },
  {
    id: 'roboto',
    label: 'Roboto Mono',
    family: '"Roboto Mono", Consolas, monospace',
  },
  {
    id: 'courier',
    label: 'Courier New',
    family: '"Courier New", Courier, monospace',
  },
  {
    id: 'd2coding',
    label: 'D2Coding',
    family: 'D2Coding, "Malgun Gothic", Consolas, monospace',
  },
  {
    id: 'nanum',
    label: 'Nanum Gothic Coding',
    family: '"Nanum Gothic Coding", "Malgun Gothic", Consolas, monospace',
  },
  {
    id: 'system',
    label: 'System Mono',
    family: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  },
];

export const DEFAULT_FONT_ID = 'consolas';

export function getFontById(id) {
  return FONTS.find((f) => f.id === id) || FONTS.find((f) => f.id === DEFAULT_FONT_ID);
}
