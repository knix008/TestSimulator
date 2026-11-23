// The program theme's brightness and colours, as the views need them to draw the drawing in the
// theme (designs.js themedDoc): the canvas, the Pan & Zoom window and the page thumbnails.

export function screenTheme() {
  const root = document.documentElement;
  const css = getComputedStyle(root);
  const v = (name) => css.getPropertyValue(name).trim();
  return { dark: root.style.colorScheme === 'dark', surface: v('--surface'), text: v('--text'), muted: v('--muted') };
}
