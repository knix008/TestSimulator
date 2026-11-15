const emit = process.emit;
process.emit = function emitFiltered(event, warning, ...rest) {
  if (event === 'warning' && warning?.name === 'ExperimentalWarning' && String(warning.message || '').includes('SQLite')) return false;
  return emit.call(this, event, warning, ...rest);
};
