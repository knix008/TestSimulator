import type { ContextMenuEntry, ContextMenuItemDef } from '../components/ContextMenu';
import { DEPENDENCY_TYPE_OPTIONS } from '../config/ganttViewSettings';
import type { ToolbarIconName } from '../components/ToolbarIcons';
import type { TranslateFn } from '../i18n/types';
import type { KoTranslationKey } from '../i18n/locales/ko';
import { localizedLineEndOptions } from '../i18n/options';
import type { DependencyItem, GanttViewSettings, NoteItem, TaskItem } from '../types/project';
import {
  resolveContextDependencyTarget,
  resolveContextDependencyType,
  resolveDependencyEndLineEnd,
  resolveDependencyStartLineEnd,
} from './scheduleUtils';
import {
  canIndentTask,
  canOutdentTask,
  taskHasChildren,
} from './taskModel';

export type DependencyTypeValue = GanttViewSettings['defaultDependencyType'];

export type ProjectContextMenuTarget =
  | { kind: 'gantt-task'; taskId: number }
  | { kind: 'gantt-note'; noteId: number }
  | { kind: 'gantt-dependency'; predecessorId: number; successorId: number }
  | { kind: 'gantt-empty' }
  | { kind: 'gantt-header' }
  | { kind: 'task-grid-task'; taskId: number }
  | { kind: 'task-grid-empty' }
  | { kind: 'task-grid-header' };

export interface DependencyTypeSelection {
  taskId?: number;
  predecessorId?: number;
  successorId?: number;
}

export interface ProjectContextMenuActions {
  openTaskProperties: (taskId: number) => void;
  addTask: () => void;
  addSubtask: (parentTaskId: number) => void;
  deleteTask: (taskId: number) => void;
  indentTask: (taskId: number) => void;
  outdentTask: (taskId: number) => void;
  linkFromTask: (taskId: number) => void;
  unlinkFromTask: (taskId: number) => void;
  toggleExpandTask: (taskId: number) => void;
  setDependencyType: (type: DependencyTypeValue, selection: DependencyTypeSelection) => void;
  setDependencyLineEnd: (
    which: 'start' | 'end',
    style: GanttViewSettings['startLineEnd'],
    predecessorId: number,
    successorId: number,
  ) => void;
  removeDependency: (predecessorId: number, successorId: number) => void;
  goToToday: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  addNoteToTask: (taskId: number) => void;
  editNote: (noteId: number) => void;
  deleteNote: (noteId: number) => void;
  selectTask: (taskId: number) => void;
}

interface BuildProjectContextMenuOptions {
  target: ProjectContextMenuTarget;
  tasks: TaskItem[];
  dependencies: DependencyItem[];
  ganttNotes: NoteItem[];
  ganttViewSettings: GanttViewSettings;
  linkSourceTaskId: number | null;
  selectedDependency: { predecessorId: number; successorId: number } | null;
  canModify: boolean;
  actions: ProjectContextMenuActions;
  t: TranslateFn;
}

const DEPENDENCY_TYPE_ICONS: Record<DependencyTypeValue, ToolbarIconName> = {
  FS: 'depFs',
  FF: 'depFf',
  SS: 'depSs',
  SF: 'depSf',
};

function item(
  id: string,
  label: string,
  icon: ToolbarIconName,
  onClick: () => void,
  options?: Pick<ContextMenuItemDef, 'disabled' | 'checked' | 'dependencyTypePreview' | 'lineEndPreview'>,
): ContextMenuItemDef {
  return { id, label, icon, onClick, ...options };
}

function dependencyTypeMenuItems(
  currentType: string,
  onSelect: (type: DependencyTypeValue) => void,
  t: TranslateFn,
): ContextMenuEntry[] {
  return [
    { type: 'separator' },
    item('dep-type-heading', t('context.depTypeHeading'), 'link', () => {}, { disabled: true }),
    ...DEPENDENCY_TYPE_OPTIONS.map((option) =>
      item(
        `dep-type-${option.value}`,
        t(`depType.${option.value}` as KoTranslationKey),
        DEPENDENCY_TYPE_ICONS[option.value],
        () => onSelect(option.value),
        {
          checked: currentType === option.value,
          dependencyTypePreview: option.value,
        },
      ),
    ),
  ];
}

function lineEndMenuItems(
  headingId: string,
  headingLabel: string,
  currentStyle: GanttViewSettings['startLineEnd'],
  atStart: boolean,
  onSelect: (style: GanttViewSettings['startLineEnd']) => void,
  t: TranslateFn,
): ContextMenuEntry[] {
  return [
    item(headingId, headingLabel, 'link', () => {}, { disabled: true }),
    ...localizedLineEndOptions(t).map((option) =>
      item(
        `${headingId}-${option.value}`,
        option.label,
        'link',
        () => onSelect(option.value),
        {
          checked: currentStyle === option.value,
          lineEndPreview: { style: option.value, atStart },
        },
      ),
    ),
  ];
}

function dependencyLineMenuItems(
  predecessorId: number,
  successorId: number,
  dependencies: DependencyItem[],
  ganttViewSettings: GanttViewSettings,
  canModify: boolean,
  actions: ProjectContextMenuActions,
  t: TranslateFn,
): ContextMenuEntry[] {
  const dep = dependencies.find(
    (entry) => entry.predecessorId === predecessorId && entry.successorId === successorId,
  );
  if (!dep) return [];

  const items: ContextMenuEntry[] = [];

  if (canModify) {
    items.push(
      ...dependencyTypeMenuItems(dep.type || 'FS', (type) =>
        actions.setDependencyType(type, { predecessorId, successorId }),
      t),
      { type: 'separator' },
      ...lineEndMenuItems(
        'dep-start-line-end',
        t('context.lineStart'),
        resolveDependencyStartLineEnd(dep, ganttViewSettings),
        true,
        (style) => actions.setDependencyLineEnd('start', style, predecessorId, successorId),
        t,
      ),
      { type: 'separator' },
      ...lineEndMenuItems(
        'dep-end-line-end',
        t('context.lineEnd'),
        resolveDependencyEndLineEnd(dep, ganttViewSettings),
        false,
        (style) => actions.setDependencyLineEnd('end', style, predecessorId, successorId),
        t,
      ),
      { type: 'separator' },
      item('remove-dependency', t('context.removeDependency'), 'unlink', () =>
        actions.removeDependency(predecessorId, successorId),
      ),
    );
  }

  return items;
}

function taskLineEndMenuItems(
  taskId: number,
  dependencies: DependencyItem[],
  ganttViewSettings: GanttViewSettings,
  linkSourceTaskId: number | null,
  selectedDependency: { predecessorId: number; successorId: number } | null,
  actions: ProjectContextMenuActions,
  t: TranslateFn,
): ContextMenuEntry[] {
  const target = resolveContextDependencyTarget(
    dependencies,
    taskId,
    linkSourceTaskId,
    selectedDependency,
  );
  if (!target) return [];

  const dep = dependencies.find(
    (entry) =>
      entry.predecessorId === target.predecessorId && entry.successorId === target.successorId,
  );
  if (!dep) return [];

  const { predecessorId, successorId } = target;
  return [
    { type: 'separator' },
    ...lineEndMenuItems(
      'dep-start-line-end',
      t('context.lineStart'),
      resolveDependencyStartLineEnd(dep, ganttViewSettings),
      true,
      (style) => actions.setDependencyLineEnd('start', style, predecessorId, successorId),
      t,
    ),
    { type: 'separator' },
    ...lineEndMenuItems(
      'dep-end-line-end',
      t('context.lineEnd'),
      resolveDependencyEndLineEnd(dep, ganttViewSettings),
      false,
      (style) => actions.setDependencyLineEnd('end', style, predecessorId, successorId),
      t,
    ),
  ];
}

function taskMenuItems(
  taskId: number,
  tasks: TaskItem[],
  dependencies: DependencyItem[],
  ganttViewSettings: GanttViewSettings,
  linkSourceTaskId: number | null,
  selectedDependency: { predecessorId: number; successorId: number } | null,
  canModify: boolean,
  actions: ProjectContextMenuActions,
  includeGoToToday: boolean,
  t: TranslateFn,
  addTaskAsSubtask = false,
): ContextMenuEntry[] {
  const task = tasks.find((entry) => entry.taskId === taskId);
  if (!task) return [];

  const items: ContextMenuEntry[] = [
    item('properties', t('context.properties'), 'settings', () => actions.openTaskProperties(taskId)),
  ];

  if (canModify) {
    items.push(
      { type: 'separator' },
      item(
        'add-task',
        t('context.addTask'),
        'addTask',
        addTaskAsSubtask ? () => actions.addSubtask(taskId) : actions.addTask,
      ),
      item('add-subtask', t('context.addSubtask'), 'addSubtask', () => actions.addSubtask(taskId)),
      item('add-note', t('context.addNote'), 'addNote', () => actions.addNoteToTask(taskId)),
      item('delete-task', t('context.deleteTask'), 'deleteTask', () => actions.deleteTask(taskId)),
      { type: 'separator' },
      item('indent', t('context.indent'), 'indent', () => actions.indentTask(taskId), {
        disabled: !canIndentTask(tasks, taskId),
      }),
      item('outdent', t('context.outdent'), 'outdent', () => actions.outdentTask(taskId), {
        disabled: !canOutdentTask(tasks, taskId),
      }),
      item('link', t('context.link'), 'link', () => actions.linkFromTask(taskId)),
      item('unlink', t('context.unlink'), 'unlink', () => actions.unlinkFromTask(taskId)),
    );

    const currentType = resolveContextDependencyType(
      dependencies,
      taskId,
      linkSourceTaskId,
      ganttViewSettings.defaultDependencyType,
      selectedDependency,
    );
    items.push(
      ...dependencyTypeMenuItems(currentType, (type) =>
        actions.setDependencyType(type, { taskId }),
      t),
      ...taskLineEndMenuItems(
        taskId,
        dependencies,
        ganttViewSettings,
        linkSourceTaskId,
        selectedDependency,
        actions,
        t,
      ),
    );

    if (taskHasChildren(tasks, taskId)) {
      items.push(
        { type: 'separator' },
        item(
          'toggle-expand',
          task.isExpanded ? t('context.collapse') : t('context.expand'),
          task.isExpanded ? 'collapse' : 'expand',
          () => actions.toggleExpandTask(taskId),
        ),
      );
    }
  }

  if (includeGoToToday) {
    items.push(
      { type: 'separator' },
      item('go-today', t('context.goToToday'), 'today', actions.goToToday),
    );
  }

  return items;
}

function noteMenuItems(
  noteId: number,
  ganttNotes: NoteItem[],
  canModify: boolean,
  actions: ProjectContextMenuActions,
  t: TranslateFn,
): ContextMenuEntry[] {
  const note = ganttNotes.find((entry) => entry.noteId === noteId);
  if (!note) return [];

  const items: ContextMenuEntry[] = [
    item('edit-note', t('context.editNote'), 'settings', () => actions.editNote(noteId)),
  ];

  if (canModify) {
    items.push(item('delete-note', t('context.deleteNote'), 'deleteTask', () => actions.deleteNote(noteId)));
  }

  if (note.taskId >= 0) {
    items.push(
      { type: 'separator' },
      item('select-linked-task', t('context.selectLinkedTask'), 'addTask', () =>
        actions.selectTask(note.taskId),
      ),
    );
  }

  return items;
}

function emptyOrHeaderMenuItems(
  canModify: boolean,
  actions: ProjectContextMenuActions,
  headerOnly: boolean,
  t: TranslateFn,
): ContextMenuEntry[] {
  const items: ContextMenuEntry[] = [];

  if (canModify && !headerOnly) {
    items.push(item('add-task', t('context.addTask'), 'addTask', actions.addTask));
    items.push({ type: 'separator' });
  }

  items.push(
    item('zoom-in', t('context.zoomIn'), 'zoomIn', actions.zoomIn),
    item('zoom-out', t('context.zoomOut'), 'zoomOut', actions.zoomOut),
    item('go-today', t('context.goToToday'), 'today', actions.goToToday),
  );

  return items;
}

export function buildProjectContextMenu({
  target,
  tasks,
  dependencies,
  ganttNotes,
  ganttViewSettings,
  linkSourceTaskId,
  selectedDependency,
  canModify,
  actions,
  t,
}: BuildProjectContextMenuOptions): ContextMenuEntry[] {
  switch (target.kind) {
    case 'gantt-note':
      return noteMenuItems(target.noteId, ganttNotes, canModify, actions, t);
    case 'gantt-dependency':
      return dependencyLineMenuItems(
        target.predecessorId,
        target.successorId,
        dependencies,
        ganttViewSettings,
        canModify,
        actions,
        t,
      );
    case 'gantt-task':
      return taskMenuItems(
        target.taskId,
        tasks,
        dependencies,
        ganttViewSettings,
        linkSourceTaskId,
        selectedDependency,
        canModify,
        actions,
        true,
        t,
        true,
      );
    case 'task-grid-task':
      return taskMenuItems(
        target.taskId,
        tasks,
        dependencies,
        ganttViewSettings,
        linkSourceTaskId,
        selectedDependency,
        canModify,
        actions,
        false,
        t,
      );
    case 'gantt-empty':
      return emptyOrHeaderMenuItems(canModify, actions, false, t);
    case 'gantt-header':
      return emptyOrHeaderMenuItems(canModify, actions, true, t);
    case 'task-grid-empty':
      return emptyOrHeaderMenuItems(canModify, actions, false, t);
    case 'task-grid-header':
      return [
        ...(canModify
          ? [
              item('add-task', t('context.addTask'), 'addTask', actions.addTask),
              { type: 'separator' } satisfies ContextMenuEntry,
            ]
          : []),
        item('go-today', t('context.goToToday'), 'today', actions.goToToday),
      ];
    default:
      return [];
  }
}
