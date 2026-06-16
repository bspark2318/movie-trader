import Link from "next/link";
import { fetchBoxOfficeEvents } from "@/lib/polymarket/gamma";
import { hasDb, missingProviderKeys } from "@/lib/config";
import { LiveBoard } from "@/components/LiveBoard";

export const dynamic = "force-dynamic";

export default async function LivePage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>;
}) {
  const { slug } = await searchParams;

  let events;
  try {
    events = await fetchBoxOfficeEvents();
  } catch (err) {
    return (
      <p className="text-sm text-red-600">
        Failed to reach Polymarket: {String(err)}
      </p>
    );
  }

  const active = slug || events[0]?.slug;
  const missingKeys = missingProviderKeys();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Live run board</h1>
        {events.length > 1 && (
          <div className="flex flex-wrap gap-1.5 text-xs">
            {events.map((ev) => (
              <Link
                key={ev.slug}
                href={`/live?slug=${ev.slug}`}
                className={`rounded px-2 py-1 ${
                  ev.slug === active
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                {ev.movieTitle || ev.title}
              </Link>
            ))}
          </div>
        )}
      </div>

      {(!hasDb() || missingKeys.length > 0) && (
        <div className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {!hasDb() && <div>Supabase not configured — runs won&apos;t persist.</div>}
          {missingKeys.length > 0 && (
            <div>Missing provider keys: {missingKeys.join(", ")}.</div>
          )}
        </div>
      )}

      {active ? (
        <LiveBoard slug={active} />
      ) : (
        <p className="text-sm text-zinc-500">No active box-office markets.</p>
      )}
    </div>
  );
}
