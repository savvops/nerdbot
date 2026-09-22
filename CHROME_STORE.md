# Publishing Nerdbot to the Chrome Web Store

## 1. Build the upload package

```bash
npm run package
```

This type-checks, builds `dist/`, and produces `nerdbot-v<version>.zip` in the
repo root. The zip contains the extension files at its root (manifest.json at
the top level), which is what the store expects.

Before every new upload, bump `"version"` in **both** `package.json` and
`manifest.json` (repo root) — the store rejects uploads that reuse an existing
version number.

## 2. Developer account

1. Go to <https://chrome.google.com/webstore/devconsole> and sign in.
2. Pay the one-time $5 developer registration fee if you haven't already.
3. (Recommended) Verify a contact email under Account settings — required
   before you can publish.

## 3. Create the item

1. Developer Dashboard → **New item** → upload `nerdbot-v<version>.zip`.
2. Fill in the **Store listing** tab:
   - Description (the manifest description is a good starting point).
   - Category: Productivity → Tools.
   - At least one 1280×800 (or 640×400) screenshot of the side panel.
   - 128×128 store icon (use `icons/icon128.png`).
   - Optional small promo tile 440×280.

## 4. Privacy tab — required disclosures

Because the manifest requests broad permissions, review WILL ask for
justifications. Suggested wording:

| Permission | Justification |
|---|---|
| `storage` | Persists user settings, chat history, personas, and the local RAG knowledge base on-device. |
| `activeTab` / `tabs` | Reads the title/URL of open tabs and automates interactions on the tab the user explicitly selects. |
| `scripting` | Injects the DOM reader, element badge overlay, and action executor on demand into the tab the user is actively working with. |
| `sidePanel` | The entire assistant UI lives in Chrome's native side panel. |
| Optional host permission `<all_urls>` | Requested in-context only when the user chooses to share page content, automate a web task, or use sovereign search backends. Not requested at install; the extension shows no all-sites warning on install. |

Also on the Privacy tab:

- **Single purpose**: "An autonomous AI browser assistant and side panel that helps users browse, answers questions using page context, and automates web interactions (clicking, form filling, searching) on the user's command."
- **Remote code**: answer **No** — all JS is bundled into the extension and injected on demand (no external script loading); the extension connects to user-configured LLM provider APIs (Gemini, OpenAI, OpenRouter, Anthropic, LM Studio, Ollama).
- **Data usage**: prompts and page context are sent directly to the user's chosen LLM provider using their own API key. Nothing is ever sent to developer-operated servers. All keys, chat history, and local RAG databases remain strictly on `chrome.storage.local`. You must certify the data-use disclosures and link your PRIVACY.md.

## 5. Submit

1. **Save draft** → **Submit for review**.
2. Extensions that can request `<all_urls>` (even as an optional permission)
   get an in-depth review; expect a few days to a couple of weeks for the
   first version.
3. You'll get an email on approval or rejection. Rejections cite the exact
   policy; fix, bump the version, re-upload the new zip, and resubmit.

## Pre-flight checklist

- [ ] `npm run build` passes (type-check + bundle).
- [ ] Version bumped in `package.json` and `manifest.json` (repo root).
- [ ] Load `dist/` unpacked in Chrome (`chrome://extensions` → Developer
      mode → Load unpacked) and smoke-test: side panel opens, chat streams,
      quick chat (`Ctrl+Shift+L`) works, settings persist.
- [ ] No API keys or personal data committed anywhere in the repo.
- [ ] Screenshots reflect the current UI.
