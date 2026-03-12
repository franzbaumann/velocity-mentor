import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View } from "react-native";
import { useTheme } from "../context/ThemeContext";

export function TabBarGlassBackground() {
  const { resolved, theme } = useTheme();
  const isDark = resolved === "dark";

  if (Platform.OS === "ios") {
    return (
      <View style={StyleSheet.absoluteFill}>
        <View
          style={[
            styles.glass,
            { borderColor: theme.navBorder, backgroundColor: theme.navBackground },
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
          { borderColor: theme.navBorder, backgroundColor: theme.navBackground },
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
