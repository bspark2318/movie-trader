import { notFound } from "next/navigation";
import { fetchEventBySlug } from "@/lib/polymarket/gamma";
import { hasDb } from "@/lib/config";
import { BracketTable } from "@/components/BracketTable";

export const revalidate = 60;

export default async function MarketPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ev = await fetchEventBySlug(slug);
  if (!ev) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{ev.title}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {ev.weekendType !== "unknown" && `${ev.weekendType} weekend`}
          {ev.weekendDates &&
            ` (${ev.weekendDates.start} – ${ev.weekendDates.end})`}
          {" · "}resolves{" "}
          {ev.endDate ? new Date(ev.endDate).toLocaleString() : "TBD"}
          {" · "}${Math.round(ev.liquidity).toLocaleString()} liquidity
        </p>
      </div>

      <section className="rounded-lg border border-zinc-200 p-4">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Brackets
        </h2>
        <BracketTable brackets={ev.brackets} />
      </section>

      {!hasDb() && (
        <p className="rounded bg-amber-50 p-3 text-sm text-amber-700">
          Database not configured — agent runs, history, and recommendations
          appear here once Supabase is connected.
        </p>
      )}

      <section className="rounded-lg border border-zinc-200 p-4">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Resolution rules (verbatim)
        </h2>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
          {ev.resolutionRules || "No resolution rules found."}
        </p>
      </section>
    </div>
  );
}
