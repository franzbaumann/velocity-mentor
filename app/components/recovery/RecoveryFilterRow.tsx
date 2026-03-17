import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../context/ThemeContext";
import { RecoveryFilterChip } from "./RecoveryFilterChip";

type RecoveryFilterOption<T extends string | number> = {
  value: T;
  label: string;
};

type RecoveryFilterRowProps<T extends string | number> = {
  title: string;
  options: RecoveryFilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
};

export function RecoveryFilterRow<T extends string | number>({
  title,
  options,
  value,
  onChange,
}: RecoveryFilterRowProps<T>) {
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: theme.textMuted }]}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {options.map((option) => (
          <RecoveryFilterChip
            key={String(option.value)}
            label={option.label}
            active={option.value === value}
            onPress={() => onChange(option.value)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  title: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  row: {
    gap: 8,
    paddingRight: 20,
  },
});
