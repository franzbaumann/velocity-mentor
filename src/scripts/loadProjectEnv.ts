/**
 * Load env files from repo root (not cwd). Same order as backfillSessions historically used.
 * Lets `npx tsx src/scripts/…` work with only `.env` — no dotenv-cli required.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ENV_FILES = [
  ".env",
  ".env.development",
  ".env.local",
  ".env.development.local",
  "supabase/.env",
];

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function stripOuterQuotes(s: string): string {
  const t = s.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1).trim();
  }
  return t;
}

function parseEnvLine(line: string): { key: string; value: string } | null {
  const t = line.trim();
  if (!t || t.startsWith("#")) return null;
  const eq = t.indexOf("=");
  if (eq <= 0) return null;
  const key = t.slice(0, eq).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;
  const value = stripOuterQuotes(t.slice(eq + 1));
  return { key, value };
}

/** Returns paths of files that were read (for error messages). */
export function loadProjectEnv(): string[] {
  const loaded: string[] = [];
  for (const name of ENV_FILES) {
    const p = resolve(PROJECT_ROOT, name);
    if (!existsSync(p)) continue;
    loaded.push(p);
    let raw = readFileSync(p, "utf8");
    raw = raw.replace(/^\uFEFF/, "");
    for (const line of raw.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;
      const v = parsed.value.trim();
      if (v === "") continue;
      process.env[parsed.key] = v;
    }
  }
  return loaded;
}

export function getScriptProjectRoot(): string {
  return PROJECT_ROOT;
}

export function getEnvFilesTried(): readonly string[] {
  return ENV_FILES;
}
