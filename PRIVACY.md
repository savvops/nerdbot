# Privacy

Nerdbot is a browser extension that runs locally in Chrome. It does not include a Nerdbot-hosted backend in this repository.

## Local Storage

Nerdbot stores the following data in `chrome.storage.local` on the user's browser profile:

- Provider settings and API keys entered by the user.
- Chat history and pinned messages.
- Custom skills and last-used skill arguments.
- Personas and local knowledge base data.
- Canvas snippets and UI preferences.

This data stays in the local browser profile unless Chrome sync, profile backup software, or the user exports/copies it elsewhere.

## Provider Requests

When the user sends a message, Nerdbot sends the prompt, relevant chat history, selected attachments, and any enabled context to the selected AI provider. Supported providers include Gemini, OpenAI, OpenRouter, LM Studio, Ollama, and Anthropic.

Provider requests are governed by the selected provider's terms and privacy policy. Local providers such as LM Studio and Ollama normally run on the user's machine, but their behavior depends on the user's local setup.

## Page Context

Nerdbot can read the active page, selected text, tab text, screenshots, and related tab context when the user uses page sharing features. Page content is only included in AI requests when the user enables or invokes those context features.

Because page context can contain sensitive information, review the selected provider and shared content before sending prompts on private pages.

## API Keys

API keys are stored locally and used directly from the extension to call the selected provider. Do not share exported browser storage or screenshots that contain keys.

## Contact

Please report security or privacy concerns through the process described in [SECURITY.md](SECURITY.md).
