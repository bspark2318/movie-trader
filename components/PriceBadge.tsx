export function pct(v: number): string {
  return `${Math.round(v * 100)}¢`;
}

export function PriceBadge({ value, dim }: { value: number; dim?: boolean }) {
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 font-mono text-sm tabular-nums ${
        dim ? "text-zinc-400" : "bg-zinc-100 text-zinc-900"
      }`}
    >
      {pct(value)}
    </span>
  );
}
