// Helpers for the sample plans of the start page.
//
// A sample is
//   { id, group, icon, ko: [name, description], en: [name, description], spec, started? }
// where `spec` is a plan spec exactly like the templates' (src/domain/templates.js:
// title, resources, tasks rows [outlineLevel, key, T(ko, en), duration, options]) and
// `started: n` makes the plan already under way: started n weeks ago with a baseline
// and progress up to today (otherwise it starts on the Monday after today).
export const T = (ko, en) => ({ ko, en });
