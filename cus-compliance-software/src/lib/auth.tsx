import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  apiFetch,
  clearAuthTokens,
  getSessionToken,
  setSessionToken,
  setVerifiedToken,
  getVerifiedToken,
} from "./api";

export type AuthUser = {
  email: string;
  name: string;
};

type AuthContextValue = {
  ready: boolean;
  user: AuthUser | null;
  refresh: () => Promise<void>;
  sendCode: (email: string) => Promise<void>;
  verifyCode: (
    email: string,
    code: string
  ) => Promise<{ hasAccount: boolean }>;
  login: (password: string) => Promise<void>;
  createPassword: (password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  const refresh = useCallback(async () => {
    const token = getSessionToken();
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const { res, data } = await apiFetch<{
        authenticated?: boolean;
        user?: AuthUser;
      }>("/api/auth/me");
      if (!res.ok || !data.authenticated || !data.user) {
        clearAuthTokens();
        setUser(null);
        return;
      }
      setUser(data.user);
    } catch {
      clearAuthTokens();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refresh();
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const sendCode = useCallback(async (email: string) => {
    const { res, data } = await apiFetch<{ error?: string }>(
      "/api/auth/send-code",
      {
        method: "POST",
        auth: false,
        json: { email },
      }
    );
    if (!res.ok) throw new Error(data.error || "Failed to send code");
  }, []);

  const verifyCode = useCallback(async (email: string, code: string) => {
    const { res, data } = await apiFetch<{
      error?: string;
      hasAccount?: boolean;
      verifiedToken?: string;
    }>("/api/auth/verify-code", {
      method: "POST",
      auth: false,
      json: { email, code },
    });
    if (!res.ok) throw new Error(data.error || "Invalid code");
    if (data.verifiedToken) setVerifiedToken(data.verifiedToken);
    return { hasAccount: Boolean(data.hasAccount) };
  }, []);

  const login = useCallback(async (password: string) => {
    const verifiedToken = getVerifiedToken();
    const { res, data } = await apiFetch<{
      error?: string;
      sessionToken?: string;
      user?: AuthUser;
    }>("/api/auth/login", {
      method: "POST",
      auth: false,
      json: { password, verifiedToken },
    });
    if (!res.ok) throw new Error(data.error || "Login failed");
    if (!data.sessionToken) throw new Error("No session token returned");
    setSessionToken(data.sessionToken);
    setVerifiedToken(null);
    setUser(data.user || null);
  }, []);

  const createPassword = useCallback(async (password: string) => {
    const verifiedToken = getVerifiedToken();
    const { res, data } = await apiFetch<{
      error?: string;
      sessionToken?: string;
      user?: AuthUser;
    }>("/api/auth/set-password", {
      method: "POST",
      auth: false,
      json: { password, verifiedToken },
    });
    if (!res.ok) throw new Error(data.error || "Could not create account");
    if (!data.sessionToken) throw new Error("No session token returned");
    setSessionToken(data.sessionToken);
    setVerifiedToken(null);
    setUser(data.user || null);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST", auth: true });
    } catch {
      /* ignore */
    }
    clearAuthTokens();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      user,
      refresh,
      sendCode,
      verifyCode,
      login,
      createPassword,
      logout,
    }),
    [ready, user, refresh, sendCode, verifyCode, login, createPassword, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
