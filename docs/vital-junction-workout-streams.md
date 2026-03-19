# Vital / Junction — workout list vs streams (audit)

**Base URL:** `https://api.{region}.junction.com` (production) or `https://api.sandbox.{region}.junction.com` — see `getVitalBaseUrl()` in `supabase/functions/vital-sync/index.ts`.

**Auth:** `x-vital-api-key: <VITAL_API_KEY>`, `Accept: application/json`.

## Stable workout id (matches `activity.vital_id` / `activity.external_id`)

- List endpoints return workouts whose primary id is used as the dedupe key in vital-sync: `id`, `workout_id`, `activity_id`, or `source_id` on the row or nested `data` object (same order as `firstString(...)` in code).
- Per-workout stream endpoint uses **that same Vital workout id** (UUID) as `{workout_id}`.

## List / summary (already used)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/v2/summary/workouts/{user_id}/raw` | Date range `start_date`, `end_date`; optional `provider`. |
| GET | `/v2/summary/workouts/{user_id}` | Non-raw summary variant. |
| GET | `/v2/activity/{user_id}`, `/v2/activity/user_id/{user_id}`, `.../raw` | Fallback probes in vital-sync. |

`user_id` = Vital user id stored in `integrations.athlete_id` for provider `vital`.

## Per-workout stream (timeseries)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/v2/timeseries/workouts/{workout_id}/stream` | **Primary.** Returns `ClientFacingStream`-style JSON: series such as `time`, `heart_rate`, `cadence`, `distance`, `altitude`, etc. (exact keys vary slightly by provider). |

Implementation tries this path first; field names are normalized in `_shared/vital-workout-stream.ts` (`heart_rate` → `heartrate`, time base → elapsed seconds, distance → relative meters).

## Rate limits & sync policy

- Batch size and delay mirror `intervals-proxy` (`STREAM_BATCH_SIZE = 5`, ~500 ms between batches).
- `VITAL_STREAMS_MAX_PER_SYNC` caps stream fetches per invocation (default 40) to reduce edge timeouts; idempotent — missing streams are filled on later syncs.
- Only `source = 'vital'` activities from the **last 90 days** are candidates for stream backfill.

## Storage mapping

- `activity_streams`: `activity_id = vital workout id` (same string as `activity.external_id`).
- After upsert: update `activity` by `user_id` + `external_id` with `cardiac_drift`, `pace_efficiency`, `cadence_consistency`, optional `hr_zone_times`, and JSON `splits` (km splits from distance/time when possible).

## Webhooks

Vital/Junction supports webhooks for new data; the app still relies on periodic `vital-sync` + this lazy stream pass. A dedicated webhook-driven job could call the same stream normalizer later.
