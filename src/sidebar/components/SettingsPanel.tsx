import { useState } from 'react';
import { ExternalLink, Eye, EyeOff, X } from 'lucide-react';
import type { ProviderId, Settings } from '../../services/types';
import { PROVIDER_DOCS, PROVIDER_LABELS } from '../../services/config';

interface Props {
  open: boolean;
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
}

const PROVIDER_ORDER: ProviderId[] = ['gemini', 'openai', 'openrouter', 'lmstudio', 'ollama'];

export default function SettingsPanel({ open, settings, onChange, onClose }: Props) {
  const [showKey, setShowKey] = useState(false);
  if (!open) return null;
  const provider = settings.providers[settings.activeProvider];

  const updateProvider = (patch: Partial<typeof provider>) => {
    onChange({
      ...settings,
      providers: {
        ...settings.providers,
        [settings.activeProvider]: { ...provider, ...patch },
      },
    });
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/55 animate-fade-in flex items-stretch sm:items-center justify-end sm:justify-center p-0 sm:p-3">
      <div className="w-full sm:max-w-[420px] sm:rounded-2xl bg-surface border-l sm:border border-border shadow-2xl overflow-hidden flex flex-col h-full sm:max-h-[90vh] animate-slide-up">
        <div className="flex items-center justify-between px-4 h-12 border-b border-border">
          <div>
            <div className="text-[13.5px] font-semibold">Settings</div>
            <div className="text-[11px] text-muted">Provider, model, theme</div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-elevated"
          >
            <X size={14} />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-5 flex-1">
          <Field label="Provider">
            <div className="grid grid-cols-2 gap-1.5">
              {PROVIDER_ORDER.map((id) => (
                <button
                  key={id}
                  onClick={() => onChange({ ...settings, activeProvider: id })}
                  className={`px-2.5 py-2 text-[12.5px] rounded-lg border transition-colors text-left ${
                    settings.activeProvider === id
                      ? 'bg-accent/15 border-accent/50 text-ink'
                      : 'bg-bg border-border text-muted hover:text-ink'
                  }`}
                >
                  {PROVIDER_LABELS[id]}
                </button>
              ))}
            </div>
          </Field>

          <Field
            label="API key"
            hint={
              <a
                href={PROVIDER_DOCS[provider.id]}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline inline-flex items-center gap-0.5"
              >
                Get key <ExternalLink size={10} />
              </a>
            }
          >
            <div className="flex items-center gap-1 bg-bg border border-border rounded-lg px-2.5 focus-within:border-accent/50">
              <input
                type={showKey ? 'text' : 'password'}
                value={provider.apiKey}
                onChange={(e) => updateProvider({ apiKey: e.target.value })}
                placeholder={provider.id === 'lmstudio' || provider.id === 'ollama' ? 'Not required' : 'sk-…'}
                className="flex-1 py-2 text-[13px] outline-none"
              />
              <button
                onClick={() => setShowKey((v) => !v)}
                className="p-1 text-muted hover:text-ink"
                title={showKey ? 'Hide' : 'Show'}
              >
                {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </Field>

          <Field label="Base URL">
            <input
              value={provider.baseUrl}
              onChange={(e) => updateProvider({ baseUrl: e.target.value })}
              className="w-full bg-bg border border-border focus-within:border-accent/50 rounded-lg px-3 py-2 text-[13px] outline-none"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Fast model">
              <input
                value={provider.fastModel}
                onChange={(e) => updateProvider({ fastModel: e.target.value })}
                className="w-full bg-bg border border-border rounded-lg px-2.5 py-2 text-[12.5px] outline-none"
              />
            </Field>
            <Field label="Quality model">
              <input
                value={provider.qualityModel}
                onChange={(e) => updateProvider({ qualityModel: e.target.value })}
                className="w-full bg-bg border border-border rounded-lg px-2.5 py-2 text-[12.5px] outline-none"
              />
            </Field>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fast image model">
              <input
                value={provider.fastImageModel || ''}
                onChange={(e) => updateProvider({ fastImageModel: e.target.value })}
                placeholder="e.g. gemini-2.0-flash"
                className="w-full bg-bg border border-border rounded-lg px-2.5 py-2 text-[12.5px] outline-none"
              />
            </Field>
            <Field label="Quality image model">
              <input
                value={provider.qualityImageModel || ''}
                onChange={(e) => updateProvider({ qualityImageModel: e.target.value })}
                placeholder="e.g. imagen-3.0-generate-002"
                className="w-full bg-bg border border-border rounded-lg px-2.5 py-2 text-[12.5px] outline-none"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Fast audio model">
              <input
                value={provider.fastAudioModel || ''}
                onChange={(e) => updateProvider({ fastAudioModel: e.target.value })}
                placeholder="e.g. gemini-2.0-flash"
                className="w-full bg-bg border border-border rounded-lg px-2.5 py-2 text-[12.5px] outline-none"
              />
            </Field>
            <Field label="Quality audio model">
              <input
                value={provider.qualityAudioModel || ''}
                onChange={(e) => updateProvider({ qualityAudioModel: e.target.value })}
                placeholder="e.g. gemini-2.5-pro"
                className="w-full bg-bg border border-border rounded-lg px-2.5 py-2 text-[12.5px] outline-none"
              />
            </Field>
          </div>

          {provider.id === 'gemini' && (
            <Field label="Embedding model (for Knowledge Base / projects)">
              <input
                value={provider.embeddingModel || ''}
                onChange={(e) => updateProvider({ embeddingModel: e.target.value })}
                placeholder="e.g. gemini-embedding-001 or text-embedding-004"
                className="w-full bg-bg border border-border rounded-lg px-2.5 py-2 text-[12.5px] outline-none"
              />
              <div className="text-[10.5px] text-soft mt-1">
                Used to embed project files & queries. Leave blank for the default
                (<code className="text-ink/80">gemini-embedding-001</code>). Other options:{' '}
                <code className="text-ink/80">gemini-embedding-2</code>,{' '}
                <code className="text-ink/80">gemini-embedding-2-preview</code>. List your
                key's available models with <code className="text-ink/80">/v1beta/models</code>.
              </div>
            </Field>
          )}

          <Field label={`Temperature · ${settings.temperature.toFixed(2)}`}>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={settings.temperature}
              onChange={(e) => onChange({ ...settings, temperature: Number(e.target.value) })}
              className="w-full accent-[rgb(var(--nb-accent))]"
            />
          </Field>

          <Field label={`Max tokens · ${settings.maxTokens}`}>
            <input
              type="range"
              min={256}
              max={16000}
              step={128}
              value={settings.maxTokens}
              onChange={(e) => onChange({ ...settings, maxTokens: Number(e.target.value) })}
              className="w-full accent-[rgb(var(--nb-accent))]"
            />
          </Field>

          {/* ── Knowledge & Context ── */}
          <div className="border-t border-border pt-4">
            <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-3">Knowledge & Context</div>

            <div className="space-y-4">
              <Field label={`RAG chunks per query · ${settings.ragChunks ?? 5}`}>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={settings.ragChunks ?? 5}
                  onChange={(e) => onChange({ ...settings, ragChunks: Number(e.target.value) })}
                  className="w-full accent-[rgb(var(--nb-accent))]"
                />
                <div className="flex justify-between text-[10px] text-soft mt-0.5">
                  <span>1 (precise)</span>
                  <span>~{(settings.ragChunks ?? 5) * 300} tokens added</span>
                  <span>10 (broad)</span>
                </div>
              </Field>

              <Field
                label={`Context limit · ${settings.maxContextTokens > 0 ? `${(settings.maxContextTokens / 1000).toFixed(0)}K tokens` : 'Auto'}`}
              >
                <input
                  type="range"
                  min={0}
                  max={256000}
                  step={4000}
                  value={settings.maxContextTokens}
                  onChange={(e) => onChange({ ...settings, maxContextTokens: Number(e.target.value) })}
                  className="w-full accent-[rgb(var(--nb-accent))]"
                />
                <div className="flex justify-between text-[10px] text-soft mt-0.5">
                  <span>Auto (provider default)</span>
                  <span>256K</span>
                </div>
                <div className="text-[10.5px] text-soft mt-1">
                  Old messages are auto-trimmed when the chat exceeds this limit. Set to Auto to use the provider's max window.
                </div>
              </Field>
            </div>
          </div>

          <Field label="Theme">
            <div className="grid grid-cols-3 gap-1.5">
              {(['dark', 'light', 'system'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    onChange({ ...settings, theme: t });
                    const root = document.documentElement;
                    if (t === 'system') {
                      const prefDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                      root.classList.toggle('dark', prefDark);
                      root.classList.toggle('light', !prefDark);
                    } else {
                      root.classList.toggle('dark', t === 'dark');
                      root.classList.toggle('light', t === 'light');
                    }
                  }}
                  className={`px-2.5 py-2 text-[12.5px] rounded-lg border transition-colors capitalize ${
                    settings.theme === t
                      ? 'bg-accent/15 border-accent/50 text-ink'
                      : 'bg-bg border-border text-muted hover:text-ink'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <div className="px-4 py-3 border-t border-border bg-bg text-[11px] text-muted">
          Settings sync to this browser only. Keys never leave your device.
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[11.5px] text-muted font-medium">{label}</label>
        {hint && <span className="text-[11px]">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
