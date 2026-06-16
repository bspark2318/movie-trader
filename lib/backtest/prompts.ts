import type { BacktestMovie } from "./types";

export const BACKTEST_ADDENDUM = `

--- BACKTEST MODE (read carefully) ---
WEB SEARCH IS DISABLED. You are forecasting a film's opening weekend BEFORE it was released, as of the date given below.
- You MAY use your knowledge of comparable PAST films — their historical openings are fair game.
- You MUST NOT use any knowledge of THIS film's actual opening result. Forecast as if the weekend has not happened.
- If you happen to already know this film's actual opening figure from memory, forecast honestly anyway and disclose it in the leakage_self_report field.`;

function rangeText(lo: number | null, hi: number | null): string {
  if (lo === null && hi !== null) return `under $${hi}M`;
  if (hi === null && lo !== null) return `$${lo}M or more`;
  return `$${lo}M–$${hi}M`;
}

export function buildBacktestBrief(
  movie: BacktestMovie,
  asOfDate: string,
  wikiTimestamp: string | null,
  wikiText: string | null,
): string {
  const labels = movie.brackets.map((b) => b.label);
  return `# Backtest forecast: ${movie.title}
Forecast the DOMESTIC opening weekend gross. It is ${asOfDate} — BEFORE the ${movie.releaseDateISO} release (${movie.weekendType} opening weekend). The film has not opened.

## Brackets (3-day domestic opening)
${movie.brackets.map((b) => `- ${b.label}: ${rangeText(b.lo, b.hi)}`).join("\n")}

## As-of context — Wikipedia article as it read on ${wikiTimestamp ?? "n/a"}
${wikiText ? wikiText : "(no as-of article available — rely on comparable films you know that predate this release)"}

## Output contract (STRICT)
End your response with a single fenced JSON block and nothing after it:

\`\`\`json
{
  "bracket_probs": { ${labels.map((l) => `"${l}": 0.0`).join(", ")} },
  "confidence": "low" | "medium" | "high",
  "key_evidence": ["short bullet", "..."],
  "what_would_change_my_mind": "one sentence",
  "leakage_self_report": "none" | "suspected" | "known"
}
\`\`\`

Rules:
- bracket_probs keys MUST be exactly: ${labels.join(", ")}
- Probabilities MUST sum to 1.0.
- Base the distribution on comparable films and the as-of context — NOT on any post-release knowledge of this film.
- leakage_self_report: "known" if you already recall this film's actual opening, "suspected" if unsure, "none" otherwise.`;
}
