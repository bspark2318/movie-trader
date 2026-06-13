import type { CalibrationBin } from "@/lib/scoring/calibration";

/** Hand-rolled SVG reliability diagram: predicted vs realized. */
export function CalibrationCurve({ bins }: { bins: CalibrationBin[] }) {
  const size = 240;
  const pad = 28;
  const x = (v: number) => pad + v * (size - 2 * pad);
  const y = (v: number) => size - pad - v * (size - 2 * pad);

  return (
    <svg width={size} height={size} className="text-zinc-400">
      {/* axes */}
      <line x1={pad} y1={size - pad} x2={size - pad} y2={size - pad} stroke="currentColor" />
      <line x1={pad} y1={pad} x2={pad} y2={size - pad} stroke="currentColor" />
      {/* perfect-calibration diagonal */}
      <line
        x1={x(0)}
        y1={y(0)}
        x2={x(1)}
        y2={y(1)}
        stroke="currentColor"
        strokeDasharray="4 4"
        opacity={0.5}
      />
      {/* points */}
      {bins.map((b, i) => (
        <circle
          key={i}
          cx={x(b.predicted)}
          cy={y(b.realized)}
          r={Math.max(2, Math.min(8, Math.sqrt(b.n)))}
          className="fill-emerald-500"
          opacity={0.8}
        />
      ))}
      {/* connecting line */}
      {bins.length > 1 && (
        <polyline
          fill="none"
          stroke="#10b981"
          strokeWidth={1.5}
          points={bins.map((b) => `${x(b.predicted)},${y(b.realized)}`).join(" ")}
        />
      )}
      <text x={size / 2} y={size - 6} textAnchor="middle" className="fill-zinc-500 text-[10px]">
        predicted probability
      </text>
    </svg>
  );
}
