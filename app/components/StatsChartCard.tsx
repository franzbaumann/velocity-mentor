import { FC, ReactNode, useRef, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  /** Explanation shown on card back when tapped */
  description?: string;
  children: ReactNode;
};

export const StatsChartCard: FC<Props> = ({ icon, title, description, children }) => {
  const flipAnim = useRef(new Animated.Value(0)).current;
  const [isFlipped, setIsFlipped] = useState(false);

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

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={flipCard}>
      <View style={styles.flipContainer}>
        <Animated.View style={[styles.flipCard, { transform: [{ rotateY: frontRotation }] }]}>
          <View style={styles.card}>
            <View style={styles.titleRow}>
              <Ionicons name={icon} size={18} color="#111" />
              <Text style={styles.title}>{title}</Text>
            </View>
            {children}
          </View>
        </Animated.View>
        {description ? (
          <Animated.View
            style={[styles.flipCardBack, { transform: [{ rotateY: backRotation }] }]}
          >
            <View style={styles.card}>
              <View style={styles.titleRow}>
                <Ionicons name={icon} size={18} color="#111" />
                <Text style={styles.title}>{title}</Text>
              </View>
              <View style={styles.body}>
                <Text style={styles.description}>{description}</Text>
              </View>
            </View>
          </Animated.View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
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
    fontWeight: "700",
    fontSize: 15,
    color: "#111",
  },
  body: {
    marginTop: 4,
    marginBottom: 4,
  },
  description: {
    fontSize: 13,
    color: "#4b5563",
    lineHeight: 18,
  },
});

