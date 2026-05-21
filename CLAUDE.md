# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Nerdbot is a Chrome MV3 extension (side panel) that provides a polished, browser-side AI assistant with multi-provider LLM support (Gemini, OpenAI, OpenRouter, LM Studio, Ollama, Anthropic), streaming responses, a skills system, RAG knowledge base, page context injection, voice I/O, image generation, and custom personas.

## Build & Development

```bash
# Watch build for Chrome extension development (loads into Chrome from dist/)
npm run dev

# Production build (type-checks first, then builds)
npm run build

# Preview build output
npm run preview
```

After `npm run dev` starts, reload the extension in Chrome via `chrome://extensions` → refresh Nerdbot. There are no tests.

## Architecture

The build produces a multi-entry Chrome MV3 extension via a custom Vite plugin:

| Entry | Output | Purpose |
|---|---|---|
| `sidebar.html` → `src/sidebar/main.tsx` | Side panel React app | Main UI |
| `canvas.html` → `src/canvas/index.tsx` | Canvas preview app | HTML/CSS/JS preview |
| `src/extension/background.ts` | `dist/background.js` | MV3 service worker |
| `src/extension/content.ts` | `dist/content.js` | Page content extraction |

### Extension Messaging

`background.ts` is the message hub. It handles `GET_PAGE_CONTEXT`, `GET_PAGE_TEXT`, `CAPTURE_SCREENSHOT`, `LIST_TABS`, `GET_TAB_TEXT`, `PING`, and opens the side panel on action click. Commands `Ctrl+Shift+K` (open) and `Ctrl+Shift+L` (quick chat) are declared in `manifest.json`.

`content.ts` runs on all pages and extracts page text (capped at 60K chars), selection, title, URL, and YouTube transcripts. It responds to `TOGGLE_QUICK_CHAT` messages.

### Services Layer (`src/services/`)

All business logic lives here, consumed by the React sidebar:

- **`providers.ts`** — Streaming API integrations for all 6 providers. Handles attachment conversion (images/screenshots) to provider-specific formats, citation tracking (Gemini), and rate limit header capture.
- **`config.ts`** — Provider configurations, default model names (fast/quality variants per provider), and settings schema. This is the source of truth for what `ProviderId` values are valid.
- **`types.ts`** — Core TypeScript types: `Message`, `Chat`, `Soul`, `ProviderConfig`, `Settings`, `Skill`, `SpeedMode`, `PageContext`, `SharedTab`. Read this first when working on anything cross-cutting.
- **`skills.ts`** — 7 built-in skills with `{{placeholder}}` templating; custom skills supported. Persists last-used args.
- **`chatManager.ts`** — Chat history (max 30 conversations), pinned messages, message editing/deletion, title auto-derivation.
- **`souls.ts`** — Persona/system prompt management.
- **`rag/`** — Retrieval-augmented generation: Orama vector store with persistence, chunking, embeddings, folder-based knowledge base organization with per-folder system prompts.
- **`attachments.ts`**, **`imageGen.ts`**, **`speech.ts`**, **`scraper.ts`**, **`memoryProvider.ts`**, **`contextLimits.ts`**, **`streamBuffer.ts`** — Self-contained service modules.

### React UI (`src/sidebar/`)

`App.tsx` is the root component containing all chat logic, modal state, and skill dispatch. The `components/` directory has 25+ focused components. State that doesn't need Chrome storage persistence is local React state; everything persisted uses `src/services/storage.ts` (a wrapper over `chrome.storage.local`).

### Theming

Dark/light/system themes use CSS custom properties (`--nb-*` variables) toggled via class on `<html>`. Tailwind config maps these variables into utility classes. Custom animations (fade-in, slide-up, shimmer) are defined in `tailwind.config.js`.

### Canvas Feature

`src/canvas/` renders a split-pane HTML/CSS/JS editor + sandboxed iframe preview. Code is stored in Chrome storage and loaded when the canvas panel opens.
