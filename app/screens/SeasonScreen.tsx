import { FC, useEffect } from "react";
import { View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../context/ThemeContext";
import { useSeasons } from "../hooks/useSeasons";
import { SeasonEmptyScreen } from "./SeasonEmptyScreen";
import { SeasonViewScreen } from "./SeasonViewScreen";
import { ScreenContainer } from "../components/ScreenContainer";
import { SkeletonCard, SkeletonLine } from "../components/Skeleton";

export const SeasonScreen: FC = () => {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const { seasons, isLoading } = useSeasons();

  const latestSeason = seasons?.[0] ?? null;

  if (isLoading) {
    return (
      <ScreenContainer contentContainerStyle={{ gap: 12 }}>
        <SkeletonCard>
          <SkeletonLine width="45%" />
          <SkeletonLine width="100%" style={{ marginTop: 12, height: 120, borderRadius: 12 }} />
        </SkeletonCard>
      </ScreenContainer>
    );
  }

  if (latestSeason) {
    return <SeasonViewScreen initialSeasonId={latestSeason.id} />;
  }

  return (
    <SeasonEmptyScreen
      onCreatePress={() => navigation.navigate("SeasonWizard")}
    />
  );
};
