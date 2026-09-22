---
status: "✅ Live — Chrome Web Store"
attractor: "reputation"
type: "Open-Source / SaaS"
priority: "High"
income: "Future Subscriptions"
repo: "github.com/savvops/nerdbot"
store: "https://chromewebstore.google.com/detail/nerdbot/oegoeflmcbahliaahlameajidnhlpiog"
next_action: "Publish launch posts and add the live store link to portfolio/GitHub"
last_updated: 2026-07-16
---

# 🎯 Goal
Build a scalable open-source AI assistant (Gemini/OpenRouter alternative) with local capabilities and a cloud subscription model.

# 📋 Active Tasks
- [x] Write a clean `README.md` for `github.com/savvops/nerdbot`.
- [x] Position it as a powerful, customizable, open-source browser AI assistant for developers.
- [ ] Publish the live Chrome Web Store listing and public repository on professional channels.
- [x] Chrome Web Store listing is approved and public: https://chromewebstore.google.com/detail/nerdbot/oegoeflmcbahliaahlameajidnhlpiog
- [ ] Move all logic server-side (n8n/Cloudflare/Docker); add cloud subscription billing.
- [ ] Design a bridge-routed CLI-worker mode: let Nerdbot hand approved tasks to Codex, Claude, Gemini, and other available CLI workers through the fleet bridge, with streamed status and explicit permissions.
- [ ] Add a Bitwarden-style right-click context menu for fast Nerdbot actions.
  - [ ] Add the Manifest V3 `contextMenus` permission and keep the existing least-privilege optional-host-permission flow intact.
  - [ ] Register one top-level **Nerdbot** menu and nested commands from the background service worker without creating duplicates after extension updates or reloads.
  - [ ] Show context-specific actions for pages, selected text, links, images, video/audio, and editable fields.
  - [ ] Start with: **Ask Nerdbot**, **Explain selection**, **Summarize page**, **Analyze image**, **Open link with Nerdbot**, and **Save page as context**.
  - [ ] Pass `pageUrl`, `selectionText`, `linkUrl`, `srcUrl`, and the source tab safely into the existing side-panel/chat flow.
  - [ ] Open or focus the Nerdbot side panel, prefill the relevant prompt/context, and require an explicit Send action for anything that could expose page data.
  - [ ] Gracefully handle restricted pages and missing optional host permission with a clear permission prompt or useful fallback.
  - [ ] Add the Nerdbot 16 px icon, concise labels, separators where useful, and avoid cluttering the browser menu.
  - [ ] Verify every context on Chrome and Brave, including extension reload/update behavior and pages where content-script injection is unavailable.
  - [ ] Update README, privacy disclosure, Chrome Web Store permission rationale, and release notes before publishing.

# 📓 Notes & Resources
- **Architecture:** Headless n8n core backend linked to local Ollama / OpenRouter. Cloudflare tunnels for security.
- **Frontends:** Chrome extension (Kimex), Slack, Telegram, Desktop.
- **Proposed 2026-07-10:** CLI-worker access should route through the existing bridge/fleet control plane rather than embedding provider credentials or shell access in the extension. Define worker discovery, task handoff, progress/completion events, cancellation, and user approval/audit boundaries before implementation.
