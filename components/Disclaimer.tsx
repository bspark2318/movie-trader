export function Disclaimer() {
  return (
    <p className="rounded bg-zinc-50 p-3 text-xs leading-relaxed text-zinc-500">
      Research tool, not financial advice. All recommendations are paper-trade by
      default. The system only proposes a bet when its agents agree and diverge
      from the executable market price by a wide margin — most runs correctly
      produce <strong>NO BET</strong>. Do not deploy real capital until the
      ensemble has beaten the market&rsquo;s own Brier score over ≥25 resolved
      markets.
    </p>
  );
}
