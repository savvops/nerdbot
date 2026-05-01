# Nerdbot

A polished, browser-side AI assistant that goes head-to-head with Ask Gemini. Built as a Chrome MV3 side panel.

## Highlights

- **Skills system** — Type `/` in the composer to fuzzy-search built-in or custom skills. Add your own with name + emoji + instructions, saved per-device.
- **Page sharing** — One-click pill that injects the current tab's title, URL, selection, and content into the conversation.
- **Fast / Quality mode** — Toggle between speed-optimized and quality models per provider.
- **Suggested skills chips** — After every assistant reply, a row of one-tap follow-ups (Explain, Action items, Translate).
- **Multi-provider** — Google Gemini (default), OpenAI, OpenRouter, LM Studio, Ollama. Bring your own key.
- **Streaming** — Real-time SSE for both Gemini and OpenAI-compatible endpoints, with cursor and stop button.
- **Polished UI** — Dark/light/system theming, brand orb, animated transitions, accessible focus states.
- **History drawer** — Last 30 conversations, restorable with one click.

## Develop

```bash
npm install
npm run dev      # Vite watch build → dist/
npm run build    # Production build
```

Then load `dist/` as an unpacked extension in `chrome://extensions`.

## Configure

Open Settings (gear icon) → pick a provider → paste your API key. Get keys at:
- Gemini: https://aistudio.google.com/apikey
- OpenAI: https://platform.openai.com/api-keys
- OpenRouter: https://openrouter.ai/keys

## Stack

Vite · React 18 · TypeScript · Tailwind CSS · Lucide · Zustand · Fuse.js

## License

MIT
