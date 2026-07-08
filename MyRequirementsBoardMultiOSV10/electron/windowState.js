import path from 'node:path';
import fs from 'node:fs/promises';
import { app } from 'electron';
import {
  UI_MIN_HEIGHT,
  UI_HEADER_MIN_WIDTH_FALLBACK,
  UI_DEFAULT_WINDOW_WIDTH,
  UI_DEFAULT_WINDOW_HEIGHT,
} from '../config/ui-layout.mjs';

function getStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

export async function loadWindowState() {
  try {
    const raw = await fs.readFile(getStatePath(), 'utf8');
    const data = JSON.parse(raw);
    const minWidth = data.minSizeLocked
      ? Math.max(Number(data.minWidth) || UI_HEADER_MIN_WIDTH_FALLBACK, UI_HEADER_MIN_WIDTH_FALLBACK)
      : UI_HEADER_MIN_WIDTH_FALLBACK;
    const minHeight = data.minSizeLocked
      ? Math.max(Number(data.minHeight) || UI_MIN_HEIGHT, UI_MIN_HEIGHT)
      : UI_MIN_HEIGHT;
    const width = Math.max(Number(data.width) || UI_DEFAULT_WINDOW_WIDTH, minWidth);
    const height = Math.max(Number(data.height) || UI_DEFAULT_WINDOW_HEIGHT, minHeight);
    return { width, height, minWidth, minHeight, minSizeLocked: Boolean(data.minSizeLocked) };
  } catch {
    return null;
  }
}

export async function saveWindowState({ width, height, minWidth, minHeight, minSizeLocked }) {
  const nextMinWidth = Math.max(Number(minWidth) || UI_HEADER_MIN_WIDTH_FALLBACK, UI_HEADER_MIN_WIDTH_FALLBACK);
  const nextMinHeight = Math.max(Number(minHeight) || UI_MIN_HEIGHT, UI_MIN_HEIGHT);
  const nextWidth = Math.max(Number(width) || nextMinWidth, nextMinWidth);
  const nextHeight = Math.max(Number(height) || nextMinHeight, nextMinHeight);

  let locked = minSizeLocked;
  if (locked === undefined) {
    try {
      const raw = await fs.readFile(getStatePath(), 'utf8');
      locked = Boolean(JSON.parse(raw).minSizeLocked);
    } catch {
      locked = false;
    }
  }

  const payload = {
    width: nextWidth,
    height: nextHeight,
    minWidth: nextMinWidth,
    minHeight: nextMinHeight,
    ...(locked ? { minSizeLocked: true } : {}),
  };
  await fs.writeFile(getStatePath(), JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}
