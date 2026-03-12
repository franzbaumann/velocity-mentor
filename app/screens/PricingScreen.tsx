import { FC } from "react";
import { ScrollView, StyleSheet, Text, View, TouchableOpacity } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { useSupabaseAuth } from "../SupabaseProvider";

const plans = [
  {
    name: "IQ Basic",
    description: "Great for small teams getting started with AI‑powered coaching.",
    price: "$12",
    period: "month",
    features: [
      "Unlimited cards",
      "Custom background & stickers",
      "2‑factor authentication",
    ],
  },
  {
    name: "IQ Pro",
    description: "Best value for growing businesses that need more control.",
    price: "$48",
    period: "month",
    popular: true,
    features: [
      "Everything in Starter",
      "Advanced checklists",
      "Custom fields",
      "Serverless functions",
    ],
  },
  {
    name: "IQ Max Pro Max Plus",
    description: "For large teams that need advanced security and scale.",
    price: "$96",
    period: "month",
    features: [
      "Everything in Business",
      "Multi‑board management",
      "Guest access controls",
      "Advanced permissions",
    ],
  },
];

export const PricingScreen: FC = () => {
  const { colors } = useTheme();
  const { bypassLogin } = useSupabaseAuth();

  const styles = StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingTop: 64,
      paddingHorizontal: 24,
      paddingBottom: 16,
    },
    title: {
      fontSize: 26,
      fontWeight: "700",
      color: colors.foreground,
      textAlign: "center",
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 14,
      color: colors.mutedForeground,
      textAlign: "center",
    },
    list: {
      paddingHorizontal: 16,
      paddingBottom: 24,
    },
    card: {
      borderRadius: 20,
      padding: 20,
      marginBottom: 16,
      backgroundColor: colors.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    popularCard: {
      borderColor: colors.primary,
      shadowColor: colors.primary,
      shadowOpacity: 0.35,
      shadowOffset: { width: 0, height: 12 },
      shadowRadius: 32,
      elevation: 8,
    },
    labelRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    name: {
      fontSize: 20,
      fontWeight: "600",
      color: colors.foreground,
    },
    popularBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: colors.primary,
    },
    popularBadgeText: {
      fontSize: 10,
      fontWeight: "600",
      color: colors.primaryForeground,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    priceRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      marginBottom: 8,
    },
    price: {
      fontSize: 28,
      fontWeight: "700",
      color: colors.foreground,
    },
    period: {
      fontSize: 14,
      color: colors.mutedForeground,
      marginLeft: 4,
      marginBottom: 2,
    },
    description: {
      fontSize: 13,
      color: colors.mutedForeground,
      marginBottom: 16,
    },
    cta: {
      height: 44,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
      backgroundColor: colors.primary,
    },
    ctaText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.primaryForeground,
    },
    featuresTitle: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.foreground,
      marginBottom: 8,
    },
    featureRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 4,
    },
    featureBullet: {
      width: 6,
      height: 6,
      borderRadius: 999,
      marginRight: 8,
      backgroundColor: colors.mutedForeground,
    },
    featureText: {
      fontSize: 13,
      color: colors.mutedForeground,
      flexShrink: 1,
    },
    freeCtaWrapper: {
      paddingHorizontal: 16,
      paddingBottom: 32,
      marginTop: 8,
    },
    freeCta: {
      height: 44,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    freeCtaText: {
      fontSize: 14,
      fontWeight: "500",
      color: colors.mutedForeground,
    },
  });

  return (
    <View style={styles.root}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Choose your PaceIQ plan</Text>
          <Text style={styles.subtitle}>
            Skip login and explore our plans. You can create your account at any time.
          </Text>
        </View>

        <View style={styles.list}>
          {plans.map((plan) => (
            <View
              key={plan.name}
              style={[styles.card, plan.popular && styles.popularCard]}
            >
              <View style={styles.labelRow}>
                <Text style={styles.name}>{plan.name}</Text>
                {plan.popular && (
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularBadgeText}>Most popular</Text>
                  </View>
                )}
              </View>

              <View style={styles.priceRow}>
                <Text style={styles.price}>{plan.price}</Text>
                <Text style={styles.period}> / {plan.period}</Text>
              </View>

              <Text style={styles.description}>{plan.description}</Text>

              <TouchableOpacity style={styles.cta} activeOpacity={0.9}>
                <Text style={styles.ctaText}>Get started</Text>
              </TouchableOpacity>

              <Text style={styles.featuresTitle}>What&apos;s included</Text>
              {plan.features.map((feature) => (
                <View key={feature} style={styles.featureRow}>
                  <View style={styles.featureBullet} />
                  <Text style={styles.featureText}>{feature}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>

        <View style={styles.freeCtaWrapper}>
          <TouchableOpacity
            style={styles.freeCta}
            activeOpacity={0.9}
            onPress={bypassLogin}
          >
            <Text style={styles.freeCtaText}>Continue with free plan</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

