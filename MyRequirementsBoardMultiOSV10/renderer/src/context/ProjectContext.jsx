import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from './AuthContext.jsx';

const ProjectContext = createContext(null);
const STORAGE_KEY = 'mrb_active_project_id';

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
      const list = await api.listProjects(false);
      setProjects(list);
      const savedId = Number(localStorage.getItem(STORAGE_KEY));
      const saved = list.find((p) => p.id === savedId);
      const next = saved || list[0] || null;
      setActiveProject(next);
      if (next) localStorage.setItem(STORAGE_KEY, String(next.id));
      else localStorage.removeItem(STORAGE_KEY);
    } finally {
      setLoading(false);
    }
  };
  const selectProject = (project) => {
    setActiveProject(project);
    if (project) localStorage.setItem(STORAGE_KEY, String(project.id));
  };

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
