import { FC, useRef } from "react";
import { LayoutChangeEvent, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  SharedValue,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { SessionCard } from "./SessionCard";
import { TrainingPlanSession } from "../../hooks/useTrainingPlan";

type Props = {
  session: TrainingPlanSession;
  index: number;
  count: number;
  activeIndex: SharedValue<number>;
  hoverIndex: SharedValue<number>;
  getAvgHeight: () => number;
  onMeasure: (index: number, height: number) => void;
  onToggleDone: (session: TrainingPlanSession) => void;
  onPress?: (session: TrainingPlanSession) => void;
  onAskKipcoachee?: (session: TrainingPlanSession) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
};

const SPRING_CFG = { damping: 20, stiffness: 200 };

export const DraggableSessionCard: FC<Props> = ({
  session,
  index,
  count,
  activeIndex,
  hoverIndex,
  getAvgHeight,
  onMeasure,
  onToggleDone,
  onPress,
  onAskKipcoachee,
  onReorder,
}) => {
  const translateY = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const cardHeight = useRef(110);
  const avgH = useRef(110);

  const handleLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height + 8;
    cardHeight.current = h;
    onMeasure(index, h);
  };

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const commitReorder = (from: number, to: number) => {
    onReorder(from, to);
  };

  const cacheAvgHeight = () => {
    avgH.current = getAvgHeight();
  };

  const gesture = Gesture.Pan()
    .activateAfterLongPress(300)
    .onStart(() => {
      isDragging.value = true;
      activeIndex.value = index;
      hoverIndex.value = index;
      runOnJS(triggerHaptic)();
      runOnJS(cacheAvgHeight)();
    })
    .onUpdate((e) => {
      translateY.value = e.translationY;
      const h = avgH.current || 110;
      const raw = index + e.translationY / h;
      const clamped = Math.max(0, Math.min(count - 1, Math.round(raw)));
      hoverIndex.value = clamped;
    })
    .onEnd((e) => {
      const dy = e.translationY;
      const h = avgH.current || 110;
      const steps = Math.round(dy / h);
      const from = index;
      const to = Math.max(0, Math.min(count - 1, from + steps));

      const didReorder = steps !== 0 && from !== to;
      if (didReorder) {
        translateY.value = 0;
        runOnJS(commitReorder)(from, to);
      } else {
        translateY.value = withSpring(0, SPRING_CFG);
      }
      isDragging.value = false;
      activeIndex.value = -1;
      hoverIndex.value = -1;
    })
    .onFinalize(() => {
      translateY.value = 0;
      isDragging.value = false;
      activeIndex.value = -1;
      hoverIndex.value = -1;
    });

  const siblingOffset = useDerivedValue(() => {
    if (activeIndex.value === -1) return 0;
    if (activeIndex.value === index) return 0;

    const from = activeIndex.value;
    const to = hoverIndex.value;
    const h = avgH.current || 110;

    if (from < to) {
      if (index > from && index <= to) return -h;
    } else if (from > to) {
      if (index >= to && index < from) return h;
    }
    return 0;
  });

  const animatedStyle = useAnimatedStyle(() => {
    const isMe = activeIndex.value === index;
    const offset = siblingOffset.value;
    return {
      transform: [
        {
          translateY: isMe
            ? translateY.value
            : offset !== 0
              ? withTiming(offset, { duration: 200 })
              : withTiming(0, { duration: 150 }),
        },
        { scale: isMe ? withSpring(1.05, SPRING_CFG) : 1 },
      ],
      zIndex: isMe ? 100 : 0,
      elevation: isMe ? 8 : 0,
      opacity: isMe ? 0.95 : 1,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: isMe ? 4 : 0 },
      shadowOpacity: isMe ? 0.15 : 0,
      shadowRadius: isMe ? 8 : 0,
    };
  });

  return (
    <View onLayout={handleLayout}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={animatedStyle}>
          <SessionCard
            session={session}
            onToggleDone={onToggleDone}
            onPress={onPress}
            onAskKipcoachee={onAskKipcoachee}
            isDragHandle
          />
        </Animated.View>
      </GestureDetector>
    </View>
  );
};
