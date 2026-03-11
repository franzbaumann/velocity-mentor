import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View } from "react-native";
import { useTheme } from "../context/ThemeContext";

export function TabBarGlassBackground() {
  const { resolved } = useTheme();
  const isDark = resolved === "dark";
  const borderColor = isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.04)";

  if (Platform.OS === "ios") {
    return (
      <View style={StyleSheet.absoluteFill}>
        <View
          style={[
            styles.glass,
            { borderColor, backgroundColor: isDark ? "rgba(18, 18, 20, 0.16)" : "rgba(255, 255, 255, 0.16)" },
          ]}
        >
          <BlurView
            intensity={18}
            tint={isDark ? "dark" : "light"}
            style={StyleSheet.absoluteFill}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <View
        style={[
          styles.glass,
          { borderColor, backgroundColor: isDark ? "rgba(28, 28, 30, 0.22)" : "rgba(255, 255, 255, 0.22)" },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  glass: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 8,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
});
