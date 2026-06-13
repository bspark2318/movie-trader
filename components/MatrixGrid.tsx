import type { AgentOutputRow } from "@/lib/db/types";

const METHOD_LABELS: Record<string, string> = {
  comps_quant: "Comps",
  tracking_interpreter: "Tracking",
  demand_signals: "Demand",
  consensus: "Consensus",
};

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Claude",
  openai: "GPT",
  google: "Gemini",
};

/** Compact view of the top bracket each cell favored. */
function topOf(probs: Record<string, number>): string {
  let best = { label: "—", p: -1 };
  for (const [label, p] of Object.entries(probs))
    if (p > best.p) best = { label, p };
  return best.p >= 0 ? `${best.label} ${Math.round(best.p * 100)}%` : "—";
}

export function MatrixGrid({
  outputs,
  labels,
}: {
  outputs: AgentOutputRow[];
  labels: string[];
}) {
  const providers = ["anthropic", "openai", "google"];
  const methods = ["comps_quant", "tracking_interpreter", "demand_signals"];

  const cell = (agent: string, model: string, phase: string) =>
    outputs.find(
      (o) => o.agent === agent && o.model === model && o.phase === phase,
    );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Independent matrix (top bracket per cell)
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-zinc-400">
              <th className="py-1 pr-4">Method ↓ / Model →</th>
              {providers.map((p) => (
                <th key={p} className="py-1 pr-4">
                  {PROVIDER_LABELS[p]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {methods.map((m) => (
              <tr key={m} className="border-t border-zinc-100">
                <td className="py-1.5 pr-4 font-medium">{METHOD_LABELS[m]}</td>
                {providers.map((p) => {
                  const c = cell(m, p, "independent");
                  return (
                    <td key={p} className="py-1.5 pr-4 font-mono text-xs">
                      {c ? topOf(c.bracket_probs) : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Consensus (per model, after seeing all method views)
        </h3>
        <table className="w-full text-sm">
          <tbody>
            {providers.map((p) => {
              const c = cell("consensus", p, "consensus");
              return (
                <tr key={p} className="border-t border-zinc-100">
                  <td className="py-1.5 pr-4 font-medium">
                    {PROVIDER_LABELS[p]}
                  </td>
                  <td className="py-1.5 pr-4 font-mono text-xs">
                    {labels
                      .map(
                        (l) =>
                          `${l}: ${Math.round((c?.bracket_probs[l] ?? 0) * 100)}%`,
                      )
                      .join("  ·  ")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
