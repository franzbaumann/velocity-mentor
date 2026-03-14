import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";

interface SparklineProps {
  data: number[];
  color?: string;
}

const SPARKLINE_HEIGHT = 40;

export function Sparkline({ data, color = "hsl(var(--primary))" }: SparklineProps) {
  const chartData = data?.map((value, index) => ({ index, value })) ?? [];

  if (!chartData.length) {
    return (
      <div
        className="w-full flex items-center justify-center text-muted-foreground text-xs"
        style={{ height: SPARKLINE_HEIGHT, minHeight: SPARKLINE_HEIGHT }}
      >
        No data yet
      </div>
    );
  }

  const maxVal = Math.max(...chartData.map((d) => d.value), 1);

  return (
    <div className="w-full" style={{ height: SPARKLINE_HEIGHT, minHeight: SPARKLINE_HEIGHT }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <YAxis domain={[0, maxVal]} hide />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
