'use strict';

// Memory limit of an analysis (settings.memoryLimitGb). The default is large
// on purpose: three quarters of the physical memory, at least 8 GB. Large C/C++
// projects are parsed in batches anyway (core/cfront.js batches), so the limit
// mostly bounds the findings an analysis can hold.

const os = require('os');

const GB = 1024 * 1024 * 1024;

function totalGb() {
  return Math.round(os.totalmem() / GB);
}

function defaultLimitGb() {
  return Math.max(8, Math.floor((os.totalmem() / GB) * 0.75));
}

// Heap of the analysis worker in MB. MCC_WORKER_HEAP_MB overrides the setting.
function workerHeapMb(settings) {
  const env = Number(process.env.MCC_WORKER_HEAP_MB);
  if (env > 0) return Math.round(env);
  const gb = Number(settings && settings.memoryLimitGb);
  return Math.round((gb > 0 ? gb : defaultLimitGb()) * 1024);
}

module.exports = { totalGb, defaultLimitGb, workerHeapMb };
