import { env } from "@/lib/config";
import dmas from "./data/dmas.json";

export interface WeatherFeature {
  available: boolean;
  /** Names of top-10 DMAs with an EXTREME event forecast for the weekend. */
  extremeWeatherDmas: string[];
}

// Only flag genuinely disruptive events; ordinary weather barely moves national box office.
const EXTREME = /blizzard|hurricane|tornado|ice storm|tropical storm/i;

/**
 * Extreme-weather flag for the top-10 DMAs. Returns `available:false` (and never
 * throws) when OPENWEATHER_API_KEY is unset — this is a flag, never a blocker.
 */
export async function weatherFor(weekendDateIso: string): Promise<WeatherFeature> {
  const key = env().OPENWEATHER_API_KEY;
  if (!key) return { available: false, extremeWeatherDmas: [] };

  const targetDay = weekendDateIso.slice(0, 10);
  const flagged: string[] = [];

  await Promise.all(
    dmas.map(async (dma) => {
      try {
        const url =
          `https://api.openweathermap.org/data/2.5/forecast?lat=${dma.lat}&lon=${dma.lon}` +
          `&appid=${key}&units=imperial`;
        const res = await fetch(url, { next: { revalidate: 3600 } });
        if (!res.ok) return;
        const data = (await res.json()) as {
          list?: { dt_txt?: string; weather?: { main?: string; description?: string }[] }[];
        };
        const hit = (data.list ?? []).some(
          (slot) =>
            slot.dt_txt?.startsWith(targetDay) &&
            (slot.weather ?? []).some((w) =>
              EXTREME.test(`${w.main ?? ""} ${w.description ?? ""}`),
            ),
        );
        if (hit) flagged.push(dma.name);
      } catch {
        /* ignore — weather is best-effort */
      }
    }),
  );

  return { available: true, extremeWeatherDmas: flagged };
}
