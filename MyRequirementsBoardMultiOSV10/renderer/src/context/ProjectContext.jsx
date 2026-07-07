import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../api/client.js';
import { useAuth } from './AuthContext.jsx';

const ProjectContext = createContext(null);

export function ProjectProvider({ children }) {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [loading, setLoading] = useState(false);

  const refreshProjects = async () => {
    if (!user) {
      setProjects([]);
      setActiveProject(null);
      return;
    }
    setLoading(true);
    try {
      const [list, prefs] = await Promise.all([
        api.listProjects(false),
        api.getUserPreferences().catch(() => null),
      ]);
      setProjects(list);
      let savedId = prefs?.activeProjectId;
      if (!savedId) {
        const legacyId = Number(localStorage.getItem('mrb_active_project_id'));
        if (legacyId) {
          savedId = legacyId;
          localStorage.removeItem('mrb_active_project_id');
          void api.patchUserPreferences({ activeProjectId: legacyId }).catch(() => {});
        }
      }
      const saved = savedId ? list.find((p) => p.id === savedId) : null;
      const next = saved || list[0] || null;
      setActiveProject(next);
      if (next && savedId !== next.id) {
        void api.patchUserPreferences({ activeProjectId: next.id }).catch(() => {});
      }
    } finally {
      setLoading(false);
    }
  };

  const syncProject = useCallback((project) => {
    if (!project?.id) return;
    setProjects((prev) => prev.map((item) => (
      item.id === project.id ? { ...item, ...project } : item
    )));
    setActiveProject((prev) => (
      prev?.id === project.id ? { ...prev, ...project } : prev
    ));
  }, []);
  const selectProject = (project) => {
    setActiveProject(project);
    void api.patchUserPreferences({ activeProjectId: project?.id ?? null }).catch(() => {});
  };

  const updateActiveProjectUiSettings = useCallback((uiSettings) => {
    setActiveProject((prev) => (prev ? { ...prev, uiSettings } : prev));
    setProjects((prev) => prev.map((project) => (
      project.id === activeProject?.id ? { ...project, uiSettings } : project
    )));
  }, [activeProject?.id]);

  const canEditProject = Boolean(activeProject?.canEdit);
  const canManageProject = Boolean(activeProject?.canManage);

  useEffect(() => {
    refreshProjects().catch(() => {});
  }, [user?.id]);
  return (
    <ProjectContext.Provider value={{
      projects,
      activeProject,
      loading,
      refreshProjects,
      selectProject,
      syncProject,
      updateActiveProjectUiSettings,
      canEditProject,
      canManageProject,
    }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  return useContext(ProjectContext);
}
