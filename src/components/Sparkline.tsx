import { Line, LineChart, ResponsiveContainer } from "recharts";

interface SparklineProps {
  data: number[];
  color?: string;
}

export function Sparkline({ data, color = "hsl(var(--primary))" }: SparklineProps) {
  const chartData = data.map((value, index) => ({ index, value }));

  return (
    <div className="sparkline-container">
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
