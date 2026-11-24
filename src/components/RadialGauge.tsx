import { useId } from "react";
import { cn } from "./ui/primitives";

interface RadialGaugeProps {
  title: string;
  valueText: string;
  subText: string;
  /** Raw numeric reading (used with minScale/maxScale to compute arc fill) */
  value: number | null;
  minScale?: number;
  maxScale?: number;
  statusText: string;
  tone?: "teal" | "success" | "warning" | "danger" | "neutral";
  /** Rolling telemetry samples for live mini sparkline */
  history?: number[];
}

const TONE_MAP = {
  teal: {
    stroke: "#14B8A6",
    fill: "rgba(20, 184, 166, 0.22)",
    glow: "drop-shadow(0 0 8px rgba(20, 184, 166, 0.35))",
    pill: "bg-[#14B8A6]/12 text-[#2DD4BF] border-[#14B8A6]/25",
  },
  success: {
    stroke: "#10B981",
    fill: "rgba(16, 185, 129, 0.22)",
    glow: "drop-shadow(0 0 8px rgba(16, 185, 129, 0.35))",
    pill: "bg-[#10B981]/12 text-[#34D399] border-[#10B981]/25",
  },
  warning: {
    stroke: "#F59E0B",
    fill: "rgba(245, 158, 11, 0.22)",
    glow: "drop-shadow(0 0 8px rgba(245, 158, 11, 0.35))",
    pill: "bg-[#F59E0B]/12 text-[#FBBF24] border-[#F59E0B]/25",
  },
  danger: {
    stroke: "#EF4444",
    fill: "rgba(239, 68, 68, 0.24)",
    glow: "drop-shadow(0 0 8px rgba(239, 68, 68, 0.4))",
    pill: "bg-[#EF4444]/12 text-[#F87171] border-[#EF4444]/25",
  },
  neutral: {
    stroke: "#475569",
    fill: "rgba(148, 163, 184, 0.14)",
    glow: "none",
    pill: "bg-white/[0.06] text-[#94A3B8] border-white/[0.08]",
  },
};

export function RadialGauge({
  title,
  valueText,
  subText,
  value,
  minScale = 0,
  maxScale = 100,
  statusText,
  tone = "teal",
  history = [],
}: RadialGaugeProps) {
  const gradId = useId();
  const size = 136;
  const center = size / 2;
  const radius = 52;
  const strokeWidth = 9.5;
  const circumference = 2 * Math.PI * radius;
  const sweepRatio = 240 / 360;
  const arcLength = circumference * sweepRatio;

  const span = Math.max(maxScale - minScale, 1);
  const ratio =
    value === null
      ? 0
      : Math.max(0, Math.min(1, (value - minScale) / span));
  // Ensure tiny non-zero live readings (e.g. 1.1% CPU) render a clean visible anchor cap
  const visualRatio =
    value !== null && value > minScale ? Math.max(ratio, 0.03) : ratio;
  const activeLength = arcLength * visualRatio;
  const style = TONE_MAP[tone];

  // Sparkline geometry (viewBox 160 x 24)
  const sparkW = 160;
  const sparkH = 24;
  const padY = 3;
  const hasSpark = history.length >= 2;
  let linePath = "";
  let areaPath = "";
  let lastPt = { x: sparkW, y: sparkH / 2 };

  if (hasSpark) {
    const hMin = Math.min(...history);
    const hMax = Math.max(...history);
    // Keep a gentle vertical range so tiny real fluctuations (e.g. 1.1% -> 3.4%) remain legible
    const yLow = Math.max(minScale, Math.min(hMin - 2, hMax - 6));
    const yHigh = Math.min(maxScale, Math.max(hMax + 2, yLow + 6));
    const ySpan = Math.max(yHigh - yLow, 1);

    const pts = history.map((v, idx) => {
      const x = (idx / (history.length - 1)) * (sparkW - 4) + 2;
      const norm = Math.max(0, Math.min(1, (v - yLow) / ySpan));
      const y = sparkH - padY - norm * (sparkH - padY * 2);
      return { x, y };
    });

    lastPt = pts[pts.length - 1];
    linePath = pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(" ");
    areaPath = `${linePath} L${lastPt.x.toFixed(1)},${sparkH} L${pts[0].x.toFixed(1)},${sparkH} Z`;
  }

  return (
    <div className="flex flex-col items-center rounded-[10px] border border-white/[0.06] bg-[#1A2332]/70 px-4 pt-3.5 pb-3 transition-colors hover:border-white/[0.11]">
      <div className="mb-1 text-[12px] font-medium text-[#94A3B8]">
        {title}
      </div>

      <div className="relative flex h-[126px] w-[136px] items-center justify-center">
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
          {value !== null && activeLength > 0 && (
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
          <span className="select-text font-mono text-[24px] font-bold leading-none tracking-tight tabular-nums text-[#F1F5F9]">
            {valueText}
          </span>
          <span
            className={cn(
              "mt-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
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

      {/* 迷你实时趋势折线 (最近 20 次采样) */}
      <div className="mt-2.5 flex h-[24px] w-full items-center justify-center">
        {hasSpark ? (
          <svg
            viewBox={`0 0 ${sparkW} ${sparkH}`}
            preserveAspectRatio="none"
            className="h-[24px] w-full overflow-visible"
            aria-label={`${title} 实时趋势`}
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={style.stroke} stopOpacity="0.28" />
                <stop offset="100%" stopColor={style.stroke} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill={`url(#${gradId})`} />
            <path
              d={linePath}
              fill="none"
              stroke={style.stroke}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={lastPt.x}
              cy={lastPt.y}
              r="2.4"
              fill={style.stroke}
            />
          </svg>
        ) : (
          <div className="flex w-full items-center gap-2 px-1">
            <div className="h-[1px] flex-1 bg-white/[0.06]" />
            <span className="font-mono text-[10px] text-[#7E91AA]">
              {value !== null ? "采集趋势中..." : "待连接"}
            </span>
            <div className="h-[1px] flex-1 bg-white/[0.06]" />
          </div>
        )}
      </div>
    </div>
  );
}
