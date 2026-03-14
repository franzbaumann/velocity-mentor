import {
  animate,
  type MotionValue,
  motion,
  type PanInfo,
  useMotionValue,
  useTransform,
} from "framer-motion";
import * as React from "react";
import { cn } from "@/lib/utils";

export interface TimeWheelPickerProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  value?: number;
  onChange: (seconds: number) => void;
  maxHours?: number;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
}

const ITEM_HEIGHT = 40;
const VISIBLE_ITEMS = 5;
const PERSPECTIVE_ORIGIN = ITEM_HEIGHT * 2;

const sizeConfig = {
  sm: {
    height: ITEM_HEIGHT * VISIBLE_ITEMS * 0.8,
    itemHeight: ITEM_HEIGHT * 0.8,
    fontSize: "text-sm",
    gap: "gap-2",
  },
  md: {
    height: ITEM_HEIGHT * VISIBLE_ITEMS,
    itemHeight: ITEM_HEIGHT,
    fontSize: "text-base",
    gap: "gap-4",
  },
  lg: {
    height: ITEM_HEIGHT * VISIBLE_ITEMS * 1.2,
    itemHeight: ITEM_HEIGHT * 1.2,
    fontSize: "text-lg",
    gap: "gap-6",
  },
};

interface WheelItemProps {
  item: string | number;
  index: number;
  y: MotionValue<number>;
  itemHeight: number;
  visibleItems: number;
  centerOffset: number;
  isSelected: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function WheelItem({
  item,
  index,
  y,
  itemHeight,
  visibleItems,
  centerOffset,
  isSelected,
  disabled,
  onClick,
}: WheelItemProps) {
  const itemY = useTransform(y, (latest) => {
    const offset = index * itemHeight + latest + centerOffset;
    return offset;
  });

  const rotateX = useTransform(
    itemY,
    [0, centerOffset, itemHeight * visibleItems],
    [45, 0, -45],
  );

  const scale = useTransform(
    itemY,
    [0, centerOffset, itemHeight * visibleItems],
    [0.8, 1, 0.8],
  );

  const opacity = useTransform(
    itemY,
    [
      0,
      centerOffset * 0.5,
      centerOffset,
      centerOffset * 1.5,
      itemHeight * visibleItems,
    ],
    [0.3, 0.6, 1, 0.6, 0.3],
  );

  return (
    <motion.div
      className="flex select-none items-center justify-center"
      style={{
        height: itemHeight,
        rotateX,
        scale,
        opacity,
        transformStyle: "preserve-3d",
        transformOrigin: `center center -${PERSPECTIVE_ORIGIN}px`,
      }}
      onClick={() => !disabled && onClick()}
    >
      <span
        className={cn(
          "font-medium tabular-nums transition-colors",
          isSelected ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {item}
      </span>
    </motion.div>
  );
}

interface WheelColumnProps {
  items: (string | number)[];
  value: number;
  onChange: (index: number) => void;
  itemHeight: number;
  visibleItems: number;
  disabled?: boolean;
  className?: string;
  ariaLabel: string;
}

function WheelColumn({
  items,
  value,
  onChange,
  itemHeight,
  visibleItems,
  disabled,
  className,
  ariaLabel,
}: WheelColumnProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const y = useMotionValue(-value * itemHeight);
  const centerOffset = Math.floor(visibleItems / 2) * itemHeight;

  const valueRef = React.useRef(value);
  const onChangeRef = React.useRef(onChange);
  const itemsLengthRef = React.useRef(items.length);

  React.useEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
    itemsLengthRef.current = items.length;
  });

  React.useEffect(() => {
    animate(y, -value * itemHeight, {
      type: "spring",
      stiffness: 300,
      damping: 30,
    });
  }, [value, itemHeight, y]);

  const handleDragEnd = (
    _: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    if (disabled) return;

    const currentY = y.get();
    const velocity = info.velocity.y;
    const projectedY = currentY + velocity * 0.2;

    let newIndex = Math.round(-projectedY / itemHeight);
    newIndex = Math.max(0, Math.min(items.length - 1, newIndex));

    onChange(newIndex);
  };

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || disabled) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const direction = e.deltaY > 0 ? 1 : -1;
      const currentValue = valueRef.current;
      const maxIndex = itemsLengthRef.current - 1;
      const newIndex = Math.max(
        0,
        Math.min(maxIndex, currentValue + direction),
      );

      if (newIndex !== currentValue) {
        onChangeRef.current(newIndex);
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, [disabled]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    const maxIndex = items.length - 1;
    let newIndex = value;

    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        newIndex = Math.max(0, value - 1);
        break;
      case "ArrowDown":
        e.preventDefault();
        newIndex = Math.min(maxIndex, value + 1);
        break;
      case "Home":
        e.preventDefault();
        newIndex = 0;
        break;
      case "End":
        e.preventDefault();
        newIndex = maxIndex;
        break;
      case "PageUp":
        e.preventDefault();
        newIndex = Math.max(0, value - 5);
        break;
      case "PageDown":
        e.preventDefault();
        newIndex = Math.min(maxIndex, value + 5);
        break;
      default:
        return;
    }

    if (newIndex !== value) {
      onChange(newIndex);
    }
  };

  const dragConstraints = React.useMemo(
    () => ({
      top: -(items.length - 1) * itemHeight,
      bottom: 0,
    }),
    [items.length, itemHeight],
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative overflow-hidden",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
      style={{ height: itemHeight * visibleItems }}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={handleKeyDown}
      role="spinbutton"
      aria-label={ariaLabel}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={items.length - 1}
      aria-valuetext={String(items[value])}
      aria-disabled={disabled}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10"
        style={{
          height: centerOffset,
          background:
            "linear-gradient(to bottom, var(--background) 0%, transparent 100%)",
        }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10"
        style={{
          height: centerOffset,
          background:
            "linear-gradient(to top, var(--background) 0%, transparent 100%)",
        }}
        aria-hidden="true"
      />

      <div
        className="pointer-events-none absolute inset-x-0 z-5 border-border border-y bg-muted/30"
        style={{
          top: centerOffset,
          height: itemHeight,
        }}
        aria-hidden="true"
      />

      <motion.div
        className="cursor-grab active:cursor-grabbing"
        style={{
          y,
          paddingTop: centerOffset,
          paddingBottom: centerOffset,
        }}
        drag="y"
        dragConstraints={dragConstraints}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
      >
        {items.map((item, index) => (
          <WheelItem
            key={`${item}-${index}`}
            item={item}
            index={index}
            y={y}
            itemHeight={itemHeight}
            visibleItems={visibleItems}
            centerOffset={centerOffset}
            isSelected={index === value}
            disabled={disabled}
            onClick={() => onChange(index)}
          />
        ))}
      </motion.div>
    </div>
  );
}

const TimeWheelPicker = React.forwardRef<HTMLDivElement, TimeWheelPickerProps>(
  (
    {
      value = 0,
      onChange,
      maxHours = 6,
      size = "md",
      disabled = false,
      className,
      ...props
    },
    ref,
  ) => {
    const config = sizeConfig[size];

    const hours = React.useMemo(
      () => Array.from({ length: maxHours + 1 }, (_, i) => i),
      [maxHours],
    );
    const minutes = React.useMemo(
      () => Array.from({ length: 60 }, (_, i) => i),
      [],
    );
    const seconds = React.useMemo(
      () => Array.from({ length: 60 }, (_, i) => i),
      [],
    );

    const totalSeconds = Math.max(0, Math.min(value, maxHours * 3600 + 3599));
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;

    const handleHourChange = React.useCallback(
      (hourIndex: number) => {
        const newH = hours[hourIndex] ?? 0;
        const newTotal = newH * 3600 + m * 60 + s;
        onChange(newTotal);
      },
      [hours, m, s, onChange],
    );

    const handleMinuteChange = React.useCallback(
      (minuteIndex: number) => {
        const newM = minuteIndex;
        const newTotal = h * 3600 + newM * 60 + s;
        onChange(newTotal);
      },
      [h, s, onChange],
    );

    const handleSecondChange = React.useCallback(
      (secondIndex: number) => {
        const newS = secondIndex;
        const newTotal = h * 3600 + m * 60 + newS;
        onChange(newTotal);
      },
      [h, m, onChange],
    );

    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center justify-center",
          config.gap,
          config.fontSize,
          disabled && "pointer-events-none opacity-50",
          className,
        )}
        style={{ perspective: "1000px" }}
        role="group"
        aria-label="Time picker"
        {...props}
      >
        <WheelColumn
          items={hours.map((n) => String(n).padStart(2, "0"))}
          value={h}
          onChange={handleHourChange}
          itemHeight={config.itemHeight}
          visibleItems={VISIBLE_ITEMS}
          disabled={disabled}
          className="w-12"
          ariaLabel="Hours"
        />
        <span className="text-muted-foreground font-medium">:</span>
        <WheelColumn
          items={minutes.map((n) => String(n).padStart(2, "0"))}
          value={m}
          onChange={handleMinuteChange}
          itemHeight={config.itemHeight}
          visibleItems={VISIBLE_ITEMS}
          disabled={disabled}
          className="w-12"
          ariaLabel="Minutes"
        />
        <span className="text-muted-foreground font-medium">:</span>
        <WheelColumn
          items={seconds.map((n) => String(n).padStart(2, "0"))}
          value={s}
          onChange={handleSecondChange}
          itemHeight={config.itemHeight}
          visibleItems={VISIBLE_ITEMS}
          disabled={disabled}
          className="w-12"
          ariaLabel="Seconds"
        />
      </div>
    );
  },
);

TimeWheelPicker.displayName = "TimeWheelPicker";

export { TimeWheelPicker };
