import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useProject } from '../context/ProjectContext.jsx';
import { readProjectFileContent } from '../lib/projectFileActions.js';
import { ROUTES } from '../lib/routes.js';

export default function ProjectFileListener() {
  const { user } = useAuth();
  const { refreshProjects, selectProject } = useProject();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user || !window.electronAPI?.onOpenProjectFile) return undefined;

    return window.electronAPI.onOpenProjectFile(async (filePath) => {
      try {
        const payload = await readProjectFileContent(filePath);
        if (!payload) return;
        const result = await api.openReqtproj(payload);
        await refreshProjects();
        selectProject(result.project);
        navigate(ROUTES.requirements);
      } catch (err) {
        window.alert(err.message);
      }
    });
  }, [user, refreshProjects, selectProject, navigate]);

  return null;
}
