"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
} from "react";
import type { AuthUser, UserRole } from "./types";

interface AuthState {
  user: AuthUser | null;
  role: UserRole | null;
  approved: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  role: null,
  approved: false,
  loading: true,
  refresh: async () => undefined,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    role: null,
    approved: false,
    loading: true,
    refresh: async () => undefined,
  });

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/me", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        setState({
          user: null,
          role: null,
          approved: false,
          loading: false,
          refresh,
        });
        return;
      }

      const data = (await response.json()) as { user: AuthUser };
      setState({
        user: data.user,
        role: data.user.role,
        approved: data.user.approved,
        loading: false,
        refresh,
      });
    } catch {
      setState({
        user: null,
        role: null,
        approved: false,
        loading: false,
        refresh,
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
