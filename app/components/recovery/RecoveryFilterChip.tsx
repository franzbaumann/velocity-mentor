import { Pressable, StyleSheet, Text } from "react-native";
import { useTheme } from "../../context/ThemeContext";

type RecoveryFilterChipProps = {
  label: string;
  active: boolean;
  onPress: () => void;
};

export function RecoveryFilterChip({ label, active, onPress }: RecoveryFilterChipProps) {
  const { theme, resolved } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active
            ? resolved === "light"
              ? "#D1D5DB"
              : theme.cardBorder
            : "transparent",
          borderColor: theme.cardBorder,
          shadowColor: resolved === "light" && active ? "#000" : "transparent",
          shadowOpacity: resolved === "light" && active ? 0.06 : 0,
          shadowOffset: resolved === "light" && active ? { width: 0, height: 1 } : { width: 0, height: 0 },
          shadowRadius: resolved === "light" && active ? 3 : 0,
          elevation: resolved === "light" && active ? 1 : 0,
        },
      ]}
    >
      <Text
        style={[
          styles.label,
          {
            color: active ? theme.textPrimary : theme.textSecondary,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
  },
});
