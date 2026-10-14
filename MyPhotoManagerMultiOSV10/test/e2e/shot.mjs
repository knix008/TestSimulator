// Debug: run page expressions and take screenshots.
//   node test/e2e/shot.mjs <out dir> "<expression>" name.png ["<expression>" name.png …]
import { App } from './harness.mjs';

const [out, ...steps] = process.argv.slice(2);
const app = new App();
await app.start();
for (let i = 0; i < steps.length; i += 2) {
  await app.main.eval(`(async () => { ${steps[i]}; return 1; })()`);
  await new Promise((r) => setTimeout(r, 700));
  await app.main.screenshot(`${out}/${steps[i + 1]}`);
}
await app.stop();
