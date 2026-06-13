/**
 * Expected value per $1 staked on a YES share bought at `price` (0..1),
 * when our estimated true probability is `prob`. Payout is $1 if it resolves YES.
 * EV = prob * (1/price - 1) - (1 - prob)  [profit per $1], expressed per share:
 * EV$ = prob * 1 - price  (cost `price`, returns $1 on win).
 */
export function evPerShare(prob: number, price: number): number {
  return prob - price; // buy YES at `price`, worth $1 w.p. prob
}

/**
 * Full-Kelly fraction of bankroll for a binary YES bet at decimal `price`.
 * Net odds b = (1 - price) / price; Kelly f* = (prob*(b+1) - 1) / b.
 * Returns 0 when there's no edge.
 */
export function fullKelly(prob: number, price: number): number {
  if (price <= 0 || price >= 1) return 0;
  const b = (1 - price) / price;
  const f = (prob * (b + 1) - 1) / b;
  return Math.max(0, f);
}

/** Quarter-Kelly — the humility discount we actually recommend. */
export function quarterKelly(prob: number, price: number): number {
  return fullKelly(prob, price) / 4;
}
