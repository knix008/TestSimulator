import type { ContextMenuEntry, ContextMenuItemDef } from '../components/ContextMenu';
import { DEPENDENCY_TYPE_OPTIONS } from '../config/ganttViewSettings';
import type { ToolbarIconName } from '../components/ToolbarIcons';
import type { DependencyItem, GanttViewSettings, TaskItem } from '../types/project';
import { resolveContextDependencyType } from './scheduleUtils';
import {
  canIndentTask,
  canOutdentTask,
  taskHasChildren,
} from './taskModel';

export type DependencyTypeValue = GanttViewSettings['defaultDependencyType'];

export type ProjectContextMenuTarget =
  | { kind: 'gantt-task'; taskId: number }
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
  removeDependency: (predecessorId: number, successorId: number) => void;
  goToToday: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

interface BuildProjectContextMenuOptions {
  target: ProjectContextMenuTarget;
  tasks: TaskItem[];
  dependencies: DependencyItem[];
  ganttViewSettings: GanttViewSettings;
  linkSourceTaskId: number | null;
  canModify: boolean;
  actions: ProjectContextMenuActions;
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
  options?: Pick<ContextMenuItemDef, 'disabled' | 'checked' | 'dependencyTypePreview'>,
): ContextMenuItemDef {
  return { id, label, icon, onClick, ...options };
}

function dependencyTypeMenuItems(
  currentType: string,
  onSelect: (type: DependencyTypeValue) => void,
): ContextMenuEntry[] {
  return [
    { type: 'separator' },
    item('dep-type-heading', '의존성 종류', 'link', () => {}, { disabled: true }),
    ...DEPENDENCY_TYPE_OPTIONS.map((option) =>
      item(
        `dep-type-${option.value}`,
        option.label,
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

function dependencyLineMenuItems(
  predecessorId: number,
  successorId: number,
  dependencies: DependencyItem[],
  canModify: boolean,
  actions: ProjectContextMenuActions,
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
      ),
      { type: 'separator' },
      item('remove-dependency', '의존성 제거', 'unlink', () =>
        actions.removeDependency(predecessorId, successorId),
      ),
    );
  }

  return items;
}

function taskMenuItems(
  taskId: number,
  tasks: TaskItem[],
  dependencies: DependencyItem[],
  ganttViewSettings: GanttViewSettings,
  linkSourceTaskId: number | null,
  canModify: boolean,
  actions: ProjectContextMenuActions,
  includeGoToToday: boolean,
): ContextMenuEntry[] {
  const task = tasks.find((entry) => entry.taskId === taskId);
  if (!task) return [];

  const items: ContextMenuEntry[] = [
    item('properties', '작업 속성…', 'settings', () => actions.openTaskProperties(taskId)),
  ];

  if (canModify) {
    items.push(
      { type: 'separator' },
      item('add-task', '작업 추가', 'addTask', actions.addTask),
      item('add-subtask', '하위 작업 추가', 'addSubtask', () => actions.addSubtask(taskId)),
      item('delete-task', '작업 삭제', 'deleteTask', () => actions.deleteTask(taskId)),
      { type: 'separator' },
      item('indent', '들여쓰기', 'indent', () => actions.indentTask(taskId), {
        disabled: !canIndentTask(tasks, taskId),
      }),
      item('outdent', '내어쓰기', 'outdent', () => actions.outdentTask(taskId), {
        disabled: !canOutdentTask(tasks, taskId),
      }),
      item('link', '의존성 연결', 'link', () => actions.linkFromTask(taskId)),
      item('unlink', '의존성 제거', 'unlink', () => actions.unlinkFromTask(taskId)),
    );

    const currentType = resolveContextDependencyType(
      dependencies,
      taskId,
      linkSourceTaskId,
      ganttViewSettings.defaultDependencyType,
    );
    items.push(
      ...dependencyTypeMenuItems(currentType, (type) =>
        actions.setDependencyType(type, { taskId }),
      ),
    );

    if (taskHasChildren(tasks, taskId)) {
      items.push(
        { type: 'separator' },
        item(
          'toggle-expand',
          task.isExpanded ? '하위 작업 접기' : '하위 작업 펼치기',
          task.isExpanded ? 'collapse' : 'expand',
          () => actions.toggleExpandTask(taskId),
        ),
      );
    }
  }

  if (includeGoToToday) {
    items.push(
      { type: 'separator' },
      item('go-today', '오늘로 이동', 'today', actions.goToToday),
    );
  }

  return items;
}

function emptyOrHeaderMenuItems(
  canModify: boolean,
  actions: ProjectContextMenuActions,
  headerOnly: boolean,
): ContextMenuEntry[] {
  const items: ContextMenuEntry[] = [];

  if (canModify && !headerOnly) {
    items.push(item('add-task', '작업 추가', 'addTask', actions.addTask));
    items.push({ type: 'separator' });
  }

  items.push(
    item('zoom-in', '확대', 'zoomIn', actions.zoomIn),
    item('zoom-out', '축소', 'zoomOut', actions.zoomOut),
    item('go-today', '오늘로 이동', 'today', actions.goToToday),
  );

  return items;
}

export function buildProjectContextMenu({
  target,
  tasks,
  dependencies,
  ganttViewSettings,
  linkSourceTaskId,
  canModify,
  actions,
}: BuildProjectContextMenuOptions): ContextMenuEntry[] {
  switch (target.kind) {
    case 'gantt-dependency':
      return dependencyLineMenuItems(
        target.predecessorId,
        target.successorId,
        dependencies,
        canModify,
        actions,
      );
    case 'gantt-task':
      return taskMenuItems(
        target.taskId,
        tasks,
        dependencies,
        ganttViewSettings,
        linkSourceTaskId,
        canModify,
        actions,
        true,
      );
    case 'task-grid-task':
      return taskMenuItems(
        target.taskId,
        tasks,
        dependencies,
        ganttViewSettings,
        linkSourceTaskId,
        canModify,
        actions,
        false,
      );
    case 'gantt-empty':
      return emptyOrHeaderMenuItems(canModify, actions, false);
    case 'gantt-header':
      return emptyOrHeaderMenuItems(canModify, actions, true);
    case 'task-grid-empty':
      return emptyOrHeaderMenuItems(canModify, actions, false);
    case 'task-grid-header':
      return [
        ...(canModify
          ? [
              item('add-task', '작업 추가', 'addTask', actions.addTask),
              { type: 'separator' } satisfies ContextMenuEntry,
            ]
          : []),
        item('go-today', '오늘로 이동', 'today', actions.goToToday),
      ];
    default:
      return [];
  }
}
