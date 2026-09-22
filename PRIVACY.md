# Privacy

Nerdbot runs as a browser extension and a mobile web app. You can use device-only chat storage or sign in to opt into cloud chat sync hosted on Convex.

## Local Storage

Nerdbot stores the following data in `chrome.storage.local` on the user's browser profile:

- Provider settings and API keys entered by the user or issued through a provider connection flow.
- Chat history and pinned messages.
- Custom skills and last-used skill arguments.
- Personas and local knowledge base data.
- Canvas snippets and UI preferences.

Device-only chats remain in that browser profile. Mobile uses browser storage. Signed-in chat caches and unsent changes use account-scoped IndexedDB; session tokens use origin-local browser storage. Signing out hides that account's chats but retains its cache and pending changes for the next sign-in on the same device.

## Optional Cloud Sync

When signed in, text conversations, titles, message roles/timestamps, model names, tool-call text, and pinned notes are stored in your account on Convex and synchronized to other signed-in devices. Text may include page context or tool results previously added to a conversation. Sync is not end-to-end encrypted. Access is checked against your authenticated account by the backend.

Existing device-only chats are uploaded only when you choose **Import this device's chats** and confirm the destination account. Original local copies are retained. Attachments, provider keys, provider settings, knowledge files, projects, and personas are not included in chat sync. Attachments remain available only on the device holding the original file data.

The current preview uses email/password authentication. Convex Auth stores password hashes and authentication records; passwords are not stored in chat documents. Email verification and password recovery are not yet available. Cloud deletion removes a chat from synchronized history; a local archived copy and backend synchronization metadata may remain. This preview does not yet offer full account erasure. Before public release, provide verification/recovery and an account-data erasure workflow.

## Provider Requests

When the user sends a message, Nerdbot sends the prompt, relevant chat history, selected attachments, and any enabled context to the selected AI provider. Supported providers include Gemini, OpenAI, OpenRouter, LM Studio, Ollama, and Anthropic.

Provider requests are governed by the selected provider's terms and privacy policy. Local providers such as LM Studio and Ollama normally run on the user's machine, but their behavior depends on the user's local setup. Nerdbot checks their documented default localhost endpoints only after the user clicks a detection or health-check control and grants localhost access. It does not inspect installed CLI credential files, browser sessions, hidden OAuth tokens, shell history, or environment variables.

## Page Context

Nerdbot can read the active page, selected text, tab text, screenshots, and related tab context when the user uses page sharing features. Page content is only included in AI requests when the user enables or invokes those context features.

Because page context can contain sensitive information, review the selected provider and shared content before sending prompts on private pages.

## API Keys

API keys are stored locally and used directly from the extension to call the selected provider. During OpenRouter onboarding, Nerdbot uses OAuth with PKCE to receive a user-controlled key after the user authorizes the connection; the user does not need to view or paste the key. Do not share exported browser storage or screenshots that contain keys.

## Contact

Please report security or privacy concerns through the process described in [SECURITY.md](SECURITY.md).
