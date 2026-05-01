/** Cheap, dependency-free token estimator. ~4 chars/token for English. */
export function approxTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function formatCost(usd: number): string {
  if (usd === 0) return 'free';
  if (usd < 0.001) return '<$0.001';
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}
