import { PropsWithChildren } from "react";
import { ScrollView, StyleSheet, View, ViewStyle } from "react-native";
import { colors, spacing } from "../theme/theme";

type ScreenContainerProps = PropsWithChildren<{
  contentContainerStyle?: ViewStyle;
  scroll?: boolean;
  refreshControl?: React.ReactElement;
}>;

export function ScreenContainer({ children, contentContainerStyle, scroll = true, refreshControl }: ScreenContainerProps) {
  if (scroll) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, contentContainerStyle]}
        refreshControl={refreshControl}
      >
        {children}
      </ScrollView>
    );
  }

  return <View style={[styles.container, styles.content, contentContainerStyle]}>{children}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: spacing.screenTop,
    paddingBottom: spacing.screenBottom,
  },
});

