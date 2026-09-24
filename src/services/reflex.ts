/**
 * Nerdbot Reflex & Safety Engine (System 1)
 * Inspired by Laya architecture
 *
 * Provides:
 * - Sub-50ms target element disambiguation
 * - Fast safety & risk escalation scoring (0 = safe, 3 = critical human-in-the-loop approval)
 * - Optional zero-token decision bridge to local Laya server (http://127.0.0.1:8080)
 */

export interface TargetCandidate {
  id: string;
  name: string;
  role: string;
  selector?: string;
}

export interface RiskAssessment {
  riskScore: number; // 0 to 3
  level: 'safe' | 'low' | 'moderate' | 'critical';
  reason: string;
  requiresConfirmation: boolean;
}

const CRITICAL_KEYWORDS = [
  'pay',
  'payment',
  'checkout',
  'purchase',
  'buy now',
  'authorize',
  'credit card',
  'delete',
  'destroy',
  'remove account',
  'transfer',
  'send money',
  'confirm order',
  'place order',
  'billing',
  'subscribe',
];

const MODERATE_KEYWORDS = [
  'submit',
  'save',
  'update',
  'apply',
  'reset',
  'sign up',
  'register',
  'login',
  'sign in',
];

/**
 * Assesses risk level of an action primitive before execution
 */
export function assessActionRisk(
  action: 'click' | 'type' | 'navigate' | 'scroll' | 'scan_page',
  targetName = '',
  inputValue = ''
): RiskAssessment {
  const combined = `${targetName} ${inputValue}`.toLowerCase();

  // 1. Critical risk checks (Score 3)
  for (const kw of CRITICAL_KEYWORDS) {
    if (combined.includes(kw)) {
      return {
        riskScore: 3,
        level: 'critical',
        reason: `Action matches critical pattern "${kw}". Requires user approval.`,
        requiresConfirmation: true,
      };
    }
  }

  // 2. Moderate risk checks (Score 2)
  if (action === 'type' || action === 'click') {
    for (const kw of MODERATE_KEYWORDS) {
      if (combined.includes(kw)) {
        return {
          riskScore: 2,
          level: 'moderate',
          reason: `Form modification or state change on "${targetName}".`,
          requiresConfirmation: false,
        };
      }
    }
  }

  // 3. Low risk (Score 1)
  if (action === 'click' || action === 'navigate') {
    return {
      riskScore: 1,
      level: 'low',
      reason: 'Routine page interaction or navigation.',
      requiresConfirmation: false,
    };
  }

  // 4. Safe (Score 0)
  return {
    riskScore: 0,
    level: 'safe',
    reason: 'Read-only inspection or scrolling.',
    requiresConfirmation: false,
  };
}

/**
 * Fast target disambiguation: finds the best matching target candidate
 */
export function disambiguateTarget(
  query: string,
  candidates: TargetCandidate[]
): TargetCandidate | null {
  if (candidates.length === 0) return null;

  const normalizedQuery = query.toLowerCase().trim();

  // 1. Exact ID match (e.g. "t12")
  const byId = candidates.find((c) => c.id.toLowerCase() === normalizedQuery);
  if (byId) return byId;

  // 2. Exact name match
  const byExactName = candidates.find(
    (c) => c.name.toLowerCase() === normalizedQuery
  );
  if (byExactName) return byExactName;

  // 3. Name contains query
  const bySubstring = candidates.find((c) =>
    c.name.toLowerCase().includes(normalizedQuery)
  );
  if (bySubstring) return bySubstring;

  // 4. Token overlap scoring
  const queryTokens = normalizedQuery.split(/\s+/);
  let bestCandidate: TargetCandidate | null = null;
  let highestScore = 0;

  for (const c of candidates) {
    const nameTokens = c.name.toLowerCase().split(/\s+/);
    let matchCount = 0;
    for (const q of queryTokens) {
      if (nameTokens.some((t) => t.includes(q) || q.includes(t))) {
        matchCount++;
      }
    }
    const score = matchCount / Math.max(queryTokens.length, 1);
    if (score > highestScore && score >= 0.5) {
      highestScore = score;
      bestCandidate = c;
    }
  }

  return bestCandidate;
}

/**
 * Optional Laya HTTP bridge (if user has local Laya server running on 127.0.0.1:8080)
 */
export async function queryLocalLayaReflex(
  state: Record<string, unknown>,
  questions: Record<string, unknown>,
  timeoutMs = 400
): Promise<any | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch('http://127.0.0.1:8080/api/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, questions }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    clearTimeout(timer);
    return null; // Gracefully fallback to built-in heuristics if Laya is offline
  }
}
