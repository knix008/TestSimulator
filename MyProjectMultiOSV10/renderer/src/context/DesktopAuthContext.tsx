import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getAuthSession, loginAdmin, logoutAdmin } from '../api/desktopClient';

interface AuthContextValue {
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  canRead: boolean;
  canModify: boolean;
  userId: number | null;
  username: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function DesktopAuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canRead, setCanRead] = useState(false);
  const [canModify, setCanModify] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const session = await getAuthSession();
    setIsAuthenticated(session.authenticated);
    setIsAdmin(Boolean(session.isAdmin));
    setCanRead(Boolean(session.canRead));
    setCanModify(Boolean(session.canModify));
    setUserId(session.authenticated ? (session.userId ?? null) : null);
    setUsername(session.authenticated ? (session.username ?? null) : null);
  }, []);

  useEffect(() => {
    refresh()
      .catch(() => {
        setIsAuthenticated(false);
        setIsAdmin(false);
        setCanRead(false);
        setCanModify(false);
        setUserId(null);
        setUsername(null);
      })
      .finally(() => setLoading(false));
  }, [refresh]);

  const login = useCallback(async (user: string, password: string) => {
    await loginAdmin(user, password);
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await logoutAdmin();
    setIsAuthenticated(false);
    setIsAdmin(false);
    setCanRead(false);
    setCanModify(false);
    setUserId(null);
    setUsername(null);
  }, []);

  const value = useMemo(
    () => ({
      loading,
      isAuthenticated,
      isAdmin,
      canRead,
      canModify,
      userId,
      username,
      login,
      logout,
      refresh,
    }),
    [loading, isAuthenticated, isAdmin, canRead, canModify, userId, username, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Alias for web components that import AuthProvider from AuthContext. */
export const AuthProvider = DesktopAuthProvider;

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within DesktopAuthProvider');
  }
  return context;
}
