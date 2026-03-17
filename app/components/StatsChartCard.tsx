import { FC, ReactNode, useRef, useState } from "react";
import { Animated, Easing, Image, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  iconVariant?: "default" | "cadeRunner";
  title: string;
  /** Explanation shown on card back when tapped */
  description?: string;
  children: ReactNode;
  /** When true, use a more compact height for empty/summary cards */
  compact?: boolean;
  /** If true, only the body area flips (header is non-pressable). Used for charts with interactive controls in the header. */
  bodyPressOnly?: boolean;
};

export const StatsChartCard: FC<Props> = ({
  icon,
  iconVariant = "default",
  title,
  description,
  children,
  compact,
  bodyPressOnly,
}) => {
  const { themeName, theme } = useTheme();
  const isDarkPro = themeName === "darkPro";
  const flipAnim = useRef(new Animated.Value(0)).current;
  const [isFlipped, setIsFlipped] = useState(false);

  const minHeight = compact ? 80 : 180;

  const cardStyle = {
    backgroundColor: theme.cardBackground,
    borderRadius: theme.cardRadius,
    padding: theme.cardPadding,
    marginBottom: 8,
    minHeight,
    borderWidth: theme.cardBorderWidth,
    borderColor: theme.cardBorder,
    ...(isDarkPro ? {} : Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 },
      android: { elevation: 2 },
    })),
  };
  const titleColor = theme.textPrimary;
  const descColor = theme.textMuted;

  const frontRotation = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });
  const backRotation = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["180deg", "360deg"],
  });

  const flipCard = () => {
    Animated.timing(flipAnim, {
      toValue: isFlipped ? 0 : 1,
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setIsFlipped((prev) => !prev);
    });
  };

  const renderIcon = () => {
    if (iconVariant === "cadeRunner") {
      return (
        <Image
          source={require("../assets/cade-runner-blue.png")}
          style={{ width: 26, height: 26, tintColor: "#2563eb" }}
        />
      );
    }
    return <Ionicons name={icon} size={18} color={titleColor} />;
  };

  if (bodyPressOnly) {
    return (
      <View style={styles.flipContainer}>
        <Animated.View style={[styles.flipCard, { transform: [{ rotateY: frontRotation }] }]}>
          <View style={[styles.card, cardStyle]}>
            <View style={styles.titleRow}>
              {renderIcon()}
              <Text style={[styles.title, { color: titleColor }]} numberOfLines={2} ellipsizeMode="tail">{title}</Text>
              {description ? (
                <TouchableOpacity onPress={flipCard} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.infoBtn}>
                  <Ionicons name="information-circle-outline" size={20} color={titleColor} />
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity activeOpacity={0.9} onPress={flipCard}>
              {children}
            </TouchableOpacity>
          </View>
        </Animated.View>
        {description ? (
          <TouchableOpacity activeOpacity={0.9} onPress={flipCard}>
            <Animated.View
              style={[styles.flipCardBack, { transform: [{ rotateY: backRotation }] }]}
            >
              <View style={[styles.card, cardStyle]}>
                <View style={styles.titleRow}>
                  {renderIcon()}
                  <Text style={[styles.title, { color: titleColor }]} numberOfLines={2} ellipsizeMode="tail">{title}</Text>
                  {description ? (
                    <TouchableOpacity onPress={flipCard} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.infoBtn}>
                      <Ionicons name="information-circle-outline" size={20} color={titleColor} />
                    </TouchableOpacity>
                  ) : null}
                </View>
                <View style={styles.body}>
                  <Text style={[styles.description, { color: descColor }]}>{description}</Text>
                </View>
              </View>
            </Animated.View>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={flipCard}>
      <View style={styles.flipContainer}>
        <Animated.View style={[styles.flipCard, { transform: [{ rotateY: frontRotation }] }]}>
          <View style={[styles.card, cardStyle]}>
            <View style={styles.titleRow}>
              {renderIcon()}
              <Text style={[styles.title, { color: titleColor }]} numberOfLines={2} ellipsizeMode="tail">{title}</Text>
              {description ? (
                <TouchableOpacity onPress={flipCard} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.infoBtn}>
                  <Ionicons name="information-circle-outline" size={20} color={titleColor} />
                </TouchableOpacity>
              ) : null}
            </View>
            {children}
          </View>
        </Animated.View>
        {description ? (
          <Animated.View
            style={[styles.flipCardBack, { transform: [{ rotateY: backRotation }] }]}
          >
            <View style={[styles.card, cardStyle]}>
              <View style={styles.titleRow}>
                {renderIcon()}
                <Text style={[styles.title, { color: titleColor }]} numberOfLines={2} ellipsizeMode="tail">{title}</Text>
                {description ? (
                  <TouchableOpacity onPress={flipCard} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.infoBtn}>
                    <Ionicons name="information-circle-outline" size={20} color={titleColor} />
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={styles.body}>
                <Text style={[styles.description, { color: descColor }]}>{description}</Text>
              </View>
            </View>
          </Animated.View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {},
  flipContainer: {
    position: "relative",
    marginBottom: 8,
  },
  flipCard: {
    backfaceVisibility: "hidden",
  },
  flipCardBack: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backfaceVisibility: "hidden",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  title: {
    flex: 1,
    fontWeight: "700",
    fontSize: 15,
  },
  infoBtn: {
    padding: 4,
  },
  body: {
    marginTop: 4,
    marginBottom: 4,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
  },
});

