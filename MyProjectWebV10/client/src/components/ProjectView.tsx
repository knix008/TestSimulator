import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createProject,
  deleteProject,
  downloadProjectExport,
  getDatabaseConfig,
  getProject,
  getProjectViewSettings,
  importProjectExcel,
  listProjects,
  saveProjectViewSettings,
  updateProject,
  type ProjectExportFormat,
} from '../api/client';
import { DEFAULT_GANTT_VIEW_SETTINGS, normalizeGanttViewSettings } from '../config/ganttViewSettings';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../i18n';
import type { DatabaseConfigInfo, GanttViewSettings, ProjectDetail, ProjectSummary, TaskItem } from '../types/project';
import {
  applyTaskDateChange,
  applyTaskProgressChange,
  finalizeSchedule,
  getPredecessors,
  removeDependency,
  resolveDependencyTypeTarget,
  setDependencyLineEnd,
  setDependencyType,
  toUpdatePayload,
  tryAddDependency,
  withRecalculatedSchedule,
} from '../utils/scheduleUtils';
import { applyTaskResourcesFromColumns } from '../utils/taskResources';
import {
  createNoteForTask,
  nextNoteId,
  removeNoteFromProject,
  removeNotesForTaskIds,
  syncTaskNotesFromLinkedNote,
  updateNoteBodyInProject,
  updateNotePositionInProject,
} from '../utils/projectNotes';
import { syncSplitScroll } from '../utils/splitScroll';
import {
  buildProjectContextMenu,
  type DependencyTypeSelection,
  type DependencyTypeValue,
  type ProjectContextMenuTarget,
} from '../utils/projectContextMenu';
import { parseWorkingWeek } from '../utils/workingWeek';
import {
  addSubtask,
  addTaskAfter,
  canIndentTask,
  canOutdentTask,
  getSubtreeTaskIds,
  getVisibleTasks,
  indentTask,
  isSchedulePatch,
  outdentTask,
  removeInvalidHierarchyDependencies,
  removeTaskSubtree,
  updateTaskInList,
} from '../utils/taskModel';
import { applyScheduleCascadeFromTask } from '../utils/scheduleRecalculation';
import { DatabaseSettingsPanel } from './DatabaseSettingsPanel';
import { ContextMenu } from './ContextMenu';
import { GanttChart } from './GanttChart';
import { MyAccountPanel } from './MyAccountPanel';
import { ProjectSettingsPanel } from './ProjectSettingsPanel';
import { ProjectToolbar } from './ProjectToolbar';
import { TaskGrid } from './TaskGrid';
import { ProjectSplitPane } from './ProjectSplitPane';
import { TaskPropertiesDialog } from './TaskPropertiesDialog';
import { TaskPropertiesPanel } from './TaskPropertiesPanel';
import { UserManagementPanel } from './UserManagementPanel';
import './ProjectView.css';

export function ProjectView() {
  const { isAdmin, canRead, canModify, username, userId, logout, refresh } = useAuth();
  const t = useTranslation();
  const [dbConfig, setDbConfig] = useState<DatabaseConfigInfo | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [ganttViewSettings, setGanttViewSettings] = useState<GanttViewSettings>(DEFAULT_GANTT_VIEW_SETTINGS);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [selectedDependency, setSelectedDependency] = useState<{
    predecessorId: number;
    successorId: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [dbSettingsOpen, setDbSettingsOpen] = useState(false);
  const [userMgmtOpen, setUserMgmtOpen] = useState(false);
  const [myAccountOpen, setMyAccountOpen] = useState(false);
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);
  const [taskPropertiesDialogTaskId, setTaskPropertiesDialogTaskId] = useState<number | null>(null);
  const [linkSourceTaskId, setLinkSourceTaskId] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    target: ProjectContextMenuTarget;
  } | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [exportImportBusy, setExportImportBusy] = useState(false);

  const saveTimerRef = useRef<number | null>(null);
  const pendingSaveRef = useRef<ProjectDetail | null>(null);
  const projectRef = useRef<ProjectDetail | null>(null);
  const ganttViewSettingsRef = useRef(ganttViewSettings);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const ganttScrollRef = useRef<HTMLDivElement>(null);
  const scrollToTodayRef = useRef<(() => boolean) | null>(null);
  const ganttZoomRef = useRef<{ zoomIn: () => void; zoomOut: () => void } | null>(null);
  const isSyncingScrollRef = useRef(false);
  projectRef.current = project;
  ganttViewSettingsRef.current = ganttViewSettings;

  const loadDatabaseConfig = useCallback(async () => {
    const config = await getDatabaseConfig();
    setDbConfig(config);
    return config;
  }, []);

  const loadProjects = useCallback(async (preferredId?: number) => {
    setLoading(true);
    setError(null);
    try {
      const config = await loadDatabaseConfig();
      if (config.requiresAdminSetup) {
        setProjects([]);
        setProject(null);
        setSelectedTaskId(null);
        return;
      }

      if (!canRead) {
        setProjects([]);
        setProject(null);
        setSelectedTaskId(null);
        setError(t('project.noReadPermission'));
        return;
      }

      const projectList = await listProjects();
      setProjects(projectList);

      const targetId =
        preferredId ??
        (projectList.some((entry) => entry.id === projectRef.current?.id)
          ? projectRef.current?.id
          : undefined) ??
        projectList[0]?.id;
      if (targetId) {
        const detail = withRecalculatedSchedule(await getProject(targetId));
        setProject(detail);
        setSelectedTaskId(detail.tasks[0]?.taskId ?? null);
      } else {
        setProject(null);
        setSelectedTaskId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, [loadDatabaseConfig, canRead]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (!project?.id) return;
    getProjectViewSettings(project.id)
      .then((settings) => setGanttViewSettings(normalizeGanttViewSettings(settings)))
      .catch(() => setGanttViewSettings(DEFAULT_GANTT_VIEW_SETTINGS));
  }, [project?.id, userId]);

  const persistProject = useCallback(async (nextProject: ProjectDetail) => {
    setSaveStatus('saving');
    setScheduleError(null);
    try {
      const saved = withRecalculatedSchedule(await updateProject(nextProject.id, toUpdatePayload(nextProject)));
      setProject(saved);
      pendingSaveRef.current = null;
      setHasUnsavedChanges(false);
      setSaveStatus('saved');
      window.setTimeout(() => setSaveStatus('idle'), 2000);
      return true;
    } catch (err) {
      setSaveStatus('error');
      const message = err instanceof Error ? err.message : t('project.saveFailed');
      setScheduleError(message);
      if (message.includes('다른 프로그램에서 일정이 변경')) {
        try {
          const fresh = withRecalculatedSchedule(await getProject(nextProject.id));
          setProject(fresh);
          pendingSaveRef.current = null;
          setHasUnsavedChanges(false);
        } catch {
          // Keep the conflict message visible.
        }
      }
      return false;
    }
  }, []);

  const flushPendingSave = useCallback(async () => {
    if (!canModify) return true;
    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pending = pendingSaveRef.current;
    if (!pending) return true;
    return persistProject(pending);
  }, [canModify, persistProject]);

  const scheduleSave = useCallback(
    (nextProject: ProjectDetail) => {
      if (!canModify) return;
      pendingSaveRef.current = nextProject;
      setHasUnsavedChanges(true);
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        void persistProject(nextProject);
      }, 800);
    },
    [canModify, persistProject],
  );

  const handleSaveNow = useCallback(() => {
    void flushPendingSave();
  }, [flushPendingSave]);

  const handleExport = useCallback(
    async (format: ProjectExportFormat) => {
      if (!project?.id) return;
      setExportImportBusy(true);
      setScheduleError(null);
      try {
        await downloadProjectExport(project.id, format);
      } catch (err) {
        setScheduleError(err instanceof Error ? err.message : t('project.exportFailed'));
      } finally {
        setExportImportBusy(false);
      }
    },
    [project?.id],
  );

  const handleImportExcel = useCallback(
    async (file: File) => {
      if (!project?.id || !canModify) return;

      if (hasUnsavedChanges) {
        const proceed = window.confirm(
          t('project.importConfirm'),
        );
        if (!proceed) return;
      }

      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      pendingSaveRef.current = null;
      setHasUnsavedChanges(false);

      setExportImportBusy(true);
      setScheduleError(null);
      try {
        const imported = withRecalculatedSchedule(
          await importProjectExcel(project.id, file, project.version),
        );
        setProject(imported);
        setSelectedTaskId(imported.tasks[0]?.taskId ?? null);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Excel 가져오기에 실패했습니다.';
        setScheduleError(message);
        if (message.includes('다른 프로그램에서 일정이 변경')) {
          try {
            const fresh = withRecalculatedSchedule(await getProject(project.id));
            setProject(fresh);
            setSelectedTaskId(fresh.tasks[0]?.taskId ?? null);
            setHasUnsavedChanges(false);
          } catch {
            // Keep the conflict message visible.
          }
        }
      } finally {
        setExportImportBusy(false);
      }
    },
    [canModify, hasUnsavedChanges, project?.id, project?.version],
  );

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && pendingSaveRef.current) {
        void flushPendingSave();
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [hasUnsavedChanges, flushPendingSave]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      const pending = pendingSaveRef.current;
      if (pending && canModify) {
        void updateProject(pending.id, toUpdatePayload(pending));
      }
    };
  }, [canModify]);

  useEffect(() => {
    const grid = gridScrollRef.current;
    const gantt = ganttScrollRef.current;
    if (!grid || !gantt) return;

    const syncScroll = (source: 'grid' | 'gantt') => {
      if (isSyncingScrollRef.current) return;
      isSyncingScrollRef.current = true;
      if (source === 'grid') {
        syncSplitScroll(grid, gantt);
      } else {
        syncSplitScroll(gantt, grid);
      }
      isSyncingScrollRef.current = false;
    };

    const onGridScroll = () => syncScroll('grid');
    const onGanttScroll = () => syncScroll('gantt');
    grid.addEventListener('scroll', onGridScroll, { passive: true });
    gantt.addEventListener('scroll', onGanttScroll, { passive: true });

    return () => {
      grid.removeEventListener('scroll', onGridScroll);
      gantt.removeEventListener('scroll', onGanttScroll);
    };
  }, [project?.id, project ? getVisibleTasks(project.tasks).length : 0]);

  const handleSelectProject = async (id: number) => {
    if (pendingSaveRef.current || saveTimerRef.current != null) {
      const saved = await flushPendingSave();
      if (!saved) return;
    }

    setLoading(true);
    setError(null);
    setScheduleError(null);
    setLinkSourceTaskId(null);
    setHasUnsavedChanges(false);
    pendingSaveRef.current = null;
    try {
      const detail = withRecalculatedSchedule(await getProject(id));
      setProject(detail);
      setSelectedTaskId(detail.tasks[0]?.taskId ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async () => {
    setLoading(true);
    setError(null);
    try {
      const created = await createProject('New Project');
      await loadProjects(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
      setLoading(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!project?.id || !canModify) return;
    const confirmed = window.confirm(
      t('project.deleteConfirm', { name: project.name }),
    );
    if (!confirmed) return;

    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    pendingSaveRef.current = null;
    setHasUnsavedChanges(false);
    setProjectSettingsOpen(false);

    setLoading(true);
    setError(null);
    setScheduleError(null);
    try {
      await deleteProject(project.id);
      projectRef.current = null;
      await loadProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('project.deleteFailed'));
      setLoading(false);
    }
  };

  const updateProjectState = useCallback(
    (updater: (current: ProjectDetail) => ProjectDetail) => {
      setProject((current) => {
        if (!current) return current;
        const next = updater(current);
        const tasks = finalizeSchedule(next.tasks, next.dependencies, next);
        const finalized = { ...next, tasks };
        scheduleSave(finalized);
        return finalized;
      });
    },
    [scheduleSave],
  );

  const handleTaskDateChange = useCallback(
    (taskId: number, start: Date, end: Date) => {
      updateProjectState((current) => {
        const week = parseWorkingWeek(current.workingDaysJson);
        const tasks = current.tasks.map((task) =>
          task.taskId === taskId ? applyTaskDateChange(task, start, end, week) : task,
        );
        const cascaded = applyScheduleCascadeFromTask(
          tasks,
          current.dependencies,
          current,
          taskId,
        );
        return { ...current, tasks: cascaded };
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
        const defaults = ganttViewSettingsRef.current;
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
        current?.predecessorId === predecessorId && current?.successorId === successorId
          ? null
          : current,
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
        dependencies: setDependencyLineEnd(
          current.dependencies,
          predecessorId,
          successorId,
          which,
          style,
        ),
      }));
      setScheduleError(null);
    },
    [updateProjectState],
  );

  const handleUpdateTask = useCallback(
    (taskId: number, patch: Partial<TaskItem>) => {
      updateProjectState((current) => {
        let tasks = updateTaskInList(current.tasks, taskId, patch, current.workingDaysJson);
        if (isSchedulePatch(patch)) {
          tasks = applyScheduleCascadeFromTask(
            tasks,
            current.dependencies,
            current,
            taskId,
          );
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
        const tasks = updateTaskInList(
          current.tasks,
          taskId,
          { assignedTo },
          current.workingDaysJson,
        );
        return { ...current, assignments, tasks };
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
    if (newTaskId != null) {
      setSelectedTaskId(newTaskId);
    }
  }, [selectedTaskId, updateProjectState]);

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
      if (newTaskId != null) {
        setSelectedTaskId(newTaskId);
      }
    },
    [handleAddTask, selectedTaskId, updateProjectState],
  );

  const handleDeleteTask = useCallback(
    (taskId?: number) => {
      const targetId = taskId ?? selectedTaskId;
      if (targetId == null || !project) return;
      const task = project.tasks.find((t) => t.taskId === targetId);
      if (!task) return;
      const subtreeIds = getSubtreeTaskIds(project.tasks, targetId);
      const message =
        subtreeIds.length > 1
          ? t('project.deleteTaskConfirmSubtree', { name: task.name, count: subtreeIds.length })
          : t('project.deleteTaskConfirm', { name: task.name });
      if (!window.confirm(message)) return;

      const deletedId = targetId;
      const idx = project.tasks.findIndex((t) => t.taskId === deletedId);
      let nextSelected: number | null = null;
      updateProjectState((current) => {
        const removeIds = new Set(subtreeIds);
        const { tasks, dependencies } = removeTaskSubtree(
          current.tasks,
          current.dependencies,
          deletedId,
        );
        nextSelected =
          tasks[Math.min(idx, tasks.length - 1)]?.taskId ??
          tasks[tasks.length - 1]?.taskId ??
          null;
        return {
          ...current,
          tasks,
          dependencies,
          assignments: (current.assignments ?? []).filter(
            (assignment) => !removeIds.has(assignment.taskId),
          ),
          ganttNotes: removeNotesForTaskIds(current.ganttNotes ?? [], removeIds),
        };
      });
      setSelectedTaskId(nextSelected);
      setSelectedNoteId(null);
      setEditingNoteId(null);
    },
    [project, selectedTaskId, updateProjectState],
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
    if (!project?.id) return;
    const next = normalizeGanttViewSettings({
      ...ganttViewSettingsRef.current,
      showCriticalPath: !ganttViewSettingsRef.current.showCriticalPath,
    });
    setGanttViewSettings(next);
    ganttViewSettingsRef.current = next;
    void saveProjectViewSettings(project.id, next)
      .then((saved) => {
        const normalized = normalizeGanttViewSettings(saved);
        setGanttViewSettings(normalized);
        ganttViewSettingsRef.current = normalized;
      })
      .catch((err) => {
        setScheduleError(
          err instanceof Error ? err.message : t('project.criticalPathSaveFailed'),
        );
      });
  }, [project?.id]);

  const handleGoToToday = useCallback(() => {
    const scrolled = scrollToTodayRef.current?.() ?? false;
    if (!scrolled) {
      setScheduleError(t('project.todayOutOfRange'));
    } else {
      setScheduleError(null);
    }
  }, []);

  const handleSelectTask = useCallback((taskId: number) => {
    setSelectedTaskId(taskId);
    setSelectedDependency(null);
    setSelectedNoteId(null);
    setEditingNoteId(null);
  }, []);

  const handleSelectNote = useCallback(
    (noteId: number) => {
      setSelectedNoteId(noteId);
      setSelectedDependency(null);
      const note = project?.ganttNotes?.find((entry) => entry.noteId === noteId);
      if (note && note.taskId >= 0) {
        setSelectedTaskId(note.taskId);
      }
    },
    [project?.ganttNotes],
  );

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
        return {
          ...current,
          ganttNotes: [...(current.ganttNotes ?? []), note],
        };
      });
      if (newNoteId != null) {
        setSelectedNoteId(newNoteId);
        setSelectedTaskId(taskId);
        setEditingNoteId(newNoteId);
      }
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
        ganttNotes: updateNotePositionInProject(
          current.ganttNotes ?? [],
          noteId,
          anchorDate,
          contentY,
        ),
      }));
    },
    [updateProjectState],
  );

  const handleAddNoteToSelectedTask = useCallback(() => {
    if (selectedTaskId == null) return;
    handleAddNoteToTask(selectedTaskId);
  }, [selectedTaskId, handleAddNoteToTask]);

  const handleEditNote = useCallback(
    (noteId: number) => {
      setSelectedNoteId(noteId);
      setEditingNoteId(noteId);
      const note = project?.ganttNotes?.find((entry) => entry.noteId === noteId);
      if (note && note.taskId >= 0) {
        setSelectedTaskId(note.taskId);
      }
    },
    [project?.ganttNotes],
  );

  const handleDeleteNote = useCallback(
    (noteId: number) => {
      if (!window.confirm(t('project.deleteNoteConfirm'))) return;
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

  const handleSelectDependency = useCallback(
    (dependency: { predecessorId: number; successorId: number }) => {
      setSelectedDependency(dependency);
      setSelectedTaskId(dependency.successorId);
    },
    [],
  );

  const handleOpenTaskProperties = useCallback((taskId: number) => {
    setSelectedTaskId(taskId);
    setSelectedDependency(null);
    setSelectedNoteId(null);
    setEditingNoteId(null);
    setTaskPropertiesDialogTaskId(taskId);
  }, []);

  const handleLinkFromTask = useCallback((taskId: number) => {
    setSelectedTaskId(taskId);
    setLinkSourceTaskId(taskId);
  }, []);

  const handleCancelLinkMode = useCallback(() => {
    setLinkSourceTaskId(null);
  }, []);

  const handleUnlinkFromTask = useCallback(
    (taskId: number) => {
      const outgoingCount =
        project?.dependencies.filter((dep) => dep.predecessorId === taskId).length ?? 0;
      if (outgoingCount === 0) {
        setScheduleError(t('project.noOutgoingDeps'));
        return;
      }
      updateProjectState((current) => ({
        ...current,
        dependencies: current.dependencies.filter((dep) => dep.predecessorId !== taskId),
      }));
      setScheduleError(null);
    },
    [project?.dependencies, updateProjectState],
  );

  const handleGanttZoomIn = useCallback(() => {
    ganttZoomRef.current?.zoomIn();
  }, []);

  const handleGanttZoomOut = useCallback(() => {
    ganttZoomRef.current?.zoomOut();
  }, []);

  const persistDefaultDependencyType = useCallback(
    (type: DependencyTypeValue) => {
      if (!project?.id) return;
      const next = normalizeGanttViewSettings({
        ...ganttViewSettingsRef.current,
        defaultDependencyType: type,
      });
      setGanttViewSettings(next);
      ganttViewSettingsRef.current = next;
      void saveProjectViewSettings(project.id, next)
        .then((saved) => {
          const normalized = normalizeGanttViewSettings(saved);
          setGanttViewSettings(normalized);
          ganttViewSettingsRef.current = normalized;
        })
        .catch((err) => {
          setScheduleError(
            err instanceof Error ? err.message : t('project.depTypeSaveFailed'),
          );
        });
    },
    [project?.id],
  );

  const handleSelectDependencyType = useCallback(
    (type: DependencyTypeValue, selection: DependencyTypeSelection) => {
      persistDefaultDependencyType(type);

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

      const exists = project?.dependencies.some(
        (dep) =>
          dep.predecessorId === target.predecessorId && dep.successorId === target.successorId,
      );
      if (!exists) {
        setScheduleError(null);
        return;
      }

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
    [linkSourceTaskId, persistDefaultDependencyType, project?.dependencies, updateProjectState],
  );

  const handleContextMenuRequest = useCallback(
    (target: ProjectContextMenuTarget, clientX: number, clientY: number) => {
      if (!project) return;
      setContextMenu({ x: clientX, y: clientY, target });
    },
    [project],
  );

  const contextMenuItems = useMemo(() => {
    if (!contextMenu || !project) return [];
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
        openTaskProperties: handleOpenTaskProperties,
        addTask: handleAddTask,
        addSubtask: handleAddSubtask,
        deleteTask: handleDeleteTask,
        indentTask: handleIndentTask,
        outdentTask: handleOutdentTask,
        linkFromTask: handleLinkFromTask,
        unlinkFromTask: handleUnlinkFromTask,
        toggleExpandTask: handleToggleExpand,
        setDependencyType: handleSelectDependencyType,
        setDependencyLineEnd: handleSetDependencyLineEnd,
        removeDependency: handleRemoveDependency,
        goToToday: handleGoToToday,
        zoomIn: handleGanttZoomIn,
        zoomOut: handleGanttZoomOut,
        addNoteToTask: handleAddNoteToTask,
        editNote: handleEditNote,
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
    canModify,
    t,
    handleOpenTaskProperties,
    handleAddTask,
    handleAddSubtask,
    handleDeleteTask,
    handleIndentTask,
    handleOutdentTask,
    handleLinkFromTask,
    handleUnlinkFromTask,
    handleToggleExpand,
    handleSelectDependencyType,
    handleSetDependencyLineEnd,
    handleRemoveDependency,
    handleGoToToday,
    handleGanttZoomIn,
    handleGanttZoomOut,
    handleAddNoteToTask,
    handleEditNote,
    handleDeleteNote,
    handleSelectTask,
  ]);

  useEffect(() => {
    if (!canRead || !project) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey && (e.key === 't' || e.key === 'T'))) return;
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      handleGoToToday();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canRead, project, handleGoToToday]);

  useEffect(() => {
    if (!canModify || !project) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.key === 'Insert') {
        e.preventDefault();
        handleAddTask();
      } else if (e.key === 'Delete') {
        if (selectedTaskId != null) {
          e.preventDefault();
          handleDeleteTask();
        }
      } else if (e.altKey && e.key === 'ArrowRight' && selectedTaskId != null) {
        e.preventDefault();
        handleIndentTask();
      } else if (e.altKey && e.key === 'ArrowLeft' && selectedTaskId != null) {
        e.preventDefault();
        handleOutdentTask();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    canModify,
    project,
    handleAddTask,
    handleDeleteTask,
    handleIndentTask,
    handleOutdentTask,
    selectedTaskId,
  ]);

  const selectedTask: TaskItem | null =
    project?.tasks.find((task) => task.taskId === selectedTaskId) ?? null;

  const taskPropertiesDialogTask: TaskItem | null =
    taskPropertiesDialogTaskId != null
      ? project?.tasks.find((task) => task.taskId === taskPropertiesDialogTaskId) ?? null
      : null;

  const taskPropertiesDialogPredecessors =
    project && taskPropertiesDialogTaskId != null
      ? getPredecessors(project.dependencies, taskPropertiesDialogTaskId)
      : [];

  const predecessors =
    project && selectedTaskId != null ? getPredecessors(project.dependencies, selectedTaskId) : [];

  useEffect(() => {
    if (taskPropertiesDialogTaskId != null && !taskPropertiesDialogTask) {
      setTaskPropertiesDialogTaskId(null);
    }
  }, [taskPropertiesDialogTaskId, taskPropertiesDialogTask]);

  return (
    <div className="project-view">
      <ProjectToolbar
        dbConfig={dbConfig}
        projects={projects}
        currentProjectId={project?.id ?? null}
        loading={loading}
        isAdmin={isAdmin}
        canModify={canModify}
        canRead={canRead}
        username={username}
        linkMode={linkSourceTaskId != null}
        saveStatus={saveStatus}
        hasUnsavedChanges={hasUnsavedChanges}
        onSaveSchedule={handleSaveNow}
        onSelectProject={handleSelectProject}
        onCreateProject={handleCreateProject}
        onDeleteProject={handleDeleteProject}
        canDeleteProject={canModify && project != null}
        onRefresh={async () => {
          await flushPendingSave();
          void loadProjects(project?.id);
        }}
        onLogout={() => void logout()}
        onOpenDatabaseSettings={() => setDbSettingsOpen(true)}
        onOpenUserManagement={() => setUserMgmtOpen(true)}
        onOpenMyAccount={() => setMyAccountOpen(true)}
        onOpenProjectSettings={() => setProjectSettingsOpen(true)}
        onToggleLinkMode={handleCancelLinkMode}
        onAddTask={handleAddTask}
        onAddSubtask={handleAddSubtask}
        onAddNote={handleAddNoteToSelectedTask}
        canAddNote={selectedTaskId != null}
        onDeleteTask={handleDeleteTask}
        canDeleteTask={selectedTaskId != null && (project?.tasks.length ?? 0) > 0}
        onIndentTask={handleIndentTask}
        onOutdentTask={handleOutdentTask}
        canIndentTask={
          selectedTaskId != null && canIndentTask(project?.tasks ?? [], selectedTaskId)
        }
        canOutdentTask={
          selectedTaskId != null && canOutdentTask(project?.tasks ?? [], selectedTaskId)
        }
        showCriticalPath={ganttViewSettings.showCriticalPath}
        onToggleCriticalPath={handleToggleCriticalPath}
        onGoToToday={handleGoToToday}
        canGoToToday={(project?.tasks.length ?? 0) > 0}
        onExport={handleExport}
        onImportExcel={canModify ? handleImportExcel : undefined}
        exportImportBusy={exportImportBusy}
        scheduleRevision={
          project
            ? {
                updatedUtc: project.updatedUtc,
                updatedBy: project.updatedBy ?? null,
                version: project.version,
              }
            : null
        }
      />

      {dbConfig?.requiresAdminSetup && (
        <div className="project-setup-banner">
          <div>
            <strong>{t('project.setupBanner.title')}</strong>
            <p>{t('project.setupBanner.desc')}</p>
            {dbConfig.connectionError && <p>{dbConfig.connectionError}</p>}
          </div>
          <button type="button" onClick={() => setDbSettingsOpen(true)}>
            {t('project.setupBanner.openDb')}
          </button>
        </div>
      )}

      {error && <div className="project-error">{error}</div>}
      {scheduleError && <div className="project-error">{scheduleError}</div>}

      {!error && !project && !loading && !dbConfig?.requiresAdminSetup && canRead && (
        <div className="project-empty">
          <p>{t('project.empty')}</p>
          {canModify && (
            <button type="button" onClick={handleCreateProject}>
              {t('project.createWeb')}
            </button>
          )}
        </div>
      )}

      {project && (
        <>
          <ProjectSplitPane
            gridPane={
              <TaskGrid
                projectName={project.name}
                tasks={project.tasks}
                assignments={project.assignments ?? []}
                selectedTaskId={selectedTaskId}
                canModify={canModify}
                showCriticalPath={ganttViewSettings.showCriticalPath}
                ganttNotes={project.ganttNotes ?? []}
                scrollContainerRef={gridScrollRef}
                onSelectTask={handleSelectTask}
                onUpdateTask={handleUpdateTask}
                onUpdateTaskResources={handleUpdateTaskResources}
                onToggleExpand={handleToggleExpand}
                onContextMenuRequest={handleContextMenuRequest}
              />
            }
            ganttPane={
              <GanttChart
                tasks={project.tasks}
                dependencies={project.dependencies}
                ganttNotes={project.ganttNotes ?? []}
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
                onSelectDependency={handleSelectDependency}
                onTaskDateChange={handleTaskDateChange}
                onTaskProgressChange={handleTaskProgressChange}
                onAddDependency={handleAddDependency}
                onClearLinkSource={() => setLinkSourceTaskId(null)}
                onCancelLinkMode={handleCancelLinkMode}
                onContextMenuRequest={handleContextMenuRequest}
              />
            }
          />

          {linkSourceTaskId == null && (
            <footer className="project-properties">
              <TaskPropertiesPanel
                task={selectedTask}
                tasks={project.tasks}
                predecessors={predecessors}
                canModify={canModify}
                onUpdateTask={handleUpdateTask}
                onRemoveDependency={handleRemoveDependency}
                onUpdateDependencyType={handleUpdateDependencyType}
              />
            </footer>
          )}
        </>
      )}

      <DatabaseSettingsPanel
        open={dbSettingsOpen}
        onClose={() => setDbSettingsOpen(false)}
        onSaved={() => void loadProjects(project?.id)}
      />
      <UserManagementPanel
        open={userMgmtOpen}
        currentUserId={userId}
        onClose={() => setUserMgmtOpen(false)}
      />
      <MyAccountPanel
        open={myAccountOpen}
        onClose={() => setMyAccountOpen(false)}
        onUpdated={() => void refresh()}
      />
      <ProjectSettingsPanel
        open={projectSettingsOpen}
        projectId={project?.id ?? null}
        project={project}
        canModify={canModify}
        onClose={() => setProjectSettingsOpen(false)}
        onSavedViewSettings={setGanttViewSettings}
        onSavedProject={(saved) => {
          setProject(saved);
          setProjects((current) =>
            current.map((entry) =>
              entry.id === saved.id
                ? {
                    ...entry,
                    name: saved.name,
                    updatedUtc: saved.updatedUtc,
                    version: saved.version,
                    updatedBy: saved.updatedBy,
                  }
                : entry,
            ),
          );
          setHasUnsavedChanges(false);
          pendingSaveRef.current = null;
        }}
        onDeletedProject={() => void loadProjects()}
      />

      <TaskPropertiesDialog
        open={taskPropertiesDialogTaskId != null && taskPropertiesDialogTask != null}
        task={taskPropertiesDialogTask}
        tasks={project?.tasks ?? []}
        predecessors={taskPropertiesDialogPredecessors}
        canModify={canModify}
        onClose={() => setTaskPropertiesDialogTaskId(null)}
        onSave={handleUpdateTask}
        onRemoveDependency={handleRemoveDependency}
        onUpdateDependencyType={handleUpdateDependencyType}
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
