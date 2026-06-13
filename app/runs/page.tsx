import Link from "next/link";
import { hasDb, missingProviderKeys } from "@/lib/config";
import { getSupabase } from "@/lib/db/client";
import { RunButton } from "@/components/RunButton";
import type { RunRow, MarketRow } from "@/lib/db/types";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const db = getSupabase();
  const missing = missingProviderKeys();

  let runs: (RunRow & { market?: MarketRow })[] = [];
  if (db) {
    const { data } = await db
      .from("runs")
      .select("*, market:markets(*)")
      .order("started_at", { ascending: false })
      .limit(50);
    runs = (data as typeof runs) ?? [];
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Runs</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Trigger the 3×3 agent matrix manually. Each run is ~12 LLM calls and
          takes a few minutes.
        </p>
      </div>

      {!hasDb() && (
        <p className="rounded bg-amber-50 p-3 text-sm text-amber-700">
          Supabase is not configured — runs require a database. Set{" "}
          <code>SUPABASE_URL</code> / <code>SUPABASE_SERVICE_KEY</code>.
        </p>
      )}
      {missing.length > 0 && (
        <p className="rounded bg-amber-50 p-3 text-sm text-amber-700">
          Missing LLM provider keys: {missing.join(", ")}. All three are needed
          for a run.
        </p>
      )}

      {hasDb() && missing.length === 0 && <RunButton />}

      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Recent runs
        </h2>
        {runs.length === 0 ? (
          <p className="text-sm text-zinc-500">No runs yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="py-2 pr-4">Market</th>
                <th className="py-2 pr-4">Started</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100">
                  <td className="py-2 pr-4">
                    {r.market ? (
                      <Link
                        href={`/market/${r.market.slug}`}
                        className="hover:underline"
                      >
                        {r.market.title}
                      </Link>
                    ) : (
                      r.market_id
                    )}
                  </td>
                  <td className="py-2 pr-4 text-zinc-500">
                    {new Date(r.started_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
