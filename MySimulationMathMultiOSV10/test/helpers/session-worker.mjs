// A session in a worker thread whose ctx.host.request blocks like the app's
// engine worker (src/engine/protocol.js): the main thread answers requests
// asynchronously (e.g. over the host API) while this thread waits.
//   workerData: { cwd, channel }   in: { code }   out: { type: 'request', id, msg } | { type: 'more', id } | { type: 'result', ok, error, output }
import { parentPort, workerData } from 'node:worker_threads';
import { createSession } from '../../core/session.js';
import { createNodeFs } from '../../core/fs-node.js';
import { readReply } from '../../src/engine/protocol.js';

const { cwd, channel } = workerData;
let seq = 0;
const out = [];
const session = createSession({
  fs: createNodeFs({ cwd }),
  print: (t) => out.push(t),
  host: {
    post() {},
    request(msg) {
      const id = ++seq;
      parentPort.postMessage({ type: 'request', id, msg });
      return readReply(channel, id, (rid) => parentPort.postMessage({ type: 'more', id: rid }));
    },
  },
});

parentPort.on('message', ({ code }) => {
  out.length = 0;
  let r;
  try { r = session.evaluate(code); } catch (e) { r = { ok: false, error: { message: e.message } }; }
  parentPort.postMessage({ type: 'result', ok: !!(r && r.ok), error: r && r.error ? String(r.error.message || r.error) : null, output: out.join('') });
});
