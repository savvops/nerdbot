# Nerdbot implementation follow-up

## Mobile parity and providers — September 22, 2026

- [x] Share React sidebar UI and core services between extension and mobile web entry.
- [x] Preserve old Expo source and migrate existing mobile conversation without deleting original storage.
- [x] Add NVIDIA NIM provider, live model discovery and authenticated connection test.
- [x] Add an off-by-default, OpenRouter-only Jev decision experiment; no automatic actions.
- [x] Add tab-bound browser commands, work-tab transfer and explicit action approval.
- [x] Build and integration checks; live mobile UI and Gemini streaming smoke test.
- [ ] Reload the updated extension on the dev machine and verify real browser actions, tab transfer, Stop and screenshots.
- [x] Repair deployment path mismatch: updated the actual Brave-loaded `projects/extentions/nerdbot/dist`, archived its previous build and verified all 42 copied files. Activation/live verification remains in the reload item above.
- [ ] Configure NVIDIA/OpenRouter keys and run the live NVIDIA/Jev checks.
- [ ] Verify the shared UI on iPhone Safari, including keyboard, uploads and migrated history.
- [x] Implement optional Convex email/password sign-in and text chat/pin sync; live cross-session and loaded-extension test passed. See [cloud chat sync](docs/cloud-chat-sync.md).
- [x] Separate chat, image and audio model catalogs and expose image/audio dropdowns with a custom-model escape hatch.
- [ ] Add email verification/password reset, account export/erasure, usage quotas and a production deployment before public cloud-sync launch.
- [ ] Decide whether attachments, personas and knowledge should synchronize; these remain device-local.

Implementation and operational details: [mobile and experimental providers](docs/mobile-and-experimental-providers.md).

- [x] Repair browser-tool replies: correlate Gemini results by call ID, keep tool rounds in one cancellable turn, request a final answer at the round limit, collapse raw tool details and retry loading/empty observations. Regression checks and build passed; Adobe account-specific live reproduction remains unverified.

- [x] Add linked-tab screenshot evidence and thumbnail metadata, navigate-then-observe, preserve binding after transient action errors, repeated-command guard and a text-answer pass without tool history. Deployed to both build folders; 22 file hashes verified.
- [x] Promote Jev from a manual experiment to confidence-gated smart routing, with route-specific tool exposure and normal-chat fallback.
- [x] Sync project-folder metadata and chat-to-project assignments through Convex; knowledge files and embeddings remain device-local. Backend and both frontends deployed.
