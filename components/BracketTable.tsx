import type { Bracket } from "@/lib/polymarket/types";
import { PriceBadge } from "./PriceBadge";

export function BracketTable({
  brackets,
  ensemble,
}: {
  brackets: Bracket[];
  /** Optional ensemble probabilities keyed by bracket label (last run). */
  ensemble?: Record<string, number>;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
          <th className="py-2 pr-4">Bracket</th>
          <th className="py-2 pr-4">Market</th>
          <th className="py-2 pr-4">Bid / Ask</th>
          <th className="py-2 pr-4">Spread</th>
          <th className="py-2 pr-4">Liquidity</th>
          {ensemble && <th className="py-2 pr-4">Ensemble</th>}
          {ensemble && <th className="py-2">Edge</th>}
        </tr>
      </thead>
      <tbody>
        {brackets.map((b) => {
          const ens = ensemble?.[b.label];
          const edge = ens !== undefined ? ens - b.bestAsk : undefined;
          return (
            <tr key={b.label} className="border-b border-zinc-100">
              <td className="py-2 pr-4 font-medium">{b.label}</td>
              <td className="py-2 pr-4">
                <PriceBadge value={b.mid} />
              </td>
              <td className="py-2 pr-4 font-mono text-zinc-500 tabular-nums">
                {Math.round(b.bestBid * 100)}¢ / {Math.round(b.bestAsk * 100)}¢
              </td>
              <td className="py-2 pr-4 font-mono tabular-nums">
                {Math.round(b.spread * 100)}¢
              </td>
              <td className="py-2 pr-4 font-mono tabular-nums">
                ${Math.round(b.liquidity).toLocaleString()}
              </td>
              {ensemble && (
                <td className="py-2 pr-4 font-mono tabular-nums">
                  {ens !== undefined ? `${Math.round(ens * 100)}%` : "—"}
                </td>
              )}
              {ensemble && (
                <td
                  className={`py-2 font-mono tabular-nums ${
                    edge !== undefined && Math.abs(edge) >= 0.08
                      ? "font-semibold text-emerald-700"
                      : "text-zinc-500"
                  }`}
                >
                  {edge !== undefined
                    ? `${edge > 0 ? "+" : ""}${Math.round(edge * 100)}`
                    : "—"}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
