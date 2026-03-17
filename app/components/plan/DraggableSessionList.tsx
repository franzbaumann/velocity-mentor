import { FC, useCallback, useRef } from "react";
import { View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { DraggableSessionCard } from "./DraggableSessionCard";
import { TrainingPlanSession } from "../../hooks/useTrainingPlan";

type Props = {
  sessions: TrainingPlanSession[];
  onToggleDone: (session: TrainingPlanSession) => void;
  onPress?: (session: TrainingPlanSession) => void;
  onAskKipcoachee?: (session: TrainingPlanSession) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
};

export const DraggableSessionList: FC<Props> = ({
  sessions,
  onToggleDone,
  onPress,
  onAskKipcoachee,
  onReorder,
}) => {
  const activeIndex = useSharedValue(-1);
  const hoverIndex = useSharedValue(-1);
  const cardHeights = useRef<number[]>([]);

  const setCardHeight = useCallback((idx: number, h: number) => {
    cardHeights.current[idx] = h;
  }, []);

  const getAvgHeight = useCallback(() => {
    const valid = cardHeights.current.filter((h) => h > 0);
    return valid.length > 0
      ? valid.reduce((a, b) => a + b, 0) / valid.length
      : 110;
  }, []);

  return (
    <View style={{ gap: 8 }}>
      {sessions.map((s, index) => (
        <DraggableSessionCard
          key={s.id}
          session={s}
          index={index}
          count={sessions.length}
          activeIndex={activeIndex}
          hoverIndex={hoverIndex}
          getAvgHeight={getAvgHeight}
          onMeasure={setCardHeight}
          onToggleDone={onToggleDone}
          onPress={onPress}
          onAskKipcoachee={onAskKipcoachee}
          onReorder={onReorder}
        />
      ))}
    </View>
  );
};
