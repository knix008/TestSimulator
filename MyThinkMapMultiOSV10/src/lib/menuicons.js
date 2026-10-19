// Icons for the native (OS) menus: the menu bar's dropdowns draw the same
// SVG icons as the in-page menus, rasterized here to PNG at the display's
// pixel ratio — a menu item's `icon` (an Icons.jsx name) through the Icon
// component's markup, a marker item's `marker` through its own SVG. Each
// icon is drawn once and cached.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Icon } from '../components/Icons';
import { markerSvgDoc } from './markers';

const SIZE = 16;                 // CSS pixels in the menu
const ICON_COLOR = '#6b7280';    // readable on a light or a dark OS menu

const cache = new Map();

function drawSvg(svg, px) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = px;
    const img = new Image();
    img.onload = () => { canvas.getContext('2d').drawImage(img, 0, 0, px, px); resolve(canvas.toDataURL('image/png').split(',')[1]); };
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

// PNG (base64) of a menu item's icon at the current pixel ratio, or null.
export async function menuIconPng(item) {
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const px = Math.round(SIZE * dpr);
  const key = item.marker ? `marker:${item.marker}:${px}` : item.icon ? `icon:${item.icon}:${px}` : null;
  if (!key) return null;
  if (!cache.has(key)) {
    cache.set(key, item.marker
      ? drawSvg(markerSvgDoc(item.marker, px), px)
      : drawSvg(renderToStaticMarkup(React.createElement(Icon, { name: item.icon, size: px, style: { color: ICON_COLOR } })).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '), px));   // a standalone SVG needs its namespace
  }
  return cache.get(key);
}

// The items with their icons rasterized (`png` + `scale`), ready for the shell.
export async function withMenuIcons(items) {
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  return Promise.all(items.map(async (it) => {
    if (it.sep || it.header) return it;
    const png = await menuIconPng(it);
    return png ? { ...it, png, scale: dpr } : it;
  }));
}
