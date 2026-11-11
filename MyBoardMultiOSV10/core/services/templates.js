// Project templates (ARCHITECTURE §3.1): statuses, issue types, workflow and the default board.
// Text is English; the sample generator passes its own names when it wants Korean.

export const CATEGORY_COLOR = { todo: '#6b7685', inprogress: '#1c7ed6', done: '#2b8a3e' };

export const ISSUE_TYPES = {
  epic: { name: 'Epic', icon: 'b:epic', color: '#7e4fd8', level: -1 },
  story: { name: 'Story', icon: 'b:story', color: '#3fa34d', level: 0 },
  task: { name: 'Task', icon: 'b:task', color: '#2f8fdd', level: 0 },
  bug: { name: 'Bug', icon: 'b:bug', color: '#e03e2d', level: 0 },
  improvement: { name: 'Improvement', icon: 'b:rocket', color: '#0ca678', level: 0 },
  subtask: { name: 'Subtask', icon: 'b:subtask', color: '#4c9ee8', level: 1 },
};

/**
 * statuses: [name, category]; columns: [name, [status indexes], { backlog?, wipMax?, wipMin? }];
 * transitions: null = "any status to any status" (one global transition per status), else [name, fromIdx|null, toIdx]
 */
export const TEMPLATES = {
  kanban: {
    statuses: [['Backlog', 'todo'], ['Selected for Development', 'todo'], ['In Progress', 'inprogress'], ['Done', 'done']],
    types: ['epic', 'story', 'task', 'bug', 'subtask'],
    columns: [['Backlog', [0], { backlog: true }], ['Selected for Development', [1]], ['In Progress', [2], { wipMax: 5 }], ['Done', [3]]],
    transitions: null,
  },
  software: {
    statuses: [['Backlog', 'todo'], ['To Do', 'todo'], ['In Progress', 'inprogress'], ['In Review', 'inprogress'], ['Done', 'done']],
    types: ['epic', 'story', 'task', 'bug', 'subtask'],
    columns: [['Backlog', [0], { backlog: true }], ['To Do', [1]], ['In Progress', [2], { wipMax: 4 }], ['In Review', [3], { wipMax: 3 }], ['Done', [4]]],
    transitions: null,
  },
  bugs: {
    statuses: [['Open', 'todo'], ['In Progress', 'inprogress'], ['Resolved', 'done'], ['Closed', 'done']],
    types: ['bug', 'improvement', 'task', 'subtask'],
    columns: [['Open', [0]], ['In Progress', [1], { wipMax: 6 }], ['Resolved', [2]], ['Closed', [3]]],
    transitions: [
      ['Start progress', 0, 1], ['Stop progress', 1, 0], ['Resolve', 0, 2], ['Resolve', 1, 2],
      ['Close', 2, 3], ['Reopen', 2, 0], ['Reopen', 3, 0],
    ],
  },
  simple: {
    statuses: [['To Do', 'todo'], ['Doing', 'inprogress'], ['Done', 'done']],
    types: ['task', 'subtask'],
    columns: [['To Do', [0]], ['Doing', [1]], ['Done', [2]]],
    transitions: null,
  },
};

/** Default board settings (§3.2). */
export function defaultBoardSettings(backlogStatusIds = []) {
  return {
    backlog: { enabled: backlogStatusIds.length > 0, statusIds: backlogStatusIds },
    swimlanes: 'none',
    cardColors: 'type',
    cardFields: ['priority', 'storyPoints', 'dueDate'],
    estimation: 'storyPoints',
    workingDays: [1, 2, 3, 4, 5],
    doneHideDays: 14,
    subtasks: 'cards',
    columnConstraint: 'issueCount',
  };
}
