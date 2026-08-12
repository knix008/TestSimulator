const esbuild = require('esbuild');
const path = require('path');

const watch = process.argv.includes('--watch');

const shared = {
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120'],
  sourcemap: true,
  logLevel: 'info',
};

const builds = [
  {
    ...shared,
    entryPoints: [path.join(__dirname, '../src/renderer/js/app.js')],
    outfile: path.join(__dirname, '../src/renderer/js/app.bundle.js'),
  },
  {
    ...shared,
    entryPoints: [path.join(__dirname, '../src/renderer/js/popup-app.js')],
    outfile: path.join(__dirname, '../src/renderer/js/popup.bundle.js'),
  },
];

async function run() {
  if (watch) {
    const contexts = await Promise.all(builds.map((opts) => esbuild.context(opts)));
    await Promise.all(contexts.map((ctx) => ctx.watch()));
    console.log('Watching renderer bundles (app + popup)...');
  } else {
    await Promise.all(builds.map((opts) => esbuild.build(opts)));
    console.log('Renderer bundles built (app + popup).');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
