// Printing: one dialog for everything that can be printed.
//
//   import { openPrintDialog } from '../print';
//   const r = await openPrintDialog({
//     title: 'demo.m',            // header text, PDF file name
//     kind: 'code',               // 'text' | 'code' | 'html' | 'image'
//     text: '...',                // text / code
//     language: 'm',              // code: 'm' gives syntax colours
//     runs: [{ t, c }],           // or: text already split into coloured runs (c = class)
//     html: '<!doctype html>...', // html: a fragment or a whole document; its <head>
//                                 //   styles are kept, <script> is dropped
//     baseUrl: 'http://host/guide/', // html: where relative URLs (images) resolve
//     imageDataUrl: 'data:image/png;base64,...', // image
//     imageWidthPx: 800,          // image: CSS width at 100 % (custom scale)
//     lightenable: true,          // image: offer "light background" (dark-theme captures)
//     setup: { ... },             // optional setup overrides (printdoc.js PRINT_DEFAULTS)
//   });
//   // r: { ok: true } printed / sent, { ok: false, cancelled: true } closed
//
// The dialog is an in-page modal of the window that calls it (main window,
// manual window, web page); it needs the app's stylesheet tokens and nothing
// else. Page setup on the left (printer, paper, orientation, margins, scale,
// pages per sheet, font, line numbers, wrap, header / footer, colour,
// copies, duplex, page range), the real pages on the right. [Print] prints
// at once on the desktop (Windows: WebView2 silent print on the chosen
// printer, src-tauri/src/print.rs); on the web it opens the browser's print
// dialog for the same finished pages. The last setup is kept in
// settings.print.
//
// For an html document with images: pass baseUrl (or absolute URLs). The
// preview resolves them through <base>; before a desktop print every image
// is fetched and inlined as a data: URL (the printer window reads the
// document from a temp file).
import React from 'react';
import { createRoot } from 'react-dom/client';
import { PrintDialog } from './PrintDialog';
import { highlightM } from './highlight';
import './print.css';

export { PRINT_DEFAULTS, normalizeSetup, parsePageRanges, buildPrintHtml, PAPERS } from './printdoc';
export { printActiveDocument, printFigure, printCommandWindow } from './sources';

let openNow = null;

export function isPrintDialogOpen() { return !!openNow; }

export function openPrintDialog(spec = {}) {
  if (openNow) return openNow;
  const s = { ...spec, kind: spec.kind || 'text' };
  if (s.kind === 'code' && !s.runs && (s.language === 'm' || /\.m$/i.test(s.title || ''))) s.runs = highlightM(s.text || '');
  if (typeof document === 'undefined') return Promise.resolve({ ok: false });
  const host = document.createElement('div');
  host.className = 'msp-host';
  document.body.appendChild(host);
  const root = createRoot(host);
  const prevFocus = document.activeElement;
  openNow = new Promise((resolve) => {
    const done = (r) => {
      openNow = null;
      setTimeout(() => { root.unmount(); host.remove(); if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch { /* gone */ } } }, 0);
      resolve(r || { ok: false });
    };
    root.render(React.createElement(PrintDialog, { spec: s, done }));
  });
  return openNow;
}
