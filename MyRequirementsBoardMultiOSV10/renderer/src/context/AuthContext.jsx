import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { saveLastUsername } from '../lib/lastUsername.js';
import { setUserPreferencesAuthenticated } from '../lib/userPreferences.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.session()
      .then((data) => {
        if (data.authenticated && data.user?.username) {
          saveLastUsername(data.user.username);
        }
        setUserPreferencesAuthenticated(Boolean(data.authenticated));
        setUser(data.authenticated ? data.user : null);
      })
      .catch(() => {
        setUserPreferencesAuthenticated(false);
        setUser(null);
      })
      .finally(() => setLoading(false));
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
