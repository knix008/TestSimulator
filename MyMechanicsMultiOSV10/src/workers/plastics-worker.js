// The flow study off the main window's thread: the cavity, filling and packing run here, progress goes back
// as messages, and the window ends the worker to cancel (cad/plastics.js runStudy).
import { runStudy } from '../cad/plastics.js';

self.onmessage = (event) => {
  runStudy(event.data, (message) => self.postMessage(message));
};
