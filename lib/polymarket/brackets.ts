/**
 * Bracket label parsing for Gamma `groupItemTitle` values like
 * "<145m", "145-158m", ">184m", "145m-158m", "$145-158M".
 */
export function parseBracketLabel(label: string): {
  loMillions: number | null;
  hiMillions: number | null;
} {
  const clean = label.replace(/[$,\s]/g, "").toLowerCase();

  const lt = clean.match(/^<(\d+(?:\.\d+)?)m?$/);
  if (lt) return { loMillions: null, hiMillions: Number(lt[1]) };

  const gt = clean.match(/^>(\d+(?:\.\d+)?)m?$/);
  if (gt) return { loMillions: Number(gt[1]), hiMillions: null };

  const range = clean.match(/^(\d+(?:\.\d+)?)m?-(\d+(?:\.\d+)?)m?$/);
  if (range)
    return { loMillions: Number(range[1]), hiMillions: Number(range[2]) };

  return { loMillions: null, hiMillions: null };
}

/**
 * Resolve a final gross (in millions) to the winning bracket label.
 * Polymarket tie rule: an exact boundary value resolves to the HIGHER bracket,
 * which falls out of using lo-inclusive / hi-exclusive intervals.
 */
export function winningBracket(
  grossMillions: number,
  brackets: { label: string; loMillions: number | null; hiMillions: number | null }[],
): string | null {
  for (const b of brackets) {
    const lo = b.loMillions ?? -Infinity;
    const hi = b.hiMillions ?? Infinity;
    if (grossMillions >= lo && grossMillions < hi) return b.label;
  }
  return null;
}

/** Sort brackets low to high for display. */
export function sortBrackets<T extends { loMillions: number | null }>(
  brackets: T[],
): T[] {
  return [...brackets].sort(
    (a, b) => (a.loMillions ?? -Infinity) - (b.loMillions ?? -Infinity),
  );
}
