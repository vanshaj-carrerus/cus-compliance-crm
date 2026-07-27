"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  canAccessFeature,
  hasAdminFeature,
  hasCrmFeatures,
  type CrmFeature,
} from "@/lib/features";
import { isComplianceAdmin, type UserRole } from "@/lib/roles";
import {
  clearAuthCache,
  ensureAuth,
  peekAuthCache,
  setAuthCache,
  type CachedAuthUser,
} from "@/lib/auth-cache";

export type AuthUser = CachedAuthUser;

type AuthContextValue = {
  ready: boolean;
  user: AuthUser | null;
  role: UserRole | null;
  features: CrmFeature[];
  isAdmin: boolean;
  isComplianceAdminRole: boolean;
  hasCrmAccess: boolean;
  canView: (view: string) => boolean;
  /** Force Mongo sync (admin edits only). */
  refresh: () => Promise<void>;
  logoutLocal: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const EMPTY_FEATURES: CrmFeature[] = [];

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const cached = peekAuthCache();
  const [ready, setReady] = useState(cached !== undefined);
  const [user, setUser] = useState<AuthUser | null>(
    cached === undefined ? null : cached
  );

  const refresh = useCallback(async () => {
    try {
      const next = await ensureAuth({ sync: true });
      setUser(next);
    } catch {
      setAuthCache(null);
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  const logoutLocal = useCallback(() => {
    clearAuthCache();
    setUser(null);
    setReady(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Already hydrated from module cache — do not hit the network again.
    if (peekAuthCache() !== undefined) {
      setReady(true);
      return;
    }

    (async () => {
      try {
        const next = await ensureAuth();
        if (cancelled) return;
        setUser(next);
      } catch {
        if (!cancelled) {
          setAuthCache(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const role = user?.role ?? null;
  const features = user?.features ?? EMPTY_FEATURES;

  const canView = useCallback(
    (view: string) => canAccessFeature(features, view),
    [features]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      user,
      role,
      features,
      isAdmin: hasAdminFeature(features),
      isComplianceAdminRole: role ? isComplianceAdmin(role) : false,
      hasCrmAccess: hasCrmFeatures(features),
      canView,
      refresh,
      logoutLocal,
    }),
    [ready, user, role, features, canView, refresh, logoutLocal]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
