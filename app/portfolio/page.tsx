import { buildPaperPortfolio } from "@/lib/paper/ledger";

export const dynamic = "force-dynamic";

function money(n: number): string {
  const s = n < 0 ? "-" : "";
  return `${s}$${Math.abs(n).toFixed(2)}`;
}

export default async function PortfolioPage() {
  const p = await buildPaperPortfolio();

  if (!p) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">Paper portfolio</h1>
        <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Supabase isn&apos;t configured — the ledger needs the DB to read logged
          bets.
        </p>
      </div>
    );
  }

  const up = p.returnPct >= 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Paper portfolio</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Every gate-emitted bet, staked flat ¼-Kelly on a ${p.startingBankroll}{" "}
          notional bankroll, settled on resolution. Paper only — no real money.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="Equity" value={money(p.equity)} accent={up} />
        <Card
          label="Return"
          value={`${up ? "+" : ""}${p.returnPct.toFixed(1)}%`}
          accent={up}
        />
        <Card label="Realized" value={money(p.realizedPnl)} />
        <Card label="Unrealized" value={money(p.unrealizedPnl)} />
      </div>

      <p className="text-xs text-zinc-500">
        {p.counts.won}W · {p.counts.lost}L · {p.counts.open} open
        {p.counts.won + p.counts.lost > 0 && (
          <>
            {" "}
            ·{" "}
            {Math.round(
              (p.counts.won / (p.counts.won + p.counts.lost)) * 100,
            )}
            % win rate
          </>
        )}
      </p>
      <div className="rounded bg-zinc-50 px-3 py-2 text-sm">
        <span className="font-medium">Gate-approved only:</span>{" "}
        <span
          className={
            p.gateOnly.realizedPnl >= 0 ? "text-emerald-700" : "text-red-600"
          }
        >
          {p.gateOnly.realizedPnl >= 0 ? "+" : ""}
          {money(p.gateOnly.realizedPnl)} realized
        </span>{" "}
        <span className="text-zinc-500">
          ({p.gateOnly.won}W · {p.gateOnly.lost}L · {p.gateOnly.open} open)
        </span>
        <span className="ml-1 text-[11px] text-zinc-400">
          — does the strict gate beat betting every run?
        </span>
      </div>
      <p className="text-[11px] text-zinc-400">
        Every run logs a trade (the ensemble&apos;s best value pick). A green
        ✓gate = it also cleared the strict gate. The all-picks vs gate-only
        comparison is the experiment.
      </p>

      {p.positions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-500">
          No paper positions yet. They appear here when a run&apos;s gate emits a
          bet (it&apos;s a strict gate — agreement + edge + liquidity + timing —
          so bets are rare by design).
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-400">
                <th className="py-2 pr-4">Market</th>
                <th className="py-2 pr-4">Bet</th>
                <th className="py-2 pr-4">Entry</th>
                <th className="py-2 pr-4">Stake</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4 text-right">P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {p.positions.map((pos) => (
                <tr key={pos.id} className="border-b border-zinc-100">
                  <td className="py-2 pr-4">{pos.marketTitle}</td>
                  <td className="py-2 pr-4">
                    <span className="font-medium">{pos.bracketLabel}</span>{" "}
                    <span className="text-xs text-zinc-400">
                      +{pos.edgePts}pts
                    </span>
                    {pos.gatePassed ? (
                      <span
                        className="ml-1 text-emerald-600"
                        title="cleared the strict gate"
                      >
                        ✓gate
                      </span>
                    ) : (
                      <span className="ml-1 text-zinc-300" title="logged, did not clear the gate">
                        ·
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">
                    {Math.round(pos.entryPrice * 100)}¢
                    {pos.mark !== null && (
                      <span className="text-zinc-400">
                        {" "}
                        → {Math.round(pos.mark * 100)}¢
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">
                    {money(pos.stake)}
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs ${
                        pos.status === "won"
                          ? "bg-emerald-50 text-emerald-700"
                          : pos.status === "lost"
                            ? "bg-red-50 text-red-600"
                            : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {pos.status}
                    </span>
                  </td>
                  <td
                    className={`py-2 pr-4 text-right font-mono ${
                      pos.pnl > 0
                        ? "text-emerald-600"
                        : pos.pnl < 0
                          ? "text-red-600"
                          : "text-zinc-400"
                    }`}
                  >
                    {pos.pnl >= 0 ? "+" : ""}
                    {money(pos.pnl)}
                    {pos.status === "open" && (
                      <span className="text-[10px] text-zinc-400"> (unrl)</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-zinc-400">
        Research tool, not financial advice. Hypothetical results; paper trading.
      </p>
    </div>
  );
}

function Card({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        accent === undefined
          ? "border-zinc-200"
          : accent
            ? "border-emerald-200 bg-emerald-50/40"
            : "border-red-200 bg-red-50/40"
      }`}
    >
      <div className="text-[11px] uppercase tracking-wide text-zinc-400">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-lg">{value}</div>
    </div>
  );
}
