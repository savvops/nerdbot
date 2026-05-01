import { Mic, MicOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface Props {
  onTranscript: (text: string, final: boolean) => void;
  disabled?: boolean;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string; isFinal?: boolean }>> & { length: number } & { [k: number]: ArrayLike<{ transcript: string; isFinal?: boolean }> & { isFinal?: boolean } } }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

interface SpeechRecognitionCtor {
  new (): SpeechRecognitionInstance;
}

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export default function VoiceMic({ onTranscript, disabled }: Props) {
  const [recording, setRecording] = useState(false);
  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  const supported = !!getRecognitionCtor();

  useEffect(() => () => recRef.current?.stop(), []);

  if (!supported) return null;

  const toggle = () => {
    if (recording) {
      recRef.current?.stop();
      return;
    }
    const Ctor = getRecognitionCtor()!;
    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = navigator.language || 'en-US';
    let finalText = '';
    rec.onresult = (e) => {
      const results = e.results as unknown as ArrayLike<
        ArrayLike<{ transcript: string }> & { isFinal?: boolean }
      >;
      let interim = '';
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const t = r[0]?.transcript ?? '';
        if (r.isFinal) finalText += t;
        else interim += t;
      }
      onTranscript((finalText + interim).trim(), false);
    };
    rec.onend = () => {
      setRecording(false);
      if (finalText.trim()) onTranscript(finalText.trim(), true);
    };
    rec.onerror = () => setRecording(false);
    recRef.current = rec;
    setRecording(true);
    try {
      rec.start();
    } catch {
      setRecording(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={disabled}
      title={recording ? 'Stop recording' : 'Voice input'}
      className={`grid place-items-center w-8 h-8 rounded-full transition-colors ${
        recording
          ? 'bg-danger/20 text-danger animate-pulse-soft'
          : 'text-muted hover:text-ink hover:bg-elevated'
      } disabled:opacity-40`}
    >
      {recording ? <MicOff size={16} /> : <Mic size={16} />}
    </button>
  );
}
