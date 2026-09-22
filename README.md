# Nerdbot

Nerdbot is a Chrome Manifest V3 side-panel AI assistant. It runs in the browser, stores user settings locally, and lets you bring your own provider keys for Gemini, OpenAI, OpenRouter, LM Studio, Ollama, and Anthropic.

## Features

- Free-by-default chat through OpenRouter's Free Models Router (one-click account connection; no pasted API key or Nerdbot subscription).
- Multi-provider streaming chat with fast and quality model modes.
- Side-panel Chrome extension UI with chat history, message editing, and pinned messages.
- Page context sharing for the active tab, selected text, screenshots, and multi-tab context.
- Built-in and custom skills with placeholder arguments.
- Local RAG knowledge base powered by Orama.
- Voice input/output, image generation helpers, and a sandboxed HTML/CSS/JS canvas preview.
- Dark, light, and system themes.

## Install From Chrome Web Store

Install Nerdbot from its public listing:

https://chromewebstore.google.com/detail/nerdbot/oegoeflmcbahliaahlameajidnhlpiog

## Install From Source

```bash
npm install
npm run build
```

Then load the generated extension:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select the generated `dist/` directory.

For active development, run:

```bash
npm run dev
```

The dev command watches source files and rebuilds `dist/`. After changes, refresh Nerdbot from `chrome://extensions`.

## Configuration

Open Nerdbot settings from the side panel and choose a provider. API keys are entered by the user and stored in `chrome.storage.local` on the local browser profile.

For a zero-cost start, choose **Continue with OpenRouter** during onboarding. Sign in or create an account in the authorization window; Nerdbot receives a user-controlled key through OAuth PKCE, so the user never creates, copies, or pastes one. Nerdbot then selects `openrouter/free` for both chat modes. Free models have lower rate limits and variable availability, and selecting a paid model can use OpenRouter credits.

Provider key pages:

- Gemini: https://aistudio.google.com/apikey
- OpenAI: https://platform.openai.com/api-keys
- OpenRouter: https://openrouter.ai/keys
- Anthropic: https://console.anthropic.com/settings/keys
- LM Studio: https://lmstudio.ai
- Ollama: https://ollama.com

Local providers use local default base URLs and placeholder API key values because their OpenAI-compatible endpoints normally do not require cloud credentials. Click **Check for local AI** during onboarding—or **Detect Ollama or LM Studio** in Settings—to grant access only to the default localhost endpoints and run a health check. Nerdbot does not scan automatically, execute local CLIs, or read CLI credentials. See [Local providers and optional CLI bridges](docs/local-providers-and-cli-bridges.md).

Provider labels distinguish local, free-tier-capable, and paid API options. Free OpenRouter models can change or become rate-limited; Nerdbot never promises permanent availability.

## Web Search

Nerdbot has a configurable search router. The public-safe default is Jina Search, with optional SearXNG and DuckDuckGo fallbacks:

1. `jina` — hosted search via `https://s.jina.ai/`.
2. `searxng` — self-hosted sovereign search via `/search?q=...&format=json`.
3. `duckduckgo` — HTML fallback.

For a local/SavvOps setup, run SearXNG and switch Settings → Web Search → “Use sovereign mode”:

```bash
docker run -d --name searxng -p 8080:8080 searxng/searxng
curl "http://localhost:8080/search?q=latest%20AI%20news&format=json"
```

Gemini still uses native Google grounding when web search is enabled. Other providers receive search results injected into context, and tool calls like `search_web` use the same router.

## Permissions

Nerdbot requests Chrome permissions needed for its extension workflows:

- `storage`: save settings, chats, skills, personas, and local knowledge base data.
- `sidePanel`: show the main assistant UI in Chrome's side panel.
- `activeTab`, `tabs`, and `scripting`: read the active tab when the user shares page context, lists tabs, extracts selected page text, or captures screenshots.
- `<all_urls>` host permission: allow content extraction on pages where the user chooses to use page context.

See [PRIVACY.md](PRIVACY.md) for details about what data is stored and when page content is sent to a selected provider.

## Development

```bash
npm run dev      # Watch build for extension development
npm run build    # Type-check and production build
npm run preview  # Preview the Vite output
```

There is currently no automated test suite. Use `npm run build` as the primary verification command before publishing changes.

## Project Structure

- `src/sidebar/`: React side-panel app.
- `src/canvas/`: sandboxed canvas preview app.
- `src/extension/`: Manifest V3 service worker and content script.
- `src/services/`: provider integrations, settings, chat storage, skills, RAG, attachments, speech, and utility services.
- `manifest.json`: Chrome extension manifest copied into `dist/` during build.
- `vite.config.ts`: multi-entry Vite build and static extension asset copy logic.

## Contributing

Issues and pull requests are welcome. Please keep changes focused, run `npm run build`, and avoid committing local state, transcript dumps, built `dist/` output, provider keys, or browser profile data.

## License

Apache-2.0. See [LICENSE](LICENSE).
