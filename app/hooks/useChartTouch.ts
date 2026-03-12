import { useRef, useState, useMemo, useCallback } from "react";
import { PanResponder, LayoutChangeEvent } from "react-native";

export type TouchInfo = {
  active: boolean;
  x: number;
  index: number;
};

export function useChartTouch(dataLength: number) {
  const [touch, setTouch] = useState<TouchInfo>({
    active: false,
    x: 0,
    index: 0,
  });
  const widthRef = useRef(0);

  const clampIndex = useCallback(
    (locationX: number) => {
      const w = widthRef.current;
      if (w <= 0 || dataLength <= 1) return 0;
      const ratio = Math.max(0, Math.min(1, locationX / w));
      return Math.round(ratio * (dataLength - 1));
    },
    [dataLength],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          const x = e.nativeEvent.locationX;
          setTouch({ active: true, x, index: clampIndex(x) });
        },
        onPanResponderMove: (e) => {
          const x = e.nativeEvent.locationX;
          setTouch({ active: true, x, index: clampIndex(x) });
        },
        onPanResponderTerminationRequest: (_, gs) =>
          Math.abs(gs.dy) > Math.abs(gs.dx) && Math.abs(gs.dy) > 8,
        onPanResponderRelease: () => {
          setTouch((prev) => ({ ...prev, active: false }));
        },
        onPanResponderTerminate: () => {
          setTouch((prev) => ({ ...prev, active: false }));
        },
      }),
    [clampIndex],
  );

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
  }, []);

  return { touch, panHandlers: panResponder.panHandlers, onLayout, widthRef };
}
