// The flow study off the main window's thread: the cavity, filling and packing run here, progress goes back
// as messages, and the window ends the worker to cancel (cad/plastics-post.js runMouldingStudy: the fill, then
// fibers, cooling and warpage as the study asks).
import { runMouldingStudy } from '../cad/plastics-post.js';

self.onmessage = (event) => {
  runMouldingStudy(event.data, (message) => self.postMessage(message));
};
