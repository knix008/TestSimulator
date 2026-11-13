// A data folder with real voice models for tests and screenshots — always a COPY.
//
//   TTS_TEST_APPDATA=<dir>   use this folder (it must hold TTSMultiOSV10/models/<model>)
//   otherwise                %TEMP%/tts-multios-test-data, filled once by copying the models
//                            installed in %APPDATA%\TTSMultiOSV10\models (only read from there)
//
// The real %APPDATA%\TTSMultiOSV10 is never written: the program under test gets the copy
// through TTS_CONFIG_DIR / APPDATA.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DATA = 'TTSMultiOSV10';

export function installedModels(dir) {
  const models = path.join(dir, DATA, 'models');
  if (!fs.existsSync(models)) return [];
  return fs.readdirSync(models, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.readdirSync(path.join(models, e.name)).length > 0)
    .map((e) => e.name);
}

/** { dir, models, source } — dir is null when no models are available anywhere. */
export function ensureTestData() {
  if (process.env.TTS_TEST_APPDATA) {
    const dir = path.resolve(process.env.TTS_TEST_APPDATA);
    return { dir, models: installedModels(dir), source: 'TTS_TEST_APPDATA' };
  }
  const dir = path.join(os.tmpdir(), 'tts-multios-test-data');
  const real = process.env.APPDATA ? path.join(process.env.APPDATA, DATA, 'models') : null;
  if (real && path.resolve(dir).startsWith(path.resolve(process.env.APPDATA))) throw new Error('test data must not live in %APPDATA%');
  if (real && fs.existsSync(real)) {
    for (const name of fs.readdirSync(real)) {
      const from = path.join(real, name);
      const to = path.join(dir, DATA, 'models', name);
      if (!fs.statSync(from).isDirectory() || fs.existsSync(path.join(to, '.copied'))) continue;
      fs.rmSync(to, { recursive: true, force: true });
      fs.cpSync(from, to, { recursive: true });
      fs.writeFileSync(path.join(to, '.copied'), new Date().toISOString());
    }
  }
  const models = installedModels(dir);
  return { dir: models.length ? dir : null, models, source: models.length ? 'copy of %APPDATA% models' : 'none' };
}

/** An empty scratch folder (removed by the caller). */
export function scratch(prefix = 'tts-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
