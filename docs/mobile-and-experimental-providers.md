# Shared mobile UI and experimental providers

The mobile web entry (`mobile.html`) uses the same React sidebar, Markdown renderer, settings, skills, chat and canvas components as the extension. It is served by `npm run mobile` on loopback port 8081, behind the existing tailnet HTTPS endpoint. `npm run bridge` runs the PC bridge on port 3030. The existing Expo source and its original browser-storage keys are preserved for rollback. The first mobile visit migrates the old conversation when no shared-UI conversation exists.

The UI is shared across mobile and extension. Signed-in users synchronize text chats, project-folder metadata, chat-to-project assignments and pins through Convex. Attachments, personas, knowledge documents and vector chunks remain in each browser's storage. PC provider configuration is imported on first setup; PC keys are replaced with a marker and resolved inside the PC proxy. A separate key entered on mobile stays in that browser's settings. Cloud requests use fixed provider origins and endpoint allowlists; redirects and cross-origin browser requests to the bridge are rejected. Custom cloud endpoints and mobile OAuth are not implemented; use Settings to enter a key or reuse a configured PC provider.

## NVIDIA NIM

Provider ID: `nvidia`. Endpoint: `https://integrate.api.nvidia.com/v1`.

Defaults verified against the public model catalog on September 22, 2026:

- Fast: `nvidia/nemotron-3.5-lightning-30b-a3b`
- Quality: `nvidia/nemotron-3-super-120b-a12b`

The model picker discovers the live catalog and filters known non-chat model families. NVIDIA's `/models` endpoint is public, so Check connection uses a one-token completion to verify the key and access to the selected fast model. This consumes provider quota. The UI says free prototyping with limits, not unlimited free production. Model availability, tool support and account limits vary. Vision defaults off.

Sources: [NVIDIA quickstart](https://docs.api.nvidia.com/nim/docs/api-quickstart), [LLM catalog](https://docs.api.nvidia.com/nim/re/reference/llm-apis), [prototyping access](https://docs.api.nvidia.com/nim/docs/run-anywhere). No Jev listing was found in the official NVIDIA catalog or its live model endpoint.

## Jev smart routing

Off by default. OpenRouter only: pinned `typesafe/jev-1.13` at `https://openrouter.ai/api/alpha/decisions`. It uses the configured OpenRouter key even if another chat provider is selected. No direct TypeSafe, NVIDIA, Laya or OpenJev fallback is used.

When enabled, each new user request is sent to Jev before the chat model. A valid decision above 62% confidence limits the expensive model to the selected route: no tools for `chat`/`clarify`, public research tools for `search`, or linked-tab tools for `browser`. Jev never grants permissions: browser clicks and field edits retain their approval dialog. Low-confidence decisions, invalid responses, missing keys and the 3.5-second timeout fall back to normal chat with its existing tools. Settings retains a collapsed route tester showing probabilities, confidence and elapsed time. Jev is excluded from ordinary chat discovery and rejected if manually entered as a chat model.

Source: [OpenRouter's decision example](https://openrouter.ai/labs/jev/compile), [typed choices](https://docs.typesafe.ai/primitives/choice).

## One-tab browser control

The user selects Control this tab or creates a New work tab with a website URL. One session binds one tab ID inside the extension worker. Creating a work tab replaces the previous binding. Model tools cannot choose a tab ID, create bindings, or create new work tabs. Internal New Tab pages are handled by navigating the bound tab to a regular HTTP(S) URL.

Tools: observe, navigate, scroll, and request click/fill. Element references are generated from the actual page and scoped to an observation snapshot. Clicks and field edits require explicit UI approval; no arbitrary model JavaScript, password fills, or file-input fills. After an action, observe again to verify the result. Popups are not automatically adopted. Switching away from the bound tab pauses its actions; it never retargets the new active tab. Release/Stop invalidates the session and pending approvals. Chrome's site permissions still apply, especially after cross-origin navigation. Chrome internal pages, extension pages and restricted sites cannot be injected into.

The initial release uses conservative per-action approval for clicks/fills. Screenshot capture from mobile also requires a bound tab. No claim of fully autonomous browser operation is made.

## Validation and deployment

- `npm run build`: TypeScript and production extension/mobile build.
- `npm run test:integrations`: settings migration, NVIDIA authenticated key checks, Jev validation/routing, tab isolation and stale approvals, proxy restrictions, secret redaction. Network responses are fixtures; live paid NVIDIA/Jev inference requires configured keys.
- Shared mobile UI and a real Gemini streaming reply were verified on the tailnet URL.
- The running Legion extension must be reloaded from `brave://extensions` after a build. Until then the old worker continues to support existing chat/context, and new browser RPC requests return a reload instruction.
- Legion uses hidden `Nerdbot_PC_Bridge` and `Nerdbot_Mobile` Scheduled Tasks with logon triggers and restart-on-failure settings. `scripts/run-service.ps1` is their launcher; logs remain in LocalAppData.
- Original Legion source/build/bridge files were archived before deployment. The Expo project was not deleted or overwritten.

Pending live validation: NVIDIA and Jev with user-configured keys, browser action round trip after extension reload, and iPhone Safari device checks. Build verification is not a substitute for these.

### September 22 connection repair
The bridge now sends application keepalive messages every 20 seconds so an idle MV3 worker can retain its WebSocket connection. Mobile restores the worker-owned tab binding on startup/focus and reports disconnection in the control bar. Browser tools refresh missing binding state before returning an actionable error. An already sleeping worker must be woken once by opening Nerdbot in PC Brave; the fix cannot wake an already disconnected extension from the server.
Build and integration checks pass, including mobile refresh recovery and disconnected-worker reporting. Live connection longevity and real browser actions remain pending the PC worker reconnecting.

### September 22 installed-path repair
Brave's Default profile actually loads extension `plpifbdnnahcjafipbjbnabejcbajbab` from `C:\Users\savv\Desktop\Savvops-legion\projects\extentions\nerdbot\dist`. The mobile/bridge services run from `projects\personal\nerdbot`. Updating the service project's build alone does not update the installed extension. The loaded build supported tab sharing but lacked `BROWSER_REQUEST`, causing control requests to time out even after reload.

Archived the installed build under the extension project's `archive/dist-before-control-repair-20260922-012335/dist`, copied the updated service build into the actual installed path, and verified all 42 copied files by SHA-256. Its background script matches the locally rebuilt and integration-tested version and contains the browser-control handler. A Brave extension reload is still required to activate the repaired files; live control verification remains pending. For future deployments, check the installed extension path before copying a build.
