import { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  BodyPart,
  Duration,
  ProgramCategory,
  RecoveryProgram,
  filterRecoveryPrograms,
} from "../../data/recoveryPrograms";
import { useTheme } from "../../context/ThemeContext";
import { RecoveryFilterRow, RecoveryProgramCard } from "../../components/recovery";
import type { RecoveryStackParamList } from "../../navigation/RootNavigator";
import { spacing } from "../../theme/theme";

type Props = NativeStackScreenProps<RecoveryStackParamList, "RecoveryProgramList">;

type DurationFilter = "all" | Duration;
type CategoryFilter = "all" | ProgramCategory;
type BodyPartFilter = "all" | BodyPart;

const durationOptions: { label: string; value: DurationFilter }[] = [
  { label: "All", value: "all" },
  { label: "10 min", value: 10 },
  { label: "20 min", value: 20 },
  { label: "30 min", value: 30 },
];

const categoryOptions: { label: string; value: CategoryFilter }[] = [
  { label: "All", value: "all" },
  { label: "Post-Run", value: "post-run" },
  { label: "Post-Strength", value: "post-strength" },
  { label: "Rest Day", value: "rest-day" },
  { label: "Flexibility", value: "flexibility" },
  { label: "Injury Prevention", value: "injury-prevention" },
  { label: "Activation", value: "activation" },
];

const bodyPartOptions: { label: string; value: BodyPartFilter }[] = [
  { label: "All", value: "all" },
  { label: "Upper", value: "upper" },
  { label: "Lower", value: "lower" },
  { label: "Core", value: "core" },
  { label: "Full Body", value: "full-body" },
  { label: "Hips", value: "hips" },
  { label: "Shoulders", value: "shoulders" },
];

export function RecoveryProgramListScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const [duration, setDuration] = useState<DurationFilter>("all");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [bodyPart, setBodyPart] = useState<BodyPartFilter>("all");

  const programs = useMemo<RecoveryProgram[]>(
    () =>
      filterRecoveryPrograms({
        durationMinutes: duration === "all" ? undefined : duration,
        category: category === "all" ? undefined : category,
        bodyPart: bodyPart === "all" ? undefined : bodyPart,
      }),
    [bodyPart, category, duration],
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.appBackground }]}>
      <FlatList
        data={programs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <TouchableOpacity style={styles.backRow} activeOpacity={0.8} onPress={() => navigation.goBack()}>
              <Text style={[styles.backIcon, { color: theme.textPrimary }]}>‹</Text>
              <Text style={[styles.backText, { color: theme.textPrimary }]}>Back</Text>
            </TouchableOpacity>
            <Text style={[styles.screenTitle, { color: theme.textPrimary }]}>Recovery Programs</Text>
            <View style={styles.filters}>
              <RecoveryFilterRow title="Duration" options={durationOptions} value={duration} onChange={setDuration} />
              <RecoveryFilterRow title="Category" options={categoryOptions} value={category} onChange={setCategory} />
              <RecoveryFilterRow title="Body Part" options={bodyPartOptions} value={bodyPart} onChange={setBodyPart} />
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <RecoveryProgramCard
            program={item}
            onPress={() => navigation.navigate("RecoveryProgramDetail", { programId: item.id })}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: 16,
    paddingBottom: spacing.screenBottom + 20,
  },
  headerBlock: {
    gap: 12,
    marginBottom: 4,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  backIcon: {
    fontSize: 20,
  },
  backText: {
    fontSize: 14,
    fontWeight: "600",
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  filters: {
    gap: 12,
  },
  separator: {
    height: 10,
  },
});
