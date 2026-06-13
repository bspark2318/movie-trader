import type { AgentBrief, MethodName, AgentOutput } from "./types";

const OUTPUT_CONTRACT = (labels: string[]) => `
## Output contract (STRICT)
End your response with a single fenced JSON block, and nothing after it:

\`\`\`json
{
  "bracket_probs": { ${labels.map((l) => `"${l}": 0.0`).join(", ")} },
  "confidence": "low" | "medium" | "high",
  "key_evidence": ["short bullet", "..."],
  "what_would_change_my_mind": "one sentence"
}
\`\`\`

Rules:
- bracket_probs keys MUST be exactly these labels: ${labels.join(", ")}
- The probabilities MUST sum to 1.0 (they will be renormalized, but get close).
- Base the distribution on YOUR method's evidence, not on the market's prices.
`;

export const SYSTEM_PROMPTS: Record<MethodName, string> = {
  comps_quant: `You are the COMPS QUANT — a box-office forecaster who works ONLY from historical comparables.

HARD RULE: You are FORBIDDEN from reading or relying on tracking articles, long-range forecasts, or any "industry tracking" numbers (Box Office Pro, Deadline tracking, etc.). If you encounter them, ignore them.

Method:
1. Use web search to pull 10–20 historical opening weekends from The Numbers / Box Office Mojo for comparable films — same genre, franchise tier, season, and similar theater count to this release.
2. Adjust each comp for ticket-price inflation (~$12 average ticket in 2026) and for theater-count differences vs. this film.
3. From the adjusted comp distribution alone, assign a probability to each market bracket.

Your job in the ensemble is to be the anchor that cannot be swayed by hype — if the market only makes sense ignoring 20 years of comparable openings, you are the one who says so.`,

  tracking_interpreter: `You are the TRACKING INTERPRETER — you read industry tracking but never trust it at face value.

Method:
1. Use web search to find the CURRENT tracking range for this film (Box Office Pro long-range forecast, Deadline, Box Office Theory).
2. Apply the documented tracking-error model: industry tracking has ~15–20% mean absolute error and the misses are ASYMMETRIC — fan-driven, horror, and internet-native films tend to BEAT tracking; star-driven dramas tend to miss LOW.
3. Convert the quoted tracking RANGE into bracket probabilities THROUGH that error model. Do NOT just place all mass inside the quoted range — real probability mass lands outside it, sized by what kind of film this is.

Your edge is not knowing the tracking (the market already prices that in) — it is knowing how tracking systematically fails.`,

  demand_signals: `You are the DEMAND SIGNALS analyst — you measure live audience demand directly, ignoring both comps and tracking.

Method:
1. Use web search to gather current demand signals: Google Trends trajectory, trailer view counts, Rotten Tomatoes / audience buzz, presale press mentions ("biggest first-day presales of the year" type reports), franchise goodwill, marketing-event momentum.
2. Calibrate by comparing this film's signal strength against 5–10 RECENT releases whose actual openings are known ("its Trends curve looks like X, which opened to $Y").
3. Output bracket probabilities PLUS a clear read on surprise direction — is this film likely to come in OVER or UNDER what the consensus expects?

You catch the late-breaking demand explosions and collapses that comps can't see and tracking is too slow to register.`,
};

function featuresSummary(brief: AgentBrief): string {
  const f = brief.features;
  const cal = f.calendar;
  const lines = [
    `- Weekend type: ${f.weekendType}${
      f.weekendDates ? ` (${f.weekendDates.start}–${f.weekendDates.end})` : ""
    }`,
    `- Calendar: ${
      cal.isHolidayWeekend
        ? `${cal.holidayName} weekend${cal.fourDayWeekend ? " (4-day!)" : ""}`
        : "no holiday"
    }, school: ${cal.schoolStatus}`,
  ];
  if (f.release.releaseDate)
    lines.push(
      `- Release: ${f.release.releaseDate}${
        f.release.daysUntilRelease !== null
          ? ` (${f.release.daysUntilRelease} days out)`
          : ""
      }${
        f.release.plannedTheaters
          ? `, ~${f.release.plannedTheaters} theaters`
          : ""
      }`,
    );
  if (f.release.sameWeekendReleases.length)
    lines.push(
      `- Same-weekend wide releases: ${f.release.sameWeekendReleases.join(", ")}`,
    );
  if (f.competition.topHoldovers.length)
    lines.push(
      `- Recent holdovers competing: ${f.competition.topHoldovers
        .map((h) => `${h.title} ($${h.lastWeekendGrossM}M)`)
        .join(", ")}`,
    );
  if (f.weather.available && f.weather.extremeWeatherDmas.length)
    lines.push(
      `- EXTREME weather flagged in: ${f.weather.extremeWeatherDmas.join(", ")}`,
    );
  return lines.join("\n");
}

export function buildBrief(brief: AgentBrief): string {
  const labels = brief.brackets.map((b) => b.label);
  return `# Market brief: ${brief.movieTitle}

Question: ${brief.question}

## Brackets and current market prices (¢ = cents on the dollar)
${brief.brackets
  .map(
    (b) =>
      `- ${b.label}: market ${Math.round(b.mid * 100)}¢ (you'd buy YES at ${Math.round(
        b.bestAsk * 100,
      )}¢)`,
  )
  .join("\n")}

## Resolution rules (verbatim — read carefully for the weekend definition)
${brief.resolutionRules}

## Structured features
${featuresSummary(brief)}

${OUTPUT_CONTRACT(labels)}`;
}

/** Method view = per-method median across the 3 model seats. */
export interface MethodView {
  method: MethodName;
  probs: Record<string, number>;
  evidence: string[];
}

export function buildConsensusPrompt(
  brief: AgentBrief,
  own: AgentOutput,
  methodViews: MethodView[],
): string {
  const labels = brief.brackets.map((b) => b.label);
  return `# Consensus round: ${brief.movieTitle}

You previously produced this distribution in the independent round:
${JSON.stringify(own.bracket_probs)}

Three METHOD VIEWS were formed by taking the median across all model seats for each method. Each is blind to the others' approach:

${methodViews
  .map(
    (v) =>
      `## ${v.method}\nprobs: ${JSON.stringify(v.probs)}\nevidence: ${v.evidence
        .slice(0, 5)
        .map((e) => `\n  - ${e}`)
        .join("")}`,
  )
  .join("\n\n")}

Reconcile these three method views into ONE integrated distribution. Weigh where the methods agree, and reason explicitly about WHY they diverge (the disagreement between methods is the signal — don't just average). State what you updated on.

${OUTPUT_CONTRACT(labels)}
Also include a "updated_on" field: one sentence on what moved you from your independent distribution.`;
}
