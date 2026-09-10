// Analysis worker.
//
// Files arrive in batches (so a large project never has to be materialized in
// one message), then `run` performs the analysis and posts the result back.
// Doing this off the main thread is what keeps the UI responsive — and the
// worker holds the only copy of the source text, which is released as soon as
// the analysis finishes.

import { analyze } from '../core/analyze.js';

let files = [];
let cancelToken = { cancelled: false };

self.onmessage = (event) => {
  const message = event.data || {};

  switch (message.type) {
    case 'reset':
      files = [];
      cancelToken = { cancelled: false };
      self.postMessage({ type: 'reset:done' });
      break;

    case 'addFiles':
      for (const file of message.files) files.push(file);
      self.postMessage({ type: 'addFiles:done', count: files.length });
      break;

    case 'cancel':
      cancelToken.cancelled = true;
      break;

    case 'run':
      try {
        cancelToken = { cancelled: false };
        const result = analyze(files, message.settings, {
          gitChurn: message.gitChurn || null,
          signal: cancelToken,
          onProgress: (progress) => self.postMessage({ type: 'progress', progress }),
        });

        if (!result) {
          self.postMessage({ type: 'cancelled' });
        } else {
          self.postMessage({ type: 'result', result });
        }
      } catch (error) {
        self.postMessage({
          type: 'error',
          message: (error && error.message) || String(error),
          stack: error && error.stack,
        });
      } finally {
        // The source text is the bulk of the memory footprint; drop it as soon
        // as the run is over rather than holding it until the next reset.
        files = [];
      }
      break;

    default:
      break;
  }
};
