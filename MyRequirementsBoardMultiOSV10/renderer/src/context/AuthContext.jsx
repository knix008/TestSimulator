import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { saveLastUsername } from '../lib/lastUsername.js';
import { setUserPreferencesAuthenticated } from '../lib/userPreferences.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const bootstrapAuth = async () => {
      try {
        const data = await api.session();
        if (data.authenticated) {
          await api.logout();
        }
      } catch {
        // Stay logged out when the server is unavailable.
      } finally {
        if (!cancelled) {
          setUserPreferencesAuthenticated(false);
          setUser(null);
          setLoading(false);
        }
      }
    };

    void bootstrapAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onAuthRequired = () => {
      setUserPreferencesAuthenticated(false);
      setUser(null);
    };
    window.addEventListener('auth:required', onAuthRequired);
    return () => window.removeEventListener('auth:required', onAuthRequired);
  }, []);

  const login = async (username, password) => {
    const data = await api.login(username, password);
    saveLastUsername(data.user?.username || username);
    setUserPreferencesAuthenticated(true);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    if (user?.username) saveLastUsername(user.username);
    await api.logout();
    setUserPreferencesAuthenticated(false);
    setUser(null);
  };

  const hasRole = (minRole) => {
    if (!user) return false;
    const rank = { VIEWER: 0, EDITOR: 1, ADMIN: 2 };
    return rank[user.role] >= rank[minRole];
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
