import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from "../shared/supabase";

export type EdgeFunctionRetryOptions = {
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
  onRetry?: (attempt: number) => void;
  authToken?: string | null;
};

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;
const DEFAULT_TIMEOUT_MS = 30000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call a Supabase edge function with retry logic.
 * - Exponential backoff: 1x, 2x, 4x retryDelay between attempts.
 * - Only retries on network errors or 5xx responses. Does NOT retry on 4xx.
 * - Timeout per attempt.
 */
export async function callEdgeFunctionWithRetry<T = unknown>(
  functionName: string,
  payload: object,
  options?: EdgeFunctionRetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retryDelayMs = options?.retryDelay ?? DEFAULT_RETRY_DELAY_MS;
  const timeoutMs = options?.timeout ?? DEFAULT_TIMEOUT_MS;
  const onRetry = options?.onRetry;

  let lastError: Error | null = null;
  let lastStatus: number | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const token =
        options?.authToken !== undefined
          ? options.authToken
          : (await supabase.auth.getSession()).data.session?.access_token ?? null;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      clearTimeout(timeoutId);
      lastStatus = res.status;

      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        if (json?.error && typeof json.error === "string") {
          throw new Error(json.error);
        }
        return json as T;
      }

      const body = await res.json().catch(() => ({}));
      const errMsg = body?.error ?? `Request failed (${res.status})`;

      if (res.status >= 400 && res.status < 500) {
        throw new Error(errMsg);
      }

      lastError = new Error(errMsg);
      if (attempt < maxRetries) {
        onRetry?.(attempt + 1);
        await delay(retryDelayMs * Math.pow(2, attempt - 1));
      } else {
        throw lastError;
      }
    } catch (e) {
      const isAbort = e instanceof Error && e.name === "AbortError";
      const isNetwork =
        e instanceof TypeError ||
        (e instanceof Error && (e.message === "Failed to fetch" || e.message.includes("Network request failed")));

      if (attempt >= maxRetries) {
        throw lastError ?? (e instanceof Error ? e : new Error(String(e)));
      }

      if ((lastStatus != null && lastStatus >= 400 && lastStatus < 500) && !isAbort) {
        throw e;
      }

      lastError = e instanceof Error ? e : new Error(String(e));
      onRetry?.(attempt + 1);
      await delay(retryDelayMs * Math.pow(2, attempt - 1));
    }
  }

  throw lastError ?? new Error("Request failed");
}
