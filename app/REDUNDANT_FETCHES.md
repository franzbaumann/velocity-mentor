# Onödiga / för många API-anrop i appen

**Åtgärdat:** (1) refetch-on-focus borttagen i HomeScreen, (2) CoachScreen använder dashboard-data för intervalsContext (inga dubbla activities/readiness-queries), (3) useDashboardData anropar inte längre useActivitiesList(730) – en aktivitetskälla, detailId härleds från activities. Console.log borttaget i useDashboardData.

## 1. Refetch på varje fokus (HomeScreen) — ONÖDIGT

**Var:** `app/screens/HomeScreen.tsx` rad 54–57

```ts
useFocusEffect(
  useCallback(() => {
    refetchAll();
  }, [refetchAll])
);
```

**Problem:** Varje gång användaren kommer tillbaka till Home (t.ex. byter tab) körs `refetchAll()` → 3 anrop (activities, readiness, athlete_profile). Oavsett om data är färsk.

**Åtgärd:** Ta bort `useFocusEffect`-refetch. Låt användaren dra-och-uppdatera (onRefresh) när de vill. Om du vill uppdatera vid fokus: refetch bara om data är äldre än t.ex. 5 min (använd `lastFetchedAt` / `dataUpdatedAt` och jämför med nu).

---

## 2. Aktivitet hämtas dubbelt i useDashboardData — ONÖDIGT

**Var:** `app/hooks/useDashboardData.ts`

- En egen query `["activities-dashboard"]` (activity, 2 år, limit 2000).
- Plus `useActivitiesList(730)` som har query `["activities", 730]` (samma tabell, 730 dagar, limit 1000).

**Problem:** När Home/Coach/PlanOnboarding/Stats använder useDashboardData görs två aktivitetsanrop (olika queryKey = ingen delad cache för samma data).

**Åtgärd:** Använd bara en källa. Antingen:
- Ta bort `useActivitiesList(730)` från useDashboardData och härled `lastActivity.detailId` från `activities` (du har redan `id`, `source`, `external_id`), eller
- Slå ihop till en gemensam query (t.ex. bara `["activities", 730]`) och använd den både för dashboard och för lastActivity-mappning.

---

## 3. CoachScreen hämtar activities + readiness igen — ONÖDIGT

**Var:** `app/screens/CoachScreen.tsx` rad 346–389

Coach anropar redan `useDashboardData()` och får `activities` och `readinessRows`. Men den har också två egna useQuery:

- `["activities", 730]` → activitiesData
- `["daily_readiness", 730]` → wellnessData

används bara till `intervalsContext` (wellness + activities till AI).

**Problem:** Samma data hämtas två gånger (dashboard-cache vs dessa queries). Öppna Coach = extra 2 DB-anrop.

**Åtgärd:** Använd `activities` och `readinessRows` från useDashboardData för `intervalsContext`. Formatera om till samma form som idag (wellness/activities-arrayer). Ta bort useQuery för `["activities", 730]` och `["daily_readiness", 730]` i CoachScreen.

---

## 4. useIntervalsSync / useIntervalsAutoSync invaliderar för många queries

**Var:** `app/hooks/useIntervalsSync.ts` rad 151–163 och 250–260; `useIntervalsAutoSync.ts` rad 54–58

Efter sync anropas `invalidateQueries` på många nycklar (activities, daily_readiness, activities-dashboard, daily_readiness-dashboard, weekStats, athlete_profile, …).

**Problem:** Nödvändigt efter en riktig sync, men om useFocusEffect på Home samtidigt triggar refetchAll() får du dubbel refetch. Mindre problem om du tar bort refetch-on-focus (punkt 1).

**Åtgärd:** Behåll invalidation efter sync. Överväg att ta bort refetch-on-focus (punkt 1) så att inte både invalidation och focus-refetch slår samtidigt.

---

## 5. Console.log i useDashboardData — ONÖDIGT (brus)

**Var:** `app/hooks/useDashboardData.ts` rad 121 och 153

`console.log("[useDashboardData] activities fetch", ...)` och liknande för daily_readiness.

**Problem:** Loggar vid varje fetch; onödigt i produktion och brusar i loggar.

**Åtgärd:** Ta bort eller wrappa i `__DEV__`.

---

## 6. ActivitiesScreen — debug-fetch till localhost

**Var:** `app/screens/ActivitiesScreen.tsx` (flera ställen)

`fetch("http://127.0.0.1:7366/ingest/...")` för agent-logging.

**Problem:** Onödigt i produktion; kan ge fel eller väntetid om ingen server körs.

**Åtgärd:** Ta bort eller kör bara i `__DEV__`.

---

## Prioritet

| Prioritet | Åtgärd | Sparar |
|-----------|--------|--------|
| Hög | 1. Ta bort refetch på fokus (Home) | Många anrop vid tab-byte |
| Hög | 2. En aktivitetskälla i useDashboardData | 1 anrop per dashboard-load |
| Hög | 3. Coach: använd dashboard-data för intervalsContext | 2 anrop per Coach-öppning |
| Medel | 5. Ta bort console.log (eller __DEV__) | Brus |
| Låg | 6. localhost-ingest bara i __DEV__ | Säkerhet/brus |
