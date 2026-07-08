import { useState } from "react";
import type { ModelInfo } from "../../services/models";

interface Props {
  value: string;
  models: ModelInfo[];
  loading?: boolean;
  onChange: (id: string) => void;
}

const CUSTOM = "__custom__";

/**
 * Model picker rendered as a native <select> of known models with a
 * "Custom…" escape hatch to a free-text input. Meant to be used inside a
 * <Field>, so it renders no label of its own.
 */
export default function ModelSelect({ value, models, loading, onChange }: Props) {
  const [custom, setCustom] = useState(false);

  // A saved model that the provider no longer lists should never be lost.
  const known = models.some((m) => m.id === value);

  if (custom) {
    return (
      <div className="space-y-1">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
          placeholder="Enter a model id…"
          className="w-full bg-bg border border-border rounded-lg px-2.5 py-2 text-[12.5px] outline-none"
        />
        <button
          onClick={() => setCustom(false)}
          className="text-[10.5px] text-soft hover:text-ink"
        >
          ↩ list
        </button>
      </div>
    );
  }

  return (
    <select
      value={value}
      disabled={loading}
      onChange={(e) => {
        const next = e.target.value;
        if (next === CUSTOM) {
          setCustom(true);
          return;
        }
        onChange(next);
      }}
      className={`w-full bg-bg border border-border rounded-lg px-2.5 py-2 text-[12.5px] outline-none${
        loading ? " opacity-60" : ""
      }`}
    >
      {value && !known && (
        <option value={value}>{value} (custom)</option>
      )}
      {models.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
      <option value={CUSTOM}>Custom…</option>
    </select>
  );
}
