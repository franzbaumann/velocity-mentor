# Strava OAuth Setup & Testing Guide

## 1. Environment Variables

### Local `.env` (create from `.env.example` or add)
```env
VITE_SUPABASE_URL=https://nhxwjaqhlbkdnageyavu.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your anon key>
VITE_STRAVA_CLIENT_ID=<your Strava Client ID>
```

### Supabase Edge Function Secrets
In **Supabase Dashboard** → **Project** → **Edge Functions** → **Secrets** (or **Settings** → **Edge Functions**):

Add:
- `STRAVA_CLIENT_ID` – same as `VITE_STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET` – from Strava API settings (never put this in frontend `.env`)

## 2. Strava Developer Settings

1. Go to [Strava API Settings](https://www.strava.com/settings/api)
2. **Authorization Callback Domain**:  
   - Local: `localhost`  
   - Production: `yourdomain.com` (no `https://`, no path)
3. **Authorization Callback URL** (full URL you’ll use):
   - Local: `http://localhost:5173/auth/strava/callback` (adjust port if needed)
4. Add this exact URL under **Authorized Redirect URIs** if Strava shows that field.

## 3. Deploy Edge Functions

```bash
# Deploy both functions
supabase functions deploy strava-oauth --project-ref nhxwjaqhlbkdnageyavu
supabase functions deploy strava-sync --project-ref nhxwjaqhlbkdnageyavu
```

## 4. Local Testing Flow

1. **Start the app**
   ```bash
   npm run dev
   ```
2. **Sign in** to PaceIQ (create an account if needed).
3. Go to **Settings**.
4. Click **Connect Strava** (orange button).
5. You’ll be redirected to Strava and asked to approve access.
6. After approval, you’ll return to `/auth/strava/callback`, then redirect to Settings.
7. You should see **Connected as [your name]** with a green checkmark.
8. Click **Sync now** to import your last 30 runs.
9. Check **Stats** and **Activities** for your data.

## 5. Troubleshooting

| Error | Likely cause |
|-------|----------------|
| "Strava credentials not configured" | `STRAVA_CLIENT_ID` or `STRAVA_CLIENT_SECRET` missing in Supabase secrets |
| "Strava token exchange failed" | Redirect URI mismatch; check Strava settings vs `window.location.origin + '/auth/strava/callback'` |
| "Unauthorized" | User session expired; sign out and sign back in, then try again |
| "Strava not connected" | `oauth_tokens` row missing; run Connect Strava again |
| "Sync failed" | `strava-sync` not deployed or secrets incorrect |
