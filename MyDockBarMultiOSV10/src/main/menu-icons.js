'use strict';

const path = require('path');
const { nativeImage } = require('electron');

const DIR = path.join(__dirname, '..', '..', 'build', 'menu');
const cache = new Map();

/**
 * A 16px NativeImage for a native menu item. Electron resolves the matching
 * `@2x` file on its own, so only the base name is needed here.
 * Returns undefined when the glyph is missing, which simply leaves that menu
 * item without an icon rather than breaking the menu.
 */
function get(name) {
  if (!name) return undefined;
  if (cache.has(name)) return cache.get(name);

  const image = nativeImage.createFromPath(path.join(DIR, `${name}.png`));
  const result = image.isEmpty() ? undefined : image;
  if (!result) console.warn(`[menu-icons] missing glyph: ${name}`);
  cache.set(name, result);
  return result;
}

/** The glyph for a dock entry, based on what kind of entry it is. */
function forItemType(item) {
  if (!item) return get('app');
  if (item.type === 'separator') return get('separator');
  if (item.type === 'folder') return get('add-folder');
  if (item.type === 'url') return get('link');
  if ((item.path || '').startsWith('system:') || (item.path || '').startsWith('dock:')) return get('dock');
  return get('app');
}

/**
 * The dock item's own extracted icon, scaled for a menu. Falls back to the
 * generic type glyph when the icon could not be resolved.
 */
function forItem(item, iconPath) {
  if (iconPath) {
    const file = iconPath.startsWith('file://')
      ? decodeURI(iconPath.replace(/^file:\/\//, '')).replace(/^\/([A-Za-z]:)/, '$1')
      : iconPath;
    const image = nativeImage.createFromPath(file);
    if (!image.isEmpty()) return image.resize({ width: 16, height: 16, quality: 'best' });
  }
  return forItemType(item);
}

module.exports = { get, forItem, forItemType, DIR };
