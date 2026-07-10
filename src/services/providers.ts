import { activeModel, activeProvider, isSearchCapable } from './config';
import type { Attachment, Message, ProviderId, Settings } from './types';
import { withRetry } from '../utils/retry';
import { captureRateLimits } from '../utils/rateLimitTracker';
import { ALL_TOOLS_SCHEMA } from './tools';

export interface StreamRequest {
  settings: Settings;
  systemPrompt: string;
  messages: Message[];
  signal: AbortSignal;
  onDelta: (text: string) => void;
  onCitations?: (citations: Citation[]) => void;
  onToolCall?: (toolCall: any) => void;
  webSearch?: boolean;
}

export interface Citation {
  uri: string;
  title?: string;
}

export async function streamCompletion(req: StreamRequest): Promise<string> {
  const provider = activeProvider(req.settings).id;
  if (provider === 'gemini') return streamGemini(req);
  if (provider === 'anthropic') return streamAnthropic(req);
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
      if (m.role === 'tool') {
        return {
          role: 'user',
          parts: [{
            functionResponse: {
              name: m.toolCalls?.[0]?.name || 'unknown',
              response: { result: m.content }
            }
          }]
        };
      }
      if (m.toolCalls && m.toolCalls.length > 0) {
        return {
          role: 'model',
          parts: m.toolCalls.map(tc => {
            if (tc._rawPart) return tc._rawPart;
            const { id, ...originalCall } = tc;
            return {
              functionCall: originalCall
            };
          })
        };
      }
      const parts: any[] = [];
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
  if (req.onToolCall && !(webSearch && isSearchCapable(settings))) {
    body.tools = body.tools || [];
    (body.tools as any[]).push({
      // Gemini 2.5 rejects function declarations when its built-in
      // google_search tool is present, so custom tools are an alternate mode.
      functionDeclarations: ALL_TOOLS_SCHEMA.map((tool) => tool.function)
    });
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
          if (p.functionCall && req.onToolCall) {
            req.onToolCall({
              ...p.functionCall,
              id: p.functionCall.name + '_' + Date.now(),
              _rawPart: p,
            });
          }
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

function attachmentsToAnthropicContent(atts: Attachment[] = []) {
  return atts
    .filter((a) => a.kind === 'image' || a.kind === 'screenshot')
    .map((a) => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: a.mimeType, data: a.data },
    }));
}

async function fetchAnthropicResponse(
  url: string,
  apiKey: string,
  body: unknown,
  signal: AbortSignal
): Promise<Response> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'anthropic-beta': 'prompt-caching-2024-07-31',
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const text = await safeText(res);
    throw new Error(`Anthropic error (${res.status}): ${text || res.statusText}`);
  }
  return res;
}

async function streamAnthropic(req: StreamRequest): Promise<string> {
  const { settings, systemPrompt, messages, signal, onDelta } = req;
  const cfg = activeProvider(settings);
  const model = activeModel(settings);
  if (!cfg.apiKey) throw new Error('Add an Anthropic API key in Settings.');

  const url = `${cfg.baseUrl.replace(/\/$/, '')}/messages`;

  // Build Anthropic message array; mark last 3 with cache_control (Hermes breakpoint strategy)
  const nonSystem = messages.filter((m) => m.role !== 'system');
  const anthropicMessages = nonSystem.map((m, idx) => {
    const isInLastThree = idx >= nonSystem.length - 3;
    const imageParts = attachmentsToAnthropicContent(m.attachments);
    const content: unknown[] = [...imageParts];
    if (m.content) {
      const textBlock: Record<string, unknown> = { type: 'text', text: m.content };
      if (isInLastThree) textBlock.cache_control = { type: 'ephemeral' };
      content.push(textBlock);
    }
    // Use string form for simple non-cached assistant messages
    if (m.role === 'assistant' && !isInLastThree && imageParts.length === 0) {
      return { role: 'assistant' as const, content: m.content };
    }
    return { role: m.role as 'user' | 'assistant', content };
  });

  const body: Record<string, unknown> = {
    model,
    max_tokens: settings.maxTokens,
    temperature: settings.temperature,
    stream: true,
    messages: anthropicMessages,
  };
  if (systemPrompt) {
    body.system = [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }];
  }

  const isRetryable = (e: unknown) =>
    e instanceof Error && (e.message.includes('429') || e.message.includes('529') || e.message.includes('503'));

  const res = await withRetry(() => fetchAnthropicResponse(url, cfg.apiKey, body, signal), 3, isRetryable);
  captureRateLimits('anthropic', res.headers);

  let full = '';
  await readSse(res.body!, (chunk) => {
    try {
      const obj = JSON.parse(chunk);
      if (obj.type === 'content_block_delta' && obj.delta?.type === 'text_delta') {
        const t = obj.delta.text as string;
        if (t?.length) {
          full += t;
          onDelta(t);
        }
      }
    } catch { /* skip */ }
  });
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
          if (m.role === 'tool') {
            return {
              role: 'tool',
              tool_call_id: m.toolCallId || m.id,
              content: m.content,
            };
          }
          if (m.toolCalls && m.toolCalls.length > 0) {
            return {
              role: 'assistant',
              content: m.content || null,
              tool_calls: m.toolCalls.map(tc => ({
                id: tc.id,
                type: 'function',
                function: { name: tc.name, arguments: JSON.stringify(tc.args) }
              }))
            };
          }
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

  if (req.onToolCall) {
    (body as any).tools = ALL_TOOLS_SCHEMA;
  }

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
  captureRateLimits(provider, res.headers);

  let full = '';
  const pendingToolCalls: Record<number, { id: string, name: string, args: string }> = {};

  await readSse(res.body, (chunk) => {
    if (chunk === '[DONE]') return;
    try {
      const obj = JSON.parse(chunk);
      const delta = obj?.choices?.[0]?.delta;
      if (delta?.tool_calls) {
        for (const call of delta.tool_calls) {
          const idx = call.index;
          if (!pendingToolCalls[idx]) {
            pendingToolCalls[idx] = { id: call.id, name: call.function?.name || '', args: '' };
          }
          if (call.function?.arguments) {
            pendingToolCalls[idx].args += call.function.arguments;
          }
        }
      }
      if (typeof delta?.content === 'string' && delta.content.length > 0) {
        full += delta.content;
        onDelta(delta.content);
      }
    } catch {
      /* skip */
    }
  });

  if (req.onToolCall) {
    for (const idx in pendingToolCalls) {
      const tc = pendingToolCalls[idx];
      try {
        const parsedArgs = JSON.parse(tc.args || '{}');
        req.onToolCall({ id: tc.id, name: tc.name, args: parsedArgs });
      } catch {
        req.onToolCall({ id: tc.id, name: tc.name, args: {} });
      }
    }
  }

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
