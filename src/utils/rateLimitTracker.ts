export interface RateLimitState {
  requestsRemaining: number | null;
  requestsLimit: number | null;
  requestsResetSec: number | null;
  tokensRemaining: number | null;
  tokensLimit: number | null;
  tokensResetSec: number | null;
  capturedAt: number;
}

function num(s: string | null): number | null {
  if (s == null) return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

function resetSec(s: string | null): number | null {
  if (s == null) return null;
  // Anthropic/OpenAI: seconds as number string; some providers: ISO timestamp
  const n = Number(s);
  if (!isNaN(n)) return n;
  const ms = new Date(s).getTime();
  if (!isNaN(ms)) return (ms - Date.now()) / 1000;
  return null;
}

export function parseRateLimitHeaders(headers: Headers): RateLimitState {
  return {
    requestsRemaining:
      num(headers.get('anthropic-ratelimit-requests-remaining')) ??
      num(headers.get('x-ratelimit-remaining-requests')),
    requestsLimit:
      num(headers.get('anthropic-ratelimit-requests-limit')) ??
      num(headers.get('x-ratelimit-limit-requests')),
    requestsResetSec:
      resetSec(headers.get('anthropic-ratelimit-requests-reset')) ??
      resetSec(headers.get('x-ratelimit-reset-requests')),
    tokensRemaining:
      num(headers.get('anthropic-ratelimit-tokens-remaining')) ??
      num(headers.get('x-ratelimit-remaining-tokens')),
    tokensLimit:
      num(headers.get('anthropic-ratelimit-tokens-limit')) ??
      num(headers.get('x-ratelimit-limit-tokens')),
    tokensResetSec:
      resetSec(headers.get('anthropic-ratelimit-tokens-reset')) ??
      resetSec(headers.get('x-ratelimit-reset-tokens')),
    capturedAt: Date.now(),
  };
}

const _state = new Map<string, RateLimitState>();

export function captureRateLimits(providerId: string, headers: Headers): void {
  const s = parseRateLimitHeaders(headers);
  if (s.requestsRemaining !== null || s.tokensRemaining !== null) {
    _state.set(providerId, s);
  }
}

export function getRateLimits(providerId: string): RateLimitState | null {
  return _state.get(providerId) ?? null;
}

/** Returns a display string like "450 req / 80K tok remaining" or null if no data. */
export function rateLimitSummary(providerId: string): string | null {
  const s = _state.get(providerId);
  if (!s) return null;
  const age = (Date.now() - s.capturedAt) / 1000;
  if (age > 120) return null; // stale after 2 min
  const parts: string[] = [];
  if (s.requestsRemaining !== null) parts.push(`${s.requestsRemaining} req`);
  if (s.tokensRemaining !== null) {
    parts.push(
      s.tokensRemaining >= 1000
        ? `${(s.tokensRemaining / 1000).toFixed(0)}K tok`
        : `${s.tokensRemaining} tok`
    );
  }
  return parts.length ? parts.join(' / ') + ' remaining' : null;
}
