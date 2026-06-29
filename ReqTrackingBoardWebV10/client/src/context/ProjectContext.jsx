import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api';
import { useAuth } from './AuthContext';

const STORAGE_KEY = 'activeProjectId';

const ProjectContext = createContext(null);

export function ProjectProvider({ children }) {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectIdState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? Number(saved) : null;
  });
  const [loading, setLoading] = useState(false);

  const refreshProjects = useCallback(async () => {
    if (!user) {
      setProjects([]);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get('/projects/mine');
      setProjects(res.data);
      setActiveProjectIdState(current => {
        if (current && res.data.some(p => p.id === current)) return current;
        return res.data[0]?.id ?? null;
      });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  const setActiveProjectId = useCallback((id) => {
    setActiveProjectIdState(id);
    if (id) localStorage.setItem(STORAGE_KEY, String(id));
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

  const activeProject = useMemo(
    () => projects.find(p => p.id === activeProjectId) ?? null,
    [projects, activeProjectId]
  );

  const isProjectAdmin = useMemo(() => {
    if (!activeProject) return false;
    if (user?.role === 'admin') return true;
    return activeProject.memberRole === 'project_admin';
  }, [activeProject, user]);

  const canEditProject = useMemo(() => {
    if (!activeProject) return false;
    if (user?.role === 'admin') return true;
    if (activeProject.memberRole === 'project_admin') return true;
    return activeProject.memberPermission === 'edit';
  }, [activeProject, user]);

  const value = useMemo(() => ({
    projects,
    activeProject,
    activeProjectId,
    setActiveProjectId,
    refreshProjects,
    loading,
    isProjectAdmin,
    canEditProject,
  }), [projects, activeProject, activeProjectId, setActiveProjectId, refreshProjects, loading, isProjectAdmin, canEditProject]);

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used within ProjectProvider');
  return ctx;
}

export function useProjectParams(extra = {}) {
  const { activeProjectId } = useProject();
  return { projectId: activeProjectId, ...extra };
}
