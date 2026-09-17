// Icons for the native (OS) menus: the menu bar's dropdowns draw the same
// SVG icons as the in-page menus, rasterized here to PNG at the display's
// pixel ratio — a menu item's `icon` (an Icons.jsx name) through the Icon
// component's markup, a language item's `badge` as the coloured badge of
// LangIcon. Each icon is drawn once and cached.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Icon, langBadge } from '../components/Icons';

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

function drawBadge(name, px) {
  const b = langBadge(name);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const g = canvas.getContext('2d');
  const r = px * 0.2;
  g.fillStyle = b.bg;
  g.beginPath();
  g.moveTo(r, 0); g.lineTo(px - r, 0); g.quadraticCurveTo(px, 0, px, r); g.lineTo(px, px - r); g.quadraticCurveTo(px, px, px - r, px);
  g.lineTo(r, px); g.quadraticCurveTo(0, px, 0, px - r); g.lineTo(0, r); g.quadraticCurveTo(0, 0, r, 0); g.closePath(); g.fill();
  const n = b.text.length;
  const fontSize = px * (n <= 1 ? 0.62 : n === 2 ? 0.5 : n === 3 ? 0.4 : 0.32);
  g.fillStyle = b.fg;
  g.font = `700 ${fontSize}px system-ui, "Segoe UI", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(b.text, px / 2, px / 2 + fontSize * 0.05);
  return canvas.toDataURL('image/png').split(',')[1];
}

// PNG (base64) of a menu item's icon at the current pixel ratio, or null.
export async function menuIconPng(item) {
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const px = Math.round(SIZE * dpr);
  const key = item.badge ? `badge:${item.badge}:${px}` : item.icon ? `icon:${item.icon}:${px}` : null;
  if (!key) return null;
  if (!cache.has(key)) {
    cache.set(key, item.badge
      ? Promise.resolve(drawBadge(item.badge, px))
      : drawSvg(renderToStaticMarkup(React.createElement(Icon, { name: item.icon, size: px, style: { color: ICON_COLOR } })).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '), px));   // a standalone SVG needs its namespace
  }
  return cache.get(key);
}

// The items with their icons rasterized (`png` + `scale`), ready for the main process.
export async function withMenuIcons(items) {
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  return Promise.all(items.map(async (it) => {
    if (it.sep || it.header) return it;
    const png = await menuIconPng(it);
    return png ? { ...it, png, scale: dpr } : it;
  }));
}
