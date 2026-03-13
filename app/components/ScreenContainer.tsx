import { PropsWithChildren } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { spacing } from "../theme/theme";
import { PullToRefreshScrollView } from "./PullToRefreshScrollView";

type ScreenContainerProps = PropsWithChildren<{
  contentContainerStyle?: ViewStyle;
  scroll?: boolean;
  onRefresh?: () => Promise<void> | void;
}>;

export function ScreenContainer({
  children,
  contentContainerStyle,
  scroll = true,
  onRefresh,
}: ScreenContainerProps) {
  const { theme } = useTheme();
  const containerStyle = [styles.container, { backgroundColor: theme.appBackground }];
  if (scroll) {
    return (
      <PullToRefreshScrollView
        style={containerStyle}
        contentContainerStyle={[styles.content, contentContainerStyle]}
        onRefresh={onRefresh}
      >
        {children}
      </PullToRefreshScrollView>
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

