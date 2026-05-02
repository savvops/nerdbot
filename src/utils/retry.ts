export function jitteredBackoff(attempt: number, base = 500, max = 30_000): number {
  const delay = Math.min(base * 2 ** (attempt - 1), max);
  return delay + Math.random() * delay * 0.25;
}

function defaultIsRetryable(e: unknown): boolean {
  if (e instanceof Error) {
    const msg = e.message;
    return msg.includes('429') || msg.includes('503') || msg.includes('502') || msg.includes('overloaded');
  }
  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  isRetryable = defaultIsRetryable
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (attempt === maxAttempts || !isRetryable(e)) throw e;
      await new Promise((res) => setTimeout(res, jitteredBackoff(attempt)));
    }
  }
  throw lastError;
}
