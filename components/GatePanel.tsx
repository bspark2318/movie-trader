import type { GateResult } from "@/lib/gate";
import { Disclaimer } from "./Disclaimer";

function Row({
  label,
  pass,
  detail,
}: {
  label: string;
  pass: boolean;
  detail: string;
}) {
  return (
    <div className="flex items-center justify-between border-t border-zinc-100 py-1.5 text-sm">
      <span>
        <span className={pass ? "text-emerald-600" : "text-red-500"}>
          {pass ? "✓" : "✗"}
        </span>{" "}
        {label}
      </span>
      <span className="font-mono text-xs text-zinc-500">{detail}</span>
    </div>
  );
}

export function GatePanel({ gate }: { gate: GateResult }) {
  const c = gate.checks;
  return (
    <div className="space-y-3">
      <div
        className={`rounded px-3 py-2 text-sm font-semibold ${
          gate.emit
            ? "bg-emerald-50 text-emerald-800"
            : "bg-zinc-100 text-zinc-700"
        }`}
      >
        {gate.emit ? "BET RECOMMENDED" : "NO BET"}
      </div>

      <div>
        <Row
          label="Agreement (≤5 pts pairwise on candidate)"
          pass={c.agreement.pass}
          detail={`${c.agreement.maxPairwiseDisagreementPts} pts`}
        />
        <Row
          label="Edge vs executable price (≥8 pts)"
          pass={c.edge.pass}
          detail={`${c.edge.edgePts > 0 ? "+" : ""}${c.edge.edgePts} pts`}
        />
        <Row
          label="Liquidity (≥$100) & spread (≤4 pts)"
          pass={c.liquidity.pass}
          detail={`$${c.liquidity.depthUsd} · ${c.liquidity.spreadPts} pts`}
        />
        <Row
          label="Time to resolution (>24h)"
          pass={c.timing.pass}
          detail={`${c.timing.hoursToResolution}h`}
        />
      </div>

      {gate.emit && gate.candidate && (
        <div className="rounded border border-emerald-200 bg-emerald-50/50 p-3 text-sm">
          <div className="font-medium">
            Buy YES · {gate.candidate.bracketLabel} @{" "}
            {Math.round(gate.candidate.execPrice * 100)}¢
          </div>
          <div className="mt-1 font-mono text-xs text-zinc-600">
            ensemble {Math.round(gate.candidate.ensembleProb * 100)}% · edge +
            {gate.candidate.edgePts} pts · EV $
            {gate.candidate.evPerShare.toFixed(2)}/share · ¼-Kelly{" "}
            {(gate.candidate.quarterKellyFraction * 100).toFixed(1)}% of bankroll
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            {gate.candidate.dissent}
          </div>
        </div>
      )}

      <Disclaimer />
    </div>
  );
}
