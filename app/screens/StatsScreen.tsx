import { FC, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
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

type StatsTab = "runs" | "wellness";

export const StatsScreen: FC = () => {
  const { colors } = useTheme();
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
  } = useStatsData();
  const [tab, setTab] = useState<StatsTab>(() =>
    runningActivities.length === 0 && readinessRows.length > 0 ? "wellness" : "runs",
  );

  if (isLoading && !hasData) {
    return (
      <ScreenContainer contentContainerStyle={styles.loadingContent}>
        <Text style={[styles.title, { color: colors.foreground }]}>Stats & Analytics</Text>
        <View style={styles.loadingCard}>
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading your stats…</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!hasData) {
    return (
      <ScreenContainer contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.foreground }]}>Stats & Analytics</Text>
        <View style={styles.emptyCard}>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            Import your data to see stats
          </Text>
          <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
            Connect your integrations to see CTL/ATL/TSB, weekly mileage, pace trends, PRs, HRV, and sleep.
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>Stats & Analytics</Text>
          <View style={[styles.tabSwitch, { backgroundColor: colors.muted }]}>
            <Text
              onPress={() => setTab("runs")}
              style={[
                styles.tabLabel,
                tab === "runs" && { backgroundColor: colors.background, color: colors.foreground },
              ]}
            >
              Runs & Fitness
            </Text>
            <Text
              onPress={() => setTab("wellness")}
              style={[
                styles.tabLabel,
                tab === "wellness" && { backgroundColor: colors.background, color: colors.foreground },
              ]}
            >
              Wellness
            </Text>
          </View>
        </View>

        {tab === "runs" && (
          <View style={styles.section}>
            <StatsChartCard
              icon="trending-up"
              title="Fitness & Fatigue (CTL / ATL / TSB) — 6 weeks"
              description="Your long-term fitness (CTL), short-term fatigue (ATL), and form (TSB) over the last 6 weeks. Green TSB above 0 means you are fresh; very negative TSB means high fatigue."
            >
              <FitnessChartMobile data={fitnessSeries} />
            </StatsChartCard>
            <StatsChartCard
              icon="stats-chart-outline"
              title="Weekly Mileage — 6 weeks (runs only)"
              description="Total running distance per week for the last 6 weeks. Use this to watch your volume trend and keep ramp rate under control."
            >
              <WeeklyMileageChartMobile data={weeklyMileageSeries} />
            </StatsChartCard>
            <StatsChartCard
              icon="heart-outline"
              title="HR Efficiency Trend — aerobic pace (140–150 bpm)"
              description="Pace at an aerobic heart-rate (140–150 bpm). If this line moves down over time you are getting faster at the same easy effort."
            >
              <HREfficiencyChartMobile data={hrEfficiencySeries} />
            </StatsChartCard>
            <StatsChartCard
              icon="speedometer-outline"
              title="Pace Progression (runs only)"
              description="Smoothed pace trend from your runs. A line that moves down over time means you are running faster at similar effort."
            >
              <PaceProgressionChartMobile points={pacePoints} trendline={paceTrendline} />
            </StatsChartCard>
            <StatsChartCard
              icon="trophy-outline"
              title="Personal Records (runs only)"
              description="Your best times for key race distances based on all synced runs. Latest PRs are highlighted."
            >
              <PersonalRecordsListMobile prs={prs} />
            </StatsChartCard>
          </View>
        )}

        {tab === "wellness" && (
          <View style={styles.section}>
            <StatsChartCard
              icon="pulse-outline"
              title="Readiness Score"
              description="Daily readiness score based on your imported wellness metrics (HRV, sleep, load). Higher is better; large drops often mean you should back off."
            >
              {readinessScoreSeries.length ? (
                <ReadinessTrendChartMobile data={readinessScoreSeries} />
              ) : (
                <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                  No readiness score data yet. Import Garmin wellness / intervals.
                </Text>
              )}
            </StatsChartCard>
            <StatsChartCard
              icon="moon-outline"
              title="Sleep & Resting HR"
              description="Sleep duration and resting heart rate together. More sleep and lower resting HR generally mean better recovery."
            >
              {sleepRestingSeries.length ? (
                <SleepRestingTrendChartMobile data={sleepRestingSeries} />
              ) : (
                <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                  No sleep or resting HR data yet. Import Garmin wellness.
                </Text>
              )}
            </StatsChartCard>
            <StatsChartCard
              icon="bar-chart-outline"
              title="HRV Trend"
              description="HRV or HRV baseline trend from intervals.icu / Garmin. Rising HRV usually means better recovery; sharp drops can signal fatigue or stress."
            >
              {hrvSeries.length ? (
                <HRVTrendChartMobile
                  data={hrvSeries.map((p) => ({
                    date: p.date,
                    CTL: p.hrv,
                    ATL: 0,
                    TSB: 0,
                  }))}
                />
              ) : (
                <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                  No HRV data yet. Import Garmin wellness / intervals.
                </Text>
              )}
            </StatsChartCard>
            <StatsChartCard
              icon="walk-outline"
              title="VO2max"
              description="Estimated VO2max trend from your devices or intervals.icu. Use this as a rough indicator of aerobic capacity over time."
            >
              {vo2maxSeries.length ? (
                <FitnessChartMobile
                  data={vo2maxSeries.map((p) => ({
                    date: p.date,
                    CTL: p.vo2max,
                    ATL: 0,
                    TSB: 0,
                  }))}
                />
              ) : (
                <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                  No VO2max data yet. Import Garmin Metrics (DI-Connect-Metrics) / intervals.
                </Text>
              )}
            </StatsChartCard>
            <StatsChartCard
              icon="flame-outline"
              title="Ramp Rate"
              description="How quickly your fitness load is changing. Very high positive ramp rate increases injury risk; flat or slightly rising is usually safer."
            >
              {rampRateSeries.length ? (
                <FitnessChartMobile
                  data={rampRateSeries.map((p) => ({
                    date: p.date,
                    CTL: p.rampRate,
                    ATL: 0,
                    TSB: 0,
                  }))}
                />
              ) : (
                <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                  No ramp rate data yet. Connect intervals.icu fitness ramp rate.
                </Text>
              )}
            </StatsChartCard>
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
    alignItems: "center",
    gap: 12,
  },
  tabSwitch: {
    flexDirection: "row",
    borderRadius: 999,
    padding: 2,
  },
  tabLabel: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "500",
  },
  section: {
    gap: 16,
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
