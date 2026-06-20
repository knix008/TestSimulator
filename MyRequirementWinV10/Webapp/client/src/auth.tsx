import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { api } from "./api";
import { AppUser } from "./types";

const TOKEN_KEY = "reqtrace.token";
const USER_KEY = "reqtrace.user";

interface AuthState {
  token: string | null;
  user: AppUser | null;
  login: (token: string, user: AppUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<AppUser | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  });

  useEffect(() => {
    function handleUnauthorized() {
      logout();
    }
    window.addEventListener("reqtrace:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("reqtrace:unauthorized", handleUnauthorized);
  }, []);

  useEffect(() => {
    if (!token) return;
    api
      .me()
      .then((freshUser) => {
        localStorage.setItem(USER_KEY, JSON.stringify(freshUser));
        setUser(freshUser);
      })
      .catch(() => logout());
  }, [token]);

  function login(nextToken: string, nextUser: AppUser) {
    localStorage.setItem(TOKEN_KEY, nextToken);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }

  return <AuthContext.Provider value={{ token, user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
