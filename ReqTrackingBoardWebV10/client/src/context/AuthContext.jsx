import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api';

const AuthContext = createContext(null);

async function fetchSetupStatus() {
  try {
    const res = await api.get('/setup/status');
    return res.data;
  } catch {
    return { needsSetup: true };
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });
  const [needsSetup, setNeedsSetup] = useState(() => localStorage.getItem('needsSetup') === 'true');
  const [loading, setLoading] = useState(true);

  const syncSetupState = useCallback(async () => {
    const status = await fetchSetupStatus();
    if (status.needsSetup) {
      setNeedsSetup(true);
      localStorage.setItem('needsSetup', 'true');
    } else {
      setNeedsSetup(false);
      localStorage.setItem('needsSetup', 'false');
    }
    return status;
  }, []);

  useEffect(() => {
    (async () => {
      const status = await syncSetupState();
      const token = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');
      const parsedUser = storedUser ? JSON.parse(storedUser) : null;

      if (status.needsSetup) {
        if (token && parsedUser?.id === 0) {
          setUser(parsedUser);
        } else {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setUser(null);
        }
      } else if (token) {
        try {
          const res = await api.get('/auth/me');
          setUser(res.data);
          localStorage.setItem('user', JSON.stringify(res.data));
        } catch {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setUser(null);
        }
      }
      setLoading(false);
    })();
  }, []);

  const login = async (username, password) => {
    const res = await api.post('/auth/login', { username, password });
    localStorage.setItem('token', res.data.token);
    localStorage.setItem('user', JSON.stringify(res.data.user));
    const needs = !!res.data.needsSetup;
    setNeedsSetup(needs);
    localStorage.setItem('needsSetup', needs ? 'true' : 'false');
    setUser(res.data.user);
    if (!needs) await syncSetupState();
    return res.data;
  };

  const completeSetup = useCallback((token, userData) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('needsSetup', 'false');
    setUser(userData);
    setNeedsSetup(false);
  }, []);

  const finishReconfigure = useCallback(async () => {
    await syncSetupState();
    setNeedsSetup(false);
    localStorage.setItem('needsSetup', 'false');
  }, [syncSetupState]);

  const updateAccount = useCallback((token, userData) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  }, []);

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('needsSetup');
    sessionStorage.removeItem('reqtracking_report_summary');
    setUser(null);
    setNeedsSetup(false);
  };

  const updateUserLocal = useCallback((patch) => {
    setUser(prev => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      localStorage.setItem('user', JSON.stringify(next));
      return next;
    });
  }, []);

  const canEdit = user?.role === 'admin' || user?.permission === 'edit';
  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider value={{
      user, loading, needsSetup, login, logout, completeSetup, finishReconfigure,
      updateAccount, updateUserLocal, canEdit, isAdmin, syncSetupState,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
