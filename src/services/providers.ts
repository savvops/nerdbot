import { activeModel, activeProvider, isSearchCapable } from './config';
import type { Attachment, Message, ProviderId, Settings } from './types';

export interface StreamRequest {
  settings: Settings;
  systemPrompt: string;
  messages: Message[];
  signal: AbortSignal;
  onDelta: (text: string) => void;
  onCitations?: (citations: Citation[]) => void;
  webSearch?: boolean;
}

export interface Citation {
  uri: string;
  title?: string;
}

export async function streamCompletion(req: StreamRequest): Promise<string> {
  const provider = activeProvider(req.settings).id;
  if (provider === 'gemini') return streamGemini(req);
  return streamOpenAICompatible(req);
}

function attachmentsToGeminiParts(atts: Attachment[] = []) {
  return atts
    .filter((a) => a.kind === 'image' || a.kind === 'screenshot')
    .map((a) => ({
      inlineData: { mimeType: a.mimeType, data: a.data },
    }));
}

function attachmentsToOpenAIParts(atts: Attachment[] = []) {
  return atts
    .filter((a) => a.kind === 'image' || a.kind === 'screenshot')
    .map((a) => ({
      type: 'image_url' as const,
      image_url: { url: `data:${a.mimeType};base64,${a.data}` },
    }));
}

async function streamGemini(req: StreamRequest): Promise<string> {
  const { settings, systemPrompt, messages, signal, onDelta, onCitations, webSearch } = req;
  const cfg = activeProvider(settings);
  const model = activeModel(settings);
  if (!cfg.apiKey) throw new Error('Add a Gemini API key in Settings.');

  const url = `${cfg.baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(
    model
  )}:streamGenerateContent?alt=sse&key=${encodeURIComponent(cfg.apiKey)}`;

  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => {
      const parts: unknown[] = [];
      if (m.content) parts.push({ text: m.content });
      parts.push(...attachmentsToGeminiParts(m.attachments));
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: parts.length > 0 ? parts : [{ text: ' ' }],
      };
    });

  const body: Record<string, unknown> = {
    contents,
    systemInstruction: systemPrompt
      ? { role: 'user', parts: [{ text: systemPrompt }] }
      : undefined,
    generationConfig: {
      temperature: settings.temperature,
      maxOutputTokens: settings.maxTokens,
    },
  };

  if (webSearch && isSearchCapable(settings)) {
    body.tools = [{ google_search: {} }];
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    const text = await safeText(res);
    throw new Error(`Gemini error (${res.status}): ${text || res.statusText}`);
  }

  let full = '';
  const cites: Citation[] = [];
  await readSse(res.body, (chunk) => {
    try {
      const obj = JSON.parse(chunk);
      const cand = obj?.candidates?.[0];
      const parts = cand?.content?.parts;
      if (Array.isArray(parts)) {
        for (const p of parts) {
          if (typeof p?.text === 'string') {
            full += p.text;
            onDelta(p.text);
          }
        }
      }
      const grounding = cand?.groundingMetadata?.groundingChunks;
      if (Array.isArray(grounding)) {
        for (const g of grounding) {
          const uri = g?.web?.uri;
          if (uri && !cites.some((c) => c.uri === uri)) {
            cites.push({ uri, title: g.web?.title });
          }
        }
      }
    } catch {
      /* skip */
    }
  });
  if (onCitations && cites.length) onCitations(cites);
  return full;
}

async function streamOpenAICompatible(req: StreamRequest): Promise<string> {
  const { settings, systemPrompt, messages, signal, onDelta } = req;
  const cfg = activeProvider(settings);
  const provider = cfg.id as ProviderId;
  const model = activeModel(settings);

  if (!cfg.apiKey && provider !== 'lmstudio' && provider !== 'ollama') {
    throw new Error(`Add an API key for ${provider} in Settings.`);
  }

  const url = `${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cfg.apiKey || 'none'}`,
  };
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://nerdbot.local';
    headers['X-Title'] = 'Nerdbot';
  }

  const body = {
    model,
    stream: true,
    temperature: settings.temperature,
    max_tokens: settings.maxTokens,
    messages: [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      ...messages
        .filter((m) => m.role !== 'system')
        .map((m) => {
          const imageParts = attachmentsToOpenAIParts(m.attachments);
          if (imageParts.length === 0) return { role: m.role, content: m.content };
          return {
            role: m.role,
            content: [
              ...(m.content ? [{ type: 'text' as const, text: m.content }] : []),
              ...imageParts,
            ],
          };
        }),
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    const text = await safeText(res);
    throw new Error(`${provider} error (${res.status}): ${text || res.statusText}`);
  }

  let full = '';
  await readSse(res.body, (chunk) => {
    if (chunk === '[DONE]') return;
    try {
      const obj = JSON.parse(chunk);
      const delta = obj?.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta.length > 0) {
        full += delta;
        onDelta(delta);
      }
    } catch {
      /* skip */
    }
  });
  return full;
}

async function readSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (data: string) => void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      if (line.startsWith('data:')) {
        const data = line.slice(5).trim();
        if (data) onEvent(data);
      } else if (line.startsWith('{')) {
        onEvent(line);
      }
    }
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
