/**
 * Buffers streaming deltas and only flushes at "safe" markdown boundaries
 * (newlines, sentence ends, closing code fences). Reduces flicker on tables
 * and code blocks that look broken mid-stream.
 *
 * Flushes anyway after `maxDelayMs` so the cursor still feels live.
 */
export function makeStreamBuffer(opts: {
  emit: (chunk: string) => void;
  maxDelayMs?: number;
}) {
  const { emit, maxDelayMs = 120 } = opts;
  let pending = '';
  let timer: number | null = null;
  let inFence = false;

  const safeTail = (s: string): number => {
    // Find the last "safe" cut: newline, sentence end, or end of string.
    for (let i = s.length - 1; i >= 0; i--) {
      const ch = s[i];
      if (ch === '\n') return i + 1;
      if (i > 0 && (ch === '.' || ch === '!' || ch === '?' || ch === ',' || ch === ' ') && /\s/.test(s[i + 1] ?? '\n')) {
        return i + 1;
      }
    }
    return 0;
  };

  const flushAll = () => {
    if (pending.length > 0) {
      emit(pending);
      pending = '';
    }
    if (timer != null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };

  const flushSafe = () => {
    if (pending.length === 0) return;
    // Track open code fences — never split inside them.
    const fenceCount = (pending.match(/```/g) ?? []).length;
    if (fenceCount % 2 === 1) inFence = !inFence;
    if (inFence) return; // wait until fence closes
    const cut = safeTail(pending);
    if (cut > 0) {
      emit(pending.slice(0, cut));
      pending = pending.slice(cut);
    }
  };

  return {
    push(chunk: string) {
      pending += chunk;
      flushSafe();
      if (timer == null) {
        timer = window.setTimeout(() => {
          timer = null;
          if (pending.length > 0) {
            emit(pending);
            pending = '';
          }
        }, maxDelayMs);
      }
    },
    flush: flushAll,
  };
}
