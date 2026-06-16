import { hasDb } from "@/lib/config";
import { buildCalibration } from "@/lib/scoring/calibration";
import { CalibrationCurve } from "@/components/CalibrationCurve";
import { MIN_SAMPLE } from "@/lib/learn";
import { learnedGateThresholds } from "@/lib/learn/gate-tuning";
import { loadCalibrationMapping } from "@/lib/learn/calibration";

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

function LeverRow({
  name,
  on,
  detail,
}: {
  name: string;
  on: boolean;
  detail: string;
}) {
  return (
    <div className="flex items-center justify-between border-t border-zinc-100 py-1.5 first:border-t-0">
      <span>
        <span className={on ? "text-emerald-600" : "text-zinc-300"}>●</span>{" "}
        {name}
      </span>
      <span className="font-mono text-xs text-zinc-500">{detail}</span>
    </div>
  );
}

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
  const learningOn = cal.resolvedMarkets >= MIN_SAMPLE;
  const tuned = learningOn ? await learnedGateThresholds() : null;
  const calBins = learningOn ? (await loadCalibrationMapping()).length : 0;

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

      {/* Self-improvement status */}
      <section className="rounded-lg border border-zinc-200 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Self-improvement
          </h2>
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              learningOn
                ? "bg-emerald-50 text-emerald-700"
                : "bg-zinc-100 text-zinc-500"
            }`}
          >
            {learningOn
              ? "ACTIVE"
              : `warming up · ${cal.resolvedMarkets}/${MIN_SAMPLE}`}
          </span>
        </div>
        <p className="mb-3 text-xs text-zinc-500">
          Each lever stays on static defaults until {MIN_SAMPLE} markets resolve,
          so it can&apos;t tune itself on noise.
        </p>
        <div className="space-y-1.5 text-sm">
          <LeverRow
            name="Performance-weighted ensemble"
            on={learningOn}
            detail={
              learningOn
                ? "weighting seats by track-record Brier"
                : "equal weights (median)"
            }
          />
          <LeverRow
            name="Calibration layer"
            on={learningOn && calBins > 0}
            detail={
              learningOn && calBins > 0
                ? `${calBins} reliability bins applied`
                : "identity (no correction)"
            }
          />
          <LeverRow
            name="Self-tuning gate"
            on={learningOn && tuned !== null}
            detail={
              tuned
                ? `edge ≥ ${Math.round(tuned.edgeMin * 100)}pts · agree ≤ ${Math.round(tuned.agreementMax * 100)}pts (learned)`
                : "edge ≥ 8pts · agree ≤ 5pts (default)"
            }
          />
        </div>
      </section>

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
