import { hasDb } from "@/lib/config";
import { buildCalibration } from "@/lib/scoring/calibration";
import { CalibrationCurve } from "@/components/CalibrationCurve";

export const dynamic = "force-dynamic";

const KEY_LABELS: Record<string, string> = {
  ensemble: "Ensemble",
  comps_quant: "Comps method",
  tracking_interpreter: "Tracking method",
  demand_signals: "Demand method",
  consensus: "Consensus (all seats)",
  "model:anthropic": "Claude seat",
  "model:openai": "GPT seat",
  "model:google": "Gemini seat",
};

export default async function CalibrationPage() {
  if (!hasDb()) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Calibration</h1>
        <p className="rounded bg-amber-50 p-3 text-sm text-amber-700">
          Supabase is not configured — calibration needs resolved runs in the
          database.
        </p>
      </div>
    );
  }

  const cal = await buildCalibration();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Calibration</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {cal.resolvedMarkets} resolved market
          {cal.resolvedMarkets === 1 ? "" : "s"}. Lower Brier is better; the
          market is the benchmark to beat.
        </p>
      </div>

      {/* Go / no-go */}
      <div
        className={`rounded p-3 text-sm font-medium ${
          cal.goNoGo === "go"
            ? "bg-emerald-50 text-emerald-800"
            : cal.goNoGo === "no-go"
              ? "bg-red-50 text-red-700"
              : "bg-zinc-100 text-zinc-700"
        }`}
      >
        {cal.goNoGo === "insufficient" &&
          `Insufficient sample — need ≥25 resolved markets for a go/no-go verdict (have ${cal.resolvedMarkets}). Paper-trade only.`}
        {cal.goNoGo === "go" &&
          "GO — the ensemble has beaten the market's Brier over the evaluation window. Real positions can be discussed."}
        {cal.goNoGo === "no-go" &&
          "NO-GO — the ensemble has not beaten the market. Stay on paper. This is a valid finding."}
      </div>

      <section className="rounded-lg border border-zinc-200 p-4">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Brier leaderboard
        </h2>
        {cal.leaderboard.length === 0 ? (
          <p className="text-sm text-zinc-500">No scored runs yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-400">
                <th className="py-2 pr-4">Predictor</th>
                <th className="py-2 pr-4">Mean Brier</th>
                <th className="py-2 pr-4">vs Market</th>
                <th className="py-2 pr-4">n</th>
                <th className="py-2">Beats market?</th>
              </tr>
            </thead>
            <tbody>
              {cal.leaderboard.map((e) => (
                <tr key={e.key} className="border-b border-zinc-100">
                  <td className="py-2 pr-4 font-medium">
                    {KEY_LABELS[e.key] ?? e.key}
                  </td>
                  <td className="py-2 pr-4 font-mono tabular-nums">
                    {e.meanBrier.toFixed(3)}
                  </td>
                  <td className="py-2 pr-4 font-mono tabular-nums text-zinc-500">
                    {e.meanMarketBrier.toFixed(3)}
                  </td>
                  <td className="py-2 pr-4 font-mono tabular-nums">{e.n}</td>
                  <td className="py-2">
                    {e.beatsMarket ? (
                      <span className="text-emerald-600">✓ yes</span>
                    ) : (
                      <span className="text-zinc-400">no</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="rounded-lg border border-zinc-200 p-4">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
            Reliability curve
          </h2>
          {cal.bins.length > 0 ? (
            <CalibrationCurve bins={cal.bins} />
          ) : (
            <p className="text-sm text-zinc-500">
              Curve appears once enough resolved per-bracket predictions exist.
            </p>
          )}
        </section>

        <section className="rounded-lg border border-zinc-200 p-4">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
            Recommendation track record
          </h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-zinc-500">Total emitted</dt>
              <dd className="font-mono">{cal.recommendations.total}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Won</dt>
              <dd className="font-mono text-emerald-600">
                {cal.recommendations.won}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Lost</dt>
              <dd className="font-mono text-red-500">
                {cal.recommendations.lost}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Open</dt>
              <dd className="font-mono">{cal.recommendations.open}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
