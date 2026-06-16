import { missingProviderKeys } from "@/lib/config";
import { BacktestBoard } from "@/components/BacktestBoard";

export const dynamic = "force-dynamic";

export default function BacktestPage() {
  const missing = missingProviderKeys();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">Backtest</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Runs the 3×3 ensemble on resolved films with{" "}
          <strong>web search off</strong>, fed each film&apos;s Wikipedia article{" "}
          <em>as it read 7 days before release</em> — so the agents can&apos;t
          look up the result. Scored by Brier vs the actual opening.
        </p>
      </div>

      <div className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
        <strong>Leakage caveat:</strong> search is fenced, but a model may still{" "}
        <em>remember</em> a famous film&apos;s opening from training. Each cell
        self-reports; flagged runs are marked. Treat results as directional.
      </div>

      {missing.length > 0 && (
        <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          Missing provider keys: {missing.join(", ")}. All three are needed.
        </div>
      )}

      <BacktestBoard />
    </div>
  );
}
