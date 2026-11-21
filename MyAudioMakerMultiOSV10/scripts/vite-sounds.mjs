// Vite plugin: the bundled sound library (sounds/, built by `npm run sounds`) next to the page.
//   dev server — the project's sounds/ is served as /sounds/ (Vite serves files under the root as they are).
//   web build  — sounds/ is copied to dist/sounds/.
//   desktop    — `tauri build` runs the web build with TAURI_ENV_PLATFORM set: nothing is copied (the program
//                installs sounds/ as a resource, src-tauri/tauri.conf.json bundle.resources, instead of embedding
//                150 MB in the executable). MYAUDIOMAKER_NO_SOUNDS=1 skips the copy too (quick test builds).
import { cpSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function soundsPlugin() {
  let outDir = 'dist';
  let root = process.cwd();
  return {
    name: 'myaudiomaker-sounds',
    apply: 'build',
    configResolved(config) { root = config.root; outDir = resolve(config.root, config.build.outDir); },
    closeBundle() {
      if (process.env.TAURI_ENV_PLATFORM || process.env.MYAUDIOMAKER_NO_SOUNDS) return;
      const from = join(root, 'sounds');
      if (!existsSync(join(from, 'manifest.json'))) { this.warn('sounds/ is missing (npm run sounds): the web build plays the synthesizer only'); return; }
      cpSync(from, join(outDir, 'sounds'), { recursive: true });
    },
  };
}
