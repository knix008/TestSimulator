import path from 'node:path';
import fs from 'node:fs/promises';
import { app } from 'electron';
import { UI_MIN_HEIGHT } from '../config/ui-layout.mjs';

const ABSOLUTE_MIN_WIDTH = 640;

function getStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

export async function loadWindowState() {
  try {
    const raw = await fs.readFile(getStatePath(), 'utf8');
    const data = JSON.parse(raw);
    const minWidth = Math.max(Number(data.minWidth) || 0, ABSOLUTE_MIN_WIDTH);
    const width = Math.max(Number(data.width) || minWidth, minWidth);
    const height = Math.max(Number(data.height) || 0, UI_MIN_HEIGHT);
    return { width, height, minWidth };
  } catch {
    return null;
  }
}

export async function saveWindowState({ width, height, minWidth }) {
  const nextMinWidth = Math.max(Number(minWidth) || 0, ABSOLUTE_MIN_WIDTH);
  const nextWidth = Math.max(Number(width) || nextMinWidth, nextMinWidth);
  const nextHeight = Math.max(Number(height) || 0, UI_MIN_HEIGHT);
  const payload = {
    width: nextWidth,
    height: nextHeight,
    minWidth: nextMinWidth,
  };
  await fs.writeFile(getStatePath(), JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}
