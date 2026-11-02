/**
 * What a tab's view was showing, kept while another tab is in front.
 *
 * The workspace mounts one view — the active tab's — and keys it by the tab, so
 * switching tabs (or bringing Start forward) unmounts it. The comparison itself
 * lives in the tab and survives that; this keeps the rest: which folders were open,
 * where the list was scrolled, the rows already fetched, the pictures already
 * diffed. A view coming back reads its state from here instead of asking the
 * server for it again, which is what made a plain tab click look like a re-run.
 *
 * One mutable record per tab and view kind. Views write to it from effects and
 * event handlers; it is dropped when the tab closes.
 */
const tabs = new Map<string, Map<string, object>>();

/** The record for this tab's view of `part`, made with `create` the first time. */
export function viewState<T extends object>(tabId: string, part: string, create: () => T): T {
  let parts = tabs.get(tabId);
  if (!parts) {
    parts = new Map();
    tabs.set(tabId, parts);
  }
  let state = parts.get(part) as T | undefined;
  if (!state) {
    state = create();
    parts.set(part, state);
  }
  return state;
}

/** Drops everything kept for a tab; called when the tab closes. */
export function forgetViewState(tabId: string): void {
  tabs.delete(tabId);
}
