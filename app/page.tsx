import Link from "next/link";
import { fetchBoxOfficeEvents } from "@/lib/polymarket/gamma";
import { hasDb } from "@/lib/config";
import { BracketTable } from "@/components/BracketTable";

export const revalidate = 60;

export default async function Home() {
  let events;
  try {
    events = await fetchBoxOfficeEvents();
  } catch (err) {
    return (
      <p className="text-sm text-red-600">
        Failed to reach the Polymarket API: {String(err)}
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">
          Active box office markets
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Live from Polymarket. {events.length} open market
          {events.length === 1 ? "" : "s"}.
          {!hasDb() && (
            <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
              DB not configured — live view only
            </span>
          )}
        </p>
      </div>

      {events.length === 0 && (
        <p className="text-sm text-zinc-500">
          No open opening-weekend box office markets right now.
        </p>
      )}

      {events.map((ev) => (
        <section
          key={ev.slug}
          className="rounded-lg border border-zinc-200 p-4"
        >
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <Link
              href={`/market/${ev.slug}`}
              className="font-medium hover:underline"
            >
              {ev.title}
            </Link>
            <span className="shrink-0 text-xs text-zinc-500">
              {ev.weekendType !== "unknown" && `${ev.weekendType} weekend · `}
              resolves{" "}
              {ev.endDate
                ? new Date(ev.endDate).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })
                : "TBD"}
            </span>
          </div>
          <BracketTable brackets={ev.brackets} />
        </section>
      ))}
    </div>
  );
}
