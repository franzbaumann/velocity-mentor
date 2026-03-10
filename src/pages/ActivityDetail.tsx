import { useEffect, useMemo, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { useTheme } from "@/hooks/useTheme";
import { useActivityDetail, type ActivityStreams } from "@/hooks/useActivityDetail";
import { useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { isNonDistanceActivity } from "@/lib/analytics";
import { formatDistance, formatCadence, formatElevation } from "@/lib/format";
import { ArrowLeft, BarChart3, Heart, Gauge, Mountain, Zap, Footprints, Timer, Flame, Brain, MessageCircle, Loader2, FileText, Coffee, Droplets, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MapContainer, TileLayer, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
} from "recharts";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatPace(val: number): string {
  if (!val || val <= 0 || val > 20) return "--";
  return `${Math.floor(val)}:${String(Math.round((val % 1) * 60)).padStart(2, "0")}`;
}

type ChartPoint = {
  t: number;
  km: number;
  timeLabel: string;
  pace: number;
  hr: number;
  altitude: number;
  cadence: number;
};

/** Clamp outlier pace values and interpolate from neighbours (red light stops, GPS glitches) */
function smoothPace(raw: number[], minPace = 2.0, maxPace = 12.0): number[] {
  const out = [...raw];
  for (let i = 0; i < out.length; i++) {
    if (out[i] < minPace || out[i] > maxPace || out[i] === 0) {
      let left = 0;
      let right = 0;
      for (let j = i - 1; j >= 0; j--) {
        if (out[j] >= minPace && out[j] <= maxPace) { left = raw[j]; break; }
      }
      for (let j = i + 1; j < out.length; j++) {
        if (raw[j] >= minPace && raw[j] <= maxPace) { right = raw[j]; break; }
      }
      out[i] = left && right ? (left + right) / 2 : left || right || 6;
    }
  }
  return out;
}

/** Downsample to ~targetN points using LTTB-like max-min preservation */
function downsample<T>(data: T[], targetN: number): T[] {
  if (data.length <= targetN) return data;
  const step = (data.length - 2) / (targetN - 2);
  const result: T[] = [data[0]];
  for (let i = 1; i < targetN - 1; i++) {
    const start = Math.floor((i - 1) * step) + 1;
    const end = Math.min(Math.floor(i * step) + 1, data.length - 1);
    const mid = Math.floor((start + end) / 2);
    result.push(data[mid]);
  }
  result.push(data[data.length - 1]);
  return result;
}

/** Rolling average for smoother lines */
function rollingAvg(arr: number[], window: number): number[] {
  if (window <= 1) return arr;
  const half = Math.floor(window / 2);
  return arr.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(arr.length - 1, i + half); j++) {
      sum += arr[j];
      count++;
    }
    return sum / count;
  });
}

function buildChartData(streams: ActivityStreams): ChartPoint[] {
  const { time, heartrate, altitude, cadence, pace, velocity_smooth } = streams;
  const n = Math.max(time.length, heartrate.length, altitude.length, 1);

  const rawPace: number[] = [];
  for (let i = 0; i < n; i++) {
    if (pace && pace.length > 0) {
      rawPace.push(pace[i] ?? 0);
    } else if (velocity_smooth && velocity_smooth.length > 0) {
      const v = velocity_smooth[i] ?? 0;
      rawPace.push(v > 0.1 ? 1000 / v / 60 : 0);
    } else {
      rawPace.push(0);
    }
  }

  const cleanPace = smoothPace(rawPace);
  const smoothedPace = rollingAvg(cleanPace, 15);
  const smoothedHr = rollingAvg(heartrate.length ? heartrate.map(Number) : [], 10);
  const smoothedCad = rollingAvg(cadence.length ? cadence.map(Number) : [], 10);

  const distArr = streams.distance ?? [];
  const data: ChartPoint[] = [];
  for (let i = 0; i < n; i++) {
    const t = time[i] ?? 0;
    const km = distArr.length > i ? distArr[i] / 1000 : (streams.distance_km ?? 0) * (i / (n - 1 || 1));
    data.push({
      t,
      km: Math.round(km * 100) / 100,
      timeLabel: formatDuration(t),
      pace: smoothedPace[i] ?? 0,
      hr: smoothedHr[i] ?? 0,
      altitude: altitude[i] ?? 0,
      cadence: smoothedCad[i] ?? 0,
    });
  }
  return data;
}

function MapFitBounds({ latlng }: { latlng: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (latlng.length >= 2) {
      map.fitBounds(
        [
          [Math.min(...latlng.map((p) => p[0])), Math.min(...latlng.map((p) => p[1]))],
          [Math.max(...latlng.map((p) => p[0])), Math.max(...latlng.map((p) => p[1]))],
        ],
        { padding: [24, 24] }
      );
    }
  }, [map, latlng]);
  return null;
}

const PACE_COLOR = "hsl(211 100% 52%)";
const HR_COLOR = "hsl(0 84% 60%)";
const ELEV_COLOR = "hsl(142 71% 45%)";
const CAD_COLOR = "hsl(280 70% 55%)";

const HR_ZONE_COLORS = [
  "#94a3b8", // Z1 Recovery - grey
  "#3b82f6", // Z2 Aerobic - blue
  "#22c55e", // Z3 Tempo - green
  "#f97316", // Z4 Threshold - orange
  "#ef4444", // Z5 VO2max - red
  "#dc2626", // Z5+ Anaerobic - dark red
];
const HR_ZONE_NAMES = ["Z1 Recovery", "Z2 Aerobic", "Z3 Tempo", "Z4 Threshold", "Z5 VO2max", "Z5+ Anaerobic"];
const PACE_ZONE_NAMES = ["Z1 Easy", "Z2 Moderate", "Z3 Tempo", "Z4 Threshold", "Z5 Interval", "Z6 Sprint"];

function ZoneBar({ times, names, colors, label }: { times: number[]; names: string[]; colors: string[]; label: string }) {
  const total = times.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex h-6 rounded-md overflow-hidden">
        {times.map((t, i) => {
          const pct = (t / total) * 100;
          if (pct < 0.5) return null;
          return (
            <div key={i} style={{ width: `${pct}%`, backgroundColor: colors[i] ?? colors[colors.length - 1] }} className="relative group transition-all">
              <div className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity">
                {Math.round(pct)}%
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {times.map((t, i) => {
          if (t <= 0) return null;
          const mins = Math.round(t / 60);
          return (
            <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: colors[i] ?? colors[colors.length - 1] }} />
              <span>{names[i] ?? `Zone ${i + 1}`}</span>
              <span className="font-medium text-foreground">{mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60}m` : `${mins}m`}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const TILE_LIGHT = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_DARK = "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png";

export default function ActivityDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { resolved: themeMode } = useTheme();
  const { data: activity, isLoading, error } = useActivityDetail(id);

  const chartData = useMemo(() => {
    if (!activity?.streams) return [];
    const hasAny =
      (activity.streams.heartrate?.length ?? 0) > 0 ||
      (activity.streams.altitude?.length ?? 0) > 0 ||
      (activity.streams.pace?.length ?? 0) > 0 ||
      (activity.streams.velocity_smooth?.length ?? 0) > 0;
    if (!hasAny) return [];
    const raw = buildChartData(activity.streams);
    return downsample(raw, 350);
  }, [activity]);

  const hasPace = chartData.some((d) => d.pace > 0);
  const hasHr = chartData.some((d) => d.hr > 0);
  const hasAlt = chartData.some((d) => d.altitude > 0);
  const hasCad = chartData.some((d) => d.cadence > 0);
  const hasGraphs = hasPace || hasHr || hasAlt;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="animate-fade-in space-y-6">
          <button onClick={() => navigate("/activities")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Back to Activities
          </button>
          <div className="h-[320px] rounded-2xl bg-secondary/30 animate-pulse" />
          <div className="h-24 rounded-xl bg-secondary/30 animate-pulse" />
        </div>
      </AppLayout>
    );
  }

  if (error || !activity) {
    return (
      <AppLayout>
        <div className="animate-fade-in space-y-6">
          <button onClick={() => navigate("/activities")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Back to Activities
          </button>
          <div className="glass-card p-12 text-center">
            <p className="text-muted-foreground">Activity not found or unable to load.</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  const validLatlng = activity.latlng.filter(
    (p) => Array.isArray(p) && p.length >= 2 && isFinite(p[0]) && isFinite(p[1]) && p[0] !== 0 && p[1] !== 0
  );
  const hasMap = validLatlng.length >= 2;
  const nonDist = isNonDistanceActivity(activity.type);

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-5 max-w-4xl mx-auto">
        <button onClick={() => navigate("/activities")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground -ml-1">
          <ArrowLeft className="w-4 h-4" /> Back to Activities
        </button>

        <div className="rounded-2xl overflow-hidden border border-border bg-card shadow-sm">
          {hasMap && (
            <div className="relative h-[280px] bg-muted/30">
              <MapContainer center={[validLatlng[0][0], validLatlng[0][1]]} zoom={13} className="h-full w-full" scrollWheelZoom={false}>
                <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url={themeMode === "dark" ? TILE_DARK : TILE_LIGHT} />
                <Polyline positions={validLatlng} color="hsl(25 95% 53%)" weight={5} opacity={0.95} />
                <MapFitBounds latlng={validLatlng} />
              </MapContainer>
              {activity.source === "intervals_icu" && (
                <GpxDownloadButton activityId={id} activityName={activity.name ?? activity.type ?? "activity"} />
              )}
            </div>
          )}

          <div className="px-5 py-4 border-t border-border bg-background/80">
            <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
              <div>
                <h1 className="text-xl font-semibold text-foreground mb-1">
                  {activity.name ?? (nonDist ? `${activity.type} — ${formatDuration(activity.duration_seconds)}` : `${activity.type} — ${formatDistance(activity.distance_km)}`)}
                </h1>
                <p className="text-sm text-muted-foreground">{format(new Date(activity.date), "EEEE, MMMM d, yyyy")}</p>
              </div>
              {activity.source === "intervals_icu" && !hasMap && (
                <GpxDownloadButton activityId={id} activityName={activity.name ?? activity.type ?? "activity"} className="shrink-0" />
              )}
            </div>
            {/* Pace & HR — top priority, clickable to scroll to chart */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <StatSquare
                icon={Gauge}
                label="Avg Pace"
                value={!nonDist ? (activity.avg_pace ?? "—") : "—"}
                scrollTo={hasGraphs && hasPace ? "pace-hr-chart" : undefined}
              />
              <StatSquare
                icon={Heart}
                label="Avg HR"
                value={activity.avg_hr != null ? `${activity.avg_hr} bpm` : "—"}
                scrollTo={hasGraphs && hasHr ? "pace-hr-chart" : undefined}
              />
            </div>
            {/* Essential stats — 2 per row in squares, clickable where relevant */}
            <div className="grid grid-cols-2 gap-3">
              {!nonDist && (
                <StatSquare icon={Gauge} label="Distance" value={formatDistance(activity.distance_km)} />
              )}
              <StatSquare icon={Timer} label="Duration" value={formatDuration(activity.duration_seconds)} />
              {activity.max_hr != null && (
                <StatSquare
                  icon={Heart}
                  label="Max HR"
                  value={`${activity.max_hr} bpm`}
                  scrollTo={hasGraphs && hasHr ? "pace-hr-chart" : undefined}
                />
              )}
              {activity.cadence != null && activity.cadence > 0 && (
                <StatSquare
                  icon={Footprints}
                  label="Cadence"
                  value={formatCadence(activity.cadence)}
                  scrollTo={hasCad ? "cadence-chart" : undefined}
                />
              )}
              {activity.elevation_gain != null && activity.elevation_gain > 0 && (
                <StatSquare
                  icon={Mountain}
                  label="Elevation"
                  value={formatElevation(activity.elevation_gain)}
                  scrollTo={hasAlt ? "elevation-chart" : undefined}
                />
              )}
              {activity.load != null && (
                <StatSquare icon={Zap} label="Load" value={String(Math.round(activity.load))} />
              )}
              {activity.intensity != null && <StatSquare icon={Timer} label="Intensity" value={`${Math.round(activity.intensity)}%`} />}
              {activity.trimp != null && <StatSquare icon={Flame} label="TRIMP" value={String(Math.round(activity.trimp))} />}
              {activity.calories != null && activity.calories > 0 && <StatSquare icon={Flame} label="Calories" value={`${Math.round(activity.calories)} kcal`} />}
              {activity.perceived_exertion != null && <StatSquare icon={Brain} label="RPE" value={`${activity.perceived_exertion}/10`} />}
            </div>
          </div>
        </div>

        {/* ── Coach Analysis ── */}
        <CoachNote activityId={id} cachedNote={activity.coach_note} />

        {/* ── Training Notes & Log ── */}
        <ActivityNotes
          activityId={id}
          userNotes={activity.user_notes}
          nomioDrink={activity.nomio_drink}
          lactateLevels={activity.lactate_levels}
          onUpdate={() => queryClient.invalidateQueries({ queryKey: ["activity-detail", id] })}
        />

        {/* ── HR Zones ── */}
        {activity.hr_zone_times && activity.hr_zone_times.some(t => t > 0) && (
          <div id="hr-zones" className="rounded-xl border border-border bg-card p-4 scroll-mt-4">
            <ZoneBar times={activity.hr_zone_times} names={HR_ZONE_NAMES} colors={HR_ZONE_COLORS} label="Heart Rate Zones" />
          </div>
        )}

        {/* ── Pace Zones ── */}
        {activity.pace_zone_times && activity.pace_zone_times.some(t => t > 0) && (
          <div id="pace-zones" className="rounded-xl border border-border bg-card p-4 scroll-mt-4">
            <ZoneBar times={activity.pace_zone_times} names={PACE_ZONE_NAMES} colors={HR_ZONE_COLORS} label="Pace Zones" />
          </div>
        )}

        {/* ── Pace & Heart Rate ── */}
        {hasGraphs && (hasPace || hasHr) && (
          <div id="pace-hr-chart" className="rounded-xl border border-border bg-card overflow-hidden scroll-mt-4">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <Gauge className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Pace & Heart Rate</span>
            </div>
            <div className="px-2 py-4">
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 8, right: 44, left: -4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="paceGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={PACE_COLOR} stopOpacity={0.15} />
                        <stop offset="100%" stopColor={PACE_COLOR} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="timeLabel" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" tickLine={false} axisLine={false} />
                    {hasPace && (
                      <YAxis
                        yAxisId="pace"
                        orientation="left"
                        domain={[(d: number) => Math.floor(d) - 1, (d: number) => Math.ceil(d) + 1]}
                        tick={{ fontSize: 10, fill: PACE_COLOR }}
                        tickFormatter={(v: number) => formatPace(v)}
                        reversed
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={false}
                        width={42}
                      />
                    )}
                    {hasHr && (
                      <YAxis
                        yAxisId="hr"
                        orientation="right"
                        domain={[(d: number) => Math.floor(d / 5) * 5 - 10, (d: number) => Math.ceil(d / 5) * 5 + 10]}
                        tick={{ fontSize: 10, fill: HR_COLOR }}
                        tickFormatter={(v: number) => String(Math.round(v))}
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={false}
                        width={40}
                      />
                    )}
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
                      labelFormatter={(l) => String(l)}
                      formatter={(val: number, name: string) => {
                        if (name === "pace") return [`${formatPace(val)}/km`, "Pace"];
                        if (name === "hr") return [`${Math.round(val)} bpm`, "Heart Rate"];
                        return [String(val), name];
                      }}
                    />
                    {hasPace && <Area yAxisId="pace" type="natural" dataKey="pace" fill="url(#paceGrad)" stroke={PACE_COLOR} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} name="pace" />}
                    {hasHr && <Line yAxisId="hr" type="natural" dataKey="hr" stroke={HR_COLOR} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} name="hr" />}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="flex gap-5 mt-1 px-4 text-xs text-muted-foreground">
                {hasPace && <span><span className="inline-block w-3 h-[3px] rounded-full align-middle mr-1" style={{ background: PACE_COLOR }} />Pace</span>}
                {hasHr && <span><span className="inline-block w-3 h-[3px] rounded-full align-middle mr-1" style={{ background: HR_COLOR }} />Heart Rate</span>}
              </div>
            </div>
          </div>
        )}

        {/* ── Elevation ── */}
        {hasAlt && (
          <div id="elevation-chart" className="rounded-xl border border-border bg-card overflow-hidden scroll-mt-4">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <Mountain className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Elevation</span>
            </div>
            <div className="px-2 py-4">
              <div className="h-[140px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 4, right: 12, left: -4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={ELEV_COLOR} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={ELEV_COLOR} stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="timeLabel" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" tickLine={false} axisLine={false} />
                    <YAxis domain={["dataMin - 5", "dataMax + 5"]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} unit=" m" tickLine={false} axisLine={false} width={48} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
                      formatter={(v: number) => [`${Math.round(v)} m`, "Elevation"]}
                      labelFormatter={(l) => String(l)}
                    />
                    <Area type="natural" dataKey="altitude" fill="url(#elevGrad)" stroke={ELEV_COLOR} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* ── Cadence ── */}
        {hasCad && (
          <div id="cadence-chart" className="rounded-xl border border-border bg-card overflow-hidden scroll-mt-4">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <Footprints className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Cadence</span>
            </div>
            <div className="px-2 py-4">
              <div className="h-[140px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 4, right: 12, left: -4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="cadGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CAD_COLOR} stopOpacity={0.2} />
                        <stop offset="100%" stopColor={CAD_COLOR} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="timeLabel" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" tickLine={false} axisLine={false} />
                    <YAxis domain={["dataMin - 5", "dataMax + 5"]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} unit=" spm" tickLine={false} axisLine={false} width={52} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
                      formatter={(v: number) => [`${Math.round(v)} spm`, "Cadence"]}
                      labelFormatter={(l) => String(l)}
                    />
                    <Area type="natural" dataKey="cadence" fill="url(#cadGrad)" stroke={CAD_COLOR} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* ── Splits ── */}
        {activity.splits.length > 0 && (
          <div id="splits" className="rounded-xl border border-border bg-card overflow-hidden scroll-mt-4">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Splits</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">#</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Distance</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Pace</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Time</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">HR</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.splits.map((s, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="py-2.5 px-4 font-medium tabular-nums">{i + 1}</td>
                      <td className="py-2.5 px-4 text-right tabular-nums">{s.km != null ? formatDistance(s.km) : "—"}</td>
                      <td className="py-2.5 px-4 text-right tabular-nums">{s.pace ?? "—"}</td>
                      <td className="py-2.5 px-4 text-right tabular-nums">{s.elapsed_sec != null ? formatDuration(s.elapsed_sec) : "—"}</td>
                      <td className="py-2.5 px-4 text-right tabular-nums">{s.hr != null ? `${s.hr} bpm` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function GpxDownloadButton({ activityId, activityName, className }: { activityId: string; activityName: string; className?: string }) {
  const [loading, setLoading] = useState(false);
  const activityIdForApi = activityId?.startsWith("icu_") ? activityId.replace(/^icu_/, "") : activityId;

  const download = useCallback(async () => {
    if (!activityIdForApi || loading) return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const { data, error } = await supabase.functions.invoke("intervals-proxy", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { action: "gpx", activityId: activityIdForApi },
      });
      if (error || (data && typeof data === "object" && "error" in (data as object))) {
        toast({ title: "GPX unavailable", description: "No GPS track for this activity.", variant: "destructive" });
        return;
      }
      const gpx = typeof data === "string" ? data : JSON.stringify(data);
      const blob = new Blob([gpx], { type: "application/gpx+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${activityName.replace(/[^a-zA-Z0-9-_]/g, "_")}-${activityIdForApi}.gpx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  }, [activityIdForApi, activityName, loading]);

  const base = "flex items-center gap-1.5 rounded-lg bg-background/90 px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm border border-border hover:bg-muted/80 transition-colors";
  return (
    <button
      onClick={download}
      disabled={loading}
      className={className ? `${base} ${className}` : `${base} absolute top-2 right-2 z-[1000]`}
    >
      <Download className="w-3.5 h-3.5" />
      {loading ? "…" : "Download GPX"}
    </button>
  );
}

function ActivityNotes({
  activityId,
  userNotes,
  nomioDrink,
  lactateLevels,
  onUpdate,
}: {
  activityId: string | undefined;
  userNotes?: string | null;
  nomioDrink?: boolean | null;
  lactateLevels?: string | null;
  onUpdate: () => void;
}) {
  const [notes, setNotes] = useState(userNotes ?? "");
  const [nomio, setNomio] = useState(!!nomioDrink);
  const [lactate, setLactate] = useState(lactateLevels ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNotes(userNotes ?? "");
    setNomio(!!nomioDrink);
    setLactate(lactateLevels ?? "");
  }, [userNotes, nomioDrink, lactateLevels]);

  const save = useCallback(async () => {
    if (!activityId) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(activityId);
      const query = supabase
        .from("activity")
        .update({ user_notes: notes || null, nomio_drink: nomio, lactate_levels: lactate || null })
        .eq("user_id", user.id);
      const { error } = isUuid
        ? await query.eq("id", activityId)
        : await query.eq("external_id", activityId.startsWith("icu_") ? activityId.replace(/^icu_/, "") : activityId);
      if (!error) onUpdate();
    } finally {
      setSaving(false);
    }
  }, [activityId, notes, nomio, lactate, onUpdate]);

  useEffect(() => {
    const t = setTimeout(save, 500);
    return () => clearTimeout(t);
  }, [notes, nomio, lactate]);

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">Training notes</span>
        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">How you felt & notes</Label>
        <Textarea
          placeholder="e.g. Legs felt heavy, good session overall..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1.5 min-h-[72px] resize-none"
          rows={3}
        />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Coffee className="w-4 h-4 text-muted-foreground" />
          <Label htmlFor="nomio" className="text-sm font-medium cursor-pointer">Nomio drink before</Label>
        </div>
        <Switch id="nomio" checked={nomio} onCheckedChange={setNomio} />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Droplets className="w-3.5 h-3.5" /> Lactate levels
        </Label>
        <Textarea
          placeholder="e.g. After each rep: 4.2, 5.1, 4.8 — or post-session: 3.5"
          value={lactate}
          onChange={(e) => setLactate(e.target.value)}
          className="mt-1.5 min-h-[56px] resize-none text-sm"
          rows={2}
        />
      </div>
    </div>
  );
}

function CoachNote({ activityId, cachedNote }: { activityId: string | undefined; cachedNote?: string | null }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState<string | null>(cachedNote ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const activityIdForApi = activityId?.startsWith("icu_") ? activityId.replace(/^icu_/, "") : activityId;

  const generate = useCallback(async (forceRegenerate = false) => {
    if (!activityIdForApi || loading) return;
    setLoading(true);
    setError(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setError(true); return; }
      const { data, error: fnErr } = await supabase.functions.invoke("intervals-proxy", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { action: "activity_coach_note", activityId: activityIdForApi, regenerate: forceRegenerate },
      });
      if (fnErr || !data?.note) { setError(true); return; }
      setNote(data.note);
      queryClient.invalidateQueries({ queryKey: ["activity-detail", activityId] });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [activityIdForApi, activityId, loading, queryClient]);

  useEffect(() => {
    if (cachedNote) { setNote(cachedNote); return; }
    if (!note && activityIdForApi) generate();
  }, [cachedNote, activityIdForApi]);

  if (error && !note) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2 shrink-0">
          <MessageCircle className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground mb-0.5">Kipcoachee</p>
          <p className="text-sm text-muted-foreground">Couldn't generate feedback.</p>
        </div>
        <button onClick={generate} className="text-xs text-primary hover:underline shrink-0">Retry</button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-start gap-3">
      <div className="rounded-lg bg-primary/10 p-2 shrink-0 mt-0.5">
        <MessageCircle className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-muted-foreground mb-1">Kipcoachee</p>
        {loading || !note ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Analyzing your activity...</span>
          </div>
        ) : (
          <>
            <p className="text-sm text-foreground leading-relaxed">{note}</p>
            <button
              onClick={() => generate(true)}
              disabled={loading}
              className="mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Regenerate feedback
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function StatSquare({
  icon: Icon,
  label,
  value,
  scrollTo,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  scrollTo?: string;
}) {
  const handleClick = () => {
    if (scrollTo) {
      document.getElementById(scrollTo)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
  const isClickable = !!scrollTo;
  return (
    <div
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? handleClick : undefined}
      onKeyDown={isClickable ? (e) => e.key === "Enter" && handleClick() : undefined}
      className={`rounded-xl border border-border bg-card/50 p-3 flex items-center gap-3 ${isClickable ? "cursor-pointer hover:bg-muted/40 hover:border-primary/30 transition-colors" : ""}`}
    >
      <div className="rounded-lg bg-primary/10 p-2 shrink-0">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="font-semibold tabular-nums text-foreground truncate">{value}</p>
      </div>
      {isClickable && <span className="text-[10px] text-muted-foreground shrink-0">→</span>}
    </div>
  );
}
