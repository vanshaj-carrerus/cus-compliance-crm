const DEFAULT_API_BASE = "https://cus-compliance-crm.vercel.app";

const SESSION_KEY = "crm_session_token";
const VERIFIED_KEY = "crm_verified_token";

export function getApiBase(): string {
  const fromEnv = String(import.meta.env.VITE_API_BASE_URL || "").trim();
  return (fromEnv || DEFAULT_API_BASE).replace(/\/$/, "");
}

export function getSessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function setSessionToken(token: string | null) {
  try {
    if (token) localStorage.setItem(SESSION_KEY, token);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function getVerifiedToken(): string | null {
  try {
    return localStorage.getItem(VERIFIED_KEY);
  } catch {
    return null;
  }
}

export function setVerifiedToken(token: string | null) {
  try {
    if (token) localStorage.setItem(VERIFIED_KEY, token);
    else localStorage.removeItem(VERIFIED_KEY);
  } catch {
    /* ignore */
  }
}

export function clearAuthTokens() {
  setSessionToken(null);
  setVerifiedToken(null);
}

export type ApiOptions = RequestInit & {
  auth?: boolean;
  json?: unknown;
};

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiOptions = {}
): Promise<{ res: Response; data: T }> {
  const { auth = true, json, headers: initHeaders, ...rest } = options;
  const headers = new Headers(initHeaders || {});

  if (json !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (auth) {
    const token = getSessionToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${getApiBase()}${path}`, {
    ...rest,
    headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  let data = null as T;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = text as T;
    }
  }

  return { res, data };
}
