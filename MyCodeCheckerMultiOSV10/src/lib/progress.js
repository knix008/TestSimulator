// Work that takes a while (loading a large project, building a report …)
// shows a progress popup (components/ProgressHost.jsx) once it has run for a
// moment. track(label) -> { update(done, total), end() }; several at once
// show as one list.
let seq = 0;
const tasks = new Map();
const subs = new Set();
const emit = () => { const list = [...tasks.values()]; for (const fn of subs) fn(list); };

export function track(label, { total = 0 } = {}) {
  const id = ++seq;
  tasks.set(id, { id, label, done: 0, total, started: Date.now() });
  emit();
  return {
    update(done, t) { const x = tasks.get(id); if (!x) return; tasks.set(id, { ...x, done, total: t ?? x.total }); emit(); },
    end() { if (tasks.delete(id)) emit(); },
  };
}

export function subscribe(fn) {
  subs.add(fn);
  fn([...tasks.values()]);
  return () => subs.delete(fn);
}
