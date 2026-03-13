import { createClient, type FunctionsResponse } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import type { Database } from "../lib/supabase-types";

// Prefer Expo env vars, but fall back to the real project values so
// the app works even if .env is not picked up in development.
const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  "https://nhxwjaqhlbkdnageyavu.supabase.co";

const supabaseKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oeHdqYXFobGJrZG5hZ2V5YXZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NzI5NzMsImV4cCI6MjA4NzI0ODk3M30.i7YEsLDUwD2jyCOk8J-QooMPSJd-Sezuw5b9ZfuQKbM";

export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_ANON_KEY = supabaseKey;

export const AUTH_STORAGE_KEY = "paceiq-auth-session";

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    storage: {
      getItem: () => SecureStore.getItemAsync(AUTH_STORAGE_KEY),
      setItem: (_key: string, value: string) =>
        SecureStore.setItemAsync(AUTH_STORAGE_KEY, value),
      removeItem: () => SecureStore.deleteItemAsync(AUTH_STORAGE_KEY),
    },
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

type EdgeInvokeOptions<TBody> = {
  functionName: string;
  body?: TBody;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRetries?: number;
  logContext?: string;
};

async function withTimeout<T>(promise: Promise<T>, ms: number, op: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${op} timed out after ${ms}ms`));
    }, ms);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result as T;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function callEdgeFunctionWithRetry<TResult = unknown, TBody = unknown>(
  opts: EdgeInvokeOptions<TBody>,
): Promise<FunctionsResponse<TResult>> {
  const {
    functionName,
    body,
    headers,
    timeoutMs = 15000,
    maxRetries = 3,
    logContext,
  } = opts;

  let attempt = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt += 1;
    try {
      const resp = await withTimeout(
        supabase.functions.invoke<TResult>(functionName, {
          body,
          headers,
        }),
        timeoutMs,
        `functions.invoke(${functionName})`,
      );

      if (resp.error) {
        // Log with minimal context, no sensitive data
        console.warn("[edge] invoke error", {
          fn: functionName,
          attempt,
          message: resp.error.message,
          context: logContext,
        });
        if (attempt >= maxRetries) {
          return resp;
        }
      } else {
        return resp;
      }
    } catch (err) {
      console.warn("[edge] invoke failure", {
        fn: functionName,
        attempt,
        message: err instanceof Error ? err.message : String(err),
        context: logContext,
      });
      if (attempt >= maxRetries) {
        throw err;
      }
    }

    const backoffMs = Math.min(1000 * 2 ** (attempt - 1), 8000);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
  }
}

