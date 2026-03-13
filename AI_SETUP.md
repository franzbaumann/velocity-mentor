# AI Setup (Claude, Groq, Gemini)

Coach Cade uses **Claude first** (Anthropic), then Groq, then Gemini as fallbacks. At least one key is required.

## Where to put the keys

**Do NOT put them in `.env`.** They go in **Supabase Edge Function secrets** (server-side only).

## Option 1: Supabase Dashboard (recommended)

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → your project **Velocity-mentor**
2. **Project Settings** → **Edge Functions** → **Secrets**
3. Add (at least one required):
   - `ANTHROPIC_API_KEY` = your Claude key from https://console.anthropic.com/
   - `GROQ_API_KEY` = your Groq key from https://console.groq.com/keys
   - `GEMINI_API_KEY` = your Gemini key from https://aistudio.google.com/apikey

## Option 2: CLI

```bash
supabase link --project-ref nhxwjaqhlbkdnageyavu
supabase secrets set ANTHROPIC_API_KEY=sk-ant-your_key GROQ_API_KEY=gsk_your_key GEMINI_API_KEY=AIza_your_key
supabase functions deploy coach-chat coach-opening paceiq-generate-plan paceiq-philosophy intervals-proxy
```

## Multi-key rotation (stay within free tier)

To avoid rate limits without paying, add extra keys. When one hits 429, the app tries the next:

- `ANTHROPIC_API_KEY`, `ANTHROPIC_API_KEY_2`, `ANTHROPIC_API_KEY_3`
- `GROQ_API_KEY`, `GROQ_API_KEY_2`, `GROQ_API_KEY_3`
- `GEMINI_API_KEY`, `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3`

Create 2–3 keys in each console, then:

```bash
supabase secrets set ANTHROPIC_API_KEY=key1 GROQ_API_KEY=key1 GEMINI_API_KEY=key1
supabase functions deploy coach-chat coach-opening paceiq-generate-plan paceiq-philosophy intervals-proxy
```

## Development

- **Retry on 429:** All AI edge functions now retry with backoff (5s, 10s) when a provider returns rate limit. Transient limits often recover without failing.
- **Multi-key:** For heavier dev use, add `ANTHROPIC_API_KEY_2`, `GROQ_API_KEY_2`, `GEMINI_API_KEY_2` — each key has its own quota.
- **Groq:** The free tier is often more generous; ensure `GROQ_API_KEY` is set for reliable fallback.

## Verify project

Your `.env` must use the same project as where you set secrets:

```
VITE_SUPABASE_URL="https://nhxwjaqhlbkdnageyavu.supabase.co"
```

If you have multiple Supabase projects, secrets are per-project. Set them on the project your app uses.

## Invalid Refresh Token

If you see "Invalid Refresh Token", sign out and sign back in to refresh your session.
