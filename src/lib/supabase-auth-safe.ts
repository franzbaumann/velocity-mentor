import { supabase } from "@/integrations/supabase/client";

export type AuthTokenErrorCode =
  | "not_authenticated"
  | "session_expired"
  | "session_lock_timeout"
  | "session_fetch_failed";

export class AuthTokenError extends Error {
  readonly code: AuthTokenErrorCode;

  constructor(code: AuthTokenErrorCode, message: string) {
    super(message);
    this.name = "AuthTokenError";
    this.code = code;
  }
}

/** Shown when refresh token is invalid or access token can no longer be renewed. */
export const AUTH_SESSION_EXPIRED_USER_MESSAGE =
  "Your session has expired or is no longer valid. Please sign out and sign in again, then retry.";

const NOT_AUTH_MSG = "Not authenticated. Please sign in and try again.";

const LOCK_MSG =
  "Session lock timed out. Close extra Cade tabs or refresh the page, then try again.";

const LOCK_TIMEOUT_RE = /lockmanager|navigator lock|timed out waiting|exclusive navigator/i;

function isLockTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return LOCK_TIMEOUT_RE.test(message);
}

/** Refresh token missing, revoked, or auth API rejected the session. */
function isRefreshOrSessionFatalError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /invalid refresh token|refresh token not found|refresh_token|auth session missing|jwt expired|invalid jwt|session (?:expired|not found)/i.test(
    message
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function clearLocalAuthSession(): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    /* ignore — storage may already be inconsistent */
  }
}

function getJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = atob(padded);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** True if JWT exists and is not expired (with skew for clock / slow requests). */
export function isAccessTokenUsable(accessToken: string, skewMs = 45_000): boolean {
  const payload = getJwtPayload(accessToken);
  const exp = payload?.exp;
  if (typeof exp !== "number") return false;
  return exp * 1000 > Date.now() + skewMs;
}

/** Serialize reads — concurrent `getSession()` calls stress Safari's LockManager. */
let tokenReadTail: Promise<void> = Promise.resolve();

function enqueueTokenRead<T>(fn: () => Promise<T>): Promise<T> {
  const run = tokenReadTail.then(() => fn());
  tokenReadTail = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/**
 * Read JWT from localStorage when getSession() cannot run — only if **not expired**.
 */
function readStoredAccessToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !/-auth-token$/.test(key)) continue;

      const raw = localStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const candidates: unknown[] = [parsed.access_token];
      const nested = (parsed.currentSession ?? parsed.session) as Record<string, unknown> | undefined;
      if (nested?.access_token) candidates.push(nested.access_token);

      for (const c of candidates) {
        if (typeof c === "string" && c.length > 30 && isAccessTokenUsable(c)) return c;
      }
    }
  } catch {
    /* ignore malformed storage */
  }
  return null;
}

async function refreshAccessTokenOrThrow(): Promise<string> {
  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session?.access_token) {
    await clearLocalAuthSession();
    throw new AuthTokenError("session_expired", AUTH_SESSION_EXPIRED_USER_MESSAGE);
  }
  if (!isAccessTokenUsable(data.session.access_token, 15_000)) {
    await clearLocalAuthSession();
    throw new AuthTokenError("session_expired", AUTH_SESSION_EXPIRED_USER_MESSAGE);
  }
  return data.session.access_token;
}

async function getSafeAccessTokenInner(): Promise<string> {
  const delays = [0, 120, 400, 1000];

  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (delays[attempt] > 0) {
      await sleep(delays[attempt]);
    }
    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        if (isRefreshOrSessionFatalError(error)) {
          await clearLocalAuthSession();
          throw new AuthTokenError("session_expired", AUTH_SESSION_EXPIRED_USER_MESSAGE);
        }
        throw error;
      }

      if (session?.access_token) {
        if (isAccessTokenUsable(session.access_token)) {
          return session.access_token;
        }
        return await refreshAccessTokenOrThrow();
      }

      const fromStorage = readStoredAccessToken();
      if (fromStorage) {
        if (import.meta.env.DEV) {
          console.warn("[auth] getSession empty; using valid token from storage");
        }
        return fromStorage;
      }

      await clearLocalAuthSession();
      throw new AuthTokenError("not_authenticated", NOT_AUTH_MSG);
    } catch (error) {
      if (error instanceof AuthTokenError) throw error;

      if (isRefreshOrSessionFatalError(error)) {
        await clearLocalAuthSession();
        throw new AuthTokenError("session_expired", AUTH_SESSION_EXPIRED_USER_MESSAGE);
      }

      if (isLockTimeoutError(error) && attempt < delays.length - 1) {
        continue;
      }

      if (isLockTimeoutError(error)) {
        const fromStorage = readStoredAccessToken();
        if (fromStorage) {
          if (import.meta.env.DEV) {
            console.warn("[auth] LockManager timeout; using storage token");
          }
          return fromStorage;
        }
        throw new AuthTokenError("session_lock_timeout", LOCK_MSG);
      }

      throw new AuthTokenError(
        "session_fetch_failed",
        error instanceof Error ? error.message : "Failed to read auth session."
      );
    }
  }

  throw new AuthTokenError("session_fetch_failed", "Failed to read auth session.");
}

export async function getSafeAccessToken(): Promise<string> {
  return enqueueTokenRead(getSafeAccessTokenInner);
}

export function createRequestId(prefix = "vital"): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export function getFunctionRequestHeaders(accessToken: string, requestId: string): Record<string, string> {
  const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
    apikey,
    "x-request-id": requestId,
  };
}
