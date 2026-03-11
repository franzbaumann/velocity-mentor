import { PropsWithChildren } from "react";
import { ScrollView, StyleSheet, View, ViewStyle } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { spacing } from "../theme/theme";

type ScreenContainerProps = PropsWithChildren<{
  contentContainerStyle?: ViewStyle;
  scroll?: boolean;
  refreshControl?: React.ReactElement;
}>;

export function ScreenContainer({ children, contentContainerStyle, scroll = true, refreshControl }: ScreenContainerProps) {
  const { colors } = useTheme();
  const containerStyle = [styles.container, { backgroundColor: colors.background }];
  if (scroll) {
    return (
      <ScrollView
        style={containerStyle}
        contentContainerStyle={[styles.content, contentContainerStyle]}
        refreshControl={refreshControl}
      >
        {children}
      </ScrollView>
    );
  }
  return <View style={[containerStyle, styles.content, contentContainerStyle]}>{children}</View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: spacing.screenTop,
    paddingBottom: spacing.screenBottom,
  },
});

