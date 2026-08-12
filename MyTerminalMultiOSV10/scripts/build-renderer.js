const esbuild = require('esbuild');
const path = require('path');

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: [path.join(__dirname, '../src/renderer/js/app.js')],
  bundle: true,
  outfile: path.join(__dirname, '../src/renderer/js/app.bundle.js'),
  format: 'iife',
  platform: 'browser',
  target: ['chrome120'],
  sourcemap: true,
  logLevel: 'info',
};

async function run() {
  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log('Watching renderer bundle...');
  } else {
    await esbuild.build(options);
    console.log('Renderer bundle built.');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
