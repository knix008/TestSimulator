import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TaskPropertiesDialog } from '@web/components/TaskPropertiesDialog';
import { AboutDialog } from '@web/components/AboutDialog';
import { GanttChart, type GanttChartExportHandle } from '@web/components/GanttChart';
import { TaskGrid } from '@web/components/TaskGrid';
import { ContextMenu } from '@web/components/ContextMenu';
import { UserManagementPanel } from '@web/components/UserManagementPanel';
import { MyAccountPanel } from '@web/components/MyAccountPanel';
import { useTranslation, useLanguage } from '@web/i18n';
import { useAuth } from '../context/DesktopAuthContext';
import { getStartupProjectPath } from '../api/desktopClient';
import type { AppInfo } from '@web/types/appInfo';
import type { GanttViewSettings, NoteItem, ProjectDetail } from '@web/types/project';
import {
  applyTaskDateChange,
  applyTaskProgressChange,
  finalizeSchedule,
  getPredecessors,
  removeDependency,
  removeOutgoingDependencies,
  setDependencyLineEnd,
  setDependencyType,
  tryAddDependency,
  withRecalculatedSchedule,
  resolveDependencyEndLineEnd,
  resolveDependencyStartLineEnd,
  resolveDependencyTypeTarget,
} from '@web/utils/scheduleUtils';
import { applyTaskResourcesFromColumns } from '@web/utils/taskResources';
import {
  createNoteForTask,
  nextNoteId,
  removeNoteFromProject,
  removeNotesForTaskIds,
  syncTaskNotesFromLinkedNote,
  updateNoteBodyInProject,
  updateNoteInProject,
  updateNotePositionInProject,
} from '@web/utils/projectNotes';
import { syncSplitScroll } from '@web/utils/splitScroll';
import {
  buildProjectContextMenu,
  type DependencyTypeSelection,
  type DependencyTypeValue,
  type ProjectContextMenuTarget,
} from '@web/utils/projectContextMenu';
import { parseWorkingWeek } from '@web/utils/workingWeek';
import {
  addSubtask,
  addTaskAfter,
  canIndentTask,
  canOutdentTask,
  getSubtreeTaskIds,
  indentTask,
  isSchedulePatch,
  outdentTask,
  removeInvalidHierarchyDependencies,
  removeTaskSubtree,
  updateTaskInList,
} from '@web/utils/taskModel';
import { applyScheduleCascadeFromTask } from '@web/utils/scheduleRecalculation';
import {
  desktopStateToMyprj,
  ganttViewSettingsToMyprjSettings,
  myprjToDesktopState,
  type MyProjectFileData,
  type MyProjectSettingsData,
} from '../projectDocument';
import { DesktopToolbar } from './DesktopToolbar';
import { DesktopMenuBar } from './DesktopMenuBar';
import { DesktopProjectSettingsPanel } from './DesktopProjectSettingsPanel';
import { DesktopPreferencesPanel } from './DesktopPreferencesPanel';
import type { DesktopAppActions } from '../desktopAppActions';
import { UndoRedoManager, type UndoSnapshot } from '../utils/undoRedoManager';
import { projectToExportDto } from '../utils/projectExportDto';
import type { ReportFormat } from '../types/exportProject';
import { DesktopTaskPropertiesPanel } from './DesktopTaskPropertiesPanel';
import { DesktopThreePaneLayout } from './DesktopThreePaneLayout';
import { DesktopCalendarView } from './DesktopCalendarView';
import { DesktopStatusBar } from './DesktopStatusBar';
import { DesktopGanttExportDialog } from './DesktopGanttExportDialog';
import { useDesktopWindowMinSize } from '../hooks/useDesktopWindowMinSize';
import '@web/components/ProjectView.css';
import '@web/components/ProjectToolbar.css';
import './DesktopProjectView.css';

export function DesktopProjectView() {
  const t = useTranslation();
  const { locale } = useLanguage();
  const { isAdmin, canModify, userId, username, logout, refresh } = useAuth();
  const [filePath, setFilePath] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [ganttViewSettings, setGanttViewSettings] = useState<GanttViewSettings | null>(null);
  const [myprjSettings, setMyprjSettings] = useState<MyProjectSettingsData | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [selectedDependency, setSelectedDependency] = useState<{
    predecessorId: number;
    successorId: number;
  } | null>(null);
  const [linkSourceTaskId, setLinkSourceTaskId] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    target: ProjectContextMenuTarget;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [isModified, setIsModified] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [propertiesPanelVisible, setPropertiesPanelVisible] = useState(true);
  const [calendarView, setCalendarView] = useState(false);
  const [taskPropertiesOpen, setTaskPropertiesOpen] = useState(false);
  const [recentFiles, setRecentFiles] = useState<string[]>([]);
  const [undoRevision, setUndoRevision] = useState(0);
  const [userMgmtOpen, setUserMgmtOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [aboutInfo, setAboutInfo] = useState<AppInfo | null>(null);
  const [aboutLoading, setAboutLoading] = useState(false);
  const [ganttExportOpen, setGanttExportOpen] = useState(false);
  const [ganttExportBusy, setGanttExportBusy] = useState(false);

  const { toolbarRef, actionsRef } = useDesktopWindowMinSize([
    loading,
    project?.id,
    isAdmin,
    locale,
    linkSourceTaskId,
    propertiesPanelVisible,
    calendarView,
    username,
    error,
    scheduleError,
  ]);

  const undoManagerRef = useRef(new UndoRedoManager());
  const ganttExportRef = useRef<GanttChartExportHandle>(null);

  const ganttViewSettingsRef = useRef<GanttViewSettings | null>(null);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const ganttScrollRef = useRef<HTMLDivElement>(null);
  const scrollToTodayRef = useRef<(() => boolean) | null>(null);
  const ganttZoomRef = useRef<{ zoomIn: () => void; zoomOut: () => void } | null>(null);
  const isSyncingScrollRef = useRef(false);
  ganttViewSettingsRef.current = ganttViewSettings;

  const getUndoSnapshot = useCallback((): UndoSnapshot | null => {
    if (!project || !ganttViewSettings) return null;
    return {
      project,
      ganttViewSettings,
      myprjSettings,
    };
  }, [project, ganttViewSettings, myprjSettings]);

  const pushUndoSnapshot = useCallback(() => {
    const snapshot = getUndoSnapshot();
    if (snapshot) {
      undoManagerRef.current.pushSnapshot(snapshot);
      setUndoRevision((v) => v + 1);
    }
  }, [getUndoSnapshot]);

  const applyLoadedState = useCallback((result: { data: MyProjectFileData; filePath: string | null }) => {
    const state = myprjToDesktopState(result.data, result.filePath);
    undoManagerRef.current.clear();
    setUndoRevision((v) => v + 1);
    setFilePath(state.filePath);
    setProject(state.project);
    setGanttViewSettings(state.ganttViewSettings);
    setMyprjSettings(state.settings);
    setPropertiesPanelVisible(state.settings?.propertiesPanelVisible ?? true);
    setCalendarView(state.settings?.useCalendarView ?? false);
    setSelectedTaskId(state.settings?.selectedTaskId ?? state.project.tasks[0]?.taskId ?? null);
    setSelectedNoteId(state.settings?.selectedNoteId ?? null);
    setLinkSourceTaskId(null);
    setIsModified(false);
    window.electronAPI.setModified(false);
    setScheduleError(null);
    setError(null);
  }, []);

  const markModified = useCallback(() => {
    setIsModified(true);
    window.electronAPI.setModified(true);
    setSaveStatus('idle');
  }, []);

  const applyUndoSnapshot = useCallback((snapshot: UndoSnapshot) => {
    setProject(snapshot.project);
    setGanttViewSettings(snapshot.ganttViewSettings);
    setMyprjSettings(snapshot.myprjSettings);
    markModified();
    setUndoRevision((v) => v + 1);
  }, [markModified]);

  const buildMyprjPayload = useCallback(() => {
    if (!project || !ganttViewSettings) return null;
    const payload = desktopStateToMyprj(project, ganttViewSettings, {
      ...myprjSettings,
      propertiesPanelVisible,
      useCalendarView: calendarView,
      selectedTaskId,
      selectedNoteId,
    });
    return payload;
  }, [project, ganttViewSettings, myprjSettings, propertiesPanelVisible, calendarView, selectedTaskId, selectedNoteId]);

  const handleNewProject = useCallback(async () => {
    if (isModified && !window.confirm('저장하지 않은 변경 사항이 있습니다. 계속하시겠습니까?')) {
      return;
    }
    setLoading(true);
    try {
      applyLoadedState(await window.electronAPI.newProject());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setLoading(false);
    }
  }, [applyLoadedState, isModified]);

  const handleOpenDialog = useCallback(async () => {
    if (isModified && !window.confirm('저장하지 않은 변경 사항이 있습니다. 계속하시겠습니까?')) {
      return;
    }
    setLoading(true);
    try {
      const result = await window.electronAPI.openProjectDialog();
      if (result) applyLoadedState(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open project');
    } finally {
      setLoading(false);
    }
  }, [applyLoadedState, isModified]);

  const handleOpenPath = useCallback(async (path: string) => {
    if (isModified && !window.confirm('저장하지 않은 변경 사항이 있습니다. 계속하시겠습니까?')) {
      return;
    }
    setLoading(true);
    try {
      applyLoadedState(await window.electronAPI.openProjectPath(path));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open project');
    } finally {
      setLoading(false);
    }
  }, [applyLoadedState, isModified]);

  const handleSave = useCallback(async () => {
    const payload = buildMyprjPayload();
    if (!payload) return;
    setSaveStatus('saving');
    try {
      const result = await window.electronAPI.saveProject(payload);
      if (result?.filePath) setFilePath(result.filePath);
      setIsModified(false);
      window.electronAPI.setModified(false);
      setSaveStatus('saved');
      window.setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      setSaveStatus('error');
      setScheduleError(err instanceof Error ? err.message : t('common.saveFailed'));
    }
  }, [buildMyprjPayload, t]);

  const handleSaveAs = useCallback(async () => {
    const payload = buildMyprjPayload();
    if (!payload) return;
    setSaveStatus('saving');
    try {
      const result = await window.electronAPI.saveProjectAs(payload);
      if (result?.filePath) setFilePath(result.filePath);
      setIsModified(false);
      window.electronAPI.setModified(false);
      setSaveStatus('saved');
      window.setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      setSaveStatus('error');
      setScheduleError(err instanceof Error ? err.message : t('common.saveFailed'));
    }
  }, [buildMyprjPayload, t]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const startup = await getStartupProjectPath();
        if (startup.filePath) {
          applyLoadedState(await window.electronAPI.openProjectPath(startup.filePath));
          return;
        }

        const recent = await window.electronAPI.listRecentFiles();
        if (recent.length > 0) {
          try {
            applyLoadedState(await window.electronAPI.openProjectPath(recent[0]));
            return;
          } catch {
            // ignore missing recent file
          }
        }

        applyLoadedState(await window.electronAPI.newProject());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load project');
      } finally {
        setLoading(false);
      }
    })();
  }, [applyLoadedState]);

  useEffect(() => {
    const unsubscribers = [
      window.electronAPI.onMenuNewProject(() => void handleNewProject()),
      window.electronAPI.onMenuOpenFile((path) => void handleOpenPath(path)),
      window.electronAPI.onMenuSave(() => void handleSave()),
      window.electronAPI.onMenuSaveAs(() => void handleSaveAs()),
      window.electronAPI.onDocumentState((state) => {
        setFilePath(state.filePath);
        setIsModified(state.isModified);
      }),
      window.electronAPI.onProjectOpened((result) => applyLoadedState(result)),
    ];
    return () => unsubscribers.forEach((unsub) => unsub());
  }, [applyLoadedState, handleNewProject, handleOpenPath, handleSave, handleSaveAs]);

  useEffect(() => {
    void window.electronAPI.listRecentFiles().then(setRecentFiles).catch(() => setRecentFiles([]));
  }, [filePath]);

  const updateProjectState = useCallback(
    (updater: (current: ProjectDetail) => ProjectDetail, trackUndo = true) => {
      if (trackUndo) pushUndoSnapshot();
      setProject((current) => {
        if (!current) return current;
        const next = updater(current);
        const tasks = finalizeSchedule(next.tasks, next.dependencies, next);
        const finalized = withRecalculatedSchedule({ ...next, tasks });
        markModified();
        return finalized;
      });
    },
    [markModified, pushUndoSnapshot],
  );

  const handleSelectTask = useCallback((taskId: number) => {
    setSelectedTaskId(taskId);
    setSelectedNoteId(null);
    setSelectedDependency(null);
    setEditingNoteId(null);
    setPropertiesPanelVisible(true);
  }, []);

  const handleSelectNote = useCallback((noteId: number) => {
    setSelectedNoteId(noteId);
    setSelectedTaskId(null);
    setSelectedDependency(null);
    setPropertiesPanelVisible(true);
  }, []);

  const handleTaskDateChange = useCallback(
    (taskId: number, start: Date, end: Date) => {
      updateProjectState((current) => {
        const week = parseWorkingWeek(current.workingDaysJson);
        const tasks = current.tasks.map((task) =>
          task.taskId === taskId ? applyTaskDateChange(task, start, end, week) : task,
        );
        return {
          ...current,
          tasks: applyScheduleCascadeFromTask(tasks, current.dependencies, current, taskId),
        };
      });
    },
    [updateProjectState],
  );

  const handleTaskProgressChange = useCallback(
    (taskId: number, progress: number) => {
      updateProjectState((current) => ({
        ...current,
        tasks: current.tasks.map((task) =>
          task.taskId === taskId ? applyTaskProgressChange(task, progress) : task,
        ),
      }));
    },
    [updateProjectState],
  );

  const handleAddDependency = useCallback(
    (predecessorId: number, successorId: number) => {
      updateProjectState((current) => {
        const defaults = ganttViewSettingsRef.current!;
        const result = tryAddDependency(current.dependencies, predecessorId, successorId, {
          type: defaults.defaultDependencyType,
          startLineEnd: defaults.startLineEnd,
          endLineEnd: defaults.endLineEnd,
        });
        if (result.error) {
          setScheduleError(result.error);
          return current;
        }
        setScheduleError(null);
        setLinkSourceTaskId(null);
        return { ...current, dependencies: result.dependencies };
      });
    },
    [updateProjectState],
  );

  const handleRemoveDependency = useCallback(
    (predecessorId: number, successorId: number) => {
      setSelectedDependency((current) =>
        current?.predecessorId === predecessorId && current?.successorId === successorId ? null : current,
      );
      updateProjectState((current) => ({
        ...current,
        dependencies: removeDependency(current.dependencies, predecessorId, successorId),
      }));
    },
    [updateProjectState],
  );

  const handleUpdateDependencyType = useCallback(
    (predecessorId: number, successorId: number, type: DependencyTypeValue) => {
      setSelectedDependency({ predecessorId, successorId });
      updateProjectState((current) => ({
        ...current,
        dependencies: setDependencyType(current.dependencies, predecessorId, successorId, type),
      }));
      setScheduleError(null);
    },
    [updateProjectState],
  );

  const handleUnlinkFromTask = useCallback(
    (taskId: number) => {
      const outgoingCount =
        project?.dependencies.filter((dep) => dep.predecessorId === taskId).length ?? 0;
      if (outgoingCount === 0) {
        setScheduleError(t('project.noOutgoingDeps'));
        return;
      }
      setSelectedDependency((current) =>
        current?.predecessorId === taskId ? null : current,
      );
      updateProjectState((current) => ({
        ...current,
        dependencies: removeOutgoingDependencies(current.dependencies, taskId),
      }));
      setScheduleError(null);
    },
    [project?.dependencies, t, updateProjectState],
  );

  const handleSetDependencyLineEnd = useCallback(
    (
      which: 'start' | 'end',
      style: GanttViewSettings['startLineEnd'],
      predecessorId: number,
      successorId: number,
    ) => {
      setSelectedDependency({ predecessorId, successorId });
      updateProjectState((current) => ({
        ...current,
        dependencies: setDependencyLineEnd(current.dependencies, predecessorId, successorId, which, style),
      }));
    },
    [updateProjectState],
  );

  const handleSelectDependencyType = useCallback(
    (type: DependencyTypeValue, selection: DependencyTypeSelection) => {
      setGanttViewSettings((current) => {
        if (!current) return current;
        const next = { ...current, defaultDependencyType: type };
        setMyprjSettings((settings) => ganttViewSettingsToMyprjSettings(settings, next));
        markModified();
        return next;
      });

      if (selection.predecessorId != null && selection.successorId != null) {
        updateProjectState((current) => {
          const exists = current.dependencies.some(
            (dep) =>
              dep.predecessorId === selection.predecessorId &&
              dep.successorId === selection.successorId,
          );
          if (!exists) return current;
          return {
            ...current,
            dependencies: setDependencyType(
              current.dependencies,
              selection.predecessorId!,
              selection.successorId!,
              type,
            ),
          };
        });
        setScheduleError(null);
        return;
      }

      if (selection.taskId == null) return;

      const target = resolveDependencyTypeTarget(
        project?.dependencies ?? [],
        selection.taskId,
        linkSourceTaskId,
      );
      if (!target) return;

      updateProjectState((current) => ({
        ...current,
        dependencies: setDependencyType(
          current.dependencies,
          target.predecessorId,
          target.successorId,
          type,
        ),
      }));
      setScheduleError(null);
    },
    [linkSourceTaskId, markModified, project?.dependencies, updateProjectState],
  );

  const handleUpdateTask = useCallback(
    (taskId: number, patch: Partial<ProjectDetail['tasks'][number]>) => {
      updateProjectState((current) => {
        let tasks = updateTaskInList(current.tasks, taskId, patch, current.workingDaysJson);
        if (isSchedulePatch(patch)) {
          tasks = applyScheduleCascadeFromTask(tasks, current.dependencies, current, taskId);
        }
        return { ...current, tasks };
      });
    },
    [updateProjectState],
  );

  const handleUpdateTaskResources = useCallback(
    (taskId: number, namesText: string, allocsText: string) => {
      updateProjectState((current) => {
        const { assignments, assignedTo } = applyTaskResourcesFromColumns(
          taskId,
          current.assignments ?? [],
          namesText,
          allocsText,
        );
        return {
          ...current,
          assignments,
          tasks: updateTaskInList(current.tasks, taskId, { assignedTo }, current.workingDaysJson),
        };
      });
    },
    [updateProjectState],
  );

  const handleAddTask = useCallback(() => {
    let newTaskId: number | null = null;
    updateProjectState((current) => {
      const result = addTaskAfter(current.tasks, selectedTaskId, 'New Task', current.workingDaysJson);
      newTaskId = result.newTaskId;
      return { ...current, tasks: result.tasks };
    });
    if (newTaskId != null) handleSelectTask(newTaskId);
  }, [handleSelectTask, selectedTaskId, updateProjectState]);

  const handleAddSubtask = useCallback(
    (parentTaskId?: number) => {
      const parentId = parentTaskId ?? selectedTaskId;
      if (parentId == null) {
        handleAddTask();
        return;
      }
      let newTaskId: number | null = null;
      updateProjectState((current) => {
        const result = addSubtask(current.tasks, parentId, 'New Task', current.workingDaysJson);
        newTaskId = result.newTaskId;
        return { ...current, tasks: result.tasks };
      });
      if (newTaskId != null) handleSelectTask(newTaskId);
    },
    [handleAddTask, handleSelectTask, selectedTaskId, updateProjectState],
  );

  const handleDeleteTask = useCallback(
    (taskId?: number) => {
      const targetId = taskId ?? selectedTaskId;
      if (targetId == null || !project) return;
      const task = project.tasks.find((entry) => entry.taskId === targetId);
      if (!task) return;
      const subtreeIds = getSubtreeTaskIds(project.tasks, targetId);
      const message =
        subtreeIds.length > 1
          ? t('project.deleteTaskConfirmSubtree', { name: task.name, count: subtreeIds.length })
          : t('project.deleteTaskConfirm', { name: task.name });
      if (!window.confirm(message)) return;

      const deletedId = targetId;
      const idx = project.tasks.findIndex((entry) => entry.taskId === deletedId);
      let nextSelected: number | null = null;
      updateProjectState((current) => {
        const removeIds = new Set(subtreeIds);
        const { tasks, dependencies } = removeTaskSubtree(current.tasks, current.dependencies, deletedId);
        nextSelected =
          tasks[Math.min(idx, tasks.length - 1)]?.taskId ??
          tasks[tasks.length - 1]?.taskId ??
          null;
        return {
          ...current,
          tasks,
          dependencies,
          assignments: (current.assignments ?? []).filter((a) => !removeIds.has(a.taskId)),
          ganttNotes: removeNotesForTaskIds(current.ganttNotes ?? [], removeIds),
        };
      });
      setSelectedTaskId(nextSelected);
      setSelectedNoteId(null);
      setEditingNoteId(null);
    },
    [project, selectedTaskId, t, updateProjectState],
  );

  const handleIndentTask = useCallback(
    (taskId?: number) => {
      const targetId = taskId ?? selectedTaskId;
      if (targetId == null) return;
      updateProjectState((current) => {
        const tasks = indentTask(current.tasks, targetId);
        return {
          ...current,
          tasks,
          dependencies: removeInvalidHierarchyDependencies(tasks, current.dependencies),
        };
      });
    },
    [selectedTaskId, updateProjectState],
  );

  const handleOutdentTask = useCallback(
    (taskId?: number) => {
      const targetId = taskId ?? selectedTaskId;
      if (targetId == null) return;
      updateProjectState((current) => {
        const tasks = outdentTask(current.tasks, targetId);
        return {
          ...current,
          tasks,
          dependencies: removeInvalidHierarchyDependencies(tasks, current.dependencies),
        };
      });
    },
    [selectedTaskId, updateProjectState],
  );

  const handleToggleExpand = useCallback(
    (taskId: number) => {
      updateProjectState((current) => ({
        ...current,
        tasks: current.tasks.map((task) =>
          task.taskId === taskId ? { ...task, isExpanded: !task.isExpanded } : task,
        ),
      }));
    },
    [updateProjectState],
  );

  const handleToggleCriticalPath = useCallback(() => {
    setGanttViewSettings((current) => {
      if (!current) return current;
      const next = { ...current, showCriticalPath: !current.showCriticalPath };
      setMyprjSettings((settings) => ganttViewSettingsToMyprjSettings(settings, next));
      markModified();
      return next;
    });
  }, [markModified]);

  const handleGoToToday = useCallback(() => {
    const scrolled = scrollToTodayRef.current?.() ?? false;
    setScheduleError(scrolled ? null : t('project.todayOutOfRange'));
  }, [t]);

  const handleAddNoteToTask = useCallback(
    (taskId: number) => {
      let newNoteId: number | null = null;
      updateProjectState((current) => {
        const task = current.tasks.find((entry) => entry.taskId === taskId);
        if (!task) return current;
        const noteId = nextNoteId(current.ganttNotes ?? []);
        newNoteId = noteId;
        const note = createNoteForTask(
          noteId,
          taskId,
          task,
          current.tasks,
          current.ganttNotes ?? [],
        );
        return { ...current, ganttNotes: [...(current.ganttNotes ?? []), note] };
      });
      if (newNoteId != null) {
        handleSelectNote(newNoteId);
        setEditingNoteId(newNoteId);
      }
    },
    [handleSelectNote, updateProjectState],
  );

  const handleUpdateNote = useCallback(
    (noteId: number, patch: Partial<Pick<NoteItem, 'title' | 'body'>>) => {
      updateProjectState((current) => {
        const notes = updateNoteInProject(current.ganttNotes ?? [], noteId, {
          ...patch,
          ...(patch.body !== undefined ? { bodyRtf: '' } : {}),
        });
        const note = notes.find((entry) => entry.noteId === noteId);
        let tasks = current.tasks;
        if (note && note.taskId >= 0 && patch.body !== undefined) {
          tasks = syncTaskNotesFromLinkedNote(note.taskId, notes, tasks);
        }
        return { ...current, ganttNotes: notes, tasks };
      });
    },
    [updateProjectState],
  );

  const handleUpdateNoteBody = useCallback(
    (noteId: number, body: string) => {
      updateProjectState((current) => {
        const notes = updateNoteBodyInProject(current.ganttNotes ?? [], noteId, body);
        const note = notes.find((entry) => entry.noteId === noteId);
        let tasks = current.tasks;
        if (note && note.taskId >= 0) {
          tasks = syncTaskNotesFromLinkedNote(note.taskId, notes, tasks);
        }
        return { ...current, ganttNotes: notes, tasks };
      });
    },
    [updateProjectState],
  );

  const handleUpdateNotePosition = useCallback(
    (noteId: number, anchorDate: string, contentY: number) => {
      updateProjectState((current) => ({
        ...current,
        ganttNotes: updateNotePositionInProject(current.ganttNotes ?? [], noteId, anchorDate, contentY),
      }));
    },
    [updateProjectState],
  );

  const handleDeleteNote = useCallback(
    (noteId: number) => {
      updateProjectState((current) => {
        const note = current.ganttNotes?.find((entry) => entry.noteId === noteId);
        const notes = removeNoteFromProject(current.ganttNotes ?? [], noteId);
        let tasks = current.tasks;
        if (note && note.taskId >= 0) {
          tasks = syncTaskNotesFromLinkedNote(note.taskId, notes, tasks);
        }
        return { ...current, ganttNotes: notes, tasks };
      });
      if (selectedNoteId === noteId) setSelectedNoteId(null);
      if (editingNoteId === noteId) setEditingNoteId(null);
    },
    [editingNoteId, selectedNoteId, updateProjectState],
  );

  const handleSetDefaultDependencyType = useCallback(
    (type: GanttViewSettings['defaultDependencyType']) => {
      setGanttViewSettings((current) => {
        if (!current) return current;
        const next = { ...current, defaultDependencyType: type };
        setMyprjSettings((settings) => ganttViewSettingsToMyprjSettings(settings, next));
        markModified();
        return next;
      });
    },
    [markModified],
  );

  const handleSetLineEnd = useCallback(
    (which: 'start' | 'end', style: GanttViewSettings['startLineEnd']) => {
      setGanttViewSettings((current) => {
        if (!current) return current;
        const next =
          which === 'start'
            ? { ...current, startLineEnd: style }
            : { ...current, endLineEnd: style };
        setMyprjSettings((settings) => ganttViewSettingsToMyprjSettings(settings, next));
        markModified();
        return next;
      });

      if (selectedDependency) {
        updateProjectState((current) => ({
          ...current,
          dependencies: setDependencyLineEnd(
            current.dependencies,
            selectedDependency.predecessorId,
            selectedDependency.successorId,
            which,
            style,
          ),
        }));
      }
    },
    [markModified, selectedDependency, updateProjectState],
  );

  const handleSettingsSave = useCallback(
    (nextProject: ProjectDetail, nextGanttSettings: GanttViewSettings) => {
      setProject(nextProject);
      setGanttViewSettings(nextGanttSettings);
      setMyprjSettings((settings) => ganttViewSettingsToMyprjSettings(settings, nextGanttSettings));
      markModified();
    },
    [markModified],
  );

  const handleToggleExpandCollapse = useCallback(() => {
    if (selectedTaskId == null) return;
    handleToggleExpand(selectedTaskId);
  }, [handleToggleExpand, selectedTaskId]);

  const handleUndo = useCallback(() => {
    const current = getUndoSnapshot();
    if (!current) return;
    const restored = undoManagerRef.current.undo(current);
    if (restored) applyUndoSnapshot(restored);
  }, [applyUndoSnapshot, getUndoSnapshot]);

  const handleRedo = useCallback(() => {
    const current = getUndoSnapshot();
    if (!current) return;
    const restored = undoManagerRef.current.redo(current);
    if (restored) applyUndoSnapshot(restored);
  }, [applyUndoSnapshot, getUndoSnapshot]);

  const canUndo = undoManagerRef.current.canUndo();
  const canRedo = undoManagerRef.current.canRedo();
  void undoRevision;

  const handleExportReport = useCallback(
    async (format: ReportFormat) => {
      if (!project) return;
      try {
        const dto = projectToExportDto(project);
        if (format === 'gantt-png') {
          setGanttExportOpen(true);
          return;
        }
        await window.electronAPI.exportReport(format, dto);
      } catch (err) {
        setScheduleError(err instanceof Error ? err.message : 'Export failed');
      }
    },
    [project],
  );

  const handleGanttImageExport = useCallback(
    async (transparentBackground: boolean) => {
      if (!project) return;
      setGanttExportBusy(true);
      try {
        const dto = projectToExportDto(project);
        const dataUrl = await ganttExportRef.current?.captureImage({ transparentBackground });
        if (!dataUrl) return;
        await window.electronAPI.saveGanttImage(dto.name, dataUrl);
        setGanttExportOpen(false);
      } catch (err) {
        setScheduleError(err instanceof Error ? err.message : 'Export failed');
      } finally {
        setGanttExportBusy(false);
      }
    },
    [project],
  );

  const handleExportMsProject = useCallback(async () => {
    if (!project) return;
    try {
      await window.electronAPI.exportMsProject(projectToExportDto(project));
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : 'Export failed');
    }
  }, [project]);

  const handlePrint = useCallback(async () => {
    try {
      await window.electronAPI.printProject();
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : 'Print failed');
    }
  }, []);

  const handleToggleCalendarView = useCallback(() => {
    setCalendarView((current) => {
      const next = !current;
      setMyprjSettings((settings) => ({ ...settings, useCalendarView: next }));
      markModified();
      return next;
    });
  }, [markModified]);

  const handleToggleTaskPropertiesDialog = useCallback(() => {
    if (selectedTaskId == null) return;
    setTaskPropertiesOpen((open) => !open);
  }, [selectedTaskId]);

  const handlePropertiesPanelWidthChange = useCallback(
    (width: number) => {
      setMyprjSettings((settings) => ({ ...settings, propertiesPanelWidth: width }));
    },
    [],
  );

  const handleShowAbout = useCallback(() => {
    setAboutOpen(true);
    setAboutLoading(true);
    void window.electronAPI
      .getAppInfo()
      .then((info) => setAboutInfo(info))
      .catch(() => setAboutInfo(null))
      .finally(() => setAboutLoading(false));
  }, []);

  const desktopActions = useMemo<DesktopAppActions>(
    () => ({
      newProject: () => void handleNewProject(),
      openProject: () => void handleOpenDialog(),
      openRecentFile: (path) => void handleOpenPath(path),
      saveProject: () => void handleSave(),
      saveProjectAs: () => void handleSaveAs(),
      openProjectSettings: () => setProjectSettingsOpen(true),
      openPreferences: () => setPreferencesOpen(true),
      exportMsProject: () => void handleExportMsProject(),
      exitApp: () => window.electronAPI.quitApp(),
      undo: handleUndo,
      redo: handleRedo,
      addTask: handleAddTask,
      addSubtask: () => handleAddSubtask(),
      deleteTask: () => handleDeleteTask(),
      indentTask: () => handleIndentTask(),
      outdentTask: () => handleOutdentTask(),
      linkTask: () => {
        if (linkSourceTaskId != null) setLinkSourceTaskId(null);
        else if (selectedTaskId != null) setLinkSourceTaskId(selectedTaskId);
      },
      unlinkTask: () => {
        if (selectedTaskId != null) handleUnlinkFromTask(selectedTaskId);
      },
      setDependencyType: handleSetDefaultDependencyType,
      openTaskProperties: handleToggleTaskPropertiesDialog,
      toggleExpandCollapse: handleToggleExpandCollapse,
      zoomIn: () => ganttZoomRef.current?.zoomIn(),
      zoomOut: () => ganttZoomRef.current?.zoomOut(),
      goToToday: handleGoToToday,
      togglePropertiesPanel: () => setPropertiesPanelVisible((v) => !v),
      toggleCriticalPath: handleToggleCriticalPath,
      toggleCalendarView: handleToggleCalendarView,
      exportExcel: () => void handleExportReport('excel'),
      exportHtml: () => void handleExportReport('html'),
      exportWord: () => void handleExportReport('word'),
      exportMarkdown: () => void handleExportReport('markdown'),
      exportGanttImage: () => void handleExportReport('gantt-png'),
      exportPdf: () => void handleExportReport('pdf'),
      print: () => void handlePrint(),
      showAbout: handleShowAbout,
      addNote: () => {
        if (selectedTaskId != null) handleAddNoteToTask(selectedTaskId);
      },
      openUserManagement: () => setUserMgmtOpen(true),
      openMyAccount: () => setAccountOpen(true),
      logout: () => void logout(),
    }),
    [
      handleAddNoteToTask,
      handleAddSubtask,
      handleAddTask,
      handleDeleteTask,
      handleExportMsProject,
      handleExportReport,
      handleGoToToday,
      handleIndentTask,
      handleNewProject,
      handleOpenDialog,
      handleOpenPath,
      handleToggleTaskPropertiesDialog,
      handleOutdentTask,
      handlePrint,
      handleShowAbout,
      handleRedo,
      handleSave,
      handleSaveAs,
      handleSetDefaultDependencyType,
      handleToggleCalendarView,
      handleToggleCriticalPath,
      handleToggleExpandCollapse,
      handleUndo,
      handleUnlinkFromTask,
      linkSourceTaskId,
      logout,
      selectedTaskId,
    ],
  );

  const selectedTask = useMemo(
    () => project?.tasks.find((task) => task.taskId === selectedTaskId) ?? null,
    [project?.tasks, selectedTaskId],
  );

  const selectedNote = useMemo(
    () => project?.ganttNotes?.find((note) => note.noteId === selectedNoteId) ?? null,
    [project?.ganttNotes, selectedNoteId],
  );

  const predecessors = useMemo(
    () => (project && selectedTaskId != null ? getPredecessors(project.dependencies, selectedTaskId) : []),
    [project, selectedTaskId],
  );

  const contextMenuItems = useMemo(() => {
    if (!contextMenu || !project || !ganttViewSettings) return [];
    return buildProjectContextMenu({
      target: contextMenu.target,
      tasks: project.tasks,
      dependencies: project.dependencies,
      ganttNotes: project.ganttNotes ?? [],
      ganttViewSettings,
      linkSourceTaskId,
      selectedDependency,
      canModify,
      actions: {
        openTaskProperties: (taskId) => {
          handleSelectTask(taskId);
          setTaskPropertiesOpen(true);
        },
        addTask: handleAddTask,
        addSubtask: handleAddSubtask,
        deleteTask: handleDeleteTask,
        indentTask: handleIndentTask,
        outdentTask: handleOutdentTask,
        linkFromTask: (taskId) => setLinkSourceTaskId(taskId),
        unlinkFromTask: handleUnlinkFromTask,
        toggleExpandTask: handleToggleExpand,
        setDependencyType: handleSelectDependencyType,
        setDependencyLineEnd: handleSetDependencyLineEnd,
        removeDependency: handleRemoveDependency,
        goToToday: handleGoToToday,
        zoomIn: () => ganttZoomRef.current?.zoomIn(),
        zoomOut: () => ganttZoomRef.current?.zoomOut(),
        addNoteToTask: handleAddNoteToTask,
        editNote: (noteId) => {
          handleSelectNote(noteId);
          setEditingNoteId(noteId);
        },
        deleteNote: handleDeleteNote,
        selectTask: handleSelectTask,
      },
      t,
    });
  }, [
    contextMenu,
    project,
    ganttViewSettings,
    linkSourceTaskId,
    selectedDependency,
    handleAddTask,
    handleAddSubtask,
    handleDeleteTask,
    handleIndentTask,
    handleOutdentTask,
    handleToggleExpand,
    handleSelectDependencyType,
    handleSetDependencyLineEnd,
    handleRemoveDependency,
    handleSelectNote,
    handleSelectTask,
    handleUnlinkFromTask,
    handleGoToToday,
    handleAddNoteToTask,
    handleDeleteNote,
    canModify,
    t,
  ]);

  useEffect(() => {
    const grid = gridScrollRef.current;
    const gantt = ganttScrollRef.current;
    if (!grid || !gantt) return;

    const onGridScroll = () => {
      if (isSyncingScrollRef.current) return;
      isSyncingScrollRef.current = true;
      syncSplitScroll(grid, gantt);
      isSyncingScrollRef.current = false;
    };
    const onGanttScroll = () => {
      if (isSyncingScrollRef.current) return;
      isSyncingScrollRef.current = true;
      syncSplitScroll(gantt, grid);
      isSyncingScrollRef.current = false;
    };

    grid.addEventListener('scroll', onGridScroll, { passive: true });
    gantt.addEventListener('scroll', onGanttScroll, { passive: true });
    return () => {
      grid.removeEventListener('scroll', onGridScroll);
      gantt.removeEventListener('scroll', onGanttScroll);
    };
  }, [project?.tasks.length]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;

      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handleSaveAs();
      } else if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        void handleSave();
      } else if (e.ctrlKey && e.key === 'o') {
        e.preventDefault();
        void handleOpenDialog();
      } else if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        void handleNewProject();
      } else if (e.ctrlKey && (e.key === 't' || e.key === 'T') && !typing) {
        e.preventDefault();
        handleGoToToday();
      } else if (e.ctrlKey && e.key === 'l' && !typing) {
        e.preventDefault();
        desktopActions.linkTask();
      } else if (e.key === 'Insert' && !typing) {
        e.preventDefault();
        if (e.ctrlKey && e.shiftKey) handleAddSubtask();
        else handleAddTask();
      } else if (e.key === 'Delete' && !typing) {
        if (selectedDependency != null) {
          e.preventDefault();
          handleRemoveDependency(selectedDependency.predecessorId, selectedDependency.successorId);
        } else if (selectedTaskId != null) {
          e.preventDefault();
          handleDeleteTask();
        }
      } else if (e.altKey && e.key === 'ArrowRight' && !typing) {
        e.preventDefault();
        handleIndentTask();
      } else if (e.altKey && e.key === 'ArrowLeft' && !typing) {
        e.preventDefault();
        handleOutdentTask();
      } else if (e.ctrlKey && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        ganttZoomRef.current?.zoomIn();
      } else if (e.ctrlKey && e.key === '-') {
        e.preventDefault();
        ganttZoomRef.current?.zoomOut();
      } else if (e.ctrlKey && e.key === 'z' && !typing) {
        e.preventDefault();
        handleUndo();
      } else if (e.ctrlKey && e.key === 'y' && !typing) {
        e.preventDefault();
        handleRedo();
      } else if (e.key === 'F2' && !typing && selectedTaskId != null) {
        e.preventDefault();
        handleToggleTaskPropertiesDialog();
      } else if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        void handlePrint();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    desktopActions,
    handleAddSubtask,
    handleAddTask,
    handleDeleteTask,
    handleGoToToday,
    handleIndentTask,
    handleNewProject,
    handleOpenDialog,
    handleRemoveDependency,
    handleToggleTaskPropertiesDialog,
    handleOutdentTask,
    handlePrint,
    handleRedo,
    handleSave,
    handleSaveAs,
    handleUndo,
    selectedDependency,
    selectedTaskId,
  ]);

  if (loading || !project || !ganttViewSettings) {
    return <div className="desktop-loading">{t('common.loading')}</div>;
  }

  const selectedDependencyItem = selectedDependency
    ? project.dependencies.find(
        (dep) =>
          dep.predecessorId === selectedDependency.predecessorId &&
          dep.successorId === selectedDependency.successorId,
      )
    : undefined;
  const toolbarStartLineEnd = resolveDependencyStartLineEnd(selectedDependencyItem, ganttViewSettings);
  const toolbarEndLineEnd = resolveDependencyEndLineEnd(selectedDependencyItem, ganttViewSettings);

  return (
    <div className="desktop-project-view">
      <DesktopMenuBar
        actions={desktopActions}
        linkMode={linkSourceTaskId != null}
        showCriticalPath={ganttViewSettings.showCriticalPath}
        propertiesPanelVisible={propertiesPanelVisible}
        calendarView={calendarView}
        canDeleteTask={selectedTaskId != null}
        canIndentTask={selectedTaskId != null && canIndentTask(project.tasks, selectedTaskId)}
        canOutdentTask={selectedTaskId != null && canOutdentTask(project.tasks, selectedTaskId)}
        canLink={selectedTaskId != null}
        canUnlink={linkSourceTaskId != null}
        canAddNote={selectedTaskId != null}
        canUndo={canUndo}
        canRedo={canRedo}
        recentFiles={recentFiles}
        defaultDependencyType={ganttViewSettings.defaultDependencyType}
        locale={locale === 'en' ? 'en' : 'ko'}
        isAdmin={isAdmin}
      />

      <DesktopToolbar
        toolbarRef={toolbarRef}
        actionsRef={actionsRef}
        filePath={filePath}
        projectName={project.name}
        isModified={isModified}
        saveStatus={saveStatus}
        linkMode={linkSourceTaskId != null}
        showCriticalPath={ganttViewSettings.showCriticalPath}
        calendarView={calendarView}
        propertiesPanelVisible={propertiesPanelVisible}
        canGoToToday={(project.tasks.length ?? 0) > 0}
        canDeleteTask={selectedTaskId != null}
        canIndentTask={selectedTaskId != null && canIndentTask(project.tasks, selectedTaskId)}
        canOutdentTask={selectedTaskId != null && canOutdentTask(project.tasks, selectedTaskId)}
        canAddNote={selectedTaskId != null}
        canOpenTaskProperties={selectedTaskId != null}
        canToggleExpandCollapse={selectedTaskId != null}
        canUndo={canUndo}
        canRedo={canRedo}
        defaultDependencyType={ganttViewSettings.defaultDependencyType}
        startLineEnd={toolbarStartLineEnd}
        endLineEnd={toolbarEndLineEnd}
        onNew={() => void handleNewProject()}
        onOpen={() => void handleOpenDialog()}
        onSave={() => void handleSave()}
        onSaveAs={() => void handleSaveAs()}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onToggleLinkMode={desktopActions.linkTask}
        onUnlink={() => setLinkSourceTaskId(null)}
        onAddTask={handleAddTask}
        onAddSubtask={() => handleAddSubtask()}
        onAddNote={() => {
          if (selectedTaskId != null) handleAddNoteToTask(selectedTaskId);
        }}
        onDeleteTask={() => handleDeleteTask()}
        onIndentTask={() => handleIndentTask()}
        onOutdentTask={() => handleOutdentTask()}
        onOpenTaskProperties={handleToggleTaskPropertiesDialog}
        onToggleExpandCollapse={handleToggleExpandCollapse}
        onToggleCriticalPath={handleToggleCriticalPath}
        onToggleCalendarView={handleToggleCalendarView}
        onGoToToday={handleGoToToday}
        onZoomIn={() => ganttZoomRef.current?.zoomIn()}
        onZoomOut={() => ganttZoomRef.current?.zoomOut()}
        onTogglePropertiesPanel={() => setPropertiesPanelVisible((v) => !v)}
        onOpenProjectSettings={() => setProjectSettingsOpen(true)}
        onPrint={() => void handlePrint()}
        onDependencyTypeChange={handleSetDefaultDependencyType}
        onStartLineEndChange={(style) => handleSetLineEnd('start', style)}
        onEndLineEndChange={(style) => handleSetLineEnd('end', style)}
        isAdmin={isAdmin}
        username={username}
        onOpenUserManagement={() => setUserMgmtOpen(true)}
        onOpenMyAccount={() => setAccountOpen(true)}
        onLogout={() => void logout()}
      />

      {(error || scheduleError) && (
        <div className="desktop-error-banner">{error ?? scheduleError}</div>
      )}

      <div className="desktop-main">
        {calendarView ? (
          <DesktopCalendarView tasks={project.tasks} projectStart={project.projectStart} />
        ) : (
          <DesktopThreePaneLayout
            propertiesVisible={propertiesPanelVisible}
            initialPropertiesWidth={myprjSettings?.propertiesPanelWidth ?? 260}
            onPropertiesWidthChange={handlePropertiesPanelWidthChange}
            gridPane={
              <TaskGrid
                projectName={project.name}
                tasks={project.tasks}
                assignments={project.assignments}
                selectedTaskId={selectedTaskId}
                canModify={canModify}
                showCriticalPath={ganttViewSettings.showCriticalPath}
                ganttNotes={project.ganttNotes ?? []}
                scrollContainerRef={gridScrollRef}
                onSelectTask={handleSelectTask}
                onUpdateTask={handleUpdateTask}
                onUpdateTaskResources={handleUpdateTaskResources}
                onToggleExpand={handleToggleExpand}
                onContextMenuRequest={(target, x, y) => setContextMenu({ x, y, target })}
              />
            }
            ganttPane={
              <div className="desktop-gantt-capture">
                <GanttChart
                  chartExportRef={ganttExportRef}
                  tasks={project.tasks}
                  dependencies={project.dependencies}
                  ganttNotes={project.ganttNotes}
                  workingDaysJson={project.workingDaysJson}
                  ganttViewSettings={ganttViewSettings}
                  selectedTaskId={selectedTaskId}
                  selectedNoteId={selectedNoteId}
                  editingNoteId={editingNoteId}
                  selectedDependency={selectedDependency}
                  canModify={canModify}
                  linkSourceTaskId={linkSourceTaskId}
                  scrollContainerRef={ganttScrollRef}
                  scrollToTodayRef={scrollToTodayRef}
                  zoomRef={ganttZoomRef}
                  onSelectTask={handleSelectTask}
                  onSelectNote={handleSelectNote}
                  onSetEditingNoteId={setEditingNoteId}
                  onUpdateNoteBody={handleUpdateNoteBody}
                  onUpdateNotePosition={handleUpdateNotePosition}
                  onSelectDependency={setSelectedDependency}
                  onTaskDateChange={handleTaskDateChange}
                  onTaskProgressChange={handleTaskProgressChange}
                  onAddDependency={handleAddDependency}
                  onClearLinkSource={() => setLinkSourceTaskId(null)}
                  onCancelLinkMode={() => setLinkSourceTaskId(null)}
                  onContextMenuRequest={(target, x, y) => setContextMenu({ x, y, target })}
                />
              </div>
            }
            propertiesPane={
              <DesktopTaskPropertiesPanel
                task={selectedTask}
                note={selectedNote}
                tasks={project.tasks}
                predecessors={predecessors}
                canModify={canModify}
                onClose={() => setPropertiesPanelVisible(false)}
                onUpdateTask={handleUpdateTask}
                onUpdateNote={handleUpdateNote}
                onRemoveDependency={handleRemoveDependency}
                onUpdateDependencyType={handleUpdateDependencyType}
              />
            }
          />
        )}
      </div>

      <DesktopStatusBar
        filePath={filePath}
        projectName={project.name}
        selectedTask={selectedTask}
        taskCount={project.tasks.length}
        dependencyCount={project.dependencies.length}
        isModified={isModified}
      />

      <DesktopProjectSettingsPanel
        open={projectSettingsOpen}
        project={project}
        ganttViewSettings={ganttViewSettings}
        onClose={() => setProjectSettingsOpen(false)}
        onSave={handleSettingsSave}
      />

      <DesktopPreferencesPanel open={preferencesOpen} onClose={() => setPreferencesOpen(false)} />

      <UserManagementPanel
        open={userMgmtOpen}
        currentUserId={userId}
        onClose={() => setUserMgmtOpen(false)}
      />

      <MyAccountPanel
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        onUpdated={() => void refresh()}
      />

      <TaskPropertiesDialog
        open={taskPropertiesOpen}
        task={selectedTask}
        tasks={project.tasks}
        predecessors={predecessors}
        canModify={canModify}
        onClose={() => setTaskPropertiesOpen(false)}
        onSave={handleUpdateTask}
        onRemoveDependency={handleRemoveDependency}
        onUpdateDependencyType={handleUpdateDependencyType}
      />

      <AboutDialog
        open={aboutOpen}
        appInfo={aboutInfo}
        loading={aboutLoading}
        onClose={() => setAboutOpen(false)}
      />

      <DesktopGanttExportDialog
        open={ganttExportOpen}
        exporting={ganttExportBusy}
        onClose={() => {
          if (!ganttExportBusy) setGanttExportOpen(false);
        }}
        onExport={(transparentBackground) => void handleGanttImageExport(transparentBackground)}
      />

      {contextMenu && contextMenuItems.length > 0 && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
