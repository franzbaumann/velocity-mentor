/**
 * Canonical Supabase URL. Uses project_id from supabase/config.toml as source of truth.
 * Env vars can be wrong/cached; this ensures we always hit the correct project.
 */
const SUPABASE_URL = "https://nhxwjaqhlbkdnageyavu.supabase.co";

export function getSupabaseUrl(): string {
  return SUPABASE_URL;
}
