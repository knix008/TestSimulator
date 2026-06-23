import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createProject,
  getDatabaseConfig,
  getProject,
  getProjectViewSettings,
  listProjects,
  saveProjectViewSettings,
  updateProject,
} from '../api/client';
import { DEFAULT_GANTT_VIEW_SETTINGS, normalizeGanttViewSettings } from '../config/ganttViewSettings';
import { useAuth } from '../context/AuthContext';
import type { DatabaseConfigInfo, GanttViewSettings, ProjectDetail, ProjectSummary, TaskItem } from '../types/project';
import {
  applyTaskDateChange,
  applyTaskProgressChange,
  finalizeSchedule,
  getPredecessors,
  removeDependency,
  resolveDependencyTypeTarget,
  setDependencyType,
  toUpdatePayload,
  tryAddDependency,
  withRecalculatedSchedule,
} from '../utils/scheduleUtils';
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
import { TaskPropertiesPanel } from './TaskPropertiesPanel';
import { UserManagementPanel } from './UserManagementPanel';
import './ProjectView.css';

export function ProjectView() {
  const { isAdmin, canRead, canModify, username, userId, logout, refresh } = useAuth();
  const [dbConfig, setDbConfig] = useState<DatabaseConfigInfo | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [ganttViewSettings, setGanttViewSettings] = useState<GanttViewSettings>(DEFAULT_GANTT_VIEW_SETTINGS);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [dbSettingsOpen, setDbSettingsOpen] = useState(false);
  const [userMgmtOpen, setUserMgmtOpen] = useState(false);
  const [myAccountOpen, setMyAccountOpen] = useState(false);
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [linkSourceTaskId, setLinkSourceTaskId] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    target: ProjectContextMenuTarget;
  } | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

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
        setError('읽기 권한이 없습니다. 관리자에게 권한을 요청하세요.');
        return;
      }

      const projectList = await listProjects();
      setProjects(projectList);

      const targetId = preferredId ?? projectRef.current?.id ?? projectList[0]?.id;
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
      const message = err instanceof Error ? err.message : '일정 저장에 실패했습니다.';
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
    setLinkMode(false);
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
      updateProjectState((current) => ({
        ...current,
        dependencies: removeDependency(current.dependencies, predecessorId, successorId),
      }));
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

  const handleAddTask = useCallback(() => {
    let newTaskId: number | null = null;
    updateProjectState((current) => {
      const result = addTaskAfter(current.tasks, selectedTaskId);
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
        const result = addSubtask(current.tasks, parentId);
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
          ? `"${task.name}" 및 하위 작업 ${subtreeIds.length}개를 삭제하시겠습니까?`
          : `"${task.name}" 작업을 삭제하시겠습니까?`;
      if (!window.confirm(message)) return;

      const deletedId = targetId;
      const idx = project.tasks.findIndex((t) => t.taskId === deletedId);
      let nextSelected: number | null = null;
      updateProjectState((current) => {
        const { tasks, dependencies } = removeTaskSubtree(
          current.tasks,
          current.dependencies,
          deletedId,
        );
        nextSelected =
          tasks[Math.min(idx, tasks.length - 1)]?.taskId ??
          tasks[tasks.length - 1]?.taskId ??
          null;
        return { ...current, tasks, dependencies };
      });
      setSelectedTaskId(nextSelected);
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
          err instanceof Error ? err.message : '주요 경로 표시 설정 저장에 실패했습니다.',
        );
      });
  }, [project?.id]);

  const handleGoToToday = useCallback(() => {
    const scrolled = scrollToTodayRef.current?.() ?? false;
    if (!scrolled) {
      setScheduleError('오늘 날짜가 간트 표시 범위에 없습니다. 프로젝트 일정을 확인하세요.');
    } else {
      setScheduleError(null);
    }
  }, []);

  const handleOpenTaskProperties = useCallback((taskId: number) => {
    setSelectedTaskId(taskId);
    requestAnimationFrame(() => {
      document.querySelector('.project-properties')?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    });
  }, []);

  const handleLinkFromTask = useCallback((taskId: number) => {
    setSelectedTaskId(taskId);
    setLinkSourceTaskId(taskId);
    setLinkMode(true);
  }, []);

  const handleUnlinkFromTask = useCallback(
    (taskId: number) => {
      const outgoingCount =
        project?.dependencies.filter((dep) => dep.predecessorId === taskId).length ?? 0;
      if (outgoingCount === 0) {
        setScheduleError('이 작업에서 나가는 의존성이 없습니다.');
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
            err instanceof Error ? err.message : '의존성 종류 기본값 저장에 실패했습니다.',
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
      ganttViewSettings,
      linkSourceTaskId,
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
        removeDependency: handleRemoveDependency,
        goToToday: handleGoToToday,
        zoomIn: handleGanttZoomIn,
        zoomOut: handleGanttZoomOut,
      },
    });
  }, [
    contextMenu,
    project,
    ganttViewSettings,
    linkSourceTaskId,
    canModify,
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
    handleRemoveDependency,
    handleGoToToday,
    handleGanttZoomIn,
    handleGanttZoomOut,
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

  const predecessors =
    project && selectedTaskId != null ? getPredecessors(project.dependencies, selectedTaskId) : [];

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
        linkMode={linkMode}
        saveStatus={saveStatus}
        hasUnsavedChanges={hasUnsavedChanges}
        onSaveSchedule={handleSaveNow}
        onSelectProject={handleSelectProject}
        onCreateProject={handleCreateProject}
        onRefresh={async () => {
          await flushPendingSave();
          void loadProjects(project?.id);
        }}
        onLogout={() => void logout()}
        onOpenDatabaseSettings={() => setDbSettingsOpen(true)}
        onOpenUserManagement={() => setUserMgmtOpen(true)}
        onOpenMyAccount={() => setMyAccountOpen(true)}
        onOpenProjectSettings={() => setProjectSettingsOpen(true)}
        onToggleLinkMode={() => {
          setLinkMode((current) => {
            if (current) setLinkSourceTaskId(null);
            return !current;
          });
        }}
        onAddTask={handleAddTask}
        onAddSubtask={handleAddSubtask}
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

      {project && !dbConfig?.requiresAdminSetup && (
        <div className="project-sync-banner">
          <p>
            일정 데이터는 <strong>MyProjectWinV10</strong>과 같은 DB를 공유합니다. Win 프로그램에서
            편집한 내용은 <strong>새로고침</strong>으로 불러옵니다. 웹에서 수정한 내용도 DB에
            저장되며 Win에서 다시 열면 반영됩니다.
          </p>
        </div>
      )}

      {dbConfig?.requiresAdminSetup && (
        <div className="project-setup-banner">
          <div>
            <strong>DB 연결이 필요합니다.</strong>
            <p>
              관리자로 로그인한 뒤 DB 서버 연결을 설정하세요. 기존 myproject DB가 있으면
              그대로 사용하며, 일정 데이터는 유지됩니다.
            </p>
            {dbConfig.connectionError && <p>{dbConfig.connectionError}</p>}
          </div>
          <button type="button" onClick={() => setDbSettingsOpen(true)}>
            DB 설정 열기
          </button>
        </div>
      )}

      {error && <div className="project-error">{error}</div>}
      {scheduleError && <div className="project-error">{scheduleError}</div>}

      {!error && !project && !loading && !dbConfig?.requiresAdminSetup && canRead && (
        <div className="project-empty">
          <p>Win 프로그램에서 만든 프로젝트가 여기에 표시됩니다. 프로젝트가 없으면 Win에서 먼저 생성하세요.</p>
          {canModify && (
            <button type="button" onClick={handleCreateProject}>
              웹에서 새 프로젝트 만들기
            </button>
          )}
        </div>
      )}

      {project && (
        <>
          {canRead && (
            <div className="project-schedule-hint">
              {linkMode
                ? '선행 작업을 클릭한 뒤 후행 작업을 클릭하거나, Alt+드래그로 의존성을 연결하세요.'
                : [
                    canModify
                      ? '변경 사항은 자동 저장됩니다. 저장 버튼으로 즉시 DB에 반영할 수 있습니다.'
                      : null,
                    '빨간 점선·상단 원과 헤더의 검은 배경 숫자가 오늘 날짜입니다.',
                    '「오늘로 이동」(Ctrl+T)으로 오늘 위치로 스크롤합니다.',
                    canModify
                      ? '작업 추가/삭제: Insert·Delete, 계층 변경: Alt+→/←'
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' ')}
            </div>
          )}
          <div className="project-split">
            <div className="project-grid-pane">
              <TaskGrid
                tasks={project.tasks}
                selectedTaskId={selectedTaskId}
                canModify={canModify}
                showCriticalPath={ganttViewSettings.showCriticalPath}
                scrollContainerRef={gridScrollRef}
                onSelectTask={setSelectedTaskId}
                onUpdateTask={handleUpdateTask}
                onToggleExpand={handleToggleExpand}
                onContextMenuRequest={handleContextMenuRequest}
              />
            </div>
            <div className="project-gantt-pane">
              <GanttChart
                tasks={project.tasks}
                dependencies={project.dependencies}
                workingDaysJson={project.workingDaysJson}
                ganttViewSettings={ganttViewSettings}
                selectedTaskId={selectedTaskId}
                canModify={canModify}
                linkMode={linkMode}
                linkSourceTaskId={linkSourceTaskId}
                scrollContainerRef={ganttScrollRef}
                scrollToTodayRef={scrollToTodayRef}
                zoomRef={ganttZoomRef}
                onSelectTask={setSelectedTaskId}
                onTaskDateChange={handleTaskDateChange}
                onTaskProgressChange={handleTaskProgressChange}
                onAddDependency={handleAddDependency}
                onContextMenuRequest={handleContextMenuRequest}
              />
            </div>
          </div>

          <footer className="project-properties">
            <TaskPropertiesPanel
              task={selectedTask}
              tasks={project.tasks}
              predecessors={predecessors}
              canModify={canModify}
              onUpdateTask={handleUpdateTask}
              onRemoveDependency={handleRemoveDependency}
            />
          </footer>
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
          setHasUnsavedChanges(false);
          pendingSaveRef.current = null;
        }}
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
