// In-page dialog bus: the web fallback for dialog windows.
//
// Mirrors the Electron dialog-window API (open / update / submit / close and
// the result & closed events) so the rest of the app does not care whether a
// dialog is a separate OS window or a modal layer rendered by App.jsx.

const listeners = { change: new Set(), result: new Set(), closed: new Set() };
const open = new Map();   // name -> payload

function emit(kind, data) { for (const cb of listeners[kind]) cb(data); }

export const dialogBus = {
  open(name, payload) {
    open.set(name, payload);
    emit('change', this.list());
    return Promise.resolve(true);
  },
  update(name, payload) {
    if (!open.has(name)) return Promise.resolve(false);
    open.set(name, payload);
    emit('change', this.list());
    return Promise.resolve(true);
  },
  submit(name, data, keepOpen) {
    emit('result', { name, data });
    if (!keepOpen) { open.delete(name); emit('change', this.list()); emit('closed', { name }); }
    return Promise.resolve(true);
  },
  close(name) {
    if (open.has(name)) {
      open.delete(name);
      emit('result', { name, data: null });
      emit('change', this.list());
      emit('closed', { name });
    }
    return Promise.resolve(true);
  },
  isOpen: (name) => open.has(name),
  list: () => Array.from(open, ([name, payload]) => ({ name, payload })),
  onChange: (cb) => { listeners.change.add(cb); return () => listeners.change.delete(cb); },
  onResult: (cb) => { listeners.result.add(cb); return () => listeners.result.delete(cb); },
  onClosed: (cb) => { listeners.closed.add(cb); return () => listeners.closed.delete(cb); },
};
