// Debug: start the app, evaluate expressions in the main page, print the results.
//   node test/e2e/probe.mjs "<expression>" ["<expression>" …]
import { App } from './harness.mjs';

const app = new App();
await app.start();
for (const expression of process.argv.slice(2)) {
  try {
    console.log(JSON.stringify(await app.main.eval(`(async () => (${expression}))()`, 60000)));
  } catch (error) {
    console.log(`error: ${error.message}`);
  }
  await new Promise((r) => setTimeout(r, 800));
}
await app.stop();
