/*
 * platform.js - 웹과 Electron 을 같은 얼굴로 감싼다.
 *
 * Electron 에서는 preload 가 심어 준 window.chunjiin 다리를 쓰고,
 * 브라우저에서는 File System Access API 를, 그것도 없으면
 * <input type="file"> 과 내려받기로 대신한다.
 */

const bridge = typeof window !== 'undefined' ? window.chunjiin : undefined;

export const isElectron = Boolean(bridge?.isElectron);

/* 어느 운영체제인지. 브라우저에서는 userAgent 로 짐작한다. */
export function platformName() {
  if (bridge?.platform) {
    return { win32: 'Windows', darwin: 'macOS', linux: 'Linux' }[bridge.platform] || bridge.platform;
  }
  const ua = navigator.userAgent;
  if (ua.includes('Mac')) return 'macOS';
  if (ua.includes('Win')) return 'Windows';
  if (ua.includes('Linux') || ua.includes('X11')) return 'Linux';
  return '웹';
}

/* Ctrl 대신 ⌘ 를 쓰는 자리인지 */
export const isMac = platformName() === 'macOS';

/* ------------------------------------------------------------------ */
/* 파일                                                                */
/* ------------------------------------------------------------------ */

const TXT_TYPES = [{ description: '텍스트 파일', accept: { 'text/plain': ['.txt'] } }];

/*
 * 텍스트 파일을 연다.
 * 성공하면 { text, name }, 사용자가 취소하면 null 을 돌려준다.
 */
export async function openTextFile() {
  if (isElectron) return bridge.openFile();

  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({ types: TXT_TYPES });
      const file = await handle.getFile();
      return { text: stripBom(await file.text()), name: file.name };
    } catch (e) {
      if (e?.name === 'AbortError') return null;
      throw e;
    }
  }

  /* 옛 브라우저: 숨은 file 입력으로 받는다 */
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,text/plain';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      resolve({ text: stripBom(await file.text()), name: file.name });
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/*
 * 텍스트를 UTF-8(BOM 포함) 파일로 저장한다.
 * 저장했으면 파일 이름, 취소하면 null.
 */
export async function saveTextFile(text, suggestedName = '무제.txt') {
  if (isElectron) return bridge.saveFile(text, suggestedName);

  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName, types: TXT_TYPES });
      const w = await handle.createWritable();
      await w.write(new Blob(['﻿', text], { type: 'text/plain;charset=utf-8' }));
      await w.close();
      return handle.name;
    } catch (e) {
      if (e?.name === 'AbortError') return null;
      throw e;
    }
  }

  /* 옛 브라우저: 내려받기로 대신한다 */
  const url = URL.createObjectURL(new Blob(['﻿', text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
  return suggestedName;
}

/* UTF-8 BOM 이 있으면 걷어낸다 (원본 열기와 같은 규칙) */
function stripBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/* ------------------------------------------------------------------ */
/* 클립보드                                                            */
/* ------------------------------------------------------------------ */

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* 권한이 없으면 옛 방식으로 한 번 더 해 본다 */
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export async function readClipboard() {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* 창 크기 조절 (Electron 전용)                                        */
/* ------------------------------------------------------------------ */

export function beginWindowResize() { bridge?.beginResize?.(); }
export function resizeWindowBy(dw, dh) { bridge?.resizeBy?.(dw, dh); }
export function endWindowResize() { bridge?.endResize?.(); }
