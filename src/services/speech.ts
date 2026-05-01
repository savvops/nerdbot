let current: SpeechSynthesisUtterance | null = null;

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function speak(text: string, opts?: { onEnd?: () => void }): void {
  if (!isSpeechSupported()) return;
  cancelSpeech();
  const u = new SpeechSynthesisUtterance(text.replace(/```[\s\S]*?```/g, ' [code block] '));
  u.rate = 1.05;
  u.pitch = 1;
  u.onend = () => opts?.onEnd?.();
  u.onerror = () => opts?.onEnd?.();
  current = u;
  window.speechSynthesis.speak(u);
}

export function cancelSpeech(): void {
  if (!isSpeechSupported()) return;
  window.speechSynthesis.cancel();
  current = null;
}

export function isSpeaking(): boolean {
  return !!current && window.speechSynthesis.speaking;
}
