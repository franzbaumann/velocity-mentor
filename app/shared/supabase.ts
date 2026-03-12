import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";

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

export const supabase = createClient(supabaseUrl, supabaseKey, {
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

