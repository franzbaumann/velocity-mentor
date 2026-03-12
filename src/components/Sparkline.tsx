import { Line, LineChart, ResponsiveContainer } from "recharts";

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

  return (
    <div className="w-full" style={{ height: SPARKLINE_HEIGHT, minHeight: SPARKLINE_HEIGHT }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line
            type="natural"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
