/**
 * Point-in-time Wikipedia: the article exactly as it read on a given date,
 * via the MediaWiki revisions API. A pre-release revision contains the cast,
 * budget, marketing, release plan and tracking mentions — but NOT the opening
 * gross (added after the weekend). This is our leakage-safe "as-of" context.
 */
export async function wikipediaAsOf(
  title: string,
  isoDate: string, // YYYY-MM-DD
): Promise<{ timestamp: string; text: string } | null> {
  const url =
    "https://en.wikipedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query",
      prop: "revisions",
      titles: title,
      rvstart: `${isoDate}T00:00:00Z`,
      rvlimit: "1",
      rvprop: "content|timestamp",
      rvslots: "main",
      format: "json",
      formatversion: "2",
    });

  const res = await fetch(url, {
    headers: { "User-Agent": "movie-edge-research/0.1 (backtest)" },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const page = data?.query?.pages?.[0];
  const rev = page?.revisions?.[0];
  const raw: string | undefined = rev?.slots?.main?.content;
  if (!raw) return null;

  return { timestamp: rev.timestamp, text: stripWikitext(raw) };
}

/** Lightweight wikitext → readable text. Not perfect; good enough for an LLM brief. */
function stripWikitext(s: string): string {
  let t = s;
  t = t.replace(/<ref[^>]*\/>/gi, "");
  t = t.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "");
  t = t.replace(/<!--[\s\S]*?-->/g, "");
  // Drop infobox / citation / other templates (nested-ish, a few passes).
  for (let i = 0; i < 5; i++) t = t.replace(/\{\{[^{}]*\}\}/g, "");
  t = t.replace(/\[\[(?:[^\]|]*\|)?([^\]|]+)\]\]/g, "$1"); // [[a|b]] -> b
  t = t.replace(/\[\[([^\]]+)\]\]/g, "$1");
  t = t.replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, "$1"); // [url text] -> text
  t = t.replace(/'''?/g, "");
  t = t.replace(/^==+\s*([^=]+?)\s*=+=*/gm, "\n## $1"); // headings
  t = t.replace(/<[^>]+>/g, " ");
  t = t.replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ");
  return t.trim().slice(0, 7000);
}
