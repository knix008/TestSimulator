/** When an issue is created or moves, enabled rules may assign, set priority, add a label or a watcher. */
export function applyRules(project, event, issue) {
  for (const rule of project.rules || []) {
    if (rule.enabled === false) continue;
    if (rule.when === 'created' && event.kind !== 'created') continue;
    if (rule.when === 'transition' && (event.kind !== 'transition' || (rule.statusId && rule.statusId !== event.to))) continue;
    if (rule.typeId && rule.typeId !== issue.typeId) continue;
    if (rule.then === 'assign' && rule.userId) issue.assigneeId = rule.userId;
    if (rule.then === 'priority' && rule.priorityId) issue.priorityId = rule.priorityId;
    if (rule.then === 'label' && rule.label && !(issue.labels || []).includes(rule.label)) {
      issue.labels = [...(issue.labels || []), rule.label];
    }
    if (rule.then === 'watch' && rule.userId && !(issue.watchers || []).includes(rule.userId)) {
      issue.watchers = [...(issue.watchers || []), rule.userId];
    }
  }
}
