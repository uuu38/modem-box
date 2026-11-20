import { cn } from "./ui/primitives";

interface RadialGaugeProps {
  title: string;
  valueText: string;
  subText: string;
  percent: number | null;
  statusText: string;
  tone?: "teal" | "success" | "warning" | "danger" | "neutral";
  accentColor?: string;
}

const TONE_MAP = {
  teal: {
    stroke: "#14B8A6",
    glow: "drop-shadow(0 0 8px rgba(20, 184, 166, 0.35))",
    pill: "bg-[#14B8A6]/12 text-[#2DD4BF] border-[#14B8A6]/25",
  },
  success: {
    stroke: "#10B981",
    glow: "drop-shadow(0 0 8px rgba(16, 185, 129, 0.35))",
    pill: "bg-[#10B981]/12 text-[#34D399] border-[#10B981]/25",
  },
  warning: {
    stroke: "#F59E0B",
    glow: "drop-shadow(0 0 8px rgba(245, 158, 11, 0.35))",
    pill: "bg-[#F59E0B]/12 text-[#FBBF24] border-[#F59E0B]/25",
  },
  danger: {
    stroke: "#EF4444",
    glow: "drop-shadow(0 0 8px rgba(239, 68, 68, 0.4))",
    pill: "bg-[#EF4444]/12 text-[#F87171] border-[#EF4444]/25",
  },
  neutral: {
    stroke: "#475569",
    glow: "none",
    pill: "bg-white/[0.06] text-[#94A3B8] border-white/[0.08]",
  },
};

export function RadialGauge({
  title,
  valueText,
  subText,
  percent,
  statusText,
  tone = "teal",
}: RadialGaugeProps) {
  const size = 140;
  const center = size / 2;
  const radius = 54;
  const strokeWidth = 10;
  const circumference = 2 * Math.PI * radius;
  const sweepRatio = 240 / 360;
  const arcLength = circumference * sweepRatio;

  const clamped =
    percent === null ? 0 : Math.max(0, Math.min(100, percent));
  const activeLength = arcLength * (clamped / 100);
  const style = TONE_MAP[tone];

  return (
    <div className="flex flex-col items-center rounded-[10px] border border-white/[0.06] bg-[#1A2332]/70 px-4 py-4 transition-colors hover:border-white/[0.11]">
      <div className="mb-1 text-[12px] font-medium text-[#94A3B8]">
        {title}
      </div>

      <div className="relative flex h-[132px] w-[140px] items-center justify-center">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="overflow-visible"
        >
          {/* 底部轨道弧线 (240°) */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="rgba(255, 255, 255, 0.07)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${arcLength} ${circumference}`}
            transform={`rotate(150 ${center} ${center})`}
          />

          {/* 细刻度内圈装饰 */}
          <circle
            cx={center}
            cy={center}
            r={radius - 11}
            fill="none"
            stroke="rgba(255, 255, 255, 0.05)"
            strokeWidth={1.5}
            strokeDasharray="2 7"
            transform={`rotate(150 ${center} ${center})`}
          />

          {/* 实测进度弧线 */}
          {percent !== null && clamped > 0 && (
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={style.stroke}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={`${activeLength} ${circumference}`}
              transform={`rotate(150 ${center} ${center})`}
              style={{
                filter: style.glow,
                transition: "stroke-dasharray 0.5s ease, stroke 0.3s ease",
              }}
            />
          )}
        </svg>

        {/* 表盘中央数值 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
          <span className="font-mono text-[24px] font-bold leading-none tracking-tight tabular-nums text-[#F1F5F9]">
            {valueText}
          </span>
          <span
            className={cn(
              "mt-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
              style.pill
            )}
          >
            {statusText}
          </span>
        </div>
      </div>

      <div className="mt-0.5 text-center font-mono text-[11.5px] tabular-nums text-[#94A3B8]">
        {subText}
      </div>
    </div>
  );
}
