import { FC, useState } from "react";
import { ScrollView, StyleSheet, Text, View, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { ScreenContainer } from "../components/ScreenContainer";
import { useTheme } from "../context/ThemeContext";
import { StatsChartCard } from "../components/StatsChartCard";
import { FitnessChartMobile } from "../components/charts/FitnessChartMobile";
import { HRVTrendChartMobile } from "../components/charts/HRVTrendChartMobile";
import { ReadinessTrendChartMobile } from "../components/charts/ReadinessTrendChartMobile";
import { SleepRestingTrendChartMobile } from "../components/charts/SleepRestingTrendChartMobile";
import { WeeklyMileageChartMobile } from "../components/charts/WeeklyMileageChartMobile";
import { PaceProgressionChartMobile } from "../components/charts/PaceProgressionChartMobile";
import { HREfficiencyChartMobile } from "../components/charts/HREfficiencyChartMobile";
import { PersonalRecordsListMobile } from "../components/PersonalRecordsListMobile";
import { useStatsData } from "../hooks/useStatsData";
import { StepsTrendChartMobile } from "../components/charts/StepsTrendChartMobile";
import { WeightTrendChartMobile } from "../components/charts/WeightTrendChartMobile";
import { VO2maxTrendChartMobile } from "../components/charts/VO2maxTrendChartMobile";
import { WellnessCheckChartMobile } from "../components/charts/WellnessCheckChartMobile";
import { SkeletonCard, SkeletonLine } from "../components/Skeleton";

type StatsTab = "runs" | "wellness";

export const StatsScreen: FC = () => {
  const { theme } = useTheme();
  const {
    isLoading,
    hasData,
    runningActivities,
    readinessRows,
    fitnessSeries,
    weeklyMileageSeries,
    pacePoints,
    paceTrendline,
    prs,
    hrEfficiencySeries,
    hrvSeries,
    readinessScoreSeries,
    vo2maxSeries,
    rampRateSeries,
    sleepRestingSeries,
    sleepScoreSeries,
    stepsSeries,
    weightSeries,
    fitnessSummary,
    refetchAll,
    stressSeries,
    moodSeries,
    energySeries,
    sorenessSeries,
    maxHr,
  } = useStatsData();
  const navigation = useNavigation();
  const [tab, setTab] = useState<StatsTab>(() =>
    runningActivities.length === 0 && readinessRows.length > 0 ? "wellness" : "runs",
  );
  const runsCount = runningActivities.length;
  const wellnessCount = readinessRows.length;

  if (isLoading && !hasData) {
    return (
      <ScreenContainer contentContainerStyle={styles.loadingContent}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Stats & Analytics</Text>
        <SkeletonCard>
          <SkeletonLine width="45%" />
          <SkeletonLine width="100%" style={{ marginTop: 10, height: 90, borderRadius: 10 }} />
        </SkeletonCard>
        <SkeletonCard>
          <SkeletonLine width="60%" />
          <SkeletonLine width="100%" style={{ marginTop: 10, height: 140, borderRadius: 12 }} />
        </SkeletonCard>
      </ScreenContainer>
    );
  }

  if (!hasData) {
    return (
      <ScreenContainer contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Stats & Analytics</Text>
        <View style={styles.emptyCard}>
          <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>
            Import your data to see stats
          </Text>
          <Text style={[styles.emptyBody, { color: theme.textMuted }]}>
            Connect your integrations to see CTL/ATL/TSB, weekly mileage, pace trends, PRs, HRV, and sleep.
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer onRefresh={refetchAll}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Stats & Analytics</Text>
          <View style={[styles.tabSwitch, { backgroundColor: theme.cardBorder }]}>
            <TouchableOpacity
              onPress={() => setTab("runs")}
              style={[
                styles.tabPill,
                tab === "runs" && { backgroundColor: "#1C1C1E" },
              ]}
            >
              <Text
                style={[
                  styles.tabLabel,
                  tab === "runs" && { color: "#FFFFFF", fontWeight: "600" },
                ]}
              >
                Runs & Fitness
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setTab("wellness")}
              style={[
                styles.tabPill,
                tab === "wellness" && { backgroundColor: "#1C1C1E" },
              ]}
            >
              <Text
                style={[
                  styles.tabLabel,
                  { color: tab === "wellness" ? "#FFFFFF" : theme.textMuted },
                  tab === "wellness" && { fontWeight: "600" },
                ]}
              >
                Wellness
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statCardsScroll}>
          {fitnessSummary.ctl != null && Math.round(fitnessSummary.ctl) !== 0 && (
            <View style={[styles.summaryCard, { backgroundColor: theme.cardBackground }]}>
              <Text style={[styles.summaryValue, { color: theme.textPrimary }]}>
                {Math.round(fitnessSummary.ctl)}
              </Text>
              <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>CTL · Fitness</Text>
            </View>
          )}
          {fitnessSummary.atl != null && Math.round(fitnessSummary.atl) !== 0 && (
            <View style={[styles.summaryCard, { backgroundColor: theme.cardBackground }]}>
              <Text style={[styles.summaryValue, { color: theme.textPrimary }]}>
                {Math.round(fitnessSummary.atl)}
              </Text>
              <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>ATL · Fatigue</Text>
            </View>
          )}
          {fitnessSummary.tsb != null && Math.round(fitnessSummary.tsb) !== 0 && (
            <View
              style={[
                styles.summaryCard,
                {
                  backgroundColor:
                    fitnessSummary.tsb > 0
                      ? theme.positive + "14"
                      : fitnessSummary.tsb >= -10
                        ? theme.warning + "14"
                        : theme.negative + "14",
                  borderColor:
                    fitnessSummary.tsb > 0
                      ? theme.positive + "66"
                      : fitnessSummary.tsb >= -10
                        ? theme.warning + "66"
                        : theme.negative + "66",
                  borderWidth: StyleSheet.hairlineWidth,
                },
              ]}
            >
              <Text style={[styles.summaryValue, { color: theme.textPrimary }]}>
                {fitnessSummary.tsb >= 0 ? "+" : ""}
                {Math.round(fitnessSummary.tsb)}
                {fitnessSummary.tsb > 5 && (
                  <Text style={{ color: theme.positive, fontSize: 16 }}> ✓</Text>
                )}
              </Text>
              <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>TSB · Form</Text>
            </View>
          )}
          {fitnessSummary.vo2max != null && (
            <View style={[styles.summaryCard, { backgroundColor: theme.cardBackground }]}>
              <Text style={[styles.summaryValue, { color: theme.textPrimary }]}>
                ~{fitnessSummary.vo2max.toFixed(0)}
              </Text>
              <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>VO2max est.</Text>
            </View>
          )}
          {fitnessSummary.hrv7dAvg != null && (
            <View style={[styles.summaryCard, { backgroundColor: theme.cardBackground }]}>
              <Text style={[styles.summaryValue, { color: theme.textPrimary }]}>
                {Math.round(fitnessSummary.hrv7dAvg)}
                {fitnessSummary.hrvVsAvg && (
                  <Text style={[styles.summaryHrvDelta, { color: theme.textMuted }]}>
                    {" "}
                    vs avg {fitnessSummary.hrvVsAvg}
                  </Text>
                )}
              </Text>
              <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>7-day HRV</Text>
            </View>
          )}
        </ScrollView>

        {tab === "runs" && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>TOTAL LOAD — 4 WEEKS</Text>
            <View style={[styles.totalLoadCard, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder }]}>
              <Text style={[styles.totalLoadEmpty, { color: theme.textMuted }]}>
                Complete your daily check-in to see your total load trends. 30-second check-in on the dashboard.
              </Text>
            </View>

            <StatsChartCard
              icon="trophy-outline"
              title="Personal Records (runs only)"
              description="Your best times for key race distances. Tap a row to open the activity."
            >
              <PersonalRecordsListMobile
                prs={prs}
                onSelectPr={(id) => navigation.navigate("ActivitiesStack" as never, { screen: "ActivityDetail", params: { id } } as never)}
              />
            </StatsChartCard>

            <StatsChartCard
              icon="trending-up"
              title="Fitness & Fatigue (CTL / ATL / TSB) — 16 weeks"
              description="CTL = 42-day fitness, ATL = 7-day fatigue, TSB = CTL − ATL. Peak (TSB > 5), Optimal (-10 to 5), Fatigued (< -10)."
            >
              <FitnessChartMobile data={fitnessSeries} />
            </StatsChartCard>

            <StatsChartCard
              icon="heart-outline"
              title="HR Efficiency Trend — aerobic pace (140–150 bpm)"
              description="Pace at aerobic HR (140–150 bpm) over time. A downward trend means your aerobic engine is improving."
            >
              <HREfficiencyChartMobile data={hrEfficiencySeries} />
            </StatsChartCard>

            <StatsChartCard
              icon="stats-chart-outline"
              title="Weekly Mileage — 16 weeks (runs only)"
              description="Total km per week (Mon–Sun). Tracks volume trends."
            >
              <WeeklyMileageChartMobile data={weeklyMileageSeries} />
            </StatsChartCard>

            <StatsChartCard
              icon="speedometer-outline"
              title="Pace Progression (runs only)"
              description="Pace per run. Dashed line = 4-week average. Easy = Zone 2, LT1 = 75–82%, LT2 = 85–92%."
              bodyPressOnly
            >
              <PaceProgressionChartMobile points={pacePoints} trendline={paceTrendline} />
            </StatsChartCard>

            <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>FITNESS & BODY</Text>
            <View style={styles.twoColGrid}>
              <View style={styles.gridHalf}>
                <StatsChartCard
                  icon="walk-outline"
                  title="VO2max"
                  description="Estimated aerobic capacity from intervals.icu or wearable."
                >
                  {vo2maxSeries.length ? (
                    <VO2maxTrendChartMobile data={vo2maxSeries} />
                  ) : (
                    <Text style={[styles.emptyBody, { color: theme.textMuted }]}>No VO2max data yet.</Text>
                  )}
                </StatsChartCard>
              </View>
              <View style={styles.gridHalf}>
                <StatsChartCard
                  icon="flame-outline"
                  title="Ramp Rate"
                  description="CTL change per week. >5 pts/week = injury risk."
                >
                  {rampRateSeries.length ? (
                    <FitnessChartMobile
                      data={rampRateSeries.map((p) => ({ date: p.date, CTL: p.rampRate, ATL: 0, TSB: 0 }))}
                    />
                  ) : (
                    <Text style={[styles.emptyBody, { color: theme.textMuted }]}>No ramp rate data yet.</Text>
                  )}
                </StatsChartCard>
              </View>
              <View style={styles.gridHalf}>
                <StatsChartCard
                  icon="footsteps-outline"
                  title="Steps"
                  description="Daily steps from your wearable."
                >
                  {stepsSeries.length ? (
                    <StepsTrendChartMobile data={stepsSeries} />
                  ) : (
                    <Text style={[styles.emptyBody, { color: theme.textMuted }]}>No steps data yet.</Text>
                  )}
                </StatsChartCard>
              </View>
              <View style={styles.gridHalf}>
                <StatsChartCard
                  icon="scale-outline"
                  title="Weight"
                  description="Body weight trend from wellness."
                >
                  {weightSeries.length ? (
                    <WeightTrendChartMobile data={weightSeries} />
                  ) : (
                    <Text style={[styles.emptyBody, { color: theme.textMuted }]}>No weight data yet.</Text>
                  )}
                </StatsChartCard>
              </View>
            </View>
          </View>
        )}

        {tab === "wellness" && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>WELLNESS SCORES</Text>
            <View style={styles.twoColGrid}>
              <View className="gridHalf" style={styles.gridHalf}>
                <StatsChartCard
                  icon="pulse-outline"
                  title="Readiness Score"
                  description="0–100 from TSB/CTL or intervals.icu. Higher = ready to train hard."
                  compact={!readinessScoreSeries.length}
                >
                  {readinessScoreSeries.length ? (
                    <ReadinessTrendChartMobile data={readinessScoreSeries} />
                  ) : (
                    <Text style={[styles.emptyBody, { color: theme.textMuted }]}>
                      No data yet ·{" "}
                      <Text
                        style={{ color: theme.accentBlue }}
                        onPress={() => navigation.navigate("Settings" as never)}
                      >
                        Connect intervals.icu
                      </Text>
                    </Text>
                  )}
                </StatsChartCard>
              </View>
              <View style={styles.gridHalf}>
                <StatsChartCard
                  icon="moon-outline"
                  title="Sleep Score"
                  description="0–100 from intervals.icu. Tracks recovery."
                  compact={!sleepScoreSeries.length}
                >
                  {sleepScoreSeries.length ? (
                    <ReadinessTrendChartMobile data={sleepScoreSeries} />
                  ) : (
                    <Text style={[styles.emptyBody, { color: theme.textMuted }]}>
                      No data yet ·{" "}
                      <Text
                        style={{ color: theme.accentBlue }}
                        onPress={() => navigation.navigate("Settings" as never)}
                      >
                        Connect intervals.icu
                      </Text>
                    </Text>
                  )}
                </StatsChartCard>
              </View>
            </View>

            <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>HR & RECOVERY</Text>
            <View style={styles.twoColGrid}>
              <View style={styles.gridHalf}>
                <StatsChartCard
                  icon="bar-chart-outline"
                  title="HRV Trend"
                  description="Heart rate variability (ms). Low = fatigue or illness."
                  compact={!hrvSeries.length}
                >
                  {hrvSeries.length ? (
                    <HRVTrendChartMobile
                      data={hrvSeries.map((p) => ({ date: p.date, CTL: p.hrv, ATL: 0, TSB: 0 }))}
                    />
                  ) : (
                    <Text style={[styles.emptyBody, { color: theme.textMuted }]}>
                      No data yet ·{" "}
                      <Text
                        style={{ color: theme.accentBlue }}
                        onPress={() => navigation.navigate("Settings" as never)}
                      >
                        Connect intervals.icu
                      </Text>
                    </Text>
                  )}
                </StatsChartCard>
              </View>
              <View style={styles.gridHalf}>
                <StatsChartCard
                  icon="moon-outline"
                  title="Sleep & Resting HR"
                  description="Sleep hours + resting HR. Rising RHR = fatigue."
                  compact={!sleepRestingSeries.length}
                >
                  {sleepRestingSeries.length ? (
                    <SleepRestingTrendChartMobile data={sleepRestingSeries} />
                  ) : (
                    <Text style={[styles.emptyBody, { color: theme.textMuted }]}>
                      No data yet ·{" "}
                      <Text
                        style={{ color: theme.accentBlue }}
                        onPress={() => navigation.navigate("Settings" as never)}
                      >
                        Connect intervals.icu
                      </Text>
                    </Text>
                  )}
                </StatsChartCard>
              </View>
            </View>

            <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>FITNESS & BODY</Text>
            <View style={styles.twoColGrid}>
              <View style={styles.gridHalf}>
                <StatsChartCard icon="walk-outline" title="VO2max" description="Estimated aerobic capacity.">
                  {vo2maxSeries.length ? (
                    <VO2maxTrendChartMobile data={vo2maxSeries} />
                  ) : (
                    <Text style={[styles.emptyBody, { color: theme.textMuted }]}>No VO2max data yet.</Text>
                  )}
                </StatsChartCard>
              </View>
              <View style={styles.gridHalf}>
                <StatsChartCard icon="flame-outline" title="Ramp Rate" description="CTL change per week.">
                  {rampRateSeries.length ? (
                    <FitnessChartMobile
                      data={rampRateSeries.map((p) => ({ date: p.date, CTL: p.rampRate, ATL: 0, TSB: 0 }))}
                    />
                  ) : (
                    <Text style={[styles.emptyBody, { color: theme.textMuted }]}>No ramp rate data yet.</Text>
                  )}
                </StatsChartCard>
              </View>
              <View style={styles.gridHalf}>
                <StatsChartCard icon="footsteps-outline" title="Steps" description="Daily steps.">
                  {stepsSeries.length ? (
                    <StepsTrendChartMobile data={stepsSeries} />
                  ) : (
                    <Text style={[styles.emptyBody, { color: theme.textMuted }]}>No steps data yet.</Text>
                  )}
                </StatsChartCard>
              </View>
              <View style={styles.gridHalf}>
                <StatsChartCard icon="scale-outline" title="Weight" description="Body weight trend.">
                  {weightSeries.length ? (
                    <WeightTrendChartMobile data={weightSeries} />
                  ) : (
                    <Text style={[styles.emptyBody, { color: theme.textMuted }]}>No weight data yet.</Text>
                  )}
                </StatsChartCard>
              </View>
            </View>

            <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>WELLNESS CHECKS</Text>
            <View style={styles.twoColGrid}>
              <View style={styles.gridHalf}>
                <StatsChartCard
                  icon="alert-circle-outline"
                  title="Stress Score"
                  description="Daily stress from intervals.icu. Higher = more perceived stress."
                  compact={!stressSeries.length}
                >
                  {stressSeries.length ? (
                    <WellnessCheckChartMobile
                      data={stressSeries}
                      scale={["None", "Low", "Avg", "High", "Extreme"]}
                      color="#ef4444"
                    />
                  ) : (
                    <Text style={[styles.emptyBody, { color: theme.textMuted }]}>
                      No data yet ·{" "}
                      <Text
                        style={{ color: theme.accentBlue }}
                        onPress={() => navigation.navigate("Settings" as never)}
                      >
                        Connect intervals.icu
                      </Text>
                    </Text>
                  )}
                </StatsChartCard>
              </View>
              <View style={styles.gridHalf}>
                <StatsChartCard
                  icon="happy-outline"
                  title="Mood"
                  description="Self-reported mood from intervals.icu wellness."
                  compact={!moodSeries.length}
                >
                  {moodSeries.length ? (
                    <WellnessCheckChartMobile
                      data={moodSeries}
                      scale={["", "Excellent", "Good", "Avg", "Poor"]}
                      color="#a855f7"
                    />
                  ) : (
                    <Text style={[styles.emptyBody, { color: theme.textMuted }]}>
                      No data yet ·{" "}
                      <Text
                        style={{ color: theme.accentBlue }}
                        onPress={() => navigation.navigate("Settings" as never)}
                      >
                        Connect intervals.icu
                      </Text>
                    </Text>
                  )}
                </StatsChartCard>
              </View>
              <View style={styles.gridHalf}>
                <StatsChartCard
                  icon="flash-outline"
                  title="Energy"
                  description="Daily energy level from wellness check-ins."
                  compact={!energySeries.length}
                >
                  {energySeries.length ? (
                    <WellnessCheckChartMobile
                      data={energySeries}
                      scale={["", "High", "Good", "Avg", "Low"]}
                      color="#f59e0b"
                    />
                  ) : (
                    <Text style={[styles.emptyBody, { color: theme.textMuted }]}>
                      No data yet ·{" "}
                      <Text
                        style={{ color: theme.accentBlue }}
                        onPress={() => navigation.navigate("Settings" as never)}
                      >
                        Connect intervals.icu
                      </Text>
                    </Text>
                  )}
                </StatsChartCard>
              </View>
              <View style={styles.gridHalf}>
                <StatsChartCard
                  icon="body-outline"
                  title="Muscle Soreness"
                  description="Subjective soreness. High load + elevated soreness = overtraining risk."
                  compact={!sorenessSeries.length}
                >
                  {sorenessSeries.length ? (
                    <WellnessCheckChartMobile
                      data={sorenessSeries}
                      scale={["None", "Low", "Avg", "High", "Extreme"]}
                      color="#f97316"
                    />
                  ) : (
                    <Text style={[styles.emptyBody, { color: theme.textMuted }]}>
                      No data yet ·{" "}
                      <Text
                        style={{ color: theme.accentBlue }}
                        onPress={() => navigation.navigate("Settings" as never)}
                      >
                        Connect intervals.icu
                      </Text>
                    </Text>
                  )}
                </StatsChartCard>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 16,
  },
  loadingContent: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 8,
  },
  statCardsScroll: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    marginBottom: 8,
    paddingVertical: 4,
  },
  summaryCard: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 100,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: "700",
  },
  summaryLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "500",
  },
  summaryHrvDelta: {
    fontSize: 13,
    fontWeight: "500",
  },
  tabSwitch: {
    flexDirection: "row",
    borderRadius: 999,
    padding: 2,
    marginTop: 4,
  },
  tabPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  section: {
    gap: 16,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 4,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 4,
    marginTop: 4,
  },
  totalLoadCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    minHeight: 140,
    justifyContent: "center",
    alignItems: "center",
  },
  totalLoadEmpty: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },
  twoColGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
  },
  gridHalf: {
    width: "50%",
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  loadingCard: {
    borderRadius: 16,
    padding: 20,
  },
  loadingText: {
    fontSize: 14,
  },
  emptyCard: {
    borderRadius: 16,
    padding: 20,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  emptyBody: {
    fontSize: 13,
  },
});
