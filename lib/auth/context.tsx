"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { onIdTokenChanged, User } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import type { UserRole } from "./types";

interface AuthState {
  user: User | null;
  role: UserRole | null;
  approved: boolean;
  loading: boolean;
  /** Current Firebase ID token — refreshed automatically */
  idToken: string | null;
}

const AuthContext = createContext<AuthState>({
  user: null,
  role: null,
  approved: false,
  loading: true,
  idToken: null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    role: null,
    approved: false,
    loading: true,
    idToken: null,
  });

  useEffect(() => {
    /**
     * onIdTokenChanged fires on:
     *  - sign-in / sign-out
     *  - token refresh (every ~1 hour)
     *  - custom claims update (after forceRefresh)
     *
     * This ensures role + approved stay in sync with Firestore-backed custom claims.
     */
    const unsubscribe = onIdTokenChanged(auth, async (user) => {
      if (!user) {
        setState({ user: null, role: null, approved: false, loading: false, idToken: null });
        return;
      }

      const tokenResult = await user.getIdTokenResult();
      const claims = tokenResult.claims as { role?: UserRole; approved?: boolean };

      setState({
        user,
        role: claims.role ?? null,
        approved: claims.approved ?? false,
        loading: false,
        idToken: tokenResult.token,
      });
    });

    return unsubscribe;
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
