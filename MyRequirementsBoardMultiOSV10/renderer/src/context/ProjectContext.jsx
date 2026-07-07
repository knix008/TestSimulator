import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../api/client.js';
import { useAuth } from './AuthContext.jsx';
import { useLanguage } from './LanguageContext.jsx';
import { useTheme } from './ThemeContext.jsx';

const ProjectContext = createContext(null);

function pickActiveProject(list, savedId) {
  const saved = savedId ? list.find((project) => project.id === savedId) : null;
  return saved || list[0] || null;
}

export function ProjectProvider({ children }) {
  const { user } = useAuth();
  const { setLanguage } = useLanguage();
  const { theme } = useTheme();
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
      const list = await api.listProjects(false);
      setProjects(list);

      const legacyId = Number(localStorage.getItem('mrb_active_project_id'));
      if (legacyId) {
        localStorage.removeItem('mrb_active_project_id');
      }
      setActiveProject(pickActiveProject(list, legacyId || null));

      void api.getUserPreferences()
        .then((prefs) => {
          if (prefs?.language) setLanguage(prefs.language, { persist: false });
          void api.patchUserPreferences({ theme, language: prefs?.language || undefined }).catch(() => {});

          let savedId = prefs?.activeProjectId || legacyId || null;
          const next = pickActiveProject(list, savedId);
          setActiveProject(next);

          if (legacyId && !prefs?.activeProjectId) {
            void api.patchUserPreferences({ activeProjectId: legacyId }).catch(() => {});
          } else if (next && savedId !== next.id) {
            void api.patchUserPreferences({ activeProjectId: next.id }).catch(() => {});
          }
        })
        .catch(() => {});
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
