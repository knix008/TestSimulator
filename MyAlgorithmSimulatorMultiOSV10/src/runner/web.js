// Runs a JavaScript sample in a Web Worker so a long loop cannot freeze the page.
// The sample is a Node-style script: `const fs = require('fs')` and
// `fs.readFileSync(0, 'utf8')` returns the algorithm input.
const WORKER = `
self.onmessage = (event) => {
  const input = event.data;
  const fs = { readFileSync: () => input };
  const require = (name) => (name === 'fs' ? fs : {});
  let out = '';
  const console = { log: (...args) => { out += args.join(' ') + '\\n'; } };
  try {
    (new Function('require', 'console', 'input', event.code))(require, console, input);
    self.postMessage({ ok: true, stdout: out, stderr: '' });
  } catch (error) {
    self.postMessage({ ok: false, stdout: out, stderr: String(error && error.stack || error) });
  }
};
`;

/** @returns {{ ok: boolean, stdout: string, stderr: string }} */
export function runJavaScript(code, input, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const source = WORKER.replace('event.code', JSON.stringify(code));
    const worker = new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
    const timer = setTimeout(() => { worker.terminate(); resolve({ ok: false, stdout: '', stderr: 'Time limit exceeded (5s)' }); }, timeoutMs);
    worker.onmessage = (event) => { clearTimeout(timer); worker.terminate(); resolve(event.data); };
    worker.onerror = (event) => { clearTimeout(timer); worker.terminate(); resolve({ ok: false, stdout: '', stderr: event.message }); };
    worker.postMessage(input);
  });
}
