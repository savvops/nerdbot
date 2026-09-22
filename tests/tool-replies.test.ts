import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/services/config';
import { streamCompletion } from '../src/services/providers';

afterEach(() => vi.unstubAllGlobals());
describe('browser tool replies in project chat history', () => {
  it('replays the actual Gemini tool name and disables calls for the final answer', async () => {
    let body: any;
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      body = JSON.parse(init.body);
      return new Response('data: {"candidates":[{"content":{"parts":[{"text":"Your portfolio has 743 items."}]}}]}\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
    }));
    const result = await streamCompletion({
      settings: { ...DEFAULT_SETTINGS, activeProvider: 'gemini', providers: { ...DEFAULT_SETTINGS.providers, gemini: { ...DEFAULT_SETTINGS.providers.gemini, apiKey: 'test' } } },
      systemPrompt: 'Project: Adobe Stock. Answer from the gathered evidence.',
      signal: new AbortController().signal, onDelta() {},
      messages: [
        { id: 'u', role: 'user', content: 'How many items?', createdAt: 1 },
        { id: 'a', role: 'assistant', content: '', createdAt: 2, toolCalls: [{ id: 'call-1', name: 'browser_observe', args: {}, _rawPart: { functionCall: { name: 'browser_observe', args: {} }, thoughtSignature: 'preserve-me' } }] },
        { id: 't', role: 'tool', content: '{"text":"All(743)"}', toolCallId: 'call-1', createdAt: 3, attachments: [{ id: 'shot', kind: 'screenshot', name: 'Browser evidence', mimeType: 'image/png', data: 'aGVsbG8=' }] },
      ],
    });
    expect(body.contents[2].parts[0].functionResponse.name).toBe('browser_observe');
    expect(body.contents[2].parts[1].inlineData).toEqual({ mimeType: 'image/png', data: 'aGVsbG8=' });
    expect(body.contents[1].parts[0].thoughtSignature).toBe('preserve-me');
    expect(body.toolConfig.functionCallingConfig.mode).toBe('NONE');
    expect(result).toBe('Your portfolio has 743 items.');
  });

  it('only exposes tools selected by the Jev route', async () => {
    let body: any;
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      body = JSON.parse(init.body);
      return new Response('data: {"candidates":[{"content":{"parts":[{"text":"Searching."}]}}]}\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
    }));
    await streamCompletion({
      settings: { ...DEFAULT_SETTINGS, activeProvider: 'gemini', providers: { ...DEFAULT_SETTINGS.providers, gemini: { ...DEFAULT_SETTINGS.providers.gemini, apiKey: 'test' } } },
      systemPrompt: '', messages: [{ id: 'u', role: 'user', content: 'latest news', createdAt: 1 }],
      signal: new AbortController().signal, onDelta() {}, onToolCall() {},
      allowedTools: ['search_web', 'fetch_url'],
    });
    expect(body.tools[0].functionDeclarations.map((tool: any) => tool.name)).toEqual(['search_web', 'fetch_url']);
  });
});
